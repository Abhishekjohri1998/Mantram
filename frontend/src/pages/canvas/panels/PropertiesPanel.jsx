// ═══════════════════════════════════════════════════════════════
// PropertiesPanel.jsx — Right Sidebar Properties Panel
// Context-sensitive: shows properties/text/shape/border/opacity/
// shadow/filters/adjustments based on selected object type
// ═══════════════════════════════════════════════════════════════

import React, { useCallback } from 'react'
import * as fabric from 'fabric'
import useCanvasStore from '../state/useCanvasStore'
import { FILTERS, COLOR_PALETTE, SHADOW_PRESETS } from '../data/presets'
import { GOOGLE_FONTS, loadGoogleFont } from '../data/fonts'

export default function PropertiesPanel({
    fabricRef,
    mode = 'advanced',
    activeBrand,
    onSaveHistory,
}) {
    const {
        selectedLayer, selectedObjType, objProps,
        activeFilter, brightness, contrast,
        setBrightness, setContrast, setActiveFilter,
    } = useCanvasStore()

    // ── Update property on selected object ──
    const updateProp = useCallback((prop, value) => {
        const fc = fabricRef.current
        if (!fc) return
        const obj = fc.getActiveObject()
        if (!obj) return

        const numVal = parseFloat(value)
        switch (prop) {
            case 'x': obj.set('left', numVal); break
            case 'y': obj.set('top', numVal); break
            case 'w': obj.set('scaleX', numVal / (obj.width || 1)); break
            case 'h': obj.set('scaleY', numVal / (obj.height || 1)); break
            case 'angle': obj.set('angle', numVal); break
            case 'opacity': obj.set('opacity', numVal / 100); break
            default: break
        }
        obj.setCoords()
        fc.renderAll()
        onSaveHistory?.()
    }, [fabricRef, onSaveHistory])

    // ── Apply filter to selected image ──
    const applyFilter = useCallback((filterId) => {
        const fc = fabricRef.current
        if (!fc) return
        const obj = fc.getActiveObject()
        if (!obj || obj.type !== 'image') return

        setActiveFilter(filterId)
        obj.filters = []

        switch (filterId) {
            case 'grayscale': obj.filters.push(new fabric.filters.Grayscale()); break
            case 'sepia':
                obj.filters.push(new fabric.filters.Grayscale())
                obj.filters.push(new fabric.filters.Brightness({ brightness: 0.05 }))
                break
            case 'invert': obj.filters.push(new fabric.filters.Invert()); break
            case 'blur': obj.filters.push(new fabric.filters.Blur({ blur: 0.3 })); break
            case 'sharpen':
                obj.filters.push(new fabric.filters.Convolute({
                    matrix: [0, -1, 0, -1, 5, -1, 0, -1, 0]
                }))
                break
            case 'emboss':
                obj.filters.push(new fabric.filters.Convolute({
                    matrix: [-2, -1, 0, -1, 1, 1, 0, 1, 2]
                }))
                break
            case 'vintage':
                obj.filters.push(new fabric.filters.Brightness({ brightness: -0.05 }))
                obj.filters.push(new fabric.filters.Contrast({ contrast: 0.15 }))
                break
            case 'warm':
                obj.filters.push(new fabric.filters.Brightness({ brightness: 0.06 }))
                break
            case 'cool':
                obj.filters.push(new fabric.filters.Brightness({ brightness: -0.04 }))
                break
            default: break // 'none'
        }

        obj.applyFilters()
        fc.renderAll()
        onSaveHistory?.()
    }, [fabricRef, onSaveHistory, setActiveFilter])

    // ── Set text color ──
    const setTextColor = useCallback((color) => {
        const fc = fabricRef.current
        if (!fc) return
        const obj = fc.getActiveObject()
        if (obj) {
            obj.set('fill', color)
            fc.renderAll()
            onSaveHistory?.()
        }
    }, [fabricRef, onSaveHistory])

    if (mode !== 'advanced') return null

    return (
        <div className={`ce-sidebar-right ${mode !== 'advanced' ? 'collapsed' : ''}`}>
            {/* Properties */}
            {selectedLayer && (
                <div className="ce-panel">
                    <div className="ce-panel-title">
                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#818cf8' }}>tune</span>
                        Properties
                    </div>
                    <div className="ce-prop-row">
                        <span className="ce-prop-label">X</span>
                        <input className="ce-prop-input" type="number" value={objProps.x}
                            onChange={e => updateProp('x', e.target.value)} />
                        <span className="ce-prop-label">Y</span>
                        <input className="ce-prop-input" type="number" value={objProps.y}
                            onChange={e => updateProp('y', e.target.value)} />
                    </div>
                    <div className="ce-prop-row">
                        <span className="ce-prop-label">W</span>
                        <input className="ce-prop-input" type="number" value={objProps.w}
                            onChange={e => updateProp('w', e.target.value)} />
                        <span className="ce-prop-label">H</span>
                        <input className="ce-prop-input" type="number" value={objProps.h}
                            onChange={e => updateProp('h', e.target.value)} />
                    </div>
                    <div className="ce-prop-row">
                        <span className="ce-prop-label">R°</span>
                        <input className="ce-prop-input" type="number" value={objProps.angle}
                            onChange={e => updateProp('angle', e.target.value)} />
                        <span className="ce-prop-label" style={{ fontSize: 9 }}>OPC</span>
                        <input className="ce-prop-input" type="number" value={objProps.opacity} min={0} max={100}
                            onChange={e => updateProp('opacity', e.target.value)} />
                    </div>
                </div>
            )}

            {/* Context-Sensitive Text Properties */}
            {selectedObjType === 'text' && (
                <div className="ce-panel">
                    <div className="ce-panel-title">
                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#818cf8' }}>text_fields</span>
                        Text Properties
                    </div>
                    {/* Font Family */}
                    <div style={{ marginBottom: 8 }}>
                        <p style={{ fontSize: 10, color: '#475569', marginBottom: 4, fontWeight: 600 }}>FONT</p>
                        <select className="ce-prop-select" value={(() => {
                            const fc = fabricRef.current; const obj = fc?.getActiveObject()
                            return obj?.fontFamily || 'Inter'
                        })()} onChange={e => {
                            const fc = fabricRef.current; const obj = fc?.getActiveObject()
                            if (obj) { loadGoogleFont(e.target.value); obj.set('fontFamily', e.target.value); fc.renderAll(); onSaveHistory?.() }
                        }}>
                            {GOOGLE_FONTS.slice(0, 60).map(f => <option key={f} value={f}>{f}</option>)}
                        </select>
                    </div>
                    {/* Color */}
                    <div style={{ marginBottom: 8 }}>
                        <p style={{ fontSize: 10, color: '#475569', marginBottom: 4, fontWeight: 600 }}>COLOR</p>
                        {/* Brand colors */}
                        {(activeBrand?.dna?.colors || []).length > 0 && (
                            <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 6 }}>
                                {(activeBrand?.dna?.colors || []).map((c, i) => (
                                    <div key={`brand-${i}`} className="ce-color-swatch" style={{ background: c.hex, boxShadow: '0 0 0 1.5px rgba(255,255,255,0.15)' }}
                                        onClick={() => setTextColor(c.hex)} title={`Brand: ${c.hex}`} />
                                ))}
                            </div>
                        )}
                        {/* Full palette */}
                        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                            {COLOR_PALETTE.map(c => (
                                <div key={c} className="ce-color-swatch" style={{ background: c === 'transparent' ? 'repeating-conic-gradient(#ccc 0% 25%, transparent 0% 50%) 50% / 10px 10px' : c, border: (c === '#000000' || c === 'transparent' || c === '#0f172a' || c === '#1e293b') ? '1px solid rgba(255,255,255,0.2)' : 'none' }}
                                    onClick={() => setTextColor(c)} title={c} />
                            ))}
                        </div>
                        {/* Native picker */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                            <input type="color" value={(() => { const fc = fabricRef.current; return fc?.getActiveObject()?.fill || '#ffffff' })()} onChange={e => setTextColor(e.target.value)} style={{ width: 24, height: 24, border: 'none', padding: 0, background: 'transparent', cursor: 'pointer' }} />
                            <span style={{ fontSize: 10, color: '#64748b' }}>Custom color</span>
                        </div>
                    </div>
                    {/* Alignment */}
                    <div style={{ marginBottom: 8 }}>
                        <p style={{ fontSize: 10, color: '#475569', marginBottom: 4, fontWeight: 600 }}>ALIGN</p>
                        <div style={{ display: 'flex', gap: 4 }}>
                            {['left', 'center', 'right'].map(align => (
                                <button key={align} className="ce-tool-btn" onClick={() => {
                                    const fc = fabricRef.current; const obj = fc?.getActiveObject()
                                    if (obj) { obj.set('textAlign', align); fc.renderAll(); onSaveHistory?.() }
                                }} style={{ flex: 1 }} title={`Align ${align}`}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{`format_align_${align}`}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                    {/* Font Size & Weight */}
                    <div className="ce-prop-row">
                        <span className="ce-prop-label" style={{ fontSize: 9 }}>SIZE</span>
                        <input className="ce-prop-input" type="number" min={8} max={200}
                            value={(() => { const fc = fabricRef.current; return fc?.getActiveObject()?.fontSize || 24 })()}
                            onChange={e => {
                                const fc = fabricRef.current; const obj = fc?.getActiveObject()
                                if (obj) { obj.set('fontSize', parseInt(e.target.value)); fc.renderAll(); onSaveHistory?.() }
                            }} />
                        <span className="ce-prop-label" style={{ fontSize: 9 }}>BOLD</span>
                        <button className="ce-tool-btn" onClick={() => {
                            const fc = fabricRef.current; const obj = fc?.getActiveObject()
                            if (obj) { obj.set('fontWeight', obj.fontWeight === '700' ? '400' : '700'); fc.renderAll(); onSaveHistory?.() }
                        }} style={{ width: 28, height: 28 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>format_bold</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Shape fill color */}
            {selectedObjType === 'shape' && (
                <div className="ce-panel">
                    <div className="ce-panel-title">
                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#818cf8' }}>format_color_fill</span>
                        Shape
                    </div>
                    <div style={{ marginBottom: 8 }}>
                        <p style={{ fontSize: 10, color: '#475569', marginBottom: 4, fontWeight: 600 }}>FILL COLOR</p>
                        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                            {COLOR_PALETTE.map(c => (
                                <div key={c} className="ce-color-swatch" style={{ background: c === 'transparent' ? 'repeating-conic-gradient(#ccc 0% 25%, transparent 0% 50%) 50% / 10px 10px' : c, border: (c === '#000000' || c === 'transparent' || c === '#0f172a' || c === '#1e293b') ? '1px solid rgba(255,255,255,0.2)' : 'none' }}
                                    onClick={() => {
                                        const fc = fabricRef.current; const obj = fc?.getActiveObject()
                                        if (obj) { obj.set('fill', c); fc.renderAll(); onSaveHistory?.() }
                                    }} title={c} />
                            ))}
                        </div>
                        {/* Native picker */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                            <input type="color" value={(() => { const fc = fabricRef.current; const o = fc?.getActiveObject(); return (o?.fill && typeof o.fill === 'string' && o.fill !== 'transparent') ? o.fill : '#6366f1' })()} onChange={e => {
                                const fc = fabricRef.current; const obj = fc?.getActiveObject()
                                if (obj) { obj.set('fill', e.target.value); fc.renderAll(); onSaveHistory?.() }
                            }} style={{ width: 24, height: 24, border: 'none', padding: 0, background: 'transparent', cursor: 'pointer' }} />
                            <span style={{ fontSize: 10, color: '#64748b' }}>Custom fill</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Border & Stroke Panel */}
            {selectedLayer && (
                <div className="ce-panel">
                    <div className="ce-panel-title">
                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#818cf8' }}>border_style</span>
                        Border & Stroke
                    </div>
                    {/* Border width */}
                    <div style={{ marginBottom: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b', marginBottom: 4 }}>
                            <span>Width</span>
                            <span>{(() => { const fc = fabricRef.current; return fc?.getActiveObject()?.strokeWidth || 0 })()}px</span>
                        </div>
                        <input type="range" className="ce-slider" min={0} max={20} value={(() => { const fc = fabricRef.current; return fc?.getActiveObject()?.strokeWidth || 0 })()} onChange={e => {
                            const fc = fabricRef.current; const obj = fc?.getActiveObject()
                            if (obj) { obj.set('strokeWidth', parseInt(e.target.value)); if (!obj.stroke && parseInt(e.target.value) > 0) obj.set('stroke', '#ffffff'); fc.renderAll(); onSaveHistory?.() }
                        }} />
                    </div>
                    {/* Border color */}
                    <div style={{ marginBottom: 8 }}>
                        <p style={{ fontSize: 10, color: '#475569', marginBottom: 4, fontWeight: 600 }}>STROKE COLOR</p>
                        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                            {['#ffffff','#000000','#ef4444','#f97316','#f59e0b','#22c55e','#FF4D00','#6366f1','#FF4D00','#ec4899','transparent'].map(c => (
                                <div key={`stroke-${c}`} className="ce-color-swatch" style={{ background: c === 'transparent' ? 'repeating-conic-gradient(#ccc 0% 25%, transparent 0% 50%) 50% / 10px 10px' : c, border: (c === '#000000' || c === 'transparent') ? '1px solid rgba(255,255,255,0.2)' : 'none' }}
                                    onClick={() => {
                                        const fc = fabricRef.current; const obj = fc?.getActiveObject()
                                        if (obj) { obj.set('stroke', c === 'transparent' ? null : c); if (!obj.strokeWidth) obj.set('strokeWidth', 2); fc.renderAll(); onSaveHistory?.() }
                                    }} title={c} />
                            ))}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                            <input type="color" value={(() => { const fc = fabricRef.current; const o = fc?.getActiveObject(); return o?.stroke || '#ffffff' })()} onChange={e => {
                                const fc = fabricRef.current; const obj = fc?.getActiveObject()
                                if (obj) { obj.set('stroke', e.target.value); if (!obj.strokeWidth) obj.set('strokeWidth', 2); fc.renderAll(); onSaveHistory?.() }
                            }} style={{ width: 24, height: 24, border: 'none', padding: 0, background: 'transparent', cursor: 'pointer' }} />
                            <span style={{ fontSize: 10, color: '#64748b' }}>Custom stroke</span>
                        </div>
                    </div>
                    {/* Border style */}
                    <div style={{ marginBottom: 8 }}>
                        <p style={{ fontSize: 10, color: '#475569', marginBottom: 4, fontWeight: 600 }}>STYLE</p>
                        <div style={{ display: 'flex', gap: 4 }}>
                            {[
                                { label: 'Solid', dash: null },
                                { label: 'Dash', dash: [12, 6] },
                                { label: 'Dot', dash: [3, 6] },
                            ].map(s => (
                                <button key={s.label} className="ce-tool-btn" onClick={() => {
                                    const fc = fabricRef.current; const obj = fc?.getActiveObject()
                                    if (obj) { obj.set('strokeDashArray', s.dash); fc.renderAll(); onSaveHistory?.() }
                                }} style={{ flex: 1, fontSize: 10, fontWeight: 600 }} title={s.label}>
                                    {s.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    {/* Border radius */}
                    {(() => { const fc = fabricRef.current; const obj = fc?.getActiveObject(); return obj && (obj.type === 'rect' || obj.rx !== undefined) })() && (
                        <div style={{ marginBottom: 4 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b', marginBottom: 4 }}>
                                <span>Radius</span>
                                <span>{(() => { const fc = fabricRef.current; return fc?.getActiveObject()?.rx || 0 })()}px</span>
                            </div>
                            <input type="range" className="ce-slider" min={0} max={100} value={(() => { const fc = fabricRef.current; return fc?.getActiveObject()?.rx || 0 })()} onChange={e => {
                                const fc = fabricRef.current; const obj = fc?.getActiveObject()
                                if (obj) { const v = parseInt(e.target.value); obj.set('rx', v); obj.set('ry', v); fc.renderAll(); onSaveHistory?.() }
                            }} />
                        </div>
                    )}
                </div>
            )}

            {/* Opacity Panel */}
            {selectedLayer && (
                <div className="ce-panel">
                    <div className="ce-panel-title">
                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#818cf8' }}>opacity</span>
                        Opacity
                    </div>
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b', marginBottom: 4 }}>
                            <span>Transparency</span>
                            <span>{objProps.opacity}%</span>
                        </div>
                        <input type="range" className="ce-slider" min={0} max={100} value={objProps.opacity}
                            onChange={e => updateProp('opacity', e.target.value)} />
                    </div>
                </div>
            )}

            {/* Shadow Panel */}
            {selectedLayer && (
                <div className="ce-panel">
                    <div className="ce-panel-title">
                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#818cf8' }}>flare</span>
                        Shadow
                    </div>
                    {/* Presets */}
                    <div style={{ marginBottom: 8 }}>
                        <p style={{ fontSize: 10, color: '#475569', marginBottom: 4, fontWeight: 600 }}>PRESETS</p>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {SHADOW_PRESETS.map(sp => (
                                <button key={sp.label} className="ce-tool-btn" onClick={() => {
                                    const fc = fabricRef.current; const obj = fc?.getActiveObject()
                                    if (obj) {
                                        if (sp.blur === 0 && sp.offsetX === 0 && sp.offsetY === 0) {
                                            obj.set('shadow', null)
                                        } else {
                                            obj.set('shadow', new fabric.Shadow({ color: sp.color, blur: sp.blur, offsetX: sp.offsetX, offsetY: sp.offsetY }))
                                        }
                                        fc.renderAll(); onSaveHistory?.()
                                    }
                                }} style={{ padding: '4px 8px', fontSize: 9, fontWeight: 600 }}>{sp.label}</button>
                            ))}
                        </div>
                    </div>
                    {/* Custom shadow Blur */}
                    <div style={{ marginBottom: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b', marginBottom: 4 }}>
                            <span>Blur</span>
                            <span>{(() => { const fc = fabricRef.current; return fc?.getActiveObject()?.shadow?.blur || 0 })()}</span>
                        </div>
                        <input type="range" className="ce-slider" min={0} max={100} value={(() => { const fc = fabricRef.current; return fc?.getActiveObject()?.shadow?.blur || 0 })()} onChange={e => {
                            const fc = fabricRef.current; const obj = fc?.getActiveObject()
                            if (obj) {
                                const s = obj.shadow || new fabric.Shadow({ color: 'rgba(0,0,0,0.3)', blur: 0, offsetX: 0, offsetY: 0 })
                                s.blur = parseInt(e.target.value)
                                obj.set('shadow', s); fc.renderAll(); onSaveHistory?.()
                            }
                        }} />
                    </div>
                    {/* Shadow offset */}
                    <div className="ce-prop-row">
                        <span className="ce-prop-label" style={{ fontSize: 9 }}>X</span>
                        <input className="ce-prop-input" type="number" min={-50} max={50} value={(() => { const fc = fabricRef.current; return fc?.getActiveObject()?.shadow?.offsetX || 0 })()} onChange={e => {
                            const fc = fabricRef.current; const obj = fc?.getActiveObject()
                            if (obj) {
                                const s = obj.shadow || new fabric.Shadow({ color: 'rgba(0,0,0,0.3)', blur: 10, offsetX: 0, offsetY: 0 })
                                s.offsetX = parseInt(e.target.value)
                                obj.set('shadow', s); fc.renderAll(); onSaveHistory?.()
                            }
                        }} />
                        <span className="ce-prop-label" style={{ fontSize: 9 }}>Y</span>
                        <input className="ce-prop-input" type="number" min={-50} max={50} value={(() => { const fc = fabricRef.current; return fc?.getActiveObject()?.shadow?.offsetY || 0 })()} onChange={e => {
                            const fc = fabricRef.current; const obj = fc?.getActiveObject()
                            if (obj) {
                                const s = obj.shadow || new fabric.Shadow({ color: 'rgba(0,0,0,0.3)', blur: 10, offsetX: 0, offsetY: 0 })
                                s.offsetY = parseInt(e.target.value)
                                obj.set('shadow', s); fc.renderAll(); onSaveHistory?.()
                            }
                        }} />
                    </div>
                    {/* Shadow color */}
                    <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input type="color" value={(() => { const fc = fabricRef.current; const s = fc?.getActiveObject()?.shadow; if (!s || !s.color) return '#000000'; const m = s.color.match?.(/\d+/g); return m ? `#${parseInt(m[0]).toString(16).padStart(2,'0')}${parseInt(m[1]).toString(16).padStart(2,'0')}${parseInt(m[2]).toString(16).padStart(2,'0')}` : '#000000' })()} onChange={e => {
                            const fc = fabricRef.current; const obj = fc?.getActiveObject()
                            if (obj) {
                                const hex = e.target.value; const r = parseInt(hex.slice(1,3),16); const g = parseInt(hex.slice(3,5),16); const b = parseInt(hex.slice(5,7),16)
                                const s = obj.shadow || new fabric.Shadow({ color: 'rgba(0,0,0,0.3)', blur: 10, offsetX: 0, offsetY: 0 })
                                s.color = `rgba(${r},${g},${b},0.4)`
                                obj.set('shadow', s); fc.renderAll(); onSaveHistory?.()
                            }
                        }} style={{ width: 24, height: 24, border: 'none', padding: 0, background: 'transparent', cursor: 'pointer' }} />
                        <span style={{ fontSize: 10, color: '#64748b' }}>Shadow color</span>
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="ce-panel">
                <div className="ce-panel-title">
                    <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#818cf8' }}>auto_fix_high</span>
                    Filters
                </div>
                <div className="ce-filter-grid">
                    {FILTERS.map(f => (
                        <button key={f.id} className={`ce-filter-btn ${activeFilter === f.id ? 'active' : ''}`}
                            onClick={() => applyFilter(f.id)}>
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Adjustments */}
            <div className="ce-panel">
                <div className="ce-panel-title">
                    <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#818cf8' }}>tune</span>
                    Adjustments
                </div>
                <div style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b', marginBottom: 4 }}>
                        <span>Brightness</span><span>{brightness}</span>
                    </div>
                    <input type="range" className="ce-slider" min={-50} max={50} value={brightness}
                        onChange={e => setBrightness(parseInt(e.target.value))} />
                </div>
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b', marginBottom: 4 }}>
                        <span>Contrast</span><span>{contrast}</span>
                    </div>
                    <input type="range" className="ce-slider" min={-50} max={50} value={contrast}
                        onChange={e => setContrast(parseInt(e.target.value))} />
                </div>
            </div>
        </div>
    )
}

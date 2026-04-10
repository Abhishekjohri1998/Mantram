// ═══════════════════════════════════════════════════════════════
// LayersPanel.jsx — Layer List Panel (always visible in sidebar)
// Displays canvas layers with selection and visibility toggle
// ═══════════════════════════════════════════════════════════════

import React from 'react'
import useCanvasStore from '../state/useCanvasStore'

export default function LayersPanel({ fabricRef, onSaveHistory }) {
    const {
        layers, selectedLayer,
        setSelectedLayer, setSelectedObjType, setObjProps,
    } = useCanvasStore()

    // ── Select a layer ──
    const selectLayer = (layer) => {
        const fc = fabricRef.current
        if (!fc) return
        const obj = fc.getObjects().find(o => (o.id || o.customName || o._customName) === layer.id)
        if (obj) {
            fc.setActiveObject(obj)
            fc.renderAll()
            setSelectedLayer(layer.id)
            // Determine object type
            const t = obj.type
            if (t === 'textbox' || t === 'text' || t === 'i-text') {
                setSelectedObjType('text')
            } else if (t === 'image') {
                setSelectedObjType('image')
            } else {
                setSelectedObjType('shape')
            }
            // Update object properties
            setObjProps({
                x: Math.round(obj.left || 0),
                y: Math.round(obj.top || 0),
                w: Math.round((obj.width || 0) * (obj.scaleX || 1)),
                h: Math.round((obj.height || 0) * (obj.scaleY || 1)),
                angle: Math.round(obj.angle || 0),
                opacity: Math.round((obj.opacity || 1) * 100),
            })
        }
    }

    // ── Toggle layer visibility ──
    const toggleLayerVisibility = (layer) => {
        const fc = fabricRef.current
        if (!fc) return
        const obj = fc.getObjects().find(o => (o.id || o.customName || o._customName) === layer.id)
        if (obj) {
            obj.set('visible', !obj.visible)
            fc.renderAll()
            onSaveHistory?.()
        }
    }

    return (
        <div className="ce-panel ce-layers-panel">
            <div className="ce-panel-title">
                <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#818cf8' }}>layers</span>
                Layers
                <span style={{ marginLeft: 'auto', color: '#475569', fontSize: 10 }}>{layers.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
                {layers.map(layer => (
                    <div key={layer.id}
                        className={`ce-layer-item ${selectedLayer === layer.id ? 'active' : ''}`}
                        onClick={() => selectLayer(layer)}>
                        <div className="ce-layer-thumb" style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#475569', fontSize: 14,
                        }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                                {layer.type === 'image' ? 'image' : layer.type === 'textbox' ? 'text_fields' : 'rectangle'}
                            </span>
                        </div>
                        <span className="ce-layer-name">{layer.name}</span>
                        <span className="ce-layer-visibility material-symbols-outlined"
                            onClick={(e) => { e.stopPropagation(); toggleLayerVisibility(layer) }}>
                            {layer.visible ? 'visibility' : 'visibility_off'}
                        </span>
                    </div>
                ))}
                {layers.length === 0 && (
                    <p style={{ fontSize: 11, color: '#475569', textAlign: 'center', padding: 12 }}>
                        No layers yet
                    </p>
                )}
            </div>
        </div>
    )
}

// ═══════════════════════════════════════════════════════════════
// maskTools.js — Mask painting, brush, compositing for AI tools
// Extracted from monolithic CanvasEditor.jsx
// ═══════════════════════════════════════════════════════════════

import * as fabric from 'fabric'

/**
 * Get mask as black/white base64 from Fabric.js free-draw strokes
 */
export function getMaskDataUrl(fc) {
    if (!fc) return null
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = fc.width
    tempCanvas.height = fc.height
    const ctx = tempCanvas.getContext('2d')
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height)

    const maskPaths = fc.getObjects().filter(o => o._isMaskStroke)
    if (maskPaths.length === 0) return null

    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = '#ffffff'
    maskPaths.forEach(path => {
        const pathData = path.toDatalessObject()
        ctx.save()
        ctx.lineWidth = pathData.strokeWidth || 30
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.globalAlpha = 1
        const svgPath = path.path
        if (svgPath) {
            ctx.beginPath()
            svgPath.forEach(cmd => {
                if (cmd[0] === 'M') ctx.moveTo(cmd[1], cmd[2])
                else if (cmd[0] === 'Q') ctx.quadraticCurveTo(cmd[1], cmd[2], cmd[3], cmd[4])
                else if (cmd[0] === 'L') ctx.lineTo(cmd[1], cmd[2])
            })
            ctx.stroke()
        }
        ctx.restore()
    })
    return tempCanvas.toDataURL('image/png')
}

/**
 * Clear mask strokes from canvas
 */
export function clearMaskStrokes(fc) {
    if (!fc) return
    const maskPaths = fc.getObjects().filter(o => o._isMaskStroke)
    maskPaths.forEach(p => fc.remove(p))
    fc.requestRenderAll()
}

/**
 * Toggle mask painting mode on canvas
 * @returns {Function|null} cleanup function to remove the path listener
 */
export function enableMaskMode(fc, brushSize = 30) {
    if (!fc) return null
    fc.isDrawingMode = true
    fc.freeDrawingBrush = new fabric.PencilBrush(fc)
    fc.freeDrawingBrush.width = brushSize
    fc.freeDrawingBrush.color = 'rgba(255, 60, 60, 0.45)'
    fc.freeDrawingBrush.shadow = new fabric.Shadow({
        blur: 8, color: 'rgba(255, 0, 0, 0.3)', offsetX: 0, offsetY: 0
    })

    // Mark each new path as mask stroke
    const onPathCreated = (e) => {
        if (e.path) e.path._isMaskStroke = true
    }
    fc.on('path:created', onPathCreated)

    // Return cleanup function
    return () => {
        fc.off('path:created', onPathCreated)
    }
}

/**
 * Disable mask painting mode
 */
export function disableMaskMode(fc) {
    if (!fc) return
    fc.isDrawingMode = false
}

/**
 * Update mask brush size
 */
export function setMaskBrushSize(fc, size) {
    if (!fc || !fc.freeDrawingBrush) return
    fc.freeDrawingBrush.width = size
}

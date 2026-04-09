// ═══════════════════════════════════════════════════════════════
// fabricEngine.js — Canvas Engine Adapter
// Handles Fabric.js initialization, resize, zoom, pan, artboard
// Decoupled from React components for future-proofing
// ═══════════════════════════════════════════════════════════════

import * as fabric from 'fabric'

// ── Initialize Fabric.js Canvas ──
export function initFabricCanvas(canvasEl, container, opts = {}) {
    const {
        canvasWidth = 1080,
        canvasHeight = 1080,
        imageUrl = '',
        onSelectionCreated,
        onSelectionUpdated,
        onSelectionCleared,
        onObjectModified,
        onObjectAdded,
        onObjectRemoved,
        onContextMenu,
    } = opts

    const containerW = container.clientWidth
    const containerH = container.clientHeight

    const fc = new fabric.Canvas(canvasEl, {
        width: containerW,
        height: containerH,
        backgroundColor: 'transparent',
        preserveObjectStacking: true,
        selection: true,
        fireRightClick: true,
        // Performance optimizations
        renderOnAddRemove: false,       // Batch renders manually
        skipOffscreen: true,            // Don't render off-viewport objects
    })

    // Store logical dimensions
    const scale = Math.min((containerW - 80) / canvasWidth, (containerH - 80) / canvasHeight, 1)
    fc._logicalScale = scale
    fc._logicalWidth = canvasWidth
    fc._logicalHeight = canvasHeight
    fc._artboardLeft = Math.round((containerW - Math.round(canvasWidth * scale)) / 2)
    fc._artboardTop = Math.round((containerH - Math.round(canvasHeight * scale)) / 2)

    // ── Canvas Events ──
    if (onSelectionCreated) fc.on('selection:created', onSelectionCreated)
    if (onSelectionUpdated) fc.on('selection:updated', onSelectionUpdated)
    if (onSelectionCleared) fc.on('selection:cleared', onSelectionCleared)
    if (onObjectModified) fc.on('object:modified', onObjectModified)
    if (onObjectAdded) fc.on('object:added', onObjectAdded)
    if (onObjectRemoved) fc.on('object:removed', onObjectRemoved)

    // ── Right-Click Context Menu ──
    if (onContextMenu) {
        const showCtx = (e) => {
            e.preventDefault()
            e.stopPropagation()
            onContextMenu(e, fc)
        }
        if (fc.upperCanvasEl) fc.upperCanvasEl.addEventListener('contextmenu', showCtx)
        if (fc.wrapperEl) fc.wrapperEl.addEventListener('contextmenu', showCtx)
    }

    // ── Load initial image if provided ──
    if (imageUrl) {
        loadImageToCanvas(fc, imageUrl, containerW, containerH)
    } else {
        fc.requestRenderAll()
    }

    return { fc, scale }
}

// ── Load image onto canvas (centered, scaled to fit) ──
export async function loadImageToCanvas(fc, imageUrl, containerW, containerH) {
    try {
        const img = await fabric.FabricImage.fromURL(imageUrl, { crossOrigin: 'anonymous' })
        const maxDim = Math.min(containerW * 0.8, containerH * 0.8)
        const imgScale = Math.min(maxDim / img.width, maxDim / img.height, 1)
        img.set({
            scaleX: imgScale,
            scaleY: imgScale,
            left: containerW / 2,
            top: containerH / 2,
            originX: 'center',
            originY: 'center',
            selectable: true,
            evented: true,
            customName: 'Background Image',
            id: 'bg-image',
        })
        fc.add(img)
        fc.sendToBack(img)
        fc.requestRenderAll()
        return img
    } catch (err) {
        console.error('Failed to load image:', err)
        return null
    }
}

// ── Resize artboard to preset ──
export function resizeToPreset(fc, preset) {
    if (!fc) return null

    const canvasW = fc.width
    const canvasH = fc.height
    const maxW = canvasW - 80
    const maxH = canvasH - 80
    const scale = Math.min(maxW / preset.w, maxH / preset.h, 1)
    const displayW = Math.round(preset.w * scale)
    const displayH = Math.round(preset.h * scale)
    const artboardLeft = Math.round((canvasW - displayW) / 2)
    const artboardTop = Math.round((canvasH - displayH) / 2)

    // Create or update artboard
    let artboard = fc.getObjects().find(o => o.id === 'artboard')
    if (!artboard) {
        artboard = new fabric.Rect({
            left: artboardLeft,
            top: artboardTop,
            width: displayW,
            height: displayH,
            fill: '#ffffff',
            rx: 4, ry: 4,
            selectable: false,
            evented: false,
            hoverCursor: 'default',
            id: 'artboard',
            excludeFromExport: false,
            shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.25)', blur: 30, offsetX: 0, offsetY: 4 }),
        })
        fc.add(artboard)
        fc.sendObjectToBack(artboard)
    } else {
        artboard.set({ left: artboardLeft, top: artboardTop, width: displayW, height: displayH })
    }

    fc._logicalScale = scale
    fc._logicalWidth = preset.w
    fc._logicalHeight = preset.h
    fc._artboardLeft = artboardLeft
    fc._artboardTop = artboardTop

    // Resize background image to fill artboard
    const bgImg = fc.getObjects().find(o => o.id === 'bg-image')
    if (bgImg) {
        const imgScale = Math.max(displayW / bgImg.width, displayH / bgImg.height)
        bgImg.set({
            scaleX: imgScale, scaleY: imgScale,
            left: artboardLeft + displayW / 2,
            top: artboardTop + displayH / 2,
        })
    }

    fc.requestRenderAll()
    return { scale, displayW, displayH }
}

// ── Resize canvas to custom dimensions ──
export function resizeCanvasCustom(fc, container, newW, newH) {
    if (!fc || !container) return null

    const maxW = container.clientWidth - 80
    const maxH = container.clientHeight - 80
    const scale = Math.min(maxW / newW, maxH / newH, 1)
    const displayW = Math.round(newW * scale)
    const displayH = Math.round(newH * scale)

    const oldW = fc._logicalWidth || 1080
    const oldH = fc._logicalHeight || 1080
    const scaleRatioX = newW / oldW
    const scaleRatioY = newH / oldH

    fc.setDimensions({ width: displayW, height: displayH })
    fc._logicalScale = scale
    fc._logicalWidth = newW
    fc._logicalHeight = newH

    // Scale all objects proportionally
    fc.getObjects().forEach(obj => {
        obj.set({
            left: (obj.left || 0) * (displayW / (fc.width || displayW)),
            top: (obj.top || 0) * (displayH / (fc.height || displayH)),
            scaleX: (obj.scaleX || 1) * scaleRatioX,
            scaleY: (obj.scaleY || 1) * scaleRatioY,
        })
        obj.setCoords()
    })

    fc.requestRenderAll()
    return { scale, displayW, displayH }
}

// ── Zoom handler ──
export function setCanvasZoom(fc, newZoom) {
    if (!fc) return
    const scaleFactor = Math.max(0.25, Math.min(3, newZoom / 100))
    fc.setZoom(scaleFactor)
    fc.requestRenderAll()
}

// ── Export canvas to data URL ──
export function exportCanvasToDataURL(fc, format = 'png') {
    if (!fc) return null

    // Deselect all objects
    fc.discardActiveObject()
    fc.renderAll()

    const artboard = fc.getObjects().find(o => o.id === 'artboard')
    let dataUrl

    if (artboard) {
        const currentZoom = fc.getZoom()
        fc.setZoom(1)
        artboard.visible = false
        fc.renderAll()

        dataUrl = fc.toDataURL({
            format,
            quality: format === 'jpeg' ? 0.92 : 1,
            left: artboard.left, top: artboard.top,
            width: artboard.width, height: artboard.height,
        })

        artboard.visible = true
        fc.setZoom(currentZoom)
        fc.renderAll()
    } else {
        const currentZoom = fc.getZoom()
        fc.setZoom(1)
        fc.renderAll()
        dataUrl = fc.toDataURL({ format, quality: format === 'jpeg' ? 0.92 : 1 })
        fc.setZoom(currentZoom)
        fc.renderAll()
    }

    return dataUrl
}

// ── Get canvas snapshot as base64 (for AI tools) ──
export function getCanvasSnapshot(fc) {
    if (!fc) return null
    return fc.toDataURL({ format: 'png', quality: 0.8 })
}

// ── Update layers list from canvas objects ──
export function extractLayers(fc) {
    if (!fc) return []
    const objs = fc.getObjects().filter(o => o.id !== 'artboard')
    return objs.map((obj, i) => ({
        id: obj.id || `layer-${i}`,
        name: obj.customName || obj._customName || obj.type || `Layer ${i + 1}`,
        type: obj.type,
        visible: obj.visible !== false,
        locked: !!obj.lockMovementX,
        obj,
    })).reverse() // Top layers first
}

// ── Get selected object properties ──
export function getSelectedObjectProps(fc) {
    if (!fc) return null
    const obj = fc.getActiveObject()
    if (!obj) return null

    let objType = 'shape'
    if (obj.type === 'textbox' || obj.type === 'text' || obj.type === 'i-text') objType = 'text'
    else if (obj.type === 'image') objType = 'image'

    return {
        type: objType,
        props: {
            x: Math.round(obj.left || 0),
            y: Math.round(obj.top || 0),
            w: Math.round((obj.width || 0) * (obj.scaleX || 1)),
            h: Math.round((obj.height || 0) * (obj.scaleY || 1)),
            angle: Math.round(obj.angle || 0),
            opacity: Math.round((obj.opacity || 1) * 100),
        },
        id: obj.id || null,
    }
}

// ── Update object property ──
export function updateObjectProp(fc, prop, value) {
    if (!fc) return
    const obj = fc.getActiveObject()
    if (!obj) return

    const numVal = parseFloat(value)
    if (prop === 'opacity') obj.set('opacity', numVal / 100)
    else if (prop === 'angle') obj.set('angle', numVal)
    else if (prop === 'x') obj.set('left', numVal)
    else if (prop === 'y') obj.set('top', numVal)
    else if (prop === 'w') {
        const currentW = (obj.width || 1) * (obj.scaleX || 1)
        obj.set('scaleX', (obj.scaleX || 1) * (numVal / currentW))
    } else if (prop === 'h') {
        const currentH = (obj.height || 1) * (obj.scaleY || 1)
        obj.set('scaleY', (obj.scaleY || 1) * (numVal / currentH))
    }

    obj.setCoords()
    fc.requestRenderAll()
}

// ── Canvas object operations ──
export function deleteSelected(fc) {
    if (!fc) return false
    const obj = fc.getActiveObject()
    if (!obj) return false
    fc.remove(obj)
    fc.requestRenderAll()
    return true
}

export function duplicateSelected(fc) {
    if (!fc) return null
    const obj = fc.getActiveObject()
    if (!obj) return null

    return obj.clone().then(cloned => {
        cloned.set({
            left: (obj.left || 0) + 20,
            top: (obj.top || 0) + 20,
            id: `clone-${Date.now()}`,
            customName: (obj.customName || obj._customName || 'Object') + ' Copy',
        })
        fc.add(cloned)
        fc.setActiveObject(cloned)
        fc.requestRenderAll()
        return cloned
    })
}

export function bringForward(fc) {
    const obj = fc?.getActiveObject()
    if (obj) { fc.bringObjectForward(obj); fc.requestRenderAll() }
}

export function sendBackward(fc) {
    const obj = fc?.getActiveObject()
    if (obj) { fc.sendObjectBackwards(obj); fc.requestRenderAll() }
}

export function toggleLock(fc) {
    const obj = fc?.getActiveObject()
    if (!obj) return false
    const isLocked = obj.lockMovementX
    obj.set({
        lockMovementX: !isLocked,
        lockMovementY: !isLocked,
        lockScalingX: !isLocked,
        lockScalingY: !isLocked,
        lockRotation: !isLocked,
        hasControls: isLocked,
        selectable: true,
    })
    fc.requestRenderAll()
    return !isLocked
}

// ── Copy/Cut/Paste with clipboard ref ──
export async function copyObject(fc, clipboardRef) {
    const obj = fc?.getActiveObject()
    if (!obj) return false
    const cloned = await obj.clone()
    clipboardRef.current = cloned
    return true
}

export async function cutObject(fc, clipboardRef) {
    const obj = fc?.getActiveObject()
    if (!obj) return false
    const cloned = await obj.clone()
    clipboardRef.current = cloned
    fc.remove(obj)
    fc.requestRenderAll()
    return true
}

export async function pasteObject(fc, clipboardRef) {
    const clip = clipboardRef.current
    if (!fc || !clip) return false
    const cloned = await clip.clone()
    cloned.set({
        left: (cloned.left || 0) + 20,
        top: (cloned.top || 0) + 20,
        evented: true,
    })
    if (cloned.type === 'activeselection') {
        cloned.canvas = fc
        cloned.forEachObject(obj => fc.add(obj))
        cloned.setCoords()
    } else {
        fc.add(cloned)
    }
    clip.set({ left: (clip.left || 0) + 20, top: (clip.top || 0) + 20 })
    fc.setActiveObject(cloned)
    fc.requestRenderAll()
    return true
}

// ── Group/Ungroup ──
export function groupSelected(fc) {
    const active = fc?.getActiveObject()
    if (!active || active.type !== 'activeselection') return false
    const group = active.toGroup()
    group._customName = 'Group'
    fc.requestRenderAll()
    return true
}

export function ungroupSelected(fc) {
    const active = fc?.getActiveObject()
    if (!active || active.type !== 'group') return false
    active.toActiveSelection()
    fc.requestRenderAll()
    return true
}

// ── Merge selected objects into a raster image ──
export async function mergeSelected(fc) {
    const active = fc?.getActiveObject()
    if (!active) return false
    const objects = active.type === 'activeselection' ? active.getObjects() : [active]
    if (objects.length < 2) return false

    const bounds = active.getBoundingRect()
    const tmpCanvas = document.createElement('canvas')
    tmpCanvas.width = bounds.width
    tmpCanvas.height = bounds.height
    const ctx = tmpCanvas.getContext('2d')

    fc.discardActiveObject()
    const origVp = fc.viewportTransform.slice()
    fc.viewportTransform = [1, 0, 0, 1, -bounds.left, -bounds.top]
    fc.renderAll()
    ctx.drawImage(fc.getElement(), 0, 0)
    fc.viewportTransform = origVp

    const dataUrl = tmpCanvas.toDataURL('image/png')
    objects.forEach(o => fc.remove(o))

    const img = await fabric.FabricImage.fromURL(dataUrl, { crossOrigin: 'anonymous' })
    img.set({ left: bounds.left, top: bounds.top })
    img._customName = 'Merged Layer'
    fc.add(img)
    fc.setActiveObject(img)
    fc.requestRenderAll()
    return true
}

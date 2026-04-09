// ═══════════════════════════════════════════════════════════════
// shapeTools.js — Shape creation logic for all 20+ shape types
// Extracted from monolithic CanvasEditor.jsx addShape()
// ═══════════════════════════════════════════════════════════════

import * as fabric from 'fabric'

// Helper: create regular polygon points
function regularPoly(sides, radius) {
    const pts = []
    for (let i = 0; i < sides; i++) {
        const angle = (i * 2 * Math.PI / sides) - Math.PI / 2
        pts.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius })
    }
    return pts
}

// Helper: create star points
function starPoly(points, outerR, innerR) {
    const pts = []
    for (let i = 0; i < points * 2; i++) {
        const r = i % 2 === 0 ? outerR : innerR
        const angle = (i * Math.PI / points) - Math.PI / 2
        pts.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r })
    }
    return pts
}

/**
 * Create a fabric shape object by type
 * @param {string} type — shape type ID (e.g. 'shape-rect', 'shape-circle')
 * @param {string} brandColor — primary brand color hex
 * @returns {fabric.Object|null} — the created shape or null
 */
export function createShape(type, brandColor = '#6366f1') {
    const fillColor = brandColor + '40'
    const ts = Date.now()
    let shape

    switch (type) {
        case 'shape-rect':
            shape = new fabric.Rect({ width: 200, height: 150, fill: fillColor, stroke: brandColor, strokeWidth: 2, rx: 0, ry: 0, customName: 'Rectangle', id: `rect-${ts}` })
            break
        case 'shape-rounded-rect':
            shape = new fabric.Rect({ width: 200, height: 150, fill: fillColor, stroke: brandColor, strokeWidth: 2, rx: 20, ry: 20, customName: 'Rounded Rect', id: `rrect-${ts}` })
            break
        case 'shape-circle':
            shape = new fabric.Circle({ radius: 80, fill: fillColor, stroke: brandColor, strokeWidth: 2, customName: 'Circle', id: `circle-${ts}` })
            break
        case 'shape-oval':
            shape = new fabric.Ellipse({ rx: 120, ry: 70, fill: fillColor, stroke: brandColor, strokeWidth: 2, customName: 'Oval', id: `oval-${ts}` })
            break
        case 'shape-triangle':
            shape = new fabric.Polygon(regularPoly(3, 80), { fill: fillColor, stroke: brandColor, strokeWidth: 2, customName: 'Triangle', id: `tri-${ts}` })
            break
        case 'shape-diamond':
            shape = new fabric.Polygon([{ x: 0, y: -90 }, { x: 70, y: 0 }, { x: 0, y: 90 }, { x: -70, y: 0 }], { fill: fillColor, stroke: brandColor, strokeWidth: 2, customName: 'Diamond', id: `diamond-${ts}` })
            break
        case 'shape-pentagon':
            shape = new fabric.Polygon(regularPoly(5, 80), { fill: fillColor, stroke: brandColor, strokeWidth: 2, customName: 'Pentagon', id: `pent-${ts}` })
            break
        case 'shape-hexagon':
            shape = new fabric.Polygon(regularPoly(6, 80), { fill: fillColor, stroke: brandColor, strokeWidth: 2, customName: 'Hexagon', id: `hex-${ts}` })
            break
        case 'shape-star5':
            shape = new fabric.Polygon(starPoly(5, 80, 35), { fill: fillColor, stroke: brandColor, strokeWidth: 2, customName: 'Star 5pt', id: `star5-${ts}` })
            break
        case 'shape-star6':
            shape = new fabric.Polygon(starPoly(6, 80, 40), { fill: fillColor, stroke: brandColor, strokeWidth: 2, customName: 'Star 6pt', id: `star6-${ts}` })
            break
        case 'shape-heart':
            shape = new fabric.Path('M 0 -40 C -30 -80, -100 -40, -60 20 C -30 60, 0 80, 0 80 C 0 80, 30 60, 60 20 C 100 -40, 30 -80, 0 -40 Z', { fill: '#f87171', stroke: '#ef4444', strokeWidth: 2, customName: 'Heart', id: `heart-${ts}` })
            break
        case 'shape-cross':
            shape = new fabric.Polygon([
                { x: -25, y: -75 }, { x: 25, y: -75 }, { x: 25, y: -25 },
                { x: 75, y: -25 }, { x: 75, y: 25 }, { x: 25, y: 25 },
                { x: 25, y: 75 }, { x: -25, y: 75 }, { x: -25, y: 25 },
                { x: -75, y: 25 }, { x: -75, y: -25 }, { x: -25, y: -25 },
            ], { fill: fillColor, stroke: brandColor, strokeWidth: 2, customName: 'Cross', id: `cross-${ts}` })
            break
        case 'shape-arrow-right':
            shape = new fabric.Polygon([
                { x: -80, y: -30 }, { x: 20, y: -30 }, { x: 20, y: -60 },
                { x: 80, y: 0 },
                { x: 20, y: 60 }, { x: 20, y: 30 }, { x: -80, y: 30 },
            ], { fill: fillColor, stroke: brandColor, strokeWidth: 2, customName: 'Arrow Right', id: `arrowr-${ts}` })
            break
        case 'shape-arrow-up':
            shape = new fabric.Polygon([
                { x: 0, y: -80 },
                { x: 60, y: -20 }, { x: 30, y: -20 }, { x: 30, y: 80 },
                { x: -30, y: 80 }, { x: -30, y: -20 }, { x: -60, y: -20 },
            ], { fill: fillColor, stroke: brandColor, strokeWidth: 2, customName: 'Arrow Up', id: `arrowu-${ts}` })
            break
        case 'shape-badge':
            shape = new fabric.Polygon(starPoly(8, 80, 60), { fill: fillColor, stroke: brandColor, strokeWidth: 2, customName: 'Badge', id: `badge-${ts}` })
            break
        case 'shape-line':
            shape = new fabric.Line([0, 0, 300, 0], { stroke: brandColor, strokeWidth: 3, customName: 'Line', id: `line-${ts}` })
            break
        case 'shape-dashed':
            shape = new fabric.Line([0, 0, 300, 0], { stroke: brandColor, strokeWidth: 3, strokeDashArray: [15, 10], customName: 'Dashed', id: `dash-${ts}` })
            break
        case 'shape-dotted':
            shape = new fabric.Line([0, 0, 300, 0], { stroke: brandColor, strokeWidth: 3, strokeDashArray: [3, 8], strokeLineCap: 'round', customName: 'Dotted', id: `dot-${ts}` })
            break
        case 'shape-arrow-line': {
            const alGroup = new fabric.Group([
                new fabric.Line([0, 0, 250, 0], { stroke: brandColor, strokeWidth: 3 }),
                new fabric.Polygon([{ x: 0, y: -10 }, { x: 20, y: 0 }, { x: 0, y: 10 }], { fill: brandColor, left: 250, top: -10 }),
            ], { customName: 'Arrow Line', id: `aline-${ts}` })
            shape = alGroup
            break
        }
        case 'shape-double-arrow': {
            const daGroup = new fabric.Group([
                new fabric.Polygon([{ x: 0, y: 0 }, { x: -20, y: -10 }, { x: -20, y: 10 }], { fill: brandColor }),
                new fabric.Line([0, 0, 250, 0], { stroke: brandColor, strokeWidth: 3 }),
                new fabric.Polygon([{ x: 250, y: 0 }, { x: 270, y: -10 }, { x: 270, y: 10 }], { fill: brandColor }),
            ], { customName: 'Double Arrow', id: `darrow-${ts}` })
            shape = daGroup
            break
        }
        case 'shape-blob':
            shape = new fabric.Path('M 80 0 C 120 -20, 140 40, 100 80 C 60 120, -20 100, -40 60 C -60 20, 40 -40, 80 0 Z', { fill: fillColor, stroke: brandColor, strokeWidth: 2, customName: 'Blob', id: `blob-${ts}`, scaleX: 1.2, scaleY: 1.2 })
            break
        case 'shape-wave':
            shape = new fabric.Path('M 0 50 Q 50 0, 100 50 T 200 50 T 300 50', { fill: 'transparent', stroke: brandColor, strokeWidth: 4, customName: 'Wave', id: `wave-${ts}` })
            break
        case 'shape-ring': {
            const ringG = new fabric.Group([
                new fabric.Circle({ radius: 80, fill: 'transparent', stroke: brandColor, strokeWidth: 10 }),
            ], { customName: 'Ring', id: `ring-${ts}` })
            shape = ringG
            break
        }
        case 'shape-half-circle':
            shape = new fabric.Path('M -80 0 A 80 80 0 0 1 80 0 Z', { fill: fillColor, stroke: brandColor, strokeWidth: 2, customName: 'Half Circle', id: `half-${ts}` })
            break
        default:
            return null
    }

    return shape
}

/**
 * Add shape to canvas at center
 */
export function addShapeToCanvas(fc, type, brandColor = '#6366f1') {
    if (!fc) return null
    const shape = createShape(type, brandColor)
    if (!shape) return null

    shape.set({ left: fc.width / 2, top: fc.height / 2, originX: 'center', originY: 'center' })
    fc.add(shape)
    fc.setActiveObject(shape)
    fc.requestRenderAll()
    return shape
}

/**
 * Add gradient rect to canvas
 */
export function addGradientToCanvas(fc, preset) {
    if (!fc) return null
    const w = 300, h = 300
    const angleRad = (preset.angle * Math.PI) / 180
    const rect = new fabric.Rect({
        left: 100, top: 100, width: w, height: h, rx: 12, ry: 12,
    })
    rect.set('fill', new fabric.Gradient({
        type: 'linear',
        coords: {
            x1: 0, y1: 0,
            x2: w * Math.cos(angleRad), y2: h * Math.sin(angleRad),
        },
        colorStops: [
            { offset: 0, color: preset.colors[0] },
            { offset: 1, color: preset.colors[1] },
        ],
    }))
    rect._customName = preset.name
    fc.add(rect)
    fc.setActiveObject(rect)
    fc.requestRenderAll()
    return rect
}

/**
 * Apply gradient fill to currently selected object
 */
export function applyGradientToSelected(fc, preset) {
    const obj = fc?.getActiveObject()
    if (!obj) return false
    const w = obj.width || 200, h = obj.height || 200
    const angleRad = (preset.angle * Math.PI) / 180
    obj.set('fill', new fabric.Gradient({
        type: 'linear',
        coords: {
            x1: 0, y1: 0,
            x2: w * Math.cos(angleRad), y2: h * Math.sin(angleRad),
        },
        colorStops: [
            { offset: 0, color: preset.colors[0] },
            { offset: 1, color: preset.colors[1] },
        ],
    }))
    fc.requestRenderAll()
    return true
}

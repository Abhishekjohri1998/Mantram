// ═══════════════════════════════════════════════════════════════
// textTools.js — Text creation & manipulation logic
// Extracted from monolithic CanvasEditor.jsx
// ═══════════════════════════════════════════════════════════════

import * as fabric from 'fabric'
import { loadGoogleFont } from '../data/fonts'

/**
 * Add text or heading to canvas at center
 */
export function addText(fc, text = 'Your text here', isHeading = false, brand = {}) {
    if (!fc) return null
    const brandFont = brand?.dna?.fonts?.[0] || 'Inter'
    const brandColor = brand?.dna?.colors?.[0]?.hex || '#ffffff'

    const textObj = new fabric.Textbox(text || (isHeading ? 'Heading' : 'Your text here'), {
        left: fc.width / 2,
        top: fc.height / 2,
        originX: 'center',
        originY: 'center',
        fontSize: isHeading ? 48 : 24,
        fontWeight: isHeading ? '800' : '400',
        fontFamily: brandFont,
        fill: brandColor,
        textAlign: 'center',
        width: fc.width * 0.6,
        editable: true,
        customName: isHeading ? 'Heading' : 'Text',
        id: `text-${Date.now()}`,
    })

    fc.add(textObj)
    fc.setActiveObject(textObj)
    fc.requestRenderAll()
    return textObj
}

/**
 * Add subheading text to canvas
 */
export function addSubheading(fc) {
    if (!fc) return null
    const subText = new fabric.Textbox('Subheading', {
        left: fc.width / 2,
        top: fc.height / 2,
        originX: 'center',
        originY: 'center',
        fontSize: 28,
        fontWeight: '600',
        fontFamily: 'DM Sans',
        fill: '#94a3b8',
        textAlign: 'center',
        width: fc.width * 0.6,
        editable: true,
        customName: 'Subheading',
        id: `sub-${Date.now()}`,
    })
    fc.add(subText)
    fc.setActiveObject(subText)
    fc.requestRenderAll()
    return subText
}

/**
 * Add styled text preset to canvas
 */
export function addTextStyle(fc, preset) {
    if (!fc || !preset) return null
    loadGoogleFont(preset.font)

    return new Promise(resolve => {
        setTimeout(() => {
            const textObj = new fabric.Textbox(preset.sample, {
                left: fc.width / 2,
                top: fc.height / 2,
                originX: 'center',
                originY: 'center',
                fontSize: preset.size,
                fontWeight: preset.weight,
                fontFamily: preset.font,
                fill: preset.color,
                fontStyle: preset.italic ? 'italic' : 'normal',
                charSpacing: (preset.tracking || 0) * 10,
                textAlign: 'center',
                width: fc.width * 0.7,
                editable: true,
                customName: preset.label,
                id: `style-${Date.now()}`,
            })
            fc.add(textObj)
            fc.setActiveObject(textObj)
            fc.requestRenderAll()
            resolve(textObj)
        }, 200)
    })
}

/**
 * Set text fill color on selected text object
 */
export function setTextColor(fc, color) {
    const obj = fc?.getActiveObject()
    if (obj && (obj.type === 'textbox' || obj.type === 'text' || obj.type === 'i-text')) {
        obj.set('fill', color)
        fc.requestRenderAll()
        return true
    }
    return false
}

/**
 * Apply font to selected text object
 */
export function applyFontToSelected(fc, fontName) {
    loadGoogleFont(fontName)
    const obj = fc?.getActiveObject()
    if (obj && obj.fontFamily !== undefined) {
        setTimeout(() => {
            obj.set('fontFamily', fontName)
            fc.requestRenderAll()
        }, 300)
        return true
    }
    return false
}

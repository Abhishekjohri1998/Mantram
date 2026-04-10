// ═══════════════════════════════════════════════════════════════
// imageTools.js — Image upload, filters, adjustments, brand assets
// Extracted from monolithic CanvasEditor.jsx
// ═══════════════════════════════════════════════════════════════

import * as fabric from 'fabric'
import { media as mediaAPI, getCorsUrl } from '../../../../services/api'

/**
 * Add brand logo to canvas
 */
export async function addLogo(fc, brand) {
    if (!fc) return null
    const logoUrl = brand?.dna?.logo?.url
    if (!logoUrl) return null

    try {
        const img = await fabric.FabricImage.fromURL(getCorsUrl(logoUrl), { crossOrigin: 'anonymous' })
        const maxSize = fc.width * 0.15
        const scale = maxSize / Math.max(img.width, img.height)
        img.set({
            scaleX: scale,
            scaleY: scale,
            left: fc.width - 40,
            top: fc.height - 40,
            originX: 'right',
            originY: 'bottom',
            customName: 'Brand Logo',
            id: `logo-${Date.now()}`,
        })
        fc.add(img)
        fc.setActiveObject(img)
        fc.requestRenderAll()
        return img
    } catch {
        return null
    }
}

/**
 * Upload image from file input and add to canvas as a layer
 */
export function uploadImage(fc) {
    if (!fc) return
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async (e) => {
        const file = e.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = async (ev) => {
            // Upload to S3 first, fall back to base64
            let imgUrl = ev.target.result
            try {
                const { url } = await mediaAPI.upload({ imageData: ev.target.result, folder: 'canvas-layers' })
                imgUrl = url
            } catch (err) {
                console.warn('S3 upload failed for canvas layer, using base64:', err.message)
            }
            try {
                const img = await fabric.FabricImage.fromURL(getCorsUrl(imgUrl), { crossOrigin: 'anonymous' })
                const maxSize = fc.width * 0.5
                const scale = maxSize / Math.max(img.width, img.height)
                img.set({
                    scaleX: scale,
                    scaleY: scale,
                    left: fc.width / 2,
                    top: fc.height / 2,
                    originX: 'center',
                    originY: 'center',
                    customName: file.name.split('.')[0] || 'Uploaded Image',
                    id: `img-${Date.now()}`,
                })
                fc.add(img)
                fc.setActiveObject(img)
                fc.requestRenderAll()
            } catch (err) {
                console.error('Failed to load image onto canvas:', err)
            }
        }
        reader.readAsDataURL(file)
    }
    input.click()
}

/**
 * Add image URL to canvas
 */
export async function addImageUrlToCanvas(fc, url, label) {
    if (!fc || !url) return null
    try {
        const img = await fabric.FabricImage.fromURL(getCorsUrl(url), { crossOrigin: 'anonymous' })
        const maxDim = 400
        const scale = Math.min(maxDim / img.width, maxDim / img.height, 1)
        // Smart grid placement
        const existingObjs = fc.getObjects().filter(o => o.id !== 'artboard' && o.type === 'image')
        const colSize = maxDim * scale + 20
        const cols = Math.max(1, Math.floor((fc.width - 40) / colSize))
        const idx = existingObjs.length
        const col = idx % cols
        const row = Math.floor(idx / cols)
        const posX = 40 + col * colSize
        const posY = 40 + row * (maxDim * scale + 20)
        img.set({ left: posX, top: posY, scaleX: scale, scaleY: scale })
        img._customName = label || 'AI Image'
        fc.add(img)
        fc.setActiveObject(img)
        fc.requestRenderAll()
        return img
    } catch {
        return null
    }
}

/**
 * Add brand asset (image) to canvas
 */
export async function addBrandAssetToCanvas(fc, asset) {
    if (!fc || !asset) return null
    try {
        if (asset.type === 'image') {
            const img = await fabric.FabricImage.fromURL(getCorsUrl(asset.url), { crossOrigin: 'anonymous' })
            const maxDim = Math.min(fc.width, fc.height) * 0.3
            const scale = Math.min(maxDim / img.width, maxDim / img.height)
            img.set({ left: 100, top: 100, scaleX: scale, scaleY: scale })
            img._customName = asset.name
            fc.add(img)
            fc.setActiveObject(img)
        }
        fc.requestRenderAll()
        return true
    } catch {
        return false
    }
}

/**
 * Add color block to canvas
 */
export function addBrandColorBlock(fc, hex) {
    if (!fc) return null
    const rect = new fabric.Rect({
        left: 100, top: 100, width: 200, height: 200,
        fill: hex, rx: 12, ry: 12,
    })
    rect._customName = `Color: ${hex}`
    fc.add(rect)
    fc.setActiveObject(rect)
    fc.requestRenderAll()
    return rect
}

/**
 * Apply filter to image (selected or first on canvas)
 */
export function applyFilter(fc, filterId) {
    if (!fc) return false
    let target = fc.getActiveObject()
    if (!target || target.type !== 'image') {
        target = fc.getObjects().find(o => o.type === 'image')
    }
    if (!target || target.type !== 'image') return false

    target.filters = []

    switch (filterId) {
        case 'grayscale':
            target.filters.push(new fabric.filters.Grayscale())
            break
        case 'sepia':
            target.filters.push(new fabric.filters.Sepia())
            break
        case 'brightness':
            target.filters.push(new fabric.filters.Brightness({ brightness: 0.15 }))
            break
        case 'contrast':
            target.filters.push(new fabric.filters.Contrast({ contrast: 0.2 }))
            break
        case 'vintage':
            target.filters.push(new fabric.filters.Sepia())
            target.filters.push(new fabric.filters.Contrast({ contrast: 0.1 }))
            target.filters.push(new fabric.filters.Brightness({ brightness: -0.05 }))
            break
        case 'warm':
            target.filters.push(new fabric.filters.ColorMatrix({
                matrix: [1.2, 0, 0, 0, 0, 0, 1.05, 0, 0, 0, 0, 0, 0.9, 0, 0, 0, 0, 0, 1, 0]
            }))
            break
        case 'cool':
            target.filters.push(new fabric.filters.ColorMatrix({
                matrix: [0.9, 0, 0, 0, 0, 0, 1.0, 0, 0, 0, 0, 0, 1.2, 0, 0, 0, 0, 0, 1, 0]
            }))
            break
        case 'blur':
            target.filters.push(new fabric.filters.Blur({ blur: 0.08 }))
            break
        default:
            break
    }

    target.applyFilters()
    fc.requestRenderAll()
    return true
}

/**
 * Apply brightness/contrast adjustments to selected image
 */
export function applyAdjustments(fc, brightness, contrast) {
    if (!fc) return false
    let target = fc.getActiveObject()
    if (!target || target.type !== 'image') {
        target = fc.getObjects().find(o => o.type === 'image')
    }
    if (!target || target.type !== 'image') return false

    target.filters = []
    if (brightness !== 0) target.filters.push(new fabric.filters.Brightness({ brightness: brightness / 100 }))
    if (contrast !== 0) target.filters.push(new fabric.filters.Contrast({ contrast: contrast / 100 }))
    target.applyFilters()
    fc.requestRenderAll()
    return true
}

/**
 * Apply blur to selected image
 */
export function applyBlurToSelected(fc, blurIntensity) {
    if (!fc) return false
    const obj = fc.getActiveObject()
    if (!obj || obj.type !== 'image') return false

    obj.filters = obj.filters || []
    obj.filters = obj.filters.filter(f => !(f instanceof fabric.filters.Blur))
    if (blurIntensity > 0) {
        obj.filters.push(new fabric.filters.Blur({ blur: blurIntensity / 100 }))
    }
    obj.applyFilters()
    fc.requestRenderAll()
    return true
}

/**
 * Add Unsplash/Pixabay photo to canvas
 */
export async function addPhotoToCanvas(fc, photo) {
    if (!fc) return null
    try {
        const img = await fabric.FabricImage.fromURL(getCorsUrl(photo.small || photo.regular), { crossOrigin: 'anonymous' })
        const maxDim = Math.min(fc._logicalWidth || 1080, fc._logicalHeight || 1080) * 0.5
        const scale = Math.min(maxDim / img.width, maxDim / img.height)
        img.set({ left: 50, top: 50, scaleX: scale, scaleY: scale })
        img._customName = photo.alt || 'Photo'
        fc.add(img)
        fc.setActiveObject(img)
        fc.requestRenderAll()
        return img
    } catch {
        return null
    }
}

/**
 * Add texture overlay to canvas
 */
export async function addTextureToCanvas(fc, texture) {
    if (!fc) return null
    try {
        const img = await fabric.FabricImage.fromURL(getCorsUrl(texture.web || texture.large), { crossOrigin: 'anonymous' })
        const scaleX = fc.width / img.width
        const scaleY = fc.height / img.height
        const scale = Math.max(scaleX, scaleY)
        img.set({
            left: 0, top: 0,
            scaleX: scale, scaleY: scale,
            opacity: 0.4,
            selectable: true,
        })
        img._customName = texture.tags?.split(',')[0]?.trim() || 'Texture'
        fc.add(img)
        fc.setActiveObject(img)
        fc.requestRenderAll()
        return img
    } catch {
        return null
    }
}

/**
 * Get brand assets from brand data
 */
export function getBrandAssets(brand) {
    const assets = []
    const dna = brand?.dna || {}
    if (dna.logo?.url) {
        assets.push({ type: 'image', name: 'Brand Logo', url: dna.logo.url, icon: 'verified' })
    }
    if (dna.favicon) {
        assets.push({ type: 'image', name: 'Favicon', url: dna.favicon, icon: 'star' })
    }
    if (Array.isArray(dna.images)) {
        dna.images.slice(0, 20).forEach((img, i) => {
            const url = typeof img === 'string' ? img : img.url
            if (url) assets.push({ type: 'image', name: `Web Image ${i + 1}`, url, icon: 'image' })
        })
    }
    if (Array.isArray(brand?.brandImages)) {
        brand.brandImages.forEach((img, i) => {
            const url = typeof img === 'string' ? img : img.url
            if (url && !assets.some(a => a.url === url)) {
                assets.push({ type: 'image', name: img.name || `Brand Image ${i + 1}`, url, icon: 'image' })
            }
        })
    }
    if (Array.isArray(brand?.products)) {
        brand.products.slice(0, 10).forEach(p => {
            if (p.imageUrl) {
                assets.push({ type: 'image', name: p.name || 'Product', url: p.imageUrl, icon: 'shopping_bag' })
            }
        })
    }
    return assets
}

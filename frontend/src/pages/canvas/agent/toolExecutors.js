// ═══════════════════════════════════════════════════════════════
// toolExecutors.js — MCP Tool Call Executors for Fidato Agent
// Handles all canvas manipulation tool calls from the AI agent
// This is the MCP bridge between AI decisions and canvas actions
// ═══════════════════════════════════════════════════════════════

import * as fabric from 'fabric'
import { addShapeToCanvas } from '../tools/shapeTools'
import { PRESETS } from '../data/presets'
import { resizeToPreset } from '../engine/fabricEngine'
import { getCorsUrl, API_BASE, creatives as creativesAPI } from '../../../services/api'

// ── Position element by named position ──
export function positionElement(obj, position, fc) {
    const cw = fc.width, ch = fc.height
    const padding = 40
    const positions = {
        'center':        { left: cw / 2, top: ch / 2, originX: 'center', originY: 'center' },
        'top-center':    { left: cw / 2, top: padding, originX: 'center', originY: 'top' },
        'bottom-center': { left: cw / 2, top: ch - padding, originX: 'center', originY: 'bottom' },
        'top-left':      { left: padding, top: padding, originX: 'left', originY: 'top' },
        'top-right':     { left: cw - padding, top: padding, originX: 'right', originY: 'top' },
        'bottom-left':   { left: padding, top: ch - padding, originX: 'left', originY: 'bottom' },
        'bottom-right':  { left: cw - padding, top: ch - padding, originX: 'right', originY: 'bottom' },
    }
    const pos = positions[position] || positions['center']
    obj.set(pos)
}

// ── Find element by name or index ──
export function findElement(name, index, fc) {
    const objs = fc.getObjects().filter(o => o.id !== 'artboard')
    if (typeof index === 'number' && index >= 0 && index < objs.length) {
        return objs[objs.length - 1 - index] // layers are reversed (top-first)
    }
    if (name) {
        const lower = name.toLowerCase()
        return objs.find(o =>
            (o.customName || o._customName || '').toLowerCase().includes(lower) ||
            (o.id || '').toLowerCase().includes(lower) ||
            (o.type || '').toLowerCase().includes(lower)
        )
    }
    return null
}

/**
 * Execute a single tool call against the canvas
 * @param {Object} toolCall — { name, args }
 * @param {fabric.Canvas} fc — Fabric canvas instance
 * @param {Object} ctx — execution context (scenes, videos, voiceovers, music, referenceImages)
 * @param {Object} deps — dependencies { brand, canvasAssets, addImageUrlToCanvas, setBoardScenes, setStoryBrief, setCanvasView, setFidatoMessages }
 * @returns {string|Object} — result text or { text, thumbnail?, thumbnails? }
 */
export async function executeToolCall(toolCall, fc, ctx = {}, deps = {}) {
    const { name: rawName, args } = toolCall

    // ── Tool Name Aliasing ──────────────────────────────────────────────
    // Gemini fallback sometimes hallucinates tool names (e.g. "update_layer").
    // Map common hallucinated names to their real equivalents.
    const TOOL_ALIASES = {
        'modify_element': 'change_element_property',
        'resize_element': 'change_element_property',
        'scale_element': 'change_element_property',
        'position_element': 'move_element',
        'move_layer': 'move_element',
        'rearrange_layer': 'reorder_layer',
        'delete_element': 'remove_element',
        'create_text': 'add_text',
        'create_shape': 'add_shape',
        'create_image': 'generate_image',
        'replace_image': 'generate_image',
        'swap_image': 'generate_image',
        // NOTE: 'edit_image' is now a dedicated case — NOT aliased to generate_image
        'add_image': 'generate_image',
    }
    const name = TOOL_ALIASES[rawName] || rawName

    const { brand, canvasAssets, addImageUrlToCanvas, setBoardScenes, setStoryBrief, setCanvasView, setFidatoMessages } = deps
    const brandFont = brand?.dna?.fonts?.[0] || 'Inter'
    const brandColor = brand?.dna?.colors?.[0]?.hex || '#ffffff'
    const brandColor2 = brand?.dna?.colors?.[1]?.hex || brand?.dna?.colors?.[0]?.hex || '#6366f1'


    switch (name) {
        case 'add_text': {
            const text = args.text || 'Your text here'
            const isH = args.isHeading || false
            const textObj = new fabric.Textbox(text, {
                left: fc.width / 2, top: fc.height / 2,
                originX: 'center', originY: 'center',
                fontSize: args.fontSize || (isH ? 48 : 24),
                fontWeight: args.fontWeight || (isH ? '800' : '400'),
                fontFamily: args.fontFamily || brandFont,
                fill: args.color || brandColor,
                textAlign: 'center', width: fc.width * 0.6,
                editable: true,
                customName: isH ? 'Heading' : 'Text',
                id: `text-${Date.now()}`,
            })
            if (args.position) positionElement(textObj, args.position, fc)
            fc.add(textObj)
            fc.setActiveObject(textObj)
            return `Added text: "${text.substring(0, 30)}..."`
        }

        case 'add_shape': {
            const st = args.shapeType || 'shape-rect'
            const shape = addShapeToCanvas(fc, st, brandColor2)
            if (shape) {
                if (args.fillColor) shape.set('fill', args.fillColor)
                if (args.strokeColor) shape.set('stroke', args.strokeColor)
                if (args.opacity !== undefined) shape.set('opacity', args.opacity)
                if (args.width && args.height) {
                    const sx = args.width / (shape.width || 200)
                    const sy = args.height / (shape.height || 150)
                    shape.set({ scaleX: sx, scaleY: sy })
                }
                if (args.position) positionElement(shape, args.position, fc)
                fc.requestRenderAll()
            }
            return `Added ${st.replace('shape-', '')} shape`
        }

        case 'add_logo': {
            const logoUrl = brand?.dna?.logo?.url
            if (!logoUrl) return 'No brand logo available'
            try {
                const img = await fabric.FabricImage.fromURL(getCorsUrl(logoUrl), { crossOrigin: 'anonymous' })
                const scaleFactor = args.scale || 0.15
                const s = (fc.width * scaleFactor) / Math.max(img.width, img.height)
                img.set({ scaleX: s, scaleY: s, customName: 'Brand Logo', id: `logo-${Date.now()}` })
                positionElement(img, args.position || 'top-right', fc)
                fc.add(img)
                fc.setActiveObject(img)
                return 'Added brand logo'
            } catch { return 'Failed to load brand logo' }
        }

        case 'set_background': {
            const artboard = fc.getObjects().find(o => o.id === 'artboard')
            if (artboard) {
                artboard.set('fill', args.color)
            } else {
                fc.backgroundColor = args.color
            }
            fc.requestRenderAll()
            return `Background set to ${args.color}`
        }

        case 'change_element_property': {
            const el = findElement(args.elementName, args.elementIndex, fc)
            if (!el) return `Element "${args.elementName || args.elementIndex}" not found`
            const prop = args.property
            let val = args.value
            if (['fontSize', 'opacity', 'left', 'top', 'scaleX', 'scaleY', 'angle'].includes(prop)) {
                val = parseFloat(val)
            }
            el.set(prop, val)
            fc.requestRenderAll()
            return `Changed ${prop} of "${el.customName || el.type}" to ${args.value}`
        }

        case 'remove_element': {
            const el = findElement(args.elementName, args.elementIndex, fc)
            if (!el) return `Element not found`
            fc.remove(el)
            fc.requestRenderAll()
            return `Removed "${el.customName || el.type}"`
        }

        // ── Fuzzy Preset Normalizer Helper ──
        const normalizePresetId = (input) => {
            if (!input || typeof input !== 'string') return input
            const lower = input.toLowerCase().trim()
            if (PRESETS.some(p => p.id === lower)) return lower
            if (/facebook|fb/i.test(lower)) return /story/i.test(lower) ? 'fb-story' : 'fb-post'
            if (/instagram|ig|insta/i.test(lower)) {
                if (/story/i.test(lower)) return 'ig-story'
                if (/reel/i.test(lower)) return 'ig-reel'
                if (/square|1:1/i.test(lower)) return 'ig-post-square'
                return 'ig-post'
            }
            if (/youtube|yt/i.test(lower)) return 'yt-thumb'
            if (/linkedin/i.test(lower)) return 'linkedin'
            if (/twitter|x\b/i.test(lower)) return 'twitter'
            if (/whatsapp/i.test(lower)) return 'whatsapp-status'
            if (/pinterest/i.test(lower)) return 'pinterest'
            if (/banner/i.test(lower) && /square/i.test(lower)) return 'banner-square'
            if (/banner/i.test(lower)) return 'banner'
            if (/carousel/i.test(lower)) return 'carousel'
            return input
        }

        case 'set_canvas_size': {
            const normalizedId = normalizePresetId(args.preset)
            const preset = PRESETS.find(p => p.id === normalizedId)
            if (preset) {
                resizeToPreset(fc, preset)
                return `Canvas resized to ${preset.label} (${preset.w}×${preset.h})`
            }
            return `Preset "${args.preset}" not found`
        }

        case 'move_element': {
            const el = findElement(args.elementName, args.elementIndex, fc)
            if (!el) return `Element not found`
            positionElement(el, args.position, fc)
            fc.requestRenderAll()
            return `Moved "${el.customName || el.type}" to ${args.position}`
        }

        case 'reorder_layer': {
            const el = findElement(args.elementName, args.elementIndex, fc)
            if (!el) return `Element not found`
            switch (args.action) {
                case 'bring-front': fc.bringObjectToFront(el); break
                case 'send-back': fc.sendObjectToBack(el); break
                case 'bring-forward': fc.bringObjectForward(el); break
                case 'send-backward': fc.sendObjectBackward(el); break
            }
            const ab = fc.getObjects().find(o => o.id === 'artboard')
            if (ab) fc.sendObjectToBack(ab)
            fc.requestRenderAll()
            return `Layer reorder: ${args.action} on "${el.customName || el.type}"`
        }

        case 'edit_image': {
            // ⚡ Gemini native image editing — edits the existing image on canvas
            // vs generate_image which creates a brand new image
            if (setFidatoMessages) {
                setFidatoMessages(prev => [...prev, { role: 'assistant', content: `🎨 Editing image with Gemini: "${args.prompt?.substring(0, 50)}..."` }])
            }
            try {
                // Get the source image from canvas — selected image first, else full canvas
                let sourceImageUrl = null
                const activeObjs = fc.getActiveObjects?.()?.filter(o => o.type === 'image') || []
                if (activeObjs.length > 0) {
                    const obj = activeObjs[0]
                    const src = obj._element?.src || obj.getSrc?.() || ''
                    if (src && (src.startsWith('http') || src.startsWith('data:'))) {
                        sourceImageUrl = src
                    } else {
                        try { sourceImageUrl = obj.toDataURL({ format: 'png', quality: 0.92 }) } catch (_) {}
                    }
                }
                // Fall back to all-canvas snapshot
                if (!sourceImageUrl) {
                    const allImages = fc.getObjects().filter(o => o.type === 'image' && o.id !== 'artboard')
                    if (allImages.length > 0) {
                        const obj = allImages[allImages.length - 1]
                        const src = obj._element?.src || obj.getSrc?.() || ''
                        sourceImageUrl = (src && (src.startsWith('http') || src.startsWith('data:'))) ? src
                            : (() => { try { return obj.toDataURL({ format: 'png', quality: 0.9 }) } catch { return null } })()
                    }
                }
                if (!sourceImageUrl) {
                    // No image on canvas — fall through to generate_image
                    return await executeToolCall({ name: 'generate_image', args }, fc, ctx, deps)
                }

                const result = await creativesAPI.editImage({
                    imageUrl: sourceImageUrl,
                    editPrompt: args.prompt || args.editInstruction || 'Apply the requested edit',
                    editHistory: [],
                    brandId: brand?._id,
                })

                if (result?.success && result?.imageUrl) {
                    let newImg = null
                    if (addImageUrlToCanvas) newImg = await addImageUrlToCanvas(result.imageUrl, 'Gemini Edit')
                    if (args.position && newImg) {
                        positionElement(newImg, args.position, fc)
                        fc.requestRenderAll()
                    }
                    return { text: `Image edited: ${args.prompt?.substring(0, 40)}`, thumbnail: result.imageUrl }
                }
                throw new Error(result?.error || 'Edit returned no image')
            } catch (e) {
                // Graceful fallback to generation on edit failure
                console.warn('edit_image failed, falling back to generate_image:', e.message)
                return await executeToolCall({ name: 'generate_image', args }, fc, ctx, deps)
            }
        }

        case 'generate_image': {
            if (setFidatoMessages) {
                setFidatoMessages(prev => [...prev, { role: 'assistant', content: `🎨 Generating: "${args.prompt?.substring(0, 50)}..."` }])
            }
            try {
                // Auto-inject brand colors into prompt for visual consistency
                let enhancedPrompt = args.prompt || ''
                const brandColors = brand?.dna?.colors?.slice(0, 2).map(c => c.hex).filter(Boolean) || []
                if (brandColors.length > 0 && !enhancedPrompt.includes('#')) {
                    enhancedPrompt += `. Brand color accents: ${brandColors.join(' and ')} as ambient glow, lighting tones, or background elements. Professional 4K quality.`
                }

                const baseRefUrls = (ctx.referenceImages || []).slice(0, 3).map(r => r.url).filter(Boolean)
                const activeImages = fc.getActiveObjects?.()?.filter(o => o.type === 'image') || []
                const selectedImageSources = activeImages.map(obj => {
                    const src = obj._element?.src || obj.getSrc?.() || ''
                    if (src && (src.startsWith('http://') || src.startsWith('https://'))) return src
                    if (src && src.startsWith('data:')) return src
                    try { return obj.toDataURL({ format: 'png', quality: 0.9 }) } catch { return '' }
                }).filter(Boolean)
                
                const finalRefUrls = [...baseRefUrls, ...selectedImageSources].slice(0, 4)

                const data = await canvasAssets.aiGenerate({
                    prompt: enhancedPrompt,
                    size: args.size || '1024x1024',
                    brandId: brand?._id || undefined,
                    referenceImages: finalRefUrls.length > 0 ? finalRefUrls : undefined,
                })
                if (data.imageUrl) {
                    let newImg = null
                    if (addImageUrlToCanvas) newImg = await addImageUrlToCanvas(data.imageUrl, 'AI Generated')
                    if (args.position && newImg) {
                        positionElement(newImg, args.position, fc)
                        fc.requestRenderAll()
                    }
                    return { text: `Image generated and added`, thumbnail: data.imageUrl }
                }
            } catch (e) { return `Image generation failed: ${e.message}` }
            return 'Image generation failed'
        }

        case 'merge_images': {
            let activeObjs = fc.getActiveObjects?.()?.filter(o => o.type === 'image') || []
            
            // If not enough images selected, try to find them by passed names
            if (activeObjs.length < 2 && args.imageNames && args.imageNames.length > 0) {
                const allImages = fc.getObjects().filter(o => o.type === 'image' && o.id !== 'artboard')
                const namedImages = allImages.filter(img => 
                    args.imageNames.some(name => 
                        (img.customName || img._customName || '').toLowerCase().includes(name.toLowerCase()) ||
                        (img.id || '').toLowerCase().includes(name.toLowerCase())
                    )
                )
                if (namedImages.length >= 2) activeObjs = namedImages
                else if (namedImages.length > 0 && activeObjs.length > 0) {
                    activeObjs = [...new Set([...activeObjs, ...namedImages])]
                }
            }

            // Last resort: if still <2 and there are exactly 2 images on canvas, use them
            if (activeObjs.length < 2) {
                const allImages = fc.getObjects().filter(o => o.type === 'image' && o.id !== 'artboard')
                if (allImages.length >= 2) {
                    activeObjs = allImages.slice(0, 5) // Take up to 5 images
                }
            }
            
            if (activeObjs.length < 2) {
                const allImages = fc.getObjects().filter(o => o.type === 'image' && o.id !== 'artboard')
                return `Need at least 2 images to merge. Currently ${allImages.length} image(s) on canvas: ${allImages.map(i => `"${i.customName || i.id || i.type}"`).join(', ') || 'none'}. Ask the user to add more images.`
            }
            
            if (setFidatoMessages) {
                setFidatoMessages(prev => [...prev, { role: 'assistant', content: `🎨 Merging ${activeObjs.length} images: "${args.prompt?.substring(0, 50)}..."` }])
            }
            try {
                // Extract image source URLs — prefer S3/HTTP URLs, fall back to toDataURL
                const imageSources = activeObjs.map(obj => {
                    // Try to get the original source URL (S3 or HTTP)
                    const src = obj._element?.src || obj.getSrc?.() || ''
                    if (src && (src.startsWith('http://') || src.startsWith('https://'))) return src
                    if (src && src.startsWith('data:')) return src
                    // Fallback: render the object to a data URL
                    try { return obj.toDataURL({ format: 'png', quality: 0.9 }) } catch { return '' }
                }).filter(Boolean)

                if (imageSources.length < 2) return 'Could not read image data from canvas elements. Try re-uploading the images.'
                
                const mainImage = imageSources[0]
                const additionalImages = imageSources.slice(1)
                
                const data = await canvasAssets.aiEdit({
                    prompt: args.prompt || 'Combine these images into a single cohesive composition',
                    imageBase64: mainImage,
                    additionalImages: additionalImages
                })
                if (data.imageUrl) {
                    let newImg = null
                    if (addImageUrlToCanvas) newImg = await addImageUrlToCanvas(data.imageUrl, 'Merged Image')
                    if (args.position && newImg) {
                        positionElement(newImg, args.position, fc)
                        fc.requestRenderAll()
                    }
                    return { text: `Images successfully merged`, thumbnail: data.imageUrl }
                }
            } catch (e) { return `Image merge failed: ${e.message}` }
            return 'Image merge failed'
        }

        case 'create_script_block': {
            const { title, scenes } = args
            const cardW = 320, gap = 12, startX = 60
            let curY = 80

            const titleText = new fabric.Textbox(`📝 ${title || 'Script'}`, {
                left: startX, top: curY, width: cardW,
                fontSize: 22, fontWeight: '800', fontFamily: 'Inter',
                fill: '#a78bfa',
                customName: `Script: ${title}`, id: `script-title-${Date.now()}`,
                _nodeType: 'script',
            })
            fc.add(titleText)
            curY += 44

            for (const scene of (scenes || [])) {
                const cardH = 100
                const bg = new fabric.Rect({
                    left: startX, top: curY, width: cardW, height: cardH,
                    rx: 12, ry: 12,
                    fill: 'rgba(99,102,241,0.08)',
                    stroke: 'rgba(99,102,241,0.2)', strokeWidth: 1,
                    selectable: false, evented: false,
                    id: `scene-bg-${scene.sceneNumber}-${Date.now()}`, _nodeType: 'script',
                })
                const sceneHead = new fabric.Textbox(
                    `Scene ${scene.sceneNumber}${scene.duration ? ` • ${scene.duration}` : ''}${scene.mood ? ` • ${scene.mood}` : ''}`, {
                    left: startX + 14, top: curY + 10, width: cardW - 28,
                    fontSize: 12, fontWeight: '700', fontFamily: 'Inter', fill: '#818cf8',
                    selectable: false, evented: false,
                    id: `scene-head-${scene.sceneNumber}-${Date.now()}`, _nodeType: 'script',
                })
                const visual = new fabric.Textbox(`🎬 ${scene.visualDescription}`, {
                    left: startX + 14, top: curY + 28, width: cardW - 28,
                    fontSize: 11, fontFamily: 'Inter', fill: '#94a3b8',
                    selectable: false, evented: false,
                    id: `scene-vis-${scene.sceneNumber}-${Date.now()}`, _nodeType: 'script',
                })
                const vo = new fabric.Textbox(`🎙 "${scene.voiceover}"`, {
                    left: startX + 14, top: curY + 58, width: cardW - 28,
                    fontSize: 11, fontFamily: 'Inter', fontStyle: 'italic', fill: '#64748b',
                    selectable: false, evented: false,
                    id: `scene-vo-${scene.sceneNumber}-${Date.now()}`, _nodeType: 'script',
                })
                fc.add(bg, sceneHead, visual, vo)
                curY += cardH + gap
            }

            fc.requestRenderAll()
            return `Script "${title}" created with ${(scenes || []).length} scenes`
        }

        case 'create_storyboard_frames': {
            const { title, frames, generateImages } = args
            const numFrames = (frames || []).length
            const shouldGenerate = generateImages !== false

            const newScenes = (frames || []).map((frame, i) => ({
                id: `scene-${Date.now()}-${i}`,
                imageUrl: '',
                caption: frame.caption || `Scene ${frame.frameNumber || i + 1}`,
                shotType: '',
                shotDescription: frame.imagePrompt,
                duration: 5,
                _generating: shouldGenerate,
            }))

            if (setBoardScenes) setBoardScenes(prev => [...prev, ...newScenes])
            if (setStoryBrief) setStoryBrief({ title: title || 'Storyboard', frames: numFrames })
            if (setCanvasView) setCanvasView('board')

            if (shouldGenerate && canvasAssets) {
                const generatedThumbs = new Array(numFrames).fill(null)
                ctx.scenes = new Array(numFrames).fill({})

                // Build brand color + consistency anchor for all frames
                const brandColors = brand?.dna?.colors?.slice(0, 2).map(c => c.hex).filter(Boolean) || []
                const colorAnchor = brandColors.length > 0
                    ? `. Color palette: ${brandColors.join(' and ')} as ambient accents. Consistent color grading across all frames.`
                    : '. Professional 4K quality.'

                await Promise.all(newScenes.map(async (scene, i) => {
                    try {
                        // Inject brand colors into storyboard prompt if not already present
                        let framePrompt = frames[i].imagePrompt || ''
                        if (!framePrompt.includes('#') && brandColors.length > 0) {
                            framePrompt += colorAnchor
                        }

                        const refUrls = (ctx.referenceImages || []).slice(0, 3).map(r => r.url).filter(Boolean)
                        const data = await canvasAssets.aiGenerate({
                            prompt: framePrompt,
                            size: '512x512',
                            referenceImages: refUrls.length > 0 ? refUrls : undefined,
                        })
                        if (data.imageUrl) {
                            if (setBoardScenes) {
                                setBoardScenes(prev => prev.map(s =>
                                    s.id === scene.id ? { ...s, imageUrl: data.imageUrl, _generating: false } : s
                                ))
                            }
                            generatedThumbs[i] = data.imageUrl
                            if (ctx.scenes) ctx.scenes[i] = { imageUrl: data.imageUrl }
                        }
                    } catch (e) {
                        console.warn(`Frame ${i + 1} gen failed:`, e.message)
                        if (setBoardScenes) {
                            setBoardScenes(prev => prev.map(s =>
                                s.id === scene.id ? { ...s, _generating: false } : s
                            ))
                        }
                    }
                }))
                return { text: `Storyboard "${title}" created with ${numFrames} scenes.`, thumbnails: generatedThumbs.filter(Boolean) }
            }

            return `Storyboard "${title}" created on the Board View with ${numFrames} scenes.`
        }

        case 'create_character_profile': {
            const { characterName, physicalDescription, wardrobe, styleKeywords, referenceImagePrompt } = args
            const cardW = 300, cardH = 200, x = 60, y = 80

            const bg = new fabric.Rect({
                left: x, top: y, width: cardW, height: cardH,
                rx: 14, ry: 14,
                fill: 'rgba(236,72,153,0.06)',
                stroke: 'rgba(236,72,153,0.25)', strokeWidth: 1,
                shadow: new fabric.Shadow({ color: 'rgba(236,72,153,0.15)', blur: 16, offsetY: 4 }),
                selectable: false, evented: false,
                id: `char-bg-${Date.now()}`, _nodeType: 'character',
            })
            fc.add(bg)

            const header = new fabric.Textbox(`👤 ${characterName}`, {
                left: x + 14, top: y + 12, width: cardW - 28,
                fontSize: 16, fontWeight: '800', fontFamily: 'Inter', fill: '#f472b6',
                selectable: false, evented: false,
                id: `char-name-${Date.now()}`, _nodeType: 'character',
            })
            fc.add(header)

            const desc = new fabric.Textbox(physicalDescription, {
                left: x + 14, top: y + 36, width: cardW - 28,
                fontSize: 11, fontFamily: 'Inter', fill: '#94a3b8',
                selectable: false, evented: false,
                id: `char-desc-${Date.now()}`, _nodeType: 'character',
            })
            fc.add(desc)

            if (wardrobe) {
                fc.add(new fabric.Textbox(`👗 ${wardrobe}`, {
                    left: x + 14, top: y + 90, width: cardW - 28,
                    fontSize: 10, fontFamily: 'Inter', fontStyle: 'italic', fill: '#64748b',
                    selectable: false, evented: false,
                    id: `char-ward-${Date.now()}`, _nodeType: 'character',
                }))
            }

            if (styleKeywords?.length) {
                fc.add(new fabric.Textbox(`🏷️ ${styleKeywords.join(' • ')}`, {
                    left: x + 14, top: y + cardH - 30, width: cardW - 28,
                    fontSize: 9, fontFamily: 'Inter', fill: '#475569',
                    selectable: false, evented: false,
                    id: `char-tags-${Date.now()}`, _nodeType: 'character',
                }))
            }

            let generatedThumbUrl = null
            if (referenceImagePrompt && canvasAssets) {
                if (setFidatoMessages) {
                    setFidatoMessages(prev => [...prev, { role: 'assistant', content: `🖼️ Generating reference portrait for ${characterName}...` }])
                }
                    try {
                        const data = await canvasAssets.aiGenerate({ prompt: referenceImagePrompt, size: '512x512' })
                        if (data.imageUrl) {
                            generatedThumbUrl = data.imageUrl
                            const img = await fabric.FabricImage.fromURL(getCorsUrl(data.imageUrl), { crossOrigin: 'anonymous' })
                        const imgSize = 120
                        const imgScale = imgSize / Math.max(img.width, img.height)
                        img.set({
                            left: x + cardW + 20, top: y,
                            scaleX: imgScale, scaleY: imgScale,
                            customName: `${characterName} - Reference`,
                            id: `char-ref-img-${Date.now()}`, _nodeType: 'character',
                        })
                        fc.add(img)
                    }
                } catch (e) { console.warn('Character ref image failed:', e) }
            }

            fc.requestRenderAll()
            return { text: `Character profile "${characterName}" created`, thumbnail: generatedThumbUrl || undefined }
        }

        case 'auto_layout_grid': {
            const { columns, gap: gridGap, cardWidth, cardHeight, includeTypes, startX: gStartX, startY: gStartY } = args

            const existingFrames = fc.getObjects().filter(o => o.id?.startsWith('auto-frame-'))
            existingFrames.forEach(f => fc.remove(f))

            const allObjects = fc.getObjects().filter(o => o.id !== 'artboard' && !o.id?.startsWith('auto-frame-'))
            let targets = allObjects
            if (includeTypes?.length && !includeTypes.includes('all')) {
                targets = allObjects.filter(o => includeTypes.includes(o._nodeType))
            }
            if (targets.length === 0) return 'No elements to arrange'

            const cols = columns || Math.min(4, Math.ceil(Math.sqrt(targets.length)))
            const gapPx = gridGap || 20
            const cW = cardWidth || 240
            const cH = cardHeight || 240
            const sX = gStartX || 60
            const sY = gStartY || 80

            let maxX = sX, maxY = sY
            targets.forEach((obj, i) => {
                const col = i % cols
                const row = Math.floor(i / cols)
                const targetX = sX + col * (cW + gapPx)
                const targetY = sY + row * (cH + gapPx)
                const objW = (obj.width || 100) * (obj.scaleX || 1)
                const objH = (obj.height || 100) * (obj.scaleY || 1)
                if (objW > cW || objH > cH) {
                    const fitScale = Math.min(cW / objW, cH / objH) * 0.9
                    obj.set({ scaleX: (obj.scaleX || 1) * fitScale, scaleY: (obj.scaleY || 1) * fitScale })
                }
                obj.set({ left: targetX, top: targetY })
                obj.setCoords()
                const curW = (obj.width || 100) * (obj.scaleX || 1)
                const curH = (obj.height || 100) * (obj.scaleY || 1)
                if (targetX + curW > maxX) maxX = targetX + curW
                if (targetY + curH > maxY) maxY = targetY + curH
            })

            const framePadding = 48
            const frameBg = new fabric.Rect({
                left: sX - framePadding, top: sY - framePadding,
                width: (maxX - sX) + (framePadding * 2), height: (maxY - sY) + (framePadding * 2),
                fill: 'rgba(255,255,255,0.02)', stroke: 'rgba(255,255,255,0.15)',
                strokeWidth: 1, rx: 24, ry: 24, strokeDashArray: [8, 8],
                selectable: false, evented: false, id: `auto-frame-bg-${Date.now()}`
            })
            const frameLabel = new fabric.Textbox('✦ Generated Content /', {
                left: sX - framePadding + 16, top: sY - framePadding - 28,
                fontSize: 12, fontWeight: '700', fontFamily: 'Inter', fill: '#a1a1aa',
                selectable: false, evented: false, id: `auto-frame-label-${Date.now()}`
            })
            fc.add(frameBg, frameLabel)
            fc.sendObjectToBack(frameLabel)
            fc.sendObjectToBack(frameBg)
            const ab = fc.getObjects().find(o => o.id === 'artboard')
            if (ab) fc.sendObjectToBack(ab)
            fc.requestRenderAll()
            return `Auto-arranged ${targets.length} elements into a ${cols}-column grouped frame`
        }

        case 'adapt_design': {
            const { presets: targetPresets = [] } = args
            const brand = deps?.brand || null

            if (!targetPresets || targetPresets.length === 0) {
                return 'Please specify which platform sizes to adapt to (e.g. ig-post, linkedin, yt-thumb)'
            }

            const PRESET_MAP = {
                'ig-post':         { w: 1080, h: 1350, label: 'Instagram Post (4:5)' },
                'ig-post-square':  { w: 1080, h: 1080, label: 'Instagram Square (1:1)' },
                'ig-story':        { w: 1080, h: 1920, label: 'Instagram Story (9:16)' },
                'ig-reel':         { w: 1080, h: 1920, label: 'Instagram Reel (9:16)' },
                'fb-post':         { w: 1200, h: 630,  label: 'Facebook Post (1.91:1)' },
                'fb-story':        { w: 1080, h: 1920, label: 'Facebook Story (9:16)' },
                'linkedin':        { w: 1200, h: 628,  label: 'LinkedIn (1.91:1)' },
                'yt-thumb':        { w: 1280, h: 720,  label: 'YouTube Thumbnail (16:9)' },
                'twitter':         { w: 1600, h: 900,  label: 'Twitter/X (16:9)' },
                'whatsapp-status': { w: 1080, h: 1920, label: 'WhatsApp Status (9:16)' },
                'pinterest':       { w: 1000, h: 1500, label: 'Pinterest Pin (2:3)' },
                'banner':          { w: 1920, h: 600,  label: 'Web Banner' },
            }

            const validPresets = targetPresets.filter(p => PRESET_MAP[p])
            if (validPresets.length === 0) {
                return `\u274c Unknown presets: ${targetPresets.join(', ')}. Valid: ${Object.keys(PRESET_MAP).join(', ')}`
            }

            // ── Step 1: Get source image URL directly from canvas objects ──
            // No toDataURL(), no base64. Canvas images already have S3/HTTP source URLs.
            const allObjects = fc.getObjects()
            let sourceImageUrl = null

            // Priority 1: FabricImage objects (getSrc() returns the original URL)
            for (const obj of allObjects) {
                if (obj._nodeType === 'artboard' || obj._nodeType === 'artboard-label') continue
                const type = obj.type || ''
                if (type === 'image' || type === 'Image' || obj instanceof fabric.FabricImage) {
                    // getSrc() on Fabric v7 FabricImage returns the source URL
                    const src = typeof obj.getSrc === 'function' ? obj.getSrc() : obj._element?.src || obj.src || ''
                    if (src && src.startsWith('http') && !src.startsWith('data:')) {
                        sourceImageUrl = src
                        console.log('[adapt_design] Found S3/HTTP image source:', src.substring(0, 80))
                        break
                    }
                }
            }

            // Priority 2: Any object with a stored _originalSrc or _src
            if (!sourceImageUrl) {
                for (const obj of allObjects) {
                    const s = obj._originalSrc || obj._src || obj._imageUrl || obj.imageUrl || ''
                    if (s && s.startsWith('http')) { sourceImageUrl = s; break }
                }
            }

            if (!sourceImageUrl) {
                return '\u274c No image found on canvas with a direct S3/HTTP URL. Please add an image to the canvas before adapting.\n\nTip: Upload your creative image to the canvas first, then ask Fidato to adapt it.'
            }

            console.log('[adapt_design] Source URL for NanoBanana 2:', sourceImageUrl.substring(0, 100))

            if (setFidatoMessages) {
                setFidatoMessages(prev => [...prev, {
                    role: 'assistant',
                    content: `\ud83c\udfa8 **Smart Adapt (NanoBanana 2)** \u2014 Using your image directly from S3, generating AI-adapted versions for ${validPresets.length} platform(s):\n${validPresets.map(p => `\u2022 ${PRESET_MAP[p].label}`).join('\n')}\n\n\u23f3 Generating... (~20-40s per platform, zero base64)`
                }])
            }

            // ── Step 2: Artboard layout anchors ──
            const artboard = allObjects.find(o => o.id === 'artboard')
            const sourceWidth  = artboard ? Math.round(artboard.width  * (artboard.scaleX || 1)) : fc._logicalWidth  || 1080
            const sourceHeight = artboard ? Math.round(artboard.height * (artboard.scaleY || 1)) : fc._logicalHeight || 1080
            const srcLeft = artboard ? (artboard.left - sourceWidth  / 2) : 0
            const srcTop  = artboard ? (artboard.top  - sourceHeight / 2) : 0

            // ── Step 3: For each preset, call NanoBanana 2 with the S3 URL directly ──
            const { canvasAssets: canvasAssetsApi } = await import('../../../services/api')

            const ARTBOARD_GAP = 80
            let xOffset = srcLeft + sourceWidth + ARTBOARD_GAP
            let rendered = 0
            const results = []

            for (const presetId of validPresets) {
                const spec = PRESET_MAP[presetId]

                if (setFidatoMessages) {
                    setFidatoMessages(prev => {
                        const last = prev[prev.length - 1]
                        if (last?.role === 'assistant' && last.content.includes('NanoBanana')) {
                            return [...prev.slice(0, -1), {
                                ...last,
                                content: last.content.split('\n\u23f3')[0] + `\n\n\u23f3 Generating **${spec.label}**... (${rendered}/${validPresets.length} done)`
                            }]
                        }
                        return prev
                    })
                }

                try {
                    console.log(`[adapt_design] Calling aiAdapt for ${presetId} with S3 URL`)
                    const adaptResult = await canvasAssetsApi.aiAdapt({
                        canvasImageUrl: sourceImageUrl,  // Direct S3/HTTP URL — zero base64
                        preset: presetId,
                        brandContext: brand ? { name: brand.name, dna: brand.dna } : null,
                    })

                    if (!adaptResult?.success || !adaptResult?.imageUrl) {
                        const errMsg = adaptResult?.error || 'No image returned'
                        console.error(`[adapt_design] ${presetId} failed:`, errMsg)
                        results.push({ presetId, success: false, error: errMsg })
                        continue
                    }

                    const aiImageUrl = adaptResult.imageUrl  // S3 URL from backend
                    const targetW = spec.w, targetH = spec.h

                    console.log(`[adapt_design] ${presetId} \u2713 got S3 result:`, aiImageUrl.substring(0, 80))

                    // Artboard rect
                    const artboardRect = new fabric.Rect({
                        left: xOffset + targetW / 2, top: srcTop + targetH / 2,
                        width: targetW, height: targetH,
                        originX: 'center', originY: 'center',
                        fill: '#ffffff', stroke: 'rgba(99,102,241,0.45)', strokeWidth: 2,
                        rx: 6, ry: 6, selectable: false, evented: false,
                        id: `artboard-${presetId}`, _nodeType: 'artboard',
                        shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.18)', blur: 28, offsetY: 10 }),
                    })
                    fc.add(artboardRect)
                    fc.sendObjectToBack(artboardRect)

                    // Label
                    fc.add(new fabric.Textbox(`${spec.label}\n${targetW}\u00d7${targetH}`, {
                        left: xOffset, top: srcTop - 56, width: targetW,
                        fontSize: 13, fontWeight: '700', fontFamily: 'Inter',
                        fill: '#818cf8', textAlign: 'center', selectable: false, evented: false,
                        id: `artboard-label-${presetId}`, _nodeType: 'artboard-label',
                    }))

                    // Load and place the AI-generated image (S3 URL)
                    const adaptedImg = await fabric.FabricImage.fromURL(aiImageUrl, { crossOrigin: 'anonymous' })
                    const scaleX = targetW / (adaptedImg.width  || 1)
                    const scaleY = targetH / (adaptedImg.height || 1)
                    adaptedImg.set({
                        left: xOffset + targetW / 2, top: srcTop + targetH / 2,
                        originX: 'center', originY: 'center',
                        scaleX, scaleY,
                        id: `ai-adapted-${presetId}`,
                        _nodeType: 'ai-adapted',
                        _preset: presetId,
                        clipPath: new fabric.Rect({
                            left: xOffset, top: srcTop, width: targetW, height: targetH,
                            absolutePositioned: true,
                        }),
                    })
                    fc.add(adaptedImg)

                    rendered++
                    results.push({ presetId, success: true })
                    xOffset += targetW + ARTBOARD_GAP
                    fc.requestRenderAll()

                } catch (presetErr) {
                    console.error(`[adapt_design] ${presetId} exception:`, presetErr.message)
                    results.push({ presetId, success: false, error: presetErr.message })
                }
            }

            fc.requestRenderAll()

            // Auto zoom-to-fit all artboards
            try {
                const canvasW = fc.width || 900, canvasH = fc.height || 600
                const PADDING = 60
                const totalW = xOffset - srcLeft
                const totalH = Math.max(sourceHeight, ...validPresets.map(p => PRESET_MAP[p].h))
                const newZoom = Math.min((canvasW - PADDING) / totalW, (canvasH - PADDING) / totalH, 0.5)
                fc.setViewportTransform([newZoom, 0, 0, newZoom,
                    -srcLeft * newZoom + PADDING / 2,
                    -srcTop  * newZoom + PADDING / 2])
                fc.requestRenderAll()
            } catch (vpErr) {
                console.warn('[adapt_design] zoom-to-fit failed:', vpErr.message)
            }

            const successList = results.filter(r => r.success).map(r => `\u2022 ${PRESET_MAP[r.presetId].label}`).join('\n')
            const failList    = results.filter(r => !r.success).map(r => `\u2022 ${r.presetId}: ${r.error}`).join('\n')

            if (setFidatoMessages) {
                setFidatoMessages(prev => [...prev, {
                    role: 'assistant',
                    content: `\u2705 **NanoBanana 2 Adapt Complete!** ${rendered}/${validPresets.length} platform variants generated.\n\n${successList}${failList ? `\n\n\u26a0\ufe0f Failed:\n${failList}` : ''}\n\nAll variants were AI-regenerated from your original S3 image \u2014 no base64, no canvas screenshot.`
                }])
            }

            return { text: `NanoBanana 2 Adapt complete \u2014 ${rendered} AI-generated platform variants created`, presetsRendered: rendered }
        }

                case 'generate_video_clip': {

            let { prompt, duration, aspectRatio, sourceImageUrl, sceneRef, model, resolution } = args
            
            // Extract image and prompt from scene if omitted
            if (sceneRef && ctx.scenes && ctx.scenes[sceneRef - 1]) {
                const scene = ctx.scenes[sceneRef - 1]
                if (!sourceImageUrl && scene.imageUrl) sourceImageUrl = scene.imageUrl
                if (!prompt || !prompt.trim()) prompt = scene.visual || scene.script || ''
            }
            
            // Backend validation requires a prompt string
            if (!prompt || !prompt.trim()) {
                prompt = sourceImageUrl ? 'Cinematic subtle motion animation, 4k resolution' : 'A cinematic 4k video scene'
            }

            let selectedModel = model || 'grok-imagine'
            if (selectedModel === 'grok') selectedModel = 'grok-imagine'
            const selectedRes = resolution || '1080p'

            if (setFidatoMessages) {
                setFidatoMessages(prev => [...prev, {
                    role: 'assistant',
                    content: `🎬 Generating video with **${selectedModel.toUpperCase()}** at ${selectedRes}...\nPrompt: "${prompt.substring(0, 60)}${prompt.length > 60 ? '...' : ''}"\n⏳ This usually takes 1-3 minutes. I'll notify you when ready!`
                }])
            }

            try {
                const data = await canvasAssets.generateVideo({
                    prompt, duration: duration || 5,
                    aspectRatio: aspectRatio || '16:9',
                    sourceImageUrl: sourceImageUrl || '',
                    model: selectedModel,
                    resolution: selectedRes,
                })

                if (data.success && data.taskId) {
                    if (!ctx.videos) ctx.videos = {}
                    ctx.videos[data.taskId] = { status: 'pending', url: null, model: selectedModel }

                    // ── Placeholder card on canvas ──
                    const cardW = 340, cardH = 220
                    const allObjs = fc.getObjects()
                    const videoObjs = allObjs.filter(o => o._nodeType === 'video')
                    const x = 60 + (videoObjs.length % 4) * (cardW + 20)
                    const y = 80 + Math.floor(videoObjs.length / 4) * (cardH + 20)

                    const placeholderBg = new fabric.Rect({
                        left: x, top: y, width: cardW, height: cardH, rx: 14, ry: 14,
                        fill: 'rgba(6,182,212,0.06)', stroke: 'rgba(6,182,212,0.25)', strokeWidth: 1.5,
                        shadow: new fabric.Shadow({ color: 'rgba(6,182,212,0.12)', blur: 20, offsetY: 6 }),
                        selectable: true, evented: true,
                        id: `video-bg-${data.taskId}`, _nodeType: 'video',
                        _taskId: data.taskId, _provider: selectedModel, _aspectRatio: aspectRatio || '16:9',
                    })

                    // Play icon in center
                    const playIcon = new fabric.Text('▶', {
                        left: x + cardW / 2, top: y + cardH / 2 - 20,
                        fontSize: 32, fill: 'rgba(34,211,238,0.4)',
                        originX: 'center', originY: 'center',
                        selectable: false, evented: false,
                        id: `video-play-${data.taskId}`, _nodeType: 'video',
                    })

                    const statusLabel = new fabric.Textbox(
                        `⏳ Rendering with ${selectedModel.toUpperCase()}\nScene ${sceneRef || 1} • ${duration || 5}s • ${selectedRes}`, {
                        left: x + 12, top: y + cardH - 50, width: cardW - 24,
                        fontSize: 10, fontWeight: '600', fontFamily: 'Inter',
                        fill: '#22d3ee', textAlign: 'center', lineHeight: 1.5,
                        selectable: false, evented: false,
                        id: `video-label-${data.taskId}`, _nodeType: 'video', _taskId: data.taskId,
                    })

                    fc.add(placeholderBg)
                    fc.add(playIcon)
                    fc.add(statusLabel)
                    fc.requestRenderAll()

                    // ── Background polling — auto-update canvas when video is ready ──
                    const { API_BASE } = await import('../../../services/api')
                    const token = localStorage.getItem('mantram_token') || ''

                    const pollVideo = async () => {
                        let retries = 72 // ~6 minutes max (every 5s)
                        while (retries > 0) {
                            await new Promise(r => setTimeout(r, 5000))
                            retries--
                            try {
                                const resp = await fetch(`${API_BASE}/video-studio/${data.taskId}/status`, {
                                    headers: { Authorization: `Bearer ${token}` }
                                })
                                if (!resp.ok) continue
                                const statusData = await resp.json()

                                if (statusData.status === 'COMPLETED' || statusData.status === 'FAILED') {
                                    const videoUrl = statusData.generation?.videoUrl || statusData.videoUrl || null
                                    ctx.videos[data.taskId].status = statusData.status
                                    ctx.videos[data.taskId].url = videoUrl

                                    if (statusData.status === 'COMPLETED' && videoUrl) {
                                        // ── Update canvas: replace status label with a completed video card ──
                                        const currentFc = fc
                                        const bgObj = currentFc.getObjects().find(o => o.id === `video-bg-${data.taskId}`)
                                        const labelObj = currentFc.getObjects().find(o => o.id === `video-label-${data.taskId}`)
                                        const playObj = currentFc.getObjects().find(o => o.id === `video-play-${data.taskId}`)

                                        // Update background to completed style
                                        if (bgObj) {
                                            bgObj.set({
                                                fill: 'rgba(16,185,129,0.06)',
                                                stroke: 'rgba(16,185,129,0.3)',
                                                _videoUrl: videoUrl,
                                            })
                                        }
                                        if (playObj) playObj.set({ fill: 'rgba(16,185,129,0.7)' })

                                        // Update label to show done state + download hint
                                        if (labelObj) {
                                            labelObj.set({
                                                text: `✅ Video Ready — ${selectedModel.toUpperCase()}\nScene ${sceneRef || 1} • ${duration || 5}s • Click to open`,
                                                fill: '#34d399',
                                            })
                                        }

                                        // Add video URL as a hidden attribute to bg for future use
                                        if (bgObj) bgObj._videoUrl = videoUrl

                                        // Load thumbnail via first-frame if source image available
                                        if (sourceImageUrl) {
                                            fabric.Image.fromURL(sourceImageUrl, img => {
                                                if (!img || !bgObj) return
                                                const scaleX = cardW / (img.width || 1)
                                                const scaleY = (cardH - 50) / (img.height || 1)
                                                const scale = Math.min(scaleX, scaleY)
                                                img.set({
                                                    left: bgObj.left + cardW / 2,
                                                    top: bgObj.top + (cardH - 50) / 2,
                                                    originX: 'center', originY: 'center',
                                                    scaleX: scale, scaleY: scale,
                                                    selectable: false, evented: false,
                                                    opacity: 0.65,
                                                    id: `video-thumb-${data.taskId}`, _nodeType: 'video',
                                                })
                                                currentFc.insertAt(img, currentFc.getObjects().indexOf(bgObj) + 1, false)
                                                currentFc.requestRenderAll()
                                            }, { crossOrigin: 'anonymous' })
                                        }

                                        currentFc.requestRenderAll()

                                        // ── Push to Board Scenes for Board View ──
                                        if (deps?.setBoardScenes) {
                                            deps.setBoardScenes(prev => [
                                                ...prev,
                                                {
                                                    type: 'video',
                                                    id: data.taskId,
                                                    videoUrl,
                                                    thumbnail: sourceImageUrl || null,
                                                    prompt: prompt.substring(0, 80),
                                                    model: selectedModel,
                                                    duration: duration || 5,
                                                    sceneRef: sceneRef || null,
                                                    status: 'done',
                                                }
                                            ])
                                        }

                                        // ── Notify in Fidato chat ──
                                        if (setFidatoMessages) {
                                            setFidatoMessages(prev => [...prev, {
                                                role: 'assistant',
                                                content: `✅ **Video Ready!** Scene ${sceneRef || 1} generated with ${selectedModel.toUpperCase()}.\n\n[▶ Open Video](${videoUrl})\n\nThe video card on canvas has been updated. You can right-click it to download.`,
                                                images: [{ url: sourceImageUrl || videoUrl, isVideo: true, videoUrl }]
                                            }])
                                        }
                                    } else if (statusData.status === 'FAILED') {
                                        const labelObj2 = fc.getObjects().find(o => o.id === `video-label-${data.taskId}`)
                                        if (labelObj2) labelObj2.set({ text: `❌ Video generation failed\nTry again with a different prompt`, fill: '#f87171' })
                                        fc.requestRenderAll()
                                        if (setFidatoMessages) {
                                            setFidatoMessages(prev => [...prev, {
                                                role: 'assistant',
                                                content: `❌ Video for Scene ${sceneRef || 1} failed to generate. Would you like me to retry with a different prompt or model?`
                                            }])
                                        }
                                    }
                                    break // Exit polling loop
                                }
                            } catch (e) { console.warn('[Video Poll]', e.message) }
                        }
                        if (retries === 0) {
                            const labelObj = fc.getObjects().find(o => o.id === `video-label-${data.taskId}`)
                            if (labelObj) labelObj.set({ text: `⏰ Video timed out — please check later`, fill: '#f59e0b' })
                            fc.requestRenderAll()
                        }
                    }

                    pollVideo() // Run in background, don't await
                    return { text: `🎬 Video generation started with **${selectedModel.toUpperCase()}**. A placeholder has been added to your canvas. I'll notify you when it's ready (usually 1-3 minutes).`, thumbnail: sourceImageUrl || null }
                }
                return `Video generation started. ${data.message || ''}`
            } catch (e) { return `Video generation failed: ${e.message}` }
        }


        case 'generate_voiceover': {
            const { text, language, speaker, speed, sceneRef } = args
            if (setFidatoMessages) {
                setFidatoMessages(prev => [...prev, { role: 'assistant', content: `🎙 Generating voiceover (${speaker || 'anushka'})...` }])
            }
            try {
                const data = await canvasAssets.generateVoiceover({
                    text, language: language || 'en-IN',
                    speaker: speaker || 'anushka', speed: speed || 1.0,
                })
                if (data.success && data.audioUrl) {
                    if (!ctx.voiceovers) ctx.voiceovers = []
                    ctx.voiceovers.push(data.audioUrl)
                    // Audio node on canvas
                    const cardW = 280, cardH = 80, x = 60, y = 80
                    fc.add(new fabric.Rect({
                        left: x, top: y, width: cardW, height: cardH, rx: 10, ry: 10,
                        fill: 'rgba(255, 77, 0,0.08)', stroke: 'rgba(255, 77, 0,0.25)', strokeWidth: 1,
                        selectable: true, evented: true,
                        id: `vo-bg-${Date.now()}`, _nodeType: 'voiceover', _audioUrl: data.audioUrl,
                    }))
                    fc.add(new fabric.Textbox(`🎙 Voiceover${sceneRef ? ` • Scene ${sceneRef}` : ''}\n${text.substring(0, 60)}...`, {
                        left: x + 10, top: y + 10, width: cardW - 20,
                        fontSize: 11, fontFamily: 'Inter', fill: '#a78bfa',
                        selectable: false, evented: false,
                        id: `vo-label-${Date.now()}`, _nodeType: 'voiceover',
                    }))
                    fc.add(new fabric.Textbox(`~${data.duration}s • ${data.provider}`, {
                        left: x + 10, top: y + cardH - 20, width: cardW - 20,
                        fontSize: 9, fontFamily: 'Inter', fill: '#7c3aed',
                        selectable: false, evented: false,
                        id: `vo-dur-${Date.now()}`, _nodeType: 'voiceover',
                    }))
                    fc.requestRenderAll()
                    return `Voiceover generated (${data.duration}s) — ${data.audioUrl}`
                }
                return 'Voiceover generation failed'
            } catch (e) { return `Voiceover failed: ${e.message}` }
        }

        case 'generate_music': {
            const { prompt, duration, mood } = args
            if (setFidatoMessages) {
                setFidatoMessages(prev => [...prev, { role: 'assistant', content: `🎵 Generating music (${mood || 'auto'})...` }])
            }
            try {
                const data = await canvasAssets.generateMusic({
                    prompt, duration: duration || 15, mood: mood || 'auto',
                })
                if (data.success && data.audioUrl) {
                    if (!ctx.music) ctx.music = []
                    ctx.music.push(data.audioUrl)
                    const cardW = 280, cardH = 80, x = 60, y = 80
                    fc.add(new fabric.Rect({
                        left: x, top: y, width: cardW, height: cardH, rx: 10, ry: 10,
                        fill: 'rgba(34,197,94,0.08)', stroke: 'rgba(34,197,94,0.25)', strokeWidth: 1,
                        selectable: true, evented: true,
                        id: `music-bg-${Date.now()}`, _nodeType: 'music', _audioUrl: data.audioUrl,
                    }))
                    fc.add(new fabric.Textbox(`🎵 Music • ${mood || 'auto'}\n${prompt.substring(0, 60)}...`, {
                        left: x + 10, top: y + 10, width: cardW - 20,
                        fontSize: 11, fontFamily: 'Inter', fill: '#22c55e',
                        selectable: false, evented: false,
                        id: `music-label-${Date.now()}`, _nodeType: 'music',
                    }))
                    fc.add(new fabric.Textbox(`${data.duration}s • ${data.provider}`, {
                        left: x + 10, top: y + cardH - 20, width: cardW - 20,
                        fontSize: 9, fontFamily: 'Inter', fill: '#15803d',
                        selectable: false, evented: false,
                        id: `music-dur-${Date.now()}`, _nodeType: 'music',
                    }))
                    fc.requestRenderAll()
                    return `Music generated (${data.duration}s, ${mood || 'auto'} mood) — ${data.audioUrl}`
                }
                return `Music generation failed: ${data.error || 'Unknown error'}`
            } catch (e) { return `Music failed: ${e.message}` }
        }

        case 'generate_sound_effect': {
            const { prompt, duration } = args
            if (setFidatoMessages) {
                setFidatoMessages(prev => [...prev, { role: 'assistant', content: `🔊 Generating SFX: "${prompt?.substring(0, 40)}..."` }])
            }
            try {
                const data = await canvasAssets.generateSoundEffect({ prompt, duration: duration || 3 })
                if (data.success && data.audioUrl) {
                    const cardW = 220, cardH = 60, x = 60, y = 80
                    fc.add(new fabric.Rect({
                        left: x, top: y, width: cardW, height: cardH, rx: 8, ry: 8,
                        fill: 'rgba(251,191,36,0.08)', stroke: 'rgba(251,191,36,0.25)', strokeWidth: 1,
                        selectable: true, evented: true,
                        id: `sfx-bg-${Date.now()}`, _nodeType: 'sfx', _audioUrl: data.audioUrl,
                    }))
                    fc.add(new fabric.Textbox(`🔊 SFX: ${prompt.substring(0, 40)}`, {
                        left: x + 8, top: y + 8, width: cardW - 16,
                        fontSize: 10, fontFamily: 'Inter', fill: '#fbbf24',
                        selectable: false, evented: false,
                        id: `sfx-label-${Date.now()}`, _nodeType: 'sfx',
                    }))
                    fc.add(new fabric.Textbox(`${data.duration}s`, {
                        left: x + 8, top: y + cardH - 18, width: cardW - 16,
                        fontSize: 9, fontFamily: 'Inter', fill: '#92400e',
                        selectable: false, evented: false,
                        id: `sfx-dur-${Date.now()}`, _nodeType: 'sfx',
                    }))
                    fc.requestRenderAll()
                    return `Sound effect generated (${data.duration}s) — ${data.audioUrl}`
                }
                return `SFX generation failed: ${data.error || 'Unknown error'}`
            } catch (e) { return `SFX failed: ${e.message}` }
        }

        case 'compile_workspace_assets': {
            const { title, campaignType } = args
            if (campaignType === 'image') {
                return await executeToolCall({ name: 'auto_layout_grid', args: { columns: 3, includeTypes: ['image', 'character'] } }, fc, ctx, deps)
            }

            if (!ctx.videos || Object.keys(ctx.videos).length === 0) return 'No videos found to compile.'
            const taskIds = Object.keys(ctx.videos)
            if (setFidatoMessages) {
                setFidatoMessages(prev => [...prev, { role: 'assistant', content: `⏳ QA Check: Waiting for ${taskIds.length} video generation(s) to finish rendering...` }])
            }

            let allDone = false
            let maxRetries = 60
            const { API_BASE } = await import('../../../services/api')
            const token = localStorage.getItem('mantram_token') || ''

            while (!allDone && maxRetries > 0) {
                let completedCount = 0
                for (const tid of taskIds) {
                    if (ctx.videos[tid].status === 'COMPLETED' || ctx.videos[tid].status === 'FAILED') {
                        completedCount++; continue
                    }
                    try {
                        const resp = await fetch(`${API_BASE}/video-studio/${tid}/status`, { headers: { Authorization: `Bearer ${token}` } })
                        const statusData = await resp.json()
                        if (statusData.status === 'COMPLETED') {
                            ctx.videos[tid].status = 'COMPLETED'
                            ctx.videos[tid].url = statusData.generation?.videoUrl || statusData.videoUrl
                        } else if (statusData.status === 'FAILED') {
                            ctx.videos[tid].status = 'FAILED'
                        }
                    } catch (e) { console.warn('Poll err', e) }
                }
                if (completedCount === taskIds.length) {
                    allDone = true
                } else {
                    await new Promise(r => setTimeout(r, 5000))
                    maxRetries--
                }
            }

            const finalClips = taskIds.filter(t => ctx.videos[t].url).map(t => ctx.videos[t].url)
            const voUrl = ctx.voiceovers?.length > 0 ? ctx.voiceovers[0] : null
            const bgmUrl = ctx.music?.length > 0 ? ctx.music[0] : null
            if (finalClips.length === 0) return 'Compilation aborted: All video generations failed.'

            if (setFidatoMessages) {
                setFidatoMessages(prev => [...prev, { role: 'assistant', content: `🎬 Compiling Final Ad Film "${title}" with FFmpeg...` }])
            }

            try {
                const compileData = await canvasAssets.compileVideo({
                    title, clips: finalClips, voiceoverUrl: voUrl, musicUrl: bgmUrl
                })
                if (compileData.success && compileData.videoUrl) {
                    await executeToolCall({ name: 'auto_layout_grid', args: { columns: 4 } }, fc, ctx, deps)
                    const cardW = 400, cardH = 711
                    fc.add(new fabric.Rect({
                        left: 60, top: 400, width: cardW, height: cardH, rx: 16, ry: 16, fill: '#000',
                        stroke: 'rgba(255,255,255,0.2)', strokeWidth: 2,
                        shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.5)', blur: 24, offsetY: 12 }),
                        selectable: true, evented: true,
                        id: `final-ad-${Date.now()}`, _nodeType: 'video',
                        customName: `Final Ad: ${title}`, _videoUrl: compileData.videoUrl,
                    }))
                    fc.add(new fabric.Textbox(`FINAL CAMPAIGN\n${title}`, {
                        left: 80, top: 400 + cardH - 60, width: cardW - 40,
                        fontSize: 16, fontWeight: '800', fontFamily: 'Inter',
                        fill: '#fff', textAlign: 'center', selectable: false,
                    }))
                    fc.requestRenderAll()
                    return { text: `Successfully compiled the final ad film "${title}"!`, thumbnail: compileData.videoUrl }
                }
                return `Compilation completed, but no video URL returned: ${compileData.error || ''}`
            } catch (e) { return `FFmpeg compilation failed: ${e.message}` }
        }

        // ═══════════════════════════════════════════════════════════════
        // CAMPAIGN GENERATION — Multi-size batch generation across platforms
        // ═══════════════════════════════════════════════════════════════
        case 'generate_campaign': {
            const { prompt, presets, headline, ctaText } = args
            if (!presets?.length) return 'No platform presets specified for campaign'

            const PRESET_MAP = {
                'ig-post':   { w: 1080, h: 1350, label: 'Instagram Post',  aspectRatio: '4:5' },
                'ig-story':  { w: 1080, h: 1920, label: 'Instagram Story', aspectRatio: '9:16' },
                'ig-reel':   { w: 1080, h: 1920, label: 'Instagram Reel',  aspectRatio: '9:16' },
                'fb-post':   { w: 1080, h: 1350, label: 'Facebook Post',   aspectRatio: '4:5' },
                'linkedin':  { w: 1200, h: 1200, label: 'LinkedIn Post',   aspectRatio: '1:1' },
                'yt-thumb':  { w: 1280, h: 720,  label: 'YouTube Thumb',   aspectRatio: '16:9' },
                'twitter':   { w: 1200, h: 675,  label: 'Twitter/X Post',  aspectRatio: '16:9' },
                'carousel':  { w: 1080, h: 1080, label: 'Carousel Slide',  aspectRatio: '1:1' },
                'banner':    { w: 1920, h: 600,  label: 'Web Banner',      aspectRatio: '16:5' },
            }

            if (setFidatoMessages) {
                setFidatoMessages(prev => [...prev, {
                    role: 'assistant',
                    content: `🎯 Generating campaign across ${presets.length} platforms: ${presets.map(p => PRESET_MAP[p]?.label || p).join(', ')}...`
                }])
            }

            const generatedVariants = []
            const thumbnails = []

            // Generate images for each preset in parallel
            await Promise.all(presets.map(async (preset, idx) => {
                const spec = PRESET_MAP[preset] || PRESET_MAP['ig-post']
                let adaptedPrompt = prompt

                // Inject brand colors into every image prompt for visual consistency
                const brandColors = brand?.dna?.colors?.slice(0, 3).map(c => c.hex).filter(Boolean) || []
                if (brandColors.length > 0) {
                    adaptedPrompt += `. Brand color palette: ${brandColors.join(', ')} used as accent lighting, background tones, and ambient glow.`
                }

                // Platform-specific composition guidance (not just aspect ratio)
                const platformGuide = {
                    '9:16': 'Vertical composition, subject centered in upper third, negative space at bottom for text overlay. Mobile-first — bold and intimate.',
                    '16:9': 'Wide cinematic composition, subject positioned using rule of thirds. Horizontal panoramic feel — dramatic and expansive.',
                    '16:5': 'Ultra-wide panoramic banner, subject left-aligned with generous text space on right. Clean, minimal, high-impact.',
                    '4:5': 'Near-square portrait composition, subject centered with breathing room on all sides. Balanced and focused.',
                    '1:1': 'Square composition, centered subject with symmetric balance. Clean and bold — every corner matters.',
                }
                const guide = platformGuide[spec.aspectRatio] || platformGuide['1:1']
                adaptedPrompt += `. ${guide}`

                if (headline) {
                    adaptedPrompt += ` Bold text reading "${headline}" in clean, high-contrast typography${brand?.dna?.fonts?.[0] ? ` (${brand.dna.fonts[0]} style)` : ''}.`
                }
                if (ctaText) {
                    adaptedPrompt += ` Include a CTA button/badge with "${ctaText}" in ${brandColors[1] || 'accent'} color.`
                }

                try {
                    const refUrls = (ctx.referenceImages || []).slice(0, 3).map(r => r.url).filter(Boolean)
                    const data = await canvasAssets.aiGenerate({
                        prompt: adaptedPrompt,
                        size: spec.aspectRatio || '1:1',
                        brandId: brand?._id || undefined,
                        referenceImages: refUrls.length > 0 ? refUrls : undefined,
                    })

                    if (data.imageUrl) {
                        generatedVariants.push({
                            preset,
                            label: spec.label,
                            width: spec.w,
                            height: spec.h,
                            imageUrl: data.imageUrl,
                        })
                        thumbnails.push(data.imageUrl)

                        // Add each image to canvas with label
                        if (addImageUrlToCanvas) {
                            const img = await addImageUrlToCanvas(data.imageUrl, `Campaign — ${spec.label}`)
                            if (img) {
                                // Position in a grid layout
                                const col = idx % 3
                                const row = Math.floor(idx / 3)
                                const gapPx = 30
                                const cardW = 300
                                img.set({
                                    left: 60 + col * (cardW + gapPx),
                                    top: 80 + row * (cardW + gapPx + 50),
                                    scaleX: cardW / (img.width || 1024),
                                    scaleY: cardW / (img.height || 1024),
                                })
                                img.setCoords()
                            }
                        }

                        if (setFidatoMessages) {
                            setFidatoMessages(prev => [...prev, {
                                role: 'assistant',
                                content: `✅ ${spec.label} variant generated`
                            }])
                        }
                    }
                } catch (e) {
                    console.warn(`Campaign variant ${preset} failed:`, e.message)
                }
            }))

            // Add platform labels below each image
            generatedVariants.forEach((variant, idx) => {
                const col = idx % 3
                const row = Math.floor(idx / 3)
                const gapPx = 30
                const cardW = 300
                const labelY = 80 + row * (cardW + gapPx + 50) + cardW + 8

                fc.add(new fabric.Textbox(`📱 ${variant.label}`, {
                    left: 60 + col * (cardW + gapPx),
                    top: labelY,
                    width: cardW,
                    fontSize: 12,
                    fontWeight: '700',
                    fontFamily: 'Inter',
                    fill: '#a78bfa',
                    textAlign: 'center',
                    selectable: false,
                    evented: false,
                    id: `campaign-label-${idx}-${Date.now()}`,
                    _nodeType: 'campaign',
                }))
            })

            fc.requestRenderAll()

            return {
                text: `🎯 Campaign generated: ${generatedVariants.length}/${presets.length} platform variants created successfully!`,
                thumbnails,
            }
        }

        // ═══════════════════════════════════════════════════════════════
        // MCoT POST-GENERATION CRITIC — Quality check after image gen
        // ═══════════════════════════════════════════════════════════════
        case 'critique_image': {
            const { imageUrl, originalPrompt, brief, productName } = args
            if (!imageUrl) return 'No image URL provided for critique'

            if (setFidatoMessages) {
                setFidatoMessages(prev => [...prev, {
                    role: 'assistant',
                    content: `🔎 Running MCoT quality analysis on generated image...`
                }])
            }

            try {
                const data = await canvasAssets.critiqueImage({
                    imageUrl,
                    originalPrompt: originalPrompt || '',
                    brief: brief || '',
                    productName: productName || '',
                })

                if (data.success && data.critique) {
                    const c = data.critique
                    const scoreEmoji = c.overallScore >= 75 ? '✅' : c.overallScore >= 50 ? '⚠️' : '❌'
                    const verdictText = c.verdict === 'approved'
                        ? 'Image approved — ready for use!'
                        : c.verdict === 'improve'
                        ? 'Image needs improvement'
                        : 'Image rejected — regeneration recommended'

                    const critiqueReport = [
                        `${scoreEmoji} **Quality Score: ${c.overallScore}/100** — ${verdictText}`,
                        '',
                        `📊 Breakdown:`,
                        `  • Brief Alignment: ${c.briefAlignmentScore || '?'}/100`,
                        `  • Product Accuracy: ${c.productAccuracyScore || '?'}/100`,
                        `  • Visual Quality: ${c.visualQualityScore || '?'}/100`,
                        `  • Brand Consistency: ${c.brandConsistencyScore || '?'}/100`,
                        '',
                        c.strengths?.length ? `💪 Strengths: ${c.strengths.join('; ')}` : '',
                        c.issues?.length ? `⚠️ Issues: ${c.issues.join('; ')}` : '',
                        c.critiqueNotes ? `📝 Notes: ${c.critiqueNotes}` : '',
                        c.improvedPrompt ? `\n🔄 Improved prompt available for regeneration.` : '',
                    ].filter(Boolean).join('\n')

                    return {
                        text: critiqueReport,
                        critique: data.critique,
                    }
                }
                return 'Critique analysis returned no results'
            } catch (e) {
                return `Critique failed: ${e.message}`
            }
        }

        // ═══════════════════════════════════════════════════════════════
        // BULK UPDATE — Handles hallucinated tool names like update_layer,
        // update_element where Gemini/fallback sends multiple properties
        // in a single call: { elementName, left, top, opacity, fill, ... }
        // ═══════════════════════════════════════════════════════════════
        case 'update_layer':
        case 'update_element': {
            const el = findElement(args.elementName || args.name, args.elementIndex || args.index, fc)
            if (!el) return `Element "${args.elementName || args.name || 'unknown'}" not found on canvas`

            // Apply each recognized property from the args
            const UPDATABLE_PROPS = ['left', 'top', 'scaleX', 'scaleY', 'angle', 'opacity', 'fill', 'stroke', 'fontSize', 'fontFamily', 'fontWeight', 'text', 'width', 'height']
            const changes = []
            for (const prop of UPDATABLE_PROPS) {
                if (args[prop] !== undefined && args[prop] !== null) {
                    let val = args[prop]
                    if (['left', 'top', 'scaleX', 'scaleY', 'angle', 'opacity', 'fontSize', 'width', 'height'].includes(prop)) {
                        val = parseFloat(val)
                        if (isNaN(val)) continue
                    }
                    el.set(prop, val)
                    changes.push(`${prop}=${val}`)
                }
            }

            // Handle "position" shorthand if provided (same as move_element)
            if (args.position) {
                const artboard = fc.getObjects().find(o => o.id === 'artboard')
                const cw = artboard?.width || fc.width
                const ch = artboard?.height || fc.height
                const ew = (el.width || 0) * (el.scaleX || 1)
                const eh = (el.height || 0) * (el.scaleY || 1)
                const positions = {
                    'center':       { left: (cw - ew) / 2, top: (ch - eh) / 2 },
                    'top-center':   { left: (cw - ew) / 2, top: 40 },
                    'bottom-center':{ left: (cw - ew) / 2, top: ch - eh - 40 },
                    'top-left':     { left: 40, top: 40 },
                    'top-right':    { left: cw - ew - 40, top: 40 },
                    'bottom-left':  { left: 40, top: ch - eh - 40 },
                    'bottom-right': { left: cw - ew - 40, top: ch - eh - 40 },
                }
                const pos = positions[args.position] || positions['center']
                el.set(pos)
                changes.push(`position=${args.position}`)
            }

            if (changes.length === 0) return `No valid properties to update for "${el.customName || el.type}"`

            el.setCoords()
            fc.requestRenderAll()
            return `Updated "${el.customName || el.type}": ${changes.join(', ')}`
        }

        default:
            throw new Error(`Unknown tool: ${name}`)
    }
}

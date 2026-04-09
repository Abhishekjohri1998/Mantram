// ═══════════════════════════════════════════════════════════════
// toolExecutors.js — MCP Tool Call Executors for Fidato Agent
// Handles all canvas manipulation tool calls from the AI agent
// This is the MCP bridge between AI decisions and canvas actions
// ═══════════════════════════════════════════════════════════════

import * as fabric from 'fabric'
import { addShapeToCanvas } from '../tools/shapeTools'
import { PRESETS } from '../data/presets'
import { resizeToPreset } from '../engine/fabricEngine'

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
    const { name, args } = toolCall
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
                const img = await fabric.FabricImage.fromURL(logoUrl, { crossOrigin: 'anonymous' })
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

        case 'set_canvas_size': {
            const preset = PRESETS.find(p => p.id === args.preset)
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

        case 'generate_image': {
            if (setFidatoMessages) {
                setFidatoMessages(prev => [...prev, { role: 'assistant', content: `🎨 Generating: "${args.prompt?.substring(0, 50)}..."` }])
            }
            try {
                const refUrls = (ctx.referenceImages || []).slice(0, 3).map(r => r.url).filter(Boolean)
                const data = await canvasAssets.aiGenerate({
                    prompt: args.prompt,
                    size: args.size || '1024x1024',
                    brandId: brand?._id || undefined,
                    referenceImages: refUrls.length > 0 ? refUrls : undefined,
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
            let activeObjs = fc.getActiveObjects().filter(o => o.type === 'image')
            
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
                    // Combine selected and named
                    activeObjs = [...new Set([...activeObjs, ...namedImages])]
                }
            }
            
            if (activeObjs.length < 2) {
                return 'Need at least 2 images to merge (either selected on the canvas, or clearly specified by name).'
            }
            
            if (setFidatoMessages) {
                setFidatoMessages(prev => [...prev, { role: 'assistant', content: `🎨 Merging ${activeObjs.length} images: "${args.prompt?.substring(0, 50)}..."` }])
            }
            try {
                const imageBase64s = activeObjs.map(obj => obj._element?.src || obj.getSrc?.()).filter(Boolean)
                if (imageBase64s.length < 2) return 'Could not read image data from selected elements.'
                
                const mainImage = imageBase64s[0]
                const additionalImages = imageBase64s.slice(1)
                
                const data = await canvasAssets.aiEdit({
                    prompt: args.prompt,
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
                await Promise.all(newScenes.map(async (scene, i) => {
                    try {
                        const refUrls = (ctx.referenceImages || []).slice(0, 3).map(r => r.url).filter(Boolean)
                        const data = await canvasAssets.aiGenerate({
                            prompt: frames[i].imagePrompt,
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
                        const img = await fabric.FabricImage.fromURL(data.imageUrl, { crossOrigin: 'anonymous' })
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

        case 'generate_video_clip': {
            let { prompt, duration, aspectRatio, sourceImageUrl, sceneRef } = args
            if (!sourceImageUrl && sceneRef && ctx.scenes && ctx.scenes[sceneRef - 1]?.imageUrl) {
                sourceImageUrl = ctx.scenes[sceneRef - 1].imageUrl
            }
            if (setFidatoMessages) {
                setFidatoMessages(prev => [...prev, { role: 'assistant', content: `🎬 Generating video: "${prompt?.substring(0, 50)}..."` }])
            }
            try {
                const data = await canvasAssets.generateVideo({
                    prompt, duration: duration || 5,
                    aspectRatio: aspectRatio || '16:9',
                    sourceImageUrl: sourceImageUrl || '',
                })
                if (data.success && data.taskId) {
                    if (!ctx.videos) ctx.videos = {}
                    Object.assign(ctx.videos, { [data.taskId]: { status: 'pending', url: null } })
                    // Create video placeholder card on canvas
                    const cardW = 320, cardH = 200, x = 60, y = 80
                    fc.add(new fabric.Rect({
                        left: x, top: y, width: cardW, height: cardH, rx: 12, ry: 12,
                        fill: 'rgba(6,182,212,0.08)', stroke: 'rgba(6,182,212,0.3)', strokeWidth: 1,
                        shadow: new fabric.Shadow({ color: 'rgba(6,182,212,0.15)', blur: 16, offsetY: 4 }),
                        selectable: true, evented: true,
                        id: `video-bg-${Date.now()}`, _nodeType: 'video', _taskId: data.taskId, _provider: data.provider,
                    }))
                    fc.add(new fabric.Textbox(`Video generating...\nScene ${sceneRef || '?'} • ${duration || 5}s`, {
                        left: x + 10, top: y + cardH - 40, width: cardW - 20,
                        fontSize: 10, fontWeight: '600', fontFamily: 'Inter', fill: '#22d3ee', textAlign: 'center',
                        selectable: false, evented: false,
                        id: `video-label-${Date.now()}`, _nodeType: 'video',
                    }))
                    fc.requestRenderAll()
                    return { text: `Video generation started (ID: ${data.taskId}).`, thumbnail: sourceImageUrl || null }
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

        default:
            return `Unknown tool: ${name}`
    }
}

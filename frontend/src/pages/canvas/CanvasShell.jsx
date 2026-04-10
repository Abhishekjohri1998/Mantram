// ═══════════════════════════════════════════════════════════════
// CanvasShell.jsx — Lightweight Orchestrator Shell
// Wires all modular panels, engine adapter, and state store.
// This replaces the 6,800-line monolithic CanvasEditor.jsx
// ═══════════════════════════════════════════════════════════════

import React, { useEffect, useRef, useCallback, Component } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useBrand } from '../../context/BrandContext'
import SEOHead from '../../components/SEOHead'
import * as fabric from 'fabric'
import {
    media as mediaAPI,
    creatives as creativesAPI,
    voice as voiceAPI,
    fidato as fidatoAPI,
    canvasAssets,
    API_BASE,
} from '../../services/api'
import StoryboardBoard from '../StoryboardBoard'

// ── Modular imports ──
import useCanvasStore from './state/useCanvasStore'
import { PRESETS, STICKER_DATA } from './data/presets'
import { loadGoogleFont } from './data/fonts'
import {
    buildCanvasContext, buildConversationHistory, augmentMessageWithSelection,
    createThinkingSteps, executeToolSequence
} from './agent/mcpBridge'

// ── Panel components ──
import {
    ToolbarTop,
    SidebarLeft,
    PropertiesPanel,
    FidatoPanel,
    FloatingToolbar,
    BottomBar,
} from './panels'

// ── CSS (shared with legacy) ──
import '../CanvasEditor.css'

// ═══════════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════════
/**
 * Appends a cache-busting parameter to S3 URLs to ensure fresh CORS headers.
 * Browsers often cache S3 images without CORS headers if loaded elsewhere first.
 */
const getCorsUrl = (url) => {
    if (!url || typeof url !== 'string') return url
    // Only apply to S3/External assets that might have CORS issues
    if (url.includes('amazonaws.com') || url.includes('googleusercontent.com')) {
        const separator = url.includes('?') ? '&' : '?'
        return `${url}${separator}cors=1`
    }
    return url
}

// ═══════════════════════════════════════════════════════════════
// INNER COMPONENT — Canvas Editor Core
// ═══════════════════════════════════════════════════════════════
function CanvasShellInner() {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const { activeBrand } = useBrand()

    // ── Refs ──
    const canvasRef = useRef(null)
    const fabricRef = useRef(null)
    const containerRef = useRef(null)
    const historyRef = useRef([])
    const historyIndexRef = useRef(-1)
    const clipboardRef = useRef(null)

    // ── Zustand store ──
    const store = useCanvasStore()
    const {
        zoom, setZoom,
        activePreset, setActivePreset,
        canvasTheme, toggleCanvasTheme,
        canvasView, setCanvasView,
        selectedLayer, setSelectedLayer,
        setSelectedObjType, setObjProps,
        layers, setLayers,
        canUndo, setCanUndo,
        canRedo, setCanRedo,
        showTextModal, setShowTextModal,
        textInput, setTextInput,
        contextMenu, setContextMenu,
        toast, showToast,
        setCustomW, setCustomH,
        boardScenes, setBoardScenes,
        storyBrief, setStoryBrief,
        mobilePanel, setMobilePanel,
        fidatoMessages, setFidatoMessages,
        fidatoInput, setFidatoInput,
        fidatoLoading, setFidatoLoading,
        setSidebarTab, setPanelOpen, setAiTool,
        sidebarCollapsed, setSidebarCollapsed,
        setIconResults, setIconLoading,
        setPhotoResults, setPhotoLoading, setPhotoSetupRequired,
        setTextureResults, setTextureLoading, setTextureSetupRequired,
        setGeneratedImages, setLoadingBankImages,
        genPrompt, genEnhance, genRatio, genRefs,
        setGenLoading, setShowGenPanel,
        aiPrompt, setAiPrompt, setAiLoading, setAiResult, setAiError,
        aiTool, bgAction, bgPrompt, replaceImage,
        editHistory, setEditHistory,
        aiCreativeKeywords, aiCreativeStyle,
        setAiCreativeLoading,
    } = store

    // ── Derived ──
    const mode = 'advanced'
    const imageUrl = getCorsUrl(searchParams.get('image') || sessionStorage.getItem('canvasEditorImage') || '')
    const canvasWidth = parseInt(searchParams.get('w')) || 1080
    const canvasHeight = parseInt(searchParams.get('h')) || 1080

    // ═══════════════════════════════════════════════════════════
    // HISTORY
    // ═══════════════════════════════════════════════════════════
    const saveHistory = useCallback(() => {
        const fc = fabricRef.current
        if (!fc) return
        const json = JSON.stringify(fc.toJSON())
        const history = historyRef.current
        const idx = historyIndexRef.current
        if (idx < history.length - 1) history.splice(idx + 1)
        history.push(json)
        if (history.length > 50) history.shift()
        historyIndexRef.current = history.length - 1
        setCanUndo(historyIndexRef.current > 0)
        setCanRedo(false)
    }, [setCanUndo, setCanRedo])

    const handleUndo = useCallback(() => {
        const fc = fabricRef.current
        if (!fc || historyIndexRef.current <= 0) return
        historyIndexRef.current -= 1
        const json = historyRef.current[historyIndexRef.current]
        fc.loadFromJSON(JSON.parse(json)).then(() => {
            fc.renderAll()
            updateLayers()
            setCanUndo(historyIndexRef.current > 0)
            setCanRedo(true)
        })
    }, [setCanUndo, setCanRedo])

    const handleRedo = useCallback(() => {
        const fc = fabricRef.current
        if (!fc || historyIndexRef.current >= historyRef.current.length - 1) return
        historyIndexRef.current += 1
        const json = historyRef.current[historyIndexRef.current]
        fc.loadFromJSON(JSON.parse(json)).then(() => {
            fc.renderAll()
            updateLayers()
            setCanUndo(true)
            setCanRedo(historyIndexRef.current < historyRef.current.length - 1)
        })
    }, [setCanUndo, setCanRedo])

    // ═══════════════════════════════════════════════════════════
    // LAYER TRACKING
    // ═══════════════════════════════════════════════════════════
    const updateLayers = useCallback(() => {
        const fc = fabricRef.current
        if (!fc) return
        const objs = fc.getObjects().filter(o => o.id !== 'artboard')
        const layerList = objs.map((obj, i) => ({
            id: obj.id || `layer-${i}`,
            name: obj.customName || obj.type || `Layer ${i + 1}`,
            type: obj.type,
            visible: obj.visible !== false,
            obj,
        })).reverse()
        setLayers(layerList)
    }, [setLayers])

    const updateSelectedProps = useCallback(() => {
        const fc = fabricRef.current
        if (!fc) return
        const obj = fc.getActiveObject()
        if (obj) {
            setObjProps({
                x: Math.round(obj.left || 0),
                y: Math.round(obj.top || 0),
                w: Math.round((obj.width || 0) * (obj.scaleX || 1)),
                h: Math.round((obj.height || 0) * (obj.scaleY || 1)),
                angle: Math.round(obj.angle || 0),
                opacity: Math.round((obj.opacity || 1) * 100),
            })
            setSelectedLayer(obj.id || null)
            const t = obj.type
            if (t === 'textbox' || t === 'text' || t === 'i-text') setSelectedObjType('text')
            else if (t === 'image') setSelectedObjType('image')
            else setSelectedObjType('shape')
        } else {
            setSelectedLayer(null)
            setSelectedObjType(null)
        }
    }, [setObjProps, setSelectedLayer, setSelectedObjType])

    // ═══════════════════════════════════════════════════════════
    // CANVAS INITIALIZATION
    // ═══════════════════════════════════════════════════════════
    useEffect(() => {
        if (fabricRef.current) return

        const initTimer = requestAnimationFrame(() => {
            try {
                const container = containerRef.current
                const canvasEl = canvasRef.current
                if (!container || !canvasEl) return

                const containerW = container.clientWidth
                const containerH = container.clientHeight

                const fc = new fabric.Canvas(canvasEl, {
                    width: containerW,
                    height: containerH,
                    backgroundColor: 'transparent',
                    preserveObjectStacking: true,
                    selection: true,
                    fireRightClick: true,
                })

                const scale = Math.min((containerW - 80) / canvasWidth, (containerH - 80) / canvasHeight, 1)
                fc._logicalScale = scale
                fc._logicalWidth = canvasWidth
                fc._logicalHeight = canvasHeight
                fc._artboardLeft = Math.round((containerW - Math.round(canvasWidth * scale)) / 2)
                fc._artboardTop = Math.round((containerH - Math.round(canvasHeight * scale)) / 2)

                fabricRef.current = fc

                // Load image if present
                if (imageUrl) {
                    fabric.FabricImage.fromURL(getCorsUrl(imageUrl), { crossOrigin: 'anonymous' }).then(img => {
                        const maxDim = Math.min(containerW * 0.8, containerH * 0.8)
                        const imgScale = Math.min(maxDim / img.width, maxDim / img.height, 1)
                        img.set({
                            scaleX: imgScale, scaleY: imgScale,
                            left: containerW / 2, top: containerH / 2,
                            originX: 'center', originY: 'center',
                            selectable: true, evented: true,
                            customName: 'Background Image', id: 'bg-image',
                        })
                        fc.add(img)
                        fc.sendToBack(img)
                        fc.renderAll()
                        updateLayers()
                        saveHistory()
                    }).catch(() => {
                        showToast('⚠️ Failed to load image')
                        saveHistory()
                    })
                } else {
                    saveHistory()
                }

                // Events
                fc.on('selection:created', updateSelectedProps)
                fc.on('selection:updated', updateSelectedProps)
                fc.on('selection:cleared', () => { setSelectedLayer(null); setSelectedObjType(null) })
                fc.on('object:modified', () => { updateSelectedProps(); saveHistory(); updateLayers() })
                fc.on('object:added', updateLayers)
                fc.on('object:removed', updateLayers)

                // Context menu
                const showCtx = (e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    const active = fc.getActiveObject()
                    setContextMenu({
                        x: e.clientX, y: e.clientY,
                        hasTarget: !!active,
                        isGroup: active?.type === 'group',
                        isMultiSelect: active?.type === 'activeselection',
                        isLocked: active?.lockMovementX || false,
                    })
                }
                if (fc.upperCanvasEl) fc.upperCanvasEl.addEventListener('contextmenu', showCtx)
                if (fc.wrapperEl) fc.wrapperEl.addEventListener('contextmenu', showCtx)

                const preset = PRESETS.find(p => p.w === canvasWidth && p.h === canvasHeight)
                if (preset) setActivePreset(preset.id)
                setZoom(Math.round(scale * 100))

            } catch (err) {
                console.error('Canvas init error:', err)
            }
        })

        return () => {
            cancelAnimationFrame(initTimer)
            if (fabricRef.current) { fabricRef.current.dispose(); fabricRef.current = null }
        }
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // ── Load generated images bank ──
    useEffect(() => {
        const fetchBank = async () => {
            const brandId = activeBrand?._id
            if (!brandId) return
            setLoadingBankImages(true)
            try {
                const data = await creativesAPI.imageBank({ category: 'generated', brandId, limit: 40 })
                if (data.success && data.images) {
                    setGeneratedImages(data.images.map(img => ({
                        url: img.imageUrl || img.thumbnailUrl,
                        label: img.title || img.type || 'Generated',
                        id: img._id,
                    })).filter(img => img.url))
                }
            } catch (err) { console.warn('Failed to load image bank:', err) }
            setLoadingBankImages(false)
        }
        fetchBank()
    }, [activeBrand])

    // ═══════════════════════════════════════════════════════════
    // ACTION HANDLERS
    // ═══════════════════════════════════════════════════════════

    // ── Text ──
    const addText = useCallback((text, isHeading = false) => {
        const fc = fabricRef.current
        if (!fc) return
        const brandFont = activeBrand?.dna?.fonts?.[0] || 'Inter'
        const brandColor = activeBrand?.dna?.colors?.[0]?.hex || '#ffffff'
        loadGoogleFont(brandFont)
        const textObj = new fabric.Textbox(text || 'Your text here', {
            left: fc.width / 2, top: fc.height / 2,
            originX: 'center', originY: 'center',
            fontSize: isHeading ? 48 : 24,
            fontWeight: isHeading ? '800' : '400',
            fontFamily: brandFont, fill: brandColor,
            textAlign: 'center', width: fc.width * 0.6,
            editable: true,
            customName: isHeading ? 'Heading' : 'Text',
            id: `text-${Date.now()}`,
        })
        fc.add(textObj)
        fc.setActiveObject(textObj)
        fc.renderAll()
        saveHistory()
        showToast(`✍️ ${isHeading ? 'Heading' : 'Text'} added`)
    }, [activeBrand, saveHistory, showToast])

    // ── Shape (inline for all 20+ shape types) ──
    const addShape = useCallback((type) => {
        const fc = fabricRef.current
        if (!fc) return
        const brandColor = activeBrand?.dna?.colors?.[1]?.hex || activeBrand?.dna?.colors?.[0]?.hex || '#6366f1'
        const fillColor = brandColor + '40'
        const cx = fc.width / 2, cy = fc.height / 2, ts = Date.now()

        const regularPoly = (sides, radius) => {
            const pts = []
            for (let i = 0; i < sides; i++) {
                const angle = (i * 2 * Math.PI / sides) - Math.PI / 2
                pts.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius })
            }
            return pts
        }
        const starPoly = (points, outerR, innerR) => {
            const pts = []
            for (let i = 0; i < points * 2; i++) {
                const r = i % 2 === 0 ? outerR : innerR
                const angle = (i * Math.PI / points) - Math.PI / 2
                pts.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r })
            }
            return pts
        }

        let shape
        switch (type) {
            case 'shape-rect': shape = new fabric.Rect({ width: 200, height: 150, fill: fillColor, stroke: brandColor, strokeWidth: 2, customName: 'Rectangle', id: `rect-${ts}` }); break
            case 'shape-rounded-rect': shape = new fabric.Rect({ width: 200, height: 150, fill: fillColor, stroke: brandColor, strokeWidth: 2, rx: 20, ry: 20, customName: 'Rounded Rect', id: `rrect-${ts}` }); break
            case 'shape-circle': shape = new fabric.Circle({ radius: 80, fill: fillColor, stroke: brandColor, strokeWidth: 2, customName: 'Circle', id: `circle-${ts}` }); break
            case 'shape-oval': shape = new fabric.Ellipse({ rx: 120, ry: 70, fill: fillColor, stroke: brandColor, strokeWidth: 2, customName: 'Oval', id: `oval-${ts}` }); break
            case 'shape-triangle': shape = new fabric.Polygon(regularPoly(3, 80), { fill: fillColor, stroke: brandColor, strokeWidth: 2, customName: 'Triangle', id: `tri-${ts}` }); break
            case 'shape-diamond': shape = new fabric.Polygon([{x:0,y:-90},{x:70,y:0},{x:0,y:90},{x:-70,y:0}], { fill: fillColor, stroke: brandColor, strokeWidth: 2, customName: 'Diamond', id: `diamond-${ts}` }); break
            case 'shape-pentagon': shape = new fabric.Polygon(regularPoly(5, 80), { fill: fillColor, stroke: brandColor, strokeWidth: 2, customName: 'Pentagon', id: `pent-${ts}` }); break
            case 'shape-hexagon': shape = new fabric.Polygon(regularPoly(6, 80), { fill: fillColor, stroke: brandColor, strokeWidth: 2, customName: 'Hexagon', id: `hex-${ts}` }); break
            case 'shape-star5': shape = new fabric.Polygon(starPoly(5, 80, 35), { fill: fillColor, stroke: brandColor, strokeWidth: 2, customName: 'Star 5pt', id: `star5-${ts}` }); break
            case 'shape-star6': shape = new fabric.Polygon(starPoly(6, 80, 40), { fill: fillColor, stroke: brandColor, strokeWidth: 2, customName: 'Star 6pt', id: `star6-${ts}` }); break
            case 'shape-heart': shape = new fabric.Path('M 0 -40 C -30 -80, -100 -40, -60 20 C -30 60, 0 80, 0 80 C 0 80, 30 60, 60 20 C 100 -40, 30 -80, 0 -40 Z', { fill: '#f87171', stroke: '#ef4444', strokeWidth: 2, customName: 'Heart', id: `heart-${ts}` }); break
            case 'shape-cross': shape = new fabric.Polygon([{x:-25,y:-75},{x:25,y:-75},{x:25,y:-25},{x:75,y:-25},{x:75,y:25},{x:25,y:25},{x:25,y:75},{x:-25,y:75},{x:-25,y:25},{x:-75,y:25},{x:-75,y:-25},{x:-25,y:-25}], { fill: fillColor, stroke: brandColor, strokeWidth: 2, customName: 'Cross', id: `cross-${ts}` }); break
            case 'shape-arrow-right': shape = new fabric.Polygon([{x:-80,y:-30},{x:20,y:-30},{x:20,y:-60},{x:80,y:0},{x:20,y:60},{x:20,y:30},{x:-80,y:30}], { fill: fillColor, stroke: brandColor, strokeWidth: 2, customName: 'Arrow Right', id: `arrowr-${ts}` }); break
            case 'shape-arrow-up': shape = new fabric.Polygon([{x:0,y:-80},{x:60,y:-20},{x:30,y:-20},{x:30,y:80},{x:-30,y:80},{x:-30,y:-20},{x:-60,y:-20}], { fill: fillColor, stroke: brandColor, strokeWidth: 2, customName: 'Arrow Up', id: `arrowu-${ts}` }); break
            case 'shape-badge': shape = new fabric.Polygon(starPoly(8, 80, 60), { fill: fillColor, stroke: brandColor, strokeWidth: 2, customName: 'Badge', id: `badge-${ts}` }); break
            case 'shape-line': shape = new fabric.Line([0, 0, 300, 0], { stroke: brandColor, strokeWidth: 3, customName: 'Line', id: `line-${ts}` }); break
            case 'shape-dashed': shape = new fabric.Line([0, 0, 300, 0], { stroke: brandColor, strokeWidth: 3, strokeDashArray: [15, 10], customName: 'Dashed', id: `dash-${ts}` }); break
            case 'shape-dotted': shape = new fabric.Line([0, 0, 300, 0], { stroke: brandColor, strokeWidth: 3, strokeDashArray: [3, 8], strokeLineCap: 'round', customName: 'Dotted', id: `dot-${ts}` }); break
            case 'shape-blob': shape = new fabric.Path('M 80 0 C 120 -20, 140 40, 100 80 C 60 120, -20 100, -40 60 C -60 20, 40 -40, 80 0 Z', { fill: fillColor, stroke: brandColor, strokeWidth: 2, customName: 'Blob', id: `blob-${ts}`, scaleX: 1.2, scaleY: 1.2 }); break
            case 'shape-wave': shape = new fabric.Path('M 0 50 Q 50 0, 100 50 T 200 50 T 300 50', { fill: 'transparent', stroke: brandColor, strokeWidth: 4, customName: 'Wave', id: `wave-${ts}` }); break
            case 'shape-half-circle': shape = new fabric.Path('M -80 0 A 80 80 0 0 1 80 0 Z', { fill: fillColor, stroke: brandColor, strokeWidth: 2, customName: 'Half Circle', id: `half-${ts}` }); break
            default: return
        }
        if (shape) {
            shape.set({ left: cx, top: cy, originX: 'center', originY: 'center' })
            fc.add(shape)
            fc.setActiveObject(shape)
            fc.renderAll()
            saveHistory()
            showToast(`✦ ${shape.customName || 'Shape'} added`)
        }
    }, [activeBrand, saveHistory, showToast])

    // ── Element dispatcher ──
    const handleAddElement = useCallback((id) => {
        if (id === 'text') addText('Your text here', false)
        else if (id === 'heading') addText('Your Heading', true)
        else if (id === 'subheading') addText('Subheading', false)
        else if (id === 'logo') addLogo()
        else if (id === 'image') uploadImage()
        else if (id.startsWith('shape-')) addShape(id)
    }, [addText, addShape])

    // ── Upload image ──
    const uploadImage = useCallback(() => {
        const input = document.createElement('input')
        input.type = 'file'; input.accept = 'image/*'
        input.onchange = (e) => {
            const file = e.target.files?.[0]
            if (!file) return
            const reader = new FileReader()
            reader.onload = async (ev) => {
                const fc = fabricRef.current
                if (!fc) return
                let imgUrl = ev.target.result
                try {
                    const { url } = await mediaAPI.upload({ imageData: ev.target.result, folder: 'canvas-layers' })
                    imgUrl = getCorsUrl(url)
                } catch (e) { console.warn('S3 upload failed, using base64:', e.message) }
                fabric.FabricImage.fromURL(imgUrl, { crossOrigin: 'anonymous' }).then(img => {
                    const maxSize = fc.width * 0.5
                    const scale = maxSize / Math.max(img.width, img.height)
                    img.set({
                        scaleX: scale, scaleY: scale,
                        left: fc.width / 2, top: fc.height / 2,
                        originX: 'center', originY: 'center',
                        customName: file.name.split('.')[0] || 'Uploaded Image',
                        id: `img-${Date.now()}`,
                    })
                    fc.add(img)
                    fc.setActiveObject(img)
                    fc.renderAll()
                    saveHistory()
                    showToast('📷 Image added')
                })
            }
            reader.readAsDataURL(file)
        }
        input.click()
    }, [saveHistory, showToast])

    // ── Add logo ──
    const addLogo = useCallback(() => {
        const fc = fabricRef.current
        const logoUrl = getCorsUrl(activeBrand?.dna?.logo?.url)
        if (!fc || !logoUrl) { showToast('⚠️ No brand logo found'); return }
        fabric.FabricImage.fromURL(logoUrl, { crossOrigin: 'anonymous' }).then(img => {
            const maxSize = fc.width * 0.15
            const scale = maxSize / Math.max(img.width, img.height)
            img.set({ scaleX: scale, scaleY: scale, left: fc.width - 40, top: fc.height - 40, originX: 'right', originY: 'bottom', customName: 'Brand Logo', id: `logo-${Date.now()}` })
            fc.add(img); fc.setActiveObject(img); fc.renderAll(); saveHistory()
            showToast('🏷️ Brand logo added')
        }).catch(() => showToast('⚠️ Failed to load logo'))
    }, [activeBrand, saveHistory, showToast])

    // ── Delete / Duplicate / Layer ordering ──
    const deleteSelected = useCallback(() => {
        const fc = fabricRef.current; if (!fc) return
        const obj = fc.getActiveObject()
        if (obj) { fc.remove(obj); fc.renderAll(); saveHistory(); showToast('🗑️ Deleted') }
    }, [saveHistory, showToast])

    const duplicateSelected = useCallback(() => {
        const fc = fabricRef.current; if (!fc) return
        const obj = fc.getActiveObject(); if (!obj) return
        obj.clone().then(cloned => {
            cloned.set({ left: (obj.left || 0) + 20, top: (obj.top || 0) + 20, id: `clone-${Date.now()}`, customName: (obj.customName || 'Object') + ' Copy' })
            fc.add(cloned); fc.setActiveObject(cloned); fc.renderAll(); saveHistory()
            showToast('📋 Duplicated')
        })
    }, [saveHistory, showToast])

    const bringForward = useCallback(() => {
        const fc = fabricRef.current; const obj = fc?.getActiveObject()
        if (obj) { fc.bringObjectForward(obj); fc.renderAll(); updateLayers(); saveHistory() }
    }, [saveHistory, updateLayers])

    const sendBackward = useCallback(() => {
        const fc = fabricRef.current; const obj = fc?.getActiveObject()
        if (obj) { fc.sendObjectBackwards(obj); fc.renderAll(); updateLayers(); saveHistory() }
    }, [saveHistory, updateLayers])

    // ── Export ──
    const exportCanvas = useCallback((format = 'png') => {
        const fc = fabricRef.current
        if (!fc) return
        const dataURL = fc.toDataURL({ format, quality: format === 'jpeg' ? 0.92 : 1.0, multiplier: 2 })
        const link = document.createElement('a')
        link.download = `canvas-export.${format}`
        link.href = dataURL
        link.click()
        showToast(`📥 Exported as ${format.toUpperCase()}`)
    }, [showToast])

    // ── Resize ──
    const resizeToPreset = useCallback((preset) => {
        const fc = fabricRef.current
        if (!fc) return
        setActivePreset(preset.id)
        const canvasW = fc.width, canvasH = fc.height
        const scale = Math.min((canvasW - 80) / preset.w, (canvasH - 80) / preset.h, 1)
        const displayW = Math.round(preset.w * scale), displayH = Math.round(preset.h * scale)
        const artboardLeft = Math.round((canvasW - displayW) / 2), artboardTop = Math.round((canvasH - displayH) / 2)

        let artboard = fc.getObjects().find(o => o.id === 'artboard')
        if (!artboard) {
            artboard = new fabric.Rect({
                left: artboardLeft, top: artboardTop, width: displayW, height: displayH,
                fill: '#ffffff', rx: 4, ry: 4, selectable: false, evented: false,
                hoverCursor: 'default', id: 'artboard', excludeFromExport: false,
                shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.25)', blur: 30, offsetX: 0, offsetY: 4 }),
            })
            fc.add(artboard); fc.sendObjectToBack(artboard)
        } else {
            artboard.set({ left: artboardLeft, top: artboardTop, width: displayW, height: displayH })
        }
        fc._logicalScale = scale; fc._logicalWidth = preset.w; fc._logicalHeight = preset.h
        fc._artboardLeft = artboardLeft; fc._artboardTop = artboardTop
        fc.renderAll()
        setZoom(Math.round(scale * 100))
        setCustomW(preset.w); setCustomH(preset.h)
        saveHistory()
        showToast(`📐 Resized to ${preset.label} (${preset.w}×${preset.h})`)
    }, [setActivePreset, setZoom, setCustomW, setCustomH, saveHistory, showToast])

    const resizeCanvas = useCallback((w, h) => {
        resizeToPreset({ id: 'custom', label: 'Custom', icon: 'crop', w, h })
    }, [resizeToPreset])

    // ── Add image URL to canvas ──
    const addImageUrlToCanvas = useCallback((url, name) => {
        const fc = fabricRef.current
        if (!fc || !url) return Promise.resolve()
        return fabric.FabricImage.fromURL(getCorsUrl(url), { crossOrigin: 'anonymous' }).then(img => {
            const maxSize = fc.width * 0.4
            const scale = maxSize / Math.max(img.width, img.height)
            img.set({
                scaleX: scale, scaleY: scale,
                left: fc.width / 2, top: fc.height / 2,
                originX: 'center', originY: 'center',
                customName: name || 'Image', id: `img-${Date.now()}`,
            })
            fc.add(img); fc.setActiveObject(img); fc.renderAll(); saveHistory()
            return img
        }).catch(() => {
            showToast('⚠️ Failed to load image')
            return null
        })
    }, [saveHistory, showToast])

    // ── Zoom ──
    const handleZoom = useCallback((delta) => {
        const newZoom = Math.max(10, Math.min(300, zoom + delta))
        setZoom(newZoom)
        const fc = fabricRef.current
        if (fc) {
            fc.setZoom(newZoom / 100)
            fc.renderAll()
        }
    }, [zoom, setZoom])

    // ── Sticker helpers ──
    const getFilteredStickers = useCallback(() => {
        const { stickerCategory, stickerSearch } = useCanvasStore.getState()
        let allStickers = stickerCategory === 'all'
            ? Object.values(STICKER_DATA).flat()
            : STICKER_DATA[stickerCategory] || []
        if (stickerSearch) allStickers = allStickers.filter(s => s.includes(stickerSearch.toLowerCase()))
        return [...new Set(allStickers)]
    }, [])

    const addStickerToCanvas = useCallback((name) => {
        const fc = fabricRef.current; if (!fc) return
        const url = `https://api.iconify.design/lucide:${name}.svg?width=80&height=80&color=%23818cf8`
        fabric.FabricImage.fromURL(getCorsUrl(url), { crossOrigin: 'anonymous' }).then(img => {
            img.set({ left: fc.width / 2, top: fc.height / 2, originX: 'center', originY: 'center', customName: name, id: `sticker-${Date.now()}` })
            fc.add(img); fc.setActiveObject(img); fc.renderAll(); saveHistory()
        }).catch(() => showToast('⚠️ Failed to load sticker'))
    }, [saveHistory, showToast])

    // ── Brand assets ──
    const getBrandAssets = useCallback(() => {
        if (!activeBrand?.dna) return []
        const assets = []
        if (activeBrand.dna.logo?.url) assets.push({ name: 'Logo', url: activeBrand.dna.logo.url, icon: 'verified' })
        if (activeBrand.dna.favicon?.url) assets.push({ name: 'Favicon', url: activeBrand.dna.favicon.url, icon: 'public' })
        if (activeBrand.dna.images) {
            activeBrand.dna.images.forEach((img, i) => assets.push({ name: img.alt || `Image ${i + 1}`, url: img.s3Url || img.url, icon: 'image' }))
        }
        return assets
    }, [activeBrand])

    const addBrandAssetToCanvas = useCallback((asset) => {
        if (asset.url) addImageUrlToCanvas(asset.url, asset.name)
    }, [addImageUrlToCanvas])

    const addBrandColorBlock = useCallback((hex) => {
        const fc = fabricRef.current; if (!fc) return
        const rect = new fabric.Rect({
            width: 200, height: 200, fill: hex,
            left: fc.width / 2, top: fc.height / 2,
            originX: 'center', originY: 'center',
            customName: `Color ${hex}`, id: `color-${Date.now()}`,
        })
        fc.add(rect); fc.setActiveObject(rect); fc.renderAll(); saveHistory()
        showToast(`🎨 Color block added: ${hex}`)
    }, [saveHistory, showToast])

    const applyFontToSelected = useCallback((font) => {
        const fc = fabricRef.current; const obj = fc?.getActiveObject()
        if (obj && (obj.type === 'textbox' || obj.type === 'text')) {
            loadGoogleFont(font)
            obj.set('fontFamily', font); fc.renderAll(); saveHistory()
        }
    }, [saveHistory])

    // ── Gradient ──
    const addGradientToCanvas = useCallback((g) => {
        const fc = fabricRef.current; if (!fc) return
        const rect = new fabric.Rect({
            width: 300, height: 300,
            left: fc.width / 2, top: fc.height / 2,
            originX: 'center', originY: 'center',
            customName: g.name, id: `grad-${Date.now()}`,
        })
        const angle = (g.angle || 0) * Math.PI / 180
        rect.set('fill', new fabric.Gradient({
            type: 'linear',
            coords: { x1: 0, y1: 0, x2: Math.cos(angle) * 300, y2: Math.sin(angle) * 300 },
            colorStops: [{ offset: 0, color: g.colors[0] }, { offset: 1, color: g.colors[1] }],
        }))
        fc.add(rect); fc.setActiveObject(rect); fc.renderAll(); saveHistory()
    }, [saveHistory])

    // ── Fidato send ──
    const fidatoAbortRef = useRef(null)
    const handleFidatoSend = useCallback(async (voiceText) => {
        const msg = (voiceText || fidatoInput).trim()
        if (!msg || fidatoLoading) return
        setFidatoInput('')
        setFidatoMessages(prev => [...prev, { role: 'user', content: msg }])
        setFidatoLoading(true)

        const abortController = new AbortController()
        fidatoAbortRef.current = abortController
        const fc = fabricRef.current

        try {
            // Build canvas state & history for MCP context
            const canvasState = buildCanvasContext(fc)
            const conversationHistory = buildConversationHistory(fidatoMessages, 6)
            const queryMsg = augmentMessageWithSelection(msg, canvasState.selectedElements || [])

            // Progressive thinking UI (Step 1)
            const thinkingSteps = createThinkingSteps(canvasState.selectedCount)
            setFidatoMessages(prev => [...prev, { role: 'assistant', content: '', thinking: true, thinkingSteps }])

            // Update step 1 → 2
            setTimeout(() => {
                setFidatoMessages(prev => {
                    const updated = [...prev]; const last = { ...updated[updated.length - 1] }
                    if (last?.thinking) Object.assign(last, { thinkingSteps: last.thinkingSteps.map((s, i) => i === 0 ? { ...s, status: 'done' } : i === 1 ? { ...s, status: 'active' } : s) })
                    return Object.assign([], updated, { [updated.length - 1]: last })
                })
            }, 1500)

            // Step 2 → 3
            setTimeout(() => {
                setFidatoMessages(prev => {
                    const updated = [...prev]; const last = { ...updated[updated.length - 1] }
                    if (last?.thinking) Object.assign(last, { thinkingSteps: last.thinkingSteps.map((s, i) => i <= 1 ? { ...s, status: 'done' } : { ...s, status: 'active' }) })
                    return Object.assign([], updated, { [updated.length - 1]: last })
                })
            }, 3000)

            // Multi-Agent Call: Pre-flight Research or Tools
            const result = await fidatoAPI.canvasDirect({
                message: queryMsg, canvasState, conversationHistory, signal: abortController.signal,
            })

            // ── PHASE 1: Pre-flight confirmation ──
            if (result.preflightConfirmation) {
                const imgCount = (result.referenceImages || []).length
                const researchPreview = (result.research || '').substring(0, 300).replace(/##/g, '').trim()
                
                setFidatoMessages(prev => {
                    const updated = [...prev]; const last = { ...updated[updated.length - 1] }
                    Object.assign(last, {
                        thinking: false, referenceImages: result.referenceImages || [],
                        content: `🔍 **Research Complete** for "${result.productName || 'product'}"\n\n${imgCount > 0 ? `<span className="material-symbols-outlined text-[inherit] text-lg align-middle mr-1 -mt-0.5">check_circle</span> Found ${imgCount} product image(s)` : '⚠️ No product images found'}\n\n📄 ${researchPreview}${researchPreview.length >= 300 ? '...' : ''}`
                    })
                    return Object.assign([], updated, { [updated.length - 1]: last })
                })

                setFidatoMessages(prev => [...prev, { role: 'assistant', content: '⏳ Proceeding to creative pipeline with found research...', thinking: true }])

                const phase2Result = await fidatoAPI.canvasDirect({
                    message: msg, canvasState, conversationHistory,
                    preflightResearchData: { research: result.research, referenceImages: result.referenceImages },
                    signal: abortController.signal,
                })

                setFidatoMessages(prev => {
                    const updated = [...prev]
                    updated[updated.length - 1] = { role: 'assistant', content: phase2Result.text || phase2Result.reply || '', thinking: false }
                    return updated
                })

                Object.assign(result, phase2Result)
                result.preflightConfirmation = false
            }

            // ── PHASE 2: Execute tool sequence ──
            let toolResults = []
            if (result.toolCalls?.length > 0 && fc) {
                const deps = { brand: activeBrand, canvasAssets, addImageUrlToCanvas, setBoardScenes, setStoryBrief, setCanvasView, setFidatoMessages, referenceImages: result.referenceImages || [] }
                
                const addLog = (text) => {
                    const time = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
                    setFidatoMessages(prev => {
                        const updated = [...prev]; const last = { ...updated[updated.length - 1] }
                        if (last) { last.processLogs = [...(last.processLogs || []), { time, text }]; updated[updated.length - 1] = last }
                        return updated
                    })
                }

                toolResults = await executeToolSequence(result.toolCalls, fc, deps, {
                    onPlanInit: (plan, initialLogs) => {
                        setFidatoMessages(prev => {
                            const updated = [...prev]; const last = updated[updated.length - 1]
                            if (last) { last.thinking = false; last.plan = plan; last.processLogs = initialLogs }
                            return updated
                        })
                    },
                    onLog: addLog,
                    onTaskActive: (idx, total) => {
                        setFidatoMessages(prev => {
                            const updated = [...prev]; const last = { ...updated[updated.length - 1] }
                            if (last?.plan) {
                                const newPlan = { ...last.plan, title: `Updated plan ${idx + 1}/${total}` }
                                newPlan.items = [...newPlan.items]
                                newPlan.items[idx] = { ...newPlan.items[idx], status: 'active' }
                                last.plan = newPlan; updated[updated.length - 1] = last
                            }
                            return updated
                        })
                    },
                    onTaskDone: (idx, resultText, mediaUrls) => {
                        setFidatoMessages(prev => {
                            const updated = [...prev]; const last = { ...updated[updated.length - 1] }
                            if (last?.plan) {
                                const newPlan = { ...last.plan }
                                newPlan.items = [...newPlan.items]
                                const newItem = { ...newPlan.items[idx], status: 'done', resultText }
                                if (mediaUrls?.length > 0) newItem.thumbnails = [...(newItem.thumbnails || []), ...mediaUrls]
                                newPlan.items[idx] = newItem
                                last.plan = newPlan; updated[updated.length - 1] = last
                            }
                            return updated
                        })
                    },
                    onTaskError: (idx) => {
                        setFidatoMessages(prev => {
                            const updated = [...prev]; const last = { ...updated[updated.length - 1] }
                            if (last?.plan) {
                                const newPlan = { ...last.plan }
                                newPlan.items = [...newPlan.items]
                                newPlan.items[idx] = { ...newPlan.items[idx], status: 'error' }
                                last.plan = newPlan; updated[updated.length - 1] = last
                            }
                            return updated
                        })
                    },
                    onComplete: (total) => {
                        setFidatoMessages(prev => {
                            const updated = [...prev]; const last = updated[updated.length - 1]
                            if (last?.plan) last.plan.title = `Completed plan ${total}/${total}`
                            return updated
                        })
                        saveHistory()
                    }
                })
            }

            // Build final UI response
            const reply = result.reply || 'Done!'
            const actionSummary = toolResults.length > 0 ? `\n\n**Actions:**\n${toolResults.join('\n')}` : ''
            const providerNote = result.fallback ? ` *(via ${result.provider})* ` : ''

            // Extract embedded search results from thinking
            const searchRegex = /<search query="([^"]+)">([\s\S]*?)<\/search>/gi
            let searches = [], cleanReasoning = result.thinking || '', match
            while ((match = searchRegex.exec(cleanReasoning)) !== null) searches.push({ query: match[1], result: match[2].trim() })
            cleanReasoning = cleanReasoning.replace(searchRegex, '').trim()

            setFidatoMessages(prev => {
                const updated = [...prev], lastIdx = updated.length - 1
                const newMsgData = {
                    role: 'assistant',
                    content: `${reply}${actionSummary}${providerNote}`,
                    reasoning: cleanReasoning || undefined,
                    searches: searches.length > 0 ? searches : undefined,
                    research: result.research || undefined,
                    referenceImages: result.referenceImages || undefined,
                }
                
                if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') updated[lastIdx] = newMsgData
                else updated.push(newMsgData)
                return updated
            })

        } catch (err) {
            console.error('Fidato Canvas error:', err)
            if (err.name !== 'AbortError') {
                setFidatoMessages(prev => {
                    const updated = [...prev], lastIdx = updated.length - 1
                    if (lastIdx >= 0 && (updated[lastIdx].thinking || updated[lastIdx].content?.includes('thinking'))) {
                        updated[lastIdx] = { role: 'assistant', content: ` Error: ${err.message}` }
                    } else updated.push({ role: 'assistant', content: ` Error: ${err.message}` })
                    return updated
                })
            }
        } finally {
            setFidatoLoading(false)
        }
    }, [fidatoInput, fidatoLoading, activeBrand, addImageUrlToCanvas, saveHistory, fidatoMessages, setFidatoInput, setFidatoMessages, setFidatoLoading, boardScenes, setBoardScenes, storyBrief, setStoryBrief, setCanvasView])

    const handleFidatoStop = useCallback(() => {
        if (fidatoAbortRef.current) fidatoAbortRef.current.abort()
        setFidatoLoading(false)
    }, [setFidatoLoading])

    // ── Keyboard shortcuts ──
    useEffect(() => {
        const handler = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return
            if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo() }
            if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) { e.preventDefault(); handleRedo() }
            if ((e.metaKey || e.ctrlKey) && e.key === 'd') { e.preventDefault(); duplicateSelected() }
            if (e.key === 'Delete' || e.key === 'Backspace') { deleteSelected() }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [handleUndo, handleRedo, duplicateSelected, deleteSelected])

    // ── Close context menu on outside click ──
    useEffect(() => {
        if (!contextMenu) return
        const close = () => setContextMenu(null)
        window.addEventListener('click', close)
        return () => window.removeEventListener('click', close)
    }, [contextMenu, setContextMenu])

    // ── Current preset ──
    const currentPreset = PRESETS.find(p => p.id === activePreset) || PRESETS[0]

    // ═══════════════════════════════════════════════════════════
    // RENDER — Composing all modular panels
    // ═══════════════════════════════════════════════════════════
    return (
        <div className={`canvas-editor ${canvasTheme === 'light' ? 'theme-light' : ''}`} onClick={() => contextMenu && setContextMenu(null)}>
            {/* ── TOP TOOLBAR ── */}
            <ToolbarTop
                fabricRef={fabricRef}
                onUndo={handleUndo}
                onRedo={handleRedo}
                onDuplicate={duplicateSelected}
                onDelete={deleteSelected}
                onBringForward={bringForward}
                onSendBackward={sendBackward}
                onExport={exportCanvas}
                onNavigateBack={() => navigate(-1)}
                canUndo={canUndo}
                canRedo={canRedo}
            />

            {/* ── MAIN LAYOUT ── */}
            <div className="ce-main" style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                {/* ── LEFT SIDEBAR ── */}
                <SidebarLeft
                    fabricRef={fabricRef}
                    activeBrand={activeBrand}
                    onAddElement={handleAddElement}
                    onUploadImage={uploadImage}
                    onAddGradient={addGradientToCanvas}
                    onAddBrandAsset={addBrandAssetToCanvas}
                    onAddBrandColorBlock={addBrandColorBlock}
                    onApplyFontToSelected={applyFontToSelected}
                    onAddStickerToCanvas={addStickerToCanvas}
                    getFilteredStickers={getFilteredStickers}
                    getBrandAssets={getBrandAssets}
                    onAddImageUrlToCanvas={addImageUrlToCanvas}
                    generatedImages={store.generatedImages}
                    loadingBankImages={store.loadingBankImages}
                    iconResults={store.iconResults}
                    iconLoading={store.iconLoading}
                    photoResults={store.photoResults}
                    photoLoading={store.photoLoading}
                    photoSetupRequired={store.photoSetupRequired}
                    textureResults={store.textureResults}
                    textureLoading={store.textureLoading}
                    textureSetupRequired={store.textureSetupRequired}
                    onSaveHistory={saveHistory}
                />

                {/* ── MAIN CONTENT AREA ── */}
                {canvasView === 'board' ? (
                    <StoryboardBoard
                        scenes={boardScenes}
                        onScenesChange={setBoardScenes}
                        storyBrief={storyBrief}
                        brandContext={activeBrand ? { brandName: activeBrand.brandName, brandColors: activeBrand.brandColors || {} } : null}
                        onSendToCanvas={async () => { setCanvasView('design') }}
                        onAddScene={() => setBoardScenes(prev => [...prev, { id: `scene-${Date.now()}`, imageUrl: '', caption: `Scene ${boardScenes.length + 1}`, shotType: '', shotDescription: '', duration: 5 }])}
                        onSceneEdit={() => {}}
                        onSceneImageClick={() => {}}
                    />
                ) : canvasView === 'timeline' ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', flexDirection: 'column', gap: 8 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 48, opacity: 0.3 }}>view_timeline</span>
                        <h3 style={{ color: '#e2e8f0', fontSize: 16 }}>Timeline View</h3>
                        <p style={{ fontSize: 13 }}>Coming soon — sequence scenes with transitions</p>
                    </div>
                ) : (
                    <>
                        {/* Canvas Area */}
                        <div className="ce-canvas-area" ref={containerRef}>
                            <div className="ce-canvas-wrapper">
                                <canvas ref={canvasRef} />
                                <div className="ce-canvas-info">
                                    {currentPreset.label} — {currentPreset.w}×{currentPreset.h}px
                                </div>
                            </div>

                            {/* Zoom Controls */}
                            <div className="ce-zoom-controls">
                                <button className="ce-tool-btn" onClick={() => handleZoom(-10)} style={{ width: 28, height: 28 }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>remove</span>
                                </button>
                                <span className="ce-zoom-label">{zoom}%</span>
                                <button className="ce-tool-btn" onClick={() => handleZoom(10)} style={{ width: 28, height: 28 }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                                </button>
                                <button className="ce-tool-btn" onClick={() => { setZoom(100); handleZoom(0) }} style={{ width: 28, height: 28 }} title="Reset zoom">
                                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>fit_screen</span>
                                </button>
                                <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.15)', margin: '0 4px' }} />
                                <button className="ce-tool-btn" onClick={toggleCanvasTheme} style={{ width: 28, height: 28 }} title={`Switch to ${canvasTheme === 'dark' ? 'light' : 'dark'} background`}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
                                        {canvasTheme === 'dark' ? 'light_mode' : 'dark_mode'}
                                    </span>
                                </button>
                            </div>

                            {/* Floating Toolbar */}
                            <FloatingToolbar
                                onUploadImage={uploadImage}
                                onGenImage={() => showToast('🎨 Image generation will be connected in the next phase')}
                            />

                            {/* Fidato Chat */}
                            <FidatoPanel
                                fabricRef={fabricRef}
                                onSend={handleFidatoSend}
                                onStop={handleFidatoStop}
                                onAddImageToCanvas={addImageUrlToCanvas}
                                voiceAPI={voiceAPI}
                            />
                        </div>

                        {/* ── RIGHT SIDEBAR ── */}
                        <PropertiesPanel
                            fabricRef={fabricRef}
                            mode={mode}
                            activeBrand={activeBrand}
                            onSaveHistory={saveHistory}
                        />
                    </>
                )}
            </div>

            {/* ── BOTTOM BAR ── */}
            <BottomBar
                onResizeCanvas={resizeCanvas}
                onResizeToPreset={resizeToPreset}
            />

            {/* ── TEXT MODAL ── */}
            {showTextModal && (
                <div className="ce-modal-overlay" onClick={() => setShowTextModal(false)}>
                    <div className="ce-modal" onClick={e => e.stopPropagation()}>
                        <h3>
                            <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#818cf8', verticalAlign: 'middle', marginRight: 8 }}>text_fields</span>
                            Add Text
                        </h3>
                        <textarea value={textInput} onChange={e => setTextInput(e.target.value)}
                            placeholder="Type your text here... (supports Hindi, Tamil, etc.)" rows={3} autoFocus />
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => { addText(textInput || 'Your text here', false); setShowTextModal(false); setTextInput('') }}
                                style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
                                Body Text
                            </button>
                            <button onClick={() => { addText(textInput || 'Your Heading', true); setShowTextModal(false); setTextInput('') }}
                                style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #6366f1, #FF4D00)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
                                Heading
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── CONTEXT MENU ── */}
            {contextMenu && (
                <div className="ce-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={e => e.stopPropagation()}>
                    {contextMenu.hasTarget ? (
                        <>
                            <button className="ce-ctx-item" onClick={() => { duplicateSelected(); setContextMenu(null) }}>
                                <span className="material-symbols-outlined">copy_all</span> Duplicate <kbd>⌘D</kbd>
                            </button>
                            <button className="ce-ctx-item ce-ctx-danger" onClick={() => { deleteSelected(); setContextMenu(null) }}>
                                <span className="material-symbols-outlined">delete</span> Delete <kbd>⌫</kbd>
                            </button>
                            <div className="ce-ctx-divider" />
                            <button className="ce-ctx-item" onClick={() => { bringForward(); setContextMenu(null) }}>
                                <span className="material-symbols-outlined">flip_to_front</span> Bring Forward
                            </button>
                            <button className="ce-ctx-item" onClick={() => { sendBackward(); setContextMenu(null) }}>
                                <span className="material-symbols-outlined">flip_to_back</span> Send Backward
                            </button>
                        </>
                    ) : (
                        <>
                            <button className="ce-ctx-item" onClick={() => { uploadImage(); setContextMenu(null) }}>
                                <span className="material-symbols-outlined">upload</span> Upload Image
                            </button>
                            <button className="ce-ctx-item" onClick={() => { exportCanvas('png'); setContextMenu(null) }}>
                                <span className="material-symbols-outlined">download</span> Export Canvas
                            </button>
                        </>
                    )}
                </div>
            )}

            {/* ── TOAST ── */}
            {toast && <div className="ce-toast">{toast}</div>}
        </div>
    )
}

// ═══════════════════════════════════════════════════════════════
// ERROR BOUNDARY
// ═══════════════════════════════════════════════════════════════
class CanvasErrorBoundary extends Component {
    constructor(props) {
        super(props)
        this.state = { hasError: false, error: null, errorInfo: null }
    }
    static getDerivedStateFromError(error) { return { hasError: true, error } }
    componentDidCatch(error, errorInfo) {
        console.error('CanvasShell Error Boundary:', error, errorInfo)
        this.setState({ errorInfo })
    }
    render() {
        if (this.state.hasError) {
            return (
                <div style={{ background: '#0a0e1a', color: '#fff', padding: 40, height: '100vh', fontFamily: 'monospace' }}>
                    <h2 style={{ color: '#f87171' }}>⚠️ Canvas Editor Error</h2>
                    <p style={{ color: '#94a3b8' }}>The editor encountered an error:</p>
                    <pre style={{ background: '#1e1e2e', padding: 16, borderRadius: 8, overflow: 'auto', color: '#fbbf24', fontSize: 13, maxHeight: 300 }}>
                        {this.state.error?.toString()}{'\n\n'}{this.state.errorInfo?.componentStack}
                    </pre>
                    <button onClick={() => window.location.href = '/creative-studio'}
                        style={{ marginTop: 16, padding: '10px 24px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>
                        ← Back to Creative Studio
                    </button>
                </div>
            )
        }
        return this.props.children
    }
}

// ═══════════════════════════════════════════════════════════════
// EXPORT — wrapped with ErrorBoundary + SEO
// ═══════════════════════════════════════════════════════════════
export default function CanvasShell() {
    return (
        <CanvasErrorBoundary>
            <SEOHead title="Canvas Editor — Mantram AI" noIndex={true} />
            <CanvasShellInner />
        </CanvasErrorBoundary>
    )
}

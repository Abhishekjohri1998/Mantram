import React, { useState, useEffect, useRef, useCallback, Component } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useBrand } from '../context/BrandContext'
import SEOHead from '../components/SEOHead'
import FormattedText from '../components/FormattedText'
import * as fabric from 'fabric'
import { media as mediaAPI, creatives as creativesAPI, nexus as nexusAPI, voice as voiceAPI, canvasAssets, fidato as fidatoAPI, API_BASE } from '../services/api'
import { TEMPLATE_LIBRARY, TEMPLATE_CATEGORIES } from './canvasTemplates'
import { SVG_ELEMENT_CATEGORIES } from './canvasElements'
import './CanvasEditor.css'
import StoryboardBoard from './StoryboardBoard'


// ── Platform Size Presets ──

const PRESETS = [
    { id: 'ig-post', label: 'IG Post', icon: 'photo_camera', w: 1080, h: 1080 },
    { id: 'ig-story', label: 'IG Story', icon: 'smartphone', w: 1080, h: 1920 },
    { id: 'ig-reel', label: 'IG Reel', icon: 'movie', w: 1080, h: 1920 },
    { id: 'fb-post', label: 'FB Post', icon: 'thumb_up', w: 1200, h: 630 },
    { id: 'linkedin', label: 'LinkedIn', icon: 'work', w: 1200, h: 627 },
    { id: 'yt-thumb', label: 'YT Thumb', icon: 'smart_display', w: 1280, h: 720 },
    { id: 'twitter', label: 'X / Twitter', icon: 'tag', w: 1600, h: 900 },
    { id: 'carousel', label: 'Carousel', icon: 'view_carousel', w: 1080, h: 1350 },
    { id: 'banner', label: 'Web Banner', icon: 'web', w: 1920, h: 600 },
]

// ── Filters ──
const FILTERS = [
    { id: 'none', label: 'None' },
    { id: 'grayscale', label: 'B&W' },
    { id: 'sepia', label: 'Sepia' },
    { id: 'brightness', label: 'Bright' },
    { id: 'contrast', label: 'Contrast' },
    { id: 'vintage', label: 'Vintage' },
    { id: 'warm', label: 'Warm' },
    { id: 'cool', label: 'Cool' },
    { id: 'blur', label: 'Blur' },
]

// ── Expanded Color Palette ──
const COLOR_PALETTE = [
    // Row 1 – Reds
    '#ef4444','#dc2626','#b91c1c','#991b1b',
    // Row 2 – Oranges
    '#f97316','#ea580c','#c2410c','#9a3412',
    // Row 3 – Yellows / Amber
    '#f59e0b','#d97706','#b45309','#fbbf24',
    // Row 4 – Greens
    '#22c55e','#16a34a','#15803d','#166534',
    // Row 5 – Teals
    '#14b8a6','#0d9488','#0f766e','#115e59',
    // Row 6 – Blues
    '#FF4D00','#2563eb','#CC3D00','#1e40af',
    // Row 7 – Indigos
    '#6366f1','#4f46e5','#4338ca','#3730a3',
    // Row 8 – Purples
    '#FF4D00','#9333ea','#7c3aed','#6d28d9',
    // Row 9 – Pinks
    '#ec4899','#db2777','#be185d','#9d174d',
    // Row 10 – Neutrals
    '#ffffff','#f1f5f9','#94a3b8','#475569',
    '#1e293b','#0f172a','#000000','transparent',
]

// ── Shadow Presets ──
const SHADOW_PRESETS = [
    { label: 'None', color: 'rgba(0,0,0,0)', blur: 0, offsetX: 0, offsetY: 0 },
    { label: 'Subtle', color: 'rgba(0,0,0,0.15)', blur: 8, offsetX: 0, offsetY: 2 },
    { label: 'Medium', color: 'rgba(0,0,0,0.25)', blur: 16, offsetX: 0, offsetY: 4 },
    { label: 'Dramatic', color: 'rgba(0,0,0,0.4)', blur: 32, offsetX: 0, offsetY: 8 },
    { label: 'Glow', color: 'rgba(99,102,241,0.5)', blur: 24, offsetX: 0, offsetY: 0 },
    { label: 'Neon', color: 'rgba(236,72,153,0.6)', blur: 20, offsetX: 0, offsetY: 0 },
    { label: 'Hard', color: 'rgba(0,0,0,0.5)', blur: 0, offsetX: 4, offsetY: 4 },
    { label: 'Float', color: 'rgba(0,0,0,0.2)', blur: 40, offsetX: 0, offsetY: 16 },
]

// ── Element Categories (Canva-style) ──
const ELEMENT_CATEGORIES = {
    text: { label: 'Text', icon: 'text_fields', items: [
        { id: 'text', icon: 'text_fields', label: 'Body Text' },
        { id: 'heading', icon: 'title', label: 'Heading' },
        { id: 'subheading', icon: 'format_size', label: 'Subheading' },
    ]},
    shapes: { label: 'Shapes', icon: 'shapes', items: [
        { id: 'shape-rect', icon: 'rectangle', label: 'Rectangle' },
        { id: 'shape-rounded-rect', icon: 'rounded_corner', label: 'Rounded Rect' },
        { id: 'shape-circle', icon: 'circle', label: 'Circle' },
        { id: 'shape-oval', icon: 'lens', label: 'Oval' },
        { id: 'shape-triangle', icon: 'change_history', label: 'Triangle' },
        { id: 'shape-diamond', icon: 'diamond', label: 'Diamond' },
        { id: 'shape-pentagon', icon: 'pentagon', label: 'Pentagon' },
        { id: 'shape-hexagon', icon: 'hexagon', label: 'Hexagon' },
        { id: 'shape-star5', icon: 'star', label: 'Star 5pt' },
        { id: 'shape-star6', icon: 'star_half', label: 'Star 6pt' },
        { id: 'shape-heart', icon: 'favorite', label: 'Heart' },
        { id: 'shape-cross', icon: 'add', label: 'Cross' },
        { id: 'shape-arrow-right', icon: 'arrow_right_alt', label: 'Arrow →' },
        { id: 'shape-arrow-up', icon: 'arrow_upward', label: 'Arrow ↑' },
        { id: 'shape-badge', icon: 'verified', label: 'Badge' },
    ]},
    lines: { label: 'Lines', icon: 'horizontal_rule', items: [
        { id: 'shape-line', icon: 'horizontal_rule', label: 'Solid Line' },
        { id: 'shape-dashed', icon: 'more_horiz', label: 'Dashed Line' },
        { id: 'shape-dotted', icon: 'pending', label: 'Dotted Line' },
        { id: 'shape-arrow-line', icon: 'trending_flat', label: 'Arrow Line' },
        { id: 'shape-double-arrow', icon: 'swap_horiz', label: 'Double Arrow' },
    ]},
    decorative: { label: 'Decorative', icon: 'auto_awesome', items: [
        { id: 'shape-blob', icon: 'blur_on', label: 'Blob' },
        { id: 'shape-wave', icon: 'waves', label: 'Wave' },
        { id: 'shape-ring', icon: 'radio_button_unchecked', label: 'Ring' },
        { id: 'shape-half-circle', icon: 'contrast', label: 'Half Circle' },
    ]},
    quick: { label: 'Quick Add', icon: 'bolt', items: [
        { id: 'logo', icon: 'add_photo_alternate', label: 'Brand Logo' },
        { id: 'image', icon: 'image', label: 'Upload Image' },
        { id: 'ai-element', icon: 'auto_awesome', label: 'AI Element' },
    ]},
}
const ELEMENT_TYPES = Object.values(ELEMENT_CATEGORIES).flatMap(c => c.items)

function CanvasEditorInner() {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const { activeBrand } = useBrand()

    // Core state
    const mode = 'advanced' // Unified mode — all features always available
    const [activeTool, setActiveTool] = useState('select')
    const [zoom, setZoom] = useState(100)
    const [toast, setToast] = useState('')
    const [activePreset, setActivePreset] = useState('ig-post')

    // Canvas state
    const canvasRef = useRef(null)
    const fabricRef = useRef(null)
    const containerRef = useRef(null)

    // Layer tracking
    const [layers, setLayers] = useState([])
    const [selectedLayer, setSelectedLayer] = useState(null)

    // Properties of selected object
    const [objProps, setObjProps] = useState({ x: 0, y: 0, w: 0, h: 0, angle: 0, opacity: 100 })

    // Undo/Redo
    const historyRef = useRef([])
    const historyIndexRef = useRef(-1)
    const [canUndo, setCanUndo] = useState(false)
    const [canRedo, setCanRedo] = useState(false)

    // Modals
    const [showTextModal, setShowTextModal] = useState(false)
    const [showFilterPanel, setShowFilterPanel] = useState(false)
    const [textInput, setTextInput] = useState('')
    const [activeFilter, setActiveFilter] = useState('none')

    // Adjustments
    const [brightness, setBrightness] = useState(0)
    const [contrast, setContrast] = useState(0)

    // ── Asset Library State ──
    const [sidebarTab, setSidebarTab] = useState('elements')
    const [iconSearch, setIconSearch] = useState('')
    const [iconResults, setIconResults] = useState([])
    const [iconLoading, setIconLoading] = useState(false)
    const [fontSearch, setFontSearch] = useState('')
    const [stickerCategory, setStickerCategory] = useState('all')
    const [stickerSearch, setStickerSearch] = useState('')
    const [photoSearch, setPhotoSearch] = useState('')
    const [photoResults, setPhotoResults] = useState([])
    const [photoLoading, setPhotoLoading] = useState(false)
    const [photoSetupRequired, setPhotoSetupRequired] = useState(false)
    const fontLoadedRef = useRef(new Set())

    // ── Textures & Overlays (Pixabay) ──
    const [textureSearch, setTextureSearch] = useState('')
    const [textureResults, setTextureResults] = useState([])
    const [textureLoading, setTextureLoading] = useState(false)
    const [textureSetupRequired, setTextureSetupRequired] = useState(false)

    // ── AI Canvas State ──
    const [aiTool, setAiTool] = useState('prompt') // prompt | visual | retouch | background
    const [aiPrompt, setAiPrompt] = useState('')
    const [aiLoading, setAiLoading] = useState(false)
    const [aiResult, setAiResult] = useState(null) // { imageUrl, type:'image' } or { copy, type:'copy' }
    const [editHistory, setEditHistory] = useState([]) // Gemini conversational turns array
    const [aiError, setAiError] = useState('')
    const [panelOpen, setPanelOpen] = useState(false) // content panel visibility
    // Mask painting state
    const [isMaskMode, setIsMaskMode] = useState(false)
    const [maskBrushSize, setMaskBrushSize] = useState(30)
    const maskCanvasRef = useRef(null) // separate overlay canvas for mask painting
    // Retouch: replacement image upload
    const [replaceImage, setReplaceImage] = useState(null) // base64 of uploaded replacement image
    // Background tool
    const [bgAction, setBgAction] = useState('remove') // remove | replace
    const [bgPrompt, setBgPrompt] = useState('')

    // ── Resize Panel State ──
    const [showResizePanel, setShowResizePanel] = useState(false)
    const [customW, setCustomW] = useState(1080)
    const [customH, setCustomH] = useState(1080)
    const [lockRatio, setLockRatio] = useState(true)

    // ── Floating Toolbar State ──
    const [floatTool, setFloatTool] = useState(null)
    const [showGenPanel, setShowGenPanel] = useState(false)
    const [genPrompt, setGenPrompt] = useState('')
    const [genEnhance, setGenEnhance] = useState(true)
    const [genRatio, setGenRatio] = useState('1:1')
    const [genRefs, setGenRefs] = useState([])
    const [genLoading, setGenLoading] = useState(false)

    // ── Context Menu State ──
    const [contextMenu, setContextMenu] = useState(null) // { x, y, target }
    const clipboardRef = useRef(null) // stores cloned fabric objects for copy/paste

    // ── Sidebar Collapse State ──
    const [sidebarCollapsed, setSidebarCollapsed] = useState(true)

    // ── Canvas Theme (dark/light workspace background) ──
    const [canvasTheme, setCanvasTheme] = useState('dark') // 'dark' or 'light'
    const [canvasView, setCanvasView] = useState('design') // 'board' | 'design' | 'timeline'
    const [mobilePanel, setMobilePanel] = useState(null) // null | 'text' | 'ai' | 'elements' | 'photos' | 'properties'
    const [boardScenes, setBoardScenes] = useState([])
    const [storyBrief, setStoryBrief] = useState(null)

    // ── Fidato Canvas Chat State ──
    const [fidatoOpen, setFidatoOpen] = useState(false)
    const [fidatoMessages, setFidatoMessages] = useState([
        { role: 'assistant', content: 'Hey! I\'m Fidato, your AI creative partner. \ud83c\udfa8\n\nI can help you generate images, create campaigns, merge images, extract color palettes, and more. What would you like to create?' }
    ])
    const [fidatoInput, setFidatoInput] = useState('')
    const [fidatoLoading, setFidatoLoading] = useState(false)
    const fidatoMsgEndRef = useRef(null)
    const fidatoAbortRef = useRef(null)

    // ── Fidato Voice Input State ──
    const [fidatoRecording, setFidatoRecording] = useState(false)
    const [fidatoTranscribing, setFidatoTranscribing] = useState(false)
    const fidatoMediaRecorderRef = useRef(null)
    const fidatoAudioChunksRef = useRef([])
    const fidatoSilenceCheckRef = useRef(null)
    const fidatoRecordingTimerRef = useRef(null)
    const fidatoAnalyserRef = useRef(null)

    // ── Font Category State ──
    const [fontCategory, setFontCategory] = useState('all')

    // ── Image Source Tab (for Images sidebar) ──
    const [imageSourceTab, setImageSourceTab] = useState('upload')
    const [generatedImages, setGeneratedImages] = useState([])
    const [loadingBankImages, setLoadingBankImages] = useState(false)

    useEffect(() => {
        const fetchBankImages = async () => {
            const brandId = activeBrand?._id
            if (!brandId) return
            setLoadingBankImages(true)
            try {
                const data = await creativesAPI.imageBank({ category: 'generated', brandId, limit: 40 })
                if (data.success && data.images) {
                    setGeneratedImages(data.images.map(img => ({
                        url: img.imageUrl || img.thumbnailUrl,
                        label: img.title || img.type || 'Generated',
                        timestamp: new Date(img.createdAt).getTime(),
                        id: img._id,
                    })).filter(img => img.url))
                }
            } catch (err) { console.warn('Failed to load image bank:', err) }
            setLoadingBankImages(false)
        }
        fetchBankImages()
    }, [activeBrand])

    // ── AI Creative Generator State ──
    const [aiCreativeKeywords, setAiCreativeKeywords] = useState('')
    const [aiCreativeStyle, setAiCreativeStyle] = useState('modern')
    const [aiCreativeLoading, setAiCreativeLoading] = useState(false)

    // ── Selected object type tracking ──
    const [selectedObjType, setSelectedObjType] = useState(null) // 'text' | 'shape' | 'image' | null
    const [elementCategory, setElementCategory] = useState(null) // null=all or key from ELEMENT_CATEGORIES

    // Image source — read from sessionStorage (avoids 431 errors with large base64 data URIs)
    const imageUrl = searchParams.get('image') || sessionStorage.getItem('canvasEditorImage') || ''
    const canvasWidth = parseInt(searchParams.get('w')) || 1080
    const canvasHeight = parseInt(searchParams.get('h')) || 1080

    // ── Show a toast notification ──
    const showToast = useCallback((msg) => {
        setToast(msg)
        setTimeout(() => setToast(''), 2500)
    }, [])

    // ── Save canvas state for undo/redo ──
    const saveHistory = useCallback(() => {
        const fc = fabricRef.current
        if (!fc) return
        const json = JSON.stringify(fc.toJSON())
        const history = historyRef.current
        const idx = historyIndexRef.current

        // Remove any redo states
        if (idx < history.length - 1) {
            history.splice(idx + 1)
        }
        history.push(json)
        // Keep max 50
        if (history.length > 50) history.shift()
        historyIndexRef.current = history.length - 1

        setCanUndo(historyIndexRef.current > 0)
        setCanRedo(false)
    }, [])

    // ── Undo ──
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
    }, [])

    // ── Redo ──
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
    }, [])

    // ── Update layers list from canvas ──
    const updateLayers = useCallback(() => {
        const fc = fabricRef.current
        if (!fc) return
        const objs = fc.getObjects().filter(o => o.id !== 'artboard') // Exclude artboard from layers
        const layerList = objs.map((obj, i) => ({
            id: obj.id || `layer-${i}`,
            name: obj.customName || obj.type || `Layer ${i + 1}`,
            type: obj.type,
            visible: obj.visible !== false,
            obj,
        })).reverse() // Top layers first
        setLayers(layerList)
    }, [])

    // ── Update selected object properties in the UI ──
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
            // Track object type for context-sensitive right panel
            if (obj.type === 'textbox' || obj.type === 'text' || obj.type === 'i-text') {
                setSelectedObjType('text')
            } else if (obj.type === 'image') {
                setSelectedObjType('image')
            } else {
                setSelectedObjType('shape')
            }
        } else {
            setSelectedLayer(null)
            setSelectedObjType(null)
        }
    }, [])

    // Error state for initialization failures
    const [initError, setInitError] = useState(null)

    // ── Initialize Fabric.js Canvas ──
    useEffect(() => {
        if (fabricRef.current) return

        // Delay to ensure DOM is rendered and container has dimensions
        const initTimer = requestAnimationFrame(() => {
            try {
                const container = containerRef.current
                const canvasEl = canvasRef.current
                if (!container || !canvasEl) {
                    console.error('Canvas init: container or canvas element not found')
                    setInitError('Canvas container not ready')
                    return
                }

                // ── INFINITE CANVAS: Canvas fills entire container ──
                const containerW = container.clientWidth
                const containerH = container.clientHeight
                console.log('Canvas init: container size', containerW, containerH, 'artboard:', canvasWidth, canvasHeight)

                const fc = new fabric.Canvas(canvasEl, {
                    width: containerW,
                    height: containerH,
                    backgroundColor: 'transparent', // Background handled by CSS dotted grid
                    preserveObjectStacking: true,
                    selection: true,
                    fireRightClick: true,      // Enable right-click events in fabric
                })

                // Store logical dimensions (no artboard auto-created — user adds via presets)
                const scale = Math.min((containerW - 80) / canvasWidth, (containerH - 80) / canvasHeight, 1)
                fc._logicalScale = scale
                fc._logicalWidth = canvasWidth
                fc._logicalHeight = canvasHeight
                fc._artboardLeft = Math.round((containerW - Math.round(canvasWidth * scale)) / 2)
                fc._artboardTop = Math.round((containerH - Math.round(canvasHeight * scale)) / 2)

                fabricRef.current = fc
                console.log('Canvas init: Fabric.Canvas created (clean infinite canvas — no artboard)')

                // Load the image
                if (imageUrl) {
                    console.log('Canvas init: loading image...', imageUrl.substring(0, 80))
                    fabric.FabricImage.fromURL(imageUrl, { crossOrigin: 'anonymous' }).then(img => {
                        // Scale and center image in the canvas
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
                        fc.sendToBack(img) // ensure background image is at the absolute bottom
                        fc.renderAll()
                        updateLayers()
                        saveHistory()
                        console.log('Canvas init: image loaded successfully')
                    }).catch(err => {
                        console.error('Failed to load image:', err)
                        showToast('⚠️ Failed to load image — canvas is ready for new elements')
                        saveHistory()
                    })
                } else {
                    console.log('Canvas init: no image URL, starting with blank canvas')
                    saveHistory()
                }

                // Canvas events
                fc.on('selection:created', updateSelectedProps)
                fc.on('selection:updated', updateSelectedProps)
                fc.on('selection:cleared', () => { setSelectedLayer(null) })
                fc.on('object:modified', () => { updateSelectedProps(); saveHistory(); updateLayers() })
                fc.on('object:added', () => { updateLayers() })
                fc.on('object:removed', () => { updateLayers() })

                // ── RIGHT-CLICK: Direct DOM listener on the upper canvas (bulletproof) ──
                const showContextMenu = (e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    const active = fc.getActiveObject()
                    setContextMenu({
                        x: e.clientX,
                        y: e.clientY,
                        hasTarget: !!active,
                        isGroup: active?.type === 'group',
                        isMultiSelect: active?.type === 'activeselection',
                        isLocked: active?.lockMovementX || false,
                    })
                }
                // Attach to ALL canvas layers (upper canvas handles events, lower renders)
                if (fc.upperCanvasEl) fc.upperCanvasEl.addEventListener('contextmenu', showContextMenu)
                if (fc.wrapperEl) fc.wrapperEl.addEventListener('contextmenu', showContextMenu)

                // Find initial preset
                const preset = PRESETS.find(p => p.w === canvasWidth && p.h === canvasHeight)
                if (preset) setActivePreset(preset.id)

                // Set initial zoom
                setZoom(Math.round(scale * 100))

            } catch (err) {
                console.error('Canvas initialization error:', err)
                setInitError(err.message || 'Unknown error')
            }
        })

        return () => {
            cancelAnimationFrame(initTimer)
            if (fabricRef.current) {
                fabricRef.current.dispose()
                fabricRef.current = null
            }
        }
    }, []) // eslint-disable-line react-hooks/exhaustive-deps


    // ── Add/resize size guide (artboard) via preset ──
    const resizeToPreset = (preset) => {
        const fc = fabricRef.current
        if (!fc) return

        setActivePreset(preset.id)
        const canvasW = fc.width
        const canvasH = fc.height
        const maxW = canvasW - 80
        const maxH = canvasH - 80
        const scale = Math.min(maxW / preset.w, maxH / preset.h, 1)
        const displayW = Math.round(preset.w * scale)
        const displayH = Math.round(preset.h * scale)
        const artboardLeft = Math.round((canvasW - displayW) / 2)
        const artboardTop = Math.round((canvasH - displayH) / 2)

        // Create artboard if it doesn't exist, otherwise update it
        let artboard = fc.getObjects().find(o => o.id === 'artboard')
        if (!artboard) {
            artboard = new fabric.Rect({
                left: artboardLeft,
                top: artboardTop,
                width: displayW,
                height: displayH,
                fill: '#ffffff',
                rx: 4,
                ry: 4,
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
                scaleX: imgScale,
                scaleY: imgScale,
                left: artboardLeft + displayW / 2,
                top: artboardTop + displayH / 2,
            })
        }

        fc.renderAll()
        setZoom(Math.round(scale * 100))
        saveHistory()
        showToast(`📐 Resized to ${preset.label} (${preset.w}×${preset.h})`)
    }

    // ── Add text to canvas ──
    const addText = (text, isHeading = false) => {
        const fc = fabricRef.current
        if (!fc) return

        const brandFont = activeBrand?.dna?.fonts?.[0] || 'Inter'
        const brandColor = activeBrand?.dna?.colors?.[0]?.hex || '#ffffff'

        const textObj = new fabric.Textbox(text || 'Your text here', {
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
        fc.renderAll()
        saveHistory()
        showToast(`✍️ ${isHeading ? 'Heading' : 'Text'} added`)
    }

    // ── Add shape to canvas ──
    const addShape = (type) => {
        const fc = fabricRef.current
        if (!fc) return
        const brandColor = activeBrand?.dna?.colors?.[1]?.hex || activeBrand?.dna?.colors?.[0]?.hex || '#6366f1'
        const fillColor = brandColor + '40'
        const cx = fc.width / 2
        const cy = fc.height / 2
        const ts = Date.now()

        // Helper: create regular polygon points
        const regularPoly = (sides, radius) => {
            const pts = []
            for (let i = 0; i < sides; i++) {
                const angle = (i * 2 * Math.PI / sides) - Math.PI / 2
                pts.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius })
            }
            return pts
        }

        // Helper: create star points
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
            case 'shape-arrow-line':
                const alGroup = new fabric.Group([
                    new fabric.Line([0, 0, 250, 0], { stroke: brandColor, strokeWidth: 3 }),
                    new fabric.Polygon([{ x: 0, y: -10 }, { x: 20, y: 0 }, { x: 0, y: 10 }], { fill: brandColor, left: 250, top: -10 }),
                ], { customName: 'Arrow Line', id: `aline-${ts}` })
                shape = alGroup
                break
            case 'shape-double-arrow':
                const daGroup = new fabric.Group([
                    new fabric.Polygon([{ x: 0, y: 0 }, { x: -20, y: -10 }, { x: -20, y: 10 }], { fill: brandColor }),
                    new fabric.Line([0, 0, 250, 0], { stroke: brandColor, strokeWidth: 3 }),
                    new fabric.Polygon([{ x: 250, y: 0 }, { x: 270, y: -10 }, { x: 270, y: 10 }], { fill: brandColor }),
                ], { customName: 'Double Arrow', id: `darrow-${ts}` })
                shape = daGroup
                break
            case 'shape-blob':
                shape = new fabric.Path('M 80 0 C 120 -20, 140 40, 100 80 C 60 120, -20 100, -40 60 C -60 20, 40 -40, 80 0 Z', { fill: fillColor, stroke: brandColor, strokeWidth: 2, customName: 'Blob', id: `blob-${ts}`, scaleX: 1.2, scaleY: 1.2 })
                break
            case 'shape-wave':
                shape = new fabric.Path('M 0 50 Q 50 0, 100 50 T 200 50 T 300 50', { fill: 'transparent', stroke: brandColor, strokeWidth: 4, customName: 'Wave', id: `wave-${ts}` })
                break
            case 'shape-ring':
                const ringG = new fabric.Group([
                    new fabric.Circle({ radius: 80, fill: 'transparent', stroke: brandColor, strokeWidth: 10 }),
                ], { customName: 'Ring', id: `ring-${ts}` })
                shape = ringG
                break
            case 'shape-half-circle':
                shape = new fabric.Path('M -80 0 A 80 80 0 0 1 80 0 Z', { fill: fillColor, stroke: brandColor, strokeWidth: 2, customName: 'Half Circle', id: `half-${ts}` })
                break
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
    }

    // ── Add brand logo ──
    const addLogo = () => {
        const fc = fabricRef.current
        const logoUrl = activeBrand?.dna?.logo?.url
        if (!fc || !logoUrl) {
            showToast('⚠️ No brand logo found')
            return
        }

        fabric.FabricImage.fromURL(logoUrl, { crossOrigin: 'anonymous' }).then(img => {
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
            fc.renderAll()
            saveHistory()
            showToast('🏷️ Brand logo added')
        }).catch(() => showToast('⚠️ Failed to load logo'))
    }

    // ── Upload image as layer ──
    const uploadImage = () => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = 'image/*'
        input.onchange = (e) => {
            const file = e.target.files?.[0]
            if (!file) return
            const reader = new FileReader()
            reader.onload = async (ev) => {
                const fc = fabricRef.current
                if (!fc) return
                // Upload to S3 first, fall back to base64
                let imgUrl = ev.target.result
                try {
                    const { url } = await mediaAPI.upload({ imageData: ev.target.result, folder: 'canvas-layers' })
                    imgUrl = url
                } catch (e) { console.warn('S3 upload failed for canvas layer, using base64:', e.message) }
                fabric.FabricImage.fromURL(imgUrl, { crossOrigin: 'anonymous' }).then(img => {
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
                    fc.renderAll()
                    saveHistory()
                    showToast('📷 Image added')
                })
            }
            reader.readAsDataURL(file)
        }
        input.click()
    }

    // ── Delete selected object ──
    const deleteSelected = () => {
        const fc = fabricRef.current
        if (!fc) return
        const obj = fc.getActiveObject()
        if (obj) {
            fc.remove(obj)
            fc.renderAll()
            saveHistory()
            showToast('🗑️ Deleted')
        }
    }

    // ── Duplicate selected ──
    const duplicateSelected = () => {
        const fc = fabricRef.current
        if (!fc) return
        const obj = fc.getActiveObject()
        if (!obj) return
        obj.clone().then(cloned => {
            cloned.set({
                left: (obj.left || 0) + 20,
                top: (obj.top || 0) + 20,
                id: `clone-${Date.now()}`,
                customName: (obj.customName || 'Object') + ' Copy',
            })
            fc.add(cloned)
            fc.setActiveObject(cloned)
            fc.renderAll()
            saveHistory()
            showToast('📋 Duplicated')
        })
    }

    // ── Layer ordering ──
    const bringForward = () => {
        const fc = fabricRef.current
        const obj = fc?.getActiveObject()
        if (obj) { fc.bringObjectForward(obj); fc.renderAll(); updateLayers(); saveHistory() }
    }
    const sendBackward = () => {
        const fc = fabricRef.current
        const obj = fc?.getActiveObject()
        if (obj) { fc.sendObjectBackwards(obj); fc.renderAll(); updateLayers(); saveHistory() }
    }

    // ── Copy selected object(s) ──
    const copySelected = useCallback(() => {
        const fc = fabricRef.current
        const obj = fc?.getActiveObject()
        if (!obj) return
        obj.clone().then(cloned => {
            clipboardRef.current = cloned
            showToast('📋 Copied')
        })
    }, [showToast])

    // ── Cut selected object(s) ──
    const cutSelected = useCallback(() => {
        const fc = fabricRef.current
        const obj = fc?.getActiveObject()
        if (!obj) return
        obj.clone().then(cloned => {
            clipboardRef.current = cloned
            fc.remove(obj)
            fc.renderAll()
            saveHistory()
            updateLayers()
            showToast('✂️ Cut')
        })
    }, [saveHistory, updateLayers, showToast])

    // ── Paste from clipboard ──
    const pasteFromClipboard = useCallback(() => {
        const fc = fabricRef.current
        const clip = clipboardRef.current
        if (!fc || !clip) return
        clip.clone().then(cloned => {
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
            // Offset clipboard for next paste
            clipboardRef.current = clip
            clip.set({ left: (clip.left || 0) + 20, top: (clip.top || 0) + 20 })
            fc.setActiveObject(cloned)
            fc.renderAll()
            saveHistory()
            updateLayers()
            showToast('📄 Pasted')
        })
    }, [saveHistory, updateLayers, showToast])

    // ── Group selected objects ──
    const groupSelected = useCallback(() => {
        const fc = fabricRef.current
        const active = fc?.getActiveObject()
        if (!active || active.type !== 'activeselection') { showToast('⚠️ Select multiple objects to group'); return }
        const group = active.toGroup()
        group._customName = 'Group'
        fc.renderAll()
        saveHistory()
        updateLayers()
        showToast('📐 Grouped')
    }, [saveHistory, updateLayers, showToast])

    // ── Ungroup a group ──
    const ungroupSelected = useCallback(() => {
        const fc = fabricRef.current
        const active = fc?.getActiveObject()
        if (!active || active.type !== 'group') { showToast('⚠️ Select a group to ungroup'); return }
        active.toActiveSelection()
        fc.renderAll()
        saveHistory()
        updateLayers()
        showToast('📐 Ungrouped')
    }, [saveHistory, updateLayers, showToast])

    // ── Merge/flatten selected objects into a single raster image ──
    const mergeSelected = useCallback(() => {
        const fc = fabricRef.current
        const active = fc?.getActiveObject()
        if (!active) return
        const objects = active.type === 'activeselection' ? active.getObjects() : [active]
        if (objects.length < 2) { showToast('⚠️ Select 2+ objects to merge'); return }

        // Calculate bounding box of selection
        const bounds = active.getBoundingRect()
        const tmpCanvas = document.createElement('canvas')
        tmpCanvas.width = bounds.width
        tmpCanvas.height = bounds.height
        const ctx = tmpCanvas.getContext('2d')

        // Render selection to temporary canvas
        fc.discardActiveObject()
        const origVp = fc.viewportTransform.slice()
        fc.viewportTransform = [1, 0, 0, 1, -bounds.left, -bounds.top]
        fc.renderAll()
        ctx.drawImage(fc.getElement(), 0, 0)
        fc.viewportTransform = origVp
        
        const dataUrl = tmpCanvas.toDataURL('image/png')
        
        // Remove original objects
        objects.forEach(o => fc.remove(o))
        
        // Add merged image
        fabric.FabricImage.fromURL(dataUrl, { crossOrigin: 'anonymous' }).then(img => {
            img.set({ left: bounds.left, top: bounds.top })
            img._customName = 'Merged Layer'
            fc.add(img)
            fc.setActiveObject(img)
            fc.renderAll()
            saveHistory()
            updateLayers()
            showToast('🔀 Merged into single image')
        })
    }, [saveHistory, updateLayers, showToast])

    // ── Export selected objects as PNG download ──
    const exportSelected = useCallback(() => {
        const fc = fabricRef.current
        const active = fc?.getActiveObject()
        if (!active) return

        const bounds = active.getBoundingRect()
        const tmpCanvas = document.createElement('canvas')
        tmpCanvas.width = bounds.width
        tmpCanvas.height = bounds.height
        const ctx = tmpCanvas.getContext('2d')

        const origVp = fc.viewportTransform.slice()
        fc.viewportTransform = [1, 0, 0, 1, -bounds.left, -bounds.top]
        // Temporarily hide non-selected objects
        const allObjs = fc.getObjects()
        const selectedObjs = active.type === 'activeselection' ? active.getObjects() : [active]
        const hiddenObjs = allObjs.filter(o => !selectedObjs.includes(o))
        hiddenObjs.forEach(o => { o._wasVisible = o.visible; o.visible = false })
        const origBg = fc.backgroundColor
        fc.backgroundColor = 'transparent'
        fc.renderAll()
        ctx.drawImage(fc.getElement(), 0, 0)
        // Restore
        hiddenObjs.forEach(o => { o.visible = o._wasVisible !== false })
        fc.backgroundColor = origBg
        fc.viewportTransform = origVp
        fc.renderAll()

        const link = document.createElement('a')
        link.download = `canvas-selection-${Date.now()}.png`
        link.href = tmpCanvas.toDataURL('image/png')
        link.click()
        showToast('💾 Selection exported!')
    }, [showToast])

    // ── Save individual object as image download ──
    const saveObjectAsImage = useCallback(() => {
        const fc = fabricRef.current
        const obj = fc?.getActiveObject()
        if (!obj) return
        exportSelected() // Reuse export selected logic
    }, [exportSelected])

    // ── Lock/Unlock toggle ──
    const toggleLock = useCallback(() => {
        const fc = fabricRef.current
        const obj = fc?.getActiveObject()
        if (!obj) return
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
        fc.renderAll()
        showToast(isLocked ? '🔓 Unlocked' : '🔒 Locked')
    }, [showToast])

    // ── Right-click handler ──
    const handleCanvasContextMenu = useCallback((e) => {
        e.preventDefault()
        e.stopPropagation()
        const fc = fabricRef.current
        if (!fc) return

        // Fabric.js already selects the object on mousedown (which fires before contextmenu)
        const active = fc.getActiveObject()

        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            hasTarget: !!active,
            isGroup: active?.type === 'group',
            isMultiSelect: active?.type === 'activeselection',
            isLocked: active?.lockMovementX || false,
        })
    }, [])

    // ── Close context menu ──
    const closeContextMenu = useCallback(() => setContextMenu(null), [])

    // ── Toggle canvas dark/light theme ──
    const toggleCanvasTheme = useCallback(() => {
        setCanvasTheme(prev => prev === 'dark' ? 'light' : 'dark')
    }, [])

    // ── Apply filter to background image ──
    const applyFilter = (filterId) => {
        const fc = fabricRef.current
        if (!fc) return
        // Apply to selected object, or first image on canvas
        let target = fc.getActiveObject()
        if (!target || target.type !== 'image') {
            target = fc.getObjects().find(o => o.type === 'image')
        }
        if (!target || target.type !== 'image') return

        setActiveFilter(filterId)

        // Clear existing filters
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
        fc.renderAll()
        saveHistory()
    }

    // ── Apply brightness/contrast adjustments to selected image ──
    const applyAdjustments = useCallback(() => {
        const fc = fabricRef.current
        if (!fc) return
        let target = fc.getActiveObject()
        if (!target || target.type !== 'image') {
            target = fc.getObjects().find(o => o.type === 'image')
        }
        if (!target || target.type !== 'image') return

        target.filters = []
        if (brightness !== 0) target.filters.push(new fabric.filters.Brightness({ brightness: brightness / 100 }))
        if (contrast !== 0) target.filters.push(new fabric.filters.Contrast({ contrast: contrast / 100 }))
        target.applyFilters()
        fc.renderAll()
    }, [brightness, contrast])

    useEffect(() => { applyAdjustments() }, [brightness, contrast, applyAdjustments])

    // ── Update object property ──
    const updateProp = (prop, value) => {
        const fc = fabricRef.current
        const obj = fc?.getActiveObject()
        if (!obj) return

        const numVal = parseFloat(value)
        if (prop === 'opacity') {
            obj.set('opacity', numVal / 100)
        } else if (prop === 'angle') {
            obj.set('angle', numVal)
        } else if (prop === 'x') {
            obj.set('left', numVal)
        } else if (prop === 'y') {
            obj.set('top', numVal)
        } else if (prop === 'w') {
            const currentW = (obj.width || 1) * (obj.scaleX || 1)
            obj.set('scaleX', (obj.scaleX || 1) * (numVal / currentW))
        } else if (prop === 'h') {
            const currentH = (obj.height || 1) * (obj.scaleY || 1)
            obj.set('scaleY', (obj.scaleY || 1) * (numVal / currentH))
        }

        obj.setCoords()
        fc.renderAll()
        updateSelectedProps()
    }

    // ── Zoom ──
    const handleZoom = (delta) => {
        const newZoom = Math.max(25, Math.min(300, zoom + delta))
        setZoom(newZoom)
        const fc = fabricRef.current
        if (!fc) return
        const scaleFactor = newZoom / 100
        fc.setZoom(scaleFactor)
        fc.renderAll()
    }

    // ── Export ──
    const exportCanvas = (format = 'png') => {
        const fc = fabricRef.current
        if (!fc) return

        // Deselect all objects so selection handles don't appear in export
        fc.discardActiveObject()
        fc.renderAll()

        const artboard = fc.getObjects().find(o => o.id === 'artboard')
        let dataUrl

        if (artboard) {
            // Export only the artboard area
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
            // No artboard — export full canvas
            const currentZoom = fc.getZoom()
            fc.setZoom(1)
            fc.renderAll()
            dataUrl = fc.toDataURL({ format, quality: format === 'jpeg' ? 0.92 : 1 })
            fc.setZoom(currentZoom)
            fc.renderAll()
        }

        const a = document.createElement('a')
        a.href = dataUrl
        a.download = `${activeBrand?.name || 'creative'}-${activePreset}.${format}`
        a.click()
        showToast(`💾 Exported as ${format.toUpperCase()}`)
    }

    // ── Select a layer ──
    const selectLayer = (layer) => {
        const fc = fabricRef.current
        if (!fc) return
        fc.setActiveObject(layer.obj)
        fc.renderAll()
        updateSelectedProps()
    }

    // ── Toggle layer visibility ──
    const toggleLayerVisibility = (layer) => {
        layer.obj.set('visible', !layer.obj.visible)
        const fc = fabricRef.current
        fc?.renderAll()
        updateLayers()
    }

    // ── Handle element add in advanced mode ──
    const handleAddElement = (type) => {
        if (type.startsWith('shape-')) { addShape(type); return }
        switch (type) {
            case 'text': addText('', false); break
            case 'heading': addText('', true); break
            case 'subheading': {
                const fc = fabricRef.current
                if (!fc) return
                const subText = new fabric.Textbox('Subheading', {
                    left: fc.width / 2, top: fc.height / 2,
                    originX: 'center', originY: 'center',
                    fontSize: 28, fontWeight: '600', fontFamily: 'DM Sans',
                    fill: '#94a3b8', textAlign: 'center', width: fc.width * 0.6,
                    editable: true, customName: 'Subheading', id: `sub-${Date.now()}`,
                })
                fc.add(subText); fc.setActiveObject(subText); fc.renderAll(); saveHistory()
                showToast('✏️ Subheading added')
                break
            }
            case 'logo': addLogo(); break
            case 'image': uploadImage(); break
            case 'ai-element': showToast('🤖 AI Element — use the AI Creative tool!'); break
            default: break
        }
    }

    // ── Set text color from brand palette ──
    const setTextColor = (color) => {
        const fc = fabricRef.current
        const obj = fc?.getActiveObject()
        if (obj && (obj.type === 'textbox' || obj.type === 'text' || obj.type === 'i-text')) {
            obj.set('fill', color)
            fc.renderAll()
            saveHistory()
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // ── ASSET LIBRARY HANDLERS ──
    // ══════════════════════════════════════════════════════════════════════

    // ── Iconify Search ──
    const searchIcons = useCallback(async (query) => {
        if (!query || query.length < 2) { setIconResults([]); return }
        setIconLoading(true)
        try {
            const resp = await fetch(`https://api.iconify.design/search?query=${encodeURIComponent(query)}&limit=60`)
            const data = await resp.json()
            setIconResults(data.icons || [])
        } catch (err) { console.error('Iconify search error:', err) }
        setIconLoading(false)
    }, [])

    const addIconToCanvas = useCallback(async (iconName) => {
        const fc = fabricRef.current
        if (!fc) return
        try {
            const resp = await fetch(`https://api.iconify.design/${iconName}.svg?width=120&height=120`)
            const svgText = await resp.text()
            const objs = await fabric.loadSVGFromString(svgText)
            const group = fabric.util.groupSVGElements(objs)
            group.set({ left: 100, top: 100, scaleX: 1.5, scaleY: 1.5 })
            group._customName = iconName.split(':').pop()
            fc.add(group)
            fc.setActiveObject(group)
            fc.renderAll()
            saveHistory()
            showToast(` Icon added`)
        } catch (err) {
            console.error('Icon load error:', err)
            showToast('❌ Failed to load icon')
        }
    }, [])

    // ── Google Fonts ──
    const loadGoogleFont = useCallback((fontName) => {
        if (fontLoadedRef.current.has(fontName)) return
        fontLoadedRef.current.add(fontName)
        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@400;600;700&display=swap`
        document.head.appendChild(link)
    }, [])

    const applyFontToSelected = useCallback((fontName) => {
        loadGoogleFont(fontName)
        const fc = fabricRef.current
        const obj = fc?.getActiveObject()
        if (obj && obj.fontFamily !== undefined) {
            setTimeout(() => {
                obj.set('fontFamily', fontName)
                fc.renderAll()
                saveHistory()
                showToast(`🔤 Font: ${fontName}`)
            }, 300)
        } else {
            showToast(`🔤 Select a text element first`)
        }
    }, [])

    // ── Sticker Catalog (Lucide/Tabler icon names organized by category) ──
    const STICKER_CATEGORIES = {
        all: 'All',
        social: 'Social',
        business: 'Business',
        arrows: 'Arrows',
        weather: 'Weather',
        tech: 'Tech',
        nature: 'Nature',
        shapes: 'Shapes',
        emoji: 'Emoji',
    }

    const STICKER_DATA = {
        social: ['heart', 'thumbs-up', 'message-circle', 'share-2', 'star', 'bookmark', 'bell', 'user', 'users', 'at-sign', 'hash', 'send', 'link', 'globe', 'instagram', 'twitter', 'youtube', 'facebook'],
        business: ['briefcase', 'trending-up', 'bar-chart-2', 'pie-chart', 'dollar-sign', 'credit-card', 'shopping-cart', 'shopping-bag', 'package', 'truck', 'award', 'target', 'flag', 'calendar', 'clock', 'check-circle'],
        arrows: ['arrow-up', 'arrow-down', 'arrow-left', 'arrow-right', 'chevron-up', 'chevron-down', 'chevrons-up', 'chevrons-down', 'corner-up-right', 'external-link', 'move', 'maximize-2', 'minimize-2', 'rotate-cw'],
        weather: ['sun', 'moon', 'cloud', 'cloud-rain', 'cloud-snow', 'cloud-lightning', 'wind', 'droplets', 'thermometer', 'umbrella', 'rainbow', 'snowflake'],
        tech: ['smartphone', 'monitor', 'laptop', 'tablet', 'cpu', 'hard-drive', 'wifi', 'bluetooth', 'battery', 'code', 'terminal', 'database', 'server', 'cloud', 'download', 'upload'],
        nature: ['leaf', 'flower-2', 'tree-pine', 'mountain', 'waves', 'flame', 'zap', 'sparkles', 'gem', 'feather', 'bird', 'fish', 'bug', 'paw-print'],
        shapes: ['circle', 'square', 'triangle', 'hexagon', 'octagon', 'pentagon', 'diamond', 'star', 'heart', 'shield'],
        emoji: ['smile', 'laugh', 'frown', 'meh', 'angry', 'party-popper', 'rocket', 'fire', 'crown', 'gift', 'music', 'camera', 'headphones', 'coffee', 'pizza', 'ice-cream-cone'],
    }

    const getFilteredStickers = useCallback(() => {
        let stickers = []
        if (stickerCategory === 'all') {
            Object.values(STICKER_DATA).forEach(arr => stickers.push(...arr))
        } else {
            stickers = STICKER_DATA[stickerCategory] || []
        }
        if (stickerSearch) {
            stickers = stickers.filter(s => s.includes(stickerSearch.toLowerCase()))
        }
        return [...new Set(stickers)]
    }, [stickerCategory, stickerSearch])

    const addStickerToCanvas = useCallback(async (name) => {
        const fc = fabricRef.current
        if (!fc) return
        try {
            const resp = await fetch(`https://api.iconify.design/lucide:${name}.svg?width=100&height=100&color=%236366f1`)
            const svgText = await resp.text()
            const objs = await fabric.loadSVGFromString(svgText)
            const group = fabric.util.groupSVGElements(objs)
            group.set({ left: 150, top: 150, scaleX: 2, scaleY: 2 })
            group._customName = name
            fc.add(group)
            fc.setActiveObject(group)
            fc.renderAll()
            saveHistory()
            showToast(` Sticker added`)
        } catch (err) {
            console.error('Sticker load error:', err)
            showToast('❌ Failed to load sticker')
        }
    }, [])

    // ── Unsplash Photo Search ──
    const searchPhotos = useCallback(async (query) => {
        if (!query || query.length < 2) return
        setPhotoLoading(true)
        try {
            const data = await canvasAssets.getPhotos({ q: query, per_page: 20 })
            if (data.setup_required) {
                setPhotoSetupRequired(true)
                setPhotoResults([])
            } else {
                setPhotoSetupRequired(false)
                setPhotoResults(data.results || [])
            }
        } catch (err) { console.error('Photo search error:', err) }
        setPhotoLoading(false)
    }, [])

    const addPhotoToCanvas = useCallback(async (photo) => {
        const fc = fabricRef.current
        if (!fc) return
        showToast('⏳ Loading photo...')
        try {
            const img = await fabric.FabricImage.fromURL(photo.small || photo.regular, { crossOrigin: 'anonymous' })
            const maxDim = Math.min(fc._logicalWidth, fc._logicalHeight) * 0.5
            const scale = Math.min(maxDim / img.width, maxDim / img.height)
            img.set({ left: 50, top: 50, scaleX: scale, scaleY: scale })
            img._customName = photo.alt || 'Photo'
            fc.add(img)
            fc.setActiveObject(img)
            fc.renderAll()
            saveHistory()
            showToast(`📷 Photo by ${photo.author} added`)
        } catch (err) {
            console.error('Photo load error:', err)
            showToast('❌ Failed to load photo')
        }
    }, [])

    // ── Google Fonts — 200+ organized by category ──
    const FONT_CATEGORIES = {
        all: 'All',
        'sans-serif': 'Sans Serif',
        serif: 'Serif',
        display: 'Display',
        handwriting: 'Handwriting',
        monospace: 'Monospace',
        indian: '🌐 Indian',
    }

    const GOOGLE_FONTS_BY_CATEGORY = {
        'sans-serif': [
            'Inter', 'Poppins', 'Roboto', 'Open Sans', 'Montserrat', 'Lato', 'Nunito', 'Rubik',
            'Work Sans', 'Quicksand', 'Fira Sans', 'Mulish', 'DM Sans', 'Outfit', 'Space Grotesk',
            'Sora', 'Manrope', 'Plus Jakarta Sans', 'Lexend', 'Josefin Sans', 'Karla', 'Jost',
            'Urbanist', 'Bricolage Grotesque', 'Albert Sans', 'Figtree', 'Geist', 'Instrument Sans',
            'Onest', 'Red Hat Display', 'Wix Madefor Display', 'Commissioner', 'Sofia Sans',
            'Readex Pro', 'Hanken Grotesk', 'General Sans', 'Switzer', 'Cabinet Grotesk',
            'Satoshi', 'Clash Display', 'Synonym', 'Gilroy', 'Cerebri Sans',
            'Barlow', 'Barlow Condensed', 'Exo 2', 'Kanit', 'Titillium Web', 'Signika',
            'Noto Sans', 'Source Sans 3', 'PT Sans', 'Catamaran', 'Asap', 'Overpass',
            'Nunito Sans', 'Hind Siliguri', 'Cabin', 'Arimo', 'Oxygen', 'Dosis',
        ],
        serif: [
            'Playfair Display', 'Merriweather', 'Libre Baskerville', 'Crimson Text',
            'Cormorant Garamond', 'EB Garamond', 'Lora', 'Bitter', 'Spectral', 'Newsreader',
            'Source Serif 4', 'Noto Serif', 'PT Serif', 'Cardo', 'Old Standard TT',
            'Cormorant', 'Vollkorn', 'Alegreya', 'Gentium Book Plus', 'Literata',
            'DM Serif Display', 'DM Serif Text', 'IBM Plex Serif', 'Zilla Slab',
            'Libre Caslon Text', 'Sorts Mill Goudy', 'Bodoni Moda', 'Baskervville',
        ],
        display: [
            'Bebas Neue', 'Anton', 'Righteous', 'Titan One', 'Archivo Black', 'Fjalla One',
            'Abril Fatface', 'Fredoka One', 'Lobster', 'Bungee', 'Bungee Shade',
            'Monoton', 'Rubik Mono One', 'Racing Sans One', 'Audiowide', 'Orbitron',
            'Russo One', 'Black Ops One', 'Modak', 'Lilita One', 'Chango',
            'Shrikhand', 'Bungee Inline', 'Faster One', 'Nabla', 'Silkscreen',
            'Press Start 2P', 'Honk', 'Syne', 'Climate Crisis', 'Bagel Fat One',
            'Young Serif', 'Edu NSW ACT Foundation', 'Londrina Solid',
        ],
        handwriting: [
            'Pacifico', 'Dancing Script', 'Caveat', 'Sacramento', 'Great Vibes',
            'Satisfy', 'Permanent Marker', 'Kalam', 'Patrick Hand', 'Indie Flower',
            'Shadows Into Light', 'Amatic SC', 'Covered By Your Grace', 'Rock Salt',
            'Gloria Hallelujah', 'Homemade Apple', 'Reenie Beanie', 'Gochi Hand',
            'Architects Daughter', 'Coming Soon', 'Handlee', 'Pangolin', 'Mali',
            'Sriracha', 'Kaushan Script', 'Alex Brush', 'Allura', 'Rochester',
        ],
        monospace: [
            'Fira Code', 'JetBrains Mono', 'Source Code Pro', 'IBM Plex Mono',
            'Roboto Mono', 'Inconsolata', 'Space Mono', 'Ubuntu Mono', 'Courier Prime',
            'Red Hat Mono', 'DM Mono', 'Martian Mono', 'Azeret Mono',
        ],
        indian: [
            'Noto Sans Devanagari', 'Noto Sans Tamil', 'Noto Sans Telugu', 'Noto Sans Bengali',
            'Noto Sans Kannada', 'Noto Sans Malayalam', 'Noto Sans Gujarati', 'Noto Sans Gurmukhi',
            'Noto Sans Oriya', 'Hind', 'Hind Siliguri', 'Hind Vadodara', 'Hind Guntur',
            'Tiro Devanagari Hindi', 'Tiro Tamil', 'Tiro Telugu', 'Tiro Bangla',
            'Noto Serif Devanagari', 'Noto Serif Bengali', 'Noto Serif Tamil',
            'Mukta', 'Mukta Vaani', 'Mukta Mahee', 'Baloo 2', 'Baloo Bhai 2',
            'Baloo Thambi 2', 'Baloo Da 2', 'Baloo Chettan 2',
        ],
    }

    const GOOGLE_FONTS = Object.values(GOOGLE_FONTS_BY_CATEGORY).flat()

    const filteredFonts = (() => {
        let fonts = fontCategory === 'all' ? GOOGLE_FONTS : (GOOGLE_FONTS_BY_CATEGORY[fontCategory] || GOOGLE_FONTS)
        if (fontSearch) fonts = fonts.filter(f => f.toLowerCase().includes(fontSearch.toLowerCase()))
        return fonts
    })()

    // ══════════════════════════════════════════════════════════════════════
    // ── PIXABAY TEXTURES & OVERLAYS ──
    // ══════════════════════════════════════════════════════════════════════
    const TEXTURE_PRESETS = ['grunge texture', 'paper texture', 'watercolor overlay', 'gold foil', 'marble texture', 'bokeh overlay', 'dust particles', 'light leak', 'film grain', 'smoke overlay', 'glitter texture', 'wood texture']

    const searchTextures = useCallback(async (query) => {
        if (!query || query.length < 2) return
        setTextureLoading(true)
        try {
            const data = await canvasAssets.getTextures({ q: query, per_page: 24 })
            if (data.setup_required) {
                setTextureSetupRequired(true)
                setTextureResults([])
            } else {
                setTextureSetupRequired(false)
                setTextureResults(data.hits || [])
            }
        } catch (err) { console.error('Pixabay error:', err) }
        setTextureLoading(false)
    }, [])

    const addTextureToCanvas = useCallback(async (texture) => {
        const fc = fabricRef.current
        if (!fc) return
        showToast('⏳ Loading texture...')
        try {
            const img = await fabric.FabricImage.fromURL(texture.web || texture.large, { crossOrigin: 'anonymous' })
            // Scale to fill canvas as overlay
            const scaleX = fc.width / img.width
            const scaleY = fc.height / img.height
            const scale = Math.max(scaleX, scaleY)
            img.set({
                left: 0, top: 0,
                scaleX: scale, scaleY: scale,
                opacity: 0.4, // Overlay default opacity
                selectable: true,
            })
            img._customName = texture.tags?.split(',')[0]?.trim() || 'Texture'
            fc.add(img)
            fc.setActiveObject(img)
            fc.renderAll()
            saveHistory()
            showToast(` Texture overlay added (opacity: 40%)`)
        } catch (err) {
            console.error('Texture load error:', err)
            showToast('❌ Failed to load texture')
        }
    }, [])

    // ══════════════════════════════════════════════════════════════════════
    // ── BRAND ASSETS (from website scan / brand DNA) ──
    // ══════════════════════════════════════════════════════════════════════
    const getBrandAssets = useCallback(() => {
        const assets = []
        const dna = activeBrand?.dna || {}
        // Logo
        if (dna.logo?.url) {
            assets.push({ type: 'image', name: 'Brand Logo', url: dna.logo.url, icon: 'verified' })
        }
        // Favicon
        if (dna.favicon) {
            assets.push({ type: 'image', name: 'Favicon', url: dna.favicon, icon: 'star' })
        }
        // Scanned images from website (dna.images)
        if (Array.isArray(dna.images)) {
            dna.images.slice(0, 20).forEach((img, i) => {
                const url = typeof img === 'string' ? img : img.url
                if (url) assets.push({ type: 'image', name: `Web Image ${i + 1}`, url, icon: 'image' })
            })
        }
        // Brand images downloaded during onboarding (activeBrand.brandImages)
        if (Array.isArray(activeBrand?.brandImages)) {
            activeBrand.brandImages.forEach((img, i) => {
                const url = typeof img === 'string' ? img : img.url
                if (url && !assets.some(a => a.url === url)) {
                    assets.push({ type: 'image', name: img.name || `Brand Image ${i + 1}`, url, icon: 'image' })
                }
            })
        }
        // Product images from catalog
        if (Array.isArray(activeBrand?.products)) {
            activeBrand.products.slice(0, 10).forEach(p => {
                if (p.imageUrl) {
                    assets.push({ type: 'image', name: p.name || 'Product', url: p.imageUrl, icon: 'shopping_bag' })
                }
            })
        }
        return assets
    }, [activeBrand])

    const addBrandAssetToCanvas = useCallback(async (asset) => {
        const fc = fabricRef.current
        if (!fc) return
        showToast('⏳ Loading brand asset...')
        try {
            if (asset.type === 'image') {
                const img = await fabric.FabricImage.fromURL(asset.url, { crossOrigin: 'anonymous' })
                const maxDim = Math.min(fc.width, fc.height) * 0.3
                const scale = Math.min(maxDim / img.width, maxDim / img.height)
                img.set({ left: 100, top: 100, scaleX: scale, scaleY: scale })
                img._customName = asset.name
                fc.add(img)
                fc.setActiveObject(img)
            }
            fc.renderAll()
            saveHistory()
            showToast(` ${asset.name} added`)
        } catch (err) {
            console.error('Brand asset error:', err)
            showToast('❌ Failed to load asset')
        }
    }, [])

    const addBrandColorBlock = useCallback((hex) => {
        const fc = fabricRef.current
        if (!fc) return
        const rect = new fabric.Rect({
            left: 100, top: 100, width: 200, height: 200,
            fill: hex, rx: 12, ry: 12,
        })
        rect._customName = `Color: ${hex}`
        fc.add(rect)
        fc.setActiveObject(rect)
        fc.renderAll()
        saveHistory()
        showToast(` Color block added`)
    }, [])

    // ══════════════════════════════════════════════════════════════════════
    // ── GRADIENT PRESETS (Fabric.js built-in) ──
    // ══════════════════════════════════════════════════════════════════════
    const GRADIENT_PRESETS = [
        { name: 'Sunset Blaze', colors: ['#f12711', '#f5af19'], angle: 45 },
        { name: 'Ocean Deep', colors: ['#2E3192', '#1BFFFF'], angle: 135 },
        { name: 'Purple Rain', colors: ['#7F00FF', '#E100FF'], angle: 90 },
        { name: 'Emerald', colors: ['#348F50', '#56B4D3'], angle: 120 },
        { name: 'Flamingo', colors: ['#f953c6', '#b91d73'], angle: 45 },
        { name: 'Midnight', colors: ['#232526', '#414345'], angle: 180 },
        { name: 'Warm Dusk', colors: ['#ff6e7f', '#bfe9ff'], angle: 90 },
        { name: 'Aqua Marine', colors: ['#1A2980', '#26D0CE'], angle: 135 },
        { name: 'Neon Glow', colors: ['#00f260', '#0575e6'], angle: 45 },
        { name: 'Peach', colors: ['#ffecd2', '#fcb69f'], angle: 90 },
        { name: 'Rose Gold', colors: ['#F4C4F3', '#FC67FA'], angle: 135 },
        { name: 'Slate', colors: ['#2c3e50', '#4ca1af'], angle: 180 },
        { name: 'Citrus', colors: ['#FDC830', '#F37335'], angle: 45 },
        { name: 'Berry', colors: ['#8E2DE2', '#4A00E0'], angle: 90 },
        { name: 'Arctic', colors: ['#E0EAFC', '#CFDEF3'], angle: 135 },
        { name: 'Lava', colors: ['#f12711', '#f5af19'], angle: 0 },
    ]

    const addGradientToCanvas = useCallback((preset) => {
        const fc = fabricRef.current
        if (!fc) return
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
        fc.renderAll()
        saveHistory()
        showToast(`🌈 ${preset.name} gradient added`)
    }, [])

    const applyGradientToSelected = useCallback((preset) => {
        const fc = fabricRef.current
        const obj = fc?.getActiveObject()
        if (!obj) { showToast('Select an element first'); return }
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
        fc.renderAll()
        saveHistory()
        showToast(`🌈 ${preset.name} applied`)
    }, [])

    // ══════════════════════════════════════════════════════════════════════
    // ── AI CANVAS HANDLERS ──
    // ══════════════════════════════════════════════════════════════════════

    // Helper: Get mask as black/white base64 from Fabric.js free-draw strokes
    const getMaskDataUrl = useCallback(() => {
        const fc = fabricRef.current
        if (!fc) return null
        // Create a temp canvas same size, render only free-draw paths as white on black
        const tempCanvas = document.createElement('canvas')
        tempCanvas.width = fc.width
        tempCanvas.height = fc.height
        const ctx = tempCanvas.getContext('2d')
        ctx.fillStyle = '#000000'
        ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height)
        // Collect all mask paths (drawn with free-draw brush)
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
            // Re-render the path on temp canvas
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
    }, [])

    // Helper: Clear mask strokes from canvas
    const clearMaskStrokes = useCallback(() => {
        const fc = fabricRef.current
        if (!fc) return
        const maskPaths = fc.getObjects().filter(o => o._isMaskStroke)
        maskPaths.forEach(p => fc.remove(p))
        fc.renderAll()
    }, [])

    // Toggle mask painting mode on canvas
    const toggleMaskMode = useCallback((enable) => {
        const fc = fabricRef.current
        if (!fc) return
        setIsMaskMode(enable)
        if (enable) {
            fc.isDrawingMode = true
            fc.freeDrawingBrush = new fabric.PencilBrush(fc)
            fc.freeDrawingBrush.width = maskBrushSize
            fc.freeDrawingBrush.color = 'rgba(255, 60, 60, 0.45)'
            fc.freeDrawingBrush.shadow = new fabric.Shadow({
                blur: 8, color: 'rgba(255, 0, 0, 0.3)', offsetX: 0, offsetY: 0
            })
            // Mark each new path as mask stroke
            const onPathCreated = (e) => {
                if (e.path) e.path._isMaskStroke = true
            }
            fc.on('path:created', onPathCreated)
            fc._maskPathHandler = onPathCreated
        } else {
            fc.isDrawingMode = false
            if (fc._maskPathHandler) {
                fc.off('path:created', fc._maskPathHandler)
                delete fc._maskPathHandler
            }
        }
    }, [maskBrushSize])

    // Update brush size when changed
    useEffect(() => {
        const fc = fabricRef.current
        if (fc && isMaskMode && fc.freeDrawingBrush) {
            fc.freeDrawingBrush.width = maskBrushSize
        }
    }, [maskBrushSize, isMaskMode])

    // ── Client-side mask compositing — guarantees only masked area changes ──
    const compositeWithMask = useCallback((originalDataUrl, aiResultDataUrl, maskDataUrl) => {
        return new Promise((resolve, reject) => {
            const origImg = new Image()
            const aiImg = new Image()
            const maskImg = new Image()
            let loaded = 0
            const onAllLoaded = () => {
                loaded++
                if (loaded < 3) return
                try {
                    const w = origImg.width, h = origImg.height
                    // Draw original
                    const origCanvas = document.createElement('canvas')
                    origCanvas.width = w; origCanvas.height = h
                    const origCtx = origCanvas.getContext('2d')
                    origCtx.drawImage(origImg, 0, 0, w, h)
                    const origData = origCtx.getImageData(0, 0, w, h)
                    // Draw AI result (scaled to match original dimensions)
                    const aiCanvas = document.createElement('canvas')
                    aiCanvas.width = w; aiCanvas.height = h
                    const aiCtx = aiCanvas.getContext('2d')
                    aiCtx.drawImage(aiImg, 0, 0, w, h)
                    const aiData = aiCtx.getImageData(0, 0, w, h)
                    // Draw mask (scaled to match original dimensions)
                    const maskCanvas = document.createElement('canvas')
                    maskCanvas.width = w; maskCanvas.height = h
                    const maskCtx = maskCanvas.getContext('2d')
                    maskCtx.drawImage(maskImg, 0, 0, w, h)
                    const maskData = maskCtx.getImageData(0, 0, w, h)
                    // Composite: original × (1 - mask) + AI × mask
                    const outData = origCtx.createImageData(w, h)
                    for (let i = 0; i < maskData.data.length; i += 4) {
                        const alpha = maskData.data[i] / 255 // white=1, black=0
                        outData.data[i] = origData.data[i] * (1 - alpha) + aiData.data[i] * alpha
                        outData.data[i + 1] = origData.data[i + 1] * (1 - alpha) + aiData.data[i + 1] * alpha
                        outData.data[i + 2] = origData.data[i + 2] * (1 - alpha) + aiData.data[i + 2] * alpha
                        outData.data[i + 3] = 255 // fully opaque
                    }
                    origCtx.putImageData(outData, 0, 0)
                    resolve(origCanvas.toDataURL('image/png'))
                } catch (err) { reject(err) }
            }
            origImg.onload = onAllLoaded
            aiImg.onload = onAllLoaded
            maskImg.onload = onAllLoaded
            origImg.onerror = () => reject(new Error('Failed to load original image'))
            aiImg.onerror = () => reject(new Error('Failed to load AI result'))
            maskImg.onerror = () => reject(new Error('Failed to load mask'))
            origImg.src = originalDataUrl
            aiImg.src = aiResultDataUrl
            maskImg.src = maskDataUrl
        })
    }, [])

    // ── PROMPT TOOL: Edit entire canvas image by text ──
    const aiPromptEdit = useCallback(async () => {
        if (!aiPrompt.trim()) return
        const fc = fabricRef.current
        setAiLoading(true)
        setAiError('')
        setAiResult(null)
        try {
            let imageUrl
            // If canvas has objects, send canvas image for editing
            if (fc && fc.getObjects().length > 0) {
                // Flatten canvas natively and securely
                const canvasDataUrl = fc.toDataURL({ format: 'png', quality: 1.0 })
                showToast('🎨 Editing image with Gemini AI...')
                
                const resp = await creativesAPI.editImage({
                    imageUrl: canvasDataUrl, // base64 payload is fully supported by editImage backend
                    editPrompt: aiPrompt.trim(),
                    editHistory,
                    brandId: activeBrand?._id,
                })
                if (!resp.success) throw new Error(resp.error || 'Edit failed')
                imageUrl = resp.imageUrl

                // Append to conversation turn history
                setEditHistory(prev => [...prev, {
                    prompt: aiPrompt.trim(),
                    imageUrl: canvasDataUrl,
                    resultImageUrl: imageUrl,
                }])

            } else {
                // Empty canvas → generate a new image
                showToast('✨ Generating image with AI...')
                const data = await canvasAssets.aiGenerate({ prompt: aiPrompt, size: `${canvasWidth}x${canvasHeight}` })
                if (data.error) throw new Error(data.error)
                imageUrl = data.imageUrl
            }

            // AUTO-APPLY: Replace entire canvas content directly
            const img = await fabric.FabricImage.fromURL(imageUrl, { crossOrigin: 'anonymous' })
            const allObjects = fc.getObjects().filter(o => o.id !== 'artboard').slice()
            allObjects.forEach(o => fc.remove(o))
            const scaleX = fc.width / img.width
            const scaleY = fc.height / img.height
            const scale = Math.min(scaleX, scaleY) // Preserve aspect
            img.set({ left: fc.width / 2, top: fc.height / 2, originX: 'center', originY: 'center', scaleX: scale, scaleY: scale })
            img._customName = 'AI Edited'
            fc.add(img)
            fc.renderAll()
            saveHistory()
            setGeneratedImages(prev => [{ url: imageUrl, label: 'AI Edit', timestamp: Date.now() }, ...prev])
            setAiPrompt('') // clear prompt on success
            showToast('✨ Canvas updated with edited result')
        } catch (err) { setAiError(err.message || 'Image editing failed.') }
        setAiLoading(false)
    }, [aiPrompt, canvasWidth, canvasHeight, editHistory, activeBrand])

    // ── VISUAL TOOL: Inpaint masked area with prompt ──
    const aiVisualEdit = useCallback(async () => {
        if (!aiPrompt.trim()) return
        const fc = fabricRef.current
        if (!fc) return
        setAiLoading(true)
        setAiError('')
        setAiResult(null)
        try {
            const maskDataUrl = getMaskDataUrl()
            if (!maskDataUrl) throw new Error('Please paint a mask on the canvas first')
            // Temporarily hide mask strokes to get clean canvas export
            const maskPaths = fc.getObjects().filter(o => o._isMaskStroke)
            maskPaths.forEach(p => p.set('visible', false))
            fc.renderAll()
            const canvasDataUrl = fc.toDataURL({ format: 'png', quality: 0.9 })
            maskPaths.forEach(p => p.set('visible', true))
            fc.renderAll()

            showToast('🎨 Inpainting selected area...')
            const data = await canvasAssets.aiEditVisual({
                prompt: aiPrompt,
                imageBase64: canvasDataUrl,
                maskBase64: maskDataUrl,
            })
            if (data.error) throw new Error(data.error)

            // CLIENT-SIDE COMPOSITING — guarantees only masked area changes
            const compositedUrl = await compositeWithMask(canvasDataUrl, data.imageUrl, maskDataUrl)

            // AUTO-APPLY: Replace canvas content directly (no preview step)
            const img = await fabric.FabricImage.fromURL(compositedUrl, { crossOrigin: 'anonymous' })
            const allObjects = fc.getObjects().slice()
            allObjects.forEach(o => fc.remove(o))
            const scaleX = fc.width / img.width
            const scaleY = fc.height / img.height
            const scale = Math.max(scaleX, scaleY)
            img.set({ left: 0, top: 0, scaleX: scale, scaleY: scale })
            img._customName = 'AI Edited'
            fc.add(img)
            fc.renderAll()
            saveHistory()
            clearMaskStrokes()
            showToast('✨ Canvas updated — only masked area changed')
        } catch (err) { setAiError(err.message) }
        setAiLoading(false)
    }, [aiPrompt, getMaskDataUrl, clearMaskStrokes, compositeWithMask])

    // ── RETOUCH TOOL: Replace/retouch masked area ──
    const aiRetouchReplace = useCallback(async () => {
        const fc = fabricRef.current
        if (!fc) return
        setAiLoading(true)
        setAiError('')
        setAiResult(null)
        try {
            const maskDataUrl = getMaskDataUrl()
            if (!maskDataUrl && !replaceImage) throw new Error('Please paint a mask or upload a replacement image')
            const maskPaths = fc.getObjects().filter(o => o._isMaskStroke)
            maskPaths.forEach(p => p.set('visible', false))
            fc.renderAll()
            const canvasDataUrl = fc.toDataURL({ format: 'png', quality: 0.9 })
            maskPaths.forEach(p => p.set('visible', true))
            fc.renderAll()

            showToast('🔧 Retouching selected area...')
            const data = await canvasAssets.aiRetouch({
                prompt: aiPrompt || 'Retouch and clean up this area naturally',
                imageBase64: canvasDataUrl,
                maskBase64: maskDataUrl,
                replaceImageBase64: replaceImage,
            })
            if (data.error) throw new Error(data.error)

            // CLIENT-SIDE COMPOSITING — guarantees only masked area changes
            let finalUrl = data.imageUrl
            if (maskDataUrl) {
                finalUrl = await compositeWithMask(canvasDataUrl, data.imageUrl, maskDataUrl)
            }

            // AUTO-APPLY: Replace canvas content directly (no preview step)
            const img = await fabric.FabricImage.fromURL(finalUrl, { crossOrigin: 'anonymous' })
            const allObjects = fc.getObjects().slice()
            allObjects.forEach(o => fc.remove(o))
            const scaleX = fc.width / img.width
            const scaleY = fc.height / img.height
            const scale = Math.max(scaleX, scaleY)
            img.set({ left: 0, top: 0, scaleX: scale, scaleY: scale })
            img._customName = 'AI Retouched'
            fc.add(img)
            fc.renderAll()
            saveHistory()
            clearMaskStrokes()
            showToast('✨ Canvas updated — retouched area applied')
        } catch (err) { setAiError(err.message) }
        setAiLoading(false)
    }, [aiPrompt, replaceImage, getMaskDataUrl, clearMaskStrokes, compositeWithMask])

    // ── BACKGROUND TOOL: Remove or replace background ──
    const aiBackgroundEdit = useCallback(async () => {
        const fc = fabricRef.current
        if (!fc) return
        setAiLoading(true)
        setAiError('')
        setAiResult(null)
        try {
            const canvasDataUrl = fc.toDataURL({ format: 'png', quality: 0.9 })
            showToast(bgAction === 'remove' ? '🪄 Removing background...' : '🎨 Replacing background...')
            const data = await canvasAssets.aiBackground({
                imageBase64: canvasDataUrl,
                action: bgAction,
                bgPrompt: bgAction === 'replace' ? (bgPrompt || aiPrompt) : undefined,
            })
            if (data.error) throw new Error(data.error)

            // AUTO-APPLY: Replace canvas content directly
            const img = await fabric.FabricImage.fromURL(data.imageUrl, { crossOrigin: 'anonymous' })
            const allObjects = fc.getObjects().slice()
            allObjects.forEach(o => fc.remove(o))
            const scaleX = fc.width / img.width
            const scaleY = fc.height / img.height
            const scale = Math.max(scaleX, scaleY)
            img.set({ left: 0, top: 0, scaleX: scale, scaleY: scale })
            img._customName = bgAction === 'remove' ? 'BG Removed' : 'BG Replaced'
            fc.add(img)
            fc.renderAll()
            saveHistory()
            showToast(` Background ${bgAction === 'remove' ? 'removed' : 'replaced'} successfully`)
        } catch (err) { setAiError(err.message) }
        setAiLoading(false)
    }, [bgAction, bgPrompt, aiPrompt])

    // ── Add AI result to canvas ──
    const addAiResultToCanvas = useCallback(async (resultData) => {
        const fc = fabricRef.current
        if (!fc || !resultData) return
        if (resultData.type === 'image' && resultData.imageUrl) {
            showToast('⏳ Applying AI result...')
            try {
                const img = await fabric.FabricImage.fromURL(resultData.imageUrl, { crossOrigin: 'anonymous' })
                if (resultData.mode === 'inpaint') {
                    // INPAINT MODE: Replace entire canvas content with composited result
                    // Remove all existing objects (the composited image already contains everything)
                    const allObjects = fc.getObjects().slice()
                    allObjects.forEach(o => fc.remove(o))
                    // Add composited image scaled to fill canvas
                    const scaleX = fc.width / img.width
                    const scaleY = fc.height / img.height
                    const scale = Math.max(scaleX, scaleY)
                    img.set({ left: 0, top: 0, scaleX: scale, scaleY: scale })
                    img._customName = 'AI Edited'
                    fc.add(img)
                    fc.renderAll()
                    saveHistory()
                    showToast('✨ Canvas updated with AI edit')
                } else {
                    // NORMAL MODE: Add as new layer
                    const scaleX = fc.width / img.width
                    const scaleY = fc.height / img.height
                    const scale = Math.min(scaleX, scaleY)
                    img.set({ left: 0, top: 0, scaleX: scale, scaleY: scale })
                    img._customName = 'AI Generated'
                    fc.add(img)
                    fc.setActiveObject(img)
                    fc.renderAll()
                    saveHistory()
                    showToast('✨ AI image added to canvas')
                }
            } catch (err) { showToast('❌ Failed to apply image') }
        }
    }, [])

    // ── Add copy text to canvas ──
    const addCopyToCanvas = useCallback((text, isHeading = false) => {
        const fc = fabricRef.current
        if (!fc) return
        const brandFont = activeBrand?.dna?.fonts?.[0] || 'Inter'
        const brandColor = activeBrand?.dna?.colors?.[0]?.hex || '#ffffff'
        const textObj = new fabric.Textbox(text, {
            left: 80, top: isHeading ? 100 : 200,
            width: fc.width * 0.7,
            fontSize: isHeading ? 42 : 20,
            fontWeight: isHeading ? '800' : '400',
            fontFamily: brandFont,
            fill: brandColor,
            textAlign: 'center',
        })
        textObj._customName = isHeading ? 'AI Headline' : 'AI Copy'
        fc.add(textObj)
        fc.setActiveObject(textObj)
        fc.renderAll()
        saveHistory()
        showToast(` ${isHeading ? 'Headline' : 'Copy'} added`)
    }, [activeBrand])

    // ── Handle replacement image upload for Retouch tool ──
    const handleReplaceImageUpload = useCallback((e) => {
        const file = e.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = async () => {
            try {
                const { url } = await mediaAPI.upload({ imageData: reader.result, folder: 'canvas-retouch' })
                setReplaceImage(url)
            } catch { setReplaceImage(reader.result) }
        }
        reader.readAsDataURL(file)
    }, [])

    // ── Main AI submit handler ──
    const handleAiSubmit = useCallback(() => {
        switch (aiTool) {
            case 'prompt': aiPromptEdit(); break
            case 'visual': aiVisualEdit(); break
            case 'retouch': aiRetouchReplace(); break
            case 'background': aiBackgroundEdit(); break
        }
    }, [aiTool, aiPromptEdit, aiVisualEdit, aiRetouchReplace, aiBackgroundEdit])

    // ── Tab click handler (with toggle) ──
    const handleTabClick = useCallback((tabId) => {
        if (sidebarTab === tabId) {
            setPanelOpen(!panelOpen)
        } else {
            setSidebarTab(tabId)
            setPanelOpen(true)
        }
    }, [sidebarTab, panelOpen])

    // ── TEXT STYLE PRESETS ──
    const TEXT_STYLE_PRESETS = [
        // Headlines
        { id: 'bold-title', label: 'Bold Title', font: 'Bebas Neue', size: 64, weight: '700', color: '#ffffff', tracking: 2, sample: 'BOLD TITLE', cat: 'headline' },
        { id: 'modern-heading', label: 'Modern Heading', font: 'Plus Jakarta Sans', size: 48, weight: '800', color: '#ffffff', tracking: -1, sample: 'Modern Heading', cat: 'headline' },
        { id: 'elegant-serif', label: 'Elegant Serif', font: 'Playfair Display', size: 52, weight: '700', color: '#f5f0e8', tracking: 0, sample: 'Elegant Serif', cat: 'headline' },
        { id: 'condensed-impact', label: 'Condensed Impact', font: 'Barlow Condensed', size: 60, weight: '800', color: '#f87171', tracking: 1, sample: 'IMPACT', cat: 'headline' },
        { id: 'neon-glow', label: 'Neon Display', font: 'Syne', size: 48, weight: '800', color: '#22d3ee', tracking: 0, sample: 'NEON GLOW', cat: 'headline' },
        { id: 'retro-title', label: 'Retro Title', font: 'Bungee', size: 48, weight: '400', color: '#fbbf24', tracking: 1, sample: 'RETRO TITLE', cat: 'headline' },
        // Subtitles
        { id: 'minimal-sans', label: 'Minimal Sans', font: 'Inter', size: 36, weight: '300', color: '#e2e8f0', tracking: 3, sample: 'Minimal Sans', cat: 'subtitle' },
        { id: 'subtitle-light', label: 'Subtitle Light', font: 'DM Sans', size: 24, weight: '400', color: '#94a3b8', tracking: 1, sample: 'Subtle subtitle text', cat: 'subtitle' },
        { id: 'body-clean', label: 'Body Clean', font: 'Source Sans 3', size: 18, weight: '400', color: '#cbd5e1', tracking: 0, sample: 'Body text paragraph style.', cat: 'subtitle' },
        { id: 'quote-italic', label: 'Quote Italic', font: 'Lora', size: 28, weight: '400', color: '#a78bfa', tracking: 0, sample: '"An inspiring quote"', italic: true, cat: 'subtitle' },
        { id: 'caption-micro', label: 'Caption Micro', font: 'IBM Plex Mono', size: 12, weight: '500', color: '#64748b', tracking: 2, sample: 'Caption · Photo Credit', cat: 'subtitle' },
        // Social Media
        { id: 'cta-bold', label: 'CTA Button', font: 'Outfit', size: 22, weight: '700', color: '#10b981', tracking: 2, sample: 'SHOP NOW →', cat: 'social' },
        { id: 'insta-caption', label: 'Instagram Caption', font: 'Poppins', size: 20, weight: '500', color: '#e2e8f0', tracking: 0, sample: 'Living my best life ✨', cat: 'social' },
        { id: 'story-bold', label: 'Story Bold', font: 'Archivo Black', size: 56, weight: '400', color: '#f43f5e', tracking: 0, sample: 'SWIPE UP', cat: 'social' },
        { id: 'hashtag-style', label: 'Hashtag Style', font: 'Montserrat', size: 18, weight: '600', color: '#818cf8', tracking: 0, sample: '#trending #design #creative', cat: 'social' },
        { id: 'sale-banner', label: 'Sale Banner', font: 'Anton', size: 72, weight: '400', color: '#ef4444', tracking: 0, sample: 'SALE', cat: 'social' },
        // Decorative
        { id: 'script-fancy', label: 'Script Fancy', font: 'Great Vibes', size: 56, weight: '400', color: '#fbbf24', tracking: 0, sample: 'Script Fancy', cat: 'decorative' },
        { id: 'brush-stroke', label: 'Brush Stroke', font: 'Permanent Marker', size: 42, weight: '400', color: '#fb923c', tracking: 0, sample: 'BRUSH STYLE', cat: 'decorative' },
        { id: 'typewriter', label: 'Typewriter', font: 'Special Elite', size: 28, weight: '400', color: '#d4d4d8', tracking: 1, sample: 'The quick brown fox...', cat: 'decorative' },
        { id: 'retro-mono', label: 'Retro Mono', font: 'Space Mono', size: 30, weight: '700', color: '#fbbf24', tracking: 3, sample: 'RETRO // MONO', cat: 'decorative' },
        { id: 'outlined-bold', label: 'Outlined Bold', font: 'Oswald', size: 56, weight: '700', color: 'transparent', tracking: 2, sample: 'OUTLINED', cat: 'decorative', stroke: '#ffffff', strokeWidth: 2 },
        { id: 'gradient-text', label: 'Gradient Pop', font: 'Righteous', size: 48, weight: '400', color: '#818cf8', tracking: 0, sample: 'GRADIENT', cat: 'decorative' },
        // Indian Languages
        { id: 'hindi-title', label: 'Hindi Title', font: 'Noto Sans Devanagari', size: 48, weight: '700', color: '#ffffff', tracking: 0, sample: 'हिंदी शीर्षक', cat: 'indian' },
        { id: 'tamil-heading', label: 'Tamil Heading', font: 'Noto Sans Tamil', size: 42, weight: '700', color: '#fbbf24', tracking: 0, sample: 'தமிழ் தலைப்பு', cat: 'indian' },
        { id: 'bengali-text', label: 'Bengali Text', font: 'Noto Sans Bengali', size: 36, weight: '600', color: '#e2e8f0', tracking: 0, sample: 'বাংলা শিরোনাম', cat: 'indian' },
        { id: 'telugu-heading', label: 'Telugu Heading', font: 'Noto Sans Telugu', size: 42, weight: '700', color: '#a78bfa', tracking: 0, sample: 'తెలుగు శీర్షిక', cat: 'indian' },
        // Events
        { id: 'wedding-invite', label: 'Wedding Invite', font: 'Cormorant Garamond', size: 42, weight: '600', color: '#d4a574', tracking: 2, sample: 'You are Invited', cat: 'event' },
        { id: 'party-title', label: 'Party Title', font: 'Lilita One', size: 56, weight: '400', color: '#f43f5e', tracking: 0, sample: 'LET\'S PARTY!', cat: 'event' },
        { id: 'announcement', label: 'Announcement', font: 'Raleway', size: 36, weight: '800', color: '#10b981', tracking: 4, sample: 'COMING SOON', cat: 'event' },
        { id: 'festival-title', label: 'Festival Title', font: 'Baloo 2', size: 48, weight: '700', color: '#fb923c', tracking: 0, sample: 'Festival Special 🎉', cat: 'event' },
    ]

    // ── FONT COMBINATIONS (24 curated heading+body pairs) ──
    const FONT_COMBOS = [
        { id: 'fc1', heading: 'Playfair Display', body: 'Source Sans 3', style: 'Elegant Editorial', headColor: '#ffffff', bodyColor: '#94a3b8' },
        { id: 'fc2', heading: 'Bebas Neue', body: 'Montserrat', style: 'Bold Modern', headColor: '#ffffff', bodyColor: '#e2e8f0' },
        { id: 'fc3', heading: 'Abril Fatface', body: 'Lato', style: 'Striking Serif', headColor: '#fbbf24', bodyColor: '#cbd5e1' },
        { id: 'fc4', heading: 'Oswald', body: 'Quattrocento', style: 'Strong Classic', headColor: '#f87171', bodyColor: '#e2e8f0' },
        { id: 'fc5', heading: 'Poppins', body: 'Inter', style: 'Clean Tech', headColor: '#818cf8', bodyColor: '#94a3b8' },
        { id: 'fc6', heading: 'Cormorant Garamond', body: 'Proza Libre', style: 'Luxury Fashion', headColor: '#d4a574', bodyColor: '#e2e8f0' },
        { id: 'fc7', heading: 'Archivo Black', body: 'DM Sans', style: 'Impact News', headColor: '#ffffff', bodyColor: '#94a3b8' },
        { id: 'fc8', heading: 'Syne', body: 'IBM Plex Sans', style: 'Future Digital', headColor: '#22d3ee', bodyColor: '#cbd5e1' },
        { id: 'fc9', heading: 'Plus Jakarta Sans', body: 'Nunito', style: 'Friendly App', headColor: '#10b981', bodyColor: '#e2e8f0' },
        { id: 'fc10', heading: 'Righteous', body: 'Roboto', style: 'Retro Pop', headColor: '#fb923c', bodyColor: '#cbd5e1' },
        { id: 'fc11', heading: 'Outfit', body: 'Work Sans', style: 'Startup SaaS', headColor: '#818cf8', bodyColor: '#94a3b8' },
        { id: 'fc12', heading: 'Great Vibes', body: 'Open Sans', style: 'Wedding Elegant', headColor: '#fbbf24', bodyColor: '#e2e8f0' },
        { id: 'fc13', heading: 'Anton', body: 'Karla', style: 'Sports Bold', headColor: '#ef4444', bodyColor: '#e2e8f0' },
        { id: 'fc14', heading: 'Fraunces', body: 'Commissioner', style: 'Editorial Magazine', headColor: '#d4a574', bodyColor: '#94a3b8' },
        { id: 'fc15', heading: 'Bungee', body: 'Rubik', style: 'Gaming Vibes', headColor: '#22d3ee', bodyColor: '#cbd5e1' },
        { id: 'fc16', heading: 'Lora', body: 'Merriweather Sans', style: 'Book Layout', headColor: '#ffffff', bodyColor: '#94a3b8' },
        { id: 'fc17', heading: 'Raleway', body: 'Source Serif 4', style: 'Minimal Luxury', headColor: '#e2e8f0', bodyColor: '#94a3b8' },
        { id: 'fc18', heading: 'Permanent Marker', body: 'Cabin', style: 'Casual Art', headColor: '#fb923c', bodyColor: '#e2e8f0' },
        { id: 'fc19', heading: 'Space Grotesk', body: 'Space Mono', style: 'Developer Mono', headColor: '#a5b4fc', bodyColor: '#64748b' },
        { id: 'fc20', heading: 'Barlow Condensed', body: 'Barlow', style: 'Condensed Modern', headColor: '#f87171', bodyColor: '#cbd5e1' },
        { id: 'fc21', heading: 'Noto Sans Devanagari', body: 'Poppins', style: 'Hindi + English', headColor: '#ffffff', bodyColor: '#94a3b8' },
        { id: 'fc22', heading: 'Lilita One', body: 'Quicksand', style: 'Fun Playful', headColor: '#f43f5e', bodyColor: '#e2e8f0' },
        { id: 'fc23', heading: 'DM Serif Display', body: 'DM Sans', style: 'DM Pairing', headColor: '#ffffff', bodyColor: '#94a3b8' },
        { id: 'fc24', heading: 'Montserrat', body: 'Hind', style: 'Versatile Safe', headColor: '#e2e8f0', bodyColor: '#94a3b8' },
    ]

    const addFontCombo = useCallback((combo) => {
        const fc = fabricRef.current
        if (!fc) return
        loadGoogleFont(combo.heading)
        loadGoogleFont(combo.body)
        setTimeout(() => {
            const headObj = new fabric.Textbox('Your Heading Here', {
                left: fc.width / 2, top: fc.height * 0.35,
                originX: 'center', originY: 'center',
                fontSize: 48, fontWeight: '700', fontFamily: combo.heading,
                fill: combo.headColor, textAlign: 'center', width: fc.width * 0.7,
                editable: true, customName: `${combo.style} Heading`, id: `combo-h-${Date.now()}`,
            })
            const bodyObj = new fabric.Textbox('Add your body text here for a complete design.', {
                left: fc.width / 2, top: fc.height * 0.55,
                originX: 'center', originY: 'center',
                fontSize: 20, fontWeight: '400', fontFamily: combo.body,
                fill: combo.bodyColor, textAlign: 'center', width: fc.width * 0.6,
                editable: true, customName: `${combo.style} Body`, id: `combo-b-${Date.now()}`,
            })
            fc.add(headObj, bodyObj)
            fc.setActiveObject(headObj)
            fc.renderAll()
            saveHistory()
            showToast(` Font combo: ${combo.style}`)
        }, 300)
    }, [loadGoogleFont, saveHistory, showToast])

    // ── TEXT EFFECTS ──
    const addTextWithShadow = () => {
        const fc = fabricRef.current; if (!fc) return
        loadGoogleFont('Outfit')
        setTimeout(() => {
            const t = new fabric.Textbox('SHADOW TEXT', {
                left: fc.width / 2, top: fc.height / 2, originX: 'center', originY: 'center',
                fontSize: 56, fontWeight: '800', fontFamily: 'Outfit', fill: '#ffffff',
                shadow: new fabric.Shadow({ color: 'rgba(99,102,241,0.6)', blur: 20, offsetX: 4, offsetY: 4 }),
                textAlign: 'center', width: fc.width * 0.6, editable: true,
                customName: 'Shadow Text', id: `shadow-${Date.now()}`,
            })
            fc.add(t); fc.setActiveObject(t); fc.renderAll(); saveHistory()
            showToast('✨ Shadow text added')
        }, 200)
    }

    const addTextWithOutline = () => {
        const fc = fabricRef.current; if (!fc) return
        loadGoogleFont('Oswald')
        setTimeout(() => {
            const t = new fabric.Textbox('OUTLINED', {
                left: fc.width / 2, top: fc.height / 2, originX: 'center', originY: 'center',
                fontSize: 64, fontWeight: '700', fontFamily: 'Oswald', fill: 'transparent',
                stroke: '#ffffff', strokeWidth: 2, charSpacing: 30,
                textAlign: 'center', width: fc.width * 0.6, editable: true,
                customName: 'Outlined Text', id: `outline-${Date.now()}`,
            })
            fc.add(t); fc.setActiveObject(t); fc.renderAll(); saveHistory()
            showToast('✨ Outlined text added')
        }, 200)
    }

    const addTextWithGlow = () => {
        const fc = fabricRef.current; if (!fc) return
        loadGoogleFont('Syne')
        setTimeout(() => {
            const t = new fabric.Textbox('NEON GLOW', {
                left: fc.width / 2, top: fc.height / 2, originX: 'center', originY: 'center',
                fontSize: 52, fontWeight: '800', fontFamily: 'Syne', fill: '#22d3ee',
                shadow: new fabric.Shadow({ color: '#22d3ee', blur: 30, offsetX: 0, offsetY: 0 }),
                textAlign: 'center', width: fc.width * 0.6, editable: true,
                customName: 'Glow Text', id: `glow-${Date.now()}`,
            })
            fc.add(t); fc.setActiveObject(t); fc.renderAll(); saveHistory()
            showToast('✨ Neon glow text added')
        }, 200)
    }

    const addWatermark = () => {
        const fc = fabricRef.current; if (!fc) return
        const name = activeBrand?.name || 'BRAND'
        const t = new fabric.Textbox(name, {
            left: fc.width - 20, top: fc.height - 20,
            originX: 'right', originY: 'bottom',
            fontSize: 14, fontWeight: '600', fontFamily: 'Inter', fill: '#ffffff',
            opacity: 0.3, textAlign: 'right', width: 200, editable: true,
            customName: 'Watermark', id: `watermark-${Date.now()}`,
        })
        fc.add(t); fc.setActiveObject(t); fc.renderAll(); saveHistory()
        showToast('🏷️ Watermark added')
    }

    // ── CANVAS APPS (Built-in tools) ──
    const CANVAS_APPS = [
        { id: 'text-shadow', icon: 'blur_on', label: 'Shadow Text', desc: 'Text with drop shadow', action: addTextWithShadow },
        { id: 'text-outline', icon: 'format_paint', label: 'Outline Text', desc: 'Hollow outlined text', action: addTextWithOutline },
        { id: 'text-glow', icon: 'flare', label: 'Neon Glow', desc: 'Glowing neon text', action: addTextWithGlow },
        { id: 'watermark', icon: 'branding_watermark', label: 'Watermark', desc: 'Brand watermark overlay', action: addWatermark },
        { id: 'lorem', icon: 'notes', label: 'Lorem Ipsum', desc: 'Placeholder text block', action: () => {
            const fc = fabricRef.current; if (!fc) return
            const t = new fabric.Textbox('Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.', {
                left: fc.width / 2, top: fc.height / 2, originX: 'center', originY: 'center',
                fontSize: 16, fontWeight: '400', fontFamily: 'Inter', fill: '#94a3b8',
                textAlign: 'left', width: fc.width * 0.5, editable: true,
                customName: 'Lorem Ipsum', id: `lorem-${Date.now()}`,
            })
            fc.add(t); fc.setActiveObject(t); fc.renderAll(); saveHistory()
            showToast('📝 Lorem ipsum added')
        }},
        { id: 'pattern-dots', icon: 'grid_on', label: 'Dot Pattern', desc: 'Dotted background pattern', action: () => {
            const fc = fabricRef.current; if (!fc) return
            const brandColor = activeBrand?.dna?.colors?.[0]?.hex || '#6366f1'
            const patternCanvas = document.createElement('canvas')
            patternCanvas.width = 20; patternCanvas.height = 20
            const ctx = patternCanvas.getContext('2d')
            ctx.fillStyle = brandColor + '30'
            ctx.beginPath(); ctx.arc(10, 10, 2, 0, Math.PI * 2); ctx.fill()
            const pattern = new fabric.Pattern({ source: patternCanvas, repeat: 'repeat' })
            const rect = new fabric.Rect({ width: fc.width * 0.5, height: fc.height * 0.5, fill: pattern, left: fc.width / 2, top: fc.height / 2, originX: 'center', originY: 'center', customName: 'Dot Pattern', id: `pattern-${Date.now()}` })
            fc.add(rect); fc.setActiveObject(rect); fc.renderAll(); saveHistory()
            showToast('🔳 Dot pattern added')
        }},
        { id: 'pattern-stripes', icon: 'view_week', label: 'Stripe Pattern', desc: 'Striped background', action: () => {
            const fc = fabricRef.current; if (!fc) return
            const brandColor = activeBrand?.dna?.colors?.[0]?.hex || '#6366f1'
            const patternCanvas = document.createElement('canvas')
            patternCanvas.width = 20; patternCanvas.height = 20
            const ctx = patternCanvas.getContext('2d')
            ctx.fillStyle = brandColor + '20'
            ctx.fillRect(0, 0, 10, 20)
            const pattern = new fabric.Pattern({ source: patternCanvas, repeat: 'repeat' })
            const rect = new fabric.Rect({ width: fc.width * 0.5, height: fc.height * 0.5, fill: pattern, left: fc.width / 2, top: fc.height / 2, originX: 'center', originY: 'center', customName: 'Stripe Pattern', id: `stripes-${Date.now()}` })
            fc.add(rect); fc.setActiveObject(rect); fc.renderAll(); saveHistory()
            showToast('📏 Stripe pattern added')
        }},
        { id: 'social-follow', icon: 'person_add', label: 'Follow Button', desc: 'Social follow CTA badge', action: () => {
            const fc = fabricRef.current; if (!fc) return
            loadGoogleFont('Poppins')
            setTimeout(() => {
                const bg = new fabric.Rect({ width: 180, height: 48, fill: '#818cf8', rx: 24, ry: 24 })
                const txt = new fabric.Text('Follow Me', { fontSize: 18, fontWeight: '700', fontFamily: 'Poppins', fill: '#ffffff', originX: 'center', originY: 'center', left: 90, top: 24 })
                const group = new fabric.Group([bg, txt], { left: fc.width / 2, top: fc.height / 2, originX: 'center', originY: 'center', customName: 'Follow Button', id: `follow-${Date.now()}` })
                fc.add(group); fc.setActiveObject(group); fc.renderAll(); saveHistory()
                showToast('👤 Follow button added')
            }, 200)
        }},
        { id: 'social-like', icon: 'thumb_up', label: 'Like Button', desc: 'Social like CTA badge', action: () => {
            const fc = fabricRef.current; if (!fc) return
            loadGoogleFont('Poppins')
            setTimeout(() => {
                const bg = new fabric.Rect({ width: 150, height: 48, fill: '#ef4444', rx: 24, ry: 24 })
                const txt = new fabric.Text('❤️ Like', { fontSize: 18, fontWeight: '700', fontFamily: 'Poppins', fill: '#ffffff', originX: 'center', originY: 'center', left: 75, top: 24 })
                const group = new fabric.Group([bg, txt], { left: fc.width / 2, top: fc.height / 2, originX: 'center', originY: 'center', customName: 'Like Button', id: `like-${Date.now()}` })
                fc.add(group); fc.setActiveObject(group); fc.renderAll(); saveHistory()
                showToast('❤️ Like button added')
            }, 200)
        }},
        { id: 'divider', icon: 'horizontal_rule', label: 'Fancy Divider', desc: 'Decorative line divider', action: () => {
            const fc = fabricRef.current; if (!fc) return
            const brandColor = activeBrand?.dna?.colors?.[0]?.hex || '#6366f1'
            const g = new fabric.Group([
                new fabric.Line([-120, 0, -20, 0], { stroke: brandColor, strokeWidth: 2 }),
                new fabric.Circle({ radius: 5, fill: brandColor, left: -5, top: -5 }),
                new fabric.Circle({ radius: 3, fill: brandColor + '60', left: -3, top: -3 }),
                new fabric.Line([20, 0, 120, 0], { stroke: brandColor, strokeWidth: 2 }),
            ], { left: fc.width / 2, top: fc.height / 2, originX: 'center', originY: 'center', customName: 'Fancy Divider', id: `divider-${Date.now()}` })
            fc.add(g); fc.setActiveObject(g); fc.renderAll(); saveHistory()
            showToast('─ Fancy divider added')
        }},
    ]

    const [textStyleCat, setTextStyleCat] = useState('all')
    const TEXT_STYLE_CATS = { all: 'All', headline: 'Headlines', subtitle: 'Subtitles', social: 'Social', decorative: 'Decorative', indian: 'Indian', event: 'Events' }

    // ── Template State ──
    const [templateCat, setTemplateCat] = useState('all')

    // ── Interactive Apps State ──
    const [activeApp, setActiveApp] = useState(null) // null | 'curved' | 'qr' | 'chart' | 'collage' | 'brandkit' | 'countdown' | 'palette'
    const [curvedTextInput, setCurvedTextInput] = useState('CURVED TEXT')
    const [curvedTextRadius, setCurvedTextRadius] = useState(200)
    const [qrInput, setQrInput] = useState('https://example.com')

    // ── Chart Creator State ──
    const [chartType, setChartType] = useState('bar') // 'bar' | 'pie'
    const [chartData, setChartData] = useState([
        { label: 'Product A', value: 45 },
        { label: 'Product B', value: 30 },
        { label: 'Product C', value: 60 },
        { label: 'Product D', value: 25 },
    ])
    // ── Countdown State ──
    const [countdownDate, setCountdownDate] = useState('')
    const [countdownLabel, setCountdownLabel] = useState('THE BIG EVENT')
    // ── Collage State ──
    const [collageLayout, setCollageLayout] = useState(4)
    // ── Blur State ──
    const [blurIntensity, setBlurIntensity] = useState(20)

    // ── Apply Template to Canvas ──
    const applyTemplate = useCallback(async (template) => {
        const fc = fabricRef.current
        if (!fc) return
        showToast('🎨 Applying template...')
        // Clear canvas
        fc.getObjects().slice().forEach(o => fc.remove(o))
        fc.backgroundColor = template.layout?.background || '#0f172a'

        const elements = template.layout?.elements || []
        for (const el of elements) {
            if (el.type === 'text') {
                loadGoogleFont(el.font || 'Inter')
                await new Promise(r => setTimeout(r, 100))
                // For centered text, use originX:'center' so x coordinate is the center point
                const isCentered = (el.align === 'center')
                const t = new fabric.Textbox(el.text || 'Text', {
                    left: (el.x || 50) * (fc.width / (fc._logicalWidth || 1080)),
                    top: (el.y || 50) * (fc.height / (fc._logicalHeight || 1080)),
                    originX: isCentered ? 'center' : 'left',
                    originY: 'center',
                    width: (el.w || 400) * (fc.width / (fc._logicalWidth || 1080)),
                    fontSize: el.size || 32, fontWeight: el.weight || '400',
                    fontFamily: el.font || 'Inter', fill: el.color || '#ffffff',
                    textAlign: el.align || 'center', charSpacing: (el.tracking || 0) * 10,
                    editable: true, customName: el.label || 'Text',
                    id: `tpl-text-${Date.now()}-${Math.random().toString(36).substring(7)}`,
                })
                fc.add(t)
            } else if (el.type === 'rect') {
                const r = new fabric.Rect({
                    left: (el.x || 0) * (fc.width / (fc._logicalWidth || 1080)),
                    top: (el.y || 0) * (fc.height / (fc._logicalHeight || 1080)),
                    width: (el.w || 200) * (fc.width / (fc._logicalWidth || 1080)),
                    height: (el.h || 100) * (fc.height / (fc._logicalHeight || 1080)),
                    fill: el.color || '#6366f1', rx: el.radius || 0, ry: el.radius || 0,
                    stroke: el.stroke || null, strokeWidth: el.strokeWidth || 0,
                    customName: el.label || 'Shape',
                    id: `tpl-rect-${Date.now()}-${Math.random().toString(36).substring(7)}`,
                })
                fc.add(r)
            } else if (el.type === 'line') {
                const l = new fabric.Line([
                    (el.x1 || 0) * (fc.width / (fc._logicalWidth || 1080)),
                    (el.y1 || 0) * (fc.height / (fc._logicalHeight || 1080)),
                    (el.x2 || 200) * (fc.width / (fc._logicalWidth || 1080)),
                    (el.y2 || 0) * (fc.height / (fc._logicalHeight || 1080)),
                ], { stroke: el.color || '#ffffff', strokeWidth: el.strokeWidth || 2,
                    customName: el.label || 'Line',
                    id: `tpl-line-${Date.now()}-${Math.random().toString(36).substring(7)}`,
                })
                fc.add(l)
            }
        }
        fc.renderAll(); updateLayers(); saveHistory()
        showToast(` Template "${template.name}" applied with ${elements.length} elements!`)
    }, [loadGoogleFont, saveHistory, showToast, updateLayers])

    // ── Add SVG Design Element ──
    const addSvgElement = useCallback((svgEl) => {
        const fc = fabricRef.current
        if (!fc) return
        const scale = Math.min(fc.width, fc.height) * 0.4 / Math.max(svgEl.w || 400, svgEl.h || 400)
        const pathObj = new fabric.Path(svgEl.path, {
            left: fc.width / 2, top: fc.height / 2,
            originX: 'center', originY: 'center',
            scaleX: scale, scaleY: scale,
            fill: svgEl.fill || 'transparent',
            stroke: svgEl.stroke !== 'none' ? (svgEl.stroke || '#ffffff') : null,
            strokeWidth: svgEl.strokeWidth || 1,
            customName: svgEl.label || 'Design Element',
            id: `svg-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        })
        fc.add(pathObj); fc.setActiveObject(pathObj); fc.renderAll(); saveHistory()
        showToast(` ${svgEl.label} added`)
    }, [saveHistory, showToast])

    // ── Add Curved Text (Arc) ──
    const addCurvedText = useCallback(() => {
        const fc = fabricRef.current; if (!fc) return
        loadGoogleFont('Outfit')
        setTimeout(() => {
            // Create text along arc using individual letter positioning
            const text = curvedTextInput || 'CURVED TEXT'
            const radius = curvedTextRadius || 200
            const chars = text.split('')
            const angleStep = (Math.PI * 0.8) / Math.max(chars.length - 1, 1)
            const startAngle = -Math.PI * 0.4 - Math.PI / 2
            const objects = []
            chars.forEach((ch, i) => {
                const angle = startAngle + i * angleStep
                const x = radius * Math.cos(angle)
                const y = radius * Math.sin(angle)
                const t = new fabric.Text(ch, {
                    left: x, top: y, fontSize: 36, fontWeight: '800',
                    fontFamily: 'Outfit', fill: '#ffffff',
                    angle: ((angle + Math.PI / 2) * 180) / Math.PI,
                    originX: 'center', originY: 'center',
                })
                objects.push(t)
            })
            const group = new fabric.Group(objects, {
                left: fc.width / 2, top: fc.height / 2,
                originX: 'center', originY: 'center',
                customName: 'Curved Text', id: `curved-${Date.now()}`,
            })
            fc.add(group); fc.setActiveObject(group); fc.renderAll(); saveHistory()
            showToast('✨ Curved text added')
        }, 200)
    }, [curvedTextInput, curvedTextRadius, loadGoogleFont, saveHistory, showToast])

    // ── Generate QR Code (simple pixel-based) ──
    const addQrCode = useCallback(() => {
        const fc = fabricRef.current; if (!fc) return
        const data = qrInput || 'https://example.com'
        // Simple visual QR placeholder — create a pattern that looks like QR
        const size = 200
        const qrCanvas = document.createElement('canvas')
        qrCanvas.width = size; qrCanvas.height = size
        const ctx = qrCanvas.getContext('2d')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, size, size)
        ctx.fillStyle = '#000000'
        // Finder patterns (3 corners)
        const drawFinder = (x, y) => {
            ctx.fillRect(x, y, 42, 42); ctx.clearRect(x+6, y+6, 30, 30); ctx.fillRect(x+12, y+12, 18, 18)
        }
        drawFinder(6, 6); drawFinder(size-48, 6); drawFinder(6, size-48)
        // Data pixels (seeded from input string)
        let hash = 0
        for (let i = 0; i < data.length; i++) hash = ((hash << 5) - hash) + data.charCodeAt(i)
        for (let row = 0; row < 25; row++) {
            for (let col = 0; col < 25; col++) {
                if ((row < 8 && col < 8) || (row < 8 && col > 16) || (row > 16 && col < 8)) continue
                hash = (hash * 1103515245 + 12345) & 0x7fffffff
                if (hash % 3 === 0) ctx.fillRect(6 + col * 7.5, 6 + row * 7.5, 6, 6)
            }
        }
        // Add text below
        ctx.font = '10px Inter'; ctx.fillStyle = '#666666'; ctx.textAlign = 'center'
        ctx.fillText(data.substring(0, 30), size/2, size - 2)

        const dataUrl = qrCanvas.toDataURL('image/png')
        fabric.FabricImage.fromURL(dataUrl, { crossOrigin: 'anonymous' }).then(img => {
            const scale = Math.min(fc.width, fc.height) * 0.3 / size
            img.set({
                left: fc.width / 2, top: fc.height / 2,
                originX: 'center', originY: 'center',
                scaleX: scale, scaleY: scale,
                customName: 'QR Code', id: `qr-${Date.now()}`,
            })
            fc.add(img); fc.setActiveObject(img); fc.renderAll(); saveHistory()
            showToast('✨ QR Code added')
        }).catch(err => {
            console.error('QR code image load failed:', err)
            showToast('❌ QR code generation failed')
        })
    }, [qrInput, saveHistory, showToast])

    // ── Brand Kit Apply ──
    const applyBrandKit = useCallback(() => {
        const fc = fabricRef.current; if (!fc) return
        const brandFont = activeBrand?.dna?.fonts?.[0] || 'Inter'
        const brandColor = activeBrand?.dna?.colors?.[0]?.hex || '#6366f1'
        loadGoogleFont(brandFont)
        setTimeout(() => {
            let count = 0
            fc.getObjects().forEach(obj => {
                if (obj.type === 'textbox' || obj.type === 'text') {
                    obj.set({ fontFamily: brandFont, fill: brandColor }); count++
                }
            })
            fc.renderAll(); saveHistory()
            showToast(` Brand kit applied to ${count} text elements`)
        }, 300)
    }, [activeBrand, loadGoogleFont, saveHistory, showToast])

    // ── Chart Creator ──
    const addChart = useCallback(() => {
        const fc = fabricRef.current; if (!fc) return
        const brandColor = activeBrand?.dna?.colors?.[0]?.hex || '#6366f1'
        const maxVal = Math.max(...chartData.map(d => d.value), 1)
        const ts = Date.now()

        if (chartType === 'bar') {
            // Bar chart
            const barW = 50, gap = 20, chartH = 200, baseY = chartH + 40
            const totalW = chartData.length * (barW + gap) - gap
            const objects = []
            // Axis line
            objects.push(new fabric.Line([0, baseY, totalW + 20, baseY], { stroke: '#475569', strokeWidth: 2 }))
            const colors = ['#6366f1', '#22d3ee', '#f59e0b', '#ef4444', '#22c55e', '#a78bfa']
            chartData.forEach((d, i) => {
                const barH = (d.value / maxVal) * chartH
                const x = i * (barW + gap)
                // Bar
                objects.push(new fabric.Rect({
                    left: x, top: baseY - barH, width: barW, height: barH,
                    fill: colors[i % colors.length], rx: 4, ry: 4,
                }))
                // Value label
                objects.push(new fabric.Text(String(d.value), {
                    left: x + barW / 2, top: baseY - barH - 16,
                    fontSize: 12, fontWeight: '700', fontFamily: 'Inter',
                    fill: '#e2e8f0', originX: 'center',
                }))
                // Category label
                objects.push(new fabric.Text(d.label, {
                    left: x + barW / 2, top: baseY + 8,
                    fontSize: 10, fontWeight: '500', fontFamily: 'Inter',
                    fill: '#94a3b8', originX: 'center',
                }))
            })
            const group = new fabric.Group(objects, {
                left: fc.width / 2, top: fc.height / 2,
                originX: 'center', originY: 'center',
                customName: 'Bar Chart', id: `chart-${ts}`,
            })
            fc.add(group); fc.setActiveObject(group); fc.renderAll(); saveHistory()
            showToast('📊 Bar chart added')
        } else {
            // Pie chart
            const radius = 100, cx = 0, cy = 0
            const total = chartData.reduce((s, d) => s + d.value, 0) || 1
            const colors = ['#6366f1', '#22d3ee', '#f59e0b', '#ef4444', '#22c55e', '#a78bfa']
            const objects = []
            let startAngle = -Math.PI / 2
            chartData.forEach((d, i) => {
                const sliceAngle = (d.value / total) * Math.PI * 2
                const endAngle = startAngle + sliceAngle
                // SVG arc for pie slice
                const x1 = cx + radius * Math.cos(startAngle)
                const y1 = cy + radius * Math.sin(startAngle)
                const x2 = cx + radius * Math.cos(endAngle)
                const y2 = cy + radius * Math.sin(endAngle)
                const largeArc = sliceAngle > Math.PI ? 1 : 0
                const pathStr = `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`
                objects.push(new fabric.Path(pathStr, {
                    fill: colors[i % colors.length], stroke: '#0f172a', strokeWidth: 2,
                }))
                // Label
                const midAngle = startAngle + sliceAngle / 2
                const labelR = radius + 20
                objects.push(new fabric.Text(`${d.label} (${Math.round(d.value / total * 100)}%)`, {
                    left: cx + labelR * Math.cos(midAngle),
                    top: cy + labelR * Math.sin(midAngle),
                    fontSize: 10, fontWeight: '600', fontFamily: 'Inter',
                    fill: '#e2e8f0', originX: 'center', originY: 'center',
                }))
                startAngle = endAngle
            })
            const group = new fabric.Group(objects, {
                left: fc.width / 2, top: fc.height / 2,
                originX: 'center', originY: 'center',
                customName: 'Pie Chart', id: `pie-${ts}`,
            })
            fc.add(group); fc.setActiveObject(group); fc.renderAll(); saveHistory()
            showToast('🥧 Pie chart added')
        }
    }, [chartType, chartData, activeBrand, saveHistory, showToast])

    // ── Countdown Timer ──
    const addCountdown = useCallback(() => {
        const fc = fabricRef.current; if (!fc) return
        loadGoogleFont('Bebas Neue')
        loadGoogleFont('Inter')
        const targetDate = countdownDate ? new Date(countdownDate) : new Date(Date.now() + 30 * 86400000)
        const now = new Date()
        const diffMs = targetDate - now
        const days = Math.max(0, Math.ceil(diffMs / 86400000))
        const label = countdownLabel || 'THE BIG EVENT'
        setTimeout(() => {
            const objects = [
                new fabric.Text(String(days), {
                    left: 0, top: 0, fontSize: 120, fontWeight: '700',
                    fontFamily: 'Bebas Neue', fill: '#ffffff',
                    originX: 'center', originY: 'center',
                }),
                new fabric.Text('DAYS UNTIL', {
                    left: 0, top: 70, fontSize: 18, fontWeight: '600',
                    fontFamily: 'Inter', fill: '#818cf8',
                    originX: 'center', originY: 'center',
                    charSpacing: 200,
                }),
                new fabric.Text(label.toUpperCase(), {
                    left: 0, top: 100, fontSize: 28, fontWeight: '800',
                    fontFamily: 'Inter', fill: '#f59e0b',
                    originX: 'center', originY: 'center',
                }),
            ]
            const group = new fabric.Group(objects, {
                left: fc.width / 2, top: fc.height / 2,
                originX: 'center', originY: 'center',
                customName: 'Countdown', id: `countdown-${Date.now()}`,
            })
            fc.add(group); fc.setActiveObject(group); fc.renderAll(); saveHistory()
            showToast(`⏳ Countdown: ${days} days added`)
        }, 200)
    }, [countdownDate, countdownLabel, loadGoogleFont, saveHistory, showToast])

    // ── Color Palette Generator ──
    const [generatedPalette, setGeneratedPalette] = useState([])
    const generatePalette = useCallback(() => {
        const brandColor = activeBrand?.dna?.colors?.[0]?.hex || '#6366f1'
        // Generate harmonious palette from brand color using HSL shifts
        const hexToHsl = (hex) => {
            let r = parseInt(hex.slice(1,3), 16) / 255
            let g = parseInt(hex.slice(3,5), 16) / 255
            let b = parseInt(hex.slice(5,7), 16) / 255
            const max = Math.max(r, g, b), min = Math.min(r, g, b)
            let h = 0, s = 0, l = (max + min) / 2
            if (max !== min) {
                const d = max - min
                s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
                if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
                else if (max === g) h = ((b - r) / d + 2) / 6
                else h = ((r - g) / d + 4) / 6
            }
            return [h * 360, s * 100, l * 100]
        }
        const hslToHex = (h, s, l) => {
            h = ((h % 360) + 360) % 360
            s /= 100; l /= 100
            const a = s * Math.min(l, 1 - l)
            const f = n => { const k = (n + h / 30) % 12; return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1) }
            return '#' + [f(0), f(8), f(4)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('')
        }
        const [h, s, l] = hexToHsl(brandColor)
        const palette = [
            brandColor,
            hslToHex(h + 30, s, l),
            hslToHex(h + 60, Math.min(s + 10, 100), Math.max(l - 10, 20)),
            hslToHex(h + 180, s * 0.8, l),
            hslToHex(h + 210, s * 0.6, Math.min(l + 20, 85)),
        ]
        setGeneratedPalette(palette)
    }, [activeBrand])

    const addPaletteToCanvas = useCallback(() => {
        const fc = fabricRef.current; if (!fc) return
        const colors = generatedPalette.length ? generatedPalette : ['#6366f1', '#22d3ee', '#f59e0b', '#ef4444', '#22c55e']
        const swatchW = 50, swatchH = 60, gap = 8
        const objects = []
        colors.forEach((hex, i) => {
            objects.push(new fabric.Rect({
                left: i * (swatchW + gap), top: 0,
                width: swatchW, height: swatchH,
                fill: hex, rx: 8, ry: 8,
            }))
            objects.push(new fabric.Text(hex.toUpperCase(), {
                left: i * (swatchW + gap) + swatchW / 2, top: swatchH + 10,
                fontSize: 8, fontWeight: '600', fontFamily: 'Inter',
                fill: '#94a3b8', originX: 'center',
            }))
        })
        const group = new fabric.Group(objects, {
            left: fc.width / 2, top: fc.height / 2,
            originX: 'center', originY: 'center',
            customName: 'Color Palette', id: `palette-${Date.now()}`,
        })
        fc.add(group); fc.setActiveObject(group); fc.renderAll(); saveHistory()
        showToast('🎨 Color palette added')
    }, [generatedPalette, saveHistory, showToast])

    // ── Photo Collage ──
    const addCollage = useCallback(() => {
        const fc = fabricRef.current; if (!fc) return
        const brandColor = activeBrand?.dna?.colors?.[0]?.hex || '#6366f1'
        const totalW = fc.width * 0.7, totalH = fc.height * 0.7
        const gap = 8
        const objects = []
        let grid = []
        switch (collageLayout) {
            case 2: grid = [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]]; break
            case 3: grid = [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 1, 0.5]]; break
            case 4: grid = [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]]; break
            case 6: grid = [[0, 0, 1/3, 0.5], [1/3, 0, 1/3, 0.5], [2/3, 0, 1/3, 0.5], [0, 0.5, 1/3, 0.5], [1/3, 0.5, 1/3, 0.5], [2/3, 0.5, 1/3, 0.5]]; break
            default: grid = [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]]
        }
        grid.forEach((slot, i) => {
            const [sx, sy, sw, sh] = slot
            const slotW = totalW * sw - gap
            const slotH = totalH * sh - gap
            objects.push(new fabric.Rect({
                left: sx * totalW + gap / 2, top: sy * totalH + gap / 2,
                width: slotW, height: slotH,
                fill: '#1e293b', stroke: brandColor + '60',
                strokeWidth: 2, strokeDashArray: [8, 4],
                rx: 8, ry: 8,
            }))
            // Slot number + icon
            objects.push(new fabric.Text(`📷 ${i + 1}`, {
                left: sx * totalW + slotW / 2 + gap / 2,
                top: sy * totalH + slotH / 2 + gap / 2,
                fontSize: 20, fontWeight: '600', fontFamily: 'Inter',
                fill: '#475569', originX: 'center', originY: 'center',
            }))
        })
        const group = new fabric.Group(objects, {
            left: fc.width / 2, top: fc.height / 2,
            originX: 'center', originY: 'center',
            customName: 'Photo Collage', id: `collage-${Date.now()}`,
        })
        fc.add(group); fc.setActiveObject(group); fc.renderAll(); saveHistory()
        showToast(`🖼️ ${collageLayout}-slot collage added`)
    }, [collageLayout, activeBrand, saveHistory, showToast])

    // ── Blur Tool ──
    const applyBlurToSelected = useCallback(() => {
        const fc = fabricRef.current; if (!fc) return
        const obj = fc.getActiveObject()
        if (!obj || obj.type !== 'image') {
            showToast('⚠️ Select an image first')
            return
        }
        obj.filters = obj.filters || []
        // Remove existing blur filter if any
        obj.filters = obj.filters.filter(f => !(f instanceof fabric.filters.Blur))
        if (blurIntensity > 0) {
            obj.filters.push(new fabric.filters.Blur({ blur: blurIntensity / 100 }))
        }
        obj.applyFilters()
        fc.renderAll(); saveHistory()
        showToast(`🌫️ Blur ${blurIntensity > 0 ? 'applied' : 'removed'}`)
    }, [blurIntensity, saveHistory, showToast])

    const addTextStyle = useCallback((preset) => {
        const fc = fabricRef.current
        if (!fc) return
        loadGoogleFont(preset.font)
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
            fc.renderAll()
            saveHistory()
            showToast(` ${preset.label} added`)
        }, 200)
    }, [loadGoogleFont, saveHistory, showToast])

    // ── RESIZE WITH PROPORTIONAL SCALING ──
    const resizeCanvas = useCallback((newW, newH) => {
        const fc = fabricRef.current
        if (!fc) return
        const container = containerRef.current
        const maxW = container.clientWidth - 80
        const maxH = container.clientHeight - 80
        const scale = Math.min(maxW / newW, maxH / newH, 1)
        const displayW = Math.round(newW * scale)
        const displayH = Math.round(newH * scale)

        // Calculate scale ratios for proportional element scaling
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

        fc.renderAll()
        setZoom(Math.round(scale * 100))
        setCustomW(newW)
        setCustomH(newH)
        saveHistory()

        // Update preset if it matches
        const preset = PRESETS.find(p => p.w === newW && p.h === newH)
        setActivePreset(preset ? preset.id : 'custom')
        showToast(`📐 Resized to ${newW}×${newH}`)
    }, [saveHistory, showToast])

    // ── AI CREATIVE GENERATOR ──
    const aiCreativeGenerate = useCallback(async () => {
        if (!aiCreativeKeywords.trim()) return
        const fc = fabricRef.current
        if (!fc) return
        setAiCreativeLoading(true)
        setAiError('')
        try {
            showToast('🎨 Generating editable design...')
            const data = await canvasAssets.aiCreativeGenerate({
                keywords: aiCreativeKeywords,
                style: aiCreativeStyle,
                canvasWidth: fc._logicalWidth || 1080,
                canvasHeight: fc._logicalHeight || 1080,
                brandName: activeBrand?.name || '',
                brandColors: activeBrand?.dna?.colors?.map(c => c.hex) || [],
                brandFonts: activeBrand?.dna?.fonts || [],
            })
            if (data.error) throw new Error(data.error)

            // Clear canvas
            const allObjects = fc.getObjects().slice()
            allObjects.forEach(o => fc.remove(o))

            // Set background color
            fc.backgroundColor = data.layout?.background || '#1a1a2e'

            // If background image was generated, add it
            if (data.backgroundImage) {
                try {
                    const bgImg = await fabric.FabricImage.fromURL(data.backgroundImage, { crossOrigin: 'anonymous' })
                    const imgScale = Math.max(fc.width / bgImg.width, fc.height / bgImg.height)
                    bgImg.set({
                        scaleX: imgScale, scaleY: imgScale,
                        left: fc.width / 2, top: fc.height / 2,
                        originX: 'center', originY: 'center',
                        selectable: true, customName: 'AI Background', id: 'ai-bg',
                    })
                    fc.add(bgImg)
                    fc.sendObjectToBack(bgImg)
                } catch (e) { console.warn('Failed to load AI background:', e) }
            }

            // Add each element from the layout
            const elements = data.layout?.elements || []
            for (const el of elements) {
                if (el.type === 'text') {
                    loadGoogleFont(el.font || 'Inter')
                    await new Promise(r => setTimeout(r, 150))
                    const aiCentered = (el.align === 'center')
                    const textObj = new fabric.Textbox(el.text || 'Text', {
                        left: (el.x || 50) * (fc.width / (fc._logicalWidth || 1080)),
                        top: (el.y || 50) * (fc.height / (fc._logicalHeight || 1080)),
                        originX: aiCentered ? 'center' : 'left',
                        originY: 'center',
                        width: (el.w || 400) * (fc.width / (fc._logicalWidth || 1080)),
                        fontSize: el.size || 32,
                        fontWeight: el.weight || '400',
                        fontFamily: el.font || 'Inter',
                        fill: el.color || '#ffffff',
                        textAlign: el.align || 'center',
                        charSpacing: (el.tracking || 0) * 10,
                        editable: true,
                        customName: el.label || 'AI Text',
                        id: `ai-text-${Date.now()}-${Math.random().toString(36).substring(7)}`,
                    })
                    fc.add(textObj)
                } else if (el.type === 'rect') {
                    const rect = new fabric.Rect({
                        left: (el.x || 0) * (fc.width / (fc._logicalWidth || 1080)),
                        top: (el.y || 0) * (fc.height / (fc._logicalHeight || 1080)),
                        width: (el.w || 200) * (fc.width / (fc._logicalWidth || 1080)),
                        height: (el.h || 100) * (fc.height / (fc._logicalHeight || 1080)),
                        fill: el.color || '#6366f1',
                        rx: el.radius || 0, ry: el.radius || 0,
                        customName: el.label || 'AI Shape',
                        id: `ai-rect-${Date.now()}-${Math.random().toString(36).substring(7)}`,
                    })
                    fc.add(rect)
                } else if (el.type === 'circle') {
                    const circ = new fabric.Circle({
                        left: (el.x || 0) * (fc.width / (fc._logicalWidth || 1080)),
                        top: (el.y || 0) * (fc.height / (fc._logicalHeight || 1080)),
                        radius: (el.radius || 50) * (fc.width / (fc._logicalWidth || 1080)),
                        fill: el.color || '#6366f1',
                        customName: el.label || 'AI Circle',
                        id: `ai-circle-${Date.now()}-${Math.random().toString(36).substring(7)}`,
                    })
                    fc.add(circ)
                } else if (el.type === 'line') {
                    const line = new fabric.Line([
                        (el.x1 || 0) * (fc.width / (fc._logicalWidth || 1080)),
                        (el.y1 || 0) * (fc.height / (fc._logicalHeight || 1080)),
                        (el.x2 || 200) * (fc.width / (fc._logicalWidth || 1080)),
                        (el.y2 || 0) * (fc.height / (fc._logicalHeight || 1080)),
                    ], {
                        stroke: el.color || '#ffffff',
                        strokeWidth: el.strokeWidth || 2,
                        customName: el.label || 'AI Line',
                        id: `ai-line-${Date.now()}-${Math.random().toString(36).substring(7)}`,
                    })
                    fc.add(line)
                }
            }

            fc.renderAll()
            updateLayers()
            saveHistory()
            showToast(` Design created with ${elements.length} editable elements!`)
        } catch (err) {
            console.error('AI creative generate error:', err)
            const msg = err.message || 'AI generation failed. Please try again.'
            setAiError(msg)
            showToast('❌ ' + msg)
        }
        setAiCreativeLoading(false)
    }, [aiCreativeKeywords, aiCreativeStyle, activeBrand, loadGoogleFont, saveHistory, showToast, updateLayers])

    // ── Sidebar Tab Config ──
    // ── Generate Image Handler (NanoBanana 2) ──
    const handleGenImage = useCallback(async () => {
        if (!genPrompt.trim() || genLoading) return
        setGenLoading(true)
        try {
            const [rw, rh] = genRatio.split(':').map(Number)
            const w = 1024; const h = Math.round(1024 * (rh / rw))
            const token = localStorage.getItem('mantram_token') || ''

            // Collect reference images (uploaded refs + canvas snapshot if canvas has objects)
            const referenceImages = genRefs.map(r => r.url)
            const fc = fabricRef.current
            if (fc && fc.getObjects().length > 0) {
                // Also add canvas snapshot as a reference
                referenceImages.push(fc.toDataURL({ format: 'png', quality: 0.8 }))
            }

            const data = await canvasAssets.aiGenerate({
                prompt: genEnhance ? `Professional high-quality ${genPrompt}` : genPrompt,
                size: `${w}x${h}`,
                referenceImages,
                brandId: activeBrand?._id || undefined,
            })
            if (data.error) throw new Error(data.error)
            // Add to canvas
            if (!fc) return
            const img = await fabric.FabricImage.fromURL(data.imageUrl, { crossOrigin: 'anonymous' })
            const scale = Math.min(fc.width / img.width, fc.height / img.height) * 0.8
            img.set({ left: (fc.width - img.width * scale) / 2, top: (fc.height - img.height * scale) / 2, scaleX: scale, scaleY: scale })
            img._customName = 'AI Generated'
            fc.add(img); fc.setActiveObject(img); fc.renderAll(); saveHistory()
            setShowGenPanel(false); setGenPrompt(''); setGenRefs([])
            showToast(` Image generated${data.refsUsed ? ` (${data.refsUsed} refs used)` : ''} and added to canvas`)
        } catch (err) { showToast('Error: ' + err.message) }
        setGenLoading(false)
    }, [genPrompt, genEnhance, genRatio, genLoading, genRefs])

    // ── Add image URL to canvas helper ──
    const addImageUrlToCanvas = useCallback(async (url, label) => {
        try {
            const fc = fabricRef.current; if (!fc) return
            const img = await fabric.FabricImage.fromURL(url, { crossOrigin: 'anonymous' })
            // Constrain image to max 400px and ensure it fits on canvas
            const maxDim = 400
            const scale = Math.min(maxDim / img.width, maxDim / img.height, 1)
            // Smart grid placement: find next available slot
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
            fc.add(img); fc.setActiveObject(img); fc.renderAll(); saveHistory()
            setGeneratedImages(prev => [{ url, label: label || `AI Image ${prev.length + 1}`, timestamp: Date.now() }, ...prev])
            showToast('🎨 Image added to canvas')
        } catch (err) { showToast('Failed to add image') }
    }, [])

    // ── Fidato Canvas Chat Handler — Claude Tool-Use Powered ──
    const handleFidatoSend = useCallback(async (voiceText) => {
        const msg = (voiceText || fidatoInput).trim()
        if (!msg || fidatoLoading) return
        setFidatoMessages(prev => [...prev, { role: 'user', content: msg }])
        setFidatoInput('')
        setFidatoLoading(true)
        // Create AbortController for this request
        const abortController = new AbortController()
        fidatoAbortRef.current = abortController
        setTimeout(() => fidatoMsgEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)

        // Helper: position element based on named position
        const positionElement = (obj, position, fc) => {
            const cw = fc.width, ch = fc.height
            const padding = 40
            const positions = {
                'center':       { left: cw / 2, top: ch / 2, originX: 'center', originY: 'center' },
                'top-center':   { left: cw / 2, top: padding, originX: 'center', originY: 'top' },
                'bottom-center':{ left: cw / 2, top: ch - padding, originX: 'center', originY: 'bottom' },
                'top-left':     { left: padding, top: padding, originX: 'left', originY: 'top' },
                'top-right':    { left: cw - padding, top: padding, originX: 'right', originY: 'top' },
                'bottom-left':  { left: padding, top: ch - padding, originX: 'left', originY: 'bottom' },
                'bottom-right': { left: cw - padding, top: ch - padding, originX: 'right', originY: 'bottom' },
            }
            const pos = positions[position] || positions['center']
            obj.set(pos)
        }

        // Helper: find element by name or index
        const findElement = (name, index, fc) => {
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

        // ── Tool Call Executors ──
        const executeToolCall = async (toolCall, fc, ctx = {}) => {
            const { name, args } = toolCall
            const brandFont = activeBrand?.dna?.fonts?.[0] || 'Inter'
            const brandColor = activeBrand?.dna?.colors?.[0]?.hex || '#ffffff'
            const brandColor2 = activeBrand?.dna?.colors?.[1]?.hex || activeBrand?.dna?.colors?.[0]?.hex || '#6366f1'

            switch (name) {
                case 'add_text': {
                    const text = args.text || 'Your text here'
                    const isH = args.isHeading || false
                    const textObj = new fabric.Textbox(text, {
                        left: fc.width / 2,
                        top: fc.height / 2,
                        originX: 'center',
                        originY: 'center',
                        fontSize: args.fontSize || (isH ? 48 : 24),
                        fontWeight: args.fontWeight || (isH ? '800' : '400'),
                        fontFamily: args.fontFamily || brandFont,
                        fill: args.color || brandColor,
                        textAlign: 'center',
                        width: fc.width * 0.6,
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
                    const fill = args.fillColor || (brandColor2 + '40')
                    const stroke = args.strokeColor || brandColor2
                    addShape(st) // reuse existing addShape
                    // After addShape, apply custom properties
                    const added = fc.getActiveObject()
                    if (added) {
                        if (args.fillColor) added.set('fill', args.fillColor)
                        if (args.strokeColor) added.set('stroke', args.strokeColor)
                        if (args.opacity !== undefined) added.set('opacity', args.opacity)
                        if (args.width && args.height) {
                            const sx = args.width / (added.width || 200)
                            const sy = args.height / (added.height || 150)
                            added.set({ scaleX: sx, scaleY: sy })
                        }
                        if (args.position) positionElement(added, args.position, fc)
                        fc.renderAll()
                    }
                    return `Added ${st.replace('shape-', '')} shape`
                }

                case 'add_logo': {
                    const logoUrl = activeBrand?.dna?.logo?.url
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
                    fc.renderAll()
                    return `Background set to ${args.color}`
                }

                case 'change_element_property': {
                    const el = findElement(args.elementName, args.elementIndex, fc)
                    if (!el) return `Element "${args.elementName || args.elementIndex}" not found`
                    const prop = args.property
                    let val = args.value
                    // Auto-convert numeric values
                    if (['fontSize', 'opacity', 'left', 'top', 'scaleX', 'scaleY', 'angle'].includes(prop)) {
                        val = parseFloat(val)
                    }
                    el.set(prop, val)
                    fc.renderAll()
                    return `Changed ${prop} of "${el.customName || el.type}" to ${args.value}`
                }

                case 'remove_element': {
                    const el2 = findElement(args.elementName, args.elementIndex, fc)
                    if (!el2) return `Element not found`
                    fc.remove(el2)
                    fc.renderAll()
                    return `Removed "${el2.customName || el2.type}"`
                }

                case 'set_canvas_size': {
                    const preset = PRESETS.find(p => p.id === args.preset)
                    if (preset) {
                        resizeToPreset(preset)
                        return `Canvas resized to ${preset.label} (${preset.w}×${preset.h})`
                    }
                    return `Preset "${args.preset}" not found`
                }

                case 'move_element': {
                    const el3 = findElement(args.elementName, args.elementIndex, fc)
                    if (!el3) return `Element not found`
                    positionElement(el3, args.position, fc)
                    fc.renderAll()
                    return `Moved "${el3.customName || el3.type}" to ${args.position}`
                }

                case 'reorder_layer': {
                    const el4 = findElement(args.elementName, args.elementIndex, fc)
                    if (!el4) return `Element not found`
                    switch (args.action) {
                        case 'bring-front': fc.bringObjectToFront(el4); break
                        case 'send-back': fc.sendObjectToBack(el4); break
                        case 'bring-forward': fc.bringObjectForward(el4); break
                        case 'send-backward': fc.sendObjectBackward(el4); break
                    }
                    // Keep artboard always at back
                    const ab = fc.getObjects().find(o => o.id === 'artboard')
                    if (ab) fc.sendObjectToBack(ab)
                    fc.renderAll()
                    return `Layer reorder: ${args.action} on "${el4.customName || el4.type}"`
                }

                case 'generate_image': {
                    const brandName = activeBrand?.name || 'Brand'
                    setFidatoMessages(prev => [...prev, { role: 'assistant', content: ` Generating: "${args.prompt?.substring(0, 50)}..."` }])
                    try {
                        const data = await canvasAssets.aiGenerate({ prompt: args.prompt, size: args.size || '1024x1024', brandId: activeBrand?._id || undefined })
                        if (data.imageUrl) {
                            await addImageUrlToCanvas(data.imageUrl, 'AI Generated')
                            if (args.position) {
                                const lastObj = fc.getActiveObject()
                                if (lastObj) positionElement(lastObj, args.position, fc)
                                fc.renderAll()
                            }
                            return { text: `Image generated and added`, thumbnail: data.imageUrl }
                        }
                    } catch (e) { return `Image generation failed: ${e.message}` }
                    return 'Image generation failed'
                }

                // ═══════════════════════════════════════════════════
                // ── AGENTIC CANVAS TOOLS ──────────────────────────
                // ═══════════════════════════════════════════════════

                case 'create_script_block': {
                    const { title, scenes } = args
                    const cardW = 320
                    const gap = 12
                    const startX = 60
                    let curY = 80

                    // Title card
                    const titleText = new fabric.Textbox(`📝 ${title || 'Script'}`, {
                        left: startX, top: curY, width: cardW,
                        fontSize: 22, fontWeight: '800', fontFamily: 'Inter',
                        fill: '#a78bfa',
                        customName: `Script: ${title}`, id: `script-title-${Date.now()}`,
                        _nodeType: 'script',
                    })
                    fc.add(titleText)
                    curY += 44

                    // Scene cards
                    for (const scene of (scenes || [])) {
                        const cardH = 100
                        const bg = new fabric.Rect({
                            left: startX, top: curY, width: cardW, height: cardH,
                            rx: 12, ry: 12,
                            fill: 'rgba(99,102,241,0.08)',
                            stroke: 'rgba(99,102,241,0.2)', strokeWidth: 1,
                            selectable: false, evented: false,
                            id: `scene-bg-${scene.sceneNumber}-${Date.now()}`,
                            _nodeType: 'script',
                        })
                        const sceneHead = new fabric.Textbox(
                            `Scene ${scene.sceneNumber}${scene.duration ? ` • ${scene.duration}` : ''}${scene.mood ? ` • ${scene.mood}` : ''}`, {
                            left: startX + 14, top: curY + 10, width: cardW - 28,
                            fontSize: 12, fontWeight: '700', fontFamily: 'Inter',
                            fill: '#818cf8',
                            selectable: false, evented: false,
                            id: `scene-head-${scene.sceneNumber}-${Date.now()}`,
                            _nodeType: 'script',
                        })
                        const visual = new fabric.Textbox(` ${scene.visualDescription}`, {
                            left: startX + 14, top: curY + 28, width: cardW - 28,
                            fontSize: 11, fontFamily: 'Inter', fill: '#94a3b8',
                            selectable: false, evented: false,
                            id: `scene-vis-${scene.sceneNumber}-${Date.now()}`,
                            _nodeType: 'script',
                        })
                        const vo = new fabric.Textbox(` "${scene.voiceover}"`, {
                            left: startX + 14, top: curY + 58, width: cardW - 28,
                            fontSize: 11, fontFamily: 'Inter', fontStyle: 'italic', fill: '#64748b',
                            selectable: false, evented: false,
                            id: `scene-vo-${scene.sceneNumber}-${Date.now()}`,
                            _nodeType: 'script',
                        })

                        fc.add(bg, sceneHead, visual, vo)
                        curY += cardH + gap
                    }

                    fc.renderAll()
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
                        _generating: shouldGenerate
                    }))

                    setBoardScenes(prev => [...prev, ...newScenes])
                    setStoryBrief({ title: title || 'Storyboard', frames: numFrames })
                    setCanvasView('board') // Switch to board view

                    if (shouldGenerate) {
                        const generatedThumbs = new Array(numFrames).fill(null);
                        ctx.scenes = new Array(numFrames).fill({}); // Initialize ctx for scenes
                        // Generate images synchronously so they can be returned to chat UI
                        await Promise.all(newScenes.map(async (scene, i) => {
                            try {
                                // Pass S3 reference image URLs directly — backend aiGenerate handles fetch
                                const refUrls = (ctx.referenceImages || []).slice(0, 3).map(r => r.url).filter(Boolean);
                                if (refUrls.length > 0) {
                                    console.log(`🖼️ Passing ${refUrls.length} S3 reference images for frame ${i + 1}`);
                                }
                                const data = await canvasAssets.aiGenerate({ 
                                    prompt: frames[i].imagePrompt, 
                                    size: '512x512',
                                    referenceImages: refUrls
                                })
                                if (data.imageUrl) {
                                    setBoardScenes(prev => prev.map(s =>
                                        s.id === scene.id ? { ...s, imageUrl: data.imageUrl, _generating: false } : s
                                    ))
                                    generatedThumbs[i] = data.imageUrl;
                                    if (ctx.scenes) ctx.scenes[i] = { imageUrl: data.imageUrl };
                                }
                            } catch (e) {
                                console.warn(`Frame ${i + 1} gen failed:`, e.message)
                                setBoardScenes(prev => prev.map(s =>
                                    s.id === scene.id ? { ...s, _generating: false } : s
                                ))
                            }
                        }))
                        return { text: `Storyboard "${title}" created with ${numFrames} scenes.`, thumbnails: generatedThumbs.filter(Boolean) }
                    }

                    return `Storyboard "${title}" created on the Board View with ${numFrames} scenes.`
                }

                case 'create_character_profile': {
                    const { characterName, physicalDescription, wardrobe, styleKeywords, referenceImagePrompt } = args
                    const cardW = 300
                    const cardH = 200
                    const x = 60
                    const y = 80

                    // Card background
                    const bg = new fabric.Rect({
                        left: x, top: y, width: cardW, height: cardH,
                        rx: 14, ry: 14,
                        fill: 'rgba(236,72,153,0.06)',
                        stroke: 'rgba(236,72,153,0.25)', strokeWidth: 1,
                        shadow: new fabric.Shadow({ color: 'rgba(236,72,153,0.15)', blur: 16, offsetY: 4 }),
                        selectable: false, evented: false,
                        id: `char-bg-${Date.now()}`,
                        _nodeType: 'character',
                    })
                    fc.add(bg)

                    // Header
                    const header = new fabric.Textbox(`👤 ${characterName}`, {
                        left: x + 14, top: y + 12, width: cardW - 28,
                        fontSize: 16, fontWeight: '800', fontFamily: 'Inter',
                        fill: '#f472b6',
                        selectable: false, evented: false,
                        id: `char-name-${Date.now()}`,
                        _nodeType: 'character',
                    })
                    fc.add(header)

                    // Description
                    const desc = new fabric.Textbox(physicalDescription, {
                        left: x + 14, top: y + 36, width: cardW - 28,
                        fontSize: 11, fontFamily: 'Inter', fill: '#94a3b8',
                        selectable: false, evented: false,
                        id: `char-desc-${Date.now()}`,
                        _nodeType: 'character',
                    })
                    fc.add(desc)

                    if (wardrobe) {
                        const wText = new fabric.Textbox(`👗 ${wardrobe}`, {
                            left: x + 14, top: y + 90, width: cardW - 28,
                            fontSize: 10, fontFamily: 'Inter', fontStyle: 'italic', fill: '#64748b',
                            selectable: false, evented: false,
                            id: `char-ward-${Date.now()}`,
                            _nodeType: 'character',
                        })
                        fc.add(wText)
                    }

                    if (styleKeywords?.length) {
                        const tags = new fabric.Textbox(`🏷️ ${styleKeywords.join(' • ')}`, {
                            left: x + 14, top: y + cardH - 30, width: cardW - 28,
                            fontSize: 9, fontFamily: 'Inter', fill: '#475569',
                            selectable: false, evented: false,
                            id: `char-tags-${Date.now()}`,
                            _nodeType: 'character',
                        })
                        fc.add(tags)
                    }

                    let generatedThumbUrl = null;
                    // Generate reference image if prompt provided
                    if (referenceImagePrompt) {
                        setFidatoMessages(prev => [...prev, { role: 'assistant', content: `🖼️ Generating reference portrait for ${characterName}...` }])
                        try {
                            const data = await canvasAssets.aiGenerate({ prompt: referenceImagePrompt, size: '512x512' })
                            if (data.imageUrl) {
                                generatedThumbUrl = data.imageUrl;
                                const img = await fabric.FabricImage.fromURL(data.imageUrl, { crossOrigin: 'anonymous' })
                                const imgSize = 120
                                const imgScale = imgSize / Math.max(img.width, img.height)
                                img.set({
                                    left: x + cardW + 20, top: y,
                                    scaleX: imgScale, scaleY: imgScale,
                                    customName: `${characterName} - Reference`,
                                    id: `char-ref-img-${Date.now()}`,
                                    _nodeType: 'character',
                                })
                                fc.add(img)
                            }
                        } catch (e) { console.warn('Character ref image failed:', e) }
                    }

                    fc.renderAll()
                    return { text: `Character profile "${characterName}" created`, thumbnail: generatedThumbUrl || undefined }
                }

                case 'auto_layout_grid': {
                    const { columns, gap: gridGap, cardWidth, cardHeight, includeTypes, startX: gStartX, startY: gStartY } = args
                    
                    // Remove previous auto-frames to prevent stacking
                    const existingFrames = fc.getObjects().filter(o => o.id?.startsWith('auto-frame-'))
                    existingFrames.forEach(f => fc.remove(f))

                    const allObjects = fc.getObjects().filter(o => o.id !== 'artboard' && !o.id?.startsWith('auto-frame-'))
                    
                    // Filter by node types if specified
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
                    
                    let maxX = sX;
                    let maxY = sY;

                    targets.forEach((obj, i) => {
                        const col = i % cols
                        const row = Math.floor(i / cols)
                        const targetX = sX + col * (cW + gapPx)
                        const targetY = sY + row * (cH + gapPx)

                        // Scale to fit within card dimensions
                        const objW = (obj.width || 100) * (obj.scaleX || 1)
                        const objH = (obj.height || 100) * (obj.scaleY || 1)
                        if (objW > cW || objH > cH) {
                            const fitScale = Math.min(cW / objW, cH / objH) * 0.9
                            obj.set({ scaleX: (obj.scaleX || 1) * fitScale, scaleY: (obj.scaleY || 1) * fitScale })
                        }

                        obj.set({ left: targetX, top: targetY })
                        obj.setCoords()
                        
                        // Calculate bounds for the frame
                        const curW = (obj.width || 100) * (obj.scaleX || 1);
                        const curH = (obj.height || 100) * (obj.scaleY || 1);
                        if (targetX + curW > maxX) maxX = targetX + curW;
                        if (targetY + curH > maxY) maxY = targetY + curH;
                    })
                    
                    // Draw Container Frame
                    const framePadding = 48;
                    const frameBg = new fabric.Rect({
                        left: sX - framePadding, 
                        top: sY - framePadding,
                        width: (maxX - sX) + (framePadding * 2), 
                        height: (maxY - sY) + (framePadding * 2),
                        fill: 'rgba(255,255,255,0.02)',
                        stroke: 'rgba(255,255,255,0.15)',
                        strokeWidth: 1,
                        rx: 24, ry: 24,
                        strokeDashArray: [8, 8],
                        selectable: false, evented: false,
                        id: `auto-frame-bg-${Date.now()}`
                    });
                    
                    const frameLabel = new fabric.Textbox('✦ Generated Content /', {
                        left: sX - framePadding + 16, 
                        top: sY - framePadding - 28,
                        fontSize: 12, fontWeight: '700', fontFamily: 'Inter',
                        fill: '#a1a1aa', // slate-400
                        selectable: false, evented: false,
                        id: `auto-frame-label-${Date.now()}`
                    });

                    fc.add(frameBg, frameLabel);
                    fc.sendObjectToBack(frameLabel);
                    fc.sendObjectToBack(frameBg);
                    
                    // Keep artboard at very back
                    const ab = fc.getObjects().find(o => o.id === 'artboard')
                    if (ab) fc.sendObjectToBack(ab)

                    fc.renderAll()
                    return `Auto-arranged ${targets.length} elements into a ${cols}-column grouped frame`
                }

                case 'generate_video_clip': {
                    let { prompt, duration, aspectRatio, sourceImageUrl, sceneRef } = args
                    
                    if (!sourceImageUrl && sceneRef && ctx.scenes && ctx.scenes[sceneRef - 1]?.imageUrl) {
                        sourceImageUrl = ctx.scenes[sceneRef - 1].imageUrl;
                        console.log(` Dynamically resolved sceneRef=${sceneRef} to image URL`);
                    }

                    setFidatoMessages(prev => [...prev, { role: 'assistant', content: ` Generating video: "${prompt?.substring(0, 50)}..."` }])
                    try {
                        const data = await canvasAssets.generateVideo({
                            prompt, duration: duration || 5,
                            aspectRatio: aspectRatio || '16:9',
                            sourceImageUrl: sourceImageUrl || '',
                        })
                        if (data.success && data.taskId) {
                            if (!ctx.videos) ctx.videos = {};
                            Object.assign(ctx.videos, { [data.taskId]: { status: 'pending', url: null } });

                            // Create a video placeholder card on canvas
                            const cardW = 320
                            const cardH = 200
                            const x = 60, y = 80
                            const bg = new fabric.Rect({
                                left: x, top: y, width: cardW, height: cardH,
                                rx: 12, ry: 12,
                                fill: 'rgba(6,182,212,0.08)',
                                stroke: 'rgba(6,182,212,0.3)', strokeWidth: 1,
                                shadow: new fabric.Shadow({ color: 'rgba(6,182,212,0.15)', blur: 16, offsetY: 4 }),
                                selectable: true, evented: true,
                                id: `video-bg-${Date.now()}`,
                                _nodeType: 'video',
                                _taskId: data.taskId,
                                _provider: data.provider,
                            })
                            fc.add(bg)
                            const icon = new fabric.Textbox('movie', {
                                left: x + cardW / 2 - 20, top: y + cardH / 2 - 30,
                                width: 40, fontSize: 36, textAlign: 'center',
                                selectable: false, evented: false,
                                id: `video-icon-${Date.now()}`, _nodeType: 'video',
                            })
                            fc.add(icon)
                            const label = new fabric.Textbox(`Video generating...\nScene ${sceneRef || '?'} • ${duration || 5}s`, {
                                left: x + 10, top: y + cardH - 40, width: cardW - 20,
                                fontSize: 10, fontWeight: '600', fontFamily: 'Inter',
                                fill: '#22d3ee', textAlign: 'center',
                                selectable: false, evented: false,
                                id: `video-label-${Date.now()}`, _nodeType: 'video',
                            })
                            fc.add(label)
                            fc.renderAll()
                            return { text: `Video generation started (ID: ${data.taskId}).`, thumbnail: sourceImageUrl || null }
                        }
                        return `Video generation started. ${data.message || ''}`
                    } catch (e) { return `Video generation failed: ${e.message}` }
                }

                case 'generate_voiceover': {
                    const { text, language, speaker, speed, sceneRef } = args
                    setFidatoMessages(prev => [...prev, { role: 'assistant', content: ` Generating voiceover (${speaker || 'anushka'})...` }])
                    try {
                        const data = await canvasAssets.generateVoiceover({
                            text, language: language || 'en-IN',
                            speaker: speaker || 'anushka', speed: speed || 1.0,
                        })
                        if (data.success && data.audioUrl) {
                            if (!ctx.voiceovers) ctx.voiceovers = [];
                            ctx.voiceovers.push(data.audioUrl)
                            
                            // Create audio node on canvas
                            const cardW = 280
                            const cardH = 80
                            const x = 60, y = 80
                            const bg = new fabric.Rect({
                                left: x, top: y, width: cardW, height: cardH,
                                rx: 10, ry: 10,
                                fill: 'rgba(255, 77, 0,0.08)',
                                stroke: 'rgba(255, 77, 0,0.25)', strokeWidth: 1,
                                selectable: true, evented: true,
                                id: `vo-bg-${Date.now()}`, _nodeType: 'voiceover',
                                _audioUrl: data.audioUrl,
                            })
                            fc.add(bg)
                            const voLabel = new fabric.Textbox(` Voiceover${sceneRef ? ` • Scene ${sceneRef}` : ''}\n${text.substring(0, 60)}...`, {
                                left: x + 10, top: y + 10, width: cardW - 20,
                                fontSize: 11, fontFamily: 'Inter', fill: '#a78bfa',
                                selectable: false, evented: false,
                                id: `vo-label-${Date.now()}`, _nodeType: 'voiceover',
                            })
                            fc.add(voLabel)
                            const durLabel = new fabric.Textbox(`~${data.duration}s • ${data.provider}`, {
                                left: x + 10, top: y + cardH - 20, width: cardW - 20,
                                fontSize: 9, fontFamily: 'Inter', fill: '#7c3aed',
                                selectable: false, evented: false,
                                id: `vo-dur-${Date.Now()}`, _nodeType: 'voiceover',
                            })
                            fc.add(durLabel)
                            fc.renderAll()
                            return `Voiceover generated (${data.duration}s) — ${data.audioUrl}`
                        }
                        return 'Voiceover generation failed'
                    } catch (e) { return `Voiceover failed: ${e.message}` }
                }

                case 'generate_music': {
                    const { prompt, duration, mood } = args
                    setFidatoMessages(prev => [...prev, { role: 'assistant', content: `🎵 Generating music (${mood || 'auto'})...` }])
                    try {
                        const data = await canvasAssets.generateMusic({
                            prompt, duration: duration || 15, mood: mood || 'auto',
                        })
                        if (data.success && data.audioUrl) {
                            if (!ctx.music) ctx.music = [];
                            ctx.music.push(data.audioUrl)
                            
                            const cardW = 280
                            const cardH = 80
                            const x = 60, y = 80
                            const bg = new fabric.Rect({
                                left: x, top: y, width: cardW, height: cardH,
                                rx: 10, ry: 10,
                                fill: 'rgba(34,197,94,0.08)',
                                stroke: 'rgba(34,197,94,0.25)', strokeWidth: 1,
                                selectable: true, evented: true,
                                id: `music-bg-${Date.now()}`, _nodeType: 'music',
                                _audioUrl: data.audioUrl,
                            })
                            fc.add(bg)
                            const mLabel = new fabric.Textbox(`🎵 Music • ${mood || 'auto'}\n${prompt.substring(0, 60)}...`, {
                                left: x + 10, top: y + 10, width: cardW - 20,
                                fontSize: 11, fontFamily: 'Inter', fill: '#22c55e',
                                selectable: false, evented: false,
                                id: `music-label-${Date.now()}`, _nodeType: 'music',
                            })
                            fc.add(mLabel)
                            const mDur = new fabric.Textbox(`${data.duration}s • ${data.provider}`, {
                                left: x + 10, top: y + cardH - 20, width: cardW - 20,
                                fontSize: 9, fontFamily: 'Inter', fill: '#15803d',
                                selectable: false, evented: false,
                                id: `music-dur-${Date.now()}`, _nodeType: 'music',
                            })
                            fc.add(mDur)
                            fc.renderAll()
                            return `Music generated (${data.duration}s, ${mood || 'auto'} mood) — ${data.audioUrl}`
                        }
                        return `Music generation failed: ${data.error || 'Unknown error'}`
                    } catch (e) { return `Music failed: ${e.message}` }
                }

                case 'generate_sound_effect': {
                    const { prompt, duration } = args
                    setFidatoMessages(prev => [...prev, { role: 'assistant', content: `🔊 Generating SFX: "${prompt?.substring(0, 40)}..."` }])
                    try {
                        const data = await canvasAssets.generateSoundEffect({
                            prompt, duration: duration || 3,
                        })
                        if (data.success && data.audioUrl) {
                            const cardW = 220
                            const cardH = 60
                            const x = 60, y = 80
                            const bg = new fabric.Rect({
                                left: x, top: y, width: cardW, height: cardH,
                                rx: 8, ry: 8,
                                fill: 'rgba(251,191,36,0.08)',
                                stroke: 'rgba(251,191,36,0.25)', strokeWidth: 1,
                                selectable: true, evented: true,
                                id: `sfx-bg-${Date.now()}`, _nodeType: 'sfx',
                                _audioUrl: data.audioUrl,
                            })
                            fc.add(bg)
                            const sLabel = new fabric.Textbox(`🔊 SFX: ${prompt.substring(0, 40)}`, {
                                left: x + 8, top: y + 8, width: cardW - 16,
                                fontSize: 10, fontFamily: 'Inter', fill: '#fbbf24',
                                selectable: false, evented: false,
                                id: `sfx-label-${Date.now()}`, _nodeType: 'sfx',
                            })
                            fc.add(sLabel)
                            const sDur = new fabric.Textbox(`${data.duration}s`, {
                                left: x + 8, top: y + cardH - 18, width: cardW - 16,
                                fontSize: 9, fontFamily: 'Inter', fill: '#92400e',
                                selectable: false, evented: false,
                                id: `sfx-dur-${Date.now()}`, _nodeType: 'sfx',
                            })
                            fc.add(sDur)
                            fc.renderAll()
                            return `Sound effect generated (${data.duration}s) — ${data.audioUrl}`
                        }
                        return `SFX generation failed: ${data.error || 'Unknown error'}`
                        return `SFX generation failed: ${data.error || 'Unknown error'}`
                    } catch (e) { return `SFX failed: ${e.message}` }
                }

                case 'compile_workspace_assets': {
                    const { title, campaignType } = args
                    if (campaignType === 'image') {
                        // For image campaigns, we just arrange them nicely
                        return await executeToolCall({ name: 'auto_layout_grid', args: { columns: 3, includeTypes: ['image', 'character'] } }, fc, ctx)
                    }

                    // --- VIDEO CAMPAIGN COMPILATION ---
                    // 1. Poll for any pending videos in ctx.videos
                    if (!ctx.videos || Object.keys(ctx.videos).length === 0) return 'No videos found to compile.'
                    
                    const taskIds = Object.keys(ctx.videos)
                    setFidatoMessages(prev => [...prev, { role: 'assistant', content: `⏳ QA Check: Waiting for ${taskIds.length} video generation(s) to finish rendering...` }])
                    
                    let allDone = false;
                    let maxRetries = 60; // 5 mins total polling
                    const { API_BASE } = await import('../services/api')
                    const token = localStorage.getItem('mantram_token') || ''
                    
                    while (!allDone && maxRetries > 0) {
                        let completedCount = 0;
                        for (const tid of taskIds) {
                            if (ctx.videos[tid].status === 'COMPLETED' || ctx.videos[tid].status === 'FAILED') {
                                completedCount++;
                                continue;
                            }
                            try {
                                const resp = await fetch(`${API_BASE}/video-studio/${tid}/status`, { headers: { Authorization: `Bearer ${token}` } })
                                const statusData = await resp.json()
                                if (statusData.status === 'COMPLETED') {
                                    ctx.videos[tid].status = 'COMPLETED';
                                    ctx.videos[tid].url = statusData.generation?.videoUrl || statusData.videoUrl;
                                    console.log('Video completed:', tid, ctx.videos[tid].url);
                                } else if (statusData.status === 'FAILED') {
                                    ctx.videos[tid].status = 'FAILED';
                                    console.log('Video failed:', tid);
                                }
                            } catch (e) { console.warn('Poll err', e) }
                        }
                        if (completedCount === taskIds.length) {
                            allDone = true;
                        } else {
                            await new Promise(r => setTimeout(r, 5000));
                            maxRetries--;
                        }
                    }

                    // 2. Gather URLs
                    // We must wait for React state updates to guarantee videos are fully compiled
                    const finalClips = taskIds.filter(t => ctx.videos[t].url).map(t => ctx.videos[t].url)
                    const voUrl = ctx.voiceovers && ctx.voiceovers.length > 0 ? ctx.voiceovers[0] : null
                    const bgmUrl = ctx.music && ctx.music.length > 0 ? ctx.music[0] : null

                    if (finalClips.length === 0) return 'Compilation aborted: All video generations failed.'

                    setFidatoMessages(prev => [...prev, { role: 'assistant', content: ` Compiling Final Ad Film "${title}" with FFmpeg...` }])

                    // 3. POST to FFmpeg Compilation Route
                    try {
                        const compileData = await canvasAssets.compileVideo({
                            title,
                            clips: finalClips,
                            voiceoverUrl: voUrl,
                            musicUrl: bgmUrl
                        })

                        if (compileData.success && compileData.videoUrl) {
                            // Render massive 16:9 vertical video on canvas
                            await executeToolCall({ name: 'auto_layout_grid', args: { columns: 4 } }, fc, ctx)
                            
                            const cardW = 400
                            const cardH = 711 // 16:9 vertical
                            const bg = new fabric.Rect({
                                left: 60, top: 400, width: cardW, height: cardH,
                                rx: 16, ry: 16, fill: '#000',
                                stroke: 'rgba(255,255,255,0.2)', strokeWidth: 2,
                                shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.5)', blur: 24, offsetY: 12 }),
                                selectable: true, evented: true,
                                id: `final-ad-${Date.now()}`, _nodeType: 'video',
                                customName: `Final Ad: ${title}`,
                                _videoUrl: compileData.videoUrl
                            })
                            fc.add(bg)
                            const icon = new fabric.Textbox('videocam', {
                                left: 60 + cardW / 2 - 30, top: 400 + cardH / 2 - 40,
                                width: 60, fontSize: 48, textAlign: 'center', selectable: false
                            })
                            fc.add(icon)
                            const label = new fabric.Textbox(`FINAL CAMPAIGN\n${title}`, {
                                left: 60 + 20, top: 400 + cardH - 60, width: cardW - 40,
                                fontSize: 16, fontWeight: '800', fontFamily: 'Inter',
                                fill: '#fff', textAlign: 'center', selectable: false
                            })
                            fc.add(label)
                            fc.renderAll()

                            return { text: `Successfully compiled the final ad film "${title}"!`, thumbnail: compileData.videoUrl }
                        }
                        return `Compilation completed, but no video URL returned: ${compileData.error || ''}`
                    } catch (e) {
                        return `FFmpeg compilation failed: ${e.message}`
                    }
                }

                default:
                    return `Unknown tool: ${name}`
            }
        }

        try {
            const fc = fabricRef.current
            const lowerMsg = msg.toLowerCase()

            // Build canvas state snapshot for Claude
            const canvasElements = fc ? fc.getObjects()
                .filter(o => o.id !== 'artboard')
                .map((obj, i) => ({
                    type: obj.type,
                    name: obj.customName || obj._customName || obj.type,
                    left: Math.round(obj.left || 0),
                    top: Math.round(obj.top || 0),
                    width: Math.round((obj.width || 0) * (obj.scaleX || 1)),
                    height: Math.round((obj.height || 0) * (obj.scaleY || 1)),
                    fill: obj.fill,
                    text: obj.text?.substring(0, 50),
                    _nodeType: obj._nodeType || null,
                    _audioUrl: obj._audioUrl || null,
                    src: obj.type === 'image' ? (obj._element?.src || obj.getSrc?.() || '').substring(0, 200) : null,
                })) : []

            // Capture which objects are currently selected by the user
            const activeObjects = fc?.getActiveObjects?.() || []
            const selectedElements = activeObjects.map(obj => ({
                type: obj.type,
                name: obj.customName || obj._customName || obj.type,
                text: obj.text?.substring(0, 100),
                src: obj.type === 'image' ? (obj._element?.src || obj.getSrc?.() || '').substring(0, 200) : null,
                fill: obj.fill,
                _nodeType: obj._nodeType || null,
                width: Math.round((obj.width || 0) * (obj.scaleX || 1)),
                height: Math.round((obj.height || 0) * (obj.scaleY || 1)),
            }))

            const artboard = fc?.getObjects().find(o => o.id === 'artboard')
            const canvasState = {
                width: artboard ? Math.round(artboard.width) : fc?._logicalWidth || 1080,
                height: artboard ? Math.round(artboard.height) : fc?._logicalHeight || 1080,
                elements: canvasElements,
                selectedElements: selectedElements.length > 0 ? selectedElements : undefined,
                selectedCount: selectedElements.length,
            }

            // Build conversation history (last few messages)
            const conversationHistory = fidatoMessages.slice(-6).map(m => ({
                role: m.role,
                content: typeof m.content === 'string' ? m.content : 'image',
            }))

            // Show progressive thinking indicator with steps
            const thinkingSteps = [
                { icon: 'psychology', text: 'Analyzing your request...', status: 'active' },
                { icon: 'photo_library', text: selectedElements.length > 0 ? `Reviewing ${selectedElements.length} selected element(s)...` : 'Scanning canvas state...', status: 'pending' },
                { icon: 'architecture', text: 'Planning creative actions...', status: 'pending' },
            ]
            setFidatoMessages(prev => [...prev, { role: 'assistant', content: '', thinking: true, thinkingSteps }])
            setTimeout(() => fidatoMsgEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)

            // Update step 1 → 2
            setTimeout(() => {
                setFidatoMessages(prev => {
                    const updated = [...prev]
                    const last = { ...updated[updated.length - 1] }
                    if (last?.thinking) {
                        last.thinkingSteps = last.thinkingSteps.map((s, i) =>
                            i === 0 ? { ...s, status: 'done' } : i === 1 ? { ...s, status: 'active' } : s
                        )
                        updated[updated.length - 1] = last
                    }
                    return updated
                })
            }, 1500)

            // Update step 2 → 3
            setTimeout(() => {
                setFidatoMessages(prev => {
                    const updated = [...prev]
                    const last = { ...updated[updated.length - 1] }
                    if (last?.thinking) {
                        last.thinkingSteps = last.thinkingSteps.map((s, i) =>
                            i <= 1 ? { ...s, status: 'done' } : { ...s, status: 'active' }
                        )
                        updated[updated.length - 1] = last
                    }
                    return updated
                })
            }, 3000)

            // Call Claude tool-use endpoint
            const result = await fidatoAPI.canvasDirect({
                message: selectedElements.length > 0
                    ? `${msg}\n\n[USER HAS ${selectedElements.length} ELEMENT(S) SELECTED ON CANVAS: ${selectedElements.map(e => e.type === 'image' ? `Image(${e.src?.substring(0, 80) || 'uploaded'})` : `${e.type}("${e.text || e.name}")`).join(', ')}. WORK WITH THESE SELECTED ELEMENTS WHEN RELEVANT.]`
                    : msg,
                canvasState,
                conversationHistory,
                signal: abortController.signal,
            })

            // ── PHASE 1: Pre-flight confirmation — show research results before proceeding ──
            if (result.preflightConfirmation) {
                const imgCount = (result.referenceImages || []).length;
                const researchPreview = (result.research || '').substring(0, 300).replace(/##/g, '').trim();
                
                // Show research results as a confirmation message
                setFidatoMessages(prev => {
                    const updated = [...prev];
                    const last = { ...updated[updated.length - 1] };
                    last.thinking = false;
                    last.content = `🔍 **Research Complete** for "${result.productName || 'product'}"\n\n${imgCount > 0 ? `<span className="material-symbols-outlined text-[inherit] text-lg align-middle mr-1 -mt-0.5">check_circle</span> Found ${imgCount} product image(s)` : '⚠️ No product images found'}\n\n📄 ${researchPreview}${researchPreview.length >= 300 ? '...' : ''}`;
                    last.referenceImages = result.referenceImages || [];
                    updated[updated.length - 1] = last;
                    return updated;
                });

                // Auto-proceed to Phase 2 with the confirmed research data
                setFidatoMessages(prev => [...prev, { role: 'assistant', content: '⏳ Proceeding to creative pipeline with found research...', thinking: true }]);

                const phase2Result = await fidatoAPI.canvasDirect({
                    message: msg,
                    canvasState,
                    conversationHistory,
                    preflightResearchData: {
                        research: result.research,
                        referenceImages: result.referenceImages,
                    },
                    signal: abortController.signal,
                });

                // Replace the "proceeding" message with the actual Claude response
                setFidatoMessages(prev => {
                    const updated = [...prev];
                    updated[updated.length - 1] = {
                        role: 'assistant',
                        content: phase2Result.text || phase2Result.reply || '',
                        thinking: false,
                    };
                    return updated;
                });

                // Use phase2Result for tool execution below
                Object.assign(result, phase2Result);
                result.preflightConfirmation = false; // Reset so we proceed to tool execution
            }

            // Execute tool calls against the canvas with progress updates
            const toolResults = []
            if (result.toolCalls?.length > 0 && fc) {
                const totalTools = result.toolCalls.length;
                
                // 1. Setup the initial visual plan block
                const initTime = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
                setFidatoMessages(prev => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last) {
                        last.thinking = false; // Turn off the main spinner
                        last.plan = {
                            title: `Created plan 0/${totalTools}`,
                            items: result.toolCalls.map(tc => ({
                                id: tc.name + Math.random(),
                                text: `${tc.name.replace(/_/g, ' ')}`,
                                status: 'pending' // 'pending' | 'active' | 'done' | 'error'
                            }))
                        };
                        last.processLogs = [{ time: initTime, text: `[System] Parsed ${totalTools} task sequence(s) from agent strategy.` }];
                    }
                    return updated;
                });
                
                const addLog = (text) => {
                    const time = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
                    setFidatoMessages(prev => {
                        const updated = [...prev];
                        const last = { ...updated[updated.length - 1] };
                        if (last) {
                            last.processLogs = [...(last.processLogs || []), { time, text }];
                            updated[updated.length - 1] = last;
                        }
                        return updated;
                    });
                };

                // 2. Execute sequentially and update plan dynamically
                let executionContext = { scenes: [], videos: [], voiceovers: [], music: [], referenceImages: result.referenceImages || [] };
                
                // Log if reference images were found by the agent
                if (executionContext.referenceImages.length > 0) {
                    addLog(`[Agent] Downloaded ${executionContext.referenceImages.length} reference images from the web`);
                    console.log('🖼️ Reference images from agent:', executionContext.referenceImages.map(i => i.url));
                }
                
                for (let ti = 0; ti < totalTools; ti++) {
                    const tc = result.toolCalls[ti]
                    console.log(` Executing tool: ${tc.name}`, tc.args)
                    const startTime = Date.now();
                    
                    addLog(`[TaskRunner] Executing ${tc.name}...`);
                    addLog(`[Payload] ${JSON.stringify(tc.args)}`);

                    // Mark task as active
                    setFidatoMessages(prev => {
                        const updated = [...prev];
                        const last = { ...updated[updated.length - 1] };
                        if (last && last.plan) {
                            const newPlan = { ...last.plan };
                            const newItems = [...newPlan.items];
                            newItems[ti] = { ...newItems[ti], status: 'active' };
                            newPlan.title = `Updated plan ${ti + 1}/${totalTools}`;
                            newPlan.items = newItems;
                            last.plan = newPlan;
                            updated[updated.length - 1] = last;
                        }
                        return updated;
                    });

                    try {
                        let result2 = await executeToolCall(tc, fc, executionContext)
                        let text = result2;
                        let mediaUrls = [];
                        
                        if (typeof result2 === 'object' && result2 !== null) {
                            text = result2.text;
                            if (result2.thumbnail) mediaUrls = [result2.thumbnail];
                            if (result2.thumbnails) mediaUrls = result2.thumbnails;
                        }
                        
                        // Mark task as done
                        setFidatoMessages(prev => {
                            const updated = [...prev];
                            const last = { ...updated[updated.length - 1] };
                            if (last && last.plan) {
                                const newPlan = { ...last.plan };
                                const newItems = [...newPlan.items];
                                const newItem = { ...newItems[ti], status: 'done', resultText: text };
                                if (mediaUrls.length > 0) {
                                    newItem.thumbnails = [...(newItem.thumbnails || []), ...mediaUrls];
                                }
                                newItems[ti] = newItem;
                                newPlan.items = newItems;
                                last.plan = newPlan;
                                updated[updated.length - 1] = last;
                            }
                            return updated;
                        });
                        
                        toolResults.push(` ${text}`)
                        addLog(`[Success] Call returned ok in ${Date.now() - startTime}ms.`);
                    } catch (err) {
                        console.error('Tool execution error:', err);
                        addLog(`[Error] Execution failed in ${Date.now() - startTime}ms: ${err.message}`);
                        
                        // Mark task as error
                        setFidatoMessages(prev => {
                            const updated = [...prev];
                            const last = { ...updated[updated.length - 1] };
                            if (last && last.plan) {
                                const newPlan = { ...last.plan };
                                const newItems = [...newPlan.items];
                                newItems[ti] = { ...newItems[ti], status: 'error' };
                                newPlan.items = newItems;
                                last.plan = newPlan;
                                updated[updated.length - 1] = last;
                            }
                            return updated;
                        });
                        
                        toolResults.push(` Failed ${tc.name}`);
                    }
                }
                
                // Finalize plan title
                setFidatoMessages(prev => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last && last.plan) {
                        last.plan.title = `Completed plan ${totalTools}/${totalTools}`;
                    }
                    return updated;
                });
                
                saveHistory()
                updateLayers()
            }

            // Build final response
            const reply = result.reply || 'Done!'
            const actionSummary = toolResults.length > 0
                ? `\n\n**Actions:**\n${toolResults.join('\n')}`
                : ''
            const providerNote = result.fallback ? ` *(via ${result.provider})* ` : ''

            // Extract searches from reasoning
            let searches = []
            let cleanReasoning = result.thinking || ''
            const searchRegex = /<search query="([^"]+)">([\s\S]*?)<\/search>/gi
            let match;
            while ((match = searchRegex.exec(cleanReasoning)) !== null) {
                searches.push({ query: match[1], result: match[2].trim() })
            }
            cleanReasoning = cleanReasoning.replace(searchRegex, '').trim()

            // Update the "thinking..." message with real response + reasoning
            setFidatoMessages(prev => {
                const updated = [...prev]
                const lastIdx = updated.length - 1
                const newMsgData = {
                    role: 'assistant',
                    content: `${reply}${actionSummary}${providerNote}`,
                    reasoning: cleanReasoning || undefined,
                    searches: searches.length > 0 ? searches : undefined,
                    research: result.research || undefined,
                    referenceImages: result.referenceImages || undefined,
                }
                
                if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
                    updated[lastIdx] = newMsgData
                } else {
                    updated.push(newMsgData)
                }
                return updated
            })

        } catch (err) {
            console.error('Fidato Canvas error:', err)
            // Remove the "thinking" message and show error
            setFidatoMessages(prev => {
                const updated = [...prev]
                const lastIdx = updated.length - 1
                if (lastIdx >= 0 && (updated[lastIdx].thinking || updated[lastIdx].content?.includes('thinking'))) {
                    updated[lastIdx] = { role: 'assistant', content: ` Error: ${err.message}` }
                } else {
                    updated.push({ role: 'assistant', content: ` Error: ${err.message}` })
                }
                return updated
            })
        }
        setFidatoLoading(false)
        setTimeout(() => fidatoMsgEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 200)
    }, [fidatoInput, fidatoLoading, activeBrand, addImageUrlToCanvas, saveHistory, updateLayers, addShape, resizeToPreset, fidatoMessages])

    const SIDEBAR_TABS = [
        { id: 'ai', emoji: '✦', label: 'AI', isAi: true },
        { id: 'elements', emoji: '◇', label: 'Elements' },
        { id: 'text-styles', emoji: '𝐓', label: 'Text' },
        { id: 'apps', emoji: '⊞', label: 'Apps' },
        { id: 'templates', emoji: '▦', label: 'Templates' },
        { id: 'images', emoji: '◐', label: 'Images' },
        { id: 'icons', emoji: '☆', label: 'Icons' },
        { id: 'textures', emoji: '∿', label: 'Textures' },
        { id: 'fonts', emoji: '𝔸', label: 'Fonts' },
        { id: 'stickers', emoji: '◉', label: 'Stickers' },
        { id: 'brand', emoji: '◈', label: 'Brand' },
        { id: 'gradients', emoji: '◑', label: 'Gradients' },
    ]

    // ── Keyboard shortcuts ──
    useEffect(() => {
        const handler = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return
            if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo() }
            if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); handleRedo() }
            if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected() }
            if ((e.metaKey || e.ctrlKey) && e.key === 'd') { e.preventDefault(); duplicateSelected() }
            if ((e.metaKey || e.ctrlKey) && e.key === 'c') { e.preventDefault(); copySelected() }
            if ((e.metaKey || e.ctrlKey) && e.key === 'x') { e.preventDefault(); cutSelected() }
            if ((e.metaKey || e.ctrlKey) && e.key === 'v') { e.preventDefault(); pasteFromClipboard() }
            if ((e.metaKey || e.ctrlKey) && e.key === 'g' && !e.shiftKey) { e.preventDefault(); groupSelected() }
            if ((e.metaKey || e.ctrlKey) && e.key === 'g' && e.shiftKey) { e.preventDefault(); ungroupSelected() }
            if (e.key === 'Escape') { closeContextMenu() }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [handleUndo, handleRedo, copySelected, cutSelected, pasteFromClipboard, groupSelected, ungroupSelected, closeContextMenu]) // eslint-disable-line react-hooks/exhaustive-deps

    // ── Infinite canvas: spacebar+drag pan, scroll-to-zoom ──
    useEffect(() => {
        const container = containerRef.current
        const fc = fabricRef.current
        if (!container || !fc) return

        let isSpaceHeld = false
        let isPanning = false
        let lastPanX = 0
        let lastPanY = 0

        // ── Spacebar: enter/exit pan mode ──
        const handleKeyDown = (e) => {
            if (e.code === 'Space' && !e.repeat && !isSpaceHeld) {
                // Don't hijack if user is typing in an input
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return
                e.preventDefault()
                isSpaceHeld = true
                container.classList.add('panning')
                if (fc) fc.selection = false // Disable selection while panning
            }
        }
        const handleKeyUp = (e) => {
            if (e.code === 'Space') {
                isSpaceHeld = false
                isPanning = false
                container.classList.remove('panning')
                if (fc) fc.selection = true
            }
        }

        // ── Mouse drag while space held = pan ──
        const handleMouseDown = (e) => {
            if (isSpaceHeld) {
                isPanning = true
                lastPanX = e.clientX
                lastPanY = e.clientY
                e.preventDefault()
            }
        }
        const handleMouseMove = (e) => {
            if (isPanning && isSpaceHeld && fc) {
                const dx = e.clientX - lastPanX
                const dy = e.clientY - lastPanY
                lastPanX = e.clientX
                lastPanY = e.clientY

                const vpt = fc.viewportTransform
                vpt[4] += dx
                vpt[5] += dy
                fc.setViewportTransform(vpt)
                fc.renderAll()
            }
        }
        const handleMouseUp = () => {
            isPanning = false
        }

        // ── Scroll: Ctrl/Cmd+scroll = zoom, plain scroll = pan ──
        const handleWheel = (e) => {
            e.preventDefault()
            if (!fc) return

            if (e.ctrlKey || e.metaKey) {
                // Zoom
                const delta = e.deltaY > 0 ? -5 : 5
                const newZoom = Math.max(10, Math.min(400, zoom + delta))
                setZoom(newZoom)
                fc.setZoom(newZoom / 100)
                fc.renderAll()
            } else {
                // Pan
                const vpt = fc.viewportTransform
                vpt[4] -= e.deltaX
                vpt[5] -= e.deltaY
                fc.setViewportTransform(vpt)
                fc.renderAll()
            }
        }

        // Attach events
        document.addEventListener('keydown', handleKeyDown)
        document.addEventListener('keyup', handleKeyUp)
        container.addEventListener('mousedown', handleMouseDown)
        document.addEventListener('mousemove', handleMouseMove)
        document.addEventListener('mouseup', handleMouseUp)
        container.addEventListener('wheel', handleWheel, { passive: false })

        // Close context menu on click anywhere
        const handleClick = () => closeContextMenu()
        window.addEventListener('click', handleClick)

        return () => {
            document.removeEventListener('keydown', handleKeyDown)
            document.removeEventListener('keyup', handleKeyUp)
            container.removeEventListener('mousedown', handleMouseDown)
            document.removeEventListener('mousemove', handleMouseMove)
            document.removeEventListener('mouseup', handleMouseUp)
            container.removeEventListener('wheel', handleWheel)
            window.removeEventListener('click', handleClick)
            container.classList.remove('panning')
        }
    }, [zoom, closeContextMenu])

    // ── Determine current preset info ──
    const currentPreset = PRESETS.find(p => p.id === activePreset) || PRESETS[0]

    // ══════════════════════════════════════════════════════════════════════
    // ── RENDER ──
    // ══════════════════════════════════════════════════════════════════════

    return (
        <div className={`canvas-editor ${canvasTheme === 'light' ? 'theme-light' : ''}`}>
            {/* ── TOP TOOLBAR ── */}
            <div className="ce-toolbar">
                <div className="ce-toolbar-left">
                    <button className="ce-back-btn" onClick={() => navigate('/creative-studio')}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>
                        Back
                    </button>
                    <div className="ce-divider" />
                    {/* View switcher */}
                    <div className="ce-view-tabs">
                        <button className={`ce-view-tab ${canvasView === 'board' ? 'active' : ''}`} onClick={() => setCanvasView('board')}>
                            <span className="material-symbols-outlined">dashboard</span>
                            Board
                        </button>
                        <button className={`ce-view-tab ${canvasView === 'design' ? 'active' : ''}`} onClick={() => setCanvasView('design')}>
                            <span className="material-symbols-outlined">brush</span>
                            Design
                        </button>
                        <button className={`ce-view-tab ${canvasView === 'timeline' ? 'active' : ''}`} onClick={() => setCanvasView('timeline')}>
                            <span className="material-symbols-outlined">view_timeline</span>
                            Timeline
                        </button>
                    </div>

                </div>

                {/* Center tools */}
                {(
                    <div className="ce-toolbar-center">
                        <button className={`ce-tool-btn ${activeTool === 'select' ? 'active' : ''}`}
                            onClick={() => setActiveTool('select')} title="Select (V)">
                            <span className="material-symbols-outlined">arrow_selector_tool</span>
                        </button>
                        <button className="ce-tool-btn" onClick={() => setShowTextModal(true)} title="Add Text (T)">
                            <span className="material-symbols-outlined">text_fields</span>
                        </button>
                        <div className="ce-divider" />
                        <button className="ce-tool-btn" onClick={handleUndo} disabled={!canUndo} title="Undo (⌘Z)">
                            <span className="material-symbols-outlined">undo</span>
                        </button>
                        <button className="ce-tool-btn" onClick={handleRedo} disabled={!canRedo} title="Redo (⌘⇧Z)">
                            <span className="material-symbols-outlined">redo</span>
                        </button>
                        <div className="ce-divider" />
                        <button className="ce-tool-btn" onClick={duplicateSelected} title="Duplicate (⌘D)">
                            <span className="material-symbols-outlined">content_copy</span>
                        </button>
                        <button className="ce-tool-btn" onClick={deleteSelected} title="Delete (⌫)">
                            <span className="material-symbols-outlined">delete</span>
                        </button>
                        <div className="ce-divider" />
                        <button className="ce-tool-btn" onClick={bringForward} title="Bring Forward">
                            <span className="material-symbols-outlined">flip_to_front</span>
                        </button>
                        <button className="ce-tool-btn" onClick={sendBackward} title="Send Backward">
                            <span className="material-symbols-outlined">flip_to_back</span>
                        </button>
                    </div>
                )}

                <div className="ce-toolbar-right">
                    <button className="ce-tool-btn-label" onClick={() => exportCanvas('png')}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>download</span>
                        PNG
                    </button>
                    <button className="ce-tool-btn-label" onClick={() => exportCanvas('jpeg')}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>download</span>
                        JPG
                    </button>
                    <div className="ce-divider" />
                    <button className="ce-save-btn" onClick={() => {
                        exportCanvas('png')
                        showToast('✅ Saved & ready for campaign!')
                    }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>check_circle</span>
                        Save & Use
                    </button>
                </div>
            </div>

            {/* ── MAIN AREA ── */}
            <div className="ce-main">

                <div className={`ce-sidebar-left ${sidebarCollapsed ? 'collapsed' : ''}`}>
                    {/* Collapse toggle */}
                    <button className="ce-sidebar-collapse-btn" onClick={() => setSidebarCollapsed(prev => !prev)} title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
                        <span className="material-symbols-outlined">{sidebarCollapsed ? 'chevron_right' : 'chevron_left'}</span>
                    </button>
                    {/* ── Icon Rail ── */}
                    <div className="ce-icon-rail">
                        {SIDEBAR_TABS.map(tab => (
                            <button key={tab.id}
                                className={`ce-rail-btn ${sidebarTab === tab.id && panelOpen ? 'active' : ''} ${tab.isAi ? 'ai-tab' : ''}`}
                                onClick={() => handleTabClick(tab.id)}
                                title={tab.label}>
                                <span className="ce-rail-icon">{tab.emoji}</span>
                                <span className="ce-rail-label">{tab.label}</span>
                            </button>
                        ))}
                    </div>

                    {/* ── Content Panel ── */}
                    <div className={`ce-content-panel ${!panelOpen ? 'panel-collapsed' : ''}`}>
                        <div className="ce-content-panel-inner">

                            {/* ── AI TAB — FreePik-Style Image Editor ── */}
                            {sidebarTab === 'ai' && (
                                <div className="ce-panel ce-ai-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0 }}>
                                    {/* Header */}
                                    <div className="ce-ai-header">
                                        <div className="ce-ai-header-title">
                                            <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#a78bfa' }}>auto_awesome</span>
                                            <span>AI Editor</span>
                                        </div>
                                        <span className="ce-ai-model-badge">
                                            <span className="material-symbols-outlined" style={{ fontSize: 10 }}>bolt</span>
                                            Gemini Flash
                                        </span>
                                    </div>

                                    {/* ── 5 Tool Cards ── */}
                                    <div className="ce-ai-tool-cards">
                                        {[
                                            { id: 'prompt', icon: 'magic_button', label: 'Prompt', desc: 'Edit by text' },
                                            { id: 'creative', icon: 'dashboard_customize', label: 'Creative', desc: 'Keywords → design' },
                                            { id: 'visual', icon: 'gesture', label: 'Visual', desc: 'Paint & edit' },
                                            { id: 'retouch', icon: 'auto_fix', label: 'Retouch', desc: 'Mask & replace' },
                                            { id: 'background', icon: 'wallpaper', label: 'BG', desc: 'Remove / swap' },
                                        ].map(t => (
                                            <button key={t.id}
                                                className={`ce-ai-tool-card ${aiTool === t.id ? 'active' : ''}`}
                                                onClick={() => {
                                                    setAiTool(t.id); setAiResult(null); setAiError('')
                                                    // Enable mask mode for visual/retouch
                                                    if (t.id === 'visual' || t.id === 'retouch') {
                                                        toggleMaskMode(true)
                                                    } else {
                                                        toggleMaskMode(false)
                                                    }
                                                }}>
                                                <span className="material-symbols-outlined ce-ai-tool-card-icon">{t.icon}</span>
                                                <span className="ce-ai-tool-card-label">{t.label}</span>
                                                <span className="ce-ai-tool-card-desc">{t.desc}</span>
                                            </button>
                                        ))}
                                    </div>

                                    {/* ── Tool-specific UI ── */}
                                    <div className="ce-ai-tool-body">

                                        {/* === PROMPT TOOL === */}
                                        {aiTool === 'prompt' && (
                                            <div className="ce-ai-tool-section flex flex-col gap-3">
                                                <p className="ce-ai-tool-hint">
                                                    ✨ Describe what you want. If the canvas has content, Gemini edits it preserving layout. If empty, AI generates a new image.
                                                </p>

                                                {/* Edit History Timeline */}
                                                {editHistory.length > 0 && (
                                                    <div className="bg-[var(--sys-surface)] rounded-xl p-3 max-h-[200px] overflow-y-auto custom-scrollbar flex flex-col gap-2 border border-[var(--sys-border)]">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-[10px] font-bold text-[var(--sys-text-muted)] uppercase">Edit Timeline</span>
                                                            <button onClick={() => { handleUndo(); setEditHistory(prev => prev.slice(0, -1)); }} 
                                                                className="text-[10px] text-primary hover:text-[var(--sys-primary)] flex items-center gap-1 cursor-pointer">
                                                                <span className="material-symbols-outlined" style={{fontSize: 12}}>undo</span> Revert Last
                                                            </button>
                                                        </div>
                                                        {editHistory.map((h, i) => (
                                                            <div key={i} className="flex gap-2 items-start bg-[var(--sys-surface)] rounded-lg p-2 border border-[var(--sys-border)]">
                                                                <div className="w-4 h-4 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center text-[9px] font-bold mt-0.5 flex-shrink-0">
                                                                    {i + 1}
                                                                </div>
                                                                <p className="text-[11px] text-[var(--sys-text-muted)] flex-1 leading-tight">{h.prompt}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                <div className="ce-ai-prompt-bar">
                                                    <textarea
                                                        className="ce-ai-prompt-input"
                                                        placeholder="e.g. Make the lighting warmer, add a sunset glow..."
                                                        value={aiPrompt}
                                                        onChange={e => setAiPrompt(e.target.value)}
                                                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAiSubmit() } }}
                                                        rows={3}
                                                    />
                                                    <button className="ce-ai-send-btn" onClick={handleAiSubmit} disabled={aiLoading || !aiPrompt.trim()}>
                                                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{aiLoading ? 'progress_activity' : 'arrow_upward'}</span>
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* === VISUAL TOOL (Inpaint) === */}
                                        {aiTool === 'visual' && (
                                            <div className="ce-ai-tool-section">
                                                <p className="ce-ai-tool-hint">
                                                    🖌️ Paint over the area you want to change, then describe what should replace it.
                                                </p>
                                                {/* Mask Controls */}
                                                <div className="ce-ai-mask-controls">
                                                    <div className="ce-ai-mask-status">
                                                        <span className={`ce-ai-mask-dot ${isMaskMode ? 'active' : ''}`} />
                                                        <span>{isMaskMode ? 'Painting mask...' : 'Mask mode off'}</span>
                                                    </div>
                                                    <button className="ce-ai-mask-clear" onClick={clearMaskStrokes}>
                                                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete_sweep</span>
                                                        Clear
                                                    </button>
                                                </div>
                                                {/* Brush Size */}
                                                <div className="ce-ai-brush-row">
                                                    <span className="ce-ai-brush-label">Brush</span>
                                                    <input type="range" min="5" max="80" value={maskBrushSize}
                                                        onChange={e => setMaskBrushSize(Number(e.target.value))}
                                                        className="ce-ai-brush-slider" />
                                                    <span className="ce-ai-brush-value">{maskBrushSize}px</span>
                                                </div>
                                                {/* Prompt */}
                                                <div className="ce-ai-prompt-bar">
                                                    <textarea
                                                        className="ce-ai-prompt-input"
                                                        placeholder="e.g. Replace with a blue sky, add flowers here..."
                                                        value={aiPrompt}
                                                        onChange={e => setAiPrompt(e.target.value)}
                                                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAiSubmit() } }}
                                                        rows={2}
                                                    />
                                                    <button className="ce-ai-send-btn" onClick={handleAiSubmit} disabled={aiLoading || !aiPrompt.trim()}>
                                                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{aiLoading ? 'progress_activity' : 'arrow_upward'}</span>
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* === RETOUCH / REPLACE TOOL === */}
                                        {aiTool === 'retouch' && (
                                            <div className="ce-ai-tool-section">
                                                <p className="ce-ai-tool-hint">
                                                    🎯 Paint a mask over the area to retouch. Optionally upload a replacement image or describe what should go there.
                                                </p>
                                                {/* Mask Controls */}
                                                <div className="ce-ai-mask-controls">
                                                    <div className="ce-ai-mask-status">
                                                        <span className={`ce-ai-mask-dot ${isMaskMode ? 'active' : ''}`} />
                                                        <span>{isMaskMode ? 'Painting mask...' : 'Mask mode off'}</span>
                                                    </div>
                                                    <button className="ce-ai-mask-clear" onClick={clearMaskStrokes}>
                                                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete_sweep</span>
                                                        Clear
                                                    </button>
                                                </div>
                                                {/* Brush Size */}
                                                <div className="ce-ai-brush-row">
                                                    <span className="ce-ai-brush-label">Brush</span>
                                                    <input type="range" min="5" max="80" value={maskBrushSize}
                                                        onChange={e => setMaskBrushSize(Number(e.target.value))}
                                                        className="ce-ai-brush-slider" />
                                                    <span className="ce-ai-brush-value">{maskBrushSize}px</span>
                                                </div>
                                                {/* Replacement Image Upload */}
                                                <div className="ce-ai-replace-upload">
                                                    <label className="ce-ai-replace-label">
                                                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>upload</span>
                                                        {replaceImage ? 'Image uploaded ✓' : 'Upload replacement image (optional)'}
                                                        <input type="file" accept="image/*" onChange={handleReplaceImageUpload} style={{ display: 'none' }} />
                                                    </label>
                                                    {replaceImage && (
                                                        <div className="ce-ai-replace-preview">
                                                            <img src={replaceImage} alt="Replace" />
                                                            <button onClick={() => setReplaceImage(null)} className="ce-ai-replace-remove">×</button>
                                                        </div>
                                                    )}
                                                </div>
                                                {/* Prompt */}
                                                <div className="ce-ai-prompt-bar">
                                                    <textarea
                                                        className="ce-ai-prompt-input"
                                                        placeholder="e.g. Clean up this area, replace with marble texture..."
                                                        value={aiPrompt}
                                                        onChange={e => setAiPrompt(e.target.value)}
                                                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAiSubmit() } }}
                                                        rows={2}
                                                    />
                                                    <button className="ce-ai-send-btn" onClick={handleAiSubmit} disabled={aiLoading}>
                                                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{aiLoading ? 'progress_activity' : 'arrow_upward'}</span>
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* === BACKGROUND TOOL === */}
                                        {aiTool === 'background' && (
                                            <div className="ce-ai-tool-section">
                                                <p className="ce-ai-tool-hint">
                                                    🖼️ Remove the background entirely or replace it with something new.
                                                </p>
                                                {/* Action Toggle */}
                                                <div className="ce-ai-bg-toggle">
                                                    <button className={`ce-ai-bg-btn ${bgAction === 'remove' ? 'active' : ''}`}
                                                        onClick={() => setBgAction('remove')}>
                                                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>content_cut</span>
                                                        Remove BG
                                                    </button>
                                                    <button className={`ce-ai-bg-btn ${bgAction === 'replace' ? 'active' : ''}`}
                                                        onClick={() => setBgAction('replace')}>
                                                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>landscape</span>
                                                        Replace BG
                                                    </button>
                                                </div>
                                                {bgAction === 'replace' && (
                                                    <div className="ce-ai-prompt-bar" style={{ marginTop: 8 }}>
                                                        <textarea
                                                            className="ce-ai-prompt-input"
                                                            placeholder="e.g. A tropical beach at sunset, a modern office..."
                                                            value={bgPrompt}
                                                            onChange={e => setBgPrompt(e.target.value)}
                                                            rows={2}
                                                        />
                                                    </div>
                                                )}
                                                <button className="ce-ai-bg-action-btn" onClick={handleAiSubmit} disabled={aiLoading}>
                                                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                                                        {aiLoading ? 'progress_activity' : (bgAction === 'remove' ? 'content_cut' : 'landscape')}
                                                    </span>
                                                    {aiLoading ? 'Processing...' : (bgAction === 'remove' ? 'Remove Background' : 'Replace Background')}
                                                </button>
                                            </div>
                                        )}

                                        {/* === CREATIVE TOOL (Keywords → Editable Design) === */}
                                        {aiTool === 'creative' && (
                                            <div className="ce-ai-tool-section">
                                                <p className="ce-ai-tool-hint">
                                                    🎨 Enter keywords and pick a style. AI will generate a fully editable design with text, shapes, and layout.
                                                </p>
                                                <div className="ce-ai-prompt-bar">
                                                    <textarea
                                                        className="ce-ai-prompt-input"
                                                        placeholder="e.g. summer sale, 50% off, fashion brand, tropical vibes..."
                                                        value={aiCreativeKeywords}
                                                        onChange={e => setAiCreativeKeywords(e.target.value)}
                                                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); aiCreativeGenerate() } }}
                                                        rows={3}
                                                    />
                                                </div>
                                                <div style={{ padding: '8px 0' }}>
                                                    <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>STYLE</span>
                                                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                                                        {['modern', 'bold', 'elegant', 'playful', 'minimal', 'corporate'].map(s => (
                                                            <button key={s}
                                                                className={`ce-category-pill ${aiCreativeStyle === s ? 'active' : ''}`}
                                                                onClick={() => setAiCreativeStyle(s)}>
                                                                {s.charAt(0).toUpperCase() + s.slice(1)}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                                <button className="ce-ai-bg-action-btn" onClick={aiCreativeGenerate}
                                                    disabled={aiCreativeLoading || !aiCreativeKeywords.trim()}>
                                                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                                                        {aiCreativeLoading ? 'progress_activity' : 'auto_awesome'}
                                                    </span>
                                                    {aiCreativeLoading ? 'Generating...' : 'Generate Design'}
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* ── Shared: Loading / Error / Result ── */}
                                    {aiLoading && (
                                        <div className="ce-ai-shimmer">
                                            <span className="ce-ai-shimmer-text">
                                                <span className="material-symbols-outlined ce-spin" style={{ fontSize: 14, marginRight: 6 }}>progress_activity</span>
                                                {aiTool === 'background' ? 'Processing background...' :
                                                    aiTool === 'visual' ? 'Inpainting selected area...' :
                                                        aiTool === 'retouch' ? 'Retouching masked area...' :
                                                            'Generating with AI...'}
                                            </span>
                                        </div>
                                    )}
                                    {aiError && (
                                        <div className="ce-ai-error">⚠️ {aiError}</div>
                                    )}
                                    {/* Results auto-apply directly to canvas — no preview needed */}
                                </div>
                            )}

                            {/* ── ELEMENTS TAB (Categorized) ── */}
                            {sidebarTab === 'elements' && (
                                <div className="ce-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                    <div className="ce-panel-title">
                                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#818cf8' }}>dashboard_customize</span>
                                        Elements
                                        <span style={{ marginLeft: 'auto', color: '#475569', fontSize: 9 }}>{ELEMENT_TYPES.length + Object.values(SVG_ELEMENT_CATEGORIES).reduce((s, c) => s + c.items.length, 0)} items</span>
                                    </div>
                                    {/* Category pills */}
                                    <div className="ce-category-pills">
                                        <button className={`ce-category-pill ${!elementCategory ? 'active' : ''}`}
                                            onClick={() => setElementCategory(null)}>All</button>
                                        {Object.entries(ELEMENT_CATEGORIES).map(([key, cat]) => (
                                            <button key={key}
                                                className={`ce-category-pill ${elementCategory === key ? 'active' : ''}`}
                                                onClick={() => setElementCategory(key)}>
                                                {cat.label}
                                            </button>
                                        ))}
                                        {Object.entries(SVG_ELEMENT_CATEGORIES).map(([key, cat]) => (
                                            <button key={`svg-${key}`}
                                                className={`ce-category-pill ${elementCategory === `svg-${key}` ? 'active' : ''}`}
                                                onClick={() => setElementCategory(`svg-${key}`)}>
                                                {cat.label}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="ce-element-grid" style={{ overflowY: 'auto', flex: 1 }}>
                                        {/* Basic shape elements */}
                                        {(!elementCategory || (elementCategory && !elementCategory.startsWith('svg-')))
                                            && (elementCategory
                                                ? ELEMENT_CATEGORIES[elementCategory]?.items || []
                                                : ELEMENT_TYPES
                                            ).map(el => (
                                                <button key={el.id} className="ce-element-btn" onClick={() => handleAddElement(el.id)}>
                                                    <span className="material-symbols-outlined" style={{ fontSize: 22 }}>{el.icon}</span>
                                                    {el.label}
                                                </button>
                                            ))
                                        }
                                        {/* SVG design elements */}
                                        {(!elementCategory || elementCategory?.startsWith('svg-'))
                                            && Object.entries(SVG_ELEMENT_CATEGORIES)
                                                .filter(([key]) => !elementCategory || elementCategory === `svg-${key}`)
                                                .map(([key, cat]) => (
                                                    <React.Fragment key={key}>
                                                        {!elementCategory && (
                                                            <div style={{ gridColumn: '1 / -1', fontSize: 10, fontWeight: 700, color: '#818cf8', padding: '8px 4px 2px', textTransform: 'uppercase', letterSpacing: 1 }}>
                                                                {cat.label}
                                                            </div>
                                                        )}
                                                        {cat.items.map(svgEl => (
                                                            <button key={svgEl.id} className="ce-element-btn" onClick={() => addSvgElement(svgEl)}>
                                                                <span className="material-symbols-outlined" style={{ fontSize: 22 }}>{cat.icon}</span>
                                                                {svgEl.label}
                                                            </button>
                                                        ))}
                                                    </React.Fragment>
                                                ))
                                        }
                                    </div>
                                </div>
                            )}

                            {/* ── TEXT STYLES TAB (Enhanced with categories + Font Combos) ── */}
                            {sidebarTab === 'text-styles' && (
                                <div className="ce-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                    <div className="ce-panel-title">
                                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#818cf8' }}>format_quote</span>
                                        Typography
                                        <span style={{ marginLeft: 'auto', color: '#475569', fontSize: 9 }}>{TEXT_STYLE_PRESETS.length} styles + {FONT_COMBOS.length} combos</span>
                                    </div>

                                    {/* Category pills */}
                                    <div className="ce-category-pills">
                                        {Object.entries(TEXT_STYLE_CATS).map(([key, label]) => (
                                            <button key={key}
                                                className={`ce-category-pill ${textStyleCat === key ? 'active' : ''}`}
                                                onClick={() => setTextStyleCat(key)}>
                                                {label}
                                            </button>
                                        ))}
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '0 4px', overflowY: 'auto', flex: 1 }}>
                                        {/* Text Style Presets */}
                                        {TEXT_STYLE_PRESETS
                                            .filter(p => textStyleCat === 'all' || p.cat === textStyleCat)
                                            .map(preset => {
                                                loadGoogleFont(preset.font)
                                                return (
                                                    <button key={preset.id} className="ce-text-style-card" onClick={() => addTextStyle(preset)}>
                                                        <span className="ce-text-style-preview" style={{
                                                            fontFamily: preset.font,
                                                            fontSize: Math.min(preset.size * 0.4, 24),
                                                            fontWeight: preset.weight,
                                                            fontStyle: preset.italic ? 'italic' : 'normal',
                                                            color: preset.color === 'transparent' ? '#ffffff' : preset.color,
                                                            letterSpacing: preset.tracking || 0,
                                                            WebkitTextStroke: preset.stroke ? `1px ${preset.stroke}` : 'none',
                                                        }}>
                                                            {preset.sample}
                                                        </span>
                                                        <span className="ce-text-style-meta">
                                                            {preset.label} • {preset.font} • {preset.size}px
                                                        </span>
                                                    </button>
                                                )
                                            })}

                                        {/* Font Combinations Section */}
                                        {textStyleCat === 'all' && (
                                            <>
                                                <div className="ce-panel-title" style={{ marginTop: 12, paddingLeft: 0 }}>
                                                    <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#a78bfa' }}>merge_type</span>
                                                    Font Combinations
                                                </div>
                                                {FONT_COMBOS.map(combo => {
                                                    loadGoogleFont(combo.heading)
                                                    loadGoogleFont(combo.body)
                                                    return (
                                                        <button key={combo.id} className="ce-text-style-card" onClick={() => addFontCombo(combo)}
                                                            style={{ borderLeft: `3px solid ${combo.headColor}40` }}>
                                                            <span style={{ fontFamily: combo.heading, fontSize: 18, fontWeight: '700', color: combo.headColor, lineHeight: 1.2 }}>
                                                                Heading Text
                                                            </span>
                                                            <span style={{ fontFamily: combo.body, fontSize: 12, fontWeight: '400', color: combo.bodyColor, lineHeight: 1.3 }}>
                                                                Body text for this pairing
                                                            </span>
                                                            <span className="ce-text-style-meta">{combo.style} • {combo.heading} + {combo.body}</span>
                                                        </button>
                                                    )
                                                })}
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* ── APPS TAB ── */}
                            {sidebarTab === 'apps' && (
                                <div className="ce-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                                    <div className="ce-panel-title">
                                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#818cf8' }}>apps</span>
                                        Apps & Tools
                                        {activeApp && <button style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#818cf8', cursor: 'pointer', fontSize: 11 }} onClick={() => setActiveApp(null)}>← Back</button>}
                                    </div>

                                    {/* App Grid (when no app is active) */}
                                    {!activeApp && (
                                        <>
                                            <div className="ce-element-grid" style={{ gap: 6 }}>
                                                {[
                                                    { id: 'curved', icon: 'motion_photos_auto', label: 'Curved Text', desc: 'Text along an arc' },
                                                    { id: 'qr', icon: 'qr_code_2', label: 'QR Code', desc: 'Generate QR code from URL' },
                                                    { id: 'brandkit', icon: 'palette', label: 'Brand Kit', desc: 'Apply brand fonts & colors' },
                                                    { id: 'chart', icon: 'bar_chart', label: 'Chart Creator', desc: 'Bar or pie chart from data' },
                                                    { id: 'countdown', icon: 'timer', label: 'Countdown', desc: 'Days-until timer graphic' },
                                                    { id: 'palette', icon: 'colorize', label: 'Color Palette', desc: 'Generate color swatches' },
                                                    { id: 'collage', icon: 'grid_view', label: 'Photo Collage', desc: 'Grid layout with image slots' },
                                                    { id: 'blur', icon: 'blur_on', label: 'Blur Tool', desc: 'Blur selected image' },
                                                ].map(app => (
                                                    <button key={app.id} className="ce-element-btn" onClick={() => setActiveApp(app.id)}
                                                        title={app.desc} style={{ gap: 4, padding: '12px 4px', border: '1px solid #1e293b' }}>
                                                        <span className="material-symbols-outlined" style={{ fontSize: 24, color: '#818cf8' }}>{app.icon}</span>
                                                        <span style={{ fontSize: 10, textAlign: 'center', lineHeight: 1.2, fontWeight: 600 }}>{app.label}</span>
                                                        <span style={{ fontSize: 8, color: '#64748b', textAlign: 'center' }}>{app.desc}</span>
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="ce-panel-title" style={{ marginTop: 12, fontSize: 10, color: '#64748b' }}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>bolt</span>
                                                Quick Add Tools
                                            </div>
                                            <div className="ce-element-grid" style={{ gap: 4 }}>
                                                {CANVAS_APPS.map(app => (
                                                    <button key={app.id} className="ce-element-btn" onClick={app.action}
                                                        title={app.desc} style={{ gap: 3, padding: '8px 4px' }}>
                                                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#818cf8' }}>{app.icon}</span>
                                                        <span style={{ fontSize: 8, textAlign: 'center', lineHeight: 1.2 }}>{app.label}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </>
                                    )}

                                    {/* Curved Text App */}
                                    {activeApp === 'curved' && (
                                        <div style={{ padding: '8px 0' }}>
                                            <p className="ce-ai-tool-hint">Type your text and adjust the curve radius to create arc-shaped text.</p>
                                            <div style={{ marginBottom: 10 }}>
                                                <label style={{ fontSize: 10, color: '#64748b', display: 'block', marginBottom: 4 }}>Text</label>
                                                <input className="ce-asset-search" value={curvedTextInput} onChange={e => setCurvedTextInput(e.target.value)}
                                                    placeholder="Enter text..." style={{ marginBottom: 8 }} />
                                            </div>
                                            <div style={{ marginBottom: 12 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b', marginBottom: 4 }}>
                                                    <span>Curve Radius</span><span>{curvedTextRadius}px</span>
                                                </div>
                                                <input type="range" className="ce-slider" min={80} max={400} value={curvedTextRadius}
                                                    onChange={e => setCurvedTextRadius(parseInt(e.target.value))} />
                                            </div>
                                            <button className="ce-search-btn" onClick={addCurvedText} style={{ width: '100%' }}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add_circle</span>
                                                Add Curved Text
                                            </button>
                                        </div>
                                    )}

                                    {/* QR Code App */}
                                    {activeApp === 'qr' && (
                                        <div style={{ padding: '8px 0' }}>
                                            <p className="ce-ai-tool-hint">Enter a URL or text to generate a QR code graphic.</p>
                                            <div style={{ marginBottom: 12 }}>
                                                <label style={{ fontSize: 10, color: '#64748b', display: 'block', marginBottom: 4 }}>URL or Text</label>
                                                <input className="ce-asset-search" value={qrInput} onChange={e => setQrInput(e.target.value)}
                                                    placeholder="https://example.com" style={{ marginBottom: 8 }} />
                                            </div>
                                            <button className="ce-search-btn" onClick={addQrCode} style={{ width: '100%' }}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>qr_code_2</span>
                                                Generate QR Code
                                            </button>
                                        </div>
                                    )}

                                    {/* Brand Kit App */}
                                    {activeApp === 'brandkit' && (
                                        <div style={{ padding: '8px 0' }}>
                                            <p className="ce-ai-tool-hint">Apply your brand fonts and colors to all text elements on the canvas.</p>
                                            <div style={{ background: '#0f172a', borderRadius: 8, padding: 12, marginBottom: 12, border: '1px solid #1e293b' }}>
                                                <div style={{ fontSize: 10, color: '#64748b', marginBottom: 6 }}>Brand Font</div>
                                                <div style={{ fontSize: 14, color: '#ffffff', fontWeight: 600 }}>{activeBrand?.dna?.fonts?.[0] || 'Inter'}</div>
                                                <div style={{ fontSize: 10, color: '#64748b', marginTop: 8, marginBottom: 6 }}>Brand Color</div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <div style={{ width: 24, height: 24, borderRadius: 6, background: activeBrand?.dna?.colors?.[0]?.hex || '#6366f1' }}></div>
                                                    <span style={{ fontSize: 12, color: '#94a3b8' }}>{activeBrand?.dna?.colors?.[0]?.hex || '#6366f1'}</span>
                                                </div>
                                            </div>
                                            <button className="ce-search-btn" onClick={applyBrandKit} style={{ width: '100%' }}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>palette</span>
                                                Apply Brand Kit
                                            </button>
                                        </div>
                                    )}

                                    {/* Chart Creator App */}
                                    {activeApp === 'chart' && (
                                        <div style={{ padding: '8px 0' }}>
                                            <p className="ce-ai-tool-hint">Create a bar or pie chart from your data.</p>
                                            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                                                {['bar', 'pie'].map(t => (
                                                    <button key={t} className={`ce-category-pill ${chartType === t ? 'active' : ''}`}
                                                        onClick={() => setChartType(t)} style={{ flex: 1, textTransform: 'capitalize' }}>
                                                        {t === 'bar' ? 'bar_chart' : '🥧'} {t} Chart
                                                    </button>
                                                ))}
                                            </div>
                                            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 6 }}>Data Rows</div>
                                            {chartData.map((d, i) => (
                                                <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                                                    <input className="ce-asset-search" value={d.label}
                                                        onChange={e => { const nd = [...chartData]; nd[i] = { ...nd[i], label: e.target.value }; setChartData(nd) }}
                                                        style={{ flex: 1, fontSize: 11, padding: '4px 6px' }} placeholder="Label" />
                                                    <input className="ce-asset-search" type="number" value={d.value}
                                                        onChange={e => { const nd = [...chartData]; nd[i] = { ...nd[i], value: parseInt(e.target.value) || 0 }; setChartData(nd) }}
                                                        style={{ width: 60, fontSize: 11, padding: '4px 6px' }} placeholder="Value" />
                                                </div>
                                            ))}
                                            <div style={{ display: 'flex', gap: 4, marginBottom: 10, marginTop: 4 }}>
                                                <button style={{ fontSize: 10, color: '#818cf8', background: 'none', border: '1px solid #1e293b', borderRadius: 6, padding: '4px 8px', cursor: 'pointer' }}
                                                    onClick={() => setChartData([...chartData, { label: `Item ${chartData.length + 1}`, value: 20 }])}>+ Add Row</button>
                                                {chartData.length > 2 && (
                                                    <button style={{ fontSize: 10, color: '#ef4444', background: 'none', border: '1px solid #1e293b', borderRadius: 6, padding: '4px 8px', cursor: 'pointer' }}
                                                        onClick={() => setChartData(chartData.slice(0, -1))}>− Remove</button>
                                                )}
                                            </div>
                                            <button className="ce-search-btn" onClick={addChart} style={{ width: '100%' }}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add_circle</span>
                                                Add {chartType === 'bar' ? 'Bar' : 'Pie'} Chart
                                            </button>
                                        </div>
                                    )}

                                    {/* Countdown Timer App */}
                                    {activeApp === 'countdown' && (
                                        <div style={{ padding: '8px 0' }}>
                                            <p className="ce-ai-tool-hint">Create a "X Days Until" countdown graphic.</p>
                                            <div style={{ marginBottom: 10 }}>
                                                <label style={{ fontSize: 10, color: '#64748b', display: 'block', marginBottom: 4 }}>Target Date</label>
                                                <input className="ce-asset-search" type="date" value={countdownDate}
                                                    onChange={e => setCountdownDate(e.target.value)}
                                                    style={{ marginBottom: 8, colorScheme: 'dark' }} />
                                            </div>
                                            <div style={{ marginBottom: 12 }}>
                                                <label style={{ fontSize: 10, color: '#64748b', display: 'block', marginBottom: 4 }}>Event Name</label>
                                                <input className="ce-asset-search" value={countdownLabel}
                                                    onChange={e => setCountdownLabel(e.target.value)}
                                                    placeholder="e.g. Product Launch" style={{ marginBottom: 8 }} />
                                            </div>
                                            {countdownDate && (
                                                <div style={{ background: '#0f172a', borderRadius: 8, padding: 12, marginBottom: 12, border: '1px solid #1e293b', textAlign: 'center' }}>
                                                    <div style={{ fontSize: 48, fontWeight: 700, color: '#ffffff' }}>
                                                        {Math.max(0, Math.ceil((new Date(countdownDate) - new Date()) / 86400000))}
                                                    </div>
                                                    <div style={{ fontSize: 10, color: '#818cf8', letterSpacing: 3, fontWeight: 600 }}>DAYS UNTIL</div>
                                                    <div style={{ fontSize: 14, color: '#f59e0b', fontWeight: 700, marginTop: 4 }}>{countdownLabel.toUpperCase()}</div>
                                                </div>
                                            )}
                                            <button className="ce-search-btn" onClick={addCountdown} style={{ width: '100%' }}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>timer</span>
                                                Add Countdown
                                            </button>
                                        </div>
                                    )}

                                    {/* Color Palette App */}
                                    {activeApp === 'palette' && (
                                        <div style={{ padding: '8px 0' }}>
                                            <p className="ce-ai-tool-hint">Generate a harmonious color palette from your brand color.</p>
                                            <button className="ce-search-btn" onClick={generatePalette}
                                                style={{ width: '100%', marginBottom: 12 }}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>auto_awesome</span>
                                                Generate Palette
                                            </button>
                                            {generatedPalette.length > 0 && (
                                                <>
                                                    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                                                        {generatedPalette.map((hex, i) => (
                                                            <div key={i} style={{ flex: 1, textAlign: 'center', cursor: 'pointer' }}
                                                                onClick={() => { navigator.clipboard?.writeText(hex); showToast(`📋 Copied ${hex}`) }}>
                                                                <div style={{ width: '100%', height: 40, borderRadius: 8, background: hex, border: '1px solid #ffffff20' }}></div>
                                                                <div style={{ fontSize: 8, color: '#94a3b8', marginTop: 4 }}>{hex}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <button className="ce-search-btn" onClick={addPaletteToCanvas} style={{ width: '100%' }}>
                                                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add_circle</span>
                                                        Add Swatches to Canvas
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    )}

                                    {/* Photo Collage App */}
                                    {activeApp === 'collage' && (
                                        <div style={{ padding: '8px 0' }}>
                                            <p className="ce-ai-tool-hint">Create a photo grid layout with placeholder slots.</p>
                                            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 8 }}>Grid Layout</div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                                                {[2, 3, 4, 6].map(n => (
                                                    <button key={n}
                                                        style={{
                                                            background: collageLayout === n ? '#1e1b4b' : '#0f172a',
                                                            border: `1px solid ${collageLayout === n ? '#6366f1' : '#1e293b'}`,
                                                            borderRadius: 8, padding: 12, cursor: 'pointer',
                                                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                                                        }}
                                                        onClick={() => setCollageLayout(n)}>
                                                        <div style={{ display: 'grid', gridTemplateColumns: n <= 3 ? `repeat(${Math.min(n, 2)}, 1fr)` : `repeat(${Math.min(n, 3)}, 1fr)`, gap: 2, width: 40, height: 40 }}>
                                                            {Array.from({ length: n }).map((_, i) => (
                                                                <div key={i} style={{ background: collageLayout === n ? '#818cf8' : '#334155', borderRadius: 2, minHeight: 10 }}></div>
                                                            ))}
                                                        </div>
                                                        <span style={{ fontSize: 10, color: collageLayout === n ? '#818cf8' : '#64748b', fontWeight: 600 }}>{n} Slots</span>
                                                    </button>
                                                ))}
                                            </div>
                                            <button className="ce-search-btn" onClick={addCollage} style={{ width: '100%' }}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>grid_view</span>
                                                Create {collageLayout}-Slot Collage
                                            </button>
                                        </div>
                                    )}

                                    {/* Blur Tool App */}
                                    {activeApp === 'blur' && (
                                        <div style={{ padding: '8px 0' }}>
                                            <p className="ce-ai-tool-hint">Apply blur effect to the selected image on canvas.</p>
                                            <div style={{ marginBottom: 12 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b', marginBottom: 4 }}>
                                                    <span>Blur Intensity</span><span>{blurIntensity}%</span>
                                                </div>
                                                <input type="range" className="ce-slider" min={0} max={100} value={blurIntensity}
                                                    onChange={e => setBlurIntensity(parseInt(e.target.value))} />
                                            </div>
                                            <div style={{ background: '#0f172a', borderRadius: 8, padding: 10, marginBottom: 12, border: '1px solid #1e293b' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#f59e0b' }}>info</span>
                                                    <span style={{ fontSize: 10, color: '#94a3b8' }}>Select an image on the canvas first, then adjust intensity and click Apply.</span>
                                                </div>
                                            </div>
                                            <button className="ce-search-btn" onClick={applyBlurToSelected} style={{ width: '100%' }}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>blur_on</span>
                                                Apply Blur
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── TEMPLATES TAB ── */}
                            {sidebarTab === 'templates' && (
                                <div className="ce-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                    <div className="ce-panel-title">
                                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#818cf8' }}>view_quilt</span>
                                        Design Templates
                                        <span style={{ marginLeft: 'auto', color: '#475569', fontSize: 9 }}>{TEMPLATE_LIBRARY.length} templates</span>
                                    </div>
                                    <div className="ce-category-pills">
                                        {TEMPLATE_CATEGORIES.map(cat => (
                                            <button key={cat.id}
                                                className={`ce-category-pill ${templateCat === cat.id ? 'active' : ''}`}
                                                onClick={() => setTemplateCat(cat.id)}>
                                                {cat.label}
                                            </button>
                                        ))}
                                    </div>
                                    <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                            {TEMPLATE_LIBRARY
                                                .filter(t => templateCat === 'all' || t.cat === templateCat)
                                                .map(t => (
                                                    <button key={t.id} onClick={() => applyTemplate(t)}
                                                        style={{
                                                            background: t.layout?.background || '#0f172a',
                                                            border: '1px solid #1e293b', borderRadius: 10,
                                                            padding: '16px 8px', cursor: 'pointer',
                                                            display: 'flex', flexDirection: 'column',
                                                            alignItems: 'center', gap: 6,
                                                            transition: 'all 0.2s', minHeight: 100,
                                                        }}
                                                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#818cf8'; e.currentTarget.style.transform = 'scale(1.03)' }}
                                                        onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e293b'; e.currentTarget.style.transform = 'scale(1)' }}>
                                                        <span style={{ fontSize: 28 }}>{t.icon}</span>
                                                        <span style={{ fontSize: 10, color: '#e2e8f0', fontWeight: 600, textAlign: 'center', lineHeight: 1.2 }}>{t.name}</span>
                                                        <span style={{ fontSize: 8, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>{t.cat}</span>
                                                    </button>
                                                ))}
                                        </div>
                                        <div style={{ padding: '12px 0', textAlign: 'center', borderTop: '1px solid #1e293b', marginTop: 12 }}>
                                            <button className="ce-search-btn" onClick={() => { setSidebarTab('ai'); setAiTool('creative') }}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>auto_awesome</span>
                                                Generate Custom Template with AI
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ── ICONS TAB ── */}
                            {sidebarTab === 'icons' && (
                                <div className="ce-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                    <div className="ce-panel-title">
                                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#818cf8' }}>interests</span>
                                        Icons
                                        <span style={{ marginLeft: 'auto', color: '#475569', fontSize: 9 }}>200K+ via Iconify</span>
                                    </div>
                                    <input
                                        className="ce-asset-search"
                                        placeholder="Search icons... (e.g. arrow, heart, star)"
                                        value={iconSearch}
                                        onChange={e => { setIconSearch(e.target.value); searchIcons(e.target.value) }}
                                    />
                                    {iconLoading && <div className="ce-loading-spinner"><span className="material-symbols-outlined ce-spin">progress_activity</span> Searching...</div>}
                                    <div className="ce-asset-grid">
                                        {iconResults.map(icon => (
                                            <button key={icon} className="ce-asset-card" onClick={() => addIconToCanvas(icon)} title={icon}>
                                                <img src={`https://api.iconify.design/${icon}.svg?width=32&height=32`} alt={icon} style={{ width: 32, height: 32, filter: 'invert(0.7)' }} />
                                                <span className="ce-asset-name">{icon.split(':').pop()}</span>
                                            </button>
                                        ))}
                                        {!iconLoading && iconResults.length === 0 && iconSearch.length >= 2 && (
                                            <p className="ce-empty-state">No icons found for "{iconSearch}"</p>
                                        )}
                                        {!iconSearch && (
                                            <p className="ce-empty-state">Type to search 200,000+ icons</p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* ── FONTS TAB ── */}
                            {sidebarTab === 'fonts' && (
                                <div className="ce-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                    <div className="ce-panel-title">
                                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#818cf8' }}>font_download</span>
                                        Fonts
                                        <span style={{ marginLeft: 'auto', color: '#475569', fontSize: 9 }}>{filteredFonts.length} fonts</span>
                                    </div>
                                    {/* Category Pills */}
                                    <div className="ce-category-pills" style={{ paddingBottom: 4 }}>
                                        {Object.entries(FONT_CATEGORIES).map(([key, label]) => (
                                            <button key={key}
                                                className={`ce-category-pill ${fontCategory === key ? 'active' : ''}`}
                                                onClick={() => setFontCategory(key)}>
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                    <input
                                        className="ce-asset-search"
                                        placeholder="Search fonts... (e.g. Poppins, Noto Sans)"
                                        value={fontSearch}
                                        onChange={e => setFontSearch(e.target.value)}
                                    />
                                    <div className="ce-font-list">
                                        {filteredFonts.map(font => {
                                            loadGoogleFont(font)
                                            return (
                                                <button key={font} className="ce-font-preview" onClick={() => applyFontToSelected(font)}>
                                                    <span className="ce-font-sample" style={{ fontFamily: font }}>{font}</span>
                                                    <span className="ce-font-label">{font.includes('Noto Sans') ? 'language' : ''}</span>
                                                </button>
                                            )
                                        })}
                                        {filteredFonts.length === 0 && (
                                            <p className="ce-empty-state">No fonts match "{fontSearch}"</p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* ── STICKERS TAB ── */}
                            {sidebarTab === 'stickers' && (
                                <div className="ce-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                    <div className="ce-panel-title">
                                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#818cf8' }}>emoji_emotions</span>
                                        Stickers
                                        <span style={{ marginLeft: 'auto', color: '#475569', fontSize: 9 }}>Lucide SVGs</span>
                                    </div>
                                    <input
                                        className="ce-asset-search"
                                        placeholder="Search stickers..."
                                        value={stickerSearch}
                                        onChange={e => setStickerSearch(e.target.value)}
                                    />
                                    <div className="ce-category-pills">
                                        {Object.entries(STICKER_CATEGORIES).map(([key, label]) => (
                                            <button key={key}
                                                className={`ce-category-pill ${stickerCategory === key ? 'active' : ''}`}
                                                onClick={() => setStickerCategory(key)}>
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="ce-asset-grid">
                                        {getFilteredStickers().map(name => (
                                            <button key={name} className="ce-asset-card" onClick={() => addStickerToCanvas(name)} title={name}>
                                                <img src={`https://api.iconify.design/lucide:${name}.svg?width=36&height=36&color=%23818cf8`} alt={name} style={{ width: 36, height: 36 }} />
                                                <span className="ce-asset-name">{name}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* ── TEXTURES TAB (Pixabay) ── */}
                            {sidebarTab === 'textures' && (
                                <div className="ce-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                    <div className="ce-panel-title">
                                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#818cf8' }}>texture</span>
                                        Textures & Overlays
                                        <span style={{ marginLeft: 'auto', color: '#475569', fontSize: 9 }}>Pixabay</span>
                                    </div>
                                    <input
                                        className="ce-asset-search"
                                        placeholder="Textures, overlays, PNGs…"
                                        value={textureSearch}
                                        onChange={e => setTextureSearch(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') searchTextures(textureSearch) }}
                                    />
                                    <button className="ce-search-btn" onClick={() => searchTextures(textureSearch)} disabled={textureLoading}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>search</span>
                                        {textureLoading ? 'Searching...' : 'Search Textures'}
                                    </button>
                                    <div className="ce-category-pills" style={{ paddingBottom: 6 }}>
                                        {TEXTURE_PRESETS.slice(0, 8).map(p => (
                                            <button key={p} className="ce-category-pill" onClick={() => { setTextureSearch(p); searchTextures(p) }}>
                                                {p.split(' ')[0]}
                                            </button>
                                        ))}
                                    </div>
                                    {textureSetupRequired && (
                                        <div className="ce-setup-notice">
                                            <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#fbbf24' }}>info</span>
                                            <p>Add <code>PIXABAY_API_KEY</code> to your <code>.env</code> file to enable texture search.</p>
                                            <a href="https://pixabay.com/api/docs/" target="_blank" rel="noreferrer" style={{ color: '#818cf8', fontSize: 11 }}>Get free API key →</a>
                                        </div>
                                    )}
                                    {textureLoading && <div className="ce-loading-spinner"><span className="material-symbols-outlined ce-spin">progress_activity</span> Loading...</div>}
                                    <div className="ce-photo-grid">
                                        {textureResults.map(tex => (
                                            <button key={tex.id} className="ce-photo-thumb" onClick={() => addTextureToCanvas(tex)} title={tex.tags}>
                                                <img src={tex.thumb} alt={tex.tags} loading="lazy" />
                                                <span className="ce-photo-author">{tex.tags?.split(',')[0]}</span>
                                            </button>
                                        ))}
                                        {!textureLoading && textureResults.length === 0 && !textureSetupRequired && textureSearch && (
                                            <p className="ce-empty-state">Press Enter or click Search</p>
                                        )}
                                        {!textureSearch && !textureSetupRequired && (
                                            <p className="ce-empty-state">Search grunge, bokeh, paper, marble…</p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* ── BRAND ASSETS TAB ── */}
                            {sidebarTab === 'brand' && (
                                <div className="ce-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                    <div className="ce-panel-title">
                                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#818cf8' }}>palette</span>
                                        Brand Assets
                                        <span style={{ marginLeft: 'auto', color: '#475569', fontSize: 9 }}>{activeBrand?.name || 'No Brand'}</span>
                                    </div>

                                    {/* Brand Colors */}
                                    {activeBrand?.dna?.colors?.length > 0 && (
                                        <div style={{ padding: '0 12px 12px' }}>
                                            <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Brand Colors</div>
                                            <div className="ce-brand-colors">
                                                {activeBrand.dna.colors.map((c, i) => (
                                                    <button key={i} className="ce-brand-color-swatch" onClick={() => addBrandColorBlock(c.hex)} title={`${c.name || c.hex} — Click to add block`}>
                                                        <div className="ce-swatch-circle" style={{ background: c.hex }} />
                                                        <span className="ce-swatch-label">{c.hex}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Brand Fonts */}
                                    {activeBrand?.dna?.fonts?.length > 0 && (
                                        <div style={{ padding: '0 12px 12px' }}>
                                            <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Brand Fonts</div>
                                            <div className="ce-font-list" style={{ padding: 0, maxHeight: 100 }}>
                                                {activeBrand.dna.fonts.map((font, i) => {
                                                    loadGoogleFont(font)
                                                    return (
                                                        <button key={i} className="ce-font-preview" onClick={() => applyFontToSelected(font)}>
                                                            <span className="ce-font-sample" style={{ fontFamily: font }}>{font}</span>
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* Brand Images / Logo */}
                                    <div style={{ padding: '0 12px 12px' }}>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Images & Logo</div>
                                        <div className="ce-asset-grid" style={{ maxHeight: 300 }}>
                                            {getBrandAssets().map((asset, i) => (
                                                <button key={i} className="ce-asset-card" onClick={() => addBrandAssetToCanvas(asset)} title={asset.name}>
                                                    {asset.url ? (
                                                        <img src={asset.url} alt={asset.name} style={{ width: 40, height: 40, objectFit: 'contain', borderRadius: 6 }} />
                                                    ) : (
                                                        <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#818cf8' }}>{asset.icon}</span>
                                                    )}
                                                    <span className="ce-asset-name">{asset.name}</span>
                                                </button>
                                            ))}
                                            {getBrandAssets().length === 0 && (
                                                <p className="ce-empty-state">No brand assets found. Complete brand onboarding to see assets here.</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ── GRADIENTS TAB ── */}
                            {sidebarTab === 'gradients' && (
                                <div className="ce-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                    <div className="ce-panel-title">
                                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#818cf8' }}>gradient</span>
                                        Gradients
                                        <span style={{ marginLeft: 'auto', color: '#475569', fontSize: 9 }}>Fabric.js</span>
                                    </div>
                                    <p style={{ fontSize: 10, color: '#475569', padding: '0 12px 8px', margin: 0 }}>Click to add as new block · Right-click to apply to selected element</p>
                                    <div className="ce-gradient-grid">
                                        {GRADIENT_PRESETS.map((g, i) => (
                                            <button key={i} className="ce-gradient-card" onClick={() => addGradientToCanvas(g)} onContextMenu={e => { e.preventDefault(); applyGradientToSelected(g) }} title={`${g.name} — Right-click to apply to selection`}>
                                                <div className="ce-gradient-preview" style={{ background: `var(--sys-primary)` }} />
                                                <span className="ce-gradient-label">{g.name}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* ── IMAGES TAB (Upload / Brand / Generated / Stock) ── */}
                            {sidebarTab === 'images' && (
                                <div className="ce-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                    <div className="ce-panel-title">
                                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#818cf8' }}>photo_library</span>
                                        Images
                                    </div>
                                    {/* Sub-tab pills */}
                                    <div className="ce-category-pills" style={{ paddingBottom: 8 }}>
                                        {[
                                            { id: 'upload', label: 'Upload', color: '#818cf8' },
                                            { id: 'brand', label: 'Brand', color: '#f472b6' },
                                            { id: 'generated', label: 'Generated', color: '#34d399' },
                                            { id: 'stock', label: 'Stock', color: '#fbbf24' },
                                        ].map(t => (
                                            <button key={t.id} className={`ce-category-pill ${imageSourceTab === t.id ? 'active' : ''}`}
                                                onClick={() => setImageSourceTab(t.id)}
                                                style={imageSourceTab === t.id ? { borderColor: t.color, color: '#fff', background: `${t.color}22` } : {}}>
                                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.color, display: 'inline-block', marginRight: 5, flexShrink: 0 }} />
                                                {t.label}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Upload sub-tab */}
                                    {imageSourceTab === 'upload' && (
                                        <div style={{ padding: '0 8px' }}>
                                            <button className="ce-search-btn" onClick={uploadImage} style={{ width: '100%' }}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>upload</span>
                                                Upload Image
                                            </button>
                                            <p className="ce-empty-state" style={{ marginTop: 12 }}>Upload images from your computer to add to the canvas.</p>
                                        </div>
                                    )}

                                    {/* Brand sub-tab */}
                                    {imageSourceTab === 'brand' && (
                                        <div className="ce-asset-grid" style={{ maxHeight: 400 }}>
                                            {getBrandAssets().map((asset, i) => (
                                                <button key={i} className="ce-asset-card" onClick={() => addBrandAssetToCanvas(asset)} title={asset.name}>
                                                    {asset.url ? (
                                                        <img src={asset.url} alt={asset.name} style={{ width: 40, height: 40, objectFit: 'contain', borderRadius: 6 }} />
                                                    ) : (
                                                        <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#818cf8' }}>{asset.icon}</span>
                                                    )}
                                                    <span className="ce-asset-name">{asset.name}</span>
                                                </button>
                                            ))}
                                            {getBrandAssets().length === 0 && (
                                                <p className="ce-empty-state">No brand assets found. Complete brand onboarding to see assets here.</p>
                                            )}
                                        </div>
                                    )}

                                    {/* Generated sub-tab */}
                                    {imageSourceTab === 'generated' && (
                                        <div style={{ padding: '0 8px' }}>
                                            {loadingBankImages ? (
                                                <div className="ce-loading-spinner"><span className="material-symbols-outlined ce-spin">progress_activity</span> Loading images...</div>
                                            ) : generatedImages.length > 0 ? (
                                                <div className="ce-photo-grid">
                                                    {generatedImages.map((img, i) => (
                                                        <button key={img.id || i} className="ce-photo-thumb" onClick={() => addImageUrlToCanvas(img.url, img.label)} title={img.label || `Generated ${i + 1}`}>
                                                            <img src={img.url} alt={img.label || `Generated ${i + 1}`} loading="lazy" />
                                                        </button>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div style={{ textAlign: 'center', padding: '20px 10px' }}>
                                                    <span className="material-symbols-outlined" style={{ fontSize: 40, color: '#6e6e73', opacity: 0.4, display: 'block', marginBottom: 8 }}>auto_awesome</span>
                                                    <p className="ce-empty-state">No generated images yet.<br/>Use AI Editor or Fidato to create images.</p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Stock sub-tab (Unsplash) */}
                                    {imageSourceTab === 'stock' && (
                                        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                                            <input
                                                className="ce-asset-search"
                                                placeholder="Search photos... (e.g. business, nature)"
                                                value={photoSearch}
                                                onChange={e => setPhotoSearch(e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter') searchPhotos(photoSearch) }}
                                            />
                                            <button className="ce-search-btn" onClick={() => searchPhotos(photoSearch)} disabled={photoLoading}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>search</span>
                                                {photoLoading ? 'Searching...' : 'Search'}
                                            </button>
                                            {photoSetupRequired && (
                                                <div className="ce-setup-notice">
                                                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#fbbf24' }}>info</span>
                                                    <p>Add <code>UNSPLASH_ACCESS_KEY</code> to your <code>.env</code> file to enable photo search.</p>
                                                    <a href="https://unsplash.com/developers" target="_blank" rel="noreferrer" style={{ color: '#818cf8', fontSize: 11 }}>Get free API key →</a>
                                                </div>
                                            )}
                                            {photoLoading && <div className="ce-loading-spinner"><span className="material-symbols-outlined ce-spin">progress_activity</span> Loading...</div>}
                                            <div className="ce-photo-grid">
                                                {photoResults.map(photo => (
                                                    <button key={photo.id} className="ce-photo-thumb" onClick={() => addPhotoToCanvas(photo)} title={photo.alt}>
                                                        <img src={photo.thumb} alt={photo.alt} loading="lazy" />
                                                        <span className="ce-photo-author">{photo.author}</span>
                                                    </button>
                                                ))}
                                                {!photoLoading && photoResults.length === 0 && !photoSetupRequired && photoSearch && (
                                                    <p className="ce-empty-state">Press Enter or click Search</p>
                                                )}
                                                {!photoSearch && !photoSetupRequired && (
                                                    <p className="ce-empty-state">Search millions of free photos</p>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Layers (always visible at bottom) */}
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
                        </div>
                    </div>
                </div>


                {/* ── MAIN CONTENT AREA — Board or Canvas ── */}
                {canvasView === 'board' ? (
                    <StoryboardBoard
                        scenes={boardScenes}
                        onScenesChange={setBoardScenes}
                        storyBrief={storyBrief}
                        brandContext={activeBrand ? {
                            brandName: activeBrand.brandName,
                            brandColors: activeBrand.brandColors || {},
                        } : null}
                        onSendToCanvas={async () => {
                            setCanvasView('design')
                            if (!fc || boardScenes.length === 0) return
                            const cols = Math.min(3, boardScenes.length)
                            const cardW = 260
                            const imgAreaH = 180
                            const captionH = 80
                            const cardH = 8 + imgAreaH + captionH + 8
                            const gap = 16
                            const startX = 60
                            const startY = 80
                            const groupTag = `sb-${Date.now()}`

                            if (storyBrief?.title) {
                                fc.add(new fabric.Textbox(` ${storyBrief.title}`, {
                                    left: startX, top: startY - 36, width: cols * (cardW + gap) - gap,
                                    fontSize: 18, fontWeight: '800', fontFamily: 'Inter',
                                    fill: '#c4b5fd', selectable: true, evented: true,
                                    customName: `Storyboard Title`, id: `${groupTag}-title`
                                }))
                            }

                            for (let i = 0; i < boardScenes.length; i++) {
                                const scene = boardScenes[i]
                                const col = i % cols
                                const row = Math.floor(i / cols)
                                const x = startX + col * (cardW + gap)
                                const y = startY + row * (cardH + gap)
                                const imgAreaW = cardW - 16

                                // Card BG
                                fc.add(new fabric.Rect({
                                    left: x, top: y, width: cardW, height: cardH, rx: 12, ry: 12,
                                    fill: 'rgba(15,17,30,0.92)', stroke: 'rgba(99,102,241,0.18)', strokeWidth: 1,
                                    shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.2)', blur: 10, offsetY: 3 }),
                                    selectable: false, evented: false
                                }))

                                // Image
                                if (scene.imageUrl) {
                                    try {
                                        const img = await fabric.FabricImage.fromURL(scene.imageUrl, { crossOrigin: 'anonymous' })
                                        const scale = Math.min(imgAreaW / img.width, imgAreaH / img.height)
                                        const sw = img.width * scale
                                        const sh = img.height * scale
                                        img.set({
                                            left: x + 8 + (imgAreaW - sw) / 2, top: y + 8 + (imgAreaH - sh) / 2,
                                            scaleX: scale, scaleY: scale, selectable: true, evented: true,
                                            customName: `Scene Image ${i + 1}`
                                        })
                                        fc.add(img)
                                    } catch (e) {
                                        console.warn('Failed to load scene image', e)
                                    }
                                } else {
                                    fc.add(new fabric.Rect({
                                        left: x + 8, top: y + 8, width: imgAreaW, height: imgAreaH,
                                        rx: 8, ry: 8, fill: 'rgba(99,102,241,0.03)', stroke: 'rgba(99,102,241,0.08)', strokeWidth: 1, strokeDashArray: [5, 4],
                                        selectable: false, evented: false
                                    }))
                                }

                                // Caption
                                fc.add(new fabric.Textbox(scene.caption || `Scene ${i + 1}`, {
                                    left: x + 10, top: y + 8 + imgAreaH + 8, width: cardW - 20,
                                    fontSize: 11, fontWeight: '600', fontFamily: 'Inter',
                                    fill: '#e2e8f0', textAlign: 'left', lineHeight: 1.35, selectable: true, evented: true,
                                    customName: `Scene Caption ${i + 1}`
                                }))
                            }
                            fc.renderAll()
                        }}
                        onAddScene={() => {
                            const newScene = {
                                id: `scene-${Date.now()}`,
                                imageUrl: '',
                                caption: `Scene ${boardScenes.length + 1}`,
                                shotType: '',
                                shotDescription: '',
                                duration: 5,
                            }
                            setBoardScenes(prev => [...prev, newScene])
                        }}
                        onSceneEdit={(scene) => {
                            // Future: open scene detail editor
                        }}
                        onSceneImageClick={(scene) => {
                            // Future: expand image or open editor
                        }}
                    />
                ) : canvasView === 'timeline' ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', flexDirection: 'column', gap: 8 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 48, opacity: 0.3 }}>view_timeline</span>
                        <h3 style={{ color: '#e2e8f0', fontSize: 16 }}>Timeline View</h3>
                        <p style={{ fontSize: 13 }}>Coming soon — sequence scenes with transitions</p>
                    </div>
                ) : (
                <>
                {/* ── CANVAS AREA ── */}
                <div className="ce-canvas-area" ref={containerRef} onContextMenu={handleCanvasContextMenu}>
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
                        <button className="ce-tool-btn" onClick={() => { setZoom(100); handleZoom(0) }}
                            style={{ width: 28, height: 28 }} title="Reset zoom">
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>fit_screen</span>
                        </button>
                        <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.15)', margin: '0 4px' }} />
                        <button className="ce-tool-btn" onClick={toggleCanvasTheme}
                            style={{ width: 28, height: 28 }} title={`Switch to ${canvasTheme === 'dark' ? 'light' : 'dark'} background`}>
                            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
                                {canvasTheme === 'dark' ? 'light_mode' : 'dark_mode'}
                            </span>
                        </button>
                    </div>

                    {/* \u2500\u2500 FLOATING BOTTOM TOOLBAR \u2500\u2500 */}
                    <div className="ce-floating-toolbar">
                        <button className={`ce-float-btn ${floatTool === 'select' ? 'active' : ''}`}
                            onClick={() => { setFloatTool('select'); setShowGenPanel(false) }} title="Select">
                            <span className="material-symbols-outlined">arrow_selector_tool</span>
                        </button>
                        <button className={`ce-float-btn ${showGenPanel ? 'active' : ''}`}
                            onClick={() => { setFloatTool('image'); setShowGenPanel(!showGenPanel) }} title="Generate Image">
                            <span className="material-symbols-outlined">image</span>
                        </button>
                        <button className={`ce-float-btn`} onClick={() => setShowTextModal(true)} title="Add Text">
                            <span className="material-symbols-outlined">title</span>
                        </button>
                        <div className="ce-float-divider" />
                        <button className={`ce-float-btn`} onClick={uploadImage} title="Upload Image">
                            <span className="material-symbols-outlined">upload</span>
                        </button>
                        <button className={`ce-float-btn`} onClick={() => { setSidebarTab('elements'); setPanelOpen(true) }} title="Shapes">
                            <span className="material-symbols-outlined">shapes</span>
                        </button>
                        <button className={`ce-float-btn`} onClick={() => { setSidebarTab('ai'); setPanelOpen(true); setAiTool('background') }} title="Background">
                            <span className="material-symbols-outlined">wallpaper</span>
                        </button>
                        <div className="ce-float-divider" />
                        <button className={`ce-float-btn`} onClick={() => { setSidebarTab('ai'); setPanelOpen(true); setAiTool('visual') }} title="AI Inpaint">
                            <span className="material-symbols-outlined">gesture</span>
                        </button>
                        <button className={`ce-float-btn`} onClick={() => { setSidebarTab('ai'); setPanelOpen(true); setAiTool('retouch') }} title="AI Retouch">
                            <span className="material-symbols-outlined">auto_fix</span>
                        </button>
                    </div>

                    {/* \u2500\u2500 GENERATE IMAGE FLOATING PANEL \u2500\u2500 */}
                    {showGenPanel && (
                        <div className="ce-genimg-panel">
                            <div className="ce-genimg-header">
                                <div>
                                    <div className="ce-genimg-title">
                                        <span className="material-symbols-outlined">auto_awesome</span>
                                        Create Image
                                    </div>
                                    <div className="ce-genimg-subtitle">NanoBanana 2</div>
                                </div>
                                <button className="ce-genimg-close" onClick={() => setShowGenPanel(false)}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                                </button>
                            </div>
                            <div className="ce-genimg-section">
                                <div className="ce-genimg-label">References</div>
                                <div className="ce-genimg-refs">
                                    <button className="ce-genimg-ref-add" onClick={() => {
                                        const input = document.createElement('input')
                                        input.type = 'file'; input.accept = 'image/*'
                                        input.onchange = (e) => {
                                            const file = e.target.files?.[0]
                                            if (!file) return
                                            const reader = new FileReader()
                                            reader.onload = (ev) => setGenRefs(prev => [...prev, { url: ev.target.result, thumb: ev.target.result }])
                                            reader.readAsDataURL(file)
                                        }
                                        input.click()
                                    }}>
                                        <span className="material-symbols-outlined">add</span>
                                    </button>
                                    {genRefs.map((ref, i) => (
                                        <div key={i} className="ce-genimg-ref-thumb">
                                            <img src={ref.thumb} alt={`Ref ${i + 1}`} />
                                            <button className="ce-genimg-ref-remove" onClick={() => setGenRefs(prev => prev.filter((_, j) => j !== i))}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>close</span>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="ce-genimg-section">
                                <div className="ce-genimg-label">
                                    Instruction
                                    <div className="ce-genimg-enhance-row">
                                        <span style={{ fontSize: 11, color: '#64748b', marginRight: 6 }}>ENHANCE</span>
                                        <button className={`ce-toggle ${genEnhance ? 'active' : ''}`} onClick={() => setGenEnhance(!genEnhance)} />
                                    </div>
                                </div>
                                <textarea className="ce-genimg-textarea" placeholder="Describe the image you want to create..." value={genPrompt} onChange={e => setGenPrompt(e.target.value)} rows={3} />
                            </div>
                            <div className="ce-genimg-section">
                                <div className="ce-genimg-label">Aspect Ratio</div>
                                <div className="ce-genimg-ratios">
                                    {[{ r: '1:1', icon: '\u2b1c' }, { r: '16:9', icon: '\ud83d\udda5\ufe0f' }, { r: '9:16', icon: '\ud83d\udcf1' }, { r: '4:5', icon: '\ud83d\udcf8' }, { r: '3:2', icon: '\ud83c\udf9e\ufe0f' }].map(opt => (
                                        <button key={opt.r} className={`ce-genimg-ratio-btn ${genRatio === opt.r ? 'active' : ''}`} onClick={() => setGenRatio(opt.r)}>
                                            <span style={{ fontSize: 12 }}>{opt.icon}</span> {opt.r}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <button className="ce-genimg-create-btn" onClick={handleGenImage} disabled={genLoading || !genPrompt.trim()}>
                                {genLoading ? (<><span className="material-symbols-outlined ce-spin" style={{ fontSize: 18 }}>progress_activity</span> Generating...</>) : (<><span className="material-symbols-outlined" style={{ fontSize: 18 }}>auto_awesome</span> Create</>)}
                            </button>
                        </div>
                    )}

                    {/* \u2500\u2500 FIDATO CHAT TOGGLE \u2500\u2500 */}
                    {!fidatoOpen && (
                        <button className="ce-fidato-toggle" onClick={() => setFidatoOpen(true)} title="Fidato AI">
                            <span className="material-symbols-outlined">smart_toy</span>
                        </button>
                    )}

                    {/* \u2500\u2500 FIDATO CANVAS CHAT PANEL \u2500\u2500 */}
                    {fidatoOpen && (
                        <div className="ce-fidato-panel">
                            <div className="ce-fidato-header">
                                <div className="ce-fidato-header-left">
                                    <div className="ce-fidato-avatar">F</div>
                                    <div>
                                        <div className="ce-fidato-name">Fidato</div>
                                        <div className="ce-fidato-status">Creative Canvas</div>
                                    </div>
                                </div>
                                <button className="ce-fidato-collapse" onClick={() => setFidatoOpen(false)}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                                </button>
                            </div>
                            <div className="ce-fidato-messages">
                                {fidatoMessages.map((msg, i) => (
                                    <div key={i} className={`ce-fidato-msg ${msg.role}`}>
                                        <div className="ce-fidato-msg-avatar">{msg.role === 'assistant' ? 'F' : '\u2726'}</div>
                                        <div className="ce-fidato-msg-bubble">
                                            {/* Thinking steps UI */}
                                            {/* Pre-flight Research (Luma-style "Read" section) */}
                                            {msg.research && msg.research.length > 50 && (
                                                <details className="ce-fidato-search-block" style={{ marginBottom: 10, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.12)', borderRadius: 8, overflow: 'hidden' }} open>
                                                    <summary style={{ padding: '8px 12px', fontSize: 12, color: '#a1a1aa', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, userSelect: 'none', fontWeight: 600 }}>
                                                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#818cf8' }}>menu_book</span>
                                                        Read
                                                        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#52525b' }}>{Math.round(msg.research.length / 4)} words</span>
                                                    </summary>
                                                    <div style={{ padding: '0 12px 12px 32px', fontSize: 11, color: '#d4d4d8', whiteSpace: 'pre-wrap', lineHeight: 1.6, maxHeight: 160, overflowY: 'auto' }}>
                                                        {msg.research.replace(/## WEB RESEARCH RESULTS.*\n/g, '').replace(/## REFERENCE IMAGES.*\n[\s\S]*$/g, '').trim()}
                                                    </div>
                                                </details>
                                            )}

                                            {/* Reference Images (Luma-style product strip) */}
                                            {msg.referenceImages && msg.referenceImages.length > 0 && (
                                                <div style={{ marginBottom: 10 }}>
                                                    <div style={{ fontSize: 11, color: '#a1a1aa', fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#818cf8' }}>photo_library</span>
                                                        Product References ({msg.referenceImages.length})
                                                    </div>
                                                    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
                                                        {msg.referenceImages.map((img, idx) => (
                                                            <img key={idx} src={img.s3Url || img.url || img} alt={img.alt || `Reference ${idx + 1}`}
                                                                style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.08)', flexShrink: 0, cursor: 'pointer' }}
                                                                onClick={() => addImageUrlToCanvas(img.s3Url || img.url || img)}
                                                                title="Click to add to canvas"
                                                            />
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Thinking/reasoning (Luma-style "Thought" section) */}
                                            {msg.searches && msg.searches.length > 0 && (
                                                <div className="ce-fidato-searches" style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                    {msg.searches.map((search, idx) => (
                                                        <details key={idx} className="ce-fidato-search-block" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, overflow: 'hidden' }}>
                                                            <summary style={{ padding: '8px 12px', fontSize: 12, color: '#a1a1aa', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, userSelect: 'none' }}>
                                                                <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#6366f1' }}>public</span>
                                                                Searched web: "{search.query}"
                                                            </summary>
                                                            <div style={{ padding: '0 12px 12px 32px', fontSize: 12, color: '#d4d4d8', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                                                                {search.result}
                                                            </div>
                                                        </details>
                                                    ))}
                                                </div>
                                            )}
                                            
                                            {msg.thinking && msg.thinkingSteps ? (
                                                <div className="ce-fidato-reasoning">
                                                    {msg.thinkingSteps.map((step, si) => (
                                                        <div key={si} className={`ce-fidato-thinking-step ${step.status}`}>
                                                            <span className="material-symbols-outlined">
                                                                {step.status === 'done' ? 'check_circle' : step.status === 'active' ? 'pending' : 'radio_button_unchecked'}
                                                            </span>
                                                            {step.text}
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <>
                                                    <FormattedText text={msg.content || ''} />
                                                    {msg.reasoning && (
                                                        <details className="ce-fidato-reasoning" style={{ marginTop: 8 }}>
                                                            <summary className="ce-fidato-reasoning-toggle">
                                                                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>psychology</span>
                                                                View reasoning
                                                            </summary>
                                                            <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{msg.reasoning}</div>
                                                        </details>
                                                    )}
                                                </>
                                            )}
                                            {msg.images && msg.images.length > 0 && (
                                                <div className="ce-fidato-images">
                                                    {msg.images.map((img, j) => (
                                                        <button key={j} className="ce-fidato-img-thumb" onClick={() => addImageUrlToCanvas(img.url)} title="Click to add to canvas">
                                                            <img src={img.url} alt={`Generated ${j + 1}`} />
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                            {msg.plan && (
                                                <div className="ce-fidato-plan">
                                                    <div className="ce-fidato-plan-title">{msg.plan.title}</div>
                                                    {msg.plan.items.map((item, k) => (
                                                        <div key={k} className={`ce-fidato-plan-item ${item.status || ''}`}>
                                                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                                                <span className="material-symbols-outlined">{item.status === 'done' ? 'check_circle' : item.status === 'active' ? 'pending' : 'radio_button_unchecked'}</span>
                                                                {item.text}
                                                            </div>
                                                            {item.thumbnails && item.thumbnails.length > 0 && (
                                                                <div style={{ display: 'flex', gap: 6, marginTop: 8, paddingLeft: 24, flexWrap: 'wrap' }}>
                                                                    {item.thumbnails.map((t, idx) => (
                                                                        <img key={idx} src={t} alt="Result" style={{ width: 44, height: 44, borderRadius: 6, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)' }} />
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            
                                            {/* Process Logs (Terminal View) */}
                                            {msg.processLogs && msg.processLogs.length > 0 && (
                                                <details className="ce-fidato-process-logs" style={{ marginTop: 12, background: '#0a0a0a', borderRadius: 6, border: '1px solid #27272a', overflow: 'hidden' }}>
                                                    <summary style={{ padding: '8px 12px', fontSize: 11, fontWeight: 600, color: '#a1a1aa', cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center' }}>
                                                        <span className="material-symbols-outlined" style={{ fontSize: 14, marginRight: 6 }}>terminal</span>
                                                        Show process
                                                    </summary>
                                                    <div style={{ padding: '8px 12px 12px', fontSize: 10, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace', color: '#10b981', whiteSpace: 'pre-wrap', maxHeight: 240, overflowY: 'auto' }}>
                                                        {msg.processLogs.map((log, i) => (
                                                            <div key={i} style={{ marginBottom: 4 }}>
                                                                <span style={{ color: '#52525b', marginRight: 8}}>[{log.time}]</span>
                                                                <span style={{ color: log.text.includes('[Error]') ? '#ef4444' : log.text.includes('[Payload]') ? '#d4d4d8' : '#10b981' }}>{log.text}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </details>
                                            )}
                                            
                                        </div>
                                    </div>
                                ))}
                                {fidatoLoading && !fidatoMessages[fidatoMessages.length - 1]?.thinking && (
                                    <div className="ce-fidato-thinking">
                                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>auto_awesome</span> Thinking
                                        <div className="ce-fidato-thinking-dots"><span /><span /><span /></div>
                                    </div>
                                )}
                                <div ref={fidatoMsgEndRef} />
                            </div>
                            <div className="ce-fidato-input-bar">
                                {/* Voice recording indicator */}
                                {(fidatoRecording || fidatoTranscribing) && (
                                    <div style={{ padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: fidatoRecording ? '#f87171' : '#fbbf24', animation: 'pulse 1s infinite' }} />
                                        <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>
                                            {fidatoRecording ? '\ud83c\udf99\ufe0f Listening... speak your command' : '\ud83e\udde0 Transcribing...'}
                                        </span>
                                    </div>
                                )}
                                <div className="ce-fidato-input-row">
                                    <textarea className="ce-fidato-input" placeholder="What do you want to do?" value={fidatoInput} onChange={e => setFidatoInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleFidatoSend() } }} rows={1} />
                                    <button
                                        className="ce-fidato-mic-btn"
                                        onClick={() => {
                                            if (fidatoRecording) {
                                                // Stop recording
                                                if (fidatoSilenceCheckRef.current) clearInterval(fidatoSilenceCheckRef.current)
                                                if (fidatoRecordingTimerRef.current) clearTimeout(fidatoRecordingTimerRef.current)
                                                if (fidatoMediaRecorderRef.current?.state === 'recording') {
                                                    fidatoMediaRecorderRef.current.stop()
                                                    setFidatoRecording(false)
                                                }
                                            } else if (!fidatoTranscribing && !fidatoLoading) {
                                                // Start recording
                                                (async () => {
                                                    try {
                                                        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
                                                        const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
                                                        const mediaRecorder = new MediaRecorder(stream, { mimeType })
                                                        fidatoMediaRecorderRef.current = mediaRecorder
                                                        fidatoAudioChunksRef.current = []

                                                        // Silence detection
                                                        try {
                                                            const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
                                                            const source = audioCtx.createMediaStreamSource(stream)
                                                            const analyser = audioCtx.createAnalyser()
                                                            analyser.fftSize = 512
                                                            analyser.smoothingTimeConstant = 0.8
                                                            source.connect(analyser)
                                                            fidatoAnalyserRef.current = { analyser, audioCtx }

                                                            let silentFrames = 0
                                                            fidatoSilenceCheckRef.current = setInterval(() => {
                                                                const dataArray = new Uint8Array(analyser.frequencyBinCount)
                                                                analyser.getByteFrequencyData(dataArray)
                                                                const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
                                                                if (avg < 15) {
                                                                    silentFrames++
                                                                    if (silentFrames >= 35 && fidatoAudioChunksRef.current.length > 0) {
                                                                        if (fidatoMediaRecorderRef.current?.state === 'recording') {
                                                                            fidatoMediaRecorderRef.current.stop()
                                                                            setFidatoRecording(false)
                                                                        }
                                                                    }
                                                                } else { silentFrames = 0 }
                                                            }, 60)
                                                        } catch (e) { console.warn('Silence detection unavailable:', e.message) }

                                                        mediaRecorder.ondataavailable = (e) => {
                                                            if (e.data.size > 0) fidatoAudioChunksRef.current.push(e.data)
                                                        }

                                                        mediaRecorder.onstop = async () => {
                                                            if (fidatoSilenceCheckRef.current) clearInterval(fidatoSilenceCheckRef.current)
                                                            if (fidatoAnalyserRef.current?.audioCtx) {
                                                                fidatoAnalyserRef.current.audioCtx.close().catch(() => {})
                                                                fidatoAnalyserRef.current = null
                                                            }
                                                            if (fidatoRecordingTimerRef.current) clearTimeout(fidatoRecordingTimerRef.current)
                                                            stream.getTracks().forEach(t => t.stop())
                                                            const audioBlob = new Blob(fidatoAudioChunksRef.current, { type: mimeType })

                                                            if (audioBlob.size > 1000) {
                                                                setFidatoTranscribing(true)
                                                                try {
                                                                    const formData = new FormData()
                                                                    formData.append('audio', audioBlob, 'recording.webm')
                                                                    formData.append('language', 'unknown')
                                                                    const data = await voiceAPI.transcribe(formData)
                                                                    if (data.success && data.text) {
                                                                        setFidatoInput(data.text)
                                                                        // Auto-send after a brief delay
                                                                        setTimeout(() => {
                                                                            setFidatoInput('')
                                                                            handleFidatoSend(data.text)
                                                                        }, 300)
                                                                    }
                                                                } catch (err) { console.error('Transcription failed:', err) }
                                                                setFidatoTranscribing(false)
                                                            }
                                                        }

                                                        mediaRecorder.start(250)
                                                        setFidatoRecording(true)

                                                        // Safety max 15s
                                                        fidatoRecordingTimerRef.current = setTimeout(() => {
                                                            if (fidatoMediaRecorderRef.current?.state === 'recording') {
                                                                fidatoMediaRecorderRef.current.stop()
                                                                setFidatoRecording(false)
                                                            }
                                                        }, 15000)
                                                    } catch (err) { console.error('Mic access denied:', err) }
                                                })()
                                            }
                                        }}
                                        disabled={fidatoTranscribing}
                                        style={{
                                            background: fidatoRecording ? 'rgba(239,68,68,0.15)' : 'transparent',
                                            color: fidatoRecording ? '#f87171' : fidatoTranscribing ? '#fbbf24' : '#64748b',
                                            border: 'none', cursor: 'pointer', borderRadius: 8, padding: '6px',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            animation: fidatoRecording ? 'pulse 1.5s infinite' : 'none',
                                            transition: 'all 0.2s',
                                        }}
                                        title={fidatoRecording ? 'Stop recording' : 'Speak to Fidato'}
                                    >
                                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                                            {fidatoRecording ? 'stop_circle' : fidatoTranscribing ? 'hourglass_top' : 'mic'}
                                        </span>
                                    </button>
                                    {fidatoLoading ? (
                                        <button className="ce-fidato-send-btn" style={{ background: 'var(--sys-primary)', borderColor: '#ef4444' }} onClick={() => {
                                            if (fidatoAbortRef.current) {
                                                fidatoAbortRef.current.abort()
                                                fidatoAbortRef.current = null
                                            }
                                            setFidatoLoading(false)
                                            setFidatoMessages(prev => {
                                                const updated = [...prev]
                                                const last = updated[updated.length - 1]
                                                if (last && last.role === 'assistant' && last.thinking) {
                                                    last.thinking = false
                                                    last.content = (last.content || '') + '\n\n⏹️ Stopped by user.'
                                                }
                                                return updated
                                            })
                                        }} title="Stop generation">
                                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>stop_circle</span>
                                        </button>
                                    ) : (
                                        <button className="ce-fidato-send-btn" onClick={() => handleFidatoSend()} disabled={!fidatoInput.trim()}>
                                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_upward</span>
                                        </button>
                                    )}
                                </div>
                                <div className="ce-fidato-shortcuts">
                                    <button className="ce-fidato-shortcut" onClick={() => setFidatoInput('Generate a campaign image for ')}>
                                        <span className="material-symbols-outlined">auto_awesome</span> Create
                                    </button>
                                    <button className="ce-fidato-shortcut" onClick={() => setFidatoInput('Extract color palette from the image on canvas')}>
                                        <span className="material-symbols-outlined">palette</span> Palette
                                    </button>
                                    <button className="ce-fidato-shortcut" onClick={() => setFidatoInput('Merge the selected images on canvas into ')}>
                                        <span className="material-symbols-outlined">merge</span> Merge
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* ── RIGHT SIDEBAR (Advanced only) ── */}
                <div className={`ce-sidebar-right ${mode !== 'advanced' ? 'collapsed' : ''}`}>
                    {/* Properties */}
                    {
                        selectedLayer && (
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
                        )
                    }

                    {/* Context-Sensitive Text Properties (replaces old Brand Kit) */}
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
                                    if (obj) { loadGoogleFont(e.target.value); obj.set('fontFamily', e.target.value); fc.renderAll(); saveHistory() }
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
                                            if (obj) { obj.set('textAlign', align); fc.renderAll(); saveHistory() }
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
                                        if (obj) { obj.set('fontSize', parseInt(e.target.value)); fc.renderAll(); saveHistory() }
                                    }} />
                                <span className="ce-prop-label" style={{ fontSize: 9 }}>BOLD</span>
                                <button className="ce-tool-btn" onClick={() => {
                                    const fc = fabricRef.current; const obj = fc?.getActiveObject()
                                    if (obj) { obj.set('fontWeight', obj.fontWeight === '700' ? '400' : '700'); fc.renderAll(); saveHistory() }
                                }} style={{ width: 28, height: 28 }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>format_bold</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Shape fill color — when shape selected */}
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
                                                if (obj) { obj.set('fill', c); fc.renderAll(); saveHistory() }
                                            }} title={c} />
                                    ))}
                                </div>
                                {/* Native picker */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                                    <input type="color" value={(() => { const fc = fabricRef.current; const o = fc?.getActiveObject(); return (o?.fill && typeof o.fill === 'string' && o.fill !== 'transparent') ? o.fill : '#6366f1' })()} onChange={e => {
                                        const fc = fabricRef.current; const obj = fc?.getActiveObject()
                                        if (obj) { obj.set('fill', e.target.value); fc.renderAll(); saveHistory() }
                                    }} style={{ width: 24, height: 24, border: 'none', padding: 0, background: 'transparent', cursor: 'pointer' }} />
                                    <span style={{ fontSize: 10, color: '#64748b' }}>Custom fill</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── BORDER & STROKE PANEL — any selected object ── */}
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
                                    if (obj) { obj.set('strokeWidth', parseInt(e.target.value)); if (!obj.stroke && parseInt(e.target.value) > 0) obj.set('stroke', '#ffffff'); fc.renderAll(); saveHistory() }
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
                                                if (obj) { obj.set('stroke', c === 'transparent' ? null : c); if (!obj.strokeWidth) obj.set('strokeWidth', 2); fc.renderAll(); saveHistory() }
                                            }} title={c} />
                                    ))}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                                    <input type="color" value={(() => { const fc = fabricRef.current; const o = fc?.getActiveObject(); return o?.stroke || '#ffffff' })()} onChange={e => {
                                        const fc = fabricRef.current; const obj = fc?.getActiveObject()
                                        if (obj) { obj.set('stroke', e.target.value); if (!obj.strokeWidth) obj.set('strokeWidth', 2); fc.renderAll(); saveHistory() }
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
                                            if (obj) { obj.set('strokeDashArray', s.dash); fc.renderAll(); saveHistory() }
                                        }} style={{ flex: 1, fontSize: 10, fontWeight: 600 }} title={s.label}>
                                            {s.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {/* Border radius (for rect/rounded shapes) */}
                            {(() => { const fc = fabricRef.current; const obj = fc?.getActiveObject(); return obj && (obj.type === 'rect' || obj.rx !== undefined) })() && (
                                <div style={{ marginBottom: 4 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b', marginBottom: 4 }}>
                                        <span>Radius</span>
                                        <span>{(() => { const fc = fabricRef.current; return fc?.getActiveObject()?.rx || 0 })()}px</span>
                                    </div>
                                    <input type="range" className="ce-slider" min={0} max={100} value={(() => { const fc = fabricRef.current; return fc?.getActiveObject()?.rx || 0 })()} onChange={e => {
                                        const fc = fabricRef.current; const obj = fc?.getActiveObject()
                                        if (obj) { const v = parseInt(e.target.value); obj.set('rx', v); obj.set('ry', v); fc.renderAll(); saveHistory() }
                                    }} />
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── OPACITY PANEL — any selected object ── */}
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

                    {/* ── SHADOW PANEL — any selected object ── */}
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
                                                fc.renderAll(); saveHistory()
                                            }
                                        }} style={{ padding: '4px 8px', fontSize: 9, fontWeight: 600 }}>{sp.label}</button>
                                    ))}
                                </div>
                            </div>
                            {/* Custom shadow controls */}
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
                                        obj.set('shadow', s); fc.renderAll(); saveHistory()
                                    }
                                }} />
                            </div>
                            <div className="ce-prop-row">
                                <span className="ce-prop-label" style={{ fontSize: 9 }}>X</span>
                                <input className="ce-prop-input" type="number" min={-50} max={50} value={(() => { const fc = fabricRef.current; return fc?.getActiveObject()?.shadow?.offsetX || 0 })()} onChange={e => {
                                    const fc = fabricRef.current; const obj = fc?.getActiveObject()
                                    if (obj) {
                                        const s = obj.shadow || new fabric.Shadow({ color: 'rgba(0,0,0,0.3)', blur: 10, offsetX: 0, offsetY: 0 })
                                        s.offsetX = parseInt(e.target.value)
                                        obj.set('shadow', s); fc.renderAll(); saveHistory()
                                    }
                                }} />
                                <span className="ce-prop-label" style={{ fontSize: 9 }}>Y</span>
                                <input className="ce-prop-input" type="number" min={-50} max={50} value={(() => { const fc = fabricRef.current; return fc?.getActiveObject()?.shadow?.offsetY || 0 })()} onChange={e => {
                                    const fc = fabricRef.current; const obj = fc?.getActiveObject()
                                    if (obj) {
                                        const s = obj.shadow || new fabric.Shadow({ color: 'rgba(0,0,0,0.3)', blur: 10, offsetX: 0, offsetY: 0 })
                                        s.offsetY = parseInt(e.target.value)
                                        obj.set('shadow', s); fc.renderAll(); saveHistory()
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
                                        obj.set('shadow', s); fc.renderAll(); saveHistory()
                                    }
                                }} style={{ width: 24, height: 24, border: 'none', padding: 0, background: 'transparent', cursor: 'pointer' }} />
                                <span style={{ fontSize: 10, color: '#64748b' }}>Shadow color</span>
                            </div>
                        </div>
                    )}

                    {/* Filters (Advanced) */}
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
                </div >
            </>
            )}
            </div >


            {/* ── BOTTOM BAR (Resize + Platform Presets) ── */}
            <div className="ce-bottom-bar">
                {/* Custom resize controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 8 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#818cf8' }}>crop</span>
                    <input className="ce-resize-input" type="number" min={100} max={4000} value={customW}
                        onChange={e => {
                            const w = parseInt(e.target.value) || 100
                            setCustomW(w)
                            if (lockRatio) setCustomH(Math.round(w * (customH / customW)))
                        }} title="Width" />
                    <span style={{ fontSize: 10, color: '#475569' }}>×</span>
                    <input className="ce-resize-input" type="number" min={100} max={4000} value={customH}
                        onChange={e => {
                            const h = parseInt(e.target.value) || 100
                            setCustomH(h)
                            if (lockRatio) setCustomW(Math.round(h * (customW / customH)))
                        }} title="Height" />
                    <button className="ce-tool-btn" onClick={() => setLockRatio(!lockRatio)}
                        style={{ width: 24, height: 24 }} title={lockRatio ? 'Unlock ratio' : 'Lock ratio'}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{lockRatio ? 'lock' : 'lock_open'}</span>
                    </button>
                    <button className="ce-tool-btn" onClick={() => { const tmp = customW; setCustomW(customH); setCustomH(tmp) }}
                        style={{ width: 24, height: 24 }} title="Flip orientation">
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>swap_horiz</span>
                    </button>
                    <button className="ce-preset-btn active" onClick={() => resizeCanvas(customW, customH)}
                        style={{ padding: '4px 10px', fontSize: 10 }}>
                        Apply
                    </button>
                </div>
                <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.08)', margin: '0 4px' }} />
                {PRESETS.map(p => (
                    <button key={p.id} className={`ce-preset-btn ${activePreset === p.id ? 'active' : ''}`}
                        onClick={() => resizeToPreset(p)}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{p.icon}</span>
                        {p.label}
                    </button>
                ))}
            </div>

            {/* ── TEXT MODAL ── */}
            {
                showTextModal && (
                    <div className="ce-modal-overlay" onClick={() => setShowTextModal(false)}>
                        <div className="ce-modal" onClick={e => e.stopPropagation()}>
                            <h3>
                                <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#818cf8', verticalAlign: 'middle', marginRight: 8 }}>text_fields</span>
                                Add Text
                            </h3>
                            <textarea
                                value={textInput}
                                onChange={e => setTextInput(e.target.value)}
                                placeholder="Type your text here... (supports Hindi, Tamil, etc.)"
                                rows={3}
                                autoFocus
                            />
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={() => { addText(textInput || 'Your text here', false); setShowTextModal(false); setTextInput('') }}
                                    style={{
                                        flex: 1, padding: '10px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)',
                                        background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontWeight: 600, cursor: 'pointer',
                                        fontSize: 13,
                                    }}>
                                    Body Text
                                </button>
                                <button onClick={() => { addText(textInput || 'Your Heading', true); setShowTextModal(false); setTextInput('') }}
                                    style={{
                                        flex: 1, padding: '10px', borderRadius: 10, border: 'none',
                                        background: 'var(--sys-primary)', color: '#fff', fontWeight: 700,
                                        cursor: 'pointer', fontSize: 13,
                                    }}>
                                    Heading
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* ── RIGHT-CLICK CONTEXT MENU ── */}
            {contextMenu && (
                <div className="ce-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}
                    onClick={e => e.stopPropagation()}>
                    {contextMenu.hasTarget ? (
                        <>
                            <button className="ce-ctx-item" onClick={() => { copySelected(); closeContextMenu() }}>
                                <span className="material-symbols-outlined">content_copy</span> Copy <kbd>⌘C</kbd>
                            </button>
                            <button className="ce-ctx-item" onClick={() => { cutSelected(); closeContextMenu() }}>
                                <span className="material-symbols-outlined">content_cut</span> Cut <kbd>⌘X</kbd>
                            </button>
                            <button className="ce-ctx-item" onClick={() => { pasteFromClipboard(); closeContextMenu() }}>
                                <span className="material-symbols-outlined">content_paste</span> Paste <kbd>⌘V</kbd>
                            </button>
                            <div className="ce-ctx-divider" />
                            <button className="ce-ctx-item" onClick={() => { duplicateSelected(); closeContextMenu() }}>
                                <span className="material-symbols-outlined">copy_all</span> Duplicate <kbd>⌘D</kbd>
                            </button>
                            <button className="ce-ctx-item ce-ctx-danger" onClick={() => { deleteSelected(); closeContextMenu() }}>
                                <span className="material-symbols-outlined">delete</span> Delete <kbd>⌫</kbd>
                            </button>
                            <div className="ce-ctx-divider" />
                            <button className="ce-ctx-item" onClick={() => { saveObjectAsImage(); closeContextMenu() }}>
                                <span className="material-symbols-outlined">save_alt</span> Save as Image
                            </button>
                            <button className="ce-ctx-item" onClick={() => { exportSelected(); closeContextMenu() }}>
                                <span className="material-symbols-outlined">download</span> Export Selected
                            </button>
                            <div className="ce-ctx-divider" />
                            {contextMenu.isMultiSelect && (
                                <button className="ce-ctx-item" onClick={() => { groupSelected(); closeContextMenu() }}>
                                    <span className="material-symbols-outlined">group_work</span> Group <kbd>⌘G</kbd>
                                </button>
                            )}
                            {contextMenu.isGroup && (
                                <button className="ce-ctx-item" onClick={() => { ungroupSelected(); closeContextMenu() }}>
                                    <span className="material-symbols-outlined">workspaces</span> Ungroup <kbd>⇧⌘G</kbd>
                                </button>
                            )}
                            {(contextMenu.isMultiSelect || contextMenu.isGroup) && (
                                <button className="ce-ctx-item" onClick={() => { mergeSelected(); closeContextMenu() }}>
                                    <span className="material-symbols-outlined">merge</span> Merge (Flatten)
                                </button>
                            )}
                            <div className="ce-ctx-divider" />
                            <button className="ce-ctx-item" onClick={() => { bringForward(); closeContextMenu() }}>
                                <span className="material-symbols-outlined">flip_to_front</span> Bring Forward
                            </button>
                            <button className="ce-ctx-item" onClick={() => { sendBackward(); closeContextMenu() }}>
                                <span className="material-symbols-outlined">flip_to_back</span> Send Backward
                            </button>
                            <div className="ce-ctx-divider" />
                            <button className="ce-ctx-item" onClick={() => { toggleLock(); closeContextMenu() }}>
                                <span className="material-symbols-outlined">{contextMenu.isLocked ? 'lock_open' : 'lock'}</span>
                                {contextMenu.isLocked ? 'Unlock' : 'Lock'}
                            </button>
                        </>
                    ) : (
                        <>
                            <button className="ce-ctx-item" onClick={() => { pasteFromClipboard(); closeContextMenu() }}
                                disabled={!clipboardRef.current}>
                                <span className="material-symbols-outlined">content_paste</span> Paste <kbd>⌘V</kbd>
                            </button>
                            <div className="ce-ctx-divider" />
                            <button className="ce-ctx-item" onClick={() => { uploadImage(); closeContextMenu() }}>
                                <span className="material-symbols-outlined">upload</span> Upload Image
                            </button>
                            <button className="ce-ctx-item" onClick={() => { exportCanvas('png'); closeContextMenu() }}>
                                <span className="material-symbols-outlined">download</span> Export Canvas
                            </button>
                        </>
                    )}
                </div>
            )}

            {/* ── MOBILE BOTTOM ACTION BAR ── */}
            <div className="ce-mobile-action-bar">
                <button className={`ce-mobile-action-btn ${mobilePanel === 'text' ? 'active' : ''}`}
                    onClick={() => { setMobilePanel(mobilePanel === 'text' ? null : 'text'); setShowTextModal(true) }}>
                    <span className="material-symbols-outlined">text_fields</span>
                    <span className="ce-mobile-action-label">Text</span>
                </button>
                <button className={`ce-mobile-action-btn ${mobilePanel === 'ai' ? 'active' : ''}`}
                    onClick={() => { setMobilePanel(mobilePanel === 'ai' ? null : 'ai'); setActiveLeftTab('ai'); setSidebarCollapsed(false) }}>
                    <span className="material-symbols-outlined" style={{ color: mobilePanel === 'ai' ? '#7c3aed' : undefined }}>auto_awesome</span>
                    <span className="ce-mobile-action-label">Fidato</span>
                </button>
                <button className={`ce-mobile-action-btn ${mobilePanel === 'elements' ? 'active' : ''}`}
                    onClick={() => { setMobilePanel(mobilePanel === 'elements' ? null : 'elements'); setActiveLeftTab('elements'); setSidebarCollapsed(false) }}>
                    <span className="material-symbols-outlined">category</span>
                    <span className="ce-mobile-action-label">Elements</span>
                </button>
                <button className={`ce-mobile-action-btn ${mobilePanel === 'photos' ? 'active' : ''}`}
                    onClick={() => { setMobilePanel(mobilePanel === 'photos' ? null : 'photos'); setActiveLeftTab('photos'); setSidebarCollapsed(false) }}>
                    <span className="material-symbols-outlined">image</span>
                    <span className="ce-mobile-action-label">Photos</span>
                </button>
                <button className="ce-mobile-action-btn" onClick={uploadImage}>
                    <span className="material-symbols-outlined">upload</span>
                    <span className="ce-mobile-action-label">Upload</span>
                </button>
                <button className="ce-mobile-action-btn" onClick={handleUndo} disabled={!canUndo}>
                    <span className="material-symbols-outlined">undo</span>
                    <span className="ce-mobile-action-label">Undo</span>
                </button>
            </div>

            {/* ── TOAST ── */}
            {toast && <div className="ce-toast">{toast}</div>}
        </div >
    )
}

// ── Error Boundary to catch render-phase crashes ──
class CanvasErrorBoundary extends Component {
    constructor(props) {
        super(props)
        this.state = { hasError: false, error: null, errorInfo: null }
    }
    static getDerivedStateFromError(error) {
        return { hasError: true, error }
    }
    componentDidCatch(error, errorInfo) {
        console.error('CanvasEditor Error Boundary caught:', error, errorInfo)
        this.setState({ errorInfo })
    }
    render() {
        if (this.state.hasError) {
            return (
                <div style={{ background: '#0a0e1a', color: '#fff', padding: 40, height: '100vh', fontFamily: 'monospace' }}>
                    <h2 style={{ color: '#f87171' }}>⚠️ Canvas Editor Error</h2>
                    <p style={{ color: '#94a3b8' }}>The editor encountered an error:</p>
                    <pre style={{ background: '#1e1e2e', padding: 16, borderRadius: 8, overflow: 'auto', color: '#fbbf24', fontSize: 13, maxHeight: 300 }}>
                        {this.state.error?.toString()}
                        {'\n\n'}
                        {this.state.errorInfo?.componentStack}
                    </pre>
                    <button
                        onClick={() => window.location.href = '/creative-studio'}
                        style={{ marginTop: 16, padding: '10px 24px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}
                    >
                        ← Back to Creative Studio
                    </button>
                </div>
            )
        }
        return this.props.children
    }
}

// Wrap the main component with ErrorBoundary — exporting at the bottom ensures all components/constants are initialized
export default function CanvasEditorWrapper() {
    return (
        <CanvasErrorBoundary>
            <SEOHead title="Canvas Editor — Mantram AI" noIndex={true} />
            <CanvasEditorInner />
        </CanvasErrorBoundary>
    )
}

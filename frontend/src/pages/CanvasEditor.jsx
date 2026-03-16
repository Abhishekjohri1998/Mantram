import React, { useState, useEffect, useRef, useCallback, Component } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useBrand } from '../context/BrandContext'
import SEOHead from '../components/SEOHead'
import * as fabric from 'fabric'
import { media as mediaAPI } from '../services/api'
import { TEMPLATE_LIBRARY, TEMPLATE_CATEGORIES } from './canvasTemplates'
import { SVG_ELEMENT_CATEGORIES } from './canvasElements'
import './CanvasEditor.css'

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

// Wrap the main component with ErrorBoundary
export default function CanvasEditorWrapper() {
    return <CanvasErrorBoundary><SEOHead title="Canvas Editor — Mantram AI" noIndex={true} /><CanvasEditorInner /></CanvasErrorBoundary>
}

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
    const [aiError, setAiError] = useState('')
    const [panelOpen, setPanelOpen] = useState(true) // content panel visibility
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

    // ── Font Category State ──
    const [fontCategory, setFontCategory] = useState('all')

    // ── Image Source Tab (for Images sidebar) ──
    const [imageSourceTab, setImageSourceTab] = useState('upload')
    const [generatedImages, setGeneratedImages] = useState([])

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
        const objs = fc.getObjects()
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

                // Calculate display size to fit in viewport
                const maxW = Math.max(container.clientWidth - 80, 200)
                const maxH = Math.max(container.clientHeight - 80, 200)
                console.log('Canvas init: container size', maxW, maxH, 'target canvas:', canvasWidth, canvasHeight)

                const scale = Math.min(maxW / canvasWidth, maxH / canvasHeight, 1)
                const displayW = Math.round(canvasWidth * scale)
                const displayH = Math.round(canvasHeight * scale)

                console.log('Canvas init: creating Fabric.Canvas', displayW, 'x', displayH)
                const fc = new fabric.Canvas(canvasEl, {
                    width: displayW,
                    height: displayH,
                    backgroundColor: '#1a1a2e',
                    preserveObjectStacking: true,
                    selection: true,
                })

                // Store the logical→display scale
                fc._logicalScale = scale
                fc._logicalWidth = canvasWidth
                fc._logicalHeight = canvasHeight

                fabricRef.current = fc
                console.log('Canvas init: Fabric.Canvas created successfully')

                // Load the image
                if (imageUrl) {
                    console.log('Canvas init: loading image...', imageUrl.substring(0, 80))
                    fabric.FabricImage.fromURL(imageUrl, { crossOrigin: 'anonymous' }).then(img => {
                        // Scale image to fill canvas
                        const imgScale = Math.max(displayW / img.width, displayH / img.height)
                        img.set({
                            scaleX: imgScale,
                            scaleY: imgScale,
                            left: displayW / 2,
                            top: displayH / 2,
                            originX: 'center',
                            originY: 'center',
                            selectable: true,
                            evented: true,
                            customName: 'Background Image',
                            id: 'bg-image',
                        })
                        fc.add(img)
                        fc.sendObjectToBack(img)
                        fc.renderAll()
                        updateLayers()
                        saveHistory()
                        console.log('Canvas init: image loaded successfully')
                    }).catch(err => {
                        console.error('Failed to load image:', err)
                        showToast('⚠️ Failed to load image — canvas is ready for new elements')
                        // Still save initial history even without image
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


    // ── Resize canvas to new preset ──
    const resizeToPreset = (preset) => {
        const fc = fabricRef.current
        if (!fc) return

        setActivePreset(preset.id)
        const container = containerRef.current
        const maxW = container.clientWidth - 80
        const maxH = container.clientHeight - 80
        const scale = Math.min(maxW / preset.w, maxH / preset.h, 1)
        const displayW = Math.round(preset.w * scale)
        const displayH = Math.round(preset.h * scale)

        fc.setDimensions({ width: displayW, height: displayH })
        fc._logicalScale = scale
        fc._logicalWidth = preset.w
        fc._logicalHeight = preset.h

        // Resize background image to fill
        const bgImg = fc.getObjects().find(o => o.id === 'bg-image')
        if (bgImg) {
            const imgScale = Math.max(displayW / bgImg.width, displayH / bgImg.height)
            bgImg.set({
                scaleX: imgScale,
                scaleY: imgScale,
                left: displayW / 2,
                top: displayH / 2,
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

    // ── Apply filter to background image ──
    const applyFilter = (filterId) => {
        const fc = fabricRef.current
        if (!fc) return
        const bgImg = fc.getObjects().find(o => o.id === 'bg-image')
        if (!bgImg || bgImg.type !== 'image') return

        setActiveFilter(filterId)

        // Clear existing filters
        bgImg.filters = []

        switch (filterId) {
            case 'grayscale':
                bgImg.filters.push(new fabric.filters.Grayscale())
                break
            case 'sepia':
                bgImg.filters.push(new fabric.filters.Sepia())
                break
            case 'brightness':
                bgImg.filters.push(new fabric.filters.Brightness({ brightness: 0.15 }))
                break
            case 'contrast':
                bgImg.filters.push(new fabric.filters.Contrast({ contrast: 0.2 }))
                break
            case 'vintage':
                bgImg.filters.push(new fabric.filters.Sepia())
                bgImg.filters.push(new fabric.filters.Contrast({ contrast: 0.1 }))
                bgImg.filters.push(new fabric.filters.Brightness({ brightness: -0.05 }))
                break
            case 'warm':
                bgImg.filters.push(new fabric.filters.ColorMatrix({
                    matrix: [1.2, 0, 0, 0, 0, 0, 1.05, 0, 0, 0, 0, 0, 0.9, 0, 0, 0, 0, 0, 1, 0]
                }))
                break
            case 'cool':
                bgImg.filters.push(new fabric.filters.ColorMatrix({
                    matrix: [0.9, 0, 0, 0, 0, 0, 1.0, 0, 0, 0, 0, 0, 1.2, 0, 0, 0, 0, 0, 1, 0]
                }))
                break
            case 'blur':
                bgImg.filters.push(new fabric.filters.Blur({ blur: 0.08 }))
                break
            default:
                break
        }

        bgImg.applyFilters()
        fc.renderAll()
        saveHistory()
    }

    // ── Apply brightness/contrast adjustments ──
    const applyAdjustments = useCallback(() => {
        const fc = fabricRef.current
        if (!fc) return
        const bgImg = fc.getObjects().find(o => o.id === 'bg-image')
        if (!bgImg || bgImg.type !== 'image') return

        bgImg.filters = []
        if (brightness !== 0) bgImg.filters.push(new fabric.filters.Brightness({ brightness: brightness / 100 }))
        if (contrast !== 0) bgImg.filters.push(new fabric.filters.Contrast({ contrast: contrast / 100 }))
        bgImg.applyFilters()
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
        const container = containerRef.current
        const maxW = container.clientWidth - 80
        const maxH = container.clientHeight - 80
        const baseScale = Math.min(maxW / fc._logicalWidth, maxH / fc._logicalHeight, 1)
        const displayW = Math.round(fc._logicalWidth * baseScale * (newZoom / (baseScale * 100)))
        const displayH = Math.round(fc._logicalHeight * baseScale * (newZoom / (baseScale * 100)))
        fc.setDimensions({ width: displayW, height: displayH })
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

        // Temporarily set zoom to 1 for full-res export
        const currentZoom = fc.getZoom()
        fc.setZoom(1)
        fc.setDimensions({ width: fc._logicalWidth, height: fc._logicalHeight })

        const dataUrl = fc.toDataURL({
            format,
            quality: format === 'jpeg' ? 0.92 : 1,
            multiplier: 1,
        })

        // Restore zoom
        fc.setZoom(currentZoom)
        const container = containerRef.current
        const maxW = container.clientWidth - 80
        const maxH = container.clientHeight - 80
        const scale = Math.min(maxW / fc._logicalWidth, maxH / fc._logicalHeight, 1)
        fc.setDimensions({
            width: Math.round(fc._logicalWidth * scale),
            height: Math.round(fc._logicalHeight * scale),
        })
        fc.renderAll()

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
            showToast(`✨ Icon added`)
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
            showToast(`🎨 Sticker added`)
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
            const resp = await fetch(`/api/canvas-assets/photos?q=${encodeURIComponent(query)}&per_page=20`)
            const data = await resp.json()
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
            const resp = await fetch(`/api/canvas-assets/textures?q=${encodeURIComponent(query)}&per_page=24`)
            const data = await resp.json()
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
            showToast(`🎨 Texture overlay added (opacity: 40%)`)
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
        // Scanned images from website
        if (Array.isArray(dna.images)) {
            dna.images.slice(0, 12).forEach((img, i) => {
                assets.push({ type: 'image', name: `Web Image ${i + 1}`, url: typeof img === 'string' ? img : img.url, icon: 'image' })
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
            showToast(`✅ ${asset.name} added`)
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
        showToast(`🎨 Color block added`)
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
                showToast('🎨 Editing image with AI...')
                const canvasDataUrl = fc.toDataURL({ format: 'png', quality: 0.9 })
                const resp = await fetch('/api/canvas-assets/ai-edit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt: aiPrompt, imageBase64: canvasDataUrl }),
                })
                const data = await resp.json()
                if (data.error) throw new Error(data.error)
                imageUrl = data.imageUrl
            } else {
                // Empty canvas → generate a new image
                showToast('✨ Generating image with AI...')
                const resp = await fetch('/api/canvas-assets/ai-generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt: aiPrompt, size: `${canvasWidth}x${canvasHeight}` }),
                })
                const data = await resp.json()
                if (data.error) throw new Error(data.error)
                imageUrl = data.imageUrl
            }
            // AUTO-APPLY: Add/replace directly on canvas
            const img = await fabric.FabricImage.fromURL(imageUrl, { crossOrigin: 'anonymous' })
            const allObjects = fc.getObjects().slice()
            allObjects.forEach(o => fc.remove(o))
            const scaleX = fc.width / img.width
            const scaleY = fc.height / img.height
            const scale = Math.max(scaleX, scaleY)
            img.set({ left: 0, top: 0, scaleX: scale, scaleY: scale })
            img._customName = 'AI Generated'
            fc.add(img)
            fc.renderAll()
            saveHistory()
            showToast('✨ Canvas updated with AI result')
        } catch (err) { setAiError(err.message) }
        setAiLoading(false)
    }, [aiPrompt, canvasWidth, canvasHeight])

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
            const resp = await fetch('/api/canvas-assets/ai-edit-visual', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: aiPrompt,
                    imageBase64: canvasDataUrl,
                    maskBase64: maskDataUrl,
                }),
            })
            const data = await resp.json()
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
            const resp = await fetch('/api/canvas-assets/ai-retouch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: aiPrompt || 'Retouch and clean up this area naturally',
                    imageBase64: canvasDataUrl,
                    maskBase64: maskDataUrl,
                    replaceImageBase64: replaceImage,
                }),
            })
            const data = await resp.json()
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
            const resp = await fetch('/api/canvas-assets/ai-background', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    imageBase64: canvasDataUrl,
                    action: bgAction,
                    bgPrompt: bgAction === 'replace' ? (bgPrompt || aiPrompt) : undefined,
                }),
            })
            const data = await resp.json()
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
            showToast(`✨ Background ${bgAction === 'remove' ? 'removed' : 'replaced'} successfully`)
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
        showToast(`✨ ${isHeading ? 'Headline' : 'Copy'} added`)
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
            showToast(`✨ Font combo: ${combo.style}`)
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
        showToast(`✨ Template "${template.name}" applied with ${elements.length} elements!`)
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
        showToast(`✨ ${svgEl.label} added`)
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
            showToast(`🎨 Brand kit applied to ${count} text elements`)
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
            showToast(`✨ ${preset.label} added`)
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
            const resp = await fetch('/api/canvas-assets/ai-creative-generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    keywords: aiCreativeKeywords,
                    style: aiCreativeStyle,
                    canvasWidth: fc._logicalWidth || 1080,
                    canvasHeight: fc._logicalHeight || 1080,
                    brandName: activeBrand?.name || '',
                    brandColors: activeBrand?.dna?.colors?.map(c => c.hex) || [],
                    brandFonts: activeBrand?.dna?.fonts || [],
                }),
            })
            if (!resp.ok) {
                const errText = await resp.text().catch(() => 'Server error')
                let errMsg = `AI generation failed (${resp.status}). Please try again.`
                try { const errJson = JSON.parse(errText); errMsg = errJson.error || errMsg } catch (_) { /* non-JSON error body */ }
                throw new Error(errMsg)
            }
            const data = await resp.json()
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
            showToast(`✨ Design created with ${elements.length} editable elements!`)
        } catch (err) {
            console.error('AI creative generate error:', err)
            const msg = err.message || 'AI generation failed. Please try again.'
            setAiError(msg)
            showToast('❌ ' + msg)
        }
        setAiCreativeLoading(false)
    }, [aiCreativeKeywords, aiCreativeStyle, activeBrand, loadGoogleFont, saveHistory, showToast, updateLayers])

    // ── Sidebar Tab Config ──
    const SIDEBAR_TABS = [
        { id: 'ai', icon: 'auto_awesome', label: 'AI', isAi: true },
        { id: 'elements', icon: 'dashboard_customize', label: 'Elements' },
        { id: 'text-styles', icon: 'format_quote', label: 'Text' },
        { id: 'apps', icon: 'apps', label: 'Apps' },
        { id: 'templates', icon: 'view_quilt', label: 'Templates' },
        { id: 'images', icon: 'photo_library', label: 'Images' },
        { id: 'icons', icon: 'interests', label: 'Icons' },
        { id: 'textures', icon: 'texture', label: 'Textures' },
        { id: 'fonts', icon: 'font_download', label: 'Fonts' },
        { id: 'stickers', icon: 'emoji_emotions', label: 'Stickers' },
        { id: 'brand', icon: 'palette', label: 'Brand' },
        { id: 'gradients', icon: 'gradient', label: 'Gradients' },
    ]

    // ── Keyboard shortcuts ──
    useEffect(() => {
        const handler = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
            if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo() }
            if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); handleRedo() }
            if (e.key === 'Delete' || e.key === 'Backspace') { deleteSelected() }
            if ((e.metaKey || e.ctrlKey) && e.key === 'd') { e.preventDefault(); duplicateSelected() }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [handleUndo, handleRedo]) // eslint-disable-line react-hooks/exhaustive-deps

    // ── Determine current preset info ──
    const currentPreset = PRESETS.find(p => p.id === activePreset) || PRESETS[0]

    // ══════════════════════════════════════════════════════════════════════
    // ── RENDER ──
    // ══════════════════════════════════════════════════════════════════════

    return (
        <div className="canvas-editor">
            {/* ── TOP TOOLBAR ── */}
            <div className="ce-toolbar">
                <div className="ce-toolbar-left">
                    <button className="ce-back-btn" onClick={() => navigate('/creative-studio')}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>
                        Back
                    </button>
                    <div className="ce-divider" />


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

                <div className={`ce-sidebar-left`}>
                    {/* ── Icon Rail ── */}
                    <div className="ce-icon-rail">
                        {SIDEBAR_TABS.map(tab => (
                            <button key={tab.id}
                                className={`ce-rail-btn ${sidebarTab === tab.id && panelOpen ? 'active' : ''} ${tab.isAi ? 'ai-tab' : ''}`}
                                onClick={() => handleTabClick(tab.id)}
                                title={tab.label}>
                                <span className="material-symbols-outlined ce-rail-icon">{tab.icon}</span>
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
                                            <div className="ce-ai-tool-section">
                                                <p className="ce-ai-tool-hint">
                                                    ✨ Describe what you want. If the canvas has content, AI edits it. If empty, AI generates a new image.
                                                </p>
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
                                                        {t === 'bar' ? '📊' : '🥧'} {t} Chart
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
                                                    <span className="ce-font-label">{font.includes('Noto Sans') ? '🌐' : ''}</span>
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
                                                <div className="ce-gradient-preview" style={{ background: `linear-gradient(${g.angle}deg, ${g.colors[0]}, ${g.colors[1]})` }} />
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
                                        {[{ id: 'upload', label: '📁 Upload' }, { id: 'brand', label: '🏢 Brand' }, { id: 'generated', label: '✨ Generated' }, { id: 'stock', label: '🖼 Stock' }].map(t => (
                                            <button key={t.id} className={`ce-category-pill ${imageSourceTab === t.id ? 'active' : ''}`}
                                                onClick={() => setImageSourceTab(t.id)}>
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
                                            <p className="ce-empty-state">Images generated via Creative Studio AI will appear here. Generate images from the AI Photoshoot or Template modes.</p>
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


                {/* ── CANVAS AREA ── */}
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
                        <button className="ce-tool-btn" onClick={() => { setZoom(100); handleZoom(0) }}
                            style={{ width: 28, height: 28 }} title="Reset zoom">
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>fit_screen</span>
                        </button>
                    </div>
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
                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                    {(activeBrand?.dna?.colors || []).map((c, i) => (
                                        <div key={i} className="ce-color-swatch" style={{ background: c.hex }}
                                            onClick={() => setTextColor(c.hex)} title={c.hex} />
                                    ))}
                                    <div className="ce-color-swatch" style={{ background: '#ffffff' }}
                                        onClick={() => setTextColor('#ffffff')} title="White" />
                                    <div className="ce-color-swatch" style={{ background: '#000000', border: '1px solid rgba(255,255,255,0.2)' }}
                                        onClick={() => setTextColor('#000000')} title="Black" />
                                    <div className="ce-color-swatch" style={{ background: '#f87171' }} onClick={() => setTextColor('#f87171')} title="Red" />
                                    <div className="ce-color-swatch" style={{ background: '#fbbf24' }} onClick={() => setTextColor('#fbbf24')} title="Yellow" />
                                    <div className="ce-color-swatch" style={{ background: '#34d399' }} onClick={() => setTextColor('#34d399')} title="Green" />
                                    <div className="ce-color-swatch" style={{ background: '#60a5fa' }} onClick={() => setTextColor('#60a5fa')} title="Blue" />
                                    <div className="ce-color-swatch" style={{ background: '#a78bfa' }} onClick={() => setTextColor('#a78bfa')} title="Purple" />
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
                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                    {['#6366f1', '#f87171', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa', '#f472b6', '#ffffff', '#000000', 'transparent'].map(c => (
                                        <div key={c} className="ce-color-swatch" style={{ background: c === 'transparent' ? 'repeating-conic-gradient(#ccc 0% 25%, transparent 0% 50%) 50% / 12px 12px' : c, border: c === '#000000' || c === 'transparent' ? '1px solid rgba(255,255,255,0.2)' : 'none' }}
                                            onClick={() => {
                                                const fc = fabricRef.current; const obj = fc?.getActiveObject()
                                                if (obj) { obj.set('fill', c); fc.renderAll(); saveHistory() }
                                            }} title={c} />
                                    ))}
                                </div>
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
                                        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', fontWeight: 700,
                                        cursor: 'pointer', fontSize: 13,
                                    }}>
                                    Heading
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* ── TOAST ── */}
            {toast && <div className="ce-toast">{toast}</div>}
        </div >
    )
}

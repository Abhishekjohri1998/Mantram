import { useState, useEffect, useRef, useCallback, Component } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useBrand } from '../context/BrandContext'
import SEOHead from '../components/SEOHead'
import * as fabric from 'fabric'
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

// ── Node type configs for elements ──
const ELEMENT_TYPES = [
    { id: 'text', icon: 'text_fields', label: 'Text' },
    { id: 'heading', icon: 'title', label: 'Heading' },
    { id: 'shape-rect', icon: 'rectangle', label: 'Rectangle' },
    { id: 'shape-circle', icon: 'circle', label: 'Circle' },
    { id: 'shape-line', icon: 'horizontal_rule', label: 'Line' },
    { id: 'logo', icon: 'add_photo_alternate', label: 'Brand Logo' },
    { id: 'image', icon: 'image', label: 'Upload Image' },
    { id: 'ai-element', icon: 'auto_awesome', label: 'AI Element' },
]

function CanvasEditorInner() {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const { activeBrand } = useBrand()

    // Core state
    const [mode, setMode] = useState('simple') // simple | advanced
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

    // Simple mode adjustments
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
        } else {
            setSelectedLayer(null)
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
                            selectable: mode === 'advanced',
                            evented: mode === 'advanced',
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

    // ── Update background image selectability when mode changes ──
    useEffect(() => {
        const fc = fabricRef.current
        if (!fc) return
        const bgImg = fc.getObjects().find(o => o.id === 'bg-image')
        if (bgImg) {
            bgImg.set({
                selectable: mode === 'advanced',
                evented: mode === 'advanced',
            })
            fc.renderAll()
        }
    }, [mode])

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

        let shape
        if (type === 'shape-rect') {
            shape = new fabric.Rect({
                width: 200, height: 150,
                fill: brandColor + '40',
                stroke: brandColor,
                strokeWidth: 2,
                rx: 12, ry: 12,
                customName: 'Rectangle',
                id: `rect-${Date.now()}`,
            })
        } else if (type === 'shape-circle') {
            shape = new fabric.Circle({
                radius: 80,
                fill: brandColor + '40',
                stroke: brandColor,
                strokeWidth: 2,
                customName: 'Circle',
                id: `circle-${Date.now()}`,
            })
        } else if (type === 'shape-line') {
            shape = new fabric.Line([0, 0, 300, 0], {
                stroke: brandColor,
                strokeWidth: 3,
                customName: 'Line',
                id: `line-${Date.now()}`,
            })
        }

        if (shape) {
            shape.set({
                left: fc.width / 2,
                top: fc.height / 2,
                originX: 'center',
                originY: 'center',
            })
            fc.add(shape)
            fc.setActiveObject(shape)
            fc.renderAll()
            saveHistory()
            showToast(`⬛ ${shape.customName} added`)
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
            reader.onload = (ev) => {
                const fc = fabricRef.current
                if (!fc) return
                fabric.FabricImage.fromURL(ev.target.result).then(img => {
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

        // Temporarily set zoom to 1 for full-res export
        const currentZoom = fc.getZoom()
        fc.setZoom(1)
        fc.setDimensions({ width: fc._logicalWidth, height: fc._logicalHeight })

        const dataUrl = fc.toDataURL({
            format,
            quality: format === 'jpg' ? 0.92 : 1,
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
        switch (type) {
            case 'text': addText('', false); break
            case 'heading': addText('', true); break
            case 'shape-rect':
            case 'shape-circle':
            case 'shape-line': addShape(type); break
            case 'logo': addLogo(); break
            case 'image': uploadImage(); break
            case 'ai-element': showToast('🤖 AI Element — coming in Phase 2!'); break
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

    // ── Google Fonts List ──
    const GOOGLE_FONTS = [
        'Inter', 'Poppins', 'Roboto', 'Open Sans', 'Montserrat', 'Lato', 'Raleway',
        'Oswald', 'Playfair Display', 'Merriweather', 'Nunito', 'Ubuntu', 'Rubik',
        'Work Sans', 'Quicksand', 'Fira Sans', 'Mulish', 'DM Sans', 'Outfit',
        'Space Grotesk', 'Sora', 'Manrope', 'Plus Jakarta Sans', 'Lexend',
        'Josefin Sans', 'Karla', 'Libre Baskerville', 'Crimson Text', 'Cormorant Garamond',
        'Bebas Neue', 'Anton', 'Permanent Marker', 'Pacifico', 'Dancing Script',
        'Righteous', 'Fredoka One', 'Lobster', 'Abril Fatface', 'Caveat',
        'Sacramento', 'Great Vibes', 'Satisfy', 'Comfortaa', 'Titan One',
        'Archivo Black', 'Barlow Condensed', 'Fjalla One', 'Jost', 'Urbanist', 'Bricolage Grotesque',
        // Vernacular
        'Noto Sans Devanagari', 'Noto Sans Tamil', 'Noto Sans Telugu', 'Noto Sans Bengali',
        'Noto Sans Kannada', 'Noto Sans Malayalam', 'Noto Sans Gujarati', 'Noto Sans Gurmukhi',
        'Noto Sans Oriya', 'Hind',
    ]

    const filteredFonts = fontSearch
        ? GOOGLE_FONTS.filter(f => f.toLowerCase().includes(fontSearch.toLowerCase()))
        : GOOGLE_FONTS

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
        reader.onload = () => setReplaceImage(reader.result)
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

    // ── Sidebar Tab Config ──
    const SIDEBAR_TABS = [
        { id: 'ai', icon: 'auto_awesome', label: 'AI', isAi: true },
        { id: 'elements', icon: 'dashboard_customize', label: 'Elements' },
        { id: 'icons', icon: 'interests', label: 'Icons' },
        { id: 'textures', icon: 'texture', label: 'Textures' },
        { id: 'fonts', icon: 'font_download', label: 'Fonts' },
        { id: 'stickers', icon: 'emoji_emotions', label: 'Stickers' },
        { id: 'brand', icon: 'palette', label: 'Brand' },
        { id: 'gradients', icon: 'gradient', label: 'Gradients' },
        { id: 'photos', icon: 'photo_library', label: 'Photos' },
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

                    {/* Mode Toggle */}
                    <div className="ce-mode-toggle">
                        <button className={`ce-mode-btn ${mode === 'simple' ? 'active' : ''}`}
                            onClick={() => setMode('simple')}>
                            ✨ Simple
                        </button>
                        <button className={`ce-mode-btn ${mode === 'advanced' ? 'active' : ''}`}
                            onClick={() => setMode('advanced')}>
                            🎯 Advanced
                        </button>
                    </div>
                </div>

                {/* Center tools (Advanced mode) */}
                {mode === 'advanced' && (
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

                {/* ── LEFT SIDEBAR (Advanced only) — Vertical Icon Rail + Panel ── */}
                <div className={`ce-sidebar-left ${mode !== 'advanced' ? 'collapsed' : ''}`}>
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

                                    {/* ── 4 Tool Cards ── */}
                                    <div className="ce-ai-tool-cards">
                                        {[
                                            { id: 'prompt', icon: 'magic_button', label: 'Prompt', desc: 'Edit by text' },
                                            { id: 'visual', icon: 'gesture', label: 'Visual', desc: 'Paint & edit' },
                                            { id: 'retouch', icon: 'auto_fix', label: 'Retouch', desc: 'Mask & replace' },
                                            { id: 'background', icon: 'wallpaper', label: 'Background', desc: 'Remove / swap' },
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

                            {/* ── ELEMENTS TAB ── */}
                            {sidebarTab === 'elements' && (
                                <div className="ce-panel">
                                    <div className="ce-panel-title">
                                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#818cf8' }}>dashboard_customize</span>
                                        Add Elements
                                    </div>
                                    <div className="ce-element-grid">
                                        {ELEMENT_TYPES.map(el => (
                                            <button key={el.id} className="ce-element-btn" onClick={() => handleAddElement(el.id)}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 22 }}>{el.icon}</span>
                                                {el.label}
                                            </button>
                                        ))}
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
                                        <span style={{ marginLeft: 'auto', color: '#475569', fontSize: 9 }}>Google Fonts</span>
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

                            {/* ── PHOTOS TAB ── */}
                            {sidebarTab === 'photos' && (
                                <div className="ce-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                    <div className="ce-panel-title">
                                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#818cf8' }}>photo_library</span>
                                        Stock Photos
                                        <span style={{ marginLeft: 'auto', color: '#475569', fontSize: 9 }}>Unsplash</span>
                                    </div>
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

                    {/* Brand Kit */}
                    <div className="ce-panel">
                        <div className="ce-panel-title">
                            <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#818cf8' }}>palette</span>
                            Brand Kit
                        </div>

                        {/* Brand Colors */}
                        {activeBrand?.dna?.colors?.length > 0 && (
                            <div style={{ marginBottom: 12 }}>
                                <p style={{ fontSize: 10, color: '#475569', marginBottom: 6, fontWeight: 600 }}>COLORS</p>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {activeBrand.dna.colors.map((c, i) => (
                                        <div key={i} className="ce-color-swatch"
                                            style={{ background: c.hex }}
                                            onClick={() => setTextColor(c.hex)}
                                            title={c.hex} />
                                    ))}
                                    <div className="ce-color-swatch"
                                        style={{ background: '#ffffff' }}
                                        onClick={() => setTextColor('#ffffff')}
                                        title="White" />
                                    <div className="ce-color-swatch"
                                        style={{ background: '#000000', border: '1px solid rgba(255,255,255,0.2)' }}
                                        onClick={() => setTextColor('#000000')}
                                        title="Black" />
                                </div>
                            </div>
                        )}

                        {/* Brand Fonts */}
                        <div>
                            <p style={{ fontSize: 10, color: '#475569', marginBottom: 6, fontWeight: 600 }}>FONTS</p>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                {(Array.isArray(activeBrand?.dna?.fonts) ? activeBrand.dna.fonts : ['Inter', 'Poppins', 'Roboto']).map((font, i) => (
                                    <button key={i} className="ce-font-btn"
                                        style={{ fontFamily: font }}
                                        onClick={() => {
                                            const fc = fabricRef.current
                                            const obj = fc?.getActiveObject()
                                            if (obj && obj.fontFamily !== undefined) {
                                                obj.set('fontFamily', font)
                                                fc.renderAll()
                                                saveHistory()
                                            }
                                        }}>
                                        {font}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

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

            {/* ── SIMPLE MODE TOOLS (bottom bar when in simple mode) ── */}
            {
                mode === 'simple' && (
                    <div className="ce-simple-tools">
                        <button className="ce-simple-tool" onClick={() => setShowTextModal(true)}>
                            <span className="material-symbols-outlined">text_fields</span>
                            Add Text
                        </button>
                        <button className="ce-simple-tool" onClick={addLogo}>
                            <span className="material-symbols-outlined">add_photo_alternate</span>
                            Add Logo
                        </button>
                        <button className="ce-simple-tool" onClick={() => setShowFilterPanel(!showFilterPanel)}>
                            <span className="material-symbols-outlined">auto_fix_high</span>
                            Filters
                        </button>
                        <button className="ce-simple-tool" onClick={uploadImage}>
                            <span className="material-symbols-outlined">image</span>
                            Add Image
                        </button>
                        <button className="ce-simple-tool" onClick={deleteSelected}>
                            <span className="material-symbols-outlined">delete</span>
                            Delete
                        </button>
                        <button className="ce-simple-tool" onClick={handleUndo} style={{ opacity: canUndo ? 1 : 0.3 }}>
                            <span className="material-symbols-outlined">undo</span>
                            Undo
                        </button>
                    </div>
                )
            }

            {/* ── Simple Mode Filter Panel ── */}
            {
                mode === 'simple' && showFilterPanel && (
                    <div style={{
                        position: 'absolute', bottom: 90, left: '50%', transform: 'translateX(-50%)',
                        background: 'rgba(15,20,35,0.95)', borderRadius: 16, padding: 16,
                        border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)',
                        zIndex: 60, width: 320,
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>Quick Filters</span>
                            <button onClick={() => setShowFilterPanel(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                            </button>
                        </div>
                        <div className="ce-filter-grid">
                            {FILTERS.map(f => (
                                <button key={f.id} className={`ce-filter-btn ${activeFilter === f.id ? 'active' : ''}`}
                                    onClick={() => applyFilter(f.id)}>
                                    {f.label}
                                </button>
                            ))}
                        </div>
                        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b', marginBottom: 4 }}>
                                <span>Brightness</span><span>{brightness}</span>
                            </div>
                            <input type="range" className="ce-slider" min={-50} max={50} value={brightness}
                                onChange={e => setBrightness(parseInt(e.target.value))} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b', marginBottom: 4, marginTop: 8 }}>
                                <span>Contrast</span><span>{contrast}</span>
                            </div>
                            <input type="range" className="ce-slider" min={-50} max={50} value={contrast}
                                onChange={e => setContrast(parseInt(e.target.value))} />
                        </div>
                    </div>
                )
            }

            {/* ── BOTTOM BAR (Platform Presets) ── */}
            <div className="ce-bottom-bar">
                <span style={{ fontSize: 10, color: '#475569', fontWeight: 600, marginRight: 8 }}>RESIZE:</span>
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

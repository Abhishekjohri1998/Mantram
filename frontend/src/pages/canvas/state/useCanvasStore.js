// ═══════════════════════════════════════════════════════════════
// useCanvasStore — Zustand Global State for AI Canvas
// Replaces ~130 useState hooks from monolithic CanvasEditor.jsx
// Provides sliced selectors for optimal re-render performance
// ═══════════════════════════════════════════════════════════════

import { create } from 'zustand'

const useCanvasStore = create((set, get) => ({
    // ══════════════════════════════════════════════════════════
    // ── CANVAS CORE ──
    // ══════════════════════════════════════════════════════════
    fabricRef: { current: null },         // Fabric.js canvas instance
    containerRef: { current: null },      // DOM container ref
    canvasRef: { current: null },         // DOM canvas element ref
    zoom: 100,
    activePreset: 'ig-post',
    activeTool: 'select',                 // select | draw | text | shape | ai
    canvasTheme: 'dark',                  // dark | light workspace background
    canvasView: 'design',                 // design | board | timeline
    initError: null,

    setZoom: (zoom) => set({ zoom }),
    setActivePreset: (id) => set({ activePreset: id }),
    setActiveTool: (tool) => set({ activeTool: tool }),
    setCanvasTheme: (theme) => set({ canvasTheme: theme }),
    toggleCanvasTheme: () => set(s => ({ canvasTheme: s.canvasTheme === 'dark' ? 'light' : 'dark' })),
    setCanvasView: (view) => set({ canvasView: view }),
    setInitError: (err) => set({ initError: err }),

    // ══════════════════════════════════════════════════════════
    // ── SELECTION & PROPERTIES ──
    // ══════════════════════════════════════════════════════════
    selectedLayer: null,
    selectedObjType: null,                // 'text' | 'shape' | 'image' | null
    objProps: { x: 0, y: 0, w: 0, h: 0, angle: 0, opacity: 100 },

    setSelectedLayer: (id) => set({ selectedLayer: id }),
    setSelectedObjType: (type) => set({ selectedObjType: type }),
    setObjProps: (props) => set({ objProps: props }),

    // ══════════════════════════════════════════════════════════
    // ── LAYERS ──
    // ══════════════════════════════════════════════════════════
    layers: [],
    setLayers: (layers) => set({ layers }),

    // ══════════════════════════════════════════════════════════
    // ── HISTORY (undo/redo) ──
    // ══════════════════════════════════════════════════════════
    canUndo: false,
    canRedo: false,
    setCanUndo: (v) => set({ canUndo: v }),
    setCanRedo: (v) => set({ canRedo: v }),

    // ══════════════════════════════════════════════════════════
    // ── UI STATE ──
    // ══════════════════════════════════════════════════════════
    toast: '',
    sidebarTab: 'elements',
    sidebarCollapsed: true,
    panelOpen: false,
    showResizePanel: false,
    showGenPanel: false,
    showFilterPanel: false,
    showTextModal: false,
    mobilePanel: null,                    // null | 'text' | 'ai' | 'elements' | 'photos' | 'properties'
    contextMenu: null,                    // { x, y, hasTarget, isGroup, ... } | null
    elementCategory: null,                // null=all or key from ELEMENT_CATEGORIES

    setToast: (msg) => set({ toast: msg }),
    showToast: (msg) => {
        set({ toast: msg })
        setTimeout(() => set({ toast: '' }), 2500)
    },
    setSidebarTab: (tab) => set({ sidebarTab: tab }),
    setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
    toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    setPanelOpen: (v) => set({ panelOpen: v }),
    setShowResizePanel: (v) => set({ showResizePanel: v }),
    setShowGenPanel: (v) => set({ showGenPanel: v }),
    setShowFilterPanel: (v) => set({ showFilterPanel: v }),
    setShowTextModal: (v) => set({ showTextModal: v }),
    setMobilePanel: (v) => set({ mobilePanel: v }),
    setContextMenu: (v) => set({ contextMenu: v }),
    closeContextMenu: () => set({ contextMenu: null }),
    setElementCategory: (v) => set({ elementCategory: v }),

    // ══════════════════════════════════════════════════════════
    // ── AI TOOLS STATE ──
    // ══════════════════════════════════════════════════════════
    aiTool: 'prompt',                     // prompt | visual | retouch | background
    aiPrompt: '',
    aiLoading: false,
    aiResult: null,                       // { imageUrl, type:'image' } or { copy, type:'copy' }
    aiError: '',
    editHistory: [],                      // Gemini conversational turns
    isMaskMode: false,
    maskBrushSize: 30,
    replaceImage: null,                   // base64 for retouch replacement
    bgAction: 'remove',                  // remove | replace
    bgPrompt: '',

    setAiTool: (tool) => set({ aiTool: tool }),
    setAiPrompt: (v) => set({ aiPrompt: v }),
    setAiLoading: (v) => set({ aiLoading: v }),
    setAiResult: (v) => set({ aiResult: v }),
    setAiError: (v) => set({ aiError: v }),
    setEditHistory: (v) => set({ editHistory: v }),
    setIsMaskMode: (v) => set({ isMaskMode: v }),
    setMaskBrushSize: (v) => set({ maskBrushSize: v }),
    setReplaceImage: (v) => set({ replaceImage: v }),
    setBgAction: (v) => set({ bgAction: v }),
    setBgPrompt: (v) => set({ bgPrompt: v }),

    // ══════════════════════════════════════════════════════════
    // ── IMAGE GENERATION PANEL ──
    // ══════════════════════════════════════════════════════════
    genPrompt: '',
    genEnhance: true,
    genRatio: '1:1',
    genRefs: [],
    genLoading: false,

    setGenPrompt: (v) => set({ genPrompt: v }),
    setGenEnhance: (v) => set({ genEnhance: v }),
    setGenRatio: (v) => set({ genRatio: v }),
    setGenRefs: (v) => set({ genRefs: v }),
    setGenLoading: (v) => set({ genLoading: v }),

    // ══════════════════════════════════════════════════════════
    // ── AI CREATIVE GENERATOR ──
    // ══════════════════════════════════════════════════════════
    aiCreativeKeywords: '',
    aiCreativeStyle: 'modern',
    aiCreativeLoading: false,

    setAiCreativeKeywords: (v) => set({ aiCreativeKeywords: v }),
    setAiCreativeStyle: (v) => set({ aiCreativeStyle: v }),
    setAiCreativeLoading: (v) => set({ aiCreativeLoading: v }),

    // ══════════════════════════════════════════════════════════
    // ── ASSET LIBRARY ──
    // ══════════════════════════════════════════════════════════
    iconSearch: '',
    iconResults: [],
    iconLoading: false,
    fontSearch: '',
    fontCategory: 'all',
    stickerCategory: 'all',
    stickerSearch: '',
    photoSearch: '',
    photoResults: [],
    photoLoading: false,
    photoSetupRequired: false,
    textureSearch: '',
    textureResults: [],
    textureLoading: false,
    textureSetupRequired: false,
    imageSourceTab: 'upload',
    generatedImages: [],
    loadingBankImages: false,

    setIconSearch: (v) => set({ iconSearch: v }),
    setIconResults: (v) => set({ iconResults: v }),
    setIconLoading: (v) => set({ iconLoading: v }),
    setFontSearch: (v) => set({ fontSearch: v }),
    setFontCategory: (v) => set({ fontCategory: v }),
    setStickerCategory: (v) => set({ stickerCategory: v }),
    setStickerSearch: (v) => set({ stickerSearch: v }),
    setPhotoSearch: (v) => set({ photoSearch: v }),
    setPhotoResults: (v) => set({ photoResults: v }),
    setPhotoLoading: (v) => set({ photoLoading: v }),
    setPhotoSetupRequired: (v) => set({ photoSetupRequired: v }),
    setTextureSearch: (v) => set({ textureSearch: v }),
    setTextureResults: (v) => set({ textureResults: v }),
    setTextureLoading: (v) => set({ textureLoading: v }),
    setTextureSetupRequired: (v) => set({ textureSetupRequired: v }),
    setImageSourceTab: (v) => set({ imageSourceTab: v }),
    setGeneratedImages: (v) => set({ generatedImages: v }),
    setLoadingBankImages: (v) => set({ loadingBankImages: v }),

    // ══════════════════════════════════════════════════════════
    // ── FIDATO CANVAS CHAT ──
    // ══════════════════════════════════════════════════════════
    fidatoOpen: false,
    fidatoMessages: [
        { role: 'assistant', content: 'Hey! I\'m Fidato, your AI creative partner. 🎨\n\nI can help you generate images, create campaigns, merge images, extract color palettes, and more. What would you like to create?' }
    ],
    fidatoInput: '',
    fidatoLoading: false,
    fidatoRecording: false,
    fidatoTranscribing: false,

    setFidatoOpen: (v) => set({ fidatoOpen: v }),
    toggleFidato: () => set(s => ({ fidatoOpen: !s.fidatoOpen })),
    setFidatoMessages: (v) => set({ fidatoMessages: typeof v === 'function' ? v(get().fidatoMessages) : v }),
    addFidatoMessage: (msg) => set(s => ({ fidatoMessages: [...s.fidatoMessages, msg] })),
    setFidatoInput: (v) => set({ fidatoInput: v }),
    setFidatoLoading: (v) => set({ fidatoLoading: v }),
    setFidatoRecording: (v) => set({ fidatoRecording: v }),
    setFidatoTranscribing: (v) => set({ fidatoTranscribing: v }),

    // ══════════════════════════════════════════════════════════
    // ── BOARD VIEW ──
    // ══════════════════════════════════════════════════════════
    boardScenes: [],
    storyBrief: null,

    setBoardScenes: (v) => set({ boardScenes: typeof v === 'function' ? v(get().boardScenes) : v }),
    setStoryBrief: (v) => set({ storyBrief: v }),

    // ══════════════════════════════════════════════════════════
    // ── RESIZE PANEL ──
    // ══════════════════════════════════════════════════════════
    customW: 1080,
    customH: 1080,
    lockRatio: true,

    setCustomW: (v) => set({ customW: v }),
    setCustomH: (v) => set({ customH: v }),
    setLockRatio: (v) => set({ lockRatio: v }),

    // ══════════════════════════════════════════════════════════
    // ── ADJUSTMENTS ──
    // ══════════════════════════════════════════════════════════
    brightness: 0,
    contrast: 0,
    activeFilter: 'none',
    textInput: '',

    setBrightness: (v) => set({ brightness: v }),
    setContrast: (v) => set({ contrast: v }),
    setActiveFilter: (v) => set({ activeFilter: v }),
    setTextInput: (v) => set({ textInput: v }),

    // ══════════════════════════════════════════════════════════
    // ── FLOATING TOOLBAR ──
    // ══════════════════════════════════════════════════════════
    floatTool: null,
    setFloatTool: (v) => set({ floatTool: v }),

    // ══════════════════════════════════════════════════════════
    // ── SIDEBAR SUB-STATE (Text Styles, Templates, Apps) ──
    // ══════════════════════════════════════════════════════════
    textStyleCat: 'all',
    templateCat: 'all',
    activeApp: null,

    setTextStyleCat: (v) => set({ textStyleCat: v }),
    setTemplateCat: (v) => set({ templateCat: v }),
    setActiveApp: (v) => set({ activeApp: v }),

    // ── App-local sub-states ──
    curvedTextInput: 'Hello World',
    curvedTextRadius: 120,
    qrInput: 'https://mantram.ai',
    chartType: 'bar',
    chartData: '',
    countdownDate: '',
    countdownLabel: 'Sale Ends',
    collageLayout: '2x2',
    blurIntensity: 10,
    generatedPalette: null,

    setCurvedTextInput: (v) => set({ curvedTextInput: v }),
    setCurvedTextRadius: (v) => set({ curvedTextRadius: v }),
    setQrInput: (v) => set({ qrInput: v }),
    setChartType: (v) => set({ chartType: v }),
    setChartData: (v) => set({ chartData: v }),
    setCountdownDate: (v) => set({ countdownDate: v }),
    setCountdownLabel: (v) => set({ countdownLabel: v }),
    setCollageLayout: (v) => set({ collageLayout: v }),
    setBlurIntensity: (v) => set({ blurIntensity: v }),
    setGeneratedPalette: (v) => set({ generatedPalette: v }),
}))

export default useCanvasStore

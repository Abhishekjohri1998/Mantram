// ═══════════════════════════════════════════════════════════════
// SidebarLeft.jsx — Left Sidebar with Icon Rail + Content Panels
// Contains 12 sidebar tabs: AI, Elements, Text, Apps, Templates
// Images, Icons, Textures, Fonts, Stickers, Brand, Gradients
// + Always-visible Layers panel at the bottom
// ═══════════════════════════════════════════════════════════════

import React from 'react'
import useCanvasStore from '../state/useCanvasStore'
import LayersPanel from './LayersPanel'
import {
    ELEMENT_CATEGORIES, ELEMENT_TYPES,
    GRADIENT_PRESETS, TEXTURE_PRESETS,
} from '../data/presets'
import { SVG_ELEMENT_CATEGORIES } from '../../canvasElements'
import {
    GOOGLE_FONTS, FONT_CATEGORIES,
    TEXT_STYLE_PRESETS, TEXT_STYLE_CATS, FONT_COMBOS,
    loadGoogleFont,
} from '../data/fonts'

// ── Sidebar tab configuration ──
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

export default function SidebarLeft({
    fabricRef,
    activeBrand,
    // Tab panel handlers (passed down from the shell)
    onAddElement,
    onAddSvgElement,
    onAddTextStyle,
    onAddFontCombo,
    onAddGradient,
    onApplyGradientToSelected,
    onApplyTemplate,
    onUploadImage,
    onAddBrandAsset,
    onAddBrandColorBlock,
    onApplyFontToSelected,
    onApplyBrandKit,
    onAddCollage,
    onApplyBlur,
    // Icon search
    onSearchIcons,
    onAddIconToCanvas,
    iconResults,
    iconLoading,
    // Photo search
    onSearchPhotos,
    onAddPhotoToCanvas,
    photoResults,
    photoLoading,
    photoSetupRequired,
    // Texture search
    onSearchTextures,
    onAddTextureToCanvas,
    textureResults,
    textureLoading,
    textureSetupRequired,
    // Sticker
    onAddStickerToCanvas,
    getFilteredStickers,
    // AI panel
    onAiSubmit,
    onAiCreativeGenerate,
    // App handlers
    onAddCurvedText,
    onAddQrCode,
    onAddChart,
    onAddCountdown,
    onGeneratePalette,
    onAddPaletteToCanvas,
    // Brand assets helper
    getBrandAssets,
    // Generated images
    generatedImages,
    loadingBankImages,
    onAddImageUrlToCanvas,
    // Canvas apps
    canvasApps,
    // Save history
    onSaveHistory,
}) {
    const {
        sidebarTab, setSidebarTab,
        panelOpen, setPanelOpen,
        sidebarCollapsed, setSidebarCollapsed, toggleSidebar,
        // AI state
        aiTool, setAiTool,
        aiPrompt, setAiPrompt,
        aiLoading,
        aiError,
        isMaskMode,
        maskBrushSize, setMaskBrushSize,
        replaceImage, setReplaceImage,
        bgAction, setBgAction,
        bgPrompt, setBgPrompt,
        aiCreativeKeywords, setAiCreativeKeywords,
        aiCreativeStyle, setAiCreativeStyle,
        aiCreativeLoading,
        editHistory, setEditHistory,
        // Misc state
        elementCategory, setElementCategory,
        textStyleCat, setTextStyleCat,
        templateCat, setTemplateCat,
        fontCategory, setFontCategory,
        fontSearch, setFontSearch,
        stickerCategory, setStickerCategory,
        stickerSearch, setStickerSearch,
        iconSearch, setIconSearch,
        photoSearch, setPhotoSearch,
        textureSearch, setTextureSearch,
        imageSourceTab, setImageSourceTab,
        activeApp, setActiveApp,
        // App-local state
        curvedTextInput, setCurvedTextInput,
        curvedTextRadius, setCurvedTextRadius,
        qrInput, setQrInput,
        chartType, setChartType,
        chartData, setChartData,
        countdownDate, setCountdownDate,
        countdownLabel, setCountdownLabel,
        collageLayout, setCollageLayout,
        blurIntensity, setBlurIntensity,
        generatedPalette,
        showToast,
    } = useCanvasStore()

    // ── Filtered fonts helper ──
    const filteredFonts = React.useMemo(() => {
        let fonts = GOOGLE_FONTS
        if (fontCategory !== 'all') {
            // Simple filter by category keyword
            const catMap = {
                serif: ['Playfair', 'Merriweather', 'Lora', 'EB Garamond', 'Crimson', 'Libre Baskerville', 'PT Serif', 'Noto Serif', 'Source Serif', 'DM Serif'],
                sans: ['Inter', 'Roboto', 'Open Sans', 'Poppins', 'Outfit', 'DM Sans', 'Work Sans', 'Nunito', 'Lato', 'Raleway', 'Montserrat', 'Oswald', 'Source Sans'],
                display: ['Bebas', 'Pacifico', 'Lobster', 'Righteous', 'Permanent Marker', 'Bungee', 'Abril', 'Titan', 'Anton', 'Black Ops', 'Bangers'],
                mono: ['Fira Code', 'JetBrains', 'Source Code', 'IBM Plex Mono', 'Space Mono', 'Roboto Mono', 'Ubuntu Mono'],
                hindi: ['Noto Sans Devanagari', 'Tiro Devanagari', 'Baloo', 'Hind', 'Poppins'],
            }
            const keywords = catMap[fontCategory] || []
            if (keywords.length > 0) {
                fonts = fonts.filter(f => keywords.some(k => f.includes(k)))
            }
        }
        if (fontSearch) {
            fonts = fonts.filter(f => f.toLowerCase().includes(fontSearch.toLowerCase()))
        }
        return fonts
    }, [fontCategory, fontSearch])

    // ── Tab click handler ──
    const handleTabClick = (tabId) => {
        if (sidebarTab === tabId && panelOpen) {
            setPanelOpen(false)
        } else {
            setSidebarTab(tabId)
            setPanelOpen(true)
            if (sidebarCollapsed) toggleSidebar()
        }
    }

    // ── Toggle mask mode ──
    const toggleMaskMode = (on) => {
        useCanvasStore.getState().setIsMaskMode(on)
    }

    // ── Handle replace image upload ──
    const handleReplaceImageUpload = (e) => {
        const file = e.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = (ev) => setReplaceImage(ev.target.result)
        reader.readAsDataURL(file)
    }

    // ── Clear mask strokes ──
    const clearMaskStrokes = () => {
        // Placeholder — will be connected to mask canvas ref
        showToast('🧹 Mask cleared')
    }

    // ── Handle undo on edit history ──
    const handleUndo = () => {
        // Will be injected from shell
    }

    return (
        <div className={`ce-sidebar-left ${sidebarCollapsed ? 'collapsed' : ''}`}>
            {/* Collapse toggle */}
            <button className="ce-sidebar-collapse-btn" onClick={() => toggleSidebar()} title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
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

                    {/* ── AI TAB ── */}
                    {sidebarTab === 'ai' && (
                        <div className="ce-panel ce-ai-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0 }}>
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

                            {/* 5 Tool Cards */}
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
                                            setAiTool(t.id)
                                            useCanvasStore.getState().setAiResult(null)
                                            useCanvasStore.getState().setAiError('')
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

                            {/* Tool-specific UI */}
                            <div className="ce-ai-tool-body">
                                {/* PROMPT TOOL */}
                                {aiTool === 'prompt' && (
                                    <div className="ce-ai-tool-section flex flex-col gap-3">
                                        <p className="ce-ai-tool-hint">
                                            ✨ Describe what you want. If the canvas has content, Gemini edits it preserving layout. If empty, AI generates a new image.
                                        </p>
                                        {editHistory.length > 0 && (
                                            <div className="bg-black/20 rounded-xl p-3 max-h-[200px] overflow-y-auto custom-scrollbar flex flex-col gap-2 border border-[var(--sys-border)]">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[10px] font-bold text-slate-500 uppercase">Edit Timeline</span>
                                                    <button onClick={() => { handleUndo(); setEditHistory(prev => prev.slice(0, -1)); }}
                                                        className="text-[10px] text-[var(--sys-primary)] hover:text-[var(--sys-primary)] flex items-center gap-1 cursor-pointer">
                                                        <span className="material-symbols-outlined" style={{fontSize: 12}}>undo</span> Revert Last
                                                    </button>
                                                </div>
                                                {editHistory.map((h, i) => (
                                                    <div key={i} className="flex gap-2 items-start bg-white/5 rounded-lg p-2 border border-[var(--sys-border)]/[0.02]">
                                                        <div className="w-4 h-4 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center text-[9px] font-bold mt-0.5 flex-shrink-0">
                                                            {i + 1}
                                                        </div>
                                                        <p className="text-[11px] text-slate-300 flex-1 leading-tight">{h.prompt}</p>
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
                                                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onAiSubmit?.() } }}
                                                rows={3}
                                            />
                                            <button className="ce-ai-send-btn" onClick={onAiSubmit} disabled={aiLoading || !aiPrompt.trim()}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{aiLoading ? 'progress_activity' : 'arrow_upward'}</span>
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* VISUAL TOOL (Inpaint) */}
                                {aiTool === 'visual' && (
                                    <div className="ce-ai-tool-section">
                                        <p className="ce-ai-tool-hint">🖌️ Paint over the area you want to change, then describe what should replace it.</p>
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
                                        <div className="ce-ai-brush-row">
                                            <span className="ce-ai-brush-label">Brush</span>
                                            <input type="range" min="5" max="80" value={maskBrushSize}
                                                onChange={e => setMaskBrushSize(Number(e.target.value))}
                                                className="ce-ai-brush-slider" />
                                            <span className="ce-ai-brush-value">{maskBrushSize}px</span>
                                        </div>
                                        <div className="ce-ai-prompt-bar">
                                            <textarea className="ce-ai-prompt-input" placeholder="e.g. Replace with a blue sky, add flowers here..."
                                                value={aiPrompt} onChange={e => setAiPrompt(e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onAiSubmit?.() } }}
                                                rows={2} />
                                            <button className="ce-ai-send-btn" onClick={onAiSubmit} disabled={aiLoading || !aiPrompt.trim()}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{aiLoading ? 'progress_activity' : 'arrow_upward'}</span>
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* RETOUCH TOOL */}
                                {aiTool === 'retouch' && (
                                    <div className="ce-ai-tool-section">
                                        <p className="ce-ai-tool-hint">🎯 Paint a mask over the area to retouch. Optionally upload a replacement image.</p>
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
                                        <div className="ce-ai-brush-row">
                                            <span className="ce-ai-brush-label">Brush</span>
                                            <input type="range" min="5" max="80" value={maskBrushSize}
                                                onChange={e => setMaskBrushSize(Number(e.target.value))}
                                                className="ce-ai-brush-slider" />
                                            <span className="ce-ai-brush-value">{maskBrushSize}px</span>
                                        </div>
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
                                        <div className="ce-ai-prompt-bar">
                                            <textarea className="ce-ai-prompt-input" placeholder="e.g. Clean up this area, replace with marble texture..."
                                                value={aiPrompt} onChange={e => setAiPrompt(e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onAiSubmit?.() } }}
                                                rows={2} />
                                            <button className="ce-ai-send-btn" onClick={onAiSubmit} disabled={aiLoading}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{aiLoading ? 'progress_activity' : 'arrow_upward'}</span>
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* BACKGROUND TOOL */}
                                {aiTool === 'background' && (
                                    <div className="ce-ai-tool-section">
                                        <p className="ce-ai-tool-hint">🖼️ Remove the background entirely or replace it with something new.</p>
                                        <div className="ce-ai-bg-toggle">
                                            <button className={`ce-ai-bg-btn ${bgAction === 'remove' ? 'active' : ''}`} onClick={() => setBgAction('remove')}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>content_cut</span>
                                                Remove BG
                                            </button>
                                            <button className={`ce-ai-bg-btn ${bgAction === 'replace' ? 'active' : ''}`} onClick={() => setBgAction('replace')}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>landscape</span>
                                                Replace BG
                                            </button>
                                        </div>
                                        {bgAction === 'replace' && (
                                            <div className="ce-ai-prompt-bar" style={{ marginTop: 8 }}>
                                                <textarea className="ce-ai-prompt-input" placeholder="e.g. A tropical beach at sunset, a modern office..."
                                                    value={bgPrompt} onChange={e => setBgPrompt(e.target.value)} rows={2} />
                                            </div>
                                        )}
                                        <button className="ce-ai-bg-action-btn" onClick={onAiSubmit} disabled={aiLoading}>
                                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                                                {aiLoading ? 'progress_activity' : (bgAction === 'remove' ? 'content_cut' : 'landscape')}
                                            </span>
                                            {aiLoading ? 'Processing...' : (bgAction === 'remove' ? 'Remove Background' : 'Replace Background')}
                                        </button>
                                    </div>
                                )}

                                {/* CREATIVE TOOL */}
                                {aiTool === 'creative' && (
                                    <div className="ce-ai-tool-section">
                                        <p className="ce-ai-tool-hint">🎨 Enter keywords and pick a style. AI will generate a fully editable design.</p>
                                        <div className="ce-ai-prompt-bar">
                                            <textarea className="ce-ai-prompt-input" placeholder="e.g. summer sale, 50% off, fashion brand, tropical vibes..."
                                                value={aiCreativeKeywords} onChange={e => setAiCreativeKeywords(e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onAiCreativeGenerate?.() } }}
                                                rows={3} />
                                        </div>
                                        <div style={{ padding: '8px 0' }}>
                                            <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>STYLE</span>
                                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                                                {['modern', 'bold', 'elegant', 'playful', 'minimal', 'corporate'].map(s => (
                                                    <button key={s} className={`ce-category-pill ${aiCreativeStyle === s ? 'active' : ''}`}
                                                        onClick={() => setAiCreativeStyle(s)}>
                                                        {s.charAt(0).toUpperCase() + s.slice(1)}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <button className="ce-ai-bg-action-btn" onClick={onAiCreativeGenerate}
                                            disabled={aiCreativeLoading || !aiCreativeKeywords.trim()}>
                                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                                                {aiCreativeLoading ? 'progress_activity' : 'auto_awesome'}
                                            </span>
                                            {aiCreativeLoading ? 'Generating...' : 'Generate Design'}
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Loading / Error */}
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
                            {aiError && <div className="ce-ai-error">⚠️ {aiError}</div>}
                        </div>
                    )}

                    {/* ── ELEMENTS TAB ── */}
                    {sidebarTab === 'elements' && (
                        <div className="ce-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <div className="ce-panel-title">
                                <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#818cf8' }}>dashboard_customize</span>
                                Elements
                                <span style={{ marginLeft: 'auto', color: '#475569', fontSize: 9 }}>{ELEMENT_TYPES.length + Object.values(SVG_ELEMENT_CATEGORIES).reduce((s, c) => s + c.items.length, 0)} items</span>
                            </div>
                            <div className="ce-category-pills">
                                <button className={`ce-category-pill ${!elementCategory ? 'active' : ''}`} onClick={() => setElementCategory(null)}>All</button>
                                {Object.entries(ELEMENT_CATEGORIES).map(([key, cat]) => (
                                    <button key={key} className={`ce-category-pill ${elementCategory === key ? 'active' : ''}`}
                                        onClick={() => setElementCategory(key)}>{cat.label}</button>
                                ))}
                                {Object.entries(SVG_ELEMENT_CATEGORIES).map(([key, cat]) => (
                                    <button key={`svg-${key}`} className={`ce-category-pill ${elementCategory === `svg-${key}` ? 'active' : ''}`}
                                        onClick={() => setElementCategory(`svg-${key}`)}>{cat.label}</button>
                                ))}
                            </div>
                            <div className="ce-element-grid" style={{ overflowY: 'auto', flex: 1 }}>
                                {(!elementCategory || (elementCategory && !elementCategory.startsWith('svg-')))
                                    && (elementCategory
                                        ? ELEMENT_CATEGORIES[elementCategory]?.items || []
                                        : ELEMENT_TYPES
                                    ).map(el => (
                                        <button key={el.id} className="ce-element-btn" onClick={() => onAddElement?.(el.id)}>
                                            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>{el.icon}</span>
                                            {el.label}
                                        </button>
                                    ))
                                }
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
                                                    <button key={svgEl.id} className="ce-element-btn" onClick={() => onAddSvgElement?.(svgEl)}>
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

                    {/* ── TEXT STYLES TAB ── */}
                    {sidebarTab === 'text-styles' && (
                        <div className="ce-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <div className="ce-panel-title">
                                <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#818cf8' }}>format_quote</span>
                                Typography
                                <span style={{ marginLeft: 'auto', color: '#475569', fontSize: 9 }}>{TEXT_STYLE_PRESETS.length} styles + {FONT_COMBOS.length} combos</span>
                            </div>
                            <div className="ce-category-pills">
                                {Object.entries(TEXT_STYLE_CATS).map(([key, label]) => (
                                    <button key={key} className={`ce-category-pill ${textStyleCat === key ? 'active' : ''}`}
                                        onClick={() => setTextStyleCat(key)}>{label}</button>
                                ))}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '0 4px', overflowY: 'auto', flex: 1 }}>
                                {TEXT_STYLE_PRESETS
                                    .filter(p => textStyleCat === 'all' || p.cat === textStyleCat)
                                    .map(preset => {
                                        loadGoogleFont(preset.font)
                                        return (
                                            <button key={preset.id} className="ce-text-style-card" onClick={() => onAddTextStyle?.(preset)}>
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
                                                <button key={combo.id} className="ce-text-style-card" onClick={() => onAddFontCombo?.(combo)}
                                                    style={{ borderLeft: `3px solid ${combo.headColor}40` }}>
                                                    <span style={{ fontFamily: combo.heading, fontSize: 18, fontWeight: '700', color: combo.headColor, lineHeight: 1.2 }}>Heading Text</span>
                                                    <span style={{ fontFamily: combo.body, fontSize: 12, fontWeight: '400', color: combo.bodyColor, lineHeight: 1.3 }}>Body text for this pairing</span>
                                                    <span className="ce-text-style-meta">{combo.style} • {combo.heading} + {combo.body}</span>
                                                </button>
                                            )
                                        })}
                                    </>
                                )}
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
                            <input className="ce-asset-search" placeholder="Search icons... (e.g. arrow, heart, star)"
                                value={iconSearch} onChange={e => { setIconSearch(e.target.value); onSearchIcons?.(e.target.value) }} />
                            {iconLoading && <div className="ce-loading-spinner"><span className="material-symbols-outlined ce-spin">progress_activity</span> Searching...</div>}
                            <div className="ce-asset-grid">
                                {iconResults.map(icon => (
                                    <button key={icon} className="ce-asset-card" onClick={() => onAddIconToCanvas?.(icon)} title={icon}>
                                        <img src={`https://api.iconify.design/${icon}.svg?width=32&height=32`} alt={icon} style={{ width: 32, height: 32, filter: 'invert(0.7)' }} />
                                        <span className="ce-asset-name">{icon.split(':').pop()}</span>
                                    </button>
                                ))}
                                {!iconLoading && iconResults.length === 0 && iconSearch.length >= 2 && (
                                    <p className="ce-empty-state">No icons found for "{iconSearch}"</p>
                                )}
                                {!iconSearch && <p className="ce-empty-state">Type to search 200,000+ icons</p>}
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
                            <div className="ce-category-pills" style={{ paddingBottom: 4 }}>
                                {Object.entries(FONT_CATEGORIES).map(([key, label]) => (
                                    <button key={key} className={`ce-category-pill ${fontCategory === key ? 'active' : ''}`}
                                        onClick={() => setFontCategory(key)}>{label}</button>
                                ))}
                            </div>
                            <input className="ce-asset-search" placeholder="Search fonts... (e.g. Poppins, Noto Sans)"
                                value={fontSearch} onChange={e => setFontSearch(e.target.value)} />
                            <div className="ce-font-list">
                                {filteredFonts.map(font => {
                                    loadGoogleFont(font)
                                    return (
                                        <button key={font} className="ce-font-preview" onClick={() => onApplyFontToSelected?.(font)}>
                                            <span className="ce-font-sample" style={{ fontFamily: font }}>{font}</span>
                                            <span className="ce-font-label">{font.includes('Noto Sans') ? 'language' : ''}</span>
                                        </button>
                                    )
                                })}
                                {filteredFonts.length === 0 && <p className="ce-empty-state">No fonts match "{fontSearch}"</p>}
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
                                    <button key={i} className="ce-gradient-card" onClick={() => onAddGradient?.(g)} onContextMenu={e => { e.preventDefault(); onApplyGradientToSelected?.(g) }} title={`${g.name} — Right-click to apply to selection`}>
                                        <div className="ce-gradient-preview" style={{ background: `linear-gradient(${g.angle}deg, ${g.colors[0]}, ${g.colors[1]})` }} />
                                        <span className="ce-gradient-label">{g.name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── IMAGES TAB ── */}
                    {sidebarTab === 'images' && (
                        <div className="ce-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <div className="ce-panel-title">
                                <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#818cf8' }}>photo_library</span>
                                Images
                            </div>
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

                            {imageSourceTab === 'upload' && (
                                <div style={{ padding: '0 8px' }}>
                                    <button className="ce-search-btn" onClick={onUploadImage} style={{ width: '100%' }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>upload</span>
                                        Upload Image
                                    </button>
                                    <p className="ce-empty-state" style={{ marginTop: 12 }}>Upload images from your computer to add to the canvas.</p>
                                </div>
                            )}

                            {imageSourceTab === 'brand' && (
                                <div className="ce-asset-grid" style={{ maxHeight: 400 }}>
                                    {(getBrandAssets?.() || []).map((asset, i) => (
                                        <button key={i} className="ce-asset-card" onClick={() => onAddBrandAsset?.(asset)} title={asset.name}>
                                            {asset.url ? (
                                                <img src={asset.url} alt={asset.name} style={{ width: 40, height: 40, objectFit: 'contain', borderRadius: 6 }} />
                                            ) : (
                                                <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#818cf8' }}>{asset.icon}</span>
                                            )}
                                            <span className="ce-asset-name">{asset.name}</span>
                                        </button>
                                    ))}
                                    {(getBrandAssets?.() || []).length === 0 && <p className="ce-empty-state">No brand assets found.</p>}
                                </div>
                            )}

                            {imageSourceTab === 'generated' && (
                                <div style={{ padding: '0 8px' }}>
                                    {loadingBankImages ? (
                                        <div className="ce-loading-spinner"><span className="material-symbols-outlined ce-spin">progress_activity</span> Loading images...</div>
                                    ) : (generatedImages || []).length > 0 ? (
                                        <div className="ce-photo-grid">
                                            {(generatedImages || []).map((img, i) => (
                                                <button key={img.id || i} className="ce-photo-thumb" onClick={() => onAddImageUrlToCanvas?.(img.url, img.label)} title={img.label || `Generated ${i + 1}`}>
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

                            {imageSourceTab === 'stock' && (
                                <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                                    <input className="ce-asset-search" placeholder="Search photos... (e.g. business, nature)"
                                        value={photoSearch} onChange={e => setPhotoSearch(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') onSearchPhotos?.(photoSearch) }} />
                                    <button className="ce-search-btn" onClick={() => onSearchPhotos?.(photoSearch)} disabled={photoLoading}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>search</span>
                                        {photoLoading ? 'Searching...' : 'Search'}
                                    </button>
                                    {photoSetupRequired && (
                                        <div className="ce-setup-notice">
                                            <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#fbbf24' }}>info</span>
                                            <p>Add <code>UNSPLASH_ACCESS_KEY</code> to your <code>.env</code> file to enable photo search.</p>
                                        </div>
                                    )}
                                    {photoLoading && <div className="ce-loading-spinner"><span className="material-symbols-outlined ce-spin">progress_activity</span> Loading...</div>}
                                    <div className="ce-photo-grid">
                                        {photoResults.map(photo => (
                                            <button key={photo.id} className="ce-photo-thumb" onClick={() => onAddPhotoToCanvas?.(photo)} title={photo.alt}>
                                                <img src={photo.thumb} alt={photo.alt} loading="lazy" />
                                                <span className="ce-photo-author">{photo.author}</span>
                                            </button>
                                        ))}
                                        {!photoLoading && photoResults.length === 0 && !photoSetupRequired && photoSearch && (
                                            <p className="ce-empty-state">Press Enter or click Search</p>
                                        )}
                                        {!photoSearch && !photoSetupRequired && <p className="ce-empty-state">Search millions of free photos</p>}
                                    </div>
                                </div>
                            )}
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
                            {activeBrand?.dna?.colors?.length > 0 && (
                                <div style={{ padding: '0 12px 12px' }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Brand Colors</div>
                                    <div className="ce-brand-colors">
                                        {activeBrand.dna.colors.map((c, i) => (
                                            <button key={i} className="ce-brand-color-swatch" onClick={() => onAddBrandColorBlock?.(c.hex)} title={`${c.name || c.hex}`}>
                                                <div className="ce-swatch-circle" style={{ background: c.hex }} />
                                                <span className="ce-swatch-label">{c.hex}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {activeBrand?.dna?.fonts?.length > 0 && (
                                <div style={{ padding: '0 12px 12px' }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Brand Fonts</div>
                                    <div className="ce-font-list" style={{ padding: 0, maxHeight: 100 }}>
                                        {activeBrand.dna.fonts.map((font, i) => {
                                            loadGoogleFont(font)
                                            return (
                                                <button key={i} className="ce-font-preview" onClick={() => onApplyFontToSelected?.(font)}>
                                                    <span className="ce-font-sample" style={{ fontFamily: font }}>{font}</span>
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}
                            <div style={{ padding: '0 12px 12px' }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Images & Logo</div>
                                <div className="ce-asset-grid" style={{ maxHeight: 300 }}>
                                    {(getBrandAssets?.() || []).map((asset, i) => (
                                        <button key={i} className="ce-asset-card" onClick={() => onAddBrandAsset?.(asset)} title={asset.name}>
                                            {asset.url ? (
                                                <img src={asset.url} alt={asset.name} style={{ width: 40, height: 40, objectFit: 'contain', borderRadius: 6 }} />
                                            ) : (
                                                <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#818cf8' }}>{asset.icon}</span>
                                            )}
                                            <span className="ce-asset-name">{asset.name}</span>
                                        </button>
                                    ))}
                                    {(getBrandAssets?.() || []).length === 0 && <p className="ce-empty-state">No brand assets found. Complete brand onboarding to see assets here.</p>}
                                </div>
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
                            <input className="ce-asset-search" placeholder="Search stickers..."
                                value={stickerSearch} onChange={e => setStickerSearch(e.target.value)} />
                            <div className="ce-asset-grid">
                                {(getFilteredStickers?.() || []).map(name => (
                                    <button key={name} className="ce-asset-card" onClick={() => onAddStickerToCanvas?.(name)} title={name}>
                                        <img src={`https://api.iconify.design/lucide:${name}.svg?width=36&height=36&color=%23818cf8`} alt={name} style={{ width: 36, height: 36 }} />
                                        <span className="ce-asset-name">{name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── TEXTURES TAB ── */}
                    {sidebarTab === 'textures' && (
                        <div className="ce-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <div className="ce-panel-title">
                                <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#818cf8' }}>texture</span>
                                Textures & Overlays
                                <span style={{ marginLeft: 'auto', color: '#475569', fontSize: 9 }}>Pixabay</span>
                            </div>
                            <input className="ce-asset-search" placeholder="Textures, overlays, PNGs…"
                                value={textureSearch} onChange={e => setTextureSearch(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') onSearchTextures?.(textureSearch) }} />
                            <button className="ce-search-btn" onClick={() => onSearchTextures?.(textureSearch)} disabled={textureLoading}>
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>search</span>
                                {textureLoading ? 'Searching...' : 'Search Textures'}
                            </button>
                            <div className="ce-category-pills" style={{ paddingBottom: 6 }}>
                                {TEXTURE_PRESETS.slice(0, 8).map(p => (
                                    <button key={p} className="ce-category-pill" onClick={() => { setTextureSearch(p); onSearchTextures?.(p) }}>
                                        {p.split(' ')[0]}
                                    </button>
                                ))}
                            </div>
                            {textureSetupRequired && (
                                <div className="ce-setup-notice">
                                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#fbbf24' }}>info</span>
                                    <p>Add <code>PIXABAY_API_KEY</code> to your <code>.env</code> file to enable texture search.</p>
                                </div>
                            )}
                            {textureLoading && <div className="ce-loading-spinner"><span className="material-symbols-outlined ce-spin">progress_activity</span> Loading...</div>}
                            <div className="ce-photo-grid">
                                {textureResults.map(tex => (
                                    <button key={tex.id} className="ce-photo-thumb" onClick={() => onAddTextureToCanvas?.(tex)} title={tex.tags}>
                                        <img src={tex.thumb} alt={tex.tags} loading="lazy" />
                                        <span className="ce-photo-author">{tex.tags?.split(',')[0]}</span>
                                    </button>
                                ))}
                                {!textureLoading && textureResults.length === 0 && !textureSetupRequired && textureSearch && (
                                    <p className="ce-empty-state">Press Enter or click Search</p>
                                )}
                                {!textureSearch && !textureSetupRequired && <p className="ce-empty-state">Search grunge, bokeh, paper, marble…</p>}
                            </div>
                        </div>
                    )}

                    {/* ── TEMPLATES TAB, APPS TAB are preserved in monolith for now ── */}
                    {/* They'll be migrated in a follow-up pass with their dedicated sub-states */}

                    {/* ── Layers Panel (always at bottom) ── */}
                    <LayersPanel fabricRef={fabricRef} onSaveHistory={onSaveHistory} />
                </div>
            </div>
        </div>
    )
}

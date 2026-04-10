// ═══════════════════════════════════════════════════════════════
// FloatingToolbar.jsx — Floating Bottom Toolbar + Generate Panel
// Quick access toolbar on top of canvas area with select, image gen,
// text, upload, shapes, background, inpaint tools.
// Also hosts the Generate Image floating panel.
// ═══════════════════════════════════════════════════════════════

import React from 'react'
import useCanvasStore from '../state/useCanvasStore'

export default function FloatingToolbar({
    onUploadImage,
    onGenImage,
}) {
    const {
        floatTool, setFloatTool,
        showGenPanel, setShowGenPanel,
        genPrompt, setGenPrompt,
        genEnhance, setGenEnhance,
        genRatio, setGenRatio,
        genRefs, setGenRefs,
        genLoading,
        setSidebarTab, setPanelOpen, setAiTool,
        setShowTextModal,
    } = useCanvasStore()

    return (
        <>
            {/* ── FLOATING BOTTOM TOOLBAR ── */}
            <div className="ce-floating-toolbar">
                <button className={`ce-float-btn ${floatTool === 'select' ? 'active' : ''}`}
                    onClick={() => { setFloatTool('select'); setShowGenPanel(false) }} title="Select">
                    <span className="material-symbols-outlined">arrow_selector_tool</span>
                </button>
                <button className={`ce-float-btn ${showGenPanel ? 'active' : ''}`}
                    onClick={() => { setFloatTool('image'); setShowGenPanel(!showGenPanel) }} title="Generate Image">
                    <span className="material-symbols-outlined">image</span>
                </button>
                <button className="ce-float-btn" onClick={() => setShowTextModal(true)} title="Add Text">
                    <span className="material-symbols-outlined">title</span>
                </button>
                <div className="ce-float-divider" />
                <button className="ce-float-btn" onClick={onUploadImage} title="Upload Image">
                    <span className="material-symbols-outlined">upload</span>
                </button>
                <button className="ce-float-btn" onClick={() => { setSidebarTab('elements'); setPanelOpen(true) }} title="Shapes">
                    <span className="material-symbols-outlined">shapes</span>
                </button>
                <button className="ce-float-btn" onClick={() => { setSidebarTab('ai'); setPanelOpen(true); setAiTool('background') }} title="Background">
                    <span className="material-symbols-outlined">wallpaper</span>
                </button>
                <div className="ce-float-divider" />
                <button className="ce-float-btn" onClick={() => { setSidebarTab('ai'); setPanelOpen(true); setAiTool('visual') }} title="AI Inpaint">
                    <span className="material-symbols-outlined">gesture</span>
                </button>
                <button className="ce-float-btn" onClick={() => { setSidebarTab('ai'); setPanelOpen(true); setAiTool('retouch') }} title="AI Retouch">
                    <span className="material-symbols-outlined">auto_fix</span>
                </button>
            </div>

            {/* ── GENERATE IMAGE FLOATING PANEL ── */}
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
                            {[{ r: '1:1', icon: '⬜' }, { r: '16:9', icon: '🖥️' }, { r: '9:16', icon: '📱' }, { r: '4:5', icon: '📸' }, { r: '3:2', icon: '🎞️' }].map(opt => (
                                <button key={opt.r} className={`ce-genimg-ratio-btn ${genRatio === opt.r ? 'active' : ''}`} onClick={() => setGenRatio(opt.r)}>
                                    <span style={{ fontSize: 12 }}>{opt.icon}</span> {opt.r}
                                </button>
                            ))}
                        </div>
                    </div>
                    <button className="ce-genimg-create-btn" onClick={onGenImage} disabled={genLoading || !genPrompt.trim()}>
                        {genLoading ? (<><span className="material-symbols-outlined ce-spin" style={{ fontSize: 18 }}>progress_activity</span> Generating...</>) : (<><span className="material-symbols-outlined" style={{ fontSize: 18 }}>auto_awesome</span> Create</>)}
                    </button>
                </div>
            )}
        </>
    )
}

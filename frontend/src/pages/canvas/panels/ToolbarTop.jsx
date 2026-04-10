// ═══════════════════════════════════════════════════════════════
// ToolbarTop.jsx — Top Toolbar Panel
// View switcher, center tools, export actions
// ═══════════════════════════════════════════════════════════════

import React from 'react'
import useCanvasStore from '../state/useCanvasStore'

export default function ToolbarTop({
    fabricRef,
    onUndo,
    onRedo,
    onDuplicate,
    onDelete,
    onBringForward,
    onSendBackward,
    onExport,
    onNavigateBack,
    canUndo,
    canRedo,
}) {
    const {
        canvasView, setCanvasView,
        activeTool, setActiveTool,
        showTextModal, setShowTextModal,
        showToast,
    } = useCanvasStore()

    return (
        <div className="ce-toolbar">
            <div className="ce-toolbar-left">
                <button className="ce-back-btn" onClick={onNavigateBack}>
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
            <div className="ce-toolbar-center">
                <button className={`ce-tool-btn ${activeTool === 'select' ? 'active' : ''}`}
                    onClick={() => setActiveTool('select')} title="Select (V)">
                    <span className="material-symbols-outlined">arrow_selector_tool</span>
                </button>
                <button className="ce-tool-btn" onClick={() => setShowTextModal(true)} title="Add Text (T)">
                    <span className="material-symbols-outlined">text_fields</span>
                </button>
                <div className="ce-divider" />
                <button className="ce-tool-btn" onClick={onUndo} disabled={!canUndo} title="Undo (⌘Z)">
                    <span className="material-symbols-outlined">undo</span>
                </button>
                <button className="ce-tool-btn" onClick={onRedo} disabled={!canRedo} title="Redo (⌘⇧Z)">
                    <span className="material-symbols-outlined">redo</span>
                </button>
                <div className="ce-divider" />
                <button className="ce-tool-btn" onClick={onDuplicate} title="Duplicate (⌘D)">
                    <span className="material-symbols-outlined">content_copy</span>
                </button>
                <button className="ce-tool-btn" onClick={onDelete} title="Delete (⌫)">
                    <span className="material-symbols-outlined">delete</span>
                </button>
                <div className="ce-divider" />
                <button className="ce-tool-btn" onClick={onBringForward} title="Bring Forward">
                    <span className="material-symbols-outlined">flip_to_front</span>
                </button>
                <button className="ce-tool-btn" onClick={onSendBackward} title="Send Backward">
                    <span className="material-symbols-outlined">flip_to_back</span>
                </button>
            </div>

            <div className="ce-toolbar-right">
                <button className="ce-tool-btn-label" onClick={() => onExport('png')}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>download</span>
                    PNG
                </button>
                <button className="ce-tool-btn-label" onClick={() => onExport('jpeg')}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>download</span>
                    JPG
                </button>
                <div className="ce-divider" />
                <button className="ce-save-btn" onClick={() => {
                    onExport('png')
                    showToast('✅ Saved & ready for campaign!')
                }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>check_circle</span>
                    Save & Use
                </button>
            </div>
        </div>
    )
}

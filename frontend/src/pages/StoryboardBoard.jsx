import React, { useState, useCallback, useRef, useEffect } from 'react'
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragOverlay,
} from '@dnd-kit/core'
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    rectSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import './StoryboardBoard.css'

// ── Scene Card (Sortable) ──
function SceneCard({ scene, index, onRemove, onEdit, onImageClick, brandColors }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: scene.id })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        borderColor: brandColors?.primary ? `${brandColors.primary}33` : undefined,
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`sb-card ${isDragging ? 'dragging' : ''}`}
            {...attributes}
            {...listeners}
        >
            {/* Image area */}
            <div className="sb-card-image" onClick={() => onImageClick?.(scene)}>
                {scene.imageUrl ? (
                    <img src={scene.imageUrl} alt={scene.caption || `Scene ${index + 1}`} draggable={false} />
                ) : (
                    <div className="sb-card-placeholder">
                        <span className="material-symbols-outlined">add_photo_alternate</span>
                        <span className="sb-card-placeholder-text">Drop image or generate</span>
                    </div>
                )}
                <div className="sb-card-badge">Scene {index + 1}</div>
                {scene.shotType && <div className="sb-card-shot-type">{scene.shotType}</div>}
            </div>

            {/* Metadata */}
            <div className="sb-card-meta">
                <div className="sb-card-caption">{scene.caption || `Scene ${index + 1}`}</div>
                {scene.shotDescription && (
                    <div className="sb-card-description">{scene.shotDescription}</div>
                )}
                {scene.duration && (
                    <div className="sb-card-duration">
                        <span className="material-symbols-outlined" style={{ fontSize: 12 }}>timer</span>
                        {scene.duration}s
                    </div>
                )}
            </div>

            {/* Actions */}
            <div className="sb-card-actions">
                <button onClick={(e) => { e.stopPropagation(); onEdit?.(scene) }} title="Edit scene">
                    <span className="material-symbols-outlined">edit</span>
                </button>
                <button onClick={(e) => { e.stopPropagation(); onRemove?.(scene.id) }} title="Remove scene">
                    <span className="material-symbols-outlined">close</span>
                </button>
            </div>
        </div>
    )
}

// ── Story Brief Panel ──
function StoryBrief({ brief, brandName }) {
    if (!brief) return null
    return (
        <div className="sb-brief">
            <div className="sb-brief-header">
                <span className="material-symbols-outlined">auto_stories</span>
                <span className="sb-brief-title">{brief.title || 'Story Brief'}</span>
                {brandName && <span className="sb-brief-brand">{brandName}</span>}
            </div>
            {brief.storyArc && <div className="sb-brief-arc"><strong>Story Arc:</strong> {brief.storyArc}</div>}
            {brief.synopsis && <div className="sb-brief-synopsis">{brief.synopsis}</div>}
            {brief.frames && (
                <div className="sb-brief-meta">{brief.frames} frames • {brief.style || 'Cinematic'}</div>
            )}
        </div>
    )
}

// ── Main Storyboard Board ──
export default function StoryboardBoard({
    scenes = [],
    onScenesChange,
    onSceneEdit,
    onSceneImageClick,
    storyBrief,
    brandContext,
    onSendToCanvas,
    onAddScene,
}) {
    const [activeId, setActiveId] = useState(null)
    const fileInputRef = useRef(null)

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    )

    const handleDragStart = useCallback((event) => {
        setActiveId(event.active.id)
    }, [])

    const handleDragEnd = useCallback((event) => {
        const { active, over } = event
        setActiveId(null)
        if (active.id !== over?.id) {
            const oldIndex = scenes.findIndex(s => s.id === active.id)
            const newIndex = scenes.findIndex(s => s.id === over.id)
            if (oldIndex !== -1 && newIndex !== -1) {
                onScenesChange?.(arrayMove(scenes, oldIndex, newIndex))
            }
        }
    }, [scenes, onScenesChange])

    const handleRemoveScene = useCallback((sceneId) => {
        onScenesChange?.(scenes.filter(s => s.id !== sceneId))
    }, [scenes, onScenesChange])

    // Handle file drop on the board
    const handleDrop = useCallback((e) => {
        e.preventDefault()
        e.stopPropagation()
        const files = Array.from(e.dataTransfer?.files || [])
        const urls = e.dataTransfer?.getData('text/uri-list')?.split('\n').filter(Boolean) || []

        // Handle image files
        files.filter(f => f.type.startsWith('image/')).forEach((file, i) => {
            const url = URL.createObjectURL(file)
            const newScene = {
                id: `scene-${Date.now()}-${i}`,
                imageUrl: url,
                caption: file.name.replace(/\.[^.]+$/, ''),
                shotType: '',
                shotDescription: '',
                duration: 5,
            }
            onScenesChange?.(prev => [...(Array.isArray(prev) ? prev : scenes), newScene])
        })

        // Handle URL drops  
        urls.forEach((url, i) => {
            const newScene = {
                id: `scene-${Date.now()}-url-${i}`,
                imageUrl: url,
                caption: `Dropped Image ${scenes.length + i + 1}`,
                shotType: '',
                shotDescription: '',
                duration: 5,
            }
            onScenesChange?.(prev => [...(Array.isArray(prev) ? prev : scenes), newScene])
        })
    }, [scenes, onScenesChange])

    const handleDragOver = useCallback((e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
    }, [])

    const activeScene = activeId ? scenes.find(s => s.id === activeId) : null
    const brandColors = brandContext?.brandColors || {}

    return (
        <div
            className="sb-board"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
        >
            {/* Story Brief */}
            <StoryBrief brief={storyBrief} brandName={brandContext?.brandName} />

            {/* Grid of scene cards */}
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
            >
                <SortableContext items={scenes.map(s => s.id)} strategy={rectSortingStrategy}>
                    <div className="sb-grid">
                        {scenes.map((scene, i) => (
                            <SceneCard
                                key={scene.id}
                                scene={scene}
                                index={i}
                                onRemove={handleRemoveScene}
                                onEdit={onSceneEdit}
                                onImageClick={onSceneImageClick}
                                brandColors={brandColors}
                            />
                        ))}

                        {/* Add scene card */}
                        <button className="sb-add-card" onClick={onAddScene}>
                            <span className="material-symbols-outlined">add</span>
                            <span>Add Scene</span>
                        </button>
                    </div>
                </SortableContext>

                <DragOverlay>
                    {activeScene ? (
                        <div className="sb-card dragging-overlay">
                            <div className="sb-card-image">
                                {activeScene.imageUrl ? (
                                    <img src={activeScene.imageUrl} alt="" draggable={false} />
                                ) : (
                                    <div className="sb-card-placeholder">
                                        <span className="material-symbols-outlined">photo</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : null}
                </DragOverlay>
            </DndContext>

            {/* Board footer actions */}
            {scenes.length > 0 && (
                <div className="sb-footer">
                    <div className="sb-footer-info">
                        {scenes.length} scene{scenes.length !== 1 ? 's' : ''} •{' '}
                        {scenes.filter(s => s.imageUrl).length} with images
                    </div>
                    <div className="sb-footer-actions">
                        <button className="sb-action-btn" onClick={onSendToCanvas} title="Open in Design Canvas">
                            <span className="material-symbols-outlined">brush</span>
                            Send to Canvas
                        </button>
                    </div>
                </div>
            )}

            {/* Empty state */}
            {scenes.length === 0 && !storyBrief && (
                <div className="sb-empty">
                    <span className="material-symbols-outlined" style={{ fontSize: 48, color: '#4f46e5', opacity: 0.4 }}>dashboard</span>
                    <h3>Your Storyboard</h3>
                    <p>Drop images here or ask Fidato to create a storyboard</p>
                    <p style={{ fontSize: 11, color: '#64748b' }}>Images will auto-arrange in a clean grid</p>
                </div>
            )}
        </div>
    )
}

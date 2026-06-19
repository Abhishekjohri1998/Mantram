/**
 * FlowCanvas.jsx — The primary React Flow canvas for the Canvas Copilot.
 *
 * This is the main workspace. Users directly manipulate nodes and edges here.
 * The canvas reads from useGraphStore and emits commands via useCommandBus.
 *
 * Supports:
 * - Drag to connect ports (typed, validated before commit)
 * - Right-click / + to open node menu
 * - Click to select (opens NodeInspector)
 * - Drag nodes to reposition (move_node command)
 * - Keyboard: Delete to remove selected, Ctrl+Z undo, Ctrl+Y redo
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    addEdge,
    useNodesState,
    useEdgesState,
    useReactFlow,
    Panel,
    BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import useGraphStore from '../state/useGraphStore';
import { useCommandBus } from '../state/useCommandBus';
import NodeMenu from './NodeMenu';

// Node type components
import VideoGenerateNode from './nodeTypes/VideoGenerateNode';
import TextInputNode     from './nodeTypes/TextInputNode';
import AssetInputNode    from './nodeTypes/AssetInputNode';
import ImageGenerateNode from './nodeTypes/ImageGenerateNode';
import PromptExpandNode  from './nodeTypes/PromptExpandNode';
import OutputNode        from './nodeTypes/OutputNode';
import ConcatNode        from './nodeTypes/ConcatNode';
import VoiceoverNode     from './nodeTypes/VoiceoverNode';
import CharacterRefNode  from './nodeTypes/CharacterRefNode';
import StyleRefNode      from './nodeTypes/StyleRefNode';
import BatchNode         from './nodeTypes/BatchNode';
import GenericNode       from './nodeTypes/GenericNode';
import ListNode          from './nodeTypes/ListNode';
import GroupNode         from './nodeTypes/GroupNode';
import StickyNoteNode    from './nodeTypes/StickyNoteNode';
import { getPortColor } from './nodeTypes/portColors';

const NODE_TYPES = {
    video_generate:    VideoGenerateNode,
    text_input:        TextInputNode,
    asset_input:       AssetInputNode,
    image_generate:    ImageGenerateNode,
    prompt_expand:     PromptExpandNode,
    output:            OutputNode,
    concat:            ConcatNode,
    stitch:            ConcatNode,
    voiceover:         VoiceoverNode,
    character_ref:     CharacterRefNode,
    style_ref:         StyleRefNode,
    batch:             BatchNode,
    list:              ListNode,
    group:             GroupNode,
    sticky_note:       StickyNoteNode,
    trim:              GenericNode,
    resize:            GenericNode,
    reframe:           GenericNode,
    upscale:           GenericNode,
    lipsync:           GenericNode,
    music_sfx:         GenericNode,
    frame_interpolate: GenericNode,
    assistant:         GenericNode,
    sound_effects:     GenericNode,
    video_audio_mix:   GenericNode,
    variations:        GenericNode,
    image_editor:      GenericNode,
    image_to_3d:       GenericNode,
    image_to_svg:      GenericNode,
    svg_generator:     GenericNode,
    svg_animation:     GenericNode,
    video_upscaler:    GenericNode,
    speak:             GenericNode,
    edit_video_modify: GenericNode,
    extract_frames:    GenericNode,
    sticker:           GenericNode,
    designer:          GenericNode,
    generic:           GenericNode,
};


// Positioning helper to prevent node stacking
function findNonOverlappingPosition(pos, existingNodes) {
    let currentX = pos.x;
    let currentY = pos.y;
    let foundCollision = true;

    while (foundCollision) {
        foundCollision = false;
        for (const n of existingNodes) {
            const dx = Math.abs(n.position.x - currentX);
            const dy = Math.abs(n.position.y - currentY);
            // Check for collision based on typical node dimensions (320px width, 240px height)
            if (dx < 320 && dy < 240) {
                currentX += 340; // Shift right to place side-by-side
                foundCollision = true;
                break;
            }
        }
    }
    return { x: currentX, y: currentY };
}

/** Convert our graph schema to React Flow nodes/edges */
function graphToFlow(graph) {
    if (!graph) return { nodes: [], edges: [] };
    const nodes = (graph.nodes || []).map(n => ({
        id: n.id,
        type: NODE_TYPES[n.type] ? n.type : 'generic',
        position: n.position || { x: 100, y: 100 },
        data: {
            ...n,
            label: n.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        },
        selected: false,
    }));
    const edges = (graph.edges || []).map(e => {
        const sourceNode = graph.nodes.find(n => n.id === e.from.node);
        const sourcePort = sourceNode?.ports?.outputs?.find(p => p.id === e.from.port);
        const portType = sourcePort?.type;
        const color = getPortColor(portType);
        return {
            id: e.id,
            source: e.from.node,
            sourceHandle: e.from.port,
            target: e.to.node,
            targetHandle: e.to.port,
            style: {
                stroke: color || 'var(--sys-border-strong, #6366f155)',
                strokeWidth: 2,
            },
            animated: portType === 'asset_list',
            type: 'smoothstep',
            data: { author: e.author },
        };
    });
    return { nodes, edges };
}

export default function FlowCanvas({ onNodeSelect, onCanvasClick }) {
    const store = useGraphStore();
    const { emit, undo, redo } = useCommandBus();
    const { screenToFlowPosition } = useReactFlow();

    const [rfNodes, setRfNodes, onNodesChange] = useNodesState([]);
    const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState([]);
    const [nodeMenuPos, setNodeMenuPos] = useState(null); // { x, y, canvasX, canvasY }

    const containerRef = useRef(null);

    // Sync React Flow state from graph store
    useEffect(() => {
        if (!store.graph) return;
        const { nodes, edges } = graphToFlow(store.graph);
        setRfNodes(nodes);
        setRfEdges(edges);
    }, [store.graph]); // eslint-disable-line

    // Keyboard shortcuts
    useEffect(() => {
        const handler = (e) => {
            const tag = document.activeElement?.tagName;
            // Don't intercept when typing in any input/textarea field
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

            if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
            if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
            if (e.key === 'Delete' || e.key === 'Backspace') {
                // Only fire if focus is on the canvas area (not inside a node input)
                const activeEl = document.activeElement;
                const isCanvasFocused =
                    !activeEl ||
                    activeEl === document.body ||
                    activeEl === containerRef.current ||
                    activeEl?.closest('.flow-canvas-container');
                if (!isCanvasFocused) return;

                e.preventDefault();
                const { selectedNodeId, selectedEdgeId } = useGraphStore.getState();
                if (selectedNodeId) {
                    emit({ type: 'delete_node', payload: { nodeId: selectedNodeId }, author: 'user' });
                    useGraphStore.getState().clearSelection();
                }
                if (selectedEdgeId) {
                    emit({ type: 'disconnect', payload: { edgeId: selectedEdgeId }, author: 'user' });
                    useGraphStore.getState().clearSelection();
                }
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [emit, undo, redo]);

    // Node drag end → emit move_node
    const onNodeDragStop = useCallback((_evt, node) => {
        emit({
            type: 'move_node',
            payload: { nodeId: node.id, position: node.position },
            author: 'user',
        });
    }, [emit]);

    // Port drag → connect
    const onConnect = useCallback(async (connection) => {
        const result = await emit({
            type: 'connect',
            payload: {
                from: { node: connection.source, port: connection.sourceHandle },
                to:   { node: connection.target, port: connection.targetHandle },
            },
            author: 'user',
        });
        if (!result.ok) {
            const hint = result.suggestion ? ` (${result.suggestion})` : '';
            store.setError(`Connection rejected: ${result.error}${hint}`);
            // Auto-clear error after 4s
            setTimeout(() => store.setError(null), 4000);
        }
    }, [emit, store]);

    // Edge delete — resolve REAL server edge ID before emitting disconnect
    // React Flow edge IDs may be 'e_temp_...' from optimistic adds; we must
    // match by source/target/handle to find the actual server-assigned ID.
    const onEdgesDelete = useCallback((edges) => {
        const graphEdges = useGraphStore.getState().graph?.edges || [];
        edges.forEach(rfEdge => {
            // Try exact ID match first
            let serverEdge = graphEdges.find(e => e.id === rfEdge.id);
            // Fallback: match by topology
            if (!serverEdge) {
                serverEdge = graphEdges.find(e =>
                    e.from.node === rfEdge.source &&
                    e.from.port === rfEdge.sourceHandle &&
                    e.to.node   === rfEdge.target &&
                    e.to.port   === rfEdge.targetHandle
                );
            }
            if (serverEdge) {
                emit({ type: 'disconnect', payload: { edgeId: serverEdge.id }, author: 'user' });
            } else {
                console.warn('[FlowCanvas] Could not resolve server edge for RF edge', rfEdge.id);
            }
        });
    }, [emit]);

    // Node select — also focuses the canvas container so Delete key works
    const onNodeClick = useCallback((evt, node) => {
        store.selectNode(node.id);
        onNodeSelect?.(node.data);
        // Only bring canvas container into focus if they didn't click an input, button, select, handle, etc.
        const isInputOrInteractive = evt?.target?.closest('input, textarea, select, button, [contenteditable="true"], .nodrag, .react-flow__handle');
        if (!isInputOrInteractive) {
            containerRef.current?.focus({ preventScroll: true });
        }
    }, [store, onNodeSelect]);

    const onEdgeClick = useCallback((_evt, edge) => {
        store.selectEdge(edge.id);
    }, [store]);

    const onPaneClick = useCallback(() => {
        store.clearSelection();
        setNodeMenuPos(null);
        onCanvasClick?.();
    }, [store, onCanvasClick]);

    // Right-click → node menu
    const onPaneContextMenu = useCallback((evt) => {
        evt.preventDefault();
        const rect = containerRef.current?.getBoundingClientRect();
        setNodeMenuPos({
            x: evt.clientX - (rect?.left || 0),
            y: evt.clientY - (rect?.top || 0),
            clientX: evt.clientX,
            clientY: evt.clientY,
        });
    }, []);

    return (
        <div
            ref={containerRef}
            className="flow-canvas-container"
            tabIndex={0}
            style={{ outline: 'none' }}
            onClick={(e) => {
                // Focus container only if click target isn't inside input/textarea/select/button/nodrag/handle
                const isInputOrInteractive = e.target.closest('input, textarea, select, button, [contenteditable="true"], .nodrag, .react-flow__handle');
                if (!isInputOrInteractive) {
                    containerRef.current?.focus({ preventScroll: true });
                }
            }}
        >
            <ReactFlow
                nodes={rfNodes}
                edges={rfEdges}
                nodeTypes={NODE_TYPES}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeDragStop={onNodeDragStop}
                onNodeClick={onNodeClick}
                onEdgeClick={onEdgeClick}
                onPaneClick={onPaneClick}
                onPaneContextMenu={onPaneContextMenu}
                onEdgesDelete={onEdgesDelete}
                defaultViewport={{ x: 80, y: 80, zoom: 1 }}
                deleteKeyCode={null} // handled manually via keyboard handler
                minZoom={0.2}
                maxZoom={2.5}
                defaultEdgeOptions={{
                    style: { stroke: 'var(--sys-border-strong,#6366f155)', strokeWidth: 1.5 },
                    type: 'smoothstep',
                }}
                connectionLineStyle={{ stroke: '#FF4D00', strokeWidth: 2, strokeDasharray: '6 4' }}
                connectionLineType="smoothstep"
                elevateEdgesOnSelect
            >
                <Background
                    variant={BackgroundVariant.Dots}
                    gap={22}
                    size={1.2}
                    color="var(--sys-border, #ffffff0a)"
                    style={{ opacity: 0.35 }}
                />
                <Controls />
                <MiniMap
                    nodeColor={(n) => {
                        const state = n.data?.state || 'idle';
                        const stateColors = {
                            idle: 'var(--sys-border-strong,#4a4a6a)',
                            queued: '#f59e0b', running: '#818cf8',
                            done: '#10b981', error: '#ef4444',
                            cached: '#06b6d4', stale: '#a78bfa',
                        };
                        return stateColors[state] || 'var(--sys-border-strong,#4a4a6a)';
                    }}
                    maskColor="rgba(0,0,0,0.2)"
                />

                {/* Floating + button */}
                <Panel position="top-left">
                    <button
                        className="canvas-add-btn"
                        onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            const rect = e.currentTarget.getBoundingClientRect();
                            setNodeMenuPos({ x: rect.right + 8, y: rect.top, clientX: rect.right + 8, clientY: rect.top });
                        }}
                        title="Add node (or right-click canvas)"
                    >
                        ＋ Add Node
                    </button>
                </Panel>
            </ReactFlow>

            {/* Node context menu */}
            {nodeMenuPos && (
                <NodeMenu
                    position={nodeMenuPos}
                    onSelect={(type) => {
                        setNodeMenuPos(null);
                        const flowPos = screenToFlowPosition({
                            x: nodeMenuPos.clientX,
                            y: nodeMenuPos.clientY
                        });
                        const targetPos = { x: flowPos.x - 80, y: flowPos.y - 20 };
                        const nonOverlappingPos = findNonOverlappingPosition(targetPos, rfNodes);
                        emit({
                            type: 'add_node',
                            payload: { type, position: nonOverlappingPos },
                            author: 'user',
                        });
                    }}
                    onClose={() => setNodeMenuPos(null)}
                />
            )}
        </div>
    );
}

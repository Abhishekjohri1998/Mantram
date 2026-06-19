/**
 * useGraphStore.js — Zustand store: single source of truth for the canvas graph.
 *
 * The graph in this store is always a snapshot of the server's graph.
 * Mutations go through useCommandBus.js which handles optimistic updates,
 * server validation, and rollback on rejection.
 */

import { create } from 'zustand';

const useGraphStore = create((set, get) => ({
    // ── Graph state ────────────────────────────────────────────────────────
    graph: null,          // full graph object from server
    version: 0,
    sessionId: null,
    isLoading: false,
    error: null,
    nodeCatalog: null,    // authoritative backend node catalog

    // ── Selection ─────────────────────────────────────────────────────────
    selectedNodeId: null,
    selectedEdgeId: null,

    // ── Run state ─────────────────────────────────────────────────────────
    activeRunId: null,
    runStatus: null,       // 'running' | 'completed' | 'cancelled' | 'failed' | null
    creditGate: null,      // { estimate, billedNodes, warnings } when gated

    // ── Copilot dock ──────────────────────────────────────────────────────
    isDockOpen: true,
    messages: [],          // { role: 'user'|'agent', content, ts, typing? }
    copilotBusy: false,

    // ── Actions ───────────────────────────────────────────────────────────

    setSessionId: (sessionId) => set({ sessionId }),

    setNodeCatalog: (nodeCatalog) => set({ nodeCatalog }),

    setGraph: (graph) => set({
        graph,
        version: graph?.version ?? 0,
        isLoading: false,
        error: null,
    }),

    // Patch only the nodes + edges + version (from SSE diff)
    patchGraph: ({ nodes, edges, newVersion }) => set(state => ({
        graph: state.graph ? { ...state.graph, nodes, edges, version: newVersion } : null,
        version: newVersion ?? state.version,
    })),

    // Update a single node's state (from SSE node_state events)
    updateNodeState: (nodeId, updates) => set(state => {
        if (!state.graph) return {};
        const nodes = state.graph.nodes.map(n =>
            n.id === nodeId ? { ...n, ...updates } : n
        );
        return { graph: { ...state.graph, nodes } };
    }),

    setLoading: (isLoading) => set({ isLoading }),
    setError: (error) => set({ error, isLoading: false }),

    selectNode: (nodeId) => set({ selectedNodeId: nodeId, selectedEdgeId: null }),
    selectEdge: (edgeId) => set({ selectedEdgeId: edgeId, selectedNodeId: null }),
    clearSelection: () => set({ selectedNodeId: null, selectedEdgeId: null }),

    setActiveRun: (runId, status) => set({ activeRunId: runId, runStatus: status }),
    setCreditGate: (gate) => set({ creditGate: gate }),
    clearRun: () => set({ activeRunId: null, runStatus: null, creditGate: null }),

    toggleDock: () => set(s => ({ isDockOpen: !s.isDockOpen })),
    setDockOpen: (open) => set({ isDockOpen: open }),

    addMessage: (msg) => set(s => ({
        messages: [...s.messages, { ...msg, ts: Date.now() }]
    })),
    setCopilotBusy: (busy) => set({ copilotBusy: busy }),

    // Optimistic add node (before server confirmation)
    optimisticAddNode: (node) => set(state => {
        if (!state.graph) return {};
        return { graph: { ...state.graph, nodes: [...state.graph.nodes, node] } };
    }),

    // Optimistic add edge
    optimisticAddEdge: (edge) => set(state => {
        if (!state.graph) return {};
        return { graph: { ...state.graph, edges: [...state.graph.edges, edge] } };
    }),

    // Rollback: replace graph entirely (on command rejection)
    rollbackGraph: (previousGraph) => set({ graph: previousGraph }),
}));

export default useGraphStore;

/**
 * useCommandBus.js — Hook: emit Command Bus commands with optimistic UI.
 *
 * Flow:
 * 1. Snapshot current graph (for rollback).
 * 2. Apply optimistic update to Zustand store immediately (instant UI).
 * 3. Send command to server.
 * 4. On server rejection → rollback to snapshot + show error.
 * 5. On server success → patch store with authoritative server response.
 * 6. All server diffs are also received via SSE (useGraphSSE) which patches the store.
 */

import { useCallback } from 'react';
import useGraphStore from './useGraphStore';
import { apiFetch } from '../../../../services/api';

export function useCommandBus() {
    const store = useGraphStore();

    /**
     * Emit a single command. Returns { ok, error? }
     */
    const emit = useCallback(async (command) => {
        const { graph, sessionId, version } = useGraphStore.getState();
        if (!graph || !sessionId) return { ok: false, error: 'No active graph session' };

        // Snapshot for rollback
        const snapshot = JSON.parse(JSON.stringify(graph));

        // Optimistic update — apply locally before server round-trip
        _applyOptimistic(command, store);

        try {
            const result = await apiFetch(
                `/video-studio/agent/v2/graph/${sessionId}/command`,
                {
                    method: 'POST',
                    body: JSON.stringify({ command, baseVersion: version, commandId: `cmd_${Date.now()}` })
                }
            );

            if (!result.success) {
                // Server rejected — rollback
                store.rollbackGraph(snapshot);
                console.warn('[CommandBus] Rejected:', result.message || result.code);
                return { ok: false, error: result.message, code: result.code, suggestion: result.suggestion };
            }

            // Server accepted — update store with authoritative server response graph immediately
            // to resolve temporary IDs to persistent IDs without waiting for SSE latency.
            if (result.graph) {
                store.setGraph(result.graph);
            }
            return { ok: true, version: result.version };
        } catch (err) {
            store.rollbackGraph(snapshot);
            return { ok: false, error: err.message };
        }
    }, [store]);

    /**
     * Emit a batch of commands atomically. Returns { ok, failedAtIndex?, error? }
     */
    const emitBatch = useCallback(async (commands, author = 'agent') => {
        const { graph, sessionId, version } = useGraphStore.getState();
        if (!graph || !sessionId) return { ok: false, error: 'No active graph session' };

        const snapshot = JSON.parse(JSON.stringify(graph));

        // Optimistic: apply all
        for (const cmd of commands) _applyOptimistic(cmd, store);

        try {
            const result = await apiFetch(
                `/video-studio/agent/v2/graph/${sessionId}/commands`,
                {
                    method: 'POST',
                    body: JSON.stringify({ commands, baseVersion: version, author })
                }
            );

            if (!result.success) {
                store.rollbackGraph(snapshot);
                return {
                    ok: false,
                    failedAtIndex: result.failedAtIndex,
                    error: result.message,
                    code: result.code,
                    suggestion: result.suggestion,
                };
            }

            return { ok: true, version: result.version, appliedCount: result.appliedCount };
        } catch (err) {
            store.rollbackGraph(snapshot);
            return { ok: false, error: err.message };
        }
    }, [store]);

    const undo = useCallback(async () => {
        const { sessionId } = useGraphStore.getState();
        if (!sessionId) return;
        const result = await apiFetch(`/video-studio/agent/v2/graph/${sessionId}/undo`, { method: 'POST' });
        if (!result.success) console.warn('[CommandBus] Undo failed:', result.error);
        return result;
    }, []);

    const redo = useCallback(async () => {
        const { sessionId } = useGraphStore.getState();
        if (!sessionId) return;
        const result = await apiFetch(`/video-studio/agent/v2/graph/${sessionId}/redo`, { method: 'POST' });
        if (!result.success) console.warn('[CommandBus] Redo failed:', result.error);
        return result;
    }, []);

    return { emit, emitBatch, undo, redo };
}

// ── Optimistic local updater ─────────────────────────────────────────────────
function _applyOptimistic(command, store) {
    const { type, payload } = command;
    const state = useGraphStore.getState();
    const graph = state.graph;
    if (!graph) return;

    switch (type) {
        case 'add_node': {
            const newNode = {
                id: payload._tempId || `n_temp_${Date.now()}`,
                type: payload.type,
                position: payload.position || { x: 200, y: 200 },
                params: payload.params || {},
                state: 'idle',
                outputRef: null,
                author: command.author || 'user',
                error: null,
                ports: { inputs: [], outputs: [] }, // will be populated from catalog
            };
            store.optimisticAddNode(newNode);
            break;
        }
        case 'connect': {
            const newEdge = {
                id: `e_temp_${Date.now()}`,
                from: payload.from,
                to: payload.to,
                author: command.author || 'user',
            };
            store.optimisticAddEdge(newEdge);
            break;
        }
        case 'update_params': {
            store.updateNodeState(payload.nodeId, { params: { ...graph.nodes.find(n => n.id === payload.nodeId)?.params, ...payload.params } });
            break;
        }
        case 'move_node': {
            store.updateNodeState(payload.nodeId, { position: payload.position });
            break;
        }
        case 'delete_node': {
            const nodes = graph.nodes.filter(n => n.id !== payload.nodeId);
            const edges = graph.edges.filter(e => e.from.node !== payload.nodeId && e.to.node !== payload.nodeId);
            store.patchGraph({ nodes, edges, newVersion: state.version });
            break;
        }
        case 'disconnect': {
            const edges = graph.edges.filter(e => e.id !== payload.edgeId);
            store.patchGraph({ nodes: graph.nodes, edges, newVersion: state.version });
            break;
        }
        default: break;
    }
}

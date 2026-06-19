/**
 * useGraphSSE.js — Subscribes to the server-sent graph diff stream.
 *
 * On mount: connects to /agent/v2/graph/:sessionId/stream
 * On graph_init: initializes the store with the full graph
 * On graph_diff / graph_bulk: patches the store with the new nodes/edges
 * On node_state: updates individual node states (for live execution)
 * On reconnect: handles exponential backoff
 */

import { useEffect, useRef } from 'react';
import useGraphStore from './useGraphStore';

const API_BASE = (import.meta.env.VITE_API_URL || `${window.location.origin}/api`).replace(/\/$/, '');

function getToken() {
    return (localStorage.getItem('mantram_token') || '').replace(/[\s\r\n\t]+/g, '');
}

export function useGraphSSE(sessionId) {
    const store = useGraphStore();
    const esRef = useRef(null);
    const retryRef = useRef(0);
    const mountedRef = useRef(true);

    useEffect(() => {
        if (!sessionId) return;
        mountedRef.current = true;

        function connect() {
            if (!mountedRef.current) return;

            const token = getToken();
            const rawUrl = `${API_BASE}/video-studio/agent/v2/graph/${sessionId}/stream?token=${encodeURIComponent(token)}`;
            
            // Resolve relative URLs to absolute URLs based on window origin to prevent Safari/WebKit throwing DOMException
            let absoluteUrl;
            try {
                absoluteUrl = new URL(rawUrl, window.location.origin).toString();
            } catch (urlErr) {
                console.error('[GraphSSE] Failed to construct absolute URL:', urlErr);
                store.setError(`URL error: ${urlErr.message}`);
                return;
            }

            let es;
            try {
                es = new EventSource(absoluteUrl);
                esRef.current = es;
            } catch (err) {
                console.error('[GraphSSE] Failed to initialize EventSource:', err);
                store.setError(`SSE connection error: ${err.message}`);
                return;
            }

            es.onopen = () => {
                retryRef.current = 0;
                console.log('[GraphSSE] Connected for session', sessionId);
            };

            es.onmessage = (evt) => {
                if (!mountedRef.current) return;
                try {
                    const event = JSON.parse(evt.data);
                    handleEvent(event, store);
                } catch {}
            };

            es.onerror = () => {
                es.close();
                if (!mountedRef.current) return;
                // Exponential backoff: 1s → 2s → 4s → 8s → capped at 30s
                const delay = Math.min(1000 * Math.pow(2, retryRef.current), 30000);
                retryRef.current++;
                console.log(`[GraphSSE] Disconnected. Retrying in ${delay}ms...`);
                setTimeout(connect, delay);
            };
        }

        connect();

        return () => {
            mountedRef.current = false;
            esRef.current?.close();
        };
    }, [sessionId]); // eslint-disable-line
}

function handleEvent(event, store) {
    switch (event.type) {
        case 'graph_init':
            // Full graph on connect — initialize the store
            store.setGraph(event.graph);
            break;

        case 'graph_diff':
        case 'graph_bulk':
        case 'graph_undo':
        case 'graph_redo':
            // Partial or full patch from command application
            store.patchGraph({
                nodes: event.nodes,
                edges: event.edges,
                newVersion: event.newVersion,
            });
            break;

        case 'node_state':
            // Individual node status update during execution
            store.updateNodeState(event.nodeId, {
                state: event.state,
                outputRef: event.outputRef ?? undefined,
                error: event.error ?? null,
                params: event.params ?? undefined,
            });
            break;

        case 'run_started':
            store.setActiveRun(event.runId, 'running');
            break;

        case 'run_complete':
            store.setActiveRun(event.runId, 'completed');
            setTimeout(() => store.clearRun(), 3000);
            break;

        case 'run_cancelled':
            store.setActiveRun(event.runId, 'cancelled');
            setTimeout(() => store.clearRun(), 2000);
            break;

        case 'run_error':
            store.setActiveRun(event.runId, 'failed');
            store.setError(event.error);
            break;

        default:
            break;
    }
}

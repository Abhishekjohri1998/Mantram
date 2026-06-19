/**
 * CanvasCopilot/index.jsx — Root Canvas Copilot component.
 *
 * Layout:
 *   TopBar
 *   ├── FlowCanvas (primary workspace)
 *   ├── NodeInspector (slides in when node selected)
 *   └── CopilotDock (right side panel, collapsible)
 *
 * Responsibilities:
 * - Initialize / load the graph for the current session
 * - Subscribe to SSE diffs
 * - Provide keyboard shortcuts context
 */

import { useEffect, useCallback } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './CanvasCopilot.css';

import useGraphStore from './state/useGraphStore';
import { useGraphSSE } from './state/useGraphSSE';
import FlowCanvas from './canvas/FlowCanvas';
import NodeInspector from './canvas/NodeInspector';
import CopilotDock from './copilot/CopilotDock';
import TopBar from './controls/TopBar';
import { apiFetch } from '../../../services/api';


export default function CanvasCopilot({ sessionId: propSessionId, projectName, userCredits }) {
    const store = useGraphStore();

    const sessionId = propSessionId
        || localStorage.getItem('last_canvas_session_id')
        || (() => {
            const newSid = `vas_canvas_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
            localStorage.setItem('last_canvas_session_id', newSid);
            return newSid;
        })();

    // Set active session
    useEffect(() => {
        if (sessionId) store.setSessionId(sessionId);
    }, [sessionId]); // eslint-disable-line

    // Subscribe to SSE graph diffs
    useGraphSSE(sessionId);

    // Initialize graph (idempotent — creates if not exists)
    useEffect(() => {
        if (!sessionId) return;
        store.setLoading(true);

        apiFetch('/video-studio/agent/v2/graph/init', {
            method: 'POST',
            body: JSON.stringify({ sessionId }),
        })
            .then(data => {
                if (data.success) {
                    store.setGraph(data.graph);
                } else {
                    store.setError(data.error || 'Failed to load canvas');
                }
            })
            .catch(err => store.setError(err.message));

        // Fetch authoritative node catalog
        apiFetch('/video-studio/agent/v2/node-catalog')
            .then(data => {
                if (data.success) {
                    store.setNodeCatalog(data.catalog);
                }
            })
            .catch(err => console.error('Failed to load node catalog:', err));
    }, [sessionId]); // eslint-disable-line

    const handleRunNode = useCallback((nodeId) => {
        if (!sessionId) return;

        apiFetch(`/video-studio/agent/v2/graph/${sessionId}/run`, {
            method: 'POST',
            body: JSON.stringify({ fromNodeId: nodeId, confirmed: false }),
        })
            .then(data => {
                if (data.gated)        store.setCreditGate(data);
                else if (data.success) store.setActiveRun(data.runId, 'running');
            })
            .catch(err => store.setError(err.message));
    }, [sessionId]); // eslint-disable-line

    return (
        <ReactFlowProvider>
            <div className="canvas-copilot">
                {/* Top bar */}
                <TopBar projectName={projectName} userCredits={userCredits} />

                {/* Main workspace */}
                <div className="canvas-copilot__workspace">
                    {/* Canvas — primary surface */}
                    <div className="canvas-copilot__canvas">

                        {/* Loading overlay */}
                        {store.isLoading && !store.graph && (
                            <div className="canvas-loading">
                                <div className="canvas-loading__spinner" />
                                <span className="canvas-loading__label">Loading canvas…</span>
                            </div>
                        )}

                        <FlowCanvas
                            onNodeSelect={(nodeData) => store.selectNode(nodeData?.id)}
                        />

                        {/* Error banner */}
                        {store.error && (
                            <div className="canvas-error-banner">
                                <span>⚠</span>
                                <span>{store.error}</span>
                            </div>
                        )}
                    </div>

                    {/* Node Inspector is disabled since all editing is inline on the nodes directly */}

                    {/* Copilot Dock */}
                    <CopilotDock sessionId={sessionId} />
                </div>
            </div>
        </ReactFlowProvider>
    );
}

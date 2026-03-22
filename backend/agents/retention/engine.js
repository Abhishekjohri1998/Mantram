/**
 * Retention Studio — Pipeline Engine
 * 
 * State Machine orchestrator for the 5-node retention pipeline.
 * Follows the same pattern as performanceMarketing/engine.js
 */

import {
    dataIngestNode,
    matchEnrichNode,
    creativeDesignNode,
    mailerComposeNode,
    sendTrackNode,
} from './nodes.js';

// ── Pipeline definition ──
const PIPELINE = [
    { id: 'ingest',   name: 'Data Ingest',      node: dataIngestNode },
    { id: 'match',    name: 'Match & Enrich',    node: matchEnrichNode },
    { id: 'creative', name: 'Creative Design',   node: creativeDesignNode },
    { id: 'compose',  name: 'Mailer Compose',    node: mailerComposeNode },
    { id: 'send',     name: 'Send & Track',      node: sendTrackNode },
];

/**
 * Run a single node by ID
 */
export async function runNode(nodeId, state) {
    const step = PIPELINE.find(p => p.id === nodeId);
    if (!step) throw new Error(`Unknown retention node: ${nodeId}`);

    console.log(`⚡ Retention Engine: Running node "${step.name}"...`);
    const startTime = Date.now();

    const updatedState = await step.node(state);

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ Retention Engine: "${step.name}" completed in ${duration}s`);

    return updatedState;
}

/**
 * Run the full pipeline from a starting node to an ending node
 * Supports human gates (stops after match, creative, compose for review)
 */
export async function runPipeline(state, { from = 'ingest', to = null, stopAfter = null } = {}) {
    const startIdx = PIPELINE.findIndex(p => p.id === from);
    if (startIdx === -1) throw new Error(`Unknown start node: ${from}`);

    let currentState = { ...state };

    for (let i = startIdx; i < PIPELINE.length; i++) {
        const step = PIPELINE[i];

        currentState = await runNode(step.id, currentState);

        // Stop after this node if requested (human gate)
        if (stopAfter && step.id === stopAfter) {
            console.log(`🛑 Retention Engine: Paused at "${step.name}" for review`);
            break;
        }

        // Stop at target node
        if (to && step.id === to) {
            break;
        }
    }

    return currentState;
}

/**
 * Get pipeline metadata
 */
export function getPipelineInfo() {
    return PIPELINE.map(p => ({ id: p.id, name: p.name }));
}

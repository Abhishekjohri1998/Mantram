/**
 * progressStore.js — In-memory progress tracker for agentic pipelines
 * 
 * Allows backend pipeline nodes to emit progress steps that the frontend
 * can poll in real-time to show live agent activity.
 */

// Map<requestId, { steps[], startedAt, updatedAt }>
const store = new Map();

// Auto-cleanup old entries after 5 minutes
const TTL_MS = 5 * 60 * 1000;
setInterval(() => {
    const now = Date.now();
    for (const [id, entry] of store) {
        if (now - entry.updatedAt > TTL_MS) store.delete(id);
    }
}, 60_000);

/**
 * Start tracking a new request
 */
export function startProgress(requestId) {
    store.set(requestId, {
        steps: [],
        startedAt: Date.now(),
        updatedAt: Date.now(),
    });
}

/**
 * Add a progress step
 * @param {string} requestId
 * @param {object} step - { agent, message, status, detail? }
 *   agent: 'brand-intel' | 'art-director' | 'prompt-engineer' | 'image-inject' | 'generating' | 'complete'
 *   message: Human-readable message
 *   status: 'working' | 'done' | 'error'
 *   detail: Optional extra detail string
 */
export function addStep(requestId, step) {
    const entry = store.get(requestId);
    if (!entry) return;

    // If there's a previous step with status 'working', mark it done
    const existing = entry.steps.find(s => s.agent === step.agent && s.status === 'working');
    if (existing && step.status === 'done') {
        existing.status = 'done';
        existing.message = step.message;
        existing.detail = step.detail || existing.detail;
        existing.doneAt = Date.now();
        existing.durationMs = existing.doneAt - existing.startedAt;
    } else {
        entry.steps.push({
            ...step,
            startedAt: Date.now(),
            doneAt: step.status === 'done' ? Date.now() : null,
            durationMs: 0,
        });
    }
    entry.updatedAt = Date.now();
}

/**
 * Get current progress for a request
 */
export function getProgress(requestId) {
    const entry = store.get(requestId);
    if (!entry) return null;
    return {
        steps: entry.steps,
        startedAt: entry.startedAt,
        elapsedMs: Date.now() - entry.startedAt,
    };
}

/**
 * Clean up a completed request
 */
export function endProgress(requestId) {
    // Keep for a bit so frontend can read the final state
    setTimeout(() => store.delete(requestId), 30_000);
}

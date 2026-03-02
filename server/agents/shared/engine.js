/**
 * Shared Agentic Engine — Reusable State Machine
 * 
 * Generic pipeline engine used by ALL studios (Video, Content, Creative).
 * Each studio defines its own pipeline steps and node functions.
 * 
 * Concepts (mirroring LangGraph):
 *   - State: JSON object flowing through nodes
 *   - Nodes: Functions that process state
 *   - Edges: Step-to-step transitions
 *   - Checkpoints: Save to MongoDB after each node
 *   - Human-in-the-loop: Gates that pause for user approval
 */

/**
 * Create a new pipeline definition
 * @param {Array} steps - [{ id, next, humanGate }]
 * @returns {Object} Pipeline operations
 */
export function createPipeline(steps) {
    function getStep(stepId) {
        return steps.find(s => s.id === stepId);
    }

    function getStepIndex(stepId) {
        return steps.findIndex(s => s.id === stepId);
    }

    function getPipelineInfo(status) {
        const currentIndex = getStepIndex(status);
        return {
            currentStep: status,
            currentIndex,
            totalSteps: steps.length,
            progress: Math.round(((currentIndex + 1) / steps.length) * 100),
            isWaitingForHuman: getStep(status)?.humanGate || false,
            nextStep: getStep(status)?.next || 'done',
            steps: steps.map(s => ({ id: s.id, completed: getStepIndex(s.id) < currentIndex })),
        };
    }

    return { getStep, getStepIndex, getPipelineInfo, steps };
}

/**
 * Run a single pipeline step — generic across all studios
 * @param {Object} Model - Mongoose model to save state
 * @param {string} docId - Document ID
 * @param {string} stepId - Current step
 * @param {Function} nodeFunction - Agent node to execute
 * @param {Object} extraInput - Additional inputs
 * @param {Function} stateMapper - Converts doc → state
 * @param {Function} stateSaver - Saves state → doc
 */
export async function runPipelineStep({
    Model, docId, stepId, nodeFunction, extraInput = {},
    stateMapper, stateSaver, pipeline
}) {
    const doc = await Model.findById(docId);
    if (!doc) throw new Error(`Document not found: ${docId}`);

    console.log(`🔄 Engine: Running step "${stepId}" for ${Model.modelName} ${docId}`);

    // Build state from document
    const state = stateMapper(doc);
    Object.assign(state, extraInput);

    // Execute agent node
    const updatedState = await nodeFunction(state);

    // Save back
    await stateSaver(docId, stepId, updatedState, pipeline);

    return updatedState;
}

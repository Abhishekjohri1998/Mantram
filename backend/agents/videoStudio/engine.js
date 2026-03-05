/**
 * Video Studio — State Machine Engine (LangGraph-style)
 * 
 * A lightweight state-machine that mirrors LangGraph concepts:
 *   - Nodes: Functions that process state
 *   - Edges: Deterministic flow between nodes
 *   - State: Single JSON object flowing through pipeline
 *   - Checkpoints: Save to MongoDB after each node
 *   - Human-in-the-loop: Pause at approval points
 * 
 * Flow: brainstorm → [HUMAN] → script → [HUMAN] → references → routing → [HUMAN] → generate → critique → [HUMAN] → edit → done
 */

import VideoProject from '../../models/VideoProject.js';

// ── Pipeline Definition ──
// Each step defines: node function name, next step, whether it needs human approval
const PIPELINE = [
    { id: 'brainstorm', next: 'script', humanGate: true },       // Pause: user picks concept
    { id: 'script', next: 'references', humanGate: true },       // Pause: user approves script
    { id: 'references', next: 'routing', humanGate: false },     // Auto-flow
    { id: 'routing', next: 'generating', humanGate: true },      // Pause: user confirms cost
    { id: 'generating', next: 'critique', humanGate: false },    // Auto-flow (async polling)
    { id: 'critique', next: 'editing', humanGate: true },        // Pause: user accepts or edits
    { id: 'editing', next: 'done', humanGate: false },           // Auto-flow
];

/**
 * Get the pipeline step definition by ID
 */
function getStep(stepId) {
    return PIPELINE.find(s => s.id === stepId);
}

/**
 * Run a single pipeline step
 * @param {string} projectId - VideoProject._id
 * @param {string} stepId - which step to run (e.g. 'brainstorm')
 * @param {Function} nodeFunction - the agent node function to execute
 * @param {Object} extraInput - any additional input (e.g. user selections)
 * @returns {Object} updated project state
 */
export async function runStep(projectId, stepId, nodeFunction, extraInput = {}) {
    // Load current project state
    const project = await VideoProject.findById(projectId);
    if (!project) throw new Error(`Video project not found: ${projectId}`);

    console.log(`🎬 Engine: Running step "${stepId}" for project ${projectId}`);

    // Build state object from project
    const state = projectToState(project);

    // Merge any extra input (user selections, edits, etc.)
    Object.assign(state, extraInput);

    // Execute the node function
    const updatedState = await nodeFunction(state);

    // Save updated state back to project
    await saveStateToProject(projectId, stepId, updatedState);

    // Check if we should auto-advance to next step
    const step = getStep(stepId);
    if (step && !step.humanGate && step.next && step.next !== 'done') {
        // Don't auto-advance generating (async) or steps that need the nodeFunction
        if (stepId !== 'generating') {
            console.log(`🎬 Engine: Auto-advancing to "${step.next}"`);
        }
    }

    return updatedState;
}

/**
 * Advance to the next step after human approval
 * @param {string} projectId
 * @param {Object} humanInput - user's selections/edits
 * @param {Function} nextNodeFunction - the next node to run
 */
export async function advanceWithApproval(projectId, humanInput, nextNodeFunction) {
    const project = await VideoProject.findById(projectId);
    if (!project) throw new Error(`Video project not found: ${projectId}`);

    const currentStep = getStep(project.status);
    if (!currentStep) throw new Error(`Unknown step: ${project.status}`);

    const nextStepId = currentStep.next;
    if (!nextStepId || nextStepId === 'done') {
        // Mark as done
        await VideoProject.findByIdAndUpdate(projectId, { status: 'done' });
        return projectToState(project);
    }

    return runStep(projectId, nextStepId, nextNodeFunction, humanInput);
}

/**
 * Convert project document to a flat state object
 */
function projectToState(project) {
    const p = project.toObject ? project.toObject() : project;
    return {
        projectId: p._id?.toString(),
        userId: p.user?.toString(),
        brandId: p.brand?.toString(),
        title: p.title,
        status: p.status,

        // Input
        brief: p.input?.brief || '',
        inputImages: p.input?.images || [],
        inputType: p.input?.inputType || 'text',
        videoType: p.input?.videoType || 'ad-film',

        // Brainstorm
        concepts: p.concepts || [],
        selectedConceptIndex: p.selectedConceptIndex,

        // Script
        script: p.script || { shots: [], totalDuration: 0, narrative: '' },
        backendPrompt: p.backendPrompt || '',

        // References
        references: p.references || { brandImages: [], userUploaded: [], aiGenerated: [], styleNotes: '' },

        // Routing
        routing: p.routing || {},

        // Generation
        generation: p.generation || {},

        // Critique
        critique: p.critique || {},

        // Edit history
        editHistory: p.editHistory || [],
    };
}

/**
 * Save state back to VideoProject document
 */
async function saveStateToProject(projectId, stepId, state) {
    const update = { status: stepId };

    // Map state fields back to project schema
    if (state.concepts) update.concepts = state.concepts;
    if (state.selectedConceptIndex != null) update.selectedConceptIndex = state.selectedConceptIndex;
    if (state.title) update.title = state.title;
    if (state.script) update.script = state.script;
    if (state.backendPrompt) update.backendPrompt = state.backendPrompt;
    if (state.references) update.references = state.references;
    if (state.routing) update.routing = state.routing;
    if (state.generation) update.generation = state.generation;
    if (state.critique) update.critique = state.critique;
    if (state.editHistory) update.editHistory = state.editHistory;

    update.checkpoint = PIPELINE.findIndex(s => s.id === stepId);

    await VideoProject.findByIdAndUpdate(projectId, update);
    console.log(`💾 Engine: Checkpoint saved at step "${stepId}"`);
}

/**
 * Get current pipeline status info
 */
export function getPipelineInfo(status) {
    const currentIndex = PIPELINE.findIndex(s => s.id === status);
    return {
        currentStep: status,
        currentIndex,
        totalSteps: PIPELINE.length,
        progress: Math.round((currentIndex / PIPELINE.length) * 100),
        isWaitingForHuman: getStep(status)?.humanGate || false,
        nextStep: getStep(status)?.next || 'done',
    };
}

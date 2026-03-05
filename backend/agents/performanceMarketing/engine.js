/**
 * Performance Marketing Studio — State Machine Engine
 * 
 * Mirrors the Video Studio's engine.js pattern: a lightweight state-machine
 * with nodes, edges, checkpoints, and human-in-the-loop gates.
 * 
 * Flow: research → strategy → budget → [HUMAN] → create-ads → [HUMAN] → launch → monitor → report
 */

import AdReport from '../../models/AdReport.js';

// ── Pipeline Definition ──
const PIPELINE = [
    { id: 'researching', next: 'analyzing', humanGate: false },     // Auto-flow: gather data
    { id: 'analyzing', next: 'strategy', humanGate: false },        // Auto-flow: AI analysis
    { id: 'strategy', next: 'budget', humanGate: true },            // Pause: user approves strategy
    { id: 'budget', next: 'ad-creation', humanGate: true },         // Pause: user approves budget
    { id: 'ad-creation', next: 'review', humanGate: false },        // Auto-flow: AI creates ads
    { id: 'review', next: 'complete', humanGate: true },            // Pause: user approves ads
    { id: 'complete', next: null, humanGate: false },               // Done
];

/**
 * Get the pipeline step definition by ID
 */
function getStep(stepId) {
    return PIPELINE.find(s => s.id === stepId);
}

/**
 * Run a single pipeline step
 */
export async function runStep(reportId, stepId, nodeFunction, extraInput = {}) {
    const report = await AdReport.findById(reportId);
    if (!report) throw new Error(`Report not found: ${reportId}`);

    console.log(`📊 PM Engine: Running step "${stepId}" for report ${reportId}`);

    const state = reportToState(report);
    Object.assign(state, extraInput);

    const updatedState = await nodeFunction(state);

    await saveStateToReport(reportId, stepId, updatedState);

    const step = getStep(stepId);
    if (step && !step.humanGate && step.next && step.next !== 'complete') {
        console.log(`📊 PM Engine: Auto-advancing to "${step.next}"`);
    }

    return updatedState;
}

/**
 * Convert report document to a flat state object
 */
function reportToState(report) {
    const r = report.toObject ? report.toObject() : report;
    return {
        reportId: r._id?.toString(),
        userId: r.user?.toString(),
        brandId: r.brand?.toString(),
        title: r.title,
        type: r.type,
        status: r.status,
        input: r.input || {},
        researchData: r.researchData || {},
        aiAnalysis: r.aiAnalysis || {},
        strategyPlan: r.strategyPlan || {},
        budgetPlan: r.budgetPlan || {},
        performanceSnapshot: r.performanceSnapshot || {},
    };
}

/**
 * Save state back to AdReport document
 */
async function saveStateToReport(reportId, stepId, state) {
    const update = { status: stepId };

    if (state.title) update.title = state.title;
    if (state.researchData) update.researchData = state.researchData;
    if (state.aiAnalysis) update.aiAnalysis = state.aiAnalysis;
    if (state.strategyPlan) update.strategyPlan = state.strategyPlan;
    if (state.budgetPlan) update.budgetPlan = state.budgetPlan;
    if (state.performanceSnapshot) update.performanceSnapshot = state.performanceSnapshot;

    await AdReport.findByIdAndUpdate(reportId, update);
    console.log(`💾 PM Engine: Checkpoint saved at step "${stepId}"`);
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
        progress: Math.round(((currentIndex + 1) / PIPELINE.length) * 100),
        isWaitingForHuman: getStep(status)?.humanGate || false,
        nextStep: getStep(status)?.next || 'complete',
    };
}

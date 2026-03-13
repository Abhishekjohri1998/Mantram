/**
 * Report Generator — State Machine Engine
 * 
 * Lightweight engine for report generation pipeline.
 * Pattern mirrors performanceMarketing/engine.js.
 * 
 * Flow: gathering-data → generating → complete
 */

import StudioReport from '../../models/StudioReport.js';

// ── Pipeline Definition ──
const PIPELINE = [
    { id: 'gathering-data', next: 'generating', humanGate: false },
    { id: 'generating', next: 'complete', humanGate: false },
    { id: 'complete', next: null, humanGate: false },
];

function getStep(stepId) {
    return PIPELINE.find(s => s.id === stepId);
}

/**
 * Run a single pipeline step for the report
 */
export async function runReportStep(reportId, stepId, nodeFunction, extraInput = {}) {
    const report = await StudioReport.findById(reportId);
    if (!report) throw new Error(`StudioReport not found: ${reportId}`);

    console.log(`📊 Report Engine: Running step "${stepId}" for report ${reportId}`);

    const state = reportToState(report);
    Object.assign(state, extraInput);

    const updatedState = await nodeFunction(state);

    await saveStateToReport(reportId, updatedState);

    return updatedState;
}

/**
 * Convert report document to state
 */
function reportToState(report) {
    const r = report.toObject ? report.toObject() : report;
    return {
        reportId: r._id?.toString(),
        userId: r.user?.toString(),
        brandId: r.brand?.toString(),
        studio: r.studio,
        reportType: r.reportType,
        title: r.title,
        status: r.status,
        sections: r.sections || [],
        narrative: r.narrative || {},
        slides: r.slides || [],
        branding: r.branding || {},
        sourceData: r.sourceData || {},
    };
}

/**
 * Save state back to StudioReport
 */
async function saveStateToReport(reportId, state) {
    const update = {};

    if (state.status) update.status = state.status;
    if (state.title) update.title = state.title;
    if (state.sections) update.sections = state.sections;
    if (state.narrative) update.narrative = state.narrative;
    if (state.slides) update.slides = state.slides;
    if (state.branding) update.branding = state.branding;
    if (state.sourceData) update.sourceData = state.sourceData;
    if (state.error) update.error = state.error;

    await StudioReport.findByIdAndUpdate(reportId, update);
    console.log(`💾 Report Engine: Saved report ${reportId}`);
}

/**
 * Get pipeline progress info
 */
export function getReportPipelineInfo(status) {
    const currentIndex = PIPELINE.findIndex(s => s.id === status);
    return {
        currentStep: status,
        currentIndex,
        totalSteps: PIPELINE.length,
        progress: Math.round(((currentIndex + 1) / PIPELINE.length) * 100),
    };
}

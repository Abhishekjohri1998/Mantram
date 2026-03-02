/**
 * Self-Learning Module — Saves and retrieves user editing patterns
 * 
 * After each video: saves edits, prompt tweaks, and style preferences
 * to the brand's aiContext. On future runs, retrieves similar past
 * projects and injects preferences into agent prompts.
 * 
 * V1: Uses keyword matching (not vector search) — lightweight, no Supabase needed.
 */

import VideoProject from '../../models/VideoProject.js';
import Brand from '../../models/Brand.js';

/**
 * Save learnings from a completed video project
 * Called after user finalizes a video
 */
export async function saveLearnings(projectId) {
    try {
        const project = await VideoProject.findById(projectId);
        if (!project || !project.brand) return;

        const brand = await Brand.findById(project.brand);
        if (!brand) return;

        // Build a learning entry
        const selectedConcept = project.concepts?.[project.selectedConceptIndex] || {};
        const learning = {
            text: [
                `Video: "${project.title}"`,
                `Style: ${selectedConcept.style || 'unknown'}`,
                `Model: ${project.routing?.selectedModel || 'unknown'}`,
                `Duration: ${project.script?.totalDuration || 0}s`,
                `Prompt: ${(project.backendPrompt || '').substring(0, 200)}`,
                // Capture user edits — these are the most valuable learnings
                ...(project.editHistory || []).map(e => `Edit ${e.field}: "${e.before?.substring(0, 50)}" → "${e.after?.substring(0, 50)}"`),
            ].join(' | '),
            type: 'video',
            rating: project.critique?.overallScore || 5,
        };

        // Add to brand's AI context (capped at 20 video examples)
        const examples = brand.aiContext?.contentExamples || [];
        const videoExamples = examples.filter(e => e.type === 'video');
        const otherExamples = examples.filter(e => e.type !== 'video');

        // Keep newest 20 video examples
        const updatedVideoExamples = [...videoExamples, learning].slice(-20);

        await Brand.findByIdAndUpdate(brand._id, {
            'aiContext.contentExamples': [...otherExamples, ...updatedVideoExamples],
            $inc: { 'aiContext.totalFeedback': 1 },
        });

        console.log(`📚 Self-learning: saved learnings for video "${project.title}" to brand ${brand.name}`);
    } catch (err) {
        console.warn('Self-learning save failed:', err.message);
    }
}

/**
 * Retrieve past video projects for style memory injection
 * Returns the 5 most recent completed video projects for this brand
 */
export async function getPastProjects(brandId, userId, limit = 5) {
    try {
        const projects = await VideoProject.find({
            brand: brandId,
            user: userId,
            status: 'done',
        })
            .sort({ createdAt: -1 })
            .limit(limit)
            .select('title concepts selectedConceptIndex routing editHistory script.totalDuration')
            .lean();

        return projects;
    } catch (err) {
        console.warn('Self-learning retrieval failed:', err.message);
        return [];
    }
}

/**
 * Get brand's video style preferences (aggregated from past projects)
 * Returns common patterns: preferred model, avg duration, common styles
 */
export async function getStylePreferences(brandId, userId) {
    try {
        const projects = await VideoProject.find({
            brand: brandId,
            user: userId,
            status: 'done',
        })
            .sort({ createdAt: -1 })
            .limit(10)
            .select('routing.selectedModel concepts.style script.totalDuration critique.overallScore')
            .lean();

        if (!projects.length) return null;

        // Aggregate preferences
        const models = {};
        const styles = {};
        let totalDuration = 0;
        let totalScore = 0;

        projects.forEach(p => {
            const model = p.routing?.selectedModel;
            if (model) models[model] = (models[model] || 0) + 1;

            const style = p.concepts?.[0]?.style;
            if (style) styles[style] = (styles[style] || 0) + 1;

            totalDuration += p.script?.totalDuration || 0;
            totalScore += p.critique?.overallScore || 0;
        });

        return {
            preferredModel: Object.entries(models).sort((a, b) => b[1] - a[1])[0]?.[0],
            preferredStyle: Object.entries(styles).sort((a, b) => b[1] - a[1])[0]?.[0],
            avgDuration: Math.round(totalDuration / projects.length),
            avgScore: Math.round(totalScore / projects.length * 10) / 10,
            totalProjects: projects.length,
        };
    } catch (err) {
        return null;
    }
}

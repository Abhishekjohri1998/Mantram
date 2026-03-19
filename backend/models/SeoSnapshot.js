import mongoose from 'mongoose';

/**
 * SeoSnapshot — Lightweight historical metrics snapshot.
 * Stores key numeric metrics after each Health Check audit so we can
 * compute deltas (▲/▼) between runs.
 * 
 * Only stores numbers — NO full page lists, no AI responses.
 * Designed to be small enough to query hundreds of snapshots fast.
 */
const seoSnapshotSchema = new mongoose.Schema({
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    url: { type: String, required: true },

    // ── Crawl Metrics ──
    pagesCrawled: { type: Number, default: 0 },
    pagesWithErrors: { type: Number, default: 0 },
    
    // ── Core SEO Issues ──
    missingH1: { type: Number, default: 0 },
    multipleH1: { type: Number, default: 0 },
    missingTitle: { type: Number, default: 0 },
    missingMetaDesc: { type: Number, default: 0 },
    duplicateTitles: { type: Number, default: 0 },
    duplicateContent: { type: Number, default: 0 },
    thinPages: { type: Number, default: 0 },
    brokenInternalLinks: { type: Number, default: 0 },
    brokenExternalLinks: { type: Number, default: 0 },
    imagesWithoutAlt: { type: Number, default: 0 },
    orphanPages: { type: Number, default: 0 },
    redirectChains: { type: Number, default: 0 },

    // ── Performance ──
    avgWordCount: { type: Number, default: 0 },
    avgResponseTimeMs: { type: Number, default: 0 },

    // ── Schema / Structured Data ──
    pagesWithSchema: { type: Number, default: 0 },
    pagesWithoutSchema: { type: Number, default: 0 },
    schemaValidationIssues: { type: Number, default: 0 },

    // ── PageSpeed (homepage) ──
    performanceScore: { type: Number, default: 0 },
    seoScore: { type: Number, default: 0 },
    accessibilityScore: { type: Number, default: 0 },
    lcpMs: { type: Number, default: 0 },
    clsScore: { type: Number, default: 0 },
    tbtMs: { type: Number, default: 0 },

    // ── AI-Generated Score (from Health Check response) ──
    overallScore: { type: Number, default: 0 },

    // ── Security / Technical ──
    mixedContentPages: { type: Number, default: 0 },
    blockedResources: { type: Number, default: 0 },

}, { timestamps: true });

// Fast lookups: brand + time ordering for delta computation
seoSnapshotSchema.index({ brand: 1, createdAt: -1 });
seoSnapshotSchema.index({ brand: 1, url: 1, createdAt: -1 });

/**
 * Static: Get the previous snapshot for delta computation
 */
seoSnapshotSchema.statics.getPreviousSnapshot = async function(brandId, url) {
    return this.findOne({ brand: brandId, url })
        .sort({ createdAt: -1 })
        .lean();
};

/**
 * Static: Compute deltas between two snapshots
 * Returns an object of { metric: { current, previous, delta, trend } }
 */
seoSnapshotSchema.statics.computeDeltas = function(current, previous) {
    if (!previous) return null;
    const metrics = [
        'pagesCrawled', 'missingH1', 'multipleH1', 'missingTitle', 'missingMetaDesc',
        'duplicateTitles', 'duplicateContent', 'thinPages', 'brokenInternalLinks',
        'brokenExternalLinks', 'imagesWithoutAlt', 'orphanPages', 'redirectChains',
        'avgWordCount', 'pagesWithSchema', 'schemaValidationIssues',
        'performanceScore', 'seoScore', 'lcpMs', 'clsScore', 'tbtMs',
        'overallScore', 'mixedContentPages', 'blockedResources',
    ];
    const deltas = {};
    // Metrics where LOWER is better (issues = bad)
    const lowerIsBetter = new Set([
        'missingH1', 'multipleH1', 'missingTitle', 'missingMetaDesc', 'duplicateTitles',
        'duplicateContent', 'thinPages', 'brokenInternalLinks', 'brokenExternalLinks',
        'imagesWithoutAlt', 'orphanPages', 'redirectChains', 'schemaValidationIssues',
        'lcpMs', 'tbtMs', 'mixedContentPages', 'blockedResources', 'clsScore',
    ]);
    for (const m of metrics) {
        const cur = current[m] || 0;
        const prev = previous[m] || 0;
        const delta = cur - prev;
        let trend = '→'; // no change
        if (delta > 0) trend = lowerIsBetter.has(m) ? '▼' : '▲'; // worse for issues, better for scores
        if (delta < 0) trend = lowerIsBetter.has(m) ? '▲' : '▼'; // better for issues, worse for scores
        if (delta === 0) trend = '→';
        deltas[m] = { current: cur, previous: prev, delta, trend };
    }
    return deltas;
};

export default mongoose.model('SeoSnapshot', seoSnapshotSchema);

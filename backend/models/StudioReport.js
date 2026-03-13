import mongoose from 'mongoose';

/**
 * StudioReport — Unified report model for all studios.
 * Stores AI-generated, interactive, branded reports across SEO, PM, Funnel, and D2C.
 */
const studioReportSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true, index: true },

    // Which studio generated this report
    studio: {
        type: String,
        enum: ['seo', 'pm', 'funnel', 'd2c'],
        required: true,
    },

    title: { type: String, default: 'Untitled Report' },

    // Report sub-type (studio-specific)
    reportType: {
        type: String,
        enum: [
            // SEO
            'health-check', 'competitor-analysis', 'traffic-report', 'ai-visibility',
            // PM
            'competitor-research', 'campaign-performance', 'strategy-report', 'budget-analysis',
            // Funnel
            'funnel-health', 'conversion-analysis', 'pipeline-report',
            // D2C
            'revenue-report', 'product-performance', 'customer-insights',
            // General
            'custom',
        ],
        required: true,
    },

    status: {
        type: String,
        enum: ['generating', 'complete', 'failed'],
        default: 'generating',
    },

    // ── Structured report sections ──
    sections: [{
        id: { type: String, required: true },
        title: { type: String, default: '' },
        type: {
            type: String,
            enum: ['kpi-grid', 'chart', 'table', 'text', 'recommendations', 'timeline', 'comparison'],
            required: true,
        },
        data: { type: mongoose.Schema.Types.Mixed, default: {} },
        editable: { type: Boolean, default: false },
        order: { type: Number, default: 0 },
    }],

    // ── AI narrative ──
    narrative: {
        executiveSummary: { type: String, default: '' },
        keyInsights: [String],
        recommendations: [{
            title: { type: String },
            description: { type: String },
            priority: { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },
            impact: { type: String, default: '' },
        }],
    },

    // ── Brand theming snapshot ──
    branding: {
        logo: { type: String, default: '' },
        primaryColor: { type: String, default: '#6366f1' },
        secondaryColor: { type: String, default: '#8b5cf6' },
        accentColor: { type: String, default: '#ec4899' },
        fontFamily: { type: String, default: 'Inter' },
        brandName: { type: String, default: '' },
        voiceStyle: { type: String, default: '' },
    },

    // ── Slideshow structure ──
    slides: [{
        title: { type: String, default: '' },
        sectionIds: [String],
        notes: { type: String, default: '' },
        layout: { type: String, enum: ['full', 'split', 'grid'], default: 'full' },
    }],

    // ── Source data reference ──
    sourceData: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Credits
    creditsUsed: { type: Number, default: 2 },

    error: { type: String, default: '' },

}, { timestamps: true });

studioReportSchema.index({ user: 1, studio: 1, createdAt: -1 });
studioReportSchema.index({ brand: 1, studio: 1 });

export default mongoose.model('StudioReport', studioReportSchema);

import mongoose from 'mongoose';

const seoAuditSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true },
    type: {
        type: String,
        enum: ['health-check', 'traffic', 'competitors', 'ai-visibility', 'page-audit', 'ask'],
        required: true,
    },
    url: { type: String, default: '' },

    // Scores
    scores: {
        seoHealth: { type: Number, default: 0, min: 0, max: 100 },
        aiVisibility: { type: Number, default: 0, min: 0, max: 100 },
        technicalScore: { type: Number, default: 0, min: 0, max: 100 },
        contentScore: { type: Number, default: 0, min: 0, max: 100 },
        authorityScore: { type: Number, default: 0, min: 0, max: 100 },
    },

    // Full results from agent pipeline
    results: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Credits used
    creditsUsed: { type: Number, default: 1 },

    // Status
    status: {
        type: String,
        enum: ['running', 'completed', 'failed'],
        default: 'running',
    },
    error: { type: String, default: '' },

}, { timestamps: true });

seoAuditSchema.index({ user: 1, brand: 1, type: 1 });
seoAuditSchema.index({ brand: 1, createdAt: -1 });

export default mongoose.model('SeoAudit', seoAuditSchema);

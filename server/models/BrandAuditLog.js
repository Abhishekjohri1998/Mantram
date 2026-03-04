import mongoose from 'mongoose';

/**
 * BrandAuditLog — tracks every knowledge/DNA change for a brand.
 * Provides full traceability: who changed what, when, and the before/after values.
 */
const brandAuditLogSchema = new mongoose.Schema({
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, default: '' }, // denormalized for fast display
    action: {
        type: String,
        required: true,
        enum: [
            'brand_created',
            'brand_deleted',
            'brand_archived',
            'brand_restored',
            'dna_updated',        // generic DNA field update
            'voice_updated',
            'colors_updated',
            'fonts_updated',
            'content_style_updated',
            'description_updated',
            'audience_updated',
            'industry_updated',
            'images_updated',
            'knowledge_added',    // manual knowledge addition
            'knowledge_removed',
            'brand_rescanned',    // website rescan
        ],
    },
    section: { type: String, default: '' }, // e.g. 'voice', 'colors', 'contentStyle'
    summary: { type: String, default: '' }, // human-readable summary of the change
    changes: { type: mongoose.Schema.Types.Mixed, default: {} }, // { field, from, to } or detailed diff
}, {
    timestamps: true, // createdAt = when the change happened
});

// Compound index for fast brand-specific queries, newest first
brandAuditLogSchema.index({ brand: 1, createdAt: -1 });

export default mongoose.model('BrandAuditLog', brandAuditLogSchema);

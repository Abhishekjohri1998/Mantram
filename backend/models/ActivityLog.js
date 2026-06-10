import mongoose from 'mongoose';

/**
 * ActivityLog — per-user, per-brand activity tracking for enterprise accountability.
 * 
 * Tracks who did what, when, and in which studio. Designed for team dashboards,
 * compliance auditing, and usage analytics.
 * 
 * Unlike AuditLog (super admin only), this is user-facing and scoped to brands.
 */
const activityLogSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    userName: { type: String, default: '' },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', index: true },
    brandName: { type: String, default: '' },

    // What happened
    action: {
        type: String,
        required: true,
        enum: [
            // Content Studio
            'content.created', 'content.edited', 'content.deleted', 'content.generated',
            // Creative Studio
            'creative.generated', 'creative.downloaded', 'creative.saved',
            // Brainstorm Studio
            'brainstorm.generated',
            // Research Studio
            'research.generated',
            // Video Studio
            'video.generated', 'video.downloaded',
            // Social Media
            'social.posted', 'social.scheduled', 'social.generated',
            // Performance Studio
            'performance.generated',
            // Voice Studio
            'voice.generated',
            // Virality Studio
            'virality.generated',
            // Brand
            'brand.created', 'brand.updated', 'brand.dna_updated', 'brand.rescanned', 'brand.deleted',
            // SEO
            'seo.audit_run', 'seo.report_generated', 'seo.generated',
            // Team
            'team.member_invited', 'team.member_removed', 'team.role_changed',
            // Credits
            'credits.purchased', 'credits.deducted',
            // Auth
            'auth.login', 'auth.password_changed',
            // Other
            'unknown.generated', 'other',
        ],
    },

    // Context
    studio: {
        type: String,
        enum: [
            'creative', 'content', 'video', 'youtube', 'brainstorm', 'research',
            'social', 'seo', 'performance', 'funnel', 'retention', 'd2c',
            'canvas', 'pulse', 'conversation', 'skills', 'brand', 'settings',
            'auth', 'virality', 'other',
        ],
    },

    // Human-readable summary
    details: { type: String, default: '' },

    // Structured metadata (varies by action)
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Credit cost (if applicable)
    creditCost: { type: Number, default: 0 },
}, {
    timestamps: true,
    // Auto-expire after 180 days to keep DB lean
    expireAfterSeconds: 180 * 24 * 60 * 60,
});

// Compound indexes for efficient queries
activityLogSchema.index({ brand: 1, createdAt: -1 });
activityLogSchema.index({ user: 1, createdAt: -1 });
activityLogSchema.index({ brand: 1, studio: 1, createdAt: -1 });

// TTL index on createdAt for auto-cleanup
activityLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

/**
 * Static helper to log an activity entry (fire-and-forget).
 * Usage: ActivityLog.log({ user, brand, action: 'creative.generated', studio: 'creative', details: '...' })
 */
activityLogSchema.statics.log = function (entry) {
    return this.create(entry).catch(err => {
        console.warn('⚠️ ActivityLog write failed:', err.message);
    });
};

const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);
export default ActivityLog;

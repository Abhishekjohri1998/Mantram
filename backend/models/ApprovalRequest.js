import mongoose from 'mongoose';

const approvalRequestSchema = new mongoose.Schema({
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand' },

    // Who requested and who approves
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    approver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // What's being approved
    itemType: { type: String, enum: ['content', 'creative', 'seo-audit', 'calendar-post', 'ad-campaign'], required: true },
    itemId: { type: mongoose.Schema.Types.ObjectId, required: true },
    itemTitle: { type: String, default: '' }, // display title
    itemPreview: { type: String, default: '' }, // text preview or image URL

    // Status workflow
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'revision-requested'], default: 'pending' },
    priority: { type: String, enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' },

    // Feedback chain
    feedback: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        message: { type: String },
        action: { type: String, enum: ['comment', 'approve', 'reject', 'revision'] },
        createdAt: { type: Date, default: Date.now },
    }],

    // AI pre-review (agentic feature)
    aiReview: {
        brandVoiceScore: { type: Number }, // 0-100
        issues: [{ type: String }],
        suggestions: [{ type: String }],
        reviewedAt: { type: Date },
    },

    // Scheduling
    dueDate: { type: Date },
    resolvedAt: { type: Date },

    // Notification tracking
    lastNudgeAt: { type: Date },
    nudgeCount: { type: Number, default: 0 },
}, { timestamps: true });

approvalRequestSchema.index({ organization: 1, status: 1, createdAt: -1 });
approvalRequestSchema.index({ approver: 1, status: 1 });
approvalRequestSchema.index({ requestedBy: 1 });

export default mongoose.model('ApprovalRequest', approvalRequestSchema);

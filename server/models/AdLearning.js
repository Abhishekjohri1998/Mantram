/**
 * AdLearning Model — Historical Performance Learning
 * 
 * Stores AI insights learned from past campaigns, research, and strategies.
 * This data is injected into future AI prompts so the system gets smarter
 * with each interaction.
 */

import mongoose from 'mongoose';

const adLearningSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    brand: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Brand',
        required: true,
        index: true,
    },

    // What type of learning is this
    type: {
        type: String,
        enum: [
            'campaign-result',     // What worked/didn't work in a campaign
            'audience-insight',    // Which audiences performed best
            'creative-insight',    // Which creative styles/copy worked
            'budget-insight',      // What budget allocation worked best
            'competitor-pattern',  // Recurring competitor strategies
            'seasonal-pattern',    // Seasonal performance trends
            'platform-insight',    // Platform-specific learnings
        ],
        required: true,
    },

    // Human-readable title
    title: { type: String, required: true },

    // The actual learning (structured for AI consumption)
    insight: {
        summary: { type: String, required: true },           // One-line summary
        details: { type: String, default: '' },               // Detailed explanation
        evidence: { type: String, default: '' },              // Data/metrics that support this
        actionable: { type: String, default: '' },            // What to do differently
        confidence: { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },
    },

    // Tags for quick filtering
    tags: [String],

    // Platform relevance
    platform: {
        type: String,
        enum: ['meta', 'google', 'both', 'general'],
        default: 'general',
    },

    // Source of this learning
    source: {
        reportId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdReport' },
        campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdCampaign' },
        agentGenerated: { type: Boolean, default: true },
    },

    // Metrics snapshot when this learning was generated
    metrics: {
        roas: Number,
        ctr: Number,
        cpc: Number,
        cpa: Number,
        conversions: Number,
        spend: Number,
    },

    // How many times this insight has been used in prompts
    usageCount: { type: Number, default: 0 },

    // User can approve/reject AI-generated insights
    status: {
        type: String,
        enum: ['active', 'archived', 'rejected'],
        default: 'active',
    },
}, { timestamps: true });

// Compound index for efficient brand+type queries
adLearningSchema.index({ brand: 1, type: 1, status: 1 });
adLearningSchema.index({ brand: 1, createdAt: -1 });

export default mongoose.model('AdLearning', adLearningSchema);

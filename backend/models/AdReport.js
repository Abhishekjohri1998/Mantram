import mongoose from 'mongoose';

/**
 * AdReport — AI-generated and API-fetched performance marketing reports.
 * Used for competitor research, strategy docs, budget plans, and performance snapshots.
 */
const adReportSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', index: true },
    title: { type: String, default: 'Untitled Report' },

    // ── Report Type ──
    type: {
        type: String,
        enum: [
            'competitor-research',
            'strategy',
            'budget-plan',
            'performance',
            'ab-test-result',
            'campaign-audit',
            'weekly-digest',
        ],
        required: true,
    },

    // ── Pipeline Status ──
    status: {
        type: String,
        enum: ['researching', 'analyzing', 'generating', 'complete', 'failed'],
        default: 'researching',
    },

    // ── Input (what the user asked for) ──
    input: {
        query: { type: String, default: '' },           // User's input text / brief
        competitors: [String],                           // Competitor names/domains
        platforms: [String],                             // meta, google
        dateRange: {
            start: { type: Date },
            end: { type: Date },
        },
        campaignIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'AdCampaign' }],
    },

    // ── Research Data (from APIs) ──
    // Uses Mixed type to support varied competitor research data: competitorAds,
    // competitorProfiles, adPatterns, gaps, marketTrends, etc.
    researchData: { type: mongoose.Schema.Types.Mixed, default: {} },

    // ── AI Analysis ──
    // Uses Mixed type to support rich analysis: summary, keyFindings, recommendations,
    // competitorProfiles, adPatterns, gaps, etc.
    aiAnalysis: { type: mongoose.Schema.Types.Mixed, default: {} },

    // ── Strategy Plan (for strategy type) ──
    // Uses Mixed type to support rich nested data: platformBreakout, keywordStrategy,
    // competitiveEdge, locationStrategy, achievabilityAudit, goals-as-objects etc.
    strategyPlan: { type: mongoose.Schema.Types.Mixed, default: {} },

    // ── Budget Plan (for budget-plan type) ──
    budgetPlan: {
        totalBudget: { type: Number, default: 0 },
        currency: { type: String, default: 'INR' },
        duration: { type: String, default: '30 days' },
        allocation: [{
            platform: { type: String },
            campaign: { type: String },
            amount: { type: Number },
            expectedRoas: { type: Number },
        }],
        projections: {
            estimatedReach: { type: Number },
            estimatedClicks: { type: Number },
            estimatedConversions: { type: Number },
            estimatedRoas: { type: Number },
        },
    },

    // ── Performance Snapshot (for performance type) ──
    performanceSnapshot: {
        period: { type: String },
        campaigns: [{
            campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdCampaign' },
            name: { type: String },
            platform: { type: String },
            spend: { type: Number },
            impressions: { type: Number },
            clicks: { type: Number },
            conversions: { type: Number },
            roas: { type: Number },
        }],
        totalSpend: { type: Number, default: 0 },
        totalConversions: { type: Number, default: 0 },
        overallRoas: { type: Number, default: 0 },
    },

    // ── Metadata ──
    creditsUsed: { type: Number, default: 0 },

}, { timestamps: true });

adReportSchema.index({ user: 1, type: 1, createdAt: -1 });
adReportSchema.index({ brand: 1, type: 1 });

export default mongoose.model('AdReport', adReportSchema);

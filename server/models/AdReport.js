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
    researchData: {
        competitorAds: [{
            advertiser: { type: String },
            platform: { type: String },
            adType: { type: String },
            headline: { type: String },
            bodyText: { type: String },
            imageUrl: { type: String },
            cta: { type: String },
            estimatedSpend: { type: String },
            startDate: { type: Date },
            impressionRange: { type: String },
            landingUrl: { type: String },
        }],
        marketTrends: [String],
        keyInsights: [String],
    },

    // ── AI Analysis ──
    aiAnalysis: {
        summary: { type: String, default: '' },
        keyFindings: [String],
        opportunities: [String],
        threats: [String],
        recommendations: [{
            title: { type: String },
            description: { type: String },
            priority: { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },
            estimatedImpact: { type: String },
        }],
        actionItems: [{
            action: { type: String },
            deadline: { type: String },
            platform: { type: String },
        }],
    },

    // ── Strategy Plan (for strategy type) ──
    strategyPlan: {
        goals: [String],
        channelAllocation: [{
            channel: { type: String },           // meta-feed, meta-reels, google-search, google-display, youtube
            budgetPercent: { type: Number },
            rationale: { type: String },
        }],
        timeline: [{
            phase: { type: String },
            duration: { type: String },
            activities: [String],
        }],
        kpis: [{
            metric: { type: String },
            target: { type: String },
            current: { type: String },
        }],
    },

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

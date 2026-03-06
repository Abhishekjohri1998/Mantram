import mongoose from 'mongoose';

/**
 * AdCampaign — Full-lifecycle ad campaign model for Meta & Google Ads.
 * Stores everything from AI-generated strategy to live performance data.
 */
const adCampaignSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', index: true },
    title: { type: String, default: 'Untitled Campaign' },

    // ── Platform & Status ──
    platform: { type: String, enum: ['meta', 'google', 'both'], default: 'meta' },
    status: {
        type: String,
        enum: ['draft', 'review', 'active', 'paused', 'completed', 'failed'],
        default: 'draft',
    },

    // ── Campaign Type & Objective ──
    objective: {
        type: String,
        enum: ['awareness', 'traffic', 'engagement', 'leads', 'conversions', 'app-installs', 'sales'],
        default: 'traffic',
    },

    // ── Budget ──
    budget: {
        daily: { type: Number, default: 0 },
        total: { type: Number, default: 0 },
        currency: { type: String, default: 'INR' },
        strategy: { type: String, enum: ['lowest-cost', 'cost-cap', 'bid-cap', 'target-roas'], default: 'lowest-cost' },
        startDate: { type: Date },
        endDate: { type: Date },
    },

    // ── Targeting ──
    targeting: {
        audiences: [String],             // Custom audience names
        locations: [String],             // Country/city codes
        ageRange: {
            min: { type: Number, default: 18 },
            max: { type: Number, default: 65 },
        },
        gender: { type: String, enum: ['all', 'male', 'female'], default: 'all' },
        interests: [String],
        behaviors: [String],
        placements: [String],            // feed, stories, reels, search, display, youtube
        languages: [String],
        excludedAudiences: [String],
    },

    // ── Ad Creatives ──
    creatives: [{
        name: { type: String, default: '' },
        format: { type: String, enum: ['image', 'video', 'carousel', 'collection', 'text'], default: 'image' },
        headline: { type: String, default: '' },
        primaryText: { type: String, default: '' },
        description: { type: String, default: '' },
        cta: { type: String, default: 'Learn More' },
        imageUrl: { type: String, default: '' },
        videoUrl: { type: String, default: '' },
        landingUrl: { type: String, default: '' },
        // AI generation metadata
        aiGenerated: { type: Boolean, default: false },
        aiPrompt: { type: String, default: '' },
    }],

    // ── A/B Testing ──
    abTest: {
        enabled: { type: Boolean, default: false },
        variants: [{
            name: { type: String },         // A, B, C
            creativeIndex: { type: Number }, // references creatives array
            performance: {
                impressions: { type: Number, default: 0 },
                clicks: { type: Number, default: 0 },
                ctr: { type: Number, default: 0 },
                conversions: { type: Number, default: 0 },
                spend: { type: Number, default: 0 },
            },
        }],
        winnerVariant: { type: String, default: '' },
        metric: { type: String, enum: ['ctr', 'cpc', 'conversions', 'roas'], default: 'ctr' },
        confidenceLevel: { type: Number, default: 0 },
    },

    // ── Platform Campaign IDs (after creation via API) ──
    platformData: {
        metaCampaignId: { type: String, default: '' },
        metaAdSetId: { type: String, default: '' },
        metaAdId: { type: String, default: '' },
        googleCampaignId: { type: String, default: '' },
        googleAdGroupId: { type: String, default: '' },
        googleAdId: { type: String, default: '' },
    },

    // ── Live Performance Data ──
    performance: {
        impressions: { type: Number, default: 0 },
        reach: { type: Number, default: 0 },
        clicks: { type: Number, default: 0 },
        ctr: { type: Number, default: 0 },
        cpc: { type: Number, default: 0 },
        cpm: { type: Number, default: 0 },
        conversions: { type: Number, default: 0 },
        conversionRate: { type: Number, default: 0 },
        roas: { type: Number, default: 0 },
        spend: { type: Number, default: 0 },
        leads: { type: Number, default: 0 },
        revenue: { type: Number, default: 0 },           // Shopify-attributed revenue
        blendedRoas: { type: Number, default: 0 },       // Revenue / Spend (from Shopify)
        mer: { type: Number, default: 0 },                // Marketing Efficiency Ratio
        lastSyncAt: { type: Date },
    },

    // ── Anomaly Tracking ──
    anomalies: [{
        type: { type: String },                           // 'roas-drop', 'cpc-spike', 'ctr-drop', 'budget-exceeded'
        severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
        detected: { type: Date },
        metric: { type: String },
        expected: { type: Number },
        actual: { type: Number },
        action: { type: String },                         // What was done (paused, budget-shifted, alert-sent)
        resolved: { type: Boolean, default: false },
    }],

    // ── Autopilot Settings ──
    autopilot: {
        enabled: { type: Boolean, default: false },
        pauseOnRoasDrop: { type: Number, default: 0 },   // Auto-pause if ROAS drops below this
        maxDailySpend: { type: Number, default: 0 },      // Hard cap
        autoSwapCreatives: { type: Boolean, default: false },
    },

    // ── AI Insights ──
    aiInsights: {
        summary: { type: String, default: '' },
        recommendations: [String],
        riskLevel: { type: String, enum: ['low', 'medium', 'high'], default: 'low' },
        predictedRoas: { type: Number, default: 0 },
        optimizationScore: { type: Number, default: 0 }, // 0-100
    },

    // ── Source Strategy ──
    strategyId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdReport' },

}, { timestamps: true });

adCampaignSchema.index({ user: 1, status: 1, createdAt: -1 });
adCampaignSchema.index({ brand: 1, platform: 1 });

export default mongoose.model('AdCampaign', adCampaignSchema);

import mongoose from 'mongoose';

/**
 * RetentionCampaign — A single Amazon→D2C re-engagement campaign
 * 
 * Tracks the full pipeline: data ingest → match → creative → mailer → send
 * Each campaign has contacts, matched products, generated creatives/mailers.
 */
const contactSchema = new mongoose.Schema({
    email: { type: String, required: true },
    name: { type: String, default: '' },
    address: { type: String, default: '' },
    amazonOrderId: { type: String, default: '' },
    amazonProductTitle: { type: String, default: '' },
    amazonASIN: { type: String, default: '' },
    amazonPrice: { type: Number, default: 0 },
    orderDate: { type: Date },

    // Enriched by Match node
    matched: { type: Boolean, default: false },
    shopifyProductId: { type: String, default: '' },
    shopifyProductTitle: { type: String, default: '' },
    shopifyPrice: { type: Number, default: 0 },
    shopifyProductUrl: { type: String, default: '' },
    shopifyProductImage: { type: String, default: '' },
    priceDelta: { type: Number, default: 0 }, // Amazon - Shopify (savings)
    savingsPercent: { type: Number, default: 0 },

    // Send tracking
    emailStatus: { type: String, enum: ['pending', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed'], default: 'pending' },
    sentAt: { type: Date },
    openedAt: { type: Date },
    clickedAt: { type: Date },
}, { _id: true });

const campaignSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true },
    title: { type: String, required: true, default: 'Amazon Re-Engagement Campaign' },
    description: { type: String, default: '' },

    // Pipeline state
    status: {
        type: String,
        enum: ['draft', 'ingesting', 'matching', 'designing', 'composing', 'reviewing', 'sending', 'sent', 'completed', 'failed'],
        default: 'draft',
    },
    currentNode: { type: String, default: 'ingest' }, // ingest, match, creative, compose, send

    // Node 1: Data Ingest
    ingestData: {
        source: { type: String, enum: ['csv', 'paste', 'api'], default: 'csv' },
        rawData: { type: String, default: '' }, // Raw CSV/paste text
        totalImported: { type: Number, default: 0 },
        duplicatesRemoved: { type: Number, default: 0 },
    },

    // Contacts list (imported + enriched)
    contacts: [contactSchema],

    // Node 2: Match results
    matchResults: {
        totalMatched: { type: Number, default: 0 },
        totalUnmatched: { type: Number, default: 0 },
        avgSavings: { type: Number, default: 0 },
        matchedAt: { type: Date },
    },

    // Node 3: Creative
    creative: {
        templateType: { type: String, default: 'price-showdown' }, // price-showdown, savings-spotlight, loyalty-unlock, bundle-builder, vip-welcome
        generatedHtml: { type: String, default: '' },
        previewImageUrl: { type: String, default: '' },
        aiPromptUsed: { type: String, default: '' },
        approved: { type: Boolean, default: false },
    },

    // Node 4: Mailer
    mailer: {
        templateType: { type: String, default: 'clean-minimal' }, // clean-minimal, dark-premium, social-proof, urgency-drive
        subjectLine: { type: String, default: '' },
        previewText: { type: String, default: '' },
        bodyHtml: { type: String, default: '' },
        ctaText: { type: String, default: '' },
        ctaUrl: { type: String, default: '' },
        approved: { type: Boolean, default: false },
    },

    // Node 5: Send results
    sendResults: {
        totalSent: { type: Number, default: 0 },
        totalDelivered: { type: Number, default: 0 },
        totalOpened: { type: Number, default: 0 },
        totalClicked: { type: Number, default: 0 },
        totalBounced: { type: Number, default: 0 },
        openRate: { type: Number, default: 0 },
        clickRate: { type: Number, default: 0 },
        startedAt: { type: Date },
        completedAt: { type: Date },
    },

    // ESP config
    espProvider: { type: String, enum: ['resend', 'ses'], default: 'resend' },
    fromEmail: { type: String, default: '' },
    fromName: { type: String, default: '' },
    replyTo: { type: String, default: '' },

    // ── Phase 1 Extensions ──

    // Campaign type (beyond just Amazon re-engagement)
    campaignType: {
        type: String,
        enum: ['amazon_reengagement', 'winback', 'post_purchase', 'price_drop', 'back_in_stock', 'vip_reward', 'welcome', 'replenishment', 'custom'],
        default: 'amazon_reengagement',
    },

    // Flow template used (if any)
    flowTemplate: { type: String, default: '' }, // e.g. 'welcome_series', 'winback'

    // A/B Testing
    abTest: { type: mongoose.Schema.Types.Mixed, default: null },

    // UTM tracking
    utm: {
        source: { type: String, default: 'mantram_retention' },
        medium: { type: String, default: 'email' },
        campaign: { type: String, default: '' },
        content: { type: String, default: '' },
    },

    // RFM segment targeting
    targetSegment: { type: String, default: '' }, // e.g. 'atRisk', 'cantLoseThem'

}, { timestamps: true });

// Indexes
campaignSchema.index({ user: 1, brand: 1, status: 1 });
campaignSchema.index({ brand: 1, createdAt: -1 });

export default mongoose.model('RetentionCampaign', campaignSchema);

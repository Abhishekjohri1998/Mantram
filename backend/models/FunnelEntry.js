import mongoose from 'mongoose';

// ── Stage History Schema ──
const stageHistorySchema = new mongoose.Schema({
    stage: { type: String, required: true },
    enteredAt: { type: Date, default: Date.now },
    exitedAt: { type: Date },
    movedBy: { type: String, enum: ['manual', 'automation', 'ai', 'system', 'webhook', 'shopify_webhook', 'stripe_webhook'], default: 'manual' },
}, { _id: false });

// ── Touchpoint Schema ──
const touchpointSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['ad_click', 'seo_visit', 'social_engage', 'dm_received', 'dm_sent', 'email_open', 'email_click',
               'page_visit', 'form_submit', 'purchase', 'cart_abandon', 'content_view', 'video_view', 'webhook', 'custom'],
        required: true,
    },
    timestamp: { type: Date, default: Date.now },
    details: { type: String, default: '' },
    studioRef: { type: String, default: '' }, // which studio generated this touchpoint
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { _id: false });

// ── Main Funnel Entry Schema ──
const funnelEntrySchema = new mongoose.Schema({
    funnel: { type: mongoose.Schema.Types.ObjectId, ref: 'Funnel', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true },

    // Link to existing Contact (optional — can be a manual entry too)
    contact: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },

    // Entry identity (for non-contact entries)
    name: { type: String, default: 'Unknown' },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    company: { type: String, default: '' },
    avatar: { type: String, default: '' },

    // Source tracking
    source: {
        type: String,
        enum: ['ad', 'seo', 'social', 'dm', 'direct', 'referral', 'email', 'shopify', 'manual', 'other'],
        default: 'manual',
    },
    sourceCampaign: { type: String, default: '' }, // e.g. campaign name or utm_campaign
    sourceDetail: { type: String, default: '' },   // e.g. ad_id, keyword, referral_url

    // Current position in funnel
    currentStage: { type: String, required: true },
    stageHistory: [stageHistorySchema],

    // Scoring (0-100)
    score: { type: Number, default: 0, min: 0, max: 100 },

    // Touchpoint timeline
    touchpoints: [touchpointSchema],

    // Status
    status: { type: String, enum: ['active', 'converted', 'lost', 'paused'], default: 'active' },

    // Conversion data
    convertedAt: { type: Date },
    revenue: { type: Number, default: 0 },
    dealValue: { type: Number, default: 0 },
    lostReason: { type: String, default: '' },

    // Notes
    notes: { type: String, default: '' },
    tags: [{ type: String }],

}, { timestamps: true });

funnelEntrySchema.index({ funnel: 1, currentStage: 1 });
funnelEntrySchema.index({ funnel: 1, status: 1 });
funnelEntrySchema.index({ user: 1, brand: 1 });
funnelEntrySchema.index({ score: -1 });
funnelEntrySchema.index({ contact: 1 });

export default mongoose.model('FunnelEntry', funnelEntrySchema);

/**
 * PulseHistory — stores all Pulse Studio generations
 * Covers: Pulse Deck, Pulse Mail, Pulse Page, A+ Listing
 */
import mongoose from 'mongoose';

const pulseHistorySchema = new mongoose.Schema({
    user:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    brand:      { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', index: true },

    // Which Pulse sub-tool generated this
    tool: {
        type: String,
        enum: ['deck', 'email', 'page', 'aplus', 'social-kit', 'quick-post', 'brochure'],
        required: true,
    },

    // User brief
    brief:      { type: String, required: true },

    // tool-specific sub-type (e.g. campaign, newsletter, product-launch)
    subType:    { type: String, default: '' },

    // ── Deck fields ────────────────────────────────────────────
    hostedUrl:  { type: String, default: null },
    slideCount: { type: Number, default: null },
    deckPlan:   { type: mongoose.Schema.Types.Mixed, default: null },

    // ── Email fields ───────────────────────────────────────────
    emailHtml:     { type: String, default: null },
    emailPlainText:{ type: String, default: null },
    emailSubject:  { type: String, default: null },
    emailName:     { type: String, default: null },
    emailHostedUrl:{ type: String, default: null },

    // ── Landing Page fields ────────────────────────────────────
    pageHtml:       { type: String, default: null },
    pageHostedUrl:  { type: String, default: null },
    pageName:       { type: String, default: null },
    pageSlug:       { type: String, default: null },
    pageMetaTitle:  { type: String, default: null },
    pageMetaDesc:   { type: String, default: null },
    pageEmbedCode:  { type: String, default: null },
    pageSectionCount: { type: Number, default: null },
    pageAnimationStyle: { type: String, default: null },
    pageStrategy:   { type: mongoose.Schema.Types.Mixed, default: null },
    pagePublished:  [{
        platform:   { type: String },
        url:        { type: String },
        publishedAt:{ type: Date, default: Date.now },
    }],

    // ── A+ Listing fields ──────────────────────────────────────────────────
    aplusModules:     { type: mongoose.Schema.Types.Mixed, default: null },
    aplusImages:      { type: mongoose.Schema.Types.Mixed, default: null },
    aplusProductData: { type: mongoose.Schema.Types.Mixed, default: null },
    aplusExportText:  { type: String, default: null },
    aplusModuleCount: { type: Number, default: null },
    aplusProductDNA:  { type: mongoose.Schema.Types.Mixed, default: null },  // PDI extracted DNA
    aplusDesignContext: { type: mongoose.Schema.Types.Mixed, default: null }, // PDI locked design directive
    aplusPlan:        { type: mongoose.Schema.Types.Mixed, default: null },
    aplusTier:        { type: String, enum: ['standard', 'premium'], default: 'standard' }, // A+ vs A++

    // ── Social Kit fields ──────────────────────────────────────────────────────
    // Each kit image: { platform, label, ratio, size, imageUrl, success }
    kitImages:    { type: mongoose.Schema.Types.Mixed, default: null },
    captions:     { type: mongoose.Schema.Types.Mixed, default: null },   // per-platform captions
    kitType:      { type: String, default: null },    // promo | feature | launch | emotion
    kitMoodLabel: { type: String, default: null },
    kitPlatforms: [{ type: String }],                  // which platforms were generated
    // Creative Brain meta
    creativeRationale: { type: String, default: null },
    designTrend:  { type: String, default: null },
    humanPresence:{ type: Boolean, default: false },

    // ── Quick Post fields ──────────────────────────────────────────────────────
    quickPostImageUrl: { type: String, default: null },
    quickPostCaption:  { type: String, default: null },
    quickPostPlatform: { type: String, default: null },
    quickPostCopy:     { type: mongoose.Schema.Types.Mixed, default: null },

    // ── Brochure fields ───────────────────────────────────────────────────────
    brochureFrontUrl:  { type: String, default: null },
    brochureBackUrl:   { type: String, default: null },
    brochureHostedUrl: { type: String, default: null },
    brochureContent:   { type: mongoose.Schema.Types.Mixed, default: null }, // Claude-generated copy
    brochureProductName: { type: String, default: null },

    // ── Shared: Product context (for all Pulse tools) ─────────────────────────
    productName:   { type: String, default: null },   // product title for display
    productUrl:    { type: String, default: null },   // source URL
    productThumbUrl: { type: String, default: null }, // hero image for history card

    // Credits used
    creditsUsed:  { type: Number, default: 0 },

    // Thumbnail / preview image (first slide image, hero image etc.)
    thumbnailUrl: { type: String, default: null },

    // Status: completed | failed
    status:       { type: String, enum: ['completed', 'failed'], default: 'completed' },

}, { timestamps: true });

// Indexes for fast history fetching
pulseHistorySchema.index({ user: 1, tool: 1, createdAt: -1 });
pulseHistorySchema.index({ user: 1, createdAt: -1 });
pulseHistorySchema.index({ brand: 1, createdAt: -1 });

export default mongoose.model('PulseHistory', pulseHistorySchema);

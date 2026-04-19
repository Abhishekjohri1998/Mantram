/**
 * PulseHistory — stores all Pulse Studio generations
 * Covers: Pulse Deck, Pulse Mail, Pulse Page
 */
import mongoose from 'mongoose';

const pulseHistorySchema = new mongoose.Schema({
    user:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    brand:      { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', index: true },

    // Which Pulse sub-tool generated this
    tool:       { type: String, enum: ['deck', 'email', 'page'], required: true },

    // User brief
    brief:      { type: String, required: true },

    // tool-specific sub-type (e.g. campaign, newsletter, product-launch)
    subType:    { type: String, default: '' },

    // ── Deck fields ────────────────────────────────────────────
    pptxUrl:    { type: String, default: null },
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

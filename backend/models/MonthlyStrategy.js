import mongoose from 'mongoose';

/**
 * Brief — the atomic unit of work for a calendar item.
 * Contains everything a studio needs to execute without additional user input.
 */
const briefSchema = new mongoose.Schema({
    angle:          { type: String, default: '' },   // The creative/strategic angle
    format:         { type: String, default: '' },   // e.g. "60-second reel", "1200-word blog"
    captionDraft:   { type: String, default: '' },   // Ready-to-use caption or copy draft
    hashtagSet:     [{ type: String }],              // Platform-native hashtags
    postingTime:    { type: String, default: '' },   // e.g. "7:30 PM IST"
    toneDirection:  { type: String, default: '' },   // e.g. "urgent, FOMO-driven"
    visualDirection:{ type: String, default: '' },   // e.g. "product flat lay, white bg, brand colors"
    callToAction:   { type: String, default: '' },   // e.g. "Shop now — link in bio"
    targetKeyword:  { type: String, default: '' },   // For SEO items
    estimatedCredits: { type: Number, default: 3 },  // Credits this brief will cost to execute
    incomplete:     { type: Boolean, default: false }, // True if brief failed completeness check
}, { _id: false });

/**
 * CalendarItem — one day/entry in the 30-day execution plan.
 */
const calendarItemSchema = new mongoose.Schema({
    date:           { type: String, required: true }, // YYYY-MM-DD
    contentType:    {
        type: String,
        enum: ['reel', 'carousel', 'static', 'story', 'blog', 'email',
               'ad', 'ugc', 'newsletter', 'youtube', 'whatsapp', 'listing',
               'video', 'text', 'thread'],
        required: true,
    },
    platform:       { type: String, default: '' },   // instagram | linkedin | email | amazon etc.
    brief:          { type: briefSchema, default: () => ({}) },
    targetStudio:   {
        type: String,
        enum: ['content', 'creative', 'video', 'retention'],
        default: 'content',
    },
    status: {
        type: String,
        enum: ['pending', 'in_progress', 'complete', 'published'],
        default: 'pending',
    },
    generatedAsset: {
        type:  { type: String, default: '' },         // 'content' | 'creative' | 'video'
        refId: { type: mongoose.Schema.Types.ObjectId, default: null },
        url:   { type: String, default: '' },         // quick-access URL for the asset
        preview: { type: String, default: '' },       // thumbnail or text snippet
    },
    publishedAt:    { type: Date, default: null },
}, { _id: true });

/**
 * MonthlyStrategy — the top-level document for a brand's monthly execution plan.
 */
const monthlyStrategySchema = new mongoose.Schema({
    user:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    brand:  { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true },

    strategyType: {
        type: String,
        enum: [
            'social-media',
            'performance-marketing',
            'seo',
            'sales',
            'content-marketing',
            'email-retention',
            'influencer-ugc',
            'marketplace',
        ],
        required: true,
    },

    month:   { type: Number, required: true, min: 1, max: 12 },
    year:    { type: Number, required: true },

    // Version number — increments on regenerate, never overwrites
    version: { type: Number, default: 1 },

    status: {
        type: String,
        enum: ['generating', 'draft', 'active', 'complete', 'archived'],
        default: 'draft',
    },

    // Short executive summary Claude returns
    summary: { type: String, default: '' },

    // Raw MCP tool outputs stored for debugging / transparency
    researchData: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Full structured strategy JSON from Claude (phases, channel priority, themes, etc.)
    strategyDocument: { type: mongoose.Schema.Types.Mixed, default: {} },

    // The 30-day calendar
    calendar: [calendarItemSchema],

    // Metadata
    mcpToolsUsed:            [{ type: String }],   // Which MCP tools were called
    brandSpecificityWarning: { type: Boolean, default: false }, // True if brand refs check failed
    generationDurationMs:    { type: Number, default: 0 },

    // ── User Campaign Brief (optional pre-generation context) ──
    userBrief:      { type: String, default: '' },          // Free-form launch/campaign brief
    launchEvents:   [{                                       // Product/campaign launch anchors
        name:   { type: String },
        date:   { type: String },                           // YYYY-MM-DD
        type:   { type: String, enum: ['product','campaign','sale','collab','event'], default: 'product' },
    }],
    focusKeywords:  [{ type: String }],                     // Keywords strategy must include
    toneOverride:   { type: String, default: '' },          // Aggressive|Inspirational|Educational|Luxury

}, { timestamps: true });

// Indexes
monthlyStrategySchema.index({ user: 1, brand: 1, month: 1, year: 1, strategyType: 1 });
monthlyStrategySchema.index({ user: 1, brand: 1, createdAt: -1 });
monthlyStrategySchema.index({ brand: 1, status: 1 });

export default mongoose.model('MonthlyStrategy', monthlyStrategySchema);

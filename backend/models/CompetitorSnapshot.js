import mongoose from 'mongoose';

const competitorSnapshotSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true },

    // Competitor details
    competitorUrl: { type: String, required: true },
    competitorName: { type: String },

    // Crawl snapshot
    pages: [{
        url: String,
        title: String,
        metaDesc: String,
        wordCount: Number,
        h1: String,
        isNewPage: { type: Boolean, default: false },    // New page since last snapshot
        isChanged: { type: Boolean, default: false }, // Content changed since last snapshot
    }],

    // New content since last snapshot
    newPages: [{ url: String, title: String }],
    changedPages: [{ url: String, title: String, changeType: String }],
    removedPages: [{ url: String, title: String }],

    // Metrics
    totalPages: { type: Number, default: 0 },
    avgWordCount: { type: Number, default: 0 },
    schemaTypes: [String],

    // Keyword overlap tracking
    titleKeywords: [String],   // Extracted from page titles
    metaKeywords: [String],    // Extracted from meta descriptions

}, { timestamps: true });

competitorSnapshotSchema.index({ user: 1, brand: 1, competitorUrl: 1, createdAt: -1 });

export default mongoose.model('CompetitorSnapshot', competitorSnapshotSchema);

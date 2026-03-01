import mongoose from 'mongoose';

const brandSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true },
    website: { type: String, default: '' },
    onboardingMethod: { type: String, enum: ['website', 'upload', 'brainstorm'], default: 'website' },
    status: { type: String, enum: ['active', 'draft', 'archived'], default: 'active' },

    // Brand DNA — the knowledge bank
    dna: {
        logo: {
            url: { type: String, default: '' },
            metadata: {
                weight: { type: String, default: '' },
                contrast: { type: String, default: '' },
                format: { type: String, default: '' },
            },
        },
        colors: [{
            name: { type: String },
            hex: { type: String },
            usage: { type: String, default: 'accent' }, // primary, secondary, accent, background
        }],
        fonts: {
            heading: { family: String, weight: String, style: String },
            body: { family: String, weight: String, style: String },
            accent: { family: String, weight: String, style: String },
        },
        voice: {
            personality: { type: String, default: '' }, // e.g. "Professional & Bold"
            description: { type: String, default: '' },
            tone: { type: Number, default: 50, min: 0, max: 100 },
            clarity: { type: Number, default: 50, min: 0, max: 100 },
            wit: { type: Number, default: 50, min: 0, max: 100 },
            warmth: { type: Number, default: 50, min: 0, max: 100 },
            formality: { type: Number, default: 50, min: 0, max: 100 },
            sampleQuote: { type: String, default: '' },
            keywords: [String],
        },
        contentStyle: {
            dos: [String],
            donts: [String],
            keyPhrases: [String],
        },
        industry: { type: String, default: '' },
        targetAudience: { type: String, default: '' },
        brandDescription: { type: String, default: '' },
        country: { type: String, default: 'India' },
        region: { type: String, default: '' },
        defaultLanguage: { type: String, default: 'english' },
        languageStyle: { type: String, default: 'pure' },
    },

    // Extracted raw data from website scan
    rawScanData: { type: mongoose.Schema.Types.Mixed, default: {} },

    // AI Learning — accumulated knowledge about this brand
    aiContext: {
        systemPrompt: { type: String, default: '' }, // built from DNA + learning
        contentExamples: [{ text: String, type: String, rating: Number }],
        feedbackSummary: { type: String, default: '' }, // AI-summarized learnings
        totalFeedback: { type: Number, default: 0 },
        avgRating: { type: Number, default: 0 },
    },

    // SEO — known competitors
    competitors: [{
        name: { type: String },
        url: { type: String },
        addedBy: { type: String, enum: ['ai', 'user'], default: 'ai' },
    }],

    // Team sharing
    sharedWith: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

}, { timestamps: true });

// Index for fast lookups
brandSchema.index({ user: 1, status: 1 });
brandSchema.index({ 'sharedWith': 1 });

export default mongoose.model('Brand', brandSchema);

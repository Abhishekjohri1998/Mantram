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
        // All images scraped from the brand's homepage
        brandImages: [{
            url: { type: String },
            source: { type: String, default: 'website' },
            alt: { type: String, default: '' },
        }],
    },

    // Custom Categories — user-created template categories (e.g. Birthday, Anniversary)
    customCategories: [{
        categoryId: { type: String, required: true },
        label: { type: String, required: true },
        icon: { type: String, default: 'auto_awesome' },
        color: { type: String, default: '#f59e0b' },
        description: { type: String, default: '' },
        referenceImageUrl: { type: String, default: '' },
        basePromptFormula: { type: String, default: '' }, // AI-extracted style formula
        createdAt: { type: Date, default: Date.now },
    }],

    // Custom Templates — user-created sub-templates within categories
    customTemplates: [{
        templateId: { type: String, required: true },
        label: { type: String, required: true },
        icon: { type: String, default: 'auto_awesome' },
        description: { type: String, default: '' },
        category: { type: String, default: '' }, // parent category id (e.g. 'sales', 'events')
        type: { type: String, default: 'instagram-post' },
        style: { type: String, default: 'modern' },
        promptFormula: { type: String, default: '' },
        referenceImageUrl: { type: String, default: '' },
        fields: [{ key: String, label: String, type: { type: String, default: 'text' }, placeholder: String }],
        createdAt: { type: Date, default: Date.now },
    }],

    // Autonomous Agent Settings
    autonomy: {
        enabled: { type: Boolean, default: true },
        autoReplyConfidence: { type: Number, default: 75, min: 30, max: 100 },
        maxAutoRepliesPerConvo: { type: Number, default: 5 },
        commentAutoReply: { type: Boolean, default: false },
        commentToDM: { type: Boolean, default: true },
        callBookingEnabled: { type: Boolean, default: false },
        callBookingLink: { type: String, default: '' },
        followUpEnabled: { type: Boolean, default: false },
        followUpDelayHours: { type: Number, default: 24 },
        businessHours: {
            enabled: { type: Boolean, default: false },
            start: { type: String, default: '09:00' },
            end: { type: String, default: '18:00' },
            timezone: { type: String, default: 'Asia/Kolkata' },
        },
        escalationEmail: { type: String, default: '' },
        rateLimitPerConvo: { type: Number, default: 3 }, // max auto-replies per 5 min
    },

    // Extracted raw data from website scan
    rawScanData: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Brand Knowledge Bank — user-supplied knowledge (text, docs, URLs)
    knowledge: {
        entries: [{
            id: { type: String, required: true },
            sourceType: { type: String, enum: ['text', 'file', 'url'], required: true },
            title: { type: String, default: '' },
            content: { type: String, default: '' }, // extracted text content
            sourceUrl: { type: String, default: '' },
            fileName: { type: String, default: '' },
            charCount: { type: Number, default: 0 },
            addedAt: { type: Date, default: Date.now },
        }],
    },

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

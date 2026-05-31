import mongoose from 'mongoose';

const brandSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true },
    website: { type: String, default: '' },
    onboardingMethod: { type: String, enum: ['website', 'upload', 'brainstorm', 'local-search'], default: 'website' },
    status: { type: String, enum: ['active', 'draft', 'archived'], default: 'active' },

    // Brand DNA — the knowledge bank
    dna: {
        logo: {
            url: { type: String, default: '' },
            metadata: {
                weight: { type: String, default: '' },
                contrast: { type: String, default: '' },
                format: { type: String, default: '' },
                source: { type: String, default: '' },        // 'ai-vision' | 'selector' | 'ai-generated'
                confidence: { type: String, default: '' },     // 'high' | 'medium' | 'low'
                visionDescription: { type: String, default: '' }, // AI Vision description of the logo
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
            writingStyle: { type: String, default: '' },
            ctaStyle: { type: String, default: '' },
            emojiUsage: { type: String, default: 'minimal' },
            hashtagStyle: { type: String, default: 'minimal' },
            sentenceLength: { type: String, default: 'mixed' },
            captionLengthPreference: { type: String, default: 'medium' },
        },
        // Social media links detected from the website
        socialLinks: {
            instagram: { type: String, default: '' },
            facebook: { type: String, default: '' },
            twitter: { type: String, default: '' },
            linkedin: { type: String, default: '' },
            youtube: { type: String, default: '' },
            pinterest: { type: String, default: '' },
        },
        // Social media voice analysis — how the brand sounds on social
        socialVoice: {
            captionStyle: { type: String, default: '' },
            hashtagStrategy: { type: String, default: '' },
            emojiUsage: { type: String, default: '' },
            ctaStyle: { type: String, default: '' },
            postingPatterns: { type: String, default: '' },
            toneInsight: { type: String, default: '' },
            sampleCaptions: [String],
        },
        industry: { type: String, default: '' },
        targetAudience: { type: String, default: '' },
        brandDescription: { type: String, default: '' },
        tagline: { type: String, default: '' },
        photographyStyle: { type: String, default: '' },
        // Deep-crawl fields — extracted from About, Team, Products, Mission pages
        companyOverview: { type: String, default: '' },       // 1-2 sentence elevator pitch
        servicesOffered: [String],                            // List of products/services/capabilities
        uniqueSellingPoints: [String],                        // 3-5 differentiators
        missionStatement: { type: String, default: '' },      // Company mission
        brandValues: [String],                                // Core values
        country: { type: String, default: 'India' },
        region: { type: String, default: '' },
        // Target markets — ISO country codes, e.g. ['IN', 'US', 'UK', 'AE']
        // Used for market-aware festivals, content localization, and cultural context
        targetMarkets: { type: [String], default: [] },
        defaultLanguage: { type: String, default: 'english' },
        languageStyle: { type: String, default: 'pure' },
        // All images scraped from the brand's homepage
        brandImages: [{
            url: { type: String },
            source: { type: String, default: 'website' },
            alt: { type: String, default: '' },
        }],
        // Visual DNA — AI-extracted design intelligence for brand-consistent creative generation
        visualDNA: {
            designStyle: { type: String, default: '' },        // "minimalist" | "bold-graphic" | "luxury" | "playful" | "editorial" | "corporate"
            layoutPreference: { type: String, default: '' },   // "clean-centered" | "asymmetric" | "grid-based" | "full-bleed"
            textPlacement: { type: String, default: '' },      // "left-aligned" | "centered" | "overlay-on-image" | "below-image"
            imageMood: { type: String, default: '' },          // "bright-airy" | "dark-moody" | "warm-golden" | "cool-blue" | "high-contrast" | "muted-earthy"
            textureStyle: { type: String, default: '' },       // "flat-clean" | "textured-organic" | "gradient-rich" | "photographic" | "illustrated"
            typographyStyle: { type: String, default: '' },    // "sans-serif-modern" | "serif-elegant" | "bold-display" | "handwritten-casual"
            decorativeElements: { type: String, default: '' }, // "none" | "geometric-shapes" | "organic-curves" | "borders-frames" | "icons-badges"
            imageAnalysis: { type: String, default: '' },      // AI-generated summary of visual patterns from brand images
            designRules: [String],                             // "Always use ample white space" | "Headlines must be all-caps"
            designAvoid: [String],                             // "Never use busy patterns" | "Avoid neon colors"
            lastAnalyzedAt: { type: Date },
        },

        // Per-platform voice profiles — how the brand sounds differently on each platform
        // Used by Content Studio to generate platform-native content
        platformVoice: {
            instagram: {
                tone: { type: String, default: '' },
                captionStyle: { type: String, default: '' },
                hashtagStrategy: { type: String, default: '' },
                visualStyle: { type: String, default: '' },
                emojiUsage: { type: String, default: '' },
                avgCaptionLength: { type: String, default: '' },
                contentThemes: [String],
            },
            linkedin: {
                tone: { type: String, default: '' },
                captionStyle: { type: String, default: '' },
                articleStyle: { type: String, default: '' },
                professionalLevel: { type: String, default: '' },
                contentThemes: [String],
            },
            twitter: {
                tone: { type: String, default: '' },
                tweetStyle: { type: String, default: '' },
                threadUsage: { type: String, default: '' },
                hashtagStrategy: { type: String, default: '' },
                contentThemes: [String],
            },
            facebook: {
                tone: { type: String, default: '' },
                postStyle: { type: String, default: '' },
                engagementStyle: { type: String, default: '' },
                contentThemes: [String],
            },
        },

        // Competitive intelligence — auto-discovered during onboarding via MCP web_search
        competitiveIntel: {
            competitors: [{
                name: { type: String },
                url: { type: String, default: '' },
                strengths: { type: String, default: '' },
                weaknesses: { type: String, default: '' },
            }],
            marketPosition: { type: String, default: '' },     // "premium" / "mid-range" / "budget" / "niche"
            differentiators: [String],                          // AI-extracted from competitor comparison
            industryTrends: [String],                           // Current trends in the brand's industry
            competitorImages: [{ type: String }],               // Scraped competitor style/reference images
            lastAnalyzedAt: { type: Date },
        },

        // Public sentiment — from Google reviews, Trustpilot, social mentions
        publicSentiment: {
            overallSentiment: { type: String, default: '' },    // "positive" / "mixed" / "negative"
            rating: { type: String, default: '' },              // "4.5/5" etc.
            reviewHighlights: [String],                         // What customers love
            reviewConcerns: [String],                           // What customers complain about
            sentimentSummary: { type: String, default: '' },    // AI-written 2-3 sentence summary
            lastAnalyzedAt: { type: Date },
        },

        // Local Business Data — Google Maps / public listing details (local-search onboarding)
        localBusiness: {
            googleMapsUrl: { type: String, default: '' },
            address: { type: String, default: '' },
            phone: { type: String, default: '' },
            hours: { type: String, default: '' },
            rating: { type: String, default: '' },
            reviewCount: { type: String, default: '' },
            category: { type: String, default: '' },
            priceRange: { type: String, default: '' },
            discoveredWebsite: { type: String, default: '' },
        },
    },

    // Onboarding completeness — tracks which intelligence phases completed
    onboardingScore: { type: Number, default: 0, min: 0, max: 100 },
    onboardingPhases: {
        website: { type: Boolean, default: false },
        vision: { type: Boolean, default: false },
        subPages: { type: Boolean, default: false },
        social: { type: Boolean, default: false },
        competitors: { type: Boolean, default: false },
        sentiment: { type: Boolean, default: false },
        platformVoice: { type: Boolean, default: false },
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
// PERF-015: Compound index for sorted brand listing (covers the common query pattern)
brandSchema.index({ user: 1, status: 1, updatedAt: -1 });

// ── SEC-001: Strip internal-only fields from API responses ──
brandSchema.set('toJSON', {
    virtuals: true,
    transform: (_doc, ret) => {
        delete ret.__v;
        delete ret.rawScanData;        // Raw HTML/scan data — large, internal only
        delete ret.aiContext;           // Internal AI prompts and learnings — trade secret
        delete ret.sharedWith;          // ObjectID array of other users — privacy
        // Strip internal metadata timestamps from intelligence sections
        if (ret.dna?.competitiveIntel) delete ret.dna.competitiveIntel.lastAnalyzedAt;
        if (ret.dna?.publicSentiment) delete ret.dna.publicSentiment.lastAnalyzedAt;
        if (ret.dna?.visualDNA) delete ret.dna.visualDNA.lastAnalyzedAt;
        return ret;
    }
});

export default mongoose.model('Brand', brandSchema);

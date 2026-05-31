/**
 * YoutubeProject — Mongoose Model
 * Stores YouTube video analysis results
 */

import mongoose from 'mongoose';

const HighlightSchema = new mongoose.Schema({
    timestamp: String,
    title: String,
    why: String,
    emotionalMoment: String,
}, { _id: false });

const ChapterSchema = new mongoose.Schema({
    timestamp: String,
    title: String,
    description: String,
}, { _id: false });

const CharacterSchema = new mongoose.Schema({
    label: String,
    firstAppearance: String,
    role: String,
    screenTimePct: Number,
    visualDescription: String,  // What they actually look like (from Gemini watching the video)
    position: String,           // Where they appear (foreground-center, left-side, etc.)
    imageUrl: String,           // Extracted frame (Phase 2)
}, { _id: false });

const YoutubeProjectSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', index: true },
    channelConfigId: { type: mongoose.Schema.Types.ObjectId, ref: 'YoutubeChannelConfig', index: true },
    appliedTemplateId: { type: mongoose.Schema.Types.ObjectId, ref: 'ThumbnailTemplate' },
    showId:            { type: String, default: null },   // internalId of the show this project belongs to
    appliedShowName:   { type: String, default: null },   // display name (e.g. "Saru") for quick reference


    // Video identity
    videoId: { type: String, required: true },
    videoUrl: { type: String, required: true },

    // Processing state
    status: {
        type: String,
        enum: ['processing', 'analysing', 'done', 'failed'],
        default: 'processing',
    },
    error: String,
    processingTimeSecs: Number,
    completedAt: Date,

    // Metadata from YouTube Data API
    metadata: {
        title: String,
        description: String,
        channelTitle: String,
        channelId: String,
        publishedAt: Date,
        thumbnailUrl: String,
        tags: [String],
        duration: String, // ISO 8601
        viewCount: Number,
        likeCount: Number,
        commentCount: Number,
    },

    duration: String, // Human-readable "12:34"

    // Transcript
    transcript: {
        available: { type: Boolean, default: false },
        language: String,
        source: String,
        fullText: String,
        segments: [mongoose.Schema.Types.Mixed],
    },

    // Analysis (from MCoT)
    analysis: {
        summary: String,
        contentType: String,
        emotionalArc: String,
        tone: String,
        pacing: String,
        audienceAppeal: String,
        highlights: [HighlightSchema],
        characters: [CharacterSchema],
        keyThemes: [String],
        peakMoment: {               // The single most dramatic/share-worthy moment
            timestamp: String,
            title: String,
            sceneDescription: String,
            emotion: String,
        },
    },

    // Chapters
    chapters: [ChapterSchema],

    // SEO
    seo: {
        titles: [mongoose.Schema.Types.Mixed],
        recommendedTitle: String,
        description: mongoose.Schema.Types.Mixed,
        tags: [String],
        seoKeywords: [String],
        thumbnailTextSuggestion: String,
    },

    // Brand alignment
    brandAlignment: {
        overallScore: Number,
        dimensions: mongoose.Schema.Types.Mixed,
        verdict: String,
        recommendation: String,
        onBrandMoments: [String],
        offBrandMoments: [String],
    },

    // Thumbnail
    thumbnailDirection: mongoose.Schema.Types.Mixed,
    generatedThumbnailUrl: String,     // Phase 3: AI-generated thumbnail

    // Title Management
    titleMode: { type: String, enum: ['auto', 'manual'], default: 'auto' },
    approvedTitle: String,             // User-confirmed final title
    suggestedTitles: [mongoose.Schema.Types.Mixed], // AI-generated title options

    // Character Portraits (Phase 2)
    characterPortraits: [{
        label: String,
        role: String,
        firstAppearance: String,
        screenTimePct: Number,
        visualDescription: String,
        portraitUrl: String,           // AI-generated portrait image URL
        error: String,                 // If portrait generation failed
        _id: false,
    }],

    // New: Promo Cut Suggestions (from promoNode)
    promoCuts: [{
        order:        Number,
        startTime:    String,
        endTime:      String,
        durationSecs: Number,
        hookLine:     String,
        reason:       String,
        emotion:      String,
        platform:     String,
        socialCaption: String,
        _id: false,
    }],

    // New: Extracted YouTube CDN frames (from frameExtractionNode)
    extractedFrames: [{
        url:     String,
        label:   String,
        sizeKb:  Number,
        _id: false,
    }],

    // New: Which model generated the thumbnail
    generatorModel: String,

    // Real-time progress tracking for PM2 clustered environments
    nodesProgress: { type: mongoose.Schema.Types.Mixed, default: {} },

}, { timestamps: true });

// Index for efficient user queries
YoutubeProjectSchema.index({ userId: 1, createdAt: -1 });
YoutubeProjectSchema.index({ userId: 1, brandId: 1, createdAt: -1 });

export default mongoose.model('YoutubeProject', YoutubeProjectSchema);

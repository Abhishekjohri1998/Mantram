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
    imageUrl: String, // Extracted frame (Phase 2)
}, { _id: false });

const YoutubeProjectSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', index: true },

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
    generatedThumbnailUrl: String,     // Phase 3: FLUX-generated thumbnail

    // Character Portraits (Phase 2)
    characterPortraits: [{
        label: String,
        role: String,
        firstAppearance: String,
        screenTimePct: Number,
        portraitUrl: String,           // Gemini-generated portrait image URL
        error: String,                 // If portrait generation failed
        _id: false,
    }],

}, { timestamps: true });

// Index for efficient user queries
YoutubeProjectSchema.index({ userId: 1, createdAt: -1 });
YoutubeProjectSchema.index({ userId: 1, brandId: 1, createdAt: -1 });

export default mongoose.model('YoutubeProject', YoutubeProjectSchema);

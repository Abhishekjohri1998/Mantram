/**
 * ThumbnailTemplate — Mongoose Model
 *
 * A reusable visual blueprint for thumbnail generation.
 * Templates lock the STYLE (colors, fonts, layout, energy) while the
 * CONTENT comes from video analysis (peak moment, characters, title).
 *
 * Classification axes:
 *   - theme:    drama | music | news | education | comedy | lifestyle | sports | tech | reality-tv
 *   - language: english | hindi | hinglish | marathi | tamil | telugu | bengali | kannada | gujarati | punjabi | arabic | french | spanish
 *   - showName: custom show/series name (for multi-episode channels)
 *   - channel:  reference to which channel/brand this belongs to
 */

import mongoose from 'mongoose';

const ThumbnailTemplateSchema = new mongoose.Schema({
    userId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', index: true },

    // Identity
    name:        { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    emoji:       { type: String, default: '🎨' }, // Quick visual identifier
    previewUrl:  String,                           // Generated preview image URL

    // Classification (what this template is for)
    tags:   [String],  // Free-form tags: "sunday-special", "cricket-show", "product-launch" etc.
    classification: {
        theme:    {
            type: String,
            enum: ['drama', 'music', 'news', 'education', 'comedy', 'lifestyle', 'sports', 'tech', 'reality-tv', 'finance', 'devotional', 'politics', 'general'],
            default: 'general',
        },
        showName: String,   // e.g. "Kaun Banega Crorepati", "Tech Talk", "Sunday Special"
        language: {
            type: String,
            enum: ['english', 'hindi', 'hinglish', 'marathi', 'tamil', 'telugu', 'bengali', 'kannada', 'gujarati', 'punjabi', 'urdu', 'arabic', 'french', 'spanish', 'japanese'],
            default: 'english',
        },
        channel: String,   // Channel name / identifier
    },

    // Visual DNA — what the thumbnail should LOOK LIKE
    visual: {
        // Color palette
        primaryColor:   { type: String, default: '#FF0000' },  // Dominant color (hex)
        secondaryColor: { type: String, default: '#FFFFFF' },  // Accent / text color
        backgroundColor: { type: String, default: '#000000' }, // Background base color

        // Background treatment
        backgroundStyle: {
            type: String,
            enum: ['dramatic-dark', 'vibrant-gradient', 'cinematic-blur', 'solid-color', 'editorial-white', 'neon-glow', 'film-grain', 'watercolor', 'bold-flat'],
            default: 'dramatic-dark',
        },

        // Layout / composition
        composition: {
            type: String,
            enum: ['left-subject', 'right-subject', 'center', 'split-dual', 'full-bleed', 'portrait-crop'],
            default: 'center',
        },

        // Text / Title Styling
        titleFont: {
            type: String,
            enum: ['poppins-black', 'noto-devanagari-bold', 'bebas-neue', 'impact', 'montserrat-extrabold', 'baloo-bold', 'roboto-black', 'custom'],
            default: 'poppins-black',
        },
        titleColor:  { type: String, default: '#FFFFFF' },
        titleShadow: {
            type: String,
            enum: ['none', 'soft', 'hard-black', 'neon-glow', 'outlined'],
            default: 'hard-black',
        },

        // Overlay / mood
        overlayMood: {
            type: String,
            enum: ['none', 'dramatic-vignette', 'golden-warm', 'cool-cinematic', 'high-contrast', 'soft-blur-edge'],
            default: 'dramatic-vignette',
        },
        energyLevel: {
            type: String,
            enum: ['calm', 'energetic', 'intense', 'dramatic'],
            default: 'energetic',
        },

        // Logo
        logoPlacement: {
            type: String,
            enum: ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'none'],
            default: 'top-right',
        },
        logoSize: { type: String, enum: ['small', 'medium', 'large'], default: 'small' },
    },

    // Output language for this template's copy
    outputLanguage: {
        title:       { type: String, default: 'english' },
        description: { type: String, default: 'english' },
    },

    // Additional AI generation instructions (appended to the standard prompt)
    generationPromptSuffix: { type: String, default: '' },

    // Template flags
    isStarter:  { type: Boolean, default: false },  // Pre-built by Mantram AI
    isDefault:  { type: Boolean, default: false },  // User's default template
    isArchived: { type: Boolean, default: false },

    usageCount: { type: Number, default: 0 }, // Track how often this template is used

}, { timestamps: true });

ThumbnailTemplateSchema.index({ userId: 1, 'classification.theme': 1 });
ThumbnailTemplateSchema.index({ userId: 1, isDefault: 1 });
ThumbnailTemplateSchema.index({ isStarter: 1 });

export default mongoose.model('ThumbnailTemplate', ThumbnailTemplateSchema);

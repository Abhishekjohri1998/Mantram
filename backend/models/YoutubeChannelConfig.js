/**
 * YoutubeChannelConfig — Mongoose Model
 *
 * Per-user (per-brand) YouTube channel configuration.
 * Stores channel identity, default language preferences, logo settings,
 * and pointer to the active thumbnail template.
 *
 * One config per brand (brand-scoped), or one per user if no brand selected.
 */

import mongoose from 'mongoose';

const YoutubeChannelConfigSchema = new mongoose.Schema({
    userId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', index: true },

    // Channel identity
    channelName: { type: String, trim: true },
    channelId:   { type: String, trim: true },  // YouTube channel ID (UCxxxxxx)
    channelUrl:  { type: String, trim: true },
    niche:       { type: String, trim: true },  // "Tech", "Entertainment", "News" etc.

    // Logo
    logoUrl:       { type: String, trim: true },  // URL of channel logo/watermark
    logoPlacement: {
        type: String,
        enum: ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'none'],
        default: 'top-right',
    },

    // Default output languages
    defaultLanguage: {
        title:       { type: String, default: 'english' },
        description: { type: String, default: 'english' },
        tags:        { type: String, default: 'english' },
        thumbnail:   { type: String, default: 'english' }, // Text overlay on thumbnail
    },

    // Active template
    defaultTemplateId: { type: mongoose.Schema.Types.ObjectId, ref: 'ThumbnailTemplate' },

    // Title preferences
    titlePreferences: {
        defaultMode: { type: String, enum: ['auto', 'manual'], default: 'auto' }, // auto = original YT title
        maxLength:   { type: Number, default: 65 },   // YouTube recommended
        addEmoji:    { type: Boolean, default: false },
        style:       { type: String, enum: ['curiosity', 'number', 'how-to', 'bold-claim', 'auto'], default: 'auto' },
    },

    // Thumbnail preferences
    thumbnailPreferences: {
        alwaysIncludeLogo: { type: Boolean, default: true },
        showTitleText:     { type: Boolean, default: true },
        textLines:         { type: Number, default: 2, min: 1, max: 3 },
    },

    // SEO preferences
    seoPreferences: {
        includeChapters: { type: Boolean, default: true },
        includeHashtags: { type: Boolean, default: true },
        hashtagCount:    { type: Number, default: 5 },
    },

}, { timestamps: true });

// One config per user+brand combination
YoutubeChannelConfigSchema.index({ userId: 1, brandId: 1 }, { unique: true, sparse: true });
YoutubeChannelConfigSchema.index({ userId: 1 });

export default mongoose.model('YoutubeChannelConfig', YoutubeChannelConfigSchema);

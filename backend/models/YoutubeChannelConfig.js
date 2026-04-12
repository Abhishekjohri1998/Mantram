/**
 * YoutubeChannelConfig — Mongoose Model
 *
 * Multi-channel support: one document per channel per user.
 * A user can configure multiple YouTube channels, each with its own
 * identity, logo, language preferences, and default thumbnail template.
 *
 * Indexed on { userId, internalId } — internalId is a slug or UUID generated
 * client-side so users can have N channels without needing ytChannelId.
 */

import mongoose from 'mongoose';

const YoutubeChannelConfigSchema = new mongoose.Schema({
    userId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', index: true },

    // Internal identifier (slug) — allows multiple channels per user
    // Generated as `channel-${Date.now()}` or user-provided slug
    internalId: { type: String, required: true, trim: true },

    // Channel identity
    channelName: { type: String, trim: true, required: true },
    channelId:   { type: String, trim: true },  // YouTube channel ID (UCxxxxxx)
    channelUrl:  { type: String, trim: true },   // youtube.com/@handle
    niche:       { type: String, trim: true },   // "Tech", "Entertainment", etc.
    isDefault:   { type: Boolean, default: false }, // Default channel for new analyses

    // Logo
    logoUrl:       { type: String, trim: true },   // S3 URL of channel logo/watermark
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
        thumbnail:   { type: String, default: 'english' },
    },

    // Active template
    defaultTemplateId: { type: mongoose.Schema.Types.ObjectId, ref: 'ThumbnailTemplate' },

    // Title preferences
    titlePreferences: {
        defaultMode: { type: String, enum: ['auto', 'manual'], default: 'auto' },
        maxLength:   { type: Number, default: 65 },
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

    /**
     * Shows — named series/programmes within this channel.
     * Each show can have its own thumbnail template, language, and icon.
     * e.g. "Saru" → Bollywood Drama template, "Vasudha" → Lifestyle template
     */
    shows: [{
        showId:      { type: String, required: true },  // stable internal ID e.g. "show-1713500000000"
        showName:    { type: String, required: true, trim: true }, // "Saru", "Vasudha"
        showIcon:    { type: String, default: 'live_tv' }, // Material Symbols icon
        description: { type: String, trim: true },
        templateId:  { type: mongoose.Schema.Types.ObjectId, ref: 'ThumbnailTemplate' }, // show thumbnail theme
        language:    { type: String, default: '' }, // language override (blank = use channel default)
        _id: false,
    }],

}, { timestamps: true });

// Unique per user+internalId (allows multiple channels)
YoutubeChannelConfigSchema.index({ userId: 1, internalId: 1 }, { unique: true });
YoutubeChannelConfigSchema.index({ userId: 1, isDefault: 1 });

export default mongoose.model('YoutubeChannelConfig', YoutubeChannelConfigSchema);

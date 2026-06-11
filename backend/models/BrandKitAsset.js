import mongoose from 'mongoose';

/**
 * BrandKitAsset — stores all AI-generated brand assets
 * Supports: logo, stationery, brand guide, catalogue, collection, collateral
 */
const brandKitAssetSchema = new mongoose.Schema({
    user:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', default: null },

    // Asset classification
    assetType: {
        type: String,
        enum: ['identity', 'stationery', 'guide', 'catalogue', 'collection', 'collateral', 'moodboard'],
        required: true,
    },
    scope: {
        type: String,
        enum: ['brand', 'product', 'category', 'campaign', 'launch'],
        default: 'brand',
    },
    title:     { type: String, default: '' },
    brief:     { type: String, default: '' },
    scopeLabel: { type: String, default: '' }, // e.g., "Summer 2026 Collection", "New Product: AirPods Pro"

    // Art Director Intelligence — stored for re-use / display
    artDirectorIntelligence: {
        brandArchetype:    { type: String, default: '' }, // e.g., "The Creator", "The Hero"
        designMovement:    { type: String, default: '' }, // e.g., "Neo-Brutalism", "Quiet Luxury"
        colorStrategy:     { type: String, default: '' },
        typographyRationale: { type: String, default: '' },
        moodKeywords:      [String],
        trend2026:         { type: String, default: '' }, // Current design trend used
        artDirectorNotes:  { type: String, default: '' }, // Full reasoning from the art director agent
    },

    // Generated asset files
    assets: [{
        name:        { type: String },       // "Primary Logo Light", "Business Card Front", etc.
        assetSubType: { type: String },       // e.g., 'logo-primary', 'card-front', 'letterhead'
        imageUrl:    { type: String },        // S3 or CDN URL for image assets
        htmlContent: { type: String },        // For guide/catalogue HTML assets
        hostedUrl:   { type: String },        // S3-hosted URL for HTML assets
        s3Key:       { type: String },
        format:      { type: String, default: 'image' }, // 'image' | 'html' | 'svg' | 'json'
        width:       { type: Number },
        height:      { type: Number },
        prompt:      { type: String },        // The image prompt used (for transparency)
        thumbnailUrl: { type: String },
    }],

    // Moodboard images (for moodboard assets)
    moodboardImages: [{ type: String }],

    // Generation metadata
    imageModel:    { type: String, default: 'gpt-image-1' },
    llmModel:      { type: String, default: 'claude-3-5-sonnet-20241022' },
    creditsUsed:   { type: Number, default: 0 },
    status:        { type: String, enum: ['pending', 'generating', 'completed', 'failed'], default: 'completed' },
    errorMessage:  { type: String, default: '' },

}, { timestamps: true });

brandKitAssetSchema.index({ user: 1, brand: 1, assetType: 1 });
brandKitAssetSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model('BrandKitAsset', brandKitAssetSchema);

import mongoose from 'mongoose';

const creativeSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true },

    type: { type: String, enum: ['instagram-post', 'instagram-story', 'facebook-ad', 'linkedin-post', 'youtube-thumb', 'banner', 'twitter-post', 'pinterest', 'video', 'photoshoot', 'ai-photoshoot', 'virtual-tryon', 'lifestyle-mockup', 'logo-mockup', 'campaign', 'campaign-shot', 'campaign-logo', 'uploaded', 'product', 'sales', 'offer', 'promo', 'festival', 'testimonial', 'meme', 'infographic', 'announcement', 'quote', 'comparison', 'carousel', 'film-poster', 'hd-16-9', 'hd-wide', 'a4-portrait', 'square-hd', 'custom-size', 'other'], required: true },
    title: { type: String, default: '' },
    prompt: { type: String, default: '' },
    imageUrl: { type: String, default: '' },
    thumbnailUrl: { type: String, default: '' },
    dimensions: { width: Number, height: Number },

    // Design data
    designData: {
        style: { type: String, default: '' },
        layout: { type: String, default: '' },
        textOverlay: { type: String, default: '' },
        colors: [String],
        fonts: [String],
    },

    // AI-generated ON-IMAGE visual copy (generated when "Add Text to Image" is enabled)
    // These are text elements RENDERED ON THE IMAGE — not social captions
    copy: {
        headline: { type: String, default: '' },        // BIG text on image (2-6 words)
        subtext: { type: String, default: '' },          // Supporting line below headline
        ctaText: { type: String, default: '' },          // CTA button/badge text on image
        textStyle: { type: String, default: '' },        // Typography style guidance
        designRationale: { type: String, default: '' },  // Why this copy works
    },

    // AI metadata
    aiMeta: {
        provider: { type: String, default: '' },
        model: { type: String, default: '' },
        generationTime: { type: Number, default: 0 },
        brandAlignmentScore: { type: Number, default: 0, min: 0, max: 100 },
    },

    status: { type: String, enum: ['draft', 'approved', 'published', 'archived'], default: 'draft' },
    rating: { type: Number, min: 1, max: 5 },
    tags: [String],

    // Analytics counters — incremented by download/share events
    downloadCount: { type: Number, default: 0 },
    shareCount: { type: Number, default: 0 },
    fileSizeMB: { type: Number, default: 0 }, // estimated: (width*height*3)/1_048_576
}, { timestamps: true });

creativeSchema.index({ user: 1, brand: 1, type: 1 });
// PERF-016: Compound index for sorted listing queries
creativeSchema.index({ user: 1, brand: 1, createdAt: -1 });
creativeSchema.index({ user: 1, createdAt: -1 });
// Compound index for brand-filtered dashboard queries (without user filter)
creativeSchema.index({ brand: 1, createdAt: -1 }, { background: true });

export default mongoose.model('Creative', creativeSchema);

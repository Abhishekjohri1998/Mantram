import mongoose from 'mongoose';

const creativeSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true },

    type: { type: String, enum: ['instagram-post', 'instagram-story', 'facebook-ad', 'linkedin-post', 'youtube-thumb', 'banner', 'twitter-post', 'pinterest', 'video', 'photoshoot', 'ai-photoshoot', 'virtual-tryon', 'lifestyle-mockup', 'logo-mockup', 'campaign', 'campaign-logo', 'uploaded', 'product', 'other'], required: true },
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
}, { timestamps: true });

creativeSchema.index({ user: 1, brand: 1, type: 1 });

export default mongoose.model('Creative', creativeSchema);

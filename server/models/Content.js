import mongoose from 'mongoose';

const contentSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true },

    // Content details
    type: { type: String, enum: ['social', 'blog', 'ad', 'email', 'seo', 'caption', 'promote', 'celebrate', 'launch', 'educate', 'engage', 'brand', 'hijack', 'press_release', 'product_content', 'other'], required: true },
    title: { type: String, default: '' },
    content: { type: String, required: true },
    prompt: { type: String, default: '' }, // original user prompt
    platform: { type: String, default: '' }, // Instagram, LinkedIn, etc.

    // AI Generation metadata
    aiMeta: {
        provider: { type: String, default: '' },
        model: { type: String, default: '' },
        tokensUsed: { type: Number, default: 0 },
        generationTime: { type: Number, default: 0 }, // ms
        brandAlignmentScore: { type: Number, default: 0, min: 0, max: 100 },
        systemPromptUsed: { type: String, default: '' },
        temperature: { type: Number, default: 0.7 },
    },

    // User modifications (for RLHF)
    originalContent: { type: String, default: '' }, // AI's original output
    userEdited: { type: Boolean, default: false },
    editDiff: { type: String, default: '' }, // what the user changed

    // Status
    status: { type: String, enum: ['draft', 'approved', 'published', 'archived'], default: 'draft' },
    publishedAt: { type: Date },
    publishedTo: [{ platform: String, postId: String, url: String }],

    // Engagement (after publishing)
    engagement: {
        likes: { type: Number, default: 0 },
        comments: { type: Number, default: 0 },
        shares: { type: Number, default: 0 },
        views: { type: Number, default: 0 },
    },

    // User rating (for RLHF)
    rating: { type: Number, min: 1, max: 5 },

    // Tags
    tags: [String],

}, { timestamps: true });

contentSchema.index({ user: 1, brand: 1, type: 1 });
contentSchema.index({ status: 1 });

export default mongoose.model('Content', contentSchema);

import mongoose from 'mongoose';

const socialPostSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand' },

    // Target account
    platform: { type: String, required: true }, // instagram, facebook, linkedin
    accountId: { type: String, required: true },
    accountName: { type: String, default: '' },

    // Content
    caption: { type: String, default: '' },
    imageUrl: { type: String, default: '' },
    imageUrls: [{ type: String }], // For carousel/multi-image posts

    // Platform response
    postId: { type: String, default: '' },
    postUrl: { type: String, default: '' },

    // Status
    status: {
        type: String,
        enum: ['published', 'scheduled', 'failed', 'cancelled'],
        default: 'published'
    },
    error: { type: String, default: '' },

    // Scheduling
    scheduledFor: { type: Date },

    // Timestamps
    publishedAt: { type: Date },

}, { timestamps: true });

socialPostSchema.index({ user: 1, status: 1 });
socialPostSchema.index({ user: 1, brand: 1 });
socialPostSchema.index({ scheduledFor: 1, status: 1 });

export default mongoose.model('SocialPost', socialPostSchema);

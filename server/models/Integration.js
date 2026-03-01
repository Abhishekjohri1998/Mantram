import mongoose from 'mongoose';

const integrationSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand' },

    platform: {
        type: String,
        required: true,
        enum: ['shopify', 'instagram', 'facebook', 'linkedin', 'twitter', 'google-analytics'],
    },

    status: {
        type: String,
        enum: ['connected', 'disconnected', 'expired', 'pending'],
        default: 'pending',
    },

    // OAuth tokens (encrypted in production)
    accessToken: { type: String, default: '', select: false },
    refreshToken: { type: String, default: '', select: false },
    tokenExpiresAt: { type: Date },
    tokenExpiry: { type: Date },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Platform-specific data
    platformData: {
        // Shopify
        shopDomain: { type: String, default: '' },      // e.g. "my-store.myshopify.com"
        shopName: { type: String, default: '' },

        // Facebook
        pageId: { type: String, default: '' },
        pageName: { type: String, default: '' },
        pageAccessToken: { type: String, default: '', select: false },

        // Instagram
        igBusinessId: { type: String, default: '' },
        igUsername: { type: String, default: '' },

        // LinkedIn
        personUrn: { type: String, default: '' },
        organizationUrn: { type: String, default: '' },
        profileName: { type: String, default: '' },

        // Twitter / X
        twitterUserId: { type: String, default: '' },
        twitterUsername: { type: String, default: '' },
    },

    // Sync metadata
    lastSyncAt: { type: Date },
    syncCount: { type: Number, default: 0 },
    lastPublishAt: { type: Date },
    publishCount: { type: Number, default: 0 },

    // Profile info (display)
    profilePicture: { type: String, default: '' },
    displayName: { type: String, default: '' },
    profileUrl: { type: String, default: '' },

}, { timestamps: true });

integrationSchema.index({ user: 1, platform: 1 });
integrationSchema.index({ brand: 1, platform: 1 });

export default mongoose.model('Integration', integrationSchema);

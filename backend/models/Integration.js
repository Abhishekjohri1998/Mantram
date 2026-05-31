import mongoose from 'mongoose';

const integrationSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand' },

    platform: {
        type: String,
        required: true,
        enum: ['shopify', 'etsy', 'woocommerce', 'instagram', 'facebook', 'linkedin', 'twitter', 'google-analytics', 'meta-ads', 'google-ads'],
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

        // Meta Ads
        metaAdAccountId: { type: String, default: '' },
        metaBusinessId: { type: String, default: '' },

        // Google Ads
        googleAdsCustomerId: { type: String, default: '' },
        googleAdsManagerId: { type: String, default: '' },

        // Etsy
        etsyShopId: { type: String, default: '' },
        etsyShopName: { type: String, default: '' },
        etsyShopUrl: { type: String, default: '' },
        etsyDefaultShippingProfileId: { type: String, default: '' },
        etsyDefaultTaxonomyId: { type: String, default: '' },

        // WooCommerce / WordPress
        wooBaseUrl: { type: String, default: '' },
        wooSiteName: { type: String, default: '' },
        wooConsumerKey: { type: String, default: '', select: false },
        wooConsumerSecret: { type: String, default: '', select: false },
        wooVersion: { type: String, default: 'v3' },
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

integrationSchema.index({ user: 1, brand: 1, platform: 1 }); // Removed unique constraint for multi-store support
integrationSchema.index({ brand: 1, platform: 1 });
integrationSchema.index({ 'platformData.shopDomain': 1, platform: 1 });

// ── SEC-001: Strip OAuth tokens and platform secrets — defense-in-depth ──
integrationSchema.set('toJSON', {
    virtuals: true,
    transform: (_doc, ret) => {
        delete ret.accessToken;
        delete ret.refreshToken;
        delete ret.__v;
        if (ret.platformData) {
            delete ret.platformData.pageAccessToken;
            delete ret.platformData.wooConsumerKey;
            delete ret.platformData.wooConsumerSecret;
        }
        return ret;
    }
});

export default mongoose.model('Integration', integrationSchema);

import mongoose from 'mongoose';

/**
 * SubscriptionPackage — defines a subscription plan that super admin creates.
 * Each package specifies which studios are accessible, credit limits, and pricing.
 */
const subscriptionPackageSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    description: { type: String, default: '' },
    tagline: { type: String, default: '' }, // short marketing line

    // Tier level for ordering
    tier: { type: Number, default: 1 }, // 1=basic, 2=pro, 3=enterprise

    // Studio Access — which studios are included
    studios: {
        contentStudio: { type: Boolean, default: false },
        creativeStudio: { type: Boolean, default: false },
        seoStudio: { type: Boolean, default: false },
        brainstormStudio: { type: Boolean, default: false },
    },

    // Credit allocation
    credits: {
        monthly: { type: Number, default: 0 },        // credits per month
        rollover: { type: Boolean, default: false },   // unused credits roll over?
        bonusOnSignup: { type: Number, default: 0 },   // one-time signup bonus
    },

    // Per-studio credit costs (override global defaults if set)
    creditCosts: {
        content: { type: Number, default: 2 },
        creative: { type: Number, default: 5 },
        seo: { type: Number, default: 3 },
        brainstorm: { type: Number, default: 3 },
        photoshoot: { type: Number, default: 10 },
    },

    // Limits
    limits: {
        maxBrands: { type: Number, default: 1 },           // brands allowed
        maxTeamMembers: { type: Number, default: 0 },      // team seats
        maxProducts: { type: Number, default: 50 },         // products per brand
        maxScheduledPosts: { type: Number, default: 10 },   // scheduled posts
        socialIntegrations: { type: Number, default: 0 },   // social accounts
    },

    // Features
    features: [{
        name: { type: String },
        included: { type: Boolean, default: true },
        tooltip: { type: String, default: '' },
    }],

    // Pricing
    pricing: {
        monthly: { type: Number, default: 0 },
        quarterly: { type: Number, default: 0 },  // quarterly price (10% off)
        yearly: { type: Number, default: 0 },      // yearly price (20% off)
        currency: { type: String, default: 'INR' },
    },

    // Badges & styling
    badge: { type: String, default: '' },   // "POPULAR", "BEST VALUE", etc.
    color: { type: String, default: '#6366f1' }, // accent color for the card
    icon: { type: String, default: 'star' }, // material icon name

    // Status
    isActive: { type: Boolean, default: true },
    isDefault: { type: Boolean, default: false }, // assigned to new users
    displayOrder: { type: Number, default: 0 },

    // AI generation metadata
    generatedByAI: { type: Boolean, default: false },
    aiRationale: { type: String, default: '' }, // why AI created this package

    // Stats
    subscriberCount: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

subscriptionPackageSchema.index({ isActive: 1, displayOrder: 1 });

export default mongoose.model('SubscriptionPackage', subscriptionPackageSchema);

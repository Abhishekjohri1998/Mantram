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

    // Tier level for ordering (0=free, 1=creator, 2=professional, 3=business, 4=agency, 5=enterprise)
    tier: { type: Number, default: 1 },

    // Studio Access — which studios are included
    studios: {
        contentStudio: { type: Boolean, default: false },
        creativeStudio: { type: Boolean, default: false },
        seoStudio: { type: Boolean, default: false },
        brainstormStudio: { type: Boolean, default: false },
        videoStudio: { type: Boolean, default: false },
        socialMediaStudio: { type: Boolean, default: false },
        conversationStudio: { type: Boolean, default: false },
        adStudio: { type: Boolean, default: false },
        funnelStudio: { type: Boolean, default: false },
        d2cAnalytics: { type: Boolean, default: false },
        skillsHub: { type: Boolean, default: false },
    },

    // Credit allocation
    credits: {
        monthly: { type: Number, default: 0 },        // credits per month
        rollover: { type: Boolean, default: false },   // unused credits roll over?
        bonusOnSignup: { type: Number, default: 0 },   // one-time signup bonus
    },

    // Per-studio credit costs (override global defaults if set)
    // Updated May 2026 — aligned with 80% gross margin recalibration
    creditCosts: {
        content: { type: Number, default: 3 },
        creative: { type: Number, default: 8 },
        seo: { type: Number, default: 3 },
        brainstorm: { type: Number, default: 3 },
        photoshoot: { type: Number, default: 25 },
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
    watermarkEnabled: { type: Boolean, default: true }, // watermark on outputs (disable for premium)
    displayOrder: { type: Number, default: 0 },

    // AI generation metadata
    generatedByAI: { type: Boolean, default: false },
    aiRationale: { type: String, default: '' }, // why AI created this package

    // Contact-for-pricing (Agency & Enterprise — no Razorpay flow)
    contactForPricing: { type: Boolean, default: false }, // if true, UI shows "Contact Sales" instead of price
    contactEmail: { type: String, default: '' }, // email to contact for pricing

    // Stats
    subscriberCount: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

subscriptionPackageSchema.index({ isActive: 1, displayOrder: 1 });

export default mongoose.model('SubscriptionPackage', subscriptionPackageSchema);

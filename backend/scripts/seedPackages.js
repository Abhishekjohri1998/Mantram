import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SubscriptionPackage from '../models/SubscriptionPackage.js';
import connectDB from '../config/db.js';

dotenv.config();

// ════════════════════════════════════════════════════════
// Mantram AI — Subscription Packages (May 2026 Refresh)
// Target: 80%+ gross margin above API cost
// Pricing strategy inspired by Magnific (volume = differentiator, not features)
// Exchange rate: ₹93.21/USD
// ════════════════════════════════════════════════════════
const PACKAGES = [
    // ─────────────────────────────────────────────────────
    // TIER 0: Free (acquisition + lead gen)
    // ─────────────────────────────────────────────────────
    {
        name: 'Free',
        slug: 'free',
        tagline: 'Explore AI marketing for free',
        description: 'Get started with 100 free credits every month. No credit card required.',
        tier: 0,
        studios: {
            contentStudio: true,
            creativeStudio: true,
            seoStudio: false,
            brainstormStudio: true,
            videoStudio: false,
            socialMediaStudio: true,
            conversationStudio: false,
            adStudio: false,
            funnelStudio: false,
            d2cAnalytics: false,
            skillsHub: false,
        },
        credits: { monthly: 100, rollover: false, bonusOnSignup: 0 },
        pricing: { monthly: 0, quarterly: 0, yearly: 0, currency: 'INR' },
        limits: { maxBrands: 1, maxTeamMembers: 0, maxProducts: 10, maxScheduledPosts: 3, socialIntegrations: 1 },
        badge: 'FREE',
        color: '#94a3b8',
        icon: 'person',
        isDefault: true,
        watermarkEnabled: true,
        displayOrder: 0,
        contactForPricing: false,
        features: [
            { name: '100 Credits / month', included: true },
            { name: '1 Brand Profile', included: true },
            { name: 'Content & Brainstorm Studio', included: true },
            { name: 'Creative Studio (with watermark)', included: true },
            { name: 'Social Media Studio', included: true },
            { name: 'Community Support', included: true },
        ]
    },

    // ─────────────────────────────────────────────────────
    // TIER 1: Creator — ₹1,499/mo (was ₹999 Starter)
    // 200 credits/mo | Target: freelancers, solo brands
    // Magnific equivalent: Pro ($39)
    // ─────────────────────────────────────────────────────
    {
        name: 'Creator',
        slug: 'creator',
        tagline: 'For solopreneurs & freelancers',
        description: 'All essential AI studios, 200 credits monthly, and no watermarks. Perfect for individual creators and solo brands.',
        tier: 1,
        studios: {
            contentStudio: true,
            creativeStudio: true,
            seoStudio: true,
            brainstormStudio: true,
            videoStudio: false,   // Video credits can be top-upped, but Q-Ads locked
            socialMediaStudio: true,
            conversationStudio: false,
            adStudio: false,
            funnelStudio: false,
            d2cAnalytics: false,
            skillsHub: false,
        },
        credits: { monthly: 200, rollover: false, bonusOnSignup: 25 },
        // Annual: ₹14,990 = ₹1,249/mo (16% off)
        // Quarterly: ₹3,999 = ₹1,333/mo (11% off)
        pricing: { monthly: 1499, quarterly: 3999, yearly: 14990, currency: 'INR' },
        limits: { maxBrands: 1, maxTeamMembers: 0, maxProducts: 50, maxScheduledPosts: 20, socialIntegrations: 2 },
        badge: '',
        color: '#6366f1',
        icon: 'rocket_launch',
        isDefault: false,
        watermarkEnabled: false,
        displayOrder: 1,
        contactForPricing: false,
        features: [
            { name: '200 Credits / month', included: true },
            { name: '+25 Bonus Credits on signup', included: true },
            { name: '1 Brand Profile', included: true },
            { name: 'Content, Brainstorm & SEO Studios', included: true },
            { name: 'Creative Studio (no watermark)', included: true },
            { name: 'Social Media Studio', included: true },
            { name: 'Up to 50 Products', included: true },
            { name: 'Email Support', included: true },
        ]
    },

    // ─────────────────────────────────────────────────────
    // TIER 2: Professional — ₹3,499/mo
    // 600 credits/mo | Target: D2C brands, marketing teams
    // Magnific equivalent: Premium ($99)
    // ─────────────────────────────────────────────────────
    {
        name: 'Professional',
        slug: 'professional',
        tagline: 'For growing D2C brands & teams',
        description: 'Full studio access with 600 monthly credits, credit rollover, 3 team seats, and video generation. The complete AI marketing suite.',
        tier: 2,
        studios: {
            contentStudio: true,
            creativeStudio: true,
            seoStudio: true,
            brainstormStudio: true,
            videoStudio: true,
            socialMediaStudio: true,
            conversationStudio: true,
            adStudio: true,
            funnelStudio: true,
            d2cAnalytics: false,
            skillsHub: false,
        },
        credits: { monthly: 600, rollover: true, bonusOnSignup: 75 },
        // Annual: ₹34,990 = ₹2,916/mo (16% off)
        // Quarterly: ₹9,499 = ₹3,166/mo (9% off)
        pricing: { monthly: 3499, quarterly: 9499, yearly: 34990, currency: 'INR' },
        limits: { maxBrands: 3, maxTeamMembers: 3, maxProducts: 200, maxScheduledPosts: 50, socialIntegrations: 5 },
        badge: 'POPULAR',
        color: '#FF4D00',
        icon: 'trending_up',
        isDefault: false,
        watermarkEnabled: false,
        displayOrder: 2,
        contactForPricing: false,
        features: [
            { name: '600 Credits / month + rollover', included: true },
            { name: '+75 Bonus Credits on signup', included: true },
            { name: '3 Brand Profiles', included: true },
            { name: 'All AI Studios (incl. Video & Q-Ads)', included: true },
            { name: '3 Team Seats', included: true },
            { name: 'Up to 200 Products', included: true },
            { name: '50 Scheduled Posts / month', included: true },
            { name: 'Priority Email Support', included: true },
        ]
    },

    // ─────────────────────────────────────────────────────
    // TIER 3: Enterprise — Contact for Pricing
    // Unlimited | Target: large enterprise, multi-national brands
    // ─────────────────────────────────────────────────────
    {
        name: 'Enterprise',
        slug: 'enterprise',
        tagline: 'Unlimited AI power for enterprises',
        description: 'Unlimited credits, custom integrations, white-labeling, dedicated infrastructure, and a full-service onboarding team. For organizations that demand scale.',
        tier: 3,
        studios: {
            contentStudio: true,
            creativeStudio: true,
            seoStudio: true,
            brainstormStudio: true,
            videoStudio: true,
            socialMediaStudio: true,
            conversationStudio: true,
            adStudio: true,
            funnelStudio: true,
            d2cAnalytics: true,
            skillsHub: true,
        },
        credits: { monthly: 999999, rollover: true, bonusOnSignup: 0 },
        // contactForPricing: true — UI will show "Contact Sales" instead of price + payment
        pricing: { monthly: 0, quarterly: 0, yearly: 0, currency: 'INR' },
        limits: { maxBrands: 999, maxTeamMembers: 999, maxProducts: 99999, maxScheduledPosts: 99999, socialIntegrations: 999 },
        badge: 'ENTERPRISE',
        color: '#7c3aed',
        icon: 'diamond',
        isDefault: false,
        watermarkEnabled: false,
        displayOrder: 3,
        contactForPricing: true,
        contactEmail: 'enterprise@mantram.ai',
        features: [
            { name: 'Unlimited Credits & Rollover', included: true },
            { name: 'Unlimited Brand Profiles', included: true },
            { name: 'All AI Studios + Custom Integrations', included: true },
            { name: 'Unlimited Team Members', included: true },
            { name: 'Full White-Label (Custom Domain + Logo)', included: true },
            { name: 'Dedicated Infrastructure', included: true },
            { name: 'Custom AI Model Fine-Tuning', included: true },
            { name: '24/7 Dedicated Support + SLA', included: true },
        ]
    }
];

async function seed() {
    try {
        const conn = await connectDB();
        if (!conn) {
            console.error('❌ Failed to connect to MongoDB. Exiting.');
            process.exit(1);
        }
        console.log('✅ Connected to MongoDB');

        console.log('🧹 Clearing existing packages...');
        await SubscriptionPackage.deleteMany({});

        for (const pkg of PACKAGES) {
            await SubscriptionPackage.create(pkg);
            const priceStr = pkg.contactForPricing ? 'Contact for pricing' : `₹${pkg.pricing.monthly}/mo`;
            console.log(`📦 Seeded: ${pkg.name} (${priceStr}) — ${pkg.credits.monthly} credits/mo`);
        }

        console.log('\n✅ Subscription packages seeding complete.');
        console.log('📊 Summary:');
        console.log('   Free:         ₹0/mo   | 100 credits');
        console.log('   Creator:      ₹1,499/mo | 200 credits');
        console.log('   Professional: ₹3,499/mo | 600 credits  [POPULAR]');
        console.log('   Enterprise:   Contact   | Unlimited credits');
        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('❌ Seeding failed:', error.message);
        process.exit(1);
    }
}

seed();

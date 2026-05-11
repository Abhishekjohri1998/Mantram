import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SubscriptionPackage from '../models/SubscriptionPackage.js';

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
    // TIER 3: Business — ₹7,999/mo
    // 2,000 credits/mo | Target: established brands, agencies
    // Magnific equivalent: Business ($299)
    // ─────────────────────────────────────────────────────
    {
        name: 'Business',
        slug: 'business',
        tagline: 'For established brands & agencies',
        description: 'High-volume AI marketing with 2,000 monthly credits, 10 brands, 10 team seats, D2C Analytics, Avatar Studio, and priority support.',
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
        credits: { monthly: 2000, rollover: true, bonusOnSignup: 250 },
        // Annual: ₹79,990 = ₹6,666/mo (16% off)
        // Quarterly: ₹21,999 = ₹7,333/mo (8% off)
        pricing: { monthly: 7999, quarterly: 21999, yearly: 79990, currency: 'INR' },
        limits: { maxBrands: 10, maxTeamMembers: 10, maxProducts: 1000, maxScheduledPosts: 200, socialIntegrations: 10 },
        badge: 'BEST VALUE',
        color: '#f59e0b',
        icon: 'business_center',
        isDefault: false,
        watermarkEnabled: false,
        displayOrder: 3,
        contactForPricing: false,
        features: [
            { name: '2,000 Credits / month + 2-month rollover', included: true },
            { name: '+250 Bonus Credits on signup', included: true },
            { name: '10 Brand Profiles', included: true },
            { name: 'All AI Studios + D2C Analytics', included: true },
            { name: '10 Team Seats', included: true },
            { name: 'Avatar Studio Access', included: true },
            { name: 'Skills Hub Access', included: true },
            { name: 'Priority WhatsApp Support', included: true },
        ]
    },

    // ─────────────────────────────────────────────────────
    // TIER 4: Agency — Contact for Pricing
    // Custom credits | Target: performance marketing agencies
    // ─────────────────────────────────────────────────────
    {
        name: 'Agency',
        slug: 'agency',
        tagline: 'For performance marketing agencies',
        description: 'Custom credit pools, unlimited brands, up to 50 team seats, white-label reports, API access, and a dedicated account manager. Built for agencies at scale.',
        tier: 4,
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
        credits: { monthly: 10000, rollover: true, bonusOnSignup: 1000 },
        // contactForPricing: true — UI will show "Contact Sales" instead of price + payment
        pricing: { monthly: 0, quarterly: 0, yearly: 0, currency: 'INR' },
        limits: { maxBrands: 999, maxTeamMembers: 50, maxProducts: 9999, maxScheduledPosts: 9999, socialIntegrations: 50 },
        badge: 'FOR AGENCIES',
        color: '#ec4899',
        icon: 'groups',
        isDefault: false,
        watermarkEnabled: false,
        displayOrder: 4,
        contactForPricing: true,
        contactEmail: 'sales@mantram.ai',
        features: [
            { name: 'Custom Credit Pool (from 10,000/mo)', included: true },
            { name: 'Unlimited Brand Profiles', included: true },
            { name: 'All AI Studios + API Access', included: true },
            { name: 'Up to 50 Team Seats', included: true },
            { name: 'White-Label Reports', included: true },
            { name: 'Dedicated Account Manager', included: true },
            { name: 'Priority Generation Queue', included: true },
            { name: 'Custom SLA & Uptime Guarantee', included: true },
        ]
    },

    // ─────────────────────────────────────────────────────
    // TIER 5: Enterprise — Contact for Pricing
    // Unlimited | Target: large enterprise, multi-national brands
    // ─────────────────────────────────────────────────────
    {
        name: 'Enterprise',
        slug: 'enterprise',
        tagline: 'Unlimited AI power for enterprises',
        description: 'Unlimited credits, custom integrations, white-labeling, dedicated infrastructure, and a full-service onboarding team. For organizations that demand scale.',
        tier: 5,
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
        displayOrder: 5,
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
        await mongoose.connect(process.env.MONGODB_URI);
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
        console.log('   Business:     ₹7,999/mo | 2,000 credits [BEST VALUE]');
        console.log('   Agency:       Contact   | Custom credits [FOR AGENCIES]');
        console.log('   Enterprise:   Contact   | Unlimited credits');
        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('❌ Seeding failed:', error.message);
        process.exit(1);
    }
}

seed();

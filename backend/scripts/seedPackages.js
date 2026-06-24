import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
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
    // TIER 0: Free (hidden fallback tier)
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
        isActive: false, // Hidden from purchase/UI
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
    // TIER 1: Plus — $20/mo (₹1,800/mo) | $200/yr (₹18,000/yr)
    // 75 credits/mo
    // ─────────────────────────────────────────────────────
    {
        name: 'Plus',
        slug: 'plus',
        tagline: 'For exploring',
        description: 'Perfect for individual creators starting out with AI video and branding.',
        tier: 1,
        studios: {
            contentStudio: true,
            creativeStudio: true,
            seoStudio: true,
            brainstormStudio: true,
            videoStudio: false,
            socialMediaStudio: true,
            conversationStudio: false,
            adStudio: false,
            funnelStudio: false,
            d2cAnalytics: false,
            skillsHub: false,
        },
        credits: { monthly: 75, rollover: false, bonusOnSignup: 10 },
        pricing: { monthly: 1800, quarterly: 4999, yearly: 18000, currency: 'INR' },
        limits: { maxBrands: 1, maxTeamMembers: 0, maxProducts: 50, maxScheduledPosts: 20, socialIntegrations: 2 },
        badge: '',
        color: '#6366f1',
        icon: 'person',
        isDefault: false,
        isActive: true,
        watermarkEnabled: false,
        displayOrder: 1,
        contactForPricing: false,
        features: [
            { name: '75 Credits / month', included: true },
            { name: 'Access to all AI models (Seedance 2.0, Veo 3.1 & Kling 3)', included: true },
            { name: 'Access to all AI workflows & video trends', included: true },
            { name: '4 AI avatars & voice clones', included: true },
            { name: 'Limited concurrency', included: true },
            { name: '20 GB storage & 100 iStock credits', included: true },
            { name: 'Unlimited exports without watermark', included: true },
        ]
    },

    // ─────────────────────────────────────────────────────
    // TIER 2: Max — $100/mo (₹9,000/mo) | $1,000/yr (₹90,000/yr)
    // 390 credits/mo
    // ─────────────────────────────────────────────────────
    {
        name: 'Max',
        slug: 'max',
        tagline: 'For occasional use',
        description: 'Complete AI marketing suite with 390 monthly credits, team seats, and full studio access.',
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
        credits: { monthly: 390, rollover: true, bonusOnSignup: 50 },
        pricing: { monthly: 9000, quarterly: 24999, yearly: 90000, currency: 'INR' },
        limits: { maxBrands: 3, maxTeamMembers: 3, maxProducts: 200, maxScheduledPosts: 50, socialIntegrations: 5 },
        badge: 'MOST POPULAR',
        color: '#FF4D00',
        icon: 'trending_up',
        isDefault: false,
        isActive: true,
        watermarkEnabled: false,
        displayOrder: 2,
        contactForPricing: false,
        features: [
            { name: '390 Credits / month + rollover', included: true },
            { name: 'Access to all AI models (Seedance 2.0, Veo 3.1 & Kling 3)', included: true },
            { name: 'Access to all AI workflows & video trends', included: true },
            { name: '16 AI avatars & voice clones', included: true },
            { name: '2x more concurrency than Plus', included: true },
            { name: '100 GB storage & 200 iStock credits', included: true },
            { name: 'Unlimited exports without watermark', included: true },
        ]
    },

    // ─────────────────────────────────────────────────────
    // TIER 3: Generative — $200/mo (₹18,000/mo) | $2,000/yr (₹180,000/yr)
    // 800 credits/mo
    // ─────────────────────────────────────────────────────
    {
        name: 'Generative',
        slug: 'generative',
        tagline: 'For daily use',
        description: 'Optimized for high-volume content generation with massive storage and priority concurrency.',
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
        credits: { monthly: 800, rollover: true, bonusOnSignup: 100 },
        pricing: { monthly: 18000, quarterly: 48000, yearly: 180000, currency: 'INR' },
        limits: { maxBrands: 10, maxTeamMembers: 10, maxProducts: 1000, maxScheduledPosts: 200, socialIntegrations: 10 },
        badge: 'BEST VALUE',
        color: '#10b981',
        icon: 'auto_awesome',
        isDefault: false,
        isActive: true,
        watermarkEnabled: false,
        displayOrder: 3,
        contactForPricing: false,
        features: [
            { name: '800 Credits / month + rollover', included: true },
            { name: 'Access to all AI models (Seedance 2.0, Veo 3.1 & Kling 3)', included: true },
            { name: 'Access to all AI workflows & video trends', included: true },
            { name: '40 AI avatars & voice clones', included: true },
            { name: '10x more concurrency than Plus', included: true },
            { name: '2 TB storage & 1,000 iStock credits', included: true },
            { name: 'Unlimited exports without watermark', included: true },
        ]
    },

    // ─────────────────────────────────────────────────────
    // TIER 4: Elite — $1000/mo (₹90,000/mo) | $10,800/yr (₹972,000/yr)
    // 4250 credits/mo
    // ─────────────────────────────────────────────────────
    {
        name: 'Elite',
        slug: 'elite',
        tagline: 'For power creators',
        description: 'Elite scale package for agencies, studios, and high-growth content teams.',
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
        credits: { monthly: 4250, rollover: true, bonusOnSignup: 500 },
        pricing: { monthly: 90000, quarterly: 256500, yearly: 972000, currency: 'INR' },
        limits: { maxBrands: 999, maxTeamMembers: 999, maxProducts: 99999, maxScheduledPosts: 99999, socialIntegrations: 999 },
        badge: 'ELITE',
        color: '#7c3aed',
        icon: 'diamond',
        isDefault: false,
        isActive: true,
        watermarkEnabled: false,
        displayOrder: 4,
        contactForPricing: false,
        features: [
            { name: '4,250 Credits / month + rollover', included: true },
            { name: 'Access to all AI models (Seedance 2.0, Veo 3.1 & Kling 3)', included: true },
            { name: 'Access to all AI workflows & video trends', included: true },
            { name: '200 AI avatars & voice clones', included: true },
            { name: '20x more concurrency than Plus', included: true },
            { name: '10 TB storage & 5,000 iStock credits', included: true },
            { name: 'Unlimited exports without watermark', included: true },
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
        console.log('   Free:         ₹0/mo   | 100 credits (Inactive)');
        console.log('   Plus:         ₹1,800/mo | 75 credits');
        console.log('   Max:          ₹9,000/mo | 390 credits  [MOST POPULAR]');
        console.log('   Generative:   ₹18,000/mo | 800 credits  [BEST VALUE]');
        console.log('   Elite:        ₹90,000/mo | 4250 credits [ELITE]');
        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('❌ Seeding failed:', error.message);
        process.exit(1);
    }
}

// Run only if executed directly
const nodePath = process.argv[1] ? path.resolve(process.argv[1]) : '';
const filePath = fileURLToPath(import.meta.url);
if (nodePath && (nodePath === path.resolve(filePath) || nodePath.endsWith('seedPackages.js'))) {
    seed();
}

export { PACKAGES, seed };

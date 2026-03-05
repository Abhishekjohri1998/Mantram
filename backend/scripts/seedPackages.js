import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SubscriptionPackage from '../models/SubscriptionPackage.js';

dotenv.config();

const PACKAGES = [
    {
        name: 'Starter',
        slug: 'starter',
        tagline: 'Get started with AI marketing',
        description: 'Perfect for individuals and small brands getting started with AI-powered marketing.',
        tier: 1,
        studios: {
            contentStudio: true,
            creativeStudio: false,
            seoStudio: false,
            brainstormStudio: true,
            videoStudio: false,
            smartCalendar: true,
        },
        credits: { monthly: 50, rollover: false, bonusOnSignup: 10 },
        pricing: { monthly: 499, quarterly: 1349, yearly: 4999, currency: 'INR' },
        limits: { maxBrands: 1, maxTeamMembers: 0, maxProducts: 20, maxScheduledPosts: 5, socialIntegrations: 1 },
        badge: '',
        color: '#64748b',
        icon: 'rocket_launch',
        isDefault: true,
        displayOrder: 1,
        features: [
            { name: '1 Brand Profile', included: true },
            { name: '50 Credits / month', included: true },
            { name: 'Content & Brainstorm Studio', included: true },
            { name: 'Smart Calendar Access', included: true },
            { name: 'Email Support', included: true },
        ]
    },
    {
        name: 'Professional',
        slug: 'professional',
        tagline: 'Scale your brand with AI',
        description: 'Full studio access for comprehensive marketing with expanded limits.',
        tier: 2,
        studios: {
            contentStudio: true,
            creativeStudio: true,
            seoStudio: true,
            brainstormStudio: true,
            videoStudio: true,
            smartCalendar: true,
            adStudio: true,
        },
        credits: { monthly: 200, rollover: true, bonusOnSignup: 25 },
        pricing: { monthly: 1999, quarterly: 5399, yearly: 19999, currency: 'INR' },
        limits: { maxBrands: 3, maxTeamMembers: 2, maxProducts: 100, maxScheduledPosts: 30, socialIntegrations: 3 },
        badge: 'POPULAR',
        color: '#6366f1',
        icon: 'trending_up',
        displayOrder: 2,
        features: [
            { name: '3 Brand Profiles', included: true },
            { name: '200 Credits / month', included: true },
            { name: 'All 7 AI Studios Included', included: true },
            { name: 'Team Dashboard (2 seats)', included: true },
            { name: 'Priority Email Support', included: true },
            { name: 'Ad Studio Access', included: true },
        ]
    },
    {
        name: 'Agency',
        slug: 'agency',
        tagline: 'For marketing powerhouses',
        description: 'Built for agencies managing multiple brands with high volume needs.',
        tier: 2,
        studios: {
            contentStudio: true,
            creativeStudio: true,
            seoStudio: true,
            brainstormStudio: true,
            videoStudio: true,
            smartCalendar: true,
            adStudio: true,
            d2cAnalytics: true,
            conversationStudio: true,
        },
        credits: { monthly: 1000, rollover: true, bonusOnSignup: 100 },
        pricing: { monthly: 4999, quarterly: 13499, yearly: 49999, currency: 'INR' },
        limits: { maxBrands: 15, maxTeamMembers: 10, maxProducts: 500, maxScheduledPosts: 999, socialIntegrations: 15 },
        badge: 'FOR AGENCIES',
        color: '#ec4899',
        icon: 'business',
        displayOrder: 3,
        features: [
            { name: '15 Brand Profiles', included: true },
            { name: '1,000 Credits / month', included: true },
            { name: 'Full Studio Access (All 9)', included: true },
            { name: 'Agency Dashboard & Team (10 seats)', included: true },
            { name: 'Priority WhatsApp Support', included: true },
            { name: 'D2C Analytics Access', included: true },
        ]
    },
    {
        name: 'Enterprise',
        slug: 'enterprise',
        tagline: 'Unlimited AI power',
        description: 'Unlimited access for large organizations with priority support and white-labeling.',
        tier: 3,
        studios: {
            contentStudio: true,
            creativeStudio: true,
            seoStudio: true,
            brainstormStudio: true,
            videoStudio: true,
            smartCalendar: true,
            adStudio: true,
            d2cAnalytics: true,
            conversationStudio: true,
        },
        credits: { monthly: 999999, rollover: true, bonusOnSignup: 500 },
        pricing: { monthly: 9999, quarterly: 26999, yearly: 99999, currency: 'INR' },
        limits: { maxBrands: 999, maxTeamMembers: 20, maxProducts: 999, maxScheduledPosts: 999, socialIntegrations: 50 },
        badge: 'BEST VALUE',
        color: '#f59e0b',
        icon: 'diamond',
        displayOrder: 4,
        features: [
            { name: 'Unlimited Brand Profiles', included: true },
            { name: 'Unlimited Credits', included: true },
            { name: 'All 9 AI Studios Included', included: true },
            { name: 'Dedicated Support Account', included: true },
            { name: 'White Labeling (Custom Logo)', included: true },
            { name: 'Custom Domain Access', included: true },
        ]
    }
];

async function seed() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        for (const pkg of PACKAGES) {
            await SubscriptionPackage.findOneAndUpdate(
                { slug: pkg.slug },
                pkg,
                { upsert: true, new: true }
            );
            console.log(`📦 Seeded/Updated package: ${pkg.name}`);
        }

        console.log('\n✅ Subscription packages seeding complete.');
        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('❌ Seeding failed:', error.message);
        process.exit(1);
    }
}

seed();

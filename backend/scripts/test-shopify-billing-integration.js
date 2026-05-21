import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import fetch from 'node-fetch';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

// Load env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

// Set default test secret and JWT secret before importing config
process.env.SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || 'test-secret-key-12345';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'da-mantram-jwt-secret-key-change-in-production-2024';

// Import config (it will capture our set SHOPIFY_API_SECRET)
import config from '../config/env.js';

// Import models
import User from '../models/User.js';
import Integration from '../models/Integration.js';
import SubscriptionPackage from '../models/SubscriptionPackage.js';
import CreditPack from '../models/CreditPack.js';
import Subscription from '../models/Subscription.js';

// Import routers
import paymentsRouter from '../routes/payments.js';
import shopifyRouter from '../routes/shopify.js';

async function runTests() {
    let server;
    try {
        console.log('🔗 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Create a test Express app
        const app = express();
        
        // Capture raw body for Shopify Webhooks (mimicking main index.js setup)
        app.use((req, res, next) => {
            if (!req.originalUrl.startsWith('/api/shopify/webhooks')) return next();
            express.raw({ type: '*/*', limit: '50mb' })(req, res, (err) => {
                if (err) return next(err);
                if (Buffer.isBuffer(req.body)) {
                    req.rawBody = req.body;
                    try {
                        const bodyString = req.body.toString('utf8');
                        if (bodyString && (bodyString.startsWith('{') || bodyString.startsWith('['))) {
                            req.body = JSON.parse(bodyString);
                        }
                    } catch (e) {
                        console.warn('⚠️ Webhook body is not valid JSON, but rawBody captured');
                    }
                }
                next();
            });
        });

        app.use(express.json());
        
        // Setup routes
        app.use('/api/payments', paymentsRouter);
        app.use('/api/shopify', shopifyRouter);

        const PORT = 4040;
        
        // Mock Shopify GraphQL endpoint on our test server
        app.post('/admin/api/2025-01/graphql.json', (req, res) => {
            const { query, variables } = req.body;
            console.log(`   [Mock GraphQL API] Received query: ${query.trim().split('\n')[0]}`);
            
            if (query.includes('appSubscriptionCreate')) {
                return res.json({
                    data: {
                        appSubscriptionCreate: {
                            appSubscription: {
                                id: 'gid://shopify/AppSubscription/123',
                                status: 'PENDING'
                            },
                            confirmationUrl: `http://localhost:${PORT}/mock-shopify-approve-page`,
                            userErrors: []
                        }
                    }
                });
            }
            
            if (query.includes('appPurchaseOneTimeCreate')) {
                return res.json({
                    data: {
                        appPurchaseOneTimeCreate: {
                            appPurchaseOneTime: {
                                id: 'gid://shopify/AppPurchaseOneTime/456',
                                status: 'PENDING'
                            },
                            confirmationUrl: `http://localhost:${PORT}/mock-shopify-approve-page`,
                            userErrors: []
                        }
                    }
                });
            }
            
            if (query.includes('getSubscription')) {
                return res.json({
                    data: {
                        node: {
                            id: variables.id,
                            name: 'Mantram AI - Creator Plan (monthly)',
                            status: 'ACTIVE',
                            createdAt: new Date().toISOString(),
                            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                            test: true,
                            lineItems: [
                                {
                                    id: 'gid://shopify/AppSubscriptionLineItem/1',
                                    plan: {
                                        price: {
                                            amount: '19.99',
                                            currencyCode: 'USD'
                                        }
                                    }
                                }
                            ]
                        }
                    }
                });
            }
            
            if (query.includes('getOneTimePurchase')) {
                return res.json({
                    data: {
                        node: {
                            id: variables.id,
                            name: 'Mantram AI - Micro Pack',
                            status: 'ACTIVE',
                            createdAt: new Date().toISOString(),
                            price: {
                                amount: '1.99',
                                currencyCode: 'USD'
                            },
                            test: true
                        }
                    }
                });
            }
            
            if (query.includes('appSubscriptionCancel')) {
                return res.json({
                    data: {
                        appSubscriptionCancel: {
                            appSubscription: {
                                id: variables.id,
                                status: 'CANCELLED'
                            },
                            userErrors: []
                        }
                    }
                });
            }
            
            return res.status(400).json({ error: `Mock GraphQL got unknown query: ${query}` });
        });

        server = app.listen(PORT, () => {
            console.log(`📡 Temporary test server running on port ${PORT}`);
        });

        // 1. Get or create a test user
        let user = await User.findOne({ email: 'billing-test-user@mantram.ai' });
        if (!user) {
            console.log('👤 Creating test user...');
            user = await User.create({
                name: 'Billing Test User',
                email: 'billing-test-user@mantram.ai',
                password: 'testpassword123',
                role: 'user',
                plan: 'starter'
            });
        }

        // Generate token for testing
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };

        // 2. Ensure Razorpay is detected by default (no Shopify integration)
        console.log('🧪 Test 1: Provider detection (No Shopify connected)');
        await Integration.deleteMany({ user: user._id, platform: 'shopify' });
        
        let res = await fetch(`http://localhost:${PORT}/api/payments/billing-provider`, { headers });
        let data = await res.json();
        console.log('Response:', data);
        if (!data.success || data.provider !== 'razorpay') {
            throw new Error(`Expected provider to be razorpay, got ${data.provider}`);
        }
        console.log('✅ Test 1 Passed');

        // 3. Connect a dummy Shopify integration and test billing provider detection
        console.log('🧪 Test 2: Provider detection (Shopify connected)');
        // Use 127.0.0.1:4040 as domain so fetch is routed back to our local Express app
        await Integration.create({
            user: user._id,
            platform: 'shopify',
            status: 'connected',
            accessToken: 'dummy-access-token',
            platformData: { shopDomain: `127.0.0.1:${PORT}`, shopName: 'Test Store' }
        });

        res = await fetch(`http://localhost:${PORT}/api/payments/billing-provider`, { headers });
        data = await res.json();
        console.log('Response:', data);
        if (!data.success || data.provider !== 'shopify' || data.shopDomain !== `127.0.0.1:${PORT}`) {
            throw new Error(`Expected provider to be shopify and shopDomain to be 127.0.0.1:${PORT}, got ${JSON.stringify(data)}`);
        }
        console.log('✅ Test 2 Passed');

        // 4. Test packages retrieval
        console.log('🧪 Test 3: Get Subscription Packages');
        // Ensure at least one package exists in DB
        let pkg = await SubscriptionPackage.findOne({ slug: 'creator' });
        if (!pkg) {
            pkg = await SubscriptionPackage.create({
                name: 'Creator',
                slug: 'creator',
                pricing: { monthly: 1490, yearly: 14900, currency: 'INR' },
                credits: { monthly: 1000 },
                displayOrder: 1
            });
        }

        res = await fetch(`http://localhost:${PORT}/api/payments/packages`);
        data = await res.json();
        if (!data.success || !Array.isArray(data.packages) || data.packages.length === 0) {
            throw new Error('Failed to get subscription packages');
        }
        console.log('✅ Test 3 Passed');

        // 5. Test topup packs retrieval
        console.log('🧪 Test 4: Get Top-up Packs');
        let pack = await CreditPack.findOne({ slug: 'micro' });
        if (!pack) {
            pack = await CreditPack.create({
                name: 'Micro',
                slug: 'micro',
                price: 149,
                credits: 100,
                isActive: true,
                displayOrder: 1
            });
        }

        res = await fetch(`http://localhost:${PORT}/api/payments/topup-packs`, { headers });
        data = await res.json();
        if (!data.success || !Array.isArray(data.standardPacks) || data.standardPacks.length === 0) {
            throw new Error('Failed to get credit packs');
        }
        console.log('✅ Test 4 Passed');

        // 6. Test shopify subscription creation endpoint
        console.log('🧪 Test 5: Shopify Create Subscription');
        res = await fetch(`http://localhost:${PORT}/api/payments/shopify/create-subscription`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ packageId: pkg._id, billingCycle: 'monthly' })
        });
        data = await res.json();
        console.log('Response:', data);
        if (!data.success || data.chargeId !== 'gid://shopify/AppSubscription/123') {
            throw new Error(`Failed to create Shopify subscription, got ${JSON.stringify(data)}`);
        }
        console.log('✅ Test 5 Passed');

        // 7. Test shopify subscription callback endpoint
        console.log('🧪 Test 6: Shopify Subscription Callback (Simulating merchant approval)');
        const callbackUrl = `http://localhost:${PORT}/api/payments/shopify/callback?charge_id=gid://shopify/AppSubscription/123&userId=${user._id}&packageId=${pkg._id}&billingCycle=monthly&shop=127.0.0.1:${PORT}`;
        
        res = await fetch(callbackUrl, { redirect: 'manual' });
        console.log('Callback Response Status:', res.status);
        console.log('Callback Redirect Target:', res.headers.get('location'));
        if (res.status !== 302 || !res.headers.get('location').includes('shopify_billing=success')) {
            throw new Error(`Callback failed or didn't redirect to success, status: ${res.status}, location: ${res.headers.get('location')}`);
        }
        
        // Verify database upgrades
        const updatedUser = await User.findById(user._id);
        const sub = await Subscription.findOne({ user: user._id, status: 'active' });
        if (!sub || sub.plan !== pkg.slug || sub.paymentMethod !== 'shopify') {
            throw new Error(`Subscription not created/updated correctly: ${JSON.stringify(sub)}`);
        }
        if (updatedUser.plan !== pkg.slug) {
            throw new Error(`User plan not upgraded, got ${updatedUser.plan}`);
        }
        console.log('✅ Test 6 Passed');

        // 8. Test shopify topup creation endpoint
        console.log('🧪 Test 7: Shopify Create Topup');
        res = await fetch(`http://localhost:${PORT}/api/payments/shopify/create-topup`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ packId: pack._id })
        });
        data = await res.json();
        console.log('Response:', data);
        if (!data.success || data.chargeId !== 'gid://shopify/AppPurchaseOneTime/456') {
            throw new Error(`Failed to create Shopify topup, got ${JSON.stringify(data)}`);
        }
        console.log('✅ Test 7 Passed');

        // 9. Test shopify topup callback endpoint
        console.log('🧪 Test 8: Shopify Topup Callback');
        const initialCredits = updatedUser.credits?.topUp || 0;
        const topupCallbackUrl = `http://localhost:${PORT}/api/payments/shopify/topup-callback?charge_id=gid://shopify/AppPurchaseOneTime/456&userId=${user._id}&packId=${pack._id}&shop=127.0.0.1:${PORT}`;
        
        res = await fetch(topupCallbackUrl, { redirect: 'manual' });
        console.log('Topup Callback Response Status:', res.status);
        console.log('Topup Callback Redirect Target:', res.headers.get('location'));
        if (res.status !== 302 || !res.headers.get('location').includes('shopify_topup=success')) {
            throw new Error(`Topup callback failed, status: ${res.status}, location: ${res.headers.get('location')}`);
        }
        
        // Verify user credits increased
        const finalUser = await User.findById(user._id);
        const addedCredits = finalUser.credits.topUp - initialCredits;
        console.log(`Credits before topup: ${initialCredits}, after topup: ${finalUser.credits.topUp} (added: ${addedCredits})`);
        if (addedCredits <= 0) {
            throw new Error(`Credits not added to user, before: ${initialCredits}, after: ${finalUser.credits.topUp}`);
        }
        console.log('✅ Test 8 Passed');

        // 10. Test shopify cancel subscription endpoint
        console.log('🧪 Test 9: Shopify Cancel Subscription');
        res = await fetch(`http://localhost:${PORT}/api/payments/shopify/cancel-subscription`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ reason: 'testing cancellation' })
        });
        data = await res.json();
        console.log('Response:', data);
        if (!data.success || data.subscription.status !== 'cancelled') {
            throw new Error(`Failed to cancel subscription, got: ${JSON.stringify(data)}`);
        }
        
        const cancelledSub = await Subscription.findById(sub._id);
        if (cancelledSub.status !== 'cancelled' || cancelledSub.autoRenew !== false) {
            throw new Error(`Subscription not updated to cancelled in DB: ${JSON.stringify(cancelledSub)}`);
        }
        console.log('✅ Test 9 Passed');

        // 11. Test shopify webhook app-subscriptions-update endpoint
        console.log('🧪 Test 10: Shopify Webhook app-subscriptions-update (expired)');
        
        // Let's reactivate the subscription first to test webhook expiration
        cancelledSub.status = 'active';
        await cancelledSub.save();
        
        const webhookBody = JSON.stringify({
            app_subscription: {
                admin_graphql_api_id: sub.transactionId,
                status: 'EXPIRED'
            }
        });
        
        const secret = process.env.SHOPIFY_API_SECRET;
        const hmac = crypto.createHmac('sha256', secret).update(webhookBody).digest('base64');
        
        res = await fetch(`http://localhost:${PORT}/api/shopify/webhooks/app-subscriptions-update`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Hmac-Sha256': hmac,
                'X-Shopify-Topic': 'app_subscriptions/update',
                'X-Shopify-Shop-Domain': `127.0.0.1:${PORT}`
            },
            body: webhookBody
        });
        
        data = await res.json();
        console.log('Webhook Response:', data);
        if (res.status !== 200 || !data.received) {
            throw new Error(`Webhook failed, status: ${res.status}, response: ${JSON.stringify(data)}`);
        }
        
        // Verify sub is now expired and user is on free plan
        const expiredSub = await Subscription.findById(sub._id);
        const freeUser = await User.findById(user._id);
        if (expiredSub.status !== 'expired') {
            throw new Error(`Subscription status should be expired, got ${expiredSub.status}`);
        }
        if (freeUser.plan !== 'free') {
            throw new Error(`User plan should be downgraded to free, got ${freeUser.plan}`);
        }
        console.log('✅ Test 10 Passed');

        // Cleanup
        await Subscription.deleteMany({ user: user._id });
        await Integration.deleteMany({ user: user._id });
        await User.deleteOne({ _id: user._id });
        console.log('🧹 Cleanup complete');
        console.log('\n🌟 ALL BILLING ROUTE INTEGRATION TESTS PASSED SUCCESSFULLY! 🌟\n');
        
        server.close();
        process.exit(0);

    } catch (error) {
        console.error('❌ Test failed with error:', error);
        if (server) server.close();
        process.exit(1);
    }
}

runTests();

/**
 * Shopify Routes
 * Handles Shopify OAuth, product sync, and catalog management.
 *
 * FLOW (Standard OAuth — works for ANY merchant store):
 *   1. POST /connect  → builds standard Shopify OAuth URL with state
 *   2. Frontend redirects user to that URL (full-page, NOT a popup)
 *   3. Merchant sees "Install Mantram AI Connect" on their Shopify Admin
 *   4. Merchant clicks Install → Shopify calls GET /callback with code + shop + state
 *   5. Callback exchanges code for access_token, saves integration to DB
 *   6. User redirected to mantram.ai/integrations?shopify=connected
 */

import { Router } from 'express';
import crypto from 'crypto';
import { protect } from '../middleware/auth.js';
import Integration from '../models/Integration.js';
import Product from '../models/Product.js';
import ShopifyOrder from '../models/ShopifyOrder.js';
import ShopifyCustomer from '../models/ShopifyCustomer.js';
import {
    getShopifyAuthUrl,
    exchangeShopifyToken,
    fetchShopifyProducts,
    transformShopifyProduct,
    getShopInfo,
    syncStoreData,
    registerShopifyWebhooks,
    transformShopifyOrder,
    transformShopifyCustomer
} from '../services/shopifyService.js';
import config from '../config/env.js';
import { verifyShopifyWebhook } from '../middleware/shopifyWebhookAuth.js';
import { verifyShopifySessionToken } from '../middleware/shopifySessionAuth.js';
import { safeErrorMessage } from '../utils/safeError.js';

const router = Router();

// GET /api/shopify/status — Check connection status (brand-aware)
router.get('/status', protect, async (req, res) => {
    try {
        const query = { user: req.user._id, platform: 'shopify' };
        if (req.query.brandId) query.brand = req.query.brandId;
        const integration = await Integration.findOne(query);
        if (integration) {
            res.json({
                success: true,
                status: {
                    connected: integration.status === 'connected',
                    status: integration.status,
                    shopDomain: integration.platformData?.shopDomain || '',
                    shopName: integration.platformData?.shopName || '',
                    displayName: integration.displayName || integration.platformData?.shopName || '',
                    lastSyncAt: integration.lastSyncAt
                }
            });
        } else {
            res.json({ success: true, status: { connected: false, status: 'disconnected' } });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to fetch Shopify status' });
    }
});

// POST /api/shopify/connect — Initiate Shopify OAuth
// Works for ANY merchant store. Returns an authUrl the frontend must redirect to.
router.post('/connect', protect, async (req, res) => {
    try {
        const { shopDomain, brandId } = req.body;
        if (!shopDomain) {
            return res.status(400).json({ success: false, error: 'Shop domain is required (e.g. my-store.myshopify.com)' });
        }

        const clientId = config.shopify.apiKey;
        if (!clientId) {
            return res.status(500).json({ success: false, error: 'Shopify app not configured. Add SHOPIFY_API_KEY to .env' });
        }

        const cleanDomain = shopDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
        const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`;
        const redirectUri = `${backendUrl}/api/shopify/callback`;
        const scopes = process.env.SHOPIFY_SCOPES || 'read_products,read_orders,read_customers';

        // Encode userId + brandId in state so /callback can identify which user is connecting
        const statePayload = Buffer.from(
            JSON.stringify({ userId: String(req.user._id), brandId: brandId || '' })
        ).toString('base64');

        // Standard OAuth URL: https://{shop}/admin/oauth/authorize?client_id=...&scope=...&redirect_uri=...&state=...
        const authUrl = getShopifyAuthUrl(cleanDomain, clientId, redirectUri, scopes) + `&state=${statePayload}`;

        // Save a pending integration record so /callback can find and update it
        await Integration.findOneAndUpdate(
            {
                user: req.user._id,
                platform: 'shopify',
                ...(brandId ? { brand: brandId } : { brand: { $exists: false } })
            },
            {
                user: req.user._id,
                platform: 'shopify',
                status: 'pending',
                brand: brandId || undefined,
                platformData: { shopDomain: cleanDomain },
            },
            { upsert: true, returnDocument: 'after' }
        );

        console.log(`🔗 Shopify OAuth started for ${cleanDomain} → redirect: ${redirectUri}`);
        res.json({ success: true, authUrl, shopDomain: cleanDomain });
    } catch (error) {
        console.error('Shopify connect error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// POST /api/shopify/connect-token — Direct access token connection
// Used when a merchant generates a Custom App token from their own Shopify Admin.
router.post('/connect-token', protect, async (req, res) => {
    try {
        const { shopDomain, accessToken, brandId } = req.body;
        if (!shopDomain || !accessToken) {
            return res.status(400).json({ success: false, error: 'Shop domain and access token are required' });
        }

        const cleanDomain = shopDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');

        let shopInfo;
        try {
            shopInfo = await getShopInfo(accessToken, cleanDomain);
        } catch (err) {
            return res.status(400).json({ success: false, error: `Invalid token or domain — Shopify returned: ${err.message}` });
        }

        const query = {
            user: req.user._id,
            platform: 'shopify',
            ...(brandId ? { brand: brandId } : { brand: { $exists: false } })
        };

        await Integration.findOneAndUpdate(
            query,
            {
                user: req.user._id,
                platform: 'shopify',
                status: 'connected',
                accessToken,
                brand: brandId || undefined,
                displayName: shopInfo.name || cleanDomain,
                profileUrl: `https://${cleanDomain}`,
                platformData: { shopDomain: cleanDomain, shopName: shopInfo.name },
            },
            { upsert: true, returnDocument: 'after' }
        );

        console.log(`✅ Shopify connected via token: ${shopInfo.name} (${cleanDomain})`);

        const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`;
        syncStoreData(accessToken, cleanDomain, req.user._id, brandId || undefined, { Product, ShopifyOrder, ShopifyCustomer })
            .then(r => console.log(`📦 Initial sync complete for ${cleanDomain}:`, r))
            .catch(err => console.error(`❌ Initial sync failed for ${cleanDomain}:`, err));

        registerShopifyWebhooks(accessToken, cleanDomain, backendUrl)
            .then(r => console.log(`🔗 Webhooks registered for ${cleanDomain}:`, r.filter(x => x.success).map(x => x.topic)))
            .catch(err => console.error(`❌ Webhook registration failed for ${cleanDomain}:`, err));

        res.json({ success: true, shopName: shopInfo.name, shopDomain: cleanDomain });
    } catch (error) {
        console.error('Shopify connect-token error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// GET /api/shopify/callback — Shopify OAuth Callback
// Shopify redirects here after the merchant clicks "Install".
router.get('/callback', async (req, res) => {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    try {
        const { code, shop, state } = req.query;
        if (!code || !shop) return res.redirect(`${frontendUrl}/integrations?error=missing_params`);

        const clientId = config.shopify.apiKey;
        const clientSecret = config.shopify.apiSecret;

        console.log(`🔄 Shopify callback: shop=${shop}`);

        const tokenData = await exchangeShopifyToken(shop, clientId, clientSecret, code);

        // Decode state to retrieve userId + brandId that were set during /connect
        let userId = null, brandId = null;
        if (state) {
            try {
                const decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
                userId = decoded.userId;
                brandId = decoded.brandId || null;
            } catch { /* state decode failed — continue without it */ }
        }

        const query = { platform: 'shopify' };
        if (userId) query.user = userId;
        if (brandId) query.brand = brandId;
        else query.brand = { $exists: false };

        const integration = await Integration.findOneAndUpdate(
            query,
            {
                accessToken: tokenData.access_token,
                status: 'connected',
                'platformData.shopDomain': shop,
                ...(brandId ? { brand: brandId } : {}),
            },
            { returnDocument: 'after' }
        );

        if (integration) {
            try {
                const shopInfo = await getShopInfo(tokenData.access_token, shop);
                integration.platformData.shopName = shopInfo.name;
                integration.displayName = shopInfo.name;
                integration.profileUrl = `https://${shop}`;
                await integration.save();
                console.log(`✅ Shopify connected: ${shopInfo.name} (${shop})`);

                const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`;
                syncStoreData(tokenData.access_token, shop, userId, integration.brand, { Product, ShopifyOrder, ShopifyCustomer })
                    .then(r => console.log(`📦 Initial sync complete for ${shop}:`, r))
                    .catch(err => console.error(`❌ Initial sync failed for ${shop}:`, err));

                registerShopifyWebhooks(tokenData.access_token, shop, backendUrl)
                    .then(r => console.log(`🔗 Webhooks registered for ${shop}:`, r.filter(x => x.success).map(x => x.topic)))
                    .catch(err => console.error(`❌ Webhook registration failed for ${shop}:`, err));

            } catch (e) { console.warn('Shop info fetch failed:', e.message); }
        } else {
            // No pending record found — upsert a new one so the connection isn't lost
            console.warn(`⚠️ No pending integration found for user ${userId}, shop ${shop} — creating new record`);
            if (userId) {
                await Integration.findOneAndUpdate(
                    { user: userId, platform: 'shopify', ...(brandId ? { brand: brandId } : {}) },
                    {
                        user: userId,
                        platform: 'shopify',
                        status: 'connected',
                        accessToken: tokenData.access_token,
                        brand: brandId || undefined,
                        platformData: { shopDomain: shop },
                    },
                    { upsert: true }
                );
            }
        }

        // Only treat as embedded if explicitly flagged via ?embedded=1
        // (Previously this was `!!state` which is ALWAYS true, breaking the redirect back to mantram.ai)
        const isEmbedded = req.query.embedded === '1';

        if (isEmbedded) {
            const apiKey = config.shopify.apiKey;
            const host = req.query.host || Buffer.from(`${shop}/admin`).toString('base64');
            console.log(`🚀 Redirecting to Shopify Admin (embedded): ${shop}`);
            res.redirect(`https://${shop}/admin/apps/${apiKey}/integrations?shopify=connected&shop=${shop}&host=${host}`);
        } else {
            // ✅ Normal flow: send merchant back to mantram.ai
            console.log(`✅ OAuth complete — redirecting to ${frontendUrl}/integrations`);
            res.redirect(`${frontendUrl}/integrations?shopify=connected`);
        }
    } catch (error) {
        console.error('Shopify callback error:', error);
        res.redirect(`${frontendUrl}/integrations?error=shopify_auth_failed&detail=${encodeURIComponent(error.message)}`);
    }
});

// POST /api/shopify/sync — Sync products, orders, customers from Shopify
router.post('/sync', protect, async (req, res) => {
    try {
        const { brandId } = req.body;
        const query = {
            user: req.user._id,
            platform: 'shopify',
            status: 'connected',
        };
        if (brandId) query.brand = brandId;

        const integration = await Integration.findOne(query).select('+accessToken');

        if (!integration) {
            return res.status(400).json({ success: false, error: 'Shopify is not connected for this brand.' });
        }

        console.log(`📦 Syncing all data from Shopify: ${integration.platformData.shopDomain}`);

        const results = await syncStoreData(
            integration.accessToken,
            integration.platformData.shopDomain,
            req.user._id,
            brandId || integration.brand,
            { Product, ShopifyOrder, ShopifyCustomer }
        );

        integration.lastSyncAt = new Date();
        integration.syncCount++;
        await integration.save();

        console.log(`✅ Synced products: ${results.products}, orders: ${results.orders}, customers: ${results.customers}`);
        res.json({ success: true, ...results });
    } catch (error) {
        console.error('Shopify sync error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// GET /api/shopify/products — List synced products
router.get('/products', protect, async (req, res) => {
    try {
        const { brandId, search, category, page = 1, limit = 20 } = req.query;
        const filter = { user: req.user._id, status: 'active' };
        if (brandId) filter.brand = brandId;
        if (category) filter.productType = category;

        let query;
        if (search) {
            query = Product.find({ ...filter, $text: { $search: search } });
        } else {
            query = Product.find(filter);
        }

        const products = await query
            .sort('-syncedAt')
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit));

        const total = await Product.countDocuments(filter);
        const categories = await Product.distinct('productType', { user: req.user._id });

        res.json({ success: true, products, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)), categories });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// GET /api/shopify/products/:id — Single product
router.get('/products/:id', protect, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ success: false, error: 'Product not found' });
        res.json({ success: true, product });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// DELETE /api/shopify/disconnect — Disconnect Shopify (brand-aware)
router.delete('/disconnect', protect, async (req, res) => {
    try {
        const query = { user: req.user._id, platform: 'shopify' };
        if (req.query.brandId) query.brand = req.query.brandId;
        await Integration.findOneAndUpdate(
            query,
            { status: 'disconnected', accessToken: '' }
        );
        res.json({ success: true, message: 'Shopify disconnected' });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ============================================================================
// MANDATORY COMPLIANCE WEBHOOKS (Required for Shopify App Review)
// ============================================================================

router.post('/webhooks/customers-data-request', verifyShopifyWebhook, async (req, res) => {
    res.status(200).json({ received: true });
    try {
        const { shop_domain, customer } = req.body;
        console.log(`📋 GDPR: Customer data request from ${shop_domain} for customer ${customer?.id}`);
    } catch (error) {
        console.error('GDPR customers/data_request error:', error);
    }
});

router.post('/webhooks/customers-redact', verifyShopifyWebhook, async (req, res) => {
    res.status(200).json({ received: true });
    try {
        const { shop_domain, customer } = req.body;
        if (!customer?.id) return;
        console.log(`🗑️ GDPR: Redacting customer ${customer.id} for shop ${shop_domain}`);
        const integration = await Integration.findOne({ 'platformData.shopDomain': shop_domain, platform: 'shopify' });
        if (!integration) return;
        await Promise.all([
            ShopifyCustomer.deleteMany({ shopifyId: String(customer.id), user: integration.user }),
            ShopifyOrder.deleteMany({ customerEmail: customer.email, user: integration.user }),
        ]);
    } catch (error) {
        console.error('GDPR customers/redact error:', error);
    }
});

router.post('/webhooks/shop-redact', verifyShopifyWebhook, async (req, res) => {
    res.status(200).json({ received: true });
    try {
        const { shop_domain } = req.body;
        console.log(`🏪 GDPR: Complete Shop redact request for ${shop_domain}`);
        const integrations = await Integration.find({ 'platformData.shopDomain': shop_domain, platform: 'shopify' });
        const brandIds = integrations.map(i => i.brand).filter(Boolean);
        await Promise.all([
            Integration.deleteMany({ 'platformData.shopDomain': shop_domain, platform: 'shopify' }),
            Product.deleteMany({ brand: { $in: brandIds } }),
            ShopifyOrder.deleteMany({ brand: { $in: brandIds } }),
            ShopifyCustomer.deleteMany({ brand: { $in: brandIds } }),
        ]);
        console.log(`✅ GDPR: Data purged for ${shop_domain}`);
    } catch (error) {
        console.error('GDPR shop/redact error:', error);
    }
});

router.post('/webhooks/compliance', verifyShopifyWebhook, async (req, res) => {
    const topic = req.get('X-Shopify-Topic');
    console.log(`🎯 Universal Compliance Webhook triggered: ${topic}`);
    res.status(200).json({ received: true });
    try {
        if (topic === 'shop/redact') {
            const { shop_domain } = req.body;
            Integration.deleteMany({ 'platformData.shopDomain': shop_domain, platform: 'shopify' }).catch(e => { });
        }
    } catch (error) {
        console.error(`Error in universal compliance handler [${topic}]:`, error);
    }
});

// ============================================================================
// REAL-TIME DATA WEBHOOKS
// ============================================================================

router.post('/webhooks/orders-create', verifyShopifyWebhook, async (req, res) => {
    try {
        const order = req.body;
        const shop = req.headers['x-shopify-shop-domain'];
        console.log(`🔔 Webhook: Order created in ${shop} — Order #${order.id}`);
        const integration = await Integration.findOne({ 'platformData.shopDomain': shop, platform: 'shopify' });
        if (!integration) return res.status(200).json({ received: true });
        const transformed = transformShopifyOrder(order, integration.user, integration.brand);
        await ShopifyOrder.findOneAndUpdate(
            { brand: integration.brand, shopifyOrderId: String(order.id) },
            transformed,
            { upsert: true }
        );
        res.status(200).json({ received: true });
    } catch (error) {
        console.error('Webhook order-create error:', error);
        res.status(200).json({ received: true });
    }
});

router.post('/webhooks/orders-updated', verifyShopifyWebhook, async (req, res) => {
    try {
        const order = req.body;
        const shop = req.headers['x-shopify-shop-domain'];
        console.log(`🔔 Webhook: Order updated in ${shop} — Order #${order.id}`);
        const integration = await Integration.findOne({ 'platformData.shopDomain': shop, platform: 'shopify' });
        if (!integration) return res.status(200).json({ received: true });
        const transformed = transformShopifyOrder(order, integration.user, integration.brand);
        await ShopifyOrder.findOneAndUpdate(
            { brand: integration.brand, shopifyOrderId: String(order.id) },
            transformed,
            { upsert: true }
        );
        res.status(200).json({ received: true });
    } catch (error) {
        console.error('Webhook order-update error:', error);
        res.status(200).json({ received: true });
    }
});

router.post('/webhooks/products-update', verifyShopifyWebhook, async (req, res) => {
    try {
        const product = req.body;
        const shop = req.headers['x-shopify-shop-domain'];
        console.log(`🔔 Webhook: Product updated in ${shop} — ${product.title}`);
        const integration = await Integration.findOne({ 'platformData.shopDomain': shop, platform: 'shopify' });
        if (!integration) return res.status(200).json({ received: true });
        const transformed = transformShopifyProduct(product, integration.user, integration.brand);
        await Product.findOneAndUpdate(
            { brand: integration.brand, shopifyId: String(product.id) },
            transformed,
            { upsert: true }
        );
        res.status(200).json({ received: true });
    } catch (error) {
        console.error('Webhook product-update error:', error);
        res.status(200).json({ received: true });
    }
});

router.post('/webhooks/app-uninstalled', verifyShopifyWebhook, async (req, res) => {
    try {
        const shop = req.headers['x-shopify-shop-domain'];
        console.log(`🗑️ Webhook: App uninstalled from ${shop}`);
        await Integration.updateMany(
            { 'platformData.shopDomain': shop, platform: 'shopify' },
            { status: 'disconnected', accessToken: null }
        );
        res.status(200).json({ received: true });
    } catch (error) {
        console.error('Webhook app-uninstalled error:', error);
        res.status(200).json({ received: true });
    }
});

router.get('/webhooks/check', (req, res) => {
    res.status(200).json({
        status: 'ok',
        message: 'Mantram AI Webhook Endpoint is Reachable',
        timestamp: new Date().toISOString()
    });
});

router.get('/debug-config', (req, res) => {
    const rawSecret = config.shopify.apiSecret || '';
    const secret = rawSecret.trim();
    res.status(200).json({
        hasSecret: secret.length > 0,
        secretLength: secret.length,
        maskedSecret: `${secret.substring(0, 4)}***${secret.substring(secret.length - 4)}`,
        hasShpssPrefix: secret.startsWith('shpss_'),
        hasShpatPrefix: secret.startsWith('shpat_'),
        nodeEnv: config.nodeEnv,
        backendUrl: process.env.BACKEND_URL || 'not set'
    });
});

router.post('/debug/hmac-simulator', async (req, res) => {
    const providedHmac = req.get('X-Shopify-Hmac-Sha256');
    const secret = req.query.secret || '';
    const rawBody = req.rawBody;
    if (!rawBody) return res.status(400).json({ error: 'No raw body captured' });
    const computedHmac = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
    res.status(200).json({
        receivedHmac: providedHmac,
        computedHmac,
        matches: providedHmac === computedHmac,
        bodySize: rawBody.length,
        usedSecretLength: secret.length
    });
});

export default router;

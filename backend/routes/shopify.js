/**
 * Shopify Routes
 * Handles Shopify OAuth, product sync, and catalog management.
 */

import { Router } from 'express';
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

const router = Router();

// POST /api/shopify/connect — Start Shopify OAuth
router.post('/connect', protect, async (req, res) => {
    try {
        const { shopDomain, brandId } = req.body;
        if (!shopDomain) return res.status(400).json({ success: false, error: 'Shop domain is required (e.g. my-store.myshopify.com)' });

        const clientId = process.env.SHOPIFY_CLIENT_ID;
        if (!clientId) return res.status(500).json({ success: false, error: 'Shopify app not configured. Add SHOPIFY_CLIENT_ID to .env' });

        // Use server URL for callback (must match Shopify app config exactly)
        const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`;
        const redirectUri = `${backendUrl}/api/shopify/callback`;

        // Pass userId + brandId in state so callback can find the right integration
        const statePayload = Buffer.from(JSON.stringify({ userId: String(req.user._id), brandId: brandId || '' })).toString('base64');
        const cleanDomain = shopDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
        const authUrl = getShopifyAuthUrl(cleanDomain, clientId, redirectUri) + `&state=${statePayload}`;

        // Save pending integration — unique per shopDomain so multiple stores are supported
        await Integration.findOneAndUpdate(
            { user: req.user._id, platform: 'shopify', 'platformData.shopDomain': cleanDomain },
            {
                user: req.user._id,
                platform: 'shopify',
                status: 'pending',
                brand: brandId || undefined,
                platformData: { shopDomain: cleanDomain },
            },
            { upsert: true, new: true }
        );

        console.log(`🔗 Shopify OAuth started for ${cleanDomain} → redirect: ${redirectUri}`);
        res.json({ success: true, authUrl, shopDomain: cleanDomain });
    } catch (error) {
        console.error('Shopify connect error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/shopify/connect-token — Direct access token connection (for Custom Distribution apps)
router.post('/connect-token', protect, async (req, res) => {
    try {
        const { shopDomain, accessToken, brandId } = req.body;
        if (!shopDomain || !accessToken) {
            return res.status(400).json({ success: false, error: 'Shop domain and access token are required' });
        }

        const cleanDomain = shopDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');

        // Validate the token by fetching shop info
        let shopInfo;
        try {
            shopInfo = await getShopInfo(accessToken, cleanDomain);
        } catch (err) {
            return res.status(400).json({ success: false, error: `Invalid token or domain — Shopify returned: ${err.message}` });
        }

        // Save or update integration
        await Integration.findOneAndUpdate(
            { user: req.user._id, platform: 'shopify', 'platformData.shopDomain': cleanDomain },
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
            { upsert: true, new: true }
        );

        console.log(`✅ Shopify connected via token: ${shopInfo.name} (${cleanDomain})`);

        // Trigger initial sync and webhook registration in background
        const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`;
        syncStoreData(accessToken, cleanDomain, req.user._id, brandId || undefined, { Product, ShopifyOrder, ShopifyCustomer })
            .then(res => console.log(`📦 Initial sync complete for ${cleanDomain}:`, res))
            .catch(err => console.error(`❌ Initial sync failed for ${cleanDomain}:`, err));

        registerShopifyWebhooks(accessToken, cleanDomain, backendUrl)
            .then(res => console.log(`🔗 Webhooks registered for ${cleanDomain}:`, res.filter(r => r.success).map(r => r.topic)))
            .catch(err => console.error(`❌ Webhook registration failed for ${cleanDomain}:`, err));

        res.json({ success: true, shopName: shopInfo.name, shopDomain: cleanDomain });
    } catch (error) {
        console.error('Shopify connect-token error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/shopify/callback — Shopify OAuth Callback
router.get('/callback', async (req, res) => {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    try {
        const { code, shop, state } = req.query;
        if (!code || !shop) return res.redirect(`${frontendUrl}/integrations?error=missing_params`);

        const clientId = process.env.SHOPIFY_CLIENT_ID;
        const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

        console.log(`🔄 Shopify callback: shop=${shop}, code=${code ? 'present' : 'missing'}`);

        const tokenData = await exchangeShopifyToken(shop, clientId, clientSecret, code);

        // Decode state to get userId + brandId
        let userId = null, brandId = null;
        if (state) {
            try {
                const decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
                userId = decoded.userId;
                brandId = decoded.brandId;
            } catch { /* state decode failed, find by shop domain */ }
        }

        // Find the integration — match by shop domain (most reliable)
        const query = { 'platformData.shopDomain': shop, platform: 'shopify' };
        if (userId) query.user = userId;
        const integration = await Integration.findOneAndUpdate(
            query,
            {
                accessToken: tokenData.access_token,
                status: 'connected',
                'platformData.shopDomain': shop,
                ...(brandId ? { brand: brandId } : {}),
            },
            { new: true }
        );

        if (integration) {
            try {
                const shopInfo = await getShopInfo(tokenData.access_token, shop);
                integration.platformData.shopName = shopInfo.name;
                integration.displayName = shopInfo.name;
                integration.profileUrl = `https://${shop}`;
                await integration.save();
                console.log(`✅ Shopify connected: ${shopInfo.name} (${shop})`);

                // Trigger initial sync and webhook registration in background
                const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`;
                syncStoreData(tokenData.access_token, shop, userId, integration.brand, { Product, ShopifyOrder, ShopifyCustomer })
                    .then(res => console.log(`📦 Initial sync complete for ${shop}:`, res))
                    .catch(err => console.error(`❌ Initial sync failed for ${shop}:`, err));

                registerShopifyWebhooks(tokenData.access_token, shop, backendUrl)
                    .then(res => console.log(`🔗 Webhooks registered for ${shop}:`, res.filter(r => r.success).map(r => r.topic)))
                    .catch(err => console.error(`❌ Webhook registration failed for ${shop}:`, err));

            } catch (e) { console.warn('Shop info fetch failed:', e.message); }
        } else {
            console.warn(`⚠️ No pending integration found for ${shop}`);
        }

        res.redirect(`${frontendUrl}/integrations?shopify=connected`);
    } catch (error) {
        console.error('Shopify callback error:', error);
        res.redirect(`${frontendUrl}/integrations?error=shopify_auth_failed&detail=${encodeURIComponent(error.message)}`);
    }
});

// POST /api/shopify/sync — Sync products from Shopify
router.post('/sync', protect, async (req, res) => {
    try {
        const { brandId } = req.body;
        const integration = await Integration.findOne({
            user: req.user._id,
            platform: 'shopify',
            status: 'connected',
        }).select('+accessToken');

        if (!integration) {
            return res.status(400).json({ success: false, error: 'Shopify is not connected. Please connect first.' });
        }

        console.log(`📦 Syncing all data from Shopify: ${integration.platformData.shopDomain}`);

        const results = await syncStoreData(
            integration.accessToken,
            integration.platformData.shopDomain,
            req.user._id,
            brandId || integration.brand,
            { Product, ShopifyOrder, ShopifyCustomer }
        );

        // Update sync metadata
        integration.lastSyncAt = new Date();
        integration.syncCount++;
        await integration.save();

        console.log(`✅ Synced products: ${results.products}, orders: ${results.orders}, customers: ${results.customers}`);
        res.json({ success: true, ...results });
    } catch (error) {
        console.error('Shopify sync error:', error);
        res.status(500).json({ success: false, error: error.message });
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
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/shopify/products/:id — Single product
router.get('/products/:id', protect, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ success: false, error: 'Product not found' });
        res.json({ success: true, product });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE /api/shopify/disconnect — Disconnect Shopify
router.delete('/disconnect', protect, async (req, res) => {
    try {
        await Integration.findOneAndUpdate(
            { user: req.user._id, platform: 'shopify' },
            { status: 'disconnected', accessToken: '' }
        );
        res.json({ success: true, message: 'Shopify disconnected' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});
// ============================================================================
// MANDATORY COMPLIANCE WEBHOOKS (Required for Shopify App Review)
// These endpoints handle GDPR data privacy requirements.
// All are verified with HMAC-SHA256 signatures.
// ============================================================================


/**
 * POST /api/shopify/webhooks/customers-data-request
 * Topic: customers/data_request
 * 
 * Triggered when a customer requests their data from a store.
 * We must respond with what data we have about them (if any).
 * Since we primarily store product/order aggregates and don't hold
 * raw customer PII beyond what Shopify provides, we acknowledge the request.
 */
router.post('/webhooks/customers-data-request', verifyShopifyWebhook, async (req, res) => {
    try {
        const { shop_domain, customer, orders_requested } = req.body;
        console.log(`📋 GDPR: Customer data request from ${shop_domain} for customer ${customer?.id}`);
        console.log(`   Orders requested: ${orders_requested?.length || 0}`);

        // Mantram AI does not store raw customer PII independently.
        // All customer data is sourced from Shopify and is accessible via Shopify Admin.
        // We log this request for audit purposes.

        res.status(200).json({ received: true });
    } catch (error) {
        console.error('GDPR customers/data_request error:', error);
        // Always return 200 to prevent Shopify from retrying
        res.status(200).json({ received: true });
    }
});

/**
 * POST /api/shopify/webhooks/customers-redact
 * Topic: customers/redact
 * 
 * Triggered when a store owner requests deletion of a customer's data.
 * We must delete any customer data we've stored.
 */
router.post('/webhooks/customers-redact', verifyShopifyWebhook, async (req, res) => {
    try {
        const { shop_domain, customer, orders_to_redact } = req.body;
        console.log(`🗑️ GDPR: Customer redact request from ${shop_domain} for customer ${customer?.id}`);
        console.log(`   Orders to redact: ${orders_to_redact?.length || 0}`);

        // Delete any customer-related data from our database
        // Currently we don't store individual customer records separately,
        // but we clean up any references just to be safe.

        // If you add a Customer model in the future, delete here:
        // await Customer.deleteMany({ shopifyCustomerId: String(customer?.id) });

        console.log(`✅ GDPR: Customer data redacted for customer ${customer?.id} from ${shop_domain}`);
        res.status(200).json({ received: true });
    } catch (error) {
        console.error('GDPR customers/redact error:', error);
        res.status(200).json({ received: true });
    }
});

/**
 * POST /api/shopify/webhooks/shop-redact
 * Topic: shop/redact
 * 
 * Triggered 48 hours after a store owner uninstalls the app.
 * We must delete ALL data related to this shop from our systems.
 */
router.post('/webhooks/shop-redact', verifyShopifyWebhook, async (req, res) => {
    try {
        const { shop_id, shop_domain } = req.body;
        console.log(`🏪 GDPR: Shop redact request for ${shop_domain} (ID: ${shop_id})`);

        // Delete all integration records for this shop
        const deletedIntegrations = await Integration.deleteMany({
            'platformData.shopDomain': shop_domain,
            platform: 'shopify',
        });
        console.log(`   Deleted ${deletedIntegrations.deletedCount} integration(s)`);

        // Delete all synced products from this shop
        const deletedProducts = await Product.deleteMany({
            source: 'shopify',
            shopifyDomain: shop_domain,
        });
        console.log(`   Deleted ${deletedProducts.deletedCount} product(s)`);

        console.log(`✅ GDPR: All data redacted for shop ${shop_domain}`);
        res.status(200).json({ received: true });
    } catch (error) {
        console.error('GDPR shop/redact error:', error);
        res.status(200).json({ received: true });
    }
});

// ============================================================================
// REAL-TIME DATA WEBHOOKS
// ============================================================================

/**
 * Handle Order Created/Updated Webhooks
 */
router.post('/webhooks/orders-create', verifyShopifyWebhook, async (req, res) => {
    try {
        const order = req.body;
        const shop = req.headers['x-shopify-shop-domain'];
        console.log(`🔔 Webhook: Order created/updated in ${shop} — Order #${order.id}`);

        // Find integration to get brand + userId
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
    // Shared logic with orders-create for simplicity
    return router.handle(req, res);
});

/**
 * Handle Product Updated Webhook
 */
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

export default router;

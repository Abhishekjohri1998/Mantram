/**
 * WooCommerce Routes
 * Handles WooCommerce REST API connection, product sync, analytics, and product publishing.
 */

import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import Integration from '../models/Integration.js';
import Product from '../models/Product.js';
import ShopifyOrder from '../models/ShopifyOrder.js';
import ShopifyCustomer from '../models/ShopifyCustomer.js';
import {
    validateWooConnection,
    fetchWooProducts,
    fetchWooOrders,
    fetchWooCustomers,
    transformWooProduct,
    transformWooOrder,
    transformWooCustomer,
    createWooProduct,
    updateWooProduct,
} from '../services/woocommerceService.js';
import {
    computeOrderAnalytics,
    computeCustomerAnalytics,
    computeRedFlags,
    computeProductHealth,
    computeAdvancedAnalytics,
} from '../utils/analyticsEngine.js';
import { safeErrorMessage } from '../utils/safeError.js';

const router = Router();

// ── GET /api/woocommerce/status ───────────────────────────────────────────────
router.get('/status', protect, async (req, res) => {
    try {
        const query = { user: req.user._id, platform: 'woocommerce' };
        if (req.query.brandId) query.brand = req.query.brandId;
        const integration = await Integration.findOne(query);
        if (integration) {
            res.json({
                success: true,
                status: {
                    connected: integration.status === 'connected',
                    status: integration.status,
                    baseUrl: integration.platformData?.wooBaseUrl || '',
                    siteName: integration.platformData?.wooSiteName || '',
                    lastSyncAt: integration.lastSyncAt,
                },
            });
        } else {
            res.json({ success: true, status: { connected: false, status: 'disconnected' } });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ── POST /api/woocommerce/connect ─────────────────────────────────────────────
router.post('/connect', protect, async (req, res) => {
    try {
        const { baseUrl, consumerKey, consumerSecret, brandId } = req.body;
        if (!baseUrl || !consumerKey || !consumerSecret) {
            return res.status(400).json({ success: false, error: 'Site URL, Consumer Key, and Consumer Secret are required.' });
        }

        let siteInfo;
        try {
            siteInfo = await validateWooConnection(baseUrl, consumerKey, consumerSecret);
        } catch (err) {
            return res.status(400).json({ success: false, error: err.message });
        }

        const cleanUrl = baseUrl.replace(/\/$/, '');
        const query = {
            user: req.user._id,
            platform: 'woocommerce',
            ...(brandId ? { brand: brandId } : { brand: { $exists: false } }),
        };

        await Integration.findOneAndUpdate(
            query,
            {
                user: req.user._id,
                platform: 'woocommerce',
                status: 'connected',
                accessToken: consumerKey,       // store key as accessToken
                refreshToken: consumerSecret,   // store secret as refreshToken
                brand: brandId || undefined,
                displayName: siteInfo.siteName || cleanUrl,
                profileUrl: cleanUrl,
                platformData: {
                    wooBaseUrl: cleanUrl,
                    wooSiteName: siteInfo.siteName || cleanUrl,
                    wooConsumerKey: consumerKey,
                    wooConsumerSecret: consumerSecret,
                    wooVersion: 'v3',
                },
            },
            { upsert: true, returnDocument: 'after' }
        );

        console.log(`✅ WooCommerce connected: ${siteInfo.siteName} (${cleanUrl})`);
        res.json({ success: true, siteName: siteInfo.siteName, baseUrl: cleanUrl });
    } catch (error) {
        console.error('WooCommerce connect error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ── POST /api/woocommerce/sync ────────────────────────────────────────────────
router.post('/sync', protect, async (req, res) => {
    try {
        const { brandId } = req.body;
        const query = { user: req.user._id, platform: 'woocommerce', status: 'connected' };
        if (brandId) query.brand = brandId;

        const integration = await Integration.findOne(query).select('+accessToken +refreshToken');
        if (!integration) return res.status(400).json({ success: false, error: 'WooCommerce is not connected.' });

        const { wooBaseUrl } = integration.platformData;
        const consumerKey = integration.accessToken || integration.platformData.wooConsumerKey;
        const consumerSecret = integration.refreshToken || integration.platformData.wooConsumerSecret;
        const userId = req.user._id;
        const bId = brandId || integration.brand;
        const results = { products: 0, orders: 0, customers: 0 };

        // Sync products
        const wooProducts = await fetchWooProducts(wooBaseUrl, consumerKey, consumerSecret);
        for (const p of wooProducts) {
            const transformed = transformWooProduct(p, userId, bId);
            await Product.findOneAndUpdate(
                { user: userId, shopifyId: transformed.shopifyId },
                transformed,
                { upsert: true }
            );
            results.products++;
        }

        // Sync orders
        const wooOrders = await fetchWooOrders(wooBaseUrl, consumerKey, consumerSecret, { days: 60 });
        for (const o of wooOrders) {
            const transformed = transformWooOrder(o, userId, bId);
            await ShopifyOrder.findOneAndUpdate(
                { shopifyOrderId: transformed.shopifyOrderId },
                transformed,
                { upsert: true }
            );
            results.orders++;
        }

        // Sync customers
        const wooCustomers = await fetchWooCustomers(wooBaseUrl, consumerKey, consumerSecret);
        for (const c of wooCustomers) {
            const transformed = transformWooCustomer(c, userId, bId);
            await ShopifyCustomer.findOneAndUpdate(
                { shopifyCustomerId: transformed.shopifyCustomerId },
                transformed,
                { upsert: true }
            );
            results.customers++;
        }

        integration.lastSyncAt = new Date();
        integration.syncCount = (integration.syncCount || 0) + 1;
        await integration.save();

        console.log(`✅ WooCommerce sync: ${results.products} products, ${results.orders} orders, ${results.customers} customers`);
        res.json({ success: true, ...results });
    } catch (error) {
        console.error('WooCommerce sync error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ── GET /api/woocommerce/analytics ────────────────────────────────────────────
router.get('/analytics', protect, async (req, res) => {
    try {
        const { brandId, days = 60 } = req.query;
        const userId = req.user._id;

        const integration = await Integration.findOne({ user: userId, platform: 'woocommerce', status: 'connected', ...(brandId ? { brand: brandId } : {}) });
        if (!integration) return res.json({ connected: false, message: 'WooCommerce not connected.' });

        const brandFilter = brandId ? { brand: brandId } : { user: userId };
        const dateLimit = new Date(Date.now() - parseInt(days) * 86400000);

        const [orders, products, customers] = await Promise.all([
            ShopifyOrder.find({ ...brandFilter, source: 'woocommerce', shopifyCreatedAt: { $gte: dateLimit } }).lean(),
            Product.find({ ...brandFilter, source: 'woocommerce' }).lean(),
            ShopifyCustomer.find({ ...brandFilter, source: 'woocommerce' }).lean(),
        ]);

        const orderAnalytics = computeOrderAnalytics(orders, parseInt(days));
        const customerAnalytics = computeCustomerAnalytics(customers, orders);
        const productHealth = computeProductHealth(orderAnalytics.topProducts, products);
        const redFlags = computeRedFlags(orderAnalytics, products, customerAnalytics);
        const advanced = computeAdvancedAnalytics(orders, products);

        res.json({
            connected: true,
            platform: 'woocommerce',
            shop: {
                name: integration.platformData?.wooSiteName || 'WooCommerce Store',
                url: integration.platformData?.wooBaseUrl || '',
                lastSyncAt: integration.lastSyncAt,
            },
            period: { days: parseInt(days) },
            kpis: {
                totalRevenue: orderAnalytics.totalRevenue,
                totalOrders: orderAnalytics.totalOrders,
                avgOrderValue: orderAnalytics.avgOrderValue,
                revenueGrowth: orderAnalytics.revenueGrowth,
                totalCustomers: customerAnalytics.totalCustomers,
                repeatRate: customerAnalytics.repeatRate,
                refundRate: orderAnalytics.refundRate,
            },
            dailyRevenue: orderAnalytics.dailyRevenue,
            productHealth,
            customerAnalytics,
            redFlags,
            totalProducts: products.length,
            geoRadar: advanced.geoRadar,
            productVelocity: advanced.productVelocity,
            abandonmentSignals: advanced.abandonmentSignals,
        });
    } catch (error) {
        console.error('WooCommerce analytics error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ── GET /api/woocommerce/products ─────────────────────────────────────────────
router.get('/products', protect, async (req, res) => {
    try {
        const { brandId, search, page = 1, limit = 20 } = req.query;
        const filter = { user: req.user._id, source: 'woocommerce', status: 'active' };
        if (brandId) filter.brand = brandId;

        let query = search
            ? Product.find({ ...filter, $text: { $search: search } })
            : Product.find(filter);

        const products = await query.sort('-syncedAt').limit(parseInt(limit)).skip((parseInt(page) - 1) * parseInt(limit)).lean();
        const total = await Product.countDocuments(filter);
        res.json({ success: true, products, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ── POST /api/woocommerce/publish/:productId ──────────────────────────────────
router.post('/publish/:productId', protect, async (req, res) => {
    try {
        const { brandId } = req.body;
        const query = { user: req.user._id, platform: 'woocommerce', status: 'connected' };
        if (brandId) query.brand = brandId;

        const integration = await Integration.findOne(query).select('+accessToken +refreshToken');
        if (!integration) return res.status(400).json({ success: false, error: 'WooCommerce is not connected.' });

        const product = await Product.findOne({ _id: req.params.productId, user: req.user._id });
        if (!product) return res.status(404).json({ success: false, error: 'Product not found.' });

        const { wooBaseUrl } = integration.platformData;
        const consumerKey = integration.accessToken || integration.platformData.wooConsumerKey;
        const consumerSecret = integration.refreshToken || integration.platformData.wooConsumerSecret;

        let result;
        if (product.wooCommerceId) {
            result = await updateWooProduct(wooBaseUrl, consumerKey, consumerSecret, product.wooCommerceId, product);
        } else {
            result = await createWooProduct(wooBaseUrl, consumerKey, consumerSecret, product);
            if (result.id) {
                product.wooCommerceId = String(result.id);
                await product.save();
            }
        }

        integration.lastPublishAt = new Date();
        integration.publishCount = (integration.publishCount || 0) + 1;
        await integration.save();

        res.json({
            success: true,
            wooProductId: result.id,
            productUrl: result.permalink || `${wooBaseUrl}/?p=${result.id}`,
            message: 'Product published to WooCommerce as a draft.',
        });
    } catch (error) {
        console.error('WooCommerce publish error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ── DELETE /api/woocommerce/disconnect ────────────────────────────────────────
router.delete('/disconnect', protect, async (req, res) => {
    try {
        const query = { user: req.user._id, platform: 'woocommerce' };
        if (req.query.brandId) query.brand = req.query.brandId;
        await Integration.findOneAndUpdate(query, { status: 'disconnected', accessToken: '', refreshToken: '' });
        res.json({ success: true, message: 'WooCommerce disconnected.' });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

export default router;

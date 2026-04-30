/**
 * Etsy Routes
 * Handles Etsy API key connection, product sync, analytics, and listing publish.
 */

import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import Integration from '../models/Integration.js';
import Product from '../models/Product.js';
import ShopifyOrder from '../models/ShopifyOrder.js';
import ShopifyCustomer from '../models/ShopifyCustomer.js';
import {
    validateEtsyApiKey,
    fetchEtsyShippingProfiles,
    fetchEtsyListings,
    fetchEtsyReceipts,
    transformEtsyListing,
    transformEtsyReceipt,
    createEtsyListing,
    updateEtsyListing,
} from '../services/etsyService.js';
import {
    computeOrderAnalytics,
    computeCustomerAnalytics,
    computeRedFlags,
    computeProductHealth,
    computeAdvancedAnalytics,
} from '../utils/analyticsEngine.js';
import { safeErrorMessage } from '../utils/safeError.js';

const router = Router();

// ── GET /api/etsy/status ─────────────────────────────────────────────────────
router.get('/status', protect, async (req, res) => {
    try {
        const query = { user: req.user._id, platform: 'etsy' };
        if (req.query.brandId) query.brand = req.query.brandId;
        const integration = await Integration.findOne(query);
        if (integration) {
            res.json({
                success: true,
                status: {
                    connected: integration.status === 'connected',
                    status: integration.status,
                    shopId: integration.platformData?.etsyShopId || '',
                    shopName: integration.platformData?.etsyShopName || '',
                    shopUrl: integration.platformData?.etsyShopUrl || '',
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

// ── POST /api/etsy/connect ────────────────────────────────────────────────────
router.post('/connect', protect, async (req, res) => {
    try {
        const { apiKey, shopId, brandId } = req.body;
        if (!apiKey || !shopId) {
            return res.status(400).json({ success: false, error: 'API Key and Shop ID are required.' });
        }

        let shopInfo;
        try {
            shopInfo = await validateEtsyApiKey(apiKey, shopId);
        } catch (err) {
            return res.status(400).json({ success: false, error: `Etsy validation failed: ${err.message}` });
        }

        // Fetch shipping profiles for future listing creation
        const shippingProfiles = await fetchEtsyShippingProfiles(apiKey, shopId);
        const defaultShippingProfileId = shippingProfiles[0]?.shipping_profile_id || '';

        const query = {
            user: req.user._id,
            platform: 'etsy',
            ...(brandId ? { brand: brandId } : { brand: { $exists: false } }),
        };

        await Integration.findOneAndUpdate(
            query,
            {
                user: req.user._id,
                platform: 'etsy',
                status: 'connected',
                accessToken: apiKey, // stored as accessToken for reuse
                brand: brandId || undefined,
                displayName: shopInfo.shop_name || `Shop ${shopId}`,
                profileUrl: shopInfo.url || `https://www.etsy.com/shop/${shopId}`,
                platformData: {
                    etsyShopId: String(shopId),
                    etsyShopName: shopInfo.shop_name || '',
                    etsyShopUrl: shopInfo.url || '',
                    etsyDefaultShippingProfileId: String(defaultShippingProfileId),
                    etsyDefaultTaxonomyId: '',
                },
            },
            { upsert: true, returnDocument: 'after' }
        );

        console.log(`✅ Etsy connected: ${shopInfo.shop_name} (${shopId})`);
        res.json({ success: true, shopName: shopInfo.shop_name, shopId: String(shopId) });
    } catch (error) {
        console.error('Etsy connect error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ── POST /api/etsy/sync ───────────────────────────────────────────────────────
router.post('/sync', protect, async (req, res) => {
    try {
        const { brandId } = req.body;
        const query = { user: req.user._id, platform: 'etsy', status: 'connected' };
        if (brandId) query.brand = brandId;

        const integration = await Integration.findOne(query).select('+accessToken');
        if (!integration) return res.status(400).json({ success: false, error: 'Etsy is not connected.' });

        const { etsyShopId } = integration.platformData;
        const apiKey = integration.accessToken;
        const userId = req.user._id;
        const results = { products: 0, orders: 0, customers: 0 };

        // Sync listings → products
        const listings = await fetchEtsyListings(apiKey, etsyShopId);
        for (const listing of listings) {
            const transformed = transformEtsyListing(listing, userId, brandId || integration.brand);
            await Product.findOneAndUpdate(
                { user: userId, etsyListingId: transformed.etsyListingId },
                transformed,
                { upsert: true }
            );
            results.products++;
        }

        // Sync receipts → orders (reuse ShopifyOrder model with source: 'etsy')
        const receipts = await fetchEtsyReceipts(apiKey, etsyShopId, { days: 60 });
        for (const receipt of receipts) {
            const transformed = transformEtsyReceipt(receipt, userId, brandId || integration.brand);
            await ShopifyOrder.findOneAndUpdate(
                { shopifyOrderId: transformed.shopifyOrderId },
                transformed,
                { upsert: true }
            );
            results.orders++;
        }

        integration.lastSyncAt = new Date();
        integration.syncCount = (integration.syncCount || 0) + 1;
        await integration.save();

        console.log(`✅ Etsy sync: ${results.products} listings, ${results.orders} orders`);
        res.json({ success: true, ...results });
    } catch (error) {
        console.error('Etsy sync error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ── GET /api/etsy/analytics ───────────────────────────────────────────────────
router.get('/analytics', protect, async (req, res) => {
    try {
        const { brandId, days = 60 } = req.query;
        const userId = req.user._id;

        const integration = await Integration.findOne({ user: userId, platform: 'etsy', status: 'connected', ...(brandId ? { brand: brandId } : {}) });
        if (!integration) return res.json({ connected: false, message: 'Etsy not connected.' });

        const brandFilter = brandId ? { brand: brandId } : { user: userId };
        const dateLimit = new Date(Date.now() - parseInt(days) * 86400000);

        const [orders, products, customers] = await Promise.all([
            ShopifyOrder.find({ ...brandFilter, source: 'etsy', shopifyCreatedAt: { $gte: dateLimit } }).lean(),
            Product.find({ ...brandFilter, source: 'etsy' }).lean(),
            ShopifyCustomer.find({ ...brandFilter, source: 'etsy' }).lean(),
        ]);

        const orderAnalytics = computeOrderAnalytics(orders, parseInt(days));
        const customerAnalytics = computeCustomerAnalytics(customers, orders);
        const productHealth = computeProductHealth(orderAnalytics.topProducts, products);
        const redFlags = computeRedFlags(orderAnalytics, products, customerAnalytics);
        const advanced = computeAdvancedAnalytics(orders, products);

        res.json({
            connected: true,
            platform: 'etsy',
            shop: {
                name: integration.platformData?.etsyShopName || 'Etsy Shop',
                url: integration.platformData?.etsyShopUrl || '',
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
        console.error('Etsy analytics error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ── GET /api/etsy/products ────────────────────────────────────────────────────
router.get('/products', protect, async (req, res) => {
    try {
        const { brandId, search, page = 1, limit = 20 } = req.query;
        const filter = { user: req.user._id, source: 'etsy', status: 'active' };
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

// ── POST /api/etsy/publish/:productId ────────────────────────────────────────
router.post('/publish/:productId', protect, async (req, res) => {
    try {
        const { brandId, shippingProfileId, taxonomyId } = req.body;
        const query = { user: req.user._id, platform: 'etsy', status: 'connected' };
        if (brandId) query.brand = brandId;

        const integration = await Integration.findOne(query).select('+accessToken');
        if (!integration) return res.status(400).json({ success: false, error: 'Etsy is not connected.' });

        const product = await Product.findOne({ _id: req.params.productId, user: req.user._id });
        if (!product) return res.status(404).json({ success: false, error: 'Product not found.' });

        const apiKey = integration.accessToken;
        const shopId = integration.platformData.etsyShopId;
        const resolvedShipping = shippingProfileId || integration.platformData.etsyDefaultShippingProfileId;
        const resolvedTaxonomy = taxonomyId || integration.platformData.etsyDefaultTaxonomyId;

        if (!resolvedShipping) {
            return res.status(400).json({ success: false, error: 'No shipping profile found. Please provide a shipping_profile_id or set a default in your Etsy shop settings.' });
        }

        let result;
        if (product.etsyListingId) {
            // Update existing listing
            result = await updateEtsyListing(apiKey, apiKey, shopId, product.etsyListingId, product);
        } else {
            // Create new listing — requires OAuth access token; for API key-only shops, guide user
            result = await createEtsyListing(apiKey, apiKey, shopId, product, resolvedShipping, resolvedTaxonomy);
            if (result.listing_id) {
                product.etsyListingId = String(result.listing_id);
                await product.save();
            }
        }

        integration.lastPublishAt = new Date();
        integration.publishCount = (integration.publishCount || 0) + 1;
        await integration.save();

        res.json({ success: true, listingId: result.listing_id, listingUrl: result.url, message: 'Product published to Etsy as a draft listing.' });
    } catch (error) {
        console.error('Etsy publish error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ── DELETE /api/etsy/disconnect ───────────────────────────────────────────────
router.delete('/disconnect', protect, async (req, res) => {
    try {
        const query = { user: req.user._id, platform: 'etsy' };
        if (req.query.brandId) query.brand = req.query.brandId;
        await Integration.findOneAndUpdate(query, { status: 'disconnected', accessToken: '' });
        res.json({ success: true, message: 'Etsy disconnected.' });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

export default router;

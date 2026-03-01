/**
 * Shopify Routes
 * Handles Shopify OAuth, product sync, and catalog management.
 */

import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import Integration from '../models/Integration.js';
import Product from '../models/Product.js';
import {
    getShopifyAuthUrl,
    exchangeShopifyToken,
    fetchShopifyProducts,
    transformShopifyProduct,
    getShopInfo,
} from '../services/shopifyService.js';
import config from '../config/env.js';

const router = Router();

// POST /api/shopify/connect — Start Shopify OAuth
router.post('/connect', protect, async (req, res) => {
    try {
        const { shopDomain } = req.body;
        if (!shopDomain) return res.status(400).json({ success: false, error: 'Shop domain is required (e.g. my-store.myshopify.com)' });

        const clientId = process.env.SHOPIFY_CLIENT_ID;
        if (!clientId) return res.status(500).json({ success: false, error: 'Shopify app not configured. Add SHOPIFY_CLIENT_ID to .env' });

        const redirectUri = `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/shopify/callback`;
        const authUrl = getShopifyAuthUrl(shopDomain, clientId, redirectUri);

        // Save pending integration
        await Integration.findOneAndUpdate(
            { user: req.user._id, platform: 'shopify' },
            {
                user: req.user._id,
                platform: 'shopify',
                status: 'pending',
                platformData: { shopDomain: shopDomain.replace(/^https?:\/\//, '').replace(/\/$/, '') },
            },
            { upsert: true, new: true }
        );

        res.json({ success: true, authUrl, shopDomain });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/shopify/callback — Shopify OAuth Callback
router.get('/callback', async (req, res) => {
    try {
        const { code, shop } = req.query;
        if (!code || !shop) return res.redirect('/integrations?error=missing_params');

        const clientId = process.env.SHOPIFY_CLIENT_ID;
        const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

        const tokenData = await exchangeShopifyToken(shop, clientId, clientSecret, code);

        // Update integration with access token
        const integration = await Integration.findOneAndUpdate(
            { 'platformData.shopDomain': shop, platform: 'shopify' },
            {
                accessToken: tokenData.access_token,
                status: 'connected',
                'platformData.shopDomain': shop,
            },
            { new: true }
        );

        if (integration) {
            // Get shop name
            try {
                const shopInfo = await getShopInfo(tokenData.access_token, shop);
                integration.platformData.shopName = shopInfo.name;
                integration.displayName = shopInfo.name;
                integration.profileUrl = `https://${shop}`;
                await integration.save();
            } catch { /* non-critical */ }
        }

        res.redirect('/integrations?shopify=connected');
    } catch (error) {
        console.error('Shopify callback error:', error);
        res.redirect('/integrations?error=shopify_auth_failed');
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

        console.log(`📦 Syncing products from Shopify: ${integration.platformData.shopDomain}`);

        const shopifyProducts = await fetchShopifyProducts(
            integration.accessToken,
            integration.platformData.shopDomain
        );

        // Transform and upsert products
        let synced = 0;
        for (const sp of shopifyProducts) {
            const productData = transformShopifyProduct(sp, req.user._id, brandId || integration.brand);
            await Product.findOneAndUpdate(
                { shopifyId: productData.shopifyId, user: req.user._id },
                productData,
                { upsert: true, new: true }
            );
            synced++;
        }

        // Update sync metadata
        integration.lastSyncAt = new Date();
        integration.syncCount++;
        await integration.save();

        console.log(`✅ Synced ${synced} products`);
        res.json({ success: true, synced, total: synced });
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

export default router;

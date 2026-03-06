/**
 * Shopify Session Token Verification Middleware
 * 
 * Verifies JWT-based session tokens sent from Shopify App Bridge.
 * Tokens are signed by Shopify using the App's API Secret.
 */

import jwt from 'jsonwebtoken';
import config from '../config/env.js';
import Integration from '../models/Integration.js';
import User from '../models/User.js';

export const verifyShopifySessionToken = async (req, res, next) => {
    const authHeader = req.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }

    const token = authHeader.split(' ')[1];
    const secret = config.shopify.apiSecret;

    if (!secret) {
        console.error('❌ SHOPIFY_API_SECRET not configured');
        return res.status(500).json({ error: 'Server misconfigured' });
    }

    try {
        // Shopify session tokens are JWTs. We verify:
        // 1. Signature (using API Secret)
        // 2. Issuance/Expiration (default jwt.verify behavior)
        // 3. Audience (Must match API Key)

        const decoded = jwt.verify(token, secret, {
            audience: config.shopify.apiKey,
            algorithms: ['HS256']
        });

        // The 'dest' field contains the shop domain (e.g. https://my-store.myshopify.com)
        const shopDomain = decoded.dest.replace(/^https?:\/\//, '');

        // Find the integration for this shop
        const integration = await Integration.findOne({
            'platformData.shopDomain': shopDomain,
            platform: 'shopify',
            status: 'connected'
        });

        if (!integration) {
            // If no integration but valid token, the app is installed but not linked yet
            // We can attach the shop domain to the request for the frontend to use
            req.shopifyShop = shopDomain;
            req.shopifyAuth = true;
            return next();
        }

        // Attach user and brand info to the request
        req.user = await User.findById(integration.user);
        req.activeBrand = integration.brand;
        req.shopifyShop = shopDomain;
        req.shopifyAuth = true;

        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Session token expired', code: 'TOKEN_EXPIRED' });
        }
        console.warn('⚠️ Shopify session token verification failed:', error.message);
        return res.status(401).json({ error: 'Unauthorized: Invalid Shopify Session Token' });
    }
};

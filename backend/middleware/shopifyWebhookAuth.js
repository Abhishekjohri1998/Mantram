/**
 * Shopify Webhook HMAC Verification Middleware
 * 
 * Validates the X-Shopify-Hmac-Sha256 header on incoming webhook requests.
 * Shopify signs every webhook payload with HMAC-SHA256 using the app's client secret.
 * This middleware ensures that only genuine Shopify-originated requests are processed.
 */

import crypto from 'crypto';
import config from '../config/env.js';

/**
 * Verify Shopify webhook HMAC signature.
 * Must be used AFTER raw body has been captured (see index.js verify callback).
 */
export function verifyShopifyWebhook(req, res, next) {
    const hmacHeader = req.get('X-Shopify-Hmac-Sha256');
    if (!hmacHeader) {
        console.warn('⚠️ Shopify webhook: Missing HMAC header');
        return res.status(401).json({ error: 'Missing HMAC signature' });
    }

    // Strip suspicious shpss_ or shpat_ prefixes from secret if user copied wrong token
    const secret = config.shopify.apiSecret?.replace(/^(shpss_|shpat_|shpat_|shpua_)/, '');

    if (!secret) {
        console.error('❌ SHOPIFY_API_SECRET not configured');
        return res.status(500).json({ error: 'Server misconfigured' });
    }

    // rawBody is set by the express.json verify callback in index.js
    const rawBody = req.rawBody;
    if (!rawBody) {
        console.warn('⚠️ Shopify webhook: No raw body available for HMAC verification');
        return res.status(400).json({ error: 'Cannot verify — raw body missing' });
    }

    const computedHmac = crypto
        .createHmac('sha256', secret)
        .update(rawBody) // update handles Buffer directly
        .digest('base64');

    // Use timing-safe comparison to prevent timing attacks
    try {
        const sigBuffer = Buffer.from(hmacHeader, 'base64');
        const computedBuffer = Buffer.from(computedHmac, 'base64');

        if (sigBuffer.length !== computedBuffer.length || !crypto.timingSafeEqual(sigBuffer, computedBuffer)) {
            console.warn(`⚠️ Shopify webhook: HMAC mismatch. Computed: ${computedHmac.substring(0, 8)}... vs Header: ${hmacHeader.substring(0, 8)}...`);
            return res.status(401).json({ error: 'HMAC verification failed' });
        }
    } catch (err) {
        console.warn('⚠️ Shopify webhook: HMAC comparison error:', err.message);
        return res.status(401).json({ error: 'HMAC verification failed' });
    }

    console.log('✅ Shopify webhook: HMAC verified successfully');
    next();
}

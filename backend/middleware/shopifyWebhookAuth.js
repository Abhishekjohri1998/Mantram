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
        console.warn('⚠️ Shopify webhook: Missing X-Shopify-Hmac-Sha256 header');
        return res.status(401).json({ error: 'Missing HMAC signature' });
    }

    // Use the secret exactly as provided and trimmed
    const secret = config.shopify.apiSecret?.trim();
    if (!secret) {
        console.error('❌ SHOPIFY_API_SECRET not configured correctly');
        return res.status(500).json({ error: 'Server misconfigured' });
    }

    const rawBody = req.rawBody;
    if (!rawBody || !Buffer.isBuffer(rawBody)) {
        console.warn('⚠️ Shopify webhook: No raw buffer available. Capture failed in index.js');
        return res.status(400).json({ error: 'Cannot verify — raw body missing' });
    }

    // Calculate HMAC
    const hmac = crypto.createHmac('sha256', secret).update(rawBody).digest();
    const computedBase64 = hmac.toString('base64');

    // Safe comparison function
    const verifySignature = (header, encoding) => {
        try {
            const headerBuf = Buffer.from(header, encoding);
            return headerBuf.length === hmac.length && crypto.timingSafeEqual(headerBuf, hmac);
        } catch (e) {
            return false;
        }
    };

    const isBase64Match = verifySignature(hmacHeader, 'base64');
    const isHexMatch = hmacHeader.length === 64 && verifySignature(hmacHeader, 'hex');

    if (!isBase64Match && !isHexMatch) {
        console.warn(`⚠️ Shopify webhook HMAC mismatch!`);
        console.warn(`   Path: ${req.originalUrl}`);
        console.warn(`   Secret used (first 4): ${secret.substring(0, 4)}... (length: ${secret.length})`);
        console.warn(`   Computed (Base64): ${computedBase64}`);
        console.warn(`   Header Received: ${hmacHeader}`);
        return res.status(401).json({ error: 'HMAC verification failed' });
    }

    console.log(`✅ Shopify webhook verified: ${req.originalUrl}`);
    next();
}

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
    const topic = req.get('X-Shopify-Topic');

    if (!hmacHeader) {
        console.warn(`⚠️ Shopify webhook [${topic}]: Missing X-Shopify-Hmac-Sha256 header`);
        return res.status(401).json({ error: 'Missing HMAC signature' });
    }

    const secret = config.shopify.apiSecret?.trim();
    if (!secret) {
        console.error('❌ SHOPIFY_API_SECRET not configured');
        return res.status(500).json({ error: 'Server misconfigured' });
    }

    const rawBody = req.rawBody;
    if (!rawBody || !Buffer.isBuffer(rawBody)) {
        console.warn(`⚠️ Shopify webhook [${topic}]: No raw buffer available`);
        return res.status(400).json({ error: 'Raw body missing' });
    }

    // Calculate HMAC
    const hmac = crypto.createHmac('sha256', secret).update(rawBody).digest();
    const computedBase64 = hmac.toString('base64');

    // Safe comparison
    const verifySignature = (header, encoding) => {
        try {
            const headerBuf = Buffer.from(header, encoding);
            return headerBuf.length === hmac.length && crypto.timingSafeEqual(headerBuf, hmac);
        } catch (e) {
            return false;
        }
    };

    const isMatch = verifySignature(hmacHeader, 'base64');

    if (!isMatch) {
        console.warn(`❌ Shopify HMAC mismatch for topic: ${topic}`);
        console.warn(`   Header: ${hmacHeader}`);
        console.warn(`   Computed: ${computedBase64}`);
        console.warn(`   Secret used (first 8): ${secret.substring(0, 8)}... (len: ${secret.length})`);

        // During compliance checks, sometimes returning 200 even on fail helps trigger the next check
        // but we return 401 as per docs.
        return res.status(401).json({ error: 'HMAC verification failed' });
    }

    console.log(`✅ Shopify webhook [${topic}] verified`);
    next();
}

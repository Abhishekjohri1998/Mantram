/**
 * Browse Abandonment Tracker — Retention Studio
 * 
 * Tracks user browsing activity on the Shopify storefront via a lightweight pixel script.
 * When a known user (identified by email cookie) browses products and leaves without
 * purchasing, a browse abandonment event is created for the retention pipeline.
 * 
 * Architecture:
 *   1. Tracking pixel (JS) → embedded on Shopify storefront
 *   2. Backend endpoint → receives page view events
 *   3. Aggregation cron → groups events into abandonment sessions
 *   4. Campaign trigger → feeds into retention flow templates
 */

// ── In-Memory Event Buffer ──
// In production, this would be a Redis stream or message queue.
const browseBuffer = new Map(); // key: email|sessionId -> [{ product, timestamp, ... }]

/**
 * Record a product page view event
 */
export function trackPageView(event) {
    const {
        email,
        sessionId,
        productId,
        productTitle,
        productUrl,
        productImage,
        productPrice,
        category,
        brandId,
        timestamp = new Date(),
    } = event;

    const key = email || sessionId;
    if (!key) return { tracked: false, reason: 'No identifier' };

    if (!browseBuffer.has(key)) {
        browseBuffer.set(key, {
            email: email || null,
            sessionId,
            brandId,
            events: [],
            firstSeen: timestamp,
            lastSeen: timestamp,
        });
    }

    const session = browseBuffer.get(key);
    session.lastSeen = timestamp;
    session.events.push({
        productId,
        productTitle,
        productUrl,
        productImage,
        productPrice: parseFloat(productPrice) || 0,
        category,
        viewedAt: timestamp,
    });

    // Cap events per session to prevent memory bloat
    if (session.events.length > 50) {
        session.events = session.events.slice(-50);
    }

    return { tracked: true, totalViews: session.events.length };
}

/**
 * Get browse abandonment candidates — users who viewed products but didn't purchase.
 * Call this periodically (e.g., every 30 mins) to find abandonments.
 */
export function getAbandonmentCandidates({ minViews = 2, inactiveMinutes = 30 } = {}) {
    const cutoff = new Date(Date.now() - inactiveMinutes * 60 * 1000);
    const candidates = [];

    for (const [key, session] of browseBuffer.entries()) {
        // Must have email to be actionable
        if (!session.email) continue;

        // Must have viewed at least N products
        if (session.events.length < minViews) continue;

        // Must be inactive (no recent views)
        if (new Date(session.lastSeen) > cutoff) continue;

        // Deduplicate products viewed
        const uniqueProducts = [];
        const seen = new Set();
        for (const evt of session.events) {
            if (!seen.has(evt.productId)) {
                seen.add(evt.productId);
                uniqueProducts.push(evt);
            }
        }

        candidates.push({
            email: session.email,
            sessionId: session.sessionId,
            brandId: session.brandId,
            productsViewed: uniqueProducts,
            totalPageViews: session.events.length,
            uniqueProductsViewed: uniqueProducts.length,
            firstViewAt: session.firstSeen,
            lastViewAt: session.lastSeen,
            sessionDurationMinutes: Math.round(
                (new Date(session.lastSeen) - new Date(session.firstSeen)) / 60000
            ),
            topProduct: uniqueProducts.reduce((top, p) => {
                const count = session.events.filter(e => e.productId === p.productId).length;
                return count > (top.views || 0) ? { ...p, views: count } : top;
            }, {}),
        });

        // Remove processed session
        browseBuffer.delete(key);
    }

    return {
        candidates,
        total: candidates.length,
        processedAt: new Date(),
    };
}

/**
 * Generate the client-side tracking pixel/script
 */
export function generateTrackingScript(brandId) {
    const apiBase = process.env.BACKEND_URL || 'https://api.mantram.ai';

    return `
(function() {
    'use strict';
    if (window.__mantramTracker) return;
    window.__mantramTracker = true;

    var BRAND_ID = '${brandId}';
    var API_BASE = '${apiBase}';
    var SESSION_ID = 'mt_' + Math.random().toString(36).slice(2, 12);

    // Try to get email from cookie (set by login/checkout)
    function getEmail() {
        var match = document.cookie.match(/mantram_email=([^;]+)/);
        return match ? decodeURIComponent(match[1]) : null;
    }

    // Detect if we're on a product page
    function isProductPage() {
        return window.location.pathname.match(/\\/products\\/[^/]+/);
    }

    // Extract product data from Shopify's built-in meta
    function getProductData() {
        var meta = {};
        try {
            // Shopify injects ShopifyAnalytics.meta or __st
            if (window.ShopifyAnalytics && ShopifyAnalytics.meta && ShopifyAnalytics.meta.product) {
                var p = ShopifyAnalytics.meta.product;
                meta = { id: p.id, title: p.type || document.title, price: p.price / 100 };
            }
            // Fallback: read structured data
            var ldJson = document.querySelector('script[type="application/ld+json"]');
            if (ldJson) {
                var ld = JSON.parse(ldJson.textContent);
                if (ld['@type'] === 'Product') {
                    meta.title = meta.title || ld.name;
                    meta.price = meta.price || parseFloat(ld.offers?.price || 0);
                    meta.image = ld.image;
                }
            }
        } catch(e) {}

        meta.url = window.location.href;
        meta.title = meta.title || document.title.split('–')[0].trim();

        // Try to get image from og:image
        var ogImg = document.querySelector('meta[property="og:image"]');
        if (ogImg) meta.image = meta.image || ogImg.content;

        return meta;
    }

    // Send tracking event
    function track(product) {
        var email = getEmail();
        var data = {
            brandId: BRAND_ID,
            sessionId: SESSION_ID,
            email: email,
            productId: String(product.id || ''),
            productTitle: product.title || '',
            productUrl: product.url || window.location.href,
            productImage: product.image || '',
            productPrice: product.price || 0,
            category: product.type || '',
        };

        // Use sendBeacon for reliability (works even on page unload)
        if (navigator.sendBeacon) {
            navigator.sendBeacon(
                API_BASE + '/api/retention-studio/track',
                new Blob([JSON.stringify(data)], { type: 'application/json' })
            );
        } else {
            fetch(API_BASE + '/api/retention-studio/track', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
                keepalive: true
            }).catch(function() {});
        }
    }

    // Track product page views
    if (isProductPage()) {
        // Small delay to let Shopify's scripts populate meta
        setTimeout(function() {
            var product = getProductData();
            if (product.title) track(product);
        }, 1000);
    }

    // Set email cookie when user interacts with forms (checkout, login)
    document.addEventListener('submit', function(e) {
        var emailInput = e.target.querySelector('input[type="email"]');
        if (emailInput && emailInput.value) {
            document.cookie = 'mantram_email=' + encodeURIComponent(emailInput.value) + ';path=/;max-age=' + (30*24*60*60);
        }
    });
})();
`.trim();
}

/**
 * Get buffer stats (for monitoring)
 */
export function getTrackerStats() {
    let totalEvents = 0;
    let withEmail = 0;

    for (const session of browseBuffer.values()) {
        totalEvents += session.events.length;
        if (session.email) withEmail++;
    }

    return {
        activeSessions: browseBuffer.size,
        totalEvents,
        sessionsWithEmail: withEmail,
        sessionsAnonymous: browseBuffer.size - withEmail,
    };
}

/**
 * Clear old sessions (call periodically for memory management)
 */
export function cleanupStaleSessions(maxAgeMinutes = 120) {
    const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000);
    let cleaned = 0;

    for (const [key, session] of browseBuffer.entries()) {
        if (new Date(session.lastSeen) < cutoff) {
            browseBuffer.delete(key);
            cleaned++;
        }
    }

    return { cleaned, remaining: browseBuffer.size };
}

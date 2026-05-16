/**
 * Shopify Service
 * Handles Shopify OAuth, product fetch, and sync operations.
 * Uses the official @shopify/shopify-api library.
 */

import '@shopify/shopify-api/adapters/node';
import { shopifyApi, ApiVersion, Session } from '@shopify/shopify-api';
import config from '../config/env.js';

// Initialize the official Shopify API client
export const shopify = shopifyApi({
    apiKey: config.shopify.apiKey || process.env.SHOPIFY_API_KEY || 'dummy',
    apiSecretKey: config.shopify.apiSecret || process.env.SHOPIFY_API_SECRET || 'dummy',
    scopes: (config.shopify.scope || 'read_products,read_orders,read_customers,read_inventory').split(','),
    hostName: (process.env.BACKEND_URL || 'localhost:3001').replace(/^https?:\/\//, ''),
    hostScheme: (process.env.BACKEND_URL && process.env.BACKEND_URL.startsWith('https')) ? 'https' : 'http',
    apiVersion: ApiVersion.January25,
    isEmbeddedApp: false, // Set to true if rendering within Shopify Admin iframe
});

/**
 * Build Shopify OAuth authorization URL (Manual fallback)
 */
export function getShopifyAuthUrl(shopDomain, clientId, redirectUri, scopes = 'read_products,read_orders,read_customers,read_inventory') {
    const cleanDomain = shopDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    return `https://${cleanDomain}/admin/oauth/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}`;
}

/**
 * Exchange OAuth code for access token
 */
export async function exchangeShopifyToken(shopDomain, clientId, clientSecret, code) {
    const cleanDomain = shopDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const response = await fetch(`https://${cleanDomain}/admin/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    });

    if (!response.ok) {
        throw new Error(`Shopify token exchange failed: ${response.status}`);
    }
    return await response.json(); // { access_token, scope }
}

/**
 * Create an offline session object for the REST client
 */
function getShopifySession(shopDomain, accessToken) {
    const cleanDomain = shopDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    return new Session({
        id: `offline_${cleanDomain}`,
        shop: cleanDomain,
        state: 'offline',
        isOnline: false,
        accessToken,
    });
}

/**
 * Fetch all products from a Shopify store using official REST client (paginated)
 */
export async function fetchShopifyProducts(accessToken, shopDomain, limit = 250) {
    const session = getShopifySession(shopDomain, accessToken);
    const client = new shopify.clients.Rest({ session });
    
    const allProducts = [];
    let response = await client.get({
        path: 'products',
        query: { limit, status: 'active' }
    });
    
    if (response.body?.products) allProducts.push(...response.body.products);
    
    while (response.pageInfo?.nextPage) {
        response = await client.get(response.pageInfo.nextPage);
        if (response.body?.products) allProducts.push(...response.body.products);
    }
    
    console.log(`  📦 Fetched ${allProducts.length} products from Shopify`);
    return allProducts;
}

/**
 * Fetch orders from Shopify using official REST client (paginated)
 */
export async function fetchShopifyOrders(accessToken, shopDomain, { days = 60, status = 'any', limit = 250 } = {}) {
    const session = getShopifySession(shopDomain, accessToken);
    const client = new shopify.clients.Rest({ session });
    
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const allOrders = [];
    
    let response = await client.get({
        path: 'orders',
        query: { limit, status, created_at_min: since, order: 'created_at desc' }
    });
    
    if (response.body?.orders) allOrders.push(...response.body.orders);
    
    while (response.pageInfo?.nextPage) {
        response = await client.get(response.pageInfo.nextPage);
        if (response.body?.orders) allOrders.push(...response.body.orders);
    }
    
    console.log(`  🧾 Fetched ${allOrders.length} orders from Shopify (last ${days} days)`);
    return allOrders;
}

/**
 * Fetch customers from Shopify using official REST client (paginated)
 */
export async function fetchShopifyCustomers(accessToken, shopDomain, { limit = 250 } = {}) {
    const session = getShopifySession(shopDomain, accessToken);
    const client = new shopify.clients.Rest({ session });
    
    const allCustomers = [];
    let response = await client.get({
        path: 'customers',
        query: { limit, order: 'created_at desc' }
    });
    
    if (response.body?.customers) allCustomers.push(...response.body.customers);
    
    while (response.pageInfo?.nextPage) {
        response = await client.get(response.pageInfo.nextPage);
        if (response.body?.customers) allCustomers.push(...response.body.customers);
    }
    
    console.log(`  👥 Fetched ${allCustomers.length} customers from Shopify`);
    return allCustomers;
}

/**
 * Fetch order count
 */
export async function fetchShopifyOrderCount(accessToken, shopDomain, { days = 60, status = 'any' } = {}) {
    const session = getShopifySession(shopDomain, accessToken);
    const client = new shopify.clients.Rest({ session });
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    
    try {
        const response = await client.get({
            path: 'orders/count',
            query: { status, created_at_min: since }
        });
        return response.body?.count || 0;
    } catch (e) {
        return 0;
    }
}

/**
 * Transform Shopify product to our Product model format
 */
export function transformShopifyProduct(shopifyProduct, userId, brandId) {
    return {
        shopifyId: String(shopifyProduct.id),
        title: shopifyProduct.title || '',
        description: (shopifyProduct.body_html || '').replace(/<[^>]*>/g, '').trim(),
        handle: shopifyProduct.handle || '',
        vendor: shopifyProduct.vendor || '',
        productType: shopifyProduct.product_type || '',
        tags: (shopifyProduct.tags || '').split(',').map(t => t.trim()).filter(Boolean),
        status: shopifyProduct.status === 'active' ? 'active' : 'draft',
        images: (shopifyProduct.images || []).map((img, i) => ({
            url: img.src,
            alt: img.alt || '',
            position: img.position || i,
        })),
        variants: (shopifyProduct.variants || []).map(v => ({
            shopifyVariantId: String(v.id),
            title: v.title || 'Default',
            price: parseFloat(v.price) || 0,
            compareAtPrice: v.compare_at_price ? parseFloat(v.compare_at_price) : undefined,
            sku: v.sku || '',
            inventoryQuantity: v.inventory_quantity || 0,
            weight: v.weight,
            weightUnit: v.weight_unit,
        })),
        user: userId,
        brand: brandId,
        source: 'shopify',
        syncedAt: new Date(),
        shopifyUpdatedAt: shopifyProduct.updated_at ? new Date(shopifyProduct.updated_at) : new Date(),
    };
}

/**
 * Fetch a single product by Shopify ID
 */
export async function fetchShopifyProduct(accessToken, shopDomain, productId) {
    const session = getShopifySession(shopDomain, accessToken);
    const client = new shopify.clients.Rest({ session });
    
    const response = await client.get({
        path: `products/${productId}`
    });
    return response.body?.product;
}

/**
 * Get Shopify shop info
 */
export async function getShopInfo(accessToken, shopDomain) {
    const session = getShopifySession(shopDomain, accessToken);
    const client = new shopify.clients.Rest({ session });
    
    const response = await client.get({ path: 'shop' });
    return response.body?.shop;
}

/**
 * Register mandatory and custom webhooks for a shop
 */
export async function registerShopifyWebhooks(accessToken, shopDomain, backendUrl) {
    const session = getShopifySession(shopDomain, accessToken);
    const client = new shopify.clients.Rest({ session });
    
    const topics = [
        'orders/create',
        'orders/updated',
        'products/update',
        'app/uninstalled'
    ];

    const results = [];
    for (const topic of topics) {
        try {
            const response = await client.post({
                path: 'webhooks',
                data: {
                    webhook: {
                        topic,
                        address: `${backendUrl}/api/shopify/webhooks/${topic.replace('/', '-')}`,
                        format: 'json',
                    }
                },
                type: 'application/json'
            });
            results.push({ topic, success: true, data: response.body });
        } catch (e) {
            results.push({ topic, success: false, error: e.message });
        }
    }
    return results;
}

/**
 * Transform Shopify Order for our DB
 */
export function transformShopifyOrder(o, userId, brandId) {
    return {
        user: userId,
        brand: brandId,
        shopifyOrderId: String(o.id),
        shopifyOrderNumber: String(o.order_number),
        totalPrice: parseFloat(o.total_price || 0),
        subtotalPrice: parseFloat(o.subtotal_price || 0),
        totalDiscounts: parseFloat(o.total_discounts || 0),
        currency: o.currency || 'INR',
        financialStatus: o.financial_status,
        fulfillmentStatus: o.fulfillment_status,
        customer: {
            shopifyCustomerId: String(o.customer?.id || ''),
            email: o.customer?.email,
            firstName: o.customer?.first_name,
            lastName: o.customer?.last_name,
            city: o.shipping_address?.city || o.billing_address?.city,
            province: o.shipping_address?.province || o.billing_address?.province,
            country: o.shipping_address?.country || o.billing_address?.country,
        },
        lineItems: (o.line_items || []).map(li => ({
            shopifyLineItemId: String(li.id),
            productId: String(li.product_id),
            variantId: String(li.variant_id),
            title: li.title,
            quantity: li.quantity,
            price: parseFloat(li.price || 0),
            sku: li.sku
        })),
        shopifyCreatedAt: new Date(o.created_at),
        shopifyUpdatedAt: new Date(o.updated_at),
        rawData: o,
        syncedAt: new Date()
    };
}

/**
 * Transform Shopify Customer for our DB
 */
export function transformShopifyCustomer(c, userId, brandId) {
    return {
        user: userId,
        brand: brandId,
        shopifyCustomerId: String(c.id),
        email: c.email,
        firstName: c.first_name,
        lastName: c.last_name,
        phone: c.phone,
        ordersCount: c.orders_count || 0,
        totalSpent: parseFloat(c.total_spent || 0),
        currency: c.currency || 'INR',
        defaultAddress: {
            city: c.default_address?.city,
            province: c.default_address?.province,
            country: c.default_address?.country,
            zip: c.default_address?.zip
        },
        acceptsMarketing: c.accepts_marketing,
        marketingConsent: c.email_marketing_consent,
        tags: (c.tags || '').split(',').map(t => t.trim()).filter(Boolean),
        state: c.state,
        shopifyCreatedAt: new Date(c.created_at),
        shopifyUpdatedAt: new Date(c.updated_at),
        syncedAt: new Date()
    };
}

/**
 * Unified store data sync logic
 */
export async function syncStoreData(accessToken, shopDomain, userId, brandId, models) {
    const { Product, ShopifyOrder, ShopifyCustomer } = models;
    const results = { products: 0, orders: 0, customers: 0 };

    try {
        // 1. Sync Products
        const products = await fetchShopifyProducts(accessToken, shopDomain);
        for (const p of products) {
            const transformed = transformShopifyProduct(p, userId, brandId);
            await Product.findOneAndUpdate(
                { brand: brandId, shopifyId: String(p.id) },
                transformed,
                { upsert: true }
            );
            results.products++;
        }

        // 2. Sync Orders (last 60 days)
        const orders = await fetchShopifyOrders(accessToken, shopDomain, 60);
        for (const o of orders) {
            const transformed = transformShopifyOrder(o, userId, brandId);
            await ShopifyOrder.findOneAndUpdate(
                { brand: brandId, shopifyOrderId: String(o.id) },
                transformed,
                { upsert: true }
            );
            results.orders++;
        }

        // 3. Sync Customers
        const customers = await fetchShopifyCustomers(accessToken, shopDomain);
        for (const c of customers) {
            const transformed = transformShopifyCustomer(c, userId, brandId);
            await ShopifyCustomer.findOneAndUpdate(
                { brand: brandId, shopifyCustomerId: String(c.id) },
                transformed,
                { upsert: true }
            );
            results.customers++;
        }

        return results;
    } catch (e) {
        console.error('syncStoreData error:', e);
        throw e;
    }
}

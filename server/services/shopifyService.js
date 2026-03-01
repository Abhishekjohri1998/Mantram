/**
 * Shopify Service
 * Handles Shopify OAuth, product fetch, and sync operations.
 * Uses Shopify Storefront/Admin REST API.
 */

const SHOPIFY_API_VERSION = '2024-01';

/**
 * Build Shopify OAuth authorization URL
 */
export function getShopifyAuthUrl(shopDomain, clientId, redirectUri, scopes = 'read_products') {
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
 * Fetch all products from a Shopify store (paginated)
 */
export async function fetchShopifyProducts(accessToken, shopDomain, limit = 250) {
    const cleanDomain = shopDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const allProducts = [];
    let url = `https://${cleanDomain}/admin/api/${SHOPIFY_API_VERSION}/products.json?limit=${limit}&status=active`;

    while (url) {
        const response = await fetch(url, {
            headers: {
                'X-Shopify-Access-Token': accessToken,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        allProducts.push(...(data.products || []));

        // Check for pagination (Link header)
        const linkHeader = response.headers.get('link');
        url = null;
        if (linkHeader) {
            const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
            if (nextMatch) url = nextMatch[1];
        }
    }

    console.log(`  📦 Fetched ${allProducts.length} products from Shopify`);
    return allProducts;
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
    const cleanDomain = shopDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const response = await fetch(
        `https://${cleanDomain}/admin/api/${SHOPIFY_API_VERSION}/products/${productId}.json`,
        { headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' } }
    );
    if (!response.ok) throw new Error(`Shopify: Product ${productId} not found`);
    const data = await response.json();
    return data.product;
}

/**
 * Get Shopify shop info
 */
export async function getShopInfo(accessToken, shopDomain) {
    const cleanDomain = shopDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const response = await fetch(
        `https://${cleanDomain}/admin/api/${SHOPIFY_API_VERSION}/shop.json`,
        { headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' } }
    );
    if (!response.ok) throw new Error('Failed to get shop info');
    const data = await response.json();
    return data.shop;
}

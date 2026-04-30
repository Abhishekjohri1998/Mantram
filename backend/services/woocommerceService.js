/**
 * WooCommerce Service
 * Handles WooCommerce REST API v3 operations: validation, product/order/customer sync,
 * and product publishing (create/update).
 * Auth: Consumer Key + Consumer Secret (Basic Auth over HTTPS).
 */

function wooAuth(consumerKey, consumerSecret) {
    return 'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
}

function cleanBaseUrl(url) {
    return url.replace(/\/$/, '');
}

// ── Generic paginated fetcher ─────────────────────────────────────────────────
async function wooPaginatedFetch(baseUrl, consumerKey, consumerSecret, endpoint, perPage = 100) {
    const all = [];
    let page = 1;
    while (true) {
        const url = `${cleanBaseUrl(baseUrl)}/wp-json/wc/v3/${endpoint}?per_page=${perPage}&page=${page}`;
        const res = await fetch(url, {
            headers: { 'Authorization': wooAuth(consumerKey, consumerSecret), 'Content-Type': 'application/json' },
        });
        if (!res.ok) {
            const text = await res.text().catch(() => res.statusText);
            throw new Error(`WooCommerce API error ${res.status}: ${text}`);
        }
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) break;
        all.push(...data);
        if (data.length < perPage) break;
        page++;
    }
    return all;
}

// ── Validate WooCommerce credentials ─────────────────────────────────────────
export async function validateWooConnection(baseUrl, consumerKey, consumerSecret) {
    const url = `${cleanBaseUrl(baseUrl)}/wp-json/wc/v3/system_status`;
    const res = await fetch(url, {
        headers: { 'Authorization': wooAuth(consumerKey, consumerSecret), 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error(`WooCommerce validation failed: ${res.status} — check your URL and API keys`);
    const data = await res.json();
    return {
        siteName: data.environment?.site_title || cleanBaseUrl(baseUrl),
        version: data.environment?.version || '',
        wooVersion: data.environment?.wc_version || '',
    };
}

// ── Fetch products ────────────────────────────────────────────────────────────
export async function fetchWooProducts(baseUrl, consumerKey, consumerSecret) {
    const products = await wooPaginatedFetch(baseUrl, consumerKey, consumerSecret, 'products');
    console.log(`  📦 Fetched ${products.length} WooCommerce products`);
    return products;
}

// ── Fetch orders ──────────────────────────────────────────────────────────────
export async function fetchWooOrders(baseUrl, consumerKey, consumerSecret, { days = 60 } = {}) {
    const after = new Date(Date.now() - days * 86400000).toISOString();
    const orders = await wooPaginatedFetch(baseUrl, consumerKey, consumerSecret, `orders?after=${encodeURIComponent(after)}`);
    console.log(`  🧾 Fetched ${orders.length} WooCommerce orders`);
    return orders;
}

// ── Fetch customers ───────────────────────────────────────────────────────────
export async function fetchWooCustomers(baseUrl, consumerKey, consumerSecret) {
    const customers = await wooPaginatedFetch(baseUrl, consumerKey, consumerSecret, 'customers');
    console.log(`  👥 Fetched ${customers.length} WooCommerce customers`);
    return customers;
}

// ── Transform WooCommerce product → Product model ─────────────────────────────
export function transformWooProduct(product, userId, brandId) {
    return {
        shopifyId: `woo-${product.id}`,  // reuse shopifyId field for compatibility
        wooCommerceId: String(product.id),
        title: product.name || '',
        description: (product.description || product.short_description || '').replace(/<[^>]*>/g, '').trim().substring(0, 2000),
        handle: product.slug || '',
        vendor: '',
        productType: product.categories?.[0]?.name || '',
        tags: (product.tags || []).map(t => t.name),
        status: product.status === 'publish' ? 'active' : 'draft',
        images: (product.images || []).map((img, i) => ({
            url: img.src,
            alt: img.alt || '',
            position: i,
        })),
        variants: product.type === 'simple' ? [{
            title: 'Default',
            price: parseFloat(product.price || product.regular_price || 0),
            compareAtPrice: parseFloat(product.regular_price || 0) || undefined,
            sku: product.sku || '',
            inventoryQuantity: product.stock_quantity || 0,
        }] : (product.variations || []).map(v => ({
            shopifyVariantId: String(v.id || ''),
            title: (v.attributes || []).map(a => a.option).join(' / ') || 'Variant',
            price: parseFloat(v.price || 0),
            sku: v.sku || '',
            inventoryQuantity: v.stock_quantity || 0,
        })),
        user: userId,
        brand: brandId,
        source: 'woocommerce',
        syncedAt: new Date(),
    };
}

// ── Transform WooCommerce order → order-like document ─────────────────────────
export function transformWooOrder(order, userId, brandId) {
    const lineItems = (order.line_items || []).map(li => ({
        productId: String(li.product_id || ''),
        title: li.name || '',
        quantity: li.quantity || 1,
        price: parseFloat(li.price || 0),
        sku: li.sku || '',
        shopifyLineItemId: String(li.id || ''),
        variantId: String(li.variation_id || ''),
        variantTitle: '',
    }));

    return {
        user: userId,
        brand: brandId,
        shopifyOrderId: `woo-${order.id}`,
        shopifyOrderNumber: String(order.number || order.id),
        totalPrice: parseFloat(order.total || 0),
        subtotalPrice: lineItems.reduce((s, li) => s + (li.price * li.quantity), 0),
        totalDiscounts: parseFloat(order.discount_total || 0),
        currency: order.currency || 'INR',
        financialStatus: order.payment_method ? (order.status === 'completed' ? 'paid' : order.status) : 'pending',
        fulfillmentStatus: (order.status === 'completed' || order.status === 'shipped') ? 'fulfilled' : null,
        customer: {
            shopifyCustomerId: String(order.customer_id || ''),
            email: order.billing?.email || '',
            firstName: order.billing?.first_name || '',
            lastName: order.billing?.last_name || '',
            city: order.shipping?.city || order.billing?.city || '',
            province: order.shipping?.state || order.billing?.state || '',
            country: order.shipping?.country || order.billing?.country || '',
        },
        lineItems,
        shopifyCreatedAt: new Date(order.date_created),
        shopifyUpdatedAt: new Date(order.date_modified),
        syncedAt: new Date(),
        source: 'woocommerce',
    };
}

// ── Transform WooCommerce customer ────────────────────────────────────────────
export function transformWooCustomer(customer, userId, brandId) {
    return {
        user: userId,
        brand: brandId,
        shopifyCustomerId: `woo-${customer.id}`,
        email: customer.email || '',
        firstName: customer.first_name || '',
        lastName: customer.last_name || '',
        ordersCount: customer.orders_count || 0,
        totalSpent: parseFloat(customer.total_spent || 0),
        defaultAddress: {
            city: customer.shipping?.city || customer.billing?.city || '',
            province: customer.shipping?.state || customer.billing?.state || '',
            country: customer.shipping?.country || customer.billing?.country || '',
        },
        acceptsMarketing: false,
        tags: [],
        shopifyCreatedAt: new Date(customer.date_created),
        shopifyUpdatedAt: new Date(customer.date_modified),
        syncedAt: new Date(),
        source: 'woocommerce',
    };
}

// ── Create product in WooCommerce ─────────────────────────────────────────────
export async function createWooProduct(baseUrl, consumerKey, consumerSecret, product) {
    const body = {
        name: product.title || '',
        description: product.description || '',
        short_description: (product.description || '').substring(0, 200),
        regular_price: String(product.variants?.[0]?.price || '0'),
        sku: product.variants?.[0]?.sku || '',
        status: 'draft',
        manage_stock: (product.variants?.[0]?.inventoryQuantity || 0) > 0,
        stock_quantity: product.variants?.[0]?.inventoryQuantity || null,
        tags: (product.tags || []).map(t => ({ name: t })),
        images: (product.images || []).slice(0, 10).map(img => ({ src: img.url, alt: img.alt || '' })),
    };

    const url = `${cleanBaseUrl(baseUrl)}/wp-json/wc/v3/products`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': wooAuth(consumerKey, consumerSecret), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`WooCommerce create product failed ${res.status}: ${text}`);
    }
    return res.json();
}

// ── Update product in WooCommerce ─────────────────────────────────────────────
export async function updateWooProduct(baseUrl, consumerKey, consumerSecret, wooProductId, product) {
    const body = {
        name: product.title || '',
        description: product.description || '',
        regular_price: String(product.variants?.[0]?.price || '0'),
        tags: (product.tags || []).map(t => ({ name: t })),
    };

    const url = `${cleanBaseUrl(baseUrl)}/wp-json/wc/v3/products/${wooProductId}`;
    const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Authorization': wooAuth(consumerKey, consumerSecret), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`WooCommerce update product failed ${res.status}: ${text}`);
    }
    return res.json();
}

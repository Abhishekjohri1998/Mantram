/**
 * Etsy Service
 * Handles Etsy API v3 operations: validation, product sync, order sync, and listing creation.
 * Uses Etsy Open API v3 with keystring (API key) auth for reads.
 */

const ETSY_API_BASE = 'https://openapi.etsy.com/v3';

// ── Generic Etsy fetcher ──────────────────────────────────────────────────────
async function etsyFetch(path, apiKey, options = {}) {
    const url = `${ETSY_API_BASE}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            'x-api-key': apiKey,
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        },
    });
    if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`Etsy API error ${res.status}: ${text}`);
    }
    return res.json();
}

// ── Validate API key and fetch shop info ─────────────────────────────────────
export async function validateEtsyApiKey(apiKey, shopId) {
    const data = await etsyFetch(`/application/shops/${shopId}`, apiKey);
    return data; // { shop_id, shop_name, url, ... }
}

// ── Fetch shop's shipping profiles (needed for listing creation) ──────────────
export async function fetchEtsyShippingProfiles(apiKey, shopId) {
    try {
        const data = await etsyFetch(`/application/shops/${shopId}/shipping-profiles`, apiKey);
        return data.results || [];
    } catch { return []; }
}

// ── Fetch shop's taxonomy (needed for listing creation) ───────────────────────
export async function fetchEtsyTaxonomies(apiKey) {
    try {
        const data = await etsyFetch('/application/seller-taxonomy/nodes', apiKey);
        return data.results || [];
    } catch { return []; }
}

// ── Paginated listing fetch ───────────────────────────────────────────────────
export async function fetchEtsyListings(apiKey, shopId) {
    const all = [];
    let offset = 0;
    const limit = 100;
    while (true) {
        const data = await etsyFetch(`/application/shops/${shopId}/listings/active?limit=${limit}&offset=${offset}&includes=Images,MainImage`, apiKey);
        const results = data.results || [];
        all.push(...results);
        if (results.length < limit) break;
        offset += limit;
    }
    console.log(`  🛍️ Fetched ${all.length} Etsy listings`);
    return all;
}

// ── Fetch receipts (orders) ───────────────────────────────────────────────────
export async function fetchEtsyReceipts(apiKey, shopId, { days = 60 } = {}) {
    const all = [];
    let offset = 0;
    const limit = 100;
    const minCreated = Math.floor((Date.now() - days * 86400000) / 1000);
    while (true) {
        const data = await etsyFetch(`/application/shops/${shopId}/receipts?limit=${limit}&offset=${offset}&min_created=${minCreated}`, apiKey);
        const results = data.results || [];
        all.push(...results);
        if (results.length < limit) break;
        offset += limit;
    }
    console.log(`  🧾 Fetched ${all.length} Etsy receipts`);
    return all;
}

// ── Transform Etsy listing → Product model ────────────────────────────────────
export function transformEtsyListing(listing, userId, brandId) {
    const mainImage = listing.MainImage || listing.images?.[0];
    const allImages = listing.images || (mainImage ? [mainImage] : []);
    return {
        etsyListingId: String(listing.listing_id),
        title: listing.title || '',
        description: (listing.description || '').substring(0, 2000),
        handle: listing.listing_id ? `etsy-${listing.listing_id}` : '',
        vendor: 'Etsy',
        productType: listing.taxonomy_path?.[listing.taxonomy_path.length - 1] || '',
        tags: listing.tags || [],
        status: listing.state === 'active' ? 'active' : 'draft',
        images: allImages.map((img, i) => ({
            url: img.url_fullxfull || img.url_570xN || img.url,
            alt: img.alt_text || '',
            position: i,
        })),
        variants: [{
            title: 'Default',
            price: listing.price?.amount ? listing.price.amount / listing.price.divisor : 0,
            sku: listing.sku?.[0] || '',
            inventoryQuantity: listing.quantity || 0,
        }],
        user: userId,
        brand: brandId,
        source: 'etsy',
        syncedAt: new Date(),
    };
}

// ── Transform Etsy receipt → order-like document ──────────────────────────────
export function transformEtsyReceipt(receipt, userId, brandId) {
    const lineItems = (receipt.transactions || []).map(t => ({
        productId: String(t.listing_id || ''),
        title: t.title || '',
        quantity: t.quantity || 1,
        price: t.price?.amount ? t.price.amount / (t.price.divisor || 100) : 0,
        sku: '',
        shopifyLineItemId: String(t.transaction_id || ''),
        variantId: '',
        variantTitle: '',
    }));

    const totalPrice = lineItems.reduce((s, li) => s + li.price * li.quantity, 0) + (receipt.total_shipping_cost?.amount ? receipt.total_shipping_cost.amount / 100 : 0);

    return {
        user: userId,
        brand: brandId,
        shopifyOrderId: `etsy-${receipt.receipt_id}`,
        shopifyOrderNumber: String(receipt.receipt_id),
        totalPrice: Math.round(totalPrice * 100) / 100,
        subtotalPrice: lineItems.reduce((s, li) => s + li.price * li.quantity, 0),
        totalDiscounts: receipt.discount_amt?.amount ? receipt.discount_amt.amount / 100 : 0,
        currency: receipt.currency_code || 'USD',
        financialStatus: receipt.is_paid ? 'paid' : 'pending',
        fulfillmentStatus: receipt.is_shipped ? 'fulfilled' : null,
        customer: {
            shopifyCustomerId: String(receipt.buyer_user_id || ''),
            email: receipt.buyer_email || '',
            firstName: (receipt.name || '').split(' ')[0] || '',
            lastName: (receipt.name || '').split(' ').slice(1).join(' ') || '',
            city: receipt.city || '',
            province: receipt.state || '',
            country: receipt.country_iso || '',
        },
        lineItems,
        shopifyCreatedAt: new Date(receipt.create_timestamp * 1000),
        shopifyUpdatedAt: new Date(receipt.update_timestamp * 1000),
        syncedAt: new Date(),
        source: 'etsy',
    };
}

// ── Create Etsy listing (requires OAuth access token for write) ───────────────
export async function createEtsyListing(accessToken, apiKey, shopId, product, shippingProfileId, taxonomyId) {
    const price = product.variants?.[0]?.price || 0;
    const quantity = product.variants?.[0]?.inventoryQuantity || 1;

    const body = {
        quantity: Math.max(1, quantity),
        title: (product.title || '').substring(0, 140),
        description: (product.description || '').substring(0, 5000),
        price: parseFloat(price.toFixed(2)),
        who_made: 'i_did',
        when_made: 'made_to_order',
        taxonomy_id: parseInt(taxonomyId) || 68887669, // fallback: "Other"
        shipping_profile_id: parseInt(shippingProfileId),
        tags: (product.tags || []).slice(0, 13),
        state: 'draft', // create as draft; seller activates manually
    };

    const res = await fetch(`${ETSY_API_BASE}/application/shops/${shopId}/listings`, {
        method: 'POST',
        headers: {
            'x-api-key': apiKey,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`Etsy create listing failed ${res.status}: ${text}`);
    }
    return res.json();
}

// ── Update Etsy listing ───────────────────────────────────────────────────────
export async function updateEtsyListing(accessToken, apiKey, shopId, listingId, product) {
    const price = product.variants?.[0]?.price || 0;
    const body = {
        title: (product.title || '').substring(0, 140),
        description: (product.description || '').substring(0, 5000),
        price: parseFloat(price.toFixed(2)),
        tags: (product.tags || []).slice(0, 13),
    };

    const res = await fetch(`${ETSY_API_BASE}/application/shops/${shopId}/listings/${listingId}`, {
        method: 'PATCH',
        headers: {
            'x-api-key': apiKey,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`Etsy update listing failed ${res.status}: ${text}`);
    }
    return res.json();
}

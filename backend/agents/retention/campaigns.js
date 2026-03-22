/**
 * Retention Studio — Campaign Utilities
 * 
 * Win-Back discovery, Price Drop monitoring, A/B test management,
 * and revenue attribution helpers.
 */

import ShopifyCustomer from '../../models/ShopifyCustomer.js';
import ShopifyOrder from '../../models/ShopifyOrder.js';
import Product from '../../models/Product.js';
import Contact from '../../models/Contact.js';
import Brand from '../../models/Brand.js';

// ═══════════════════════════════════════════════════════════════
//  WIN-BACK — Find dormant customers
// ═══════════════════════════════════════════════════════════════

/**
 * Find customers who haven't ordered in N days
 */
export async function findWinBackCandidates(brandId, { inactiveDays = 60, limit = 200 } = {}) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - inactiveDays);

    // Get all customers for this brand
    const customers = await ShopifyCustomer.find({
        brand: brandId,
        acceptsMarketing: true,
        ordersCount: { $gte: 1 },
    }).lean();

    // Get their last order dates
    const results = [];
    for (const cust of customers) {
        const lastOrder = await ShopifyOrder.findOne({
            brand: brandId,
            'customer.shopifyCustomerId': cust.shopifyCustomerId,
        }).sort({ shopifyCreatedAt: -1 }).select('shopifyCreatedAt totalPrice').lean();

        if (!lastOrder || new Date(lastOrder.shopifyCreatedAt) < cutoffDate) {
            const daysSince = lastOrder
                ? Math.floor((Date.now() - new Date(lastOrder.shopifyCreatedAt)) / (86400000))
                : 999;

            results.push({
                customerId: cust._id,
                email: cust.email,
                name: `${cust.firstName || ''} ${cust.lastName || ''}`.trim(),
                phone: cust.phone,
                totalSpent: cust.totalSpent,
                ordersCount: cust.ordersCount,
                daysSinceLastOrder: daysSince,
                lastOrderAmount: lastOrder?.totalPrice || 0,
                city: cust.defaultAddress?.city,
            });
        }
        if (results.length >= limit) break;
    }

    // Sort by value (highest spenders first)
    results.sort((a, b) => b.totalSpent - a.totalSpent);

    return {
        candidates: results,
        total: results.length,
        criteria: { inactiveDays, cutoffDate },
    };
}


// ═══════════════════════════════════════════════════════════════
//  PRICE DROP — Monitor products for price changes
// ═══════════════════════════════════════════════════════════════

/**
 * Find products with active price drops (price < MRP/compareAt)
 */
export async function findPriceDropProducts(brandId) {
    const products = await Product.find({
        brand: brandId,
        status: 'active',
        'price.mrp': { $gt: 0 },
    }).lean();

    const drops = products
        .filter(p => p.price.amount < p.price.mrp)
        .map(p => {
            const savings = p.price.mrp - p.price.amount;
            const savingsPercent = Math.round((savings / p.price.mrp) * 100);
            return {
                productId: p._id,
                title: p.title,
                shopifyId: p.shopifyId,
                currentPrice: p.price.amount,
                originalPrice: p.price.mrp,
                savings,
                savingsPercent,
                currency: p.price.currency,
                image: p.images?.[0]?.url || '',
                category: p.category,
                handle: p.handle,
            };
        })
        .sort((a, b) => b.savingsPercent - a.savingsPercent);

    return {
        products: drops,
        total: drops.length,
    };
}

/**
 * Check variant-level price drops
 */
export async function findVariantPriceDrops(brandId) {
    const products = await Product.find({
        brand: brandId,
        status: 'active',
        'variants.compareAtPrice': { $gt: 0 },
    }).lean();

    const drops = [];
    for (const product of products) {
        for (const variant of (product.variants || [])) {
            if (variant.compareAtPrice && variant.price < variant.compareAtPrice) {
                const savings = variant.compareAtPrice - variant.price;
                drops.push({
                    productId: product._id,
                    productTitle: product.title,
                    variantTitle: variant.title,
                    currentPrice: variant.price,
                    originalPrice: variant.compareAtPrice,
                    savings,
                    savingsPercent: Math.round((savings / variant.compareAtPrice) * 100),
                    sku: variant.sku,
                    inStock: (variant.inventoryQuantity || 0) > 0,
                });
            }
        }
    }

    return { drops, total: drops.length };
}


// ═══════════════════════════════════════════════════════════════
//  A/B TESTING — Subject line & content variant testing
// ═══════════════════════════════════════════════════════════════

/**
 * Create A/B test variants for an email campaign
 */
export function createABTest(campaign, variants) {
    return {
        campaignId: campaign._id,
        testId: `ab_${Date.now()}`,
        createdAt: new Date(),
        status: 'running',
        variants: variants.map((v, i) => ({
            id: `variant_${String.fromCharCode(65 + i)}`, // A, B, C...
            label: `Variant ${String.fromCharCode(65 + i)}`,
            subjectLine: v.subjectLine || campaign.mailer?.subjectLine,
            previewText: v.previewText || campaign.mailer?.previewText,
            bodyHtml: v.bodyHtml || campaign.mailer?.bodyHtml,
            audiencePercent: v.audiencePercent || Math.floor(100 / variants.length),
            metrics: {
                sent: 0,
                opened: 0,
                clicked: 0,
                converted: 0,
                openRate: 0,
                clickRate: 0,
                conversionRate: 0,
            },
        })),
        winnerCriteria: 'open_rate', // open_rate, click_rate, conversion_rate
        autoSelectWinner: true,
        autoSelectAfterHours: 24,
        winner: null,
    };
}

/**
 * Calculate A/B test results and select winner
 */
export function calculateABResults(abTest) {
    const criteria = abTest.winnerCriteria || 'open_rate';
    let bestVariant = null;
    let bestScore = -1;

    for (const variant of abTest.variants) {
        const sent = variant.metrics.sent || 1;
        variant.metrics.openRate = Math.round((variant.metrics.opened / sent) * 100);
        variant.metrics.clickRate = Math.round((variant.metrics.clicked / sent) * 100);
        variant.metrics.conversionRate = Math.round((variant.metrics.converted / sent) * 100);

        const score = criteria === 'open_rate' ? variant.metrics.openRate
            : criteria === 'click_rate' ? variant.metrics.clickRate
            : variant.metrics.conversionRate;

        if (score > bestScore) {
            bestScore = score;
            bestVariant = variant.id;
        }
    }

    return {
        ...abTest,
        status: 'completed',
        winner: bestVariant,
        completedAt: new Date(),
    };
}


// ═══════════════════════════════════════════════════════════════
//  POST-PURCHASE — Find recent buyers for follow-up
// ═══════════════════════════════════════════════════════════════

/**
 * Get recent purchasers who haven't been contacted yet
 */
export async function findRecentBuyers(brandId, { daysBack = 7, limit = 100 } = {}) {
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - daysBack);

    const orders = await ShopifyOrder.find({
        brand: brandId,
        shopifyCreatedAt: { $gte: sinceDate },
        financialStatus: 'paid',
    })
    .sort({ shopifyCreatedAt: -1 })
    .limit(limit)
    .lean();

    // Deduplicate by customer email
    const seen = new Set();
    const buyers = [];

    for (const order of orders) {
        const email = order.customer?.email;
        if (!email || seen.has(email)) continue;
        seen.add(email);

        buyers.push({
            email,
            name: `${order.customer?.firstName || ''} ${order.customer?.lastName || ''}`.trim(),
            city: order.customer?.city,
            orderId: order.shopifyOrderId,
            orderNumber: order.shopifyOrderNumber,
            orderTotal: order.totalPrice,
            products: order.lineItems?.map(li => ({
                title: li.title,
                price: li.price,
                quantity: li.quantity,
            })) || [],
            orderDate: order.shopifyCreatedAt,
        });
    }

    return { buyers, total: buyers.length };
}


// ═══════════════════════════════════════════════════════════════
//  REVENUE ATTRIBUTION — Track campaign → purchase conversions
// ═══════════════════════════════════════════════════════════════

/**
 * Generate UTM parameters for a campaign
 */
export function generateCampaignUTM(campaign) {
    const base = {
        utm_source: 'mantram_retention',
        utm_medium: 'email',
        utm_campaign: `ret_${campaign._id}`,
        utm_content: campaign.title?.replace(/\s+/g, '_').toLowerCase().slice(0, 40) || 'retention',
    };

    return {
        params: base,
        queryString: new URLSearchParams(base).toString(),
        fullUrl: (baseUrl) => `${baseUrl}?${new URLSearchParams(base).toString()}`,
    };
}

/**
 * Match orders to campaign UTMs for attribution
 */
export async function attributeRevenue(brandId, campaignId, { windowDays = 7 } = {}) {
    // This is a placeholder — actual implementation would track UTM clicks
    // and match them to Shopify orders within the attribution window.
    // For now, return sample structure.
    return {
        campaignId,
        attributionWindow: `${windowDays} days`,
        ordersAttributed: 0,
        revenueAttributed: 0,
        conversionRate: 0,
        avgOrderValue: 0,
        topProducts: [],
    };
}

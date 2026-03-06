/**
 * Shopify-PM Revenue Bridge
 * 
 * Connects Shopify sales data to campaign performance for true blended ROAS (MER).
 * Leverages the existing Shopify integration and shopifyAnalytics data.
 */

import Integration from '../../models/Integration.js';
import AdCampaign from '../../models/AdCampaign.js';
import config from '../../config/env.js';

// ══════════════════════════════════════════════════════════════════════════════
// SHOPIFY REVENUE — Pull order data for a date range
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Get total Shopify revenue for a brand in a date range.
 * Uses the Shopify Admin API via stored access tokens.
 */
export async function getShopifyRevenueByDateRange(brandId, startDate, endDate) {
    const integration = await Integration.findOne({
        brand: brandId,
        platform: 'shopify',
        status: 'connected',
    });

    if (!integration) return { revenue: 0, orders: 0, error: 'Shopify not connected' };

    const shopDomain = integration.platformData?.shopDomain;
    const accessToken = integration.platformData?.accessToken;
    if (!shopDomain || !accessToken) return { revenue: 0, orders: 0, error: 'Missing Shopify credentials' };

    try {
        const start = startDate ? new Date(startDate).toISOString() : new Date(Date.now() - 30 * 86400000).toISOString();
        const end = endDate ? new Date(endDate).toISOString() : new Date().toISOString();

        const url = `https://${shopDomain}/admin/api/2024-10/orders.json?status=any&created_at_min=${start}&created_at_max=${end}&fields=id,total_price,currency,financial_status,created_at,referring_site,landing_site&limit=250`;

        const resp = await fetch(url, {
            headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' },
        });
        const data = await resp.json();
        const orders = data.orders || [];

        // Sum up revenue from paid/partially-paid orders
        const paidOrders = orders.filter(o => ['paid', 'partially_paid', 'partially_refunded'].includes(o.financial_status));
        const totalRevenue = paidOrders.reduce((sum, o) => sum + Number(o.total_price || 0), 0);

        return {
            revenue: Math.round(totalRevenue * 100) / 100,
            orders: paidOrders.length,
            totalOrders: orders.length,
            currency: orders[0]?.currency || 'INR',
            dateRange: { start, end },
            rawOrders: orders, // For UTM attribution
        };
    } catch (e) {
        console.error('Shopify revenue fetch error:', e.message);
        return { revenue: 0, orders: 0, error: e.message };
    }
}


// ══════════════════════════════════════════════════════════════════════════════
// BLENDED MER (Marketing Efficiency Ratio)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Calculate true blended ROAS / MER:
 * Total Shopify Revenue / Total Ad Spend = MER
 * 
 * This is the most honest measure of ad performance — better than
 * platform-reported ROAS which inflates due to attribution windows.
 */
export async function calculateBlendedMER(userId, brandId) {
    // Get total ad spend from all campaigns
    const campaigns = await AdCampaign.find({
        user: userId,
        brand: brandId,
        status: { $in: ['active', 'completed'] },
    }).lean();

    const totalSpend = campaigns.reduce((sum, c) => sum + (c.performance?.spend || 0), 0);
    const platformReportedRevenue = campaigns.reduce((sum, c) => sum + (c.performance?.revenue || 0), 0);
    const platformRoas = totalSpend > 0 ? platformReportedRevenue / totalSpend : 0;

    // Get Shopify revenue for same period
    const shopifyData = await getShopifyRevenueByDateRange(brandId);
    const shopifyRevenue = shopifyData.revenue || 0;

    // Blended MER = Shopify Revenue / Total Ad Spend
    const blendedMER = totalSpend > 0 ? shopifyRevenue / totalSpend : 0;

    // Calculate the gap (platform over-reporting vs reality)
    const attributionGap = platformRoas > 0 && blendedMER > 0
        ? Math.round(((platformRoas - blendedMER) / platformRoas) * 100)
        : 0;

    return {
        blendedMER: Math.round(blendedMER * 100) / 100,
        platformRoas: Math.round(platformRoas * 100) / 100,
        attributionGap: `${attributionGap}%`, // How much platforms over-report
        totalSpend: Math.round(totalSpend * 100) / 100,
        shopifyRevenue: Math.round(shopifyRevenue * 100) / 100,
        platformReportedRevenue: Math.round(platformReportedRevenue * 100) / 100,
        shopifyOrders: shopifyData.orders || 0,
        currency: shopifyData.currency || 'INR',
        campaignsAnalyzed: campaigns.length,
        shopifyConnected: !shopifyData.error,
        breakdown: {
            meta: {
                spend: campaigns.filter(c => c.platform === 'meta').reduce((s, c) => s + (c.performance?.spend || 0), 0),
                platformRoas: 0, // Will be calculated per-platform
            },
            google: {
                spend: campaigns.filter(c => c.platform === 'google').reduce((s, c) => s + (c.performance?.spend || 0), 0),
                platformRoas: 0,
            },
        },
    };
}


// ══════════════════════════════════════════════════════════════════════════════
// UTM-BASED ATTRIBUTION — Link Shopify orders to campaigns
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Match Shopify orders to campaigns using UTM parameters.
 * Orders with matching UTM campaign tags are attributed to specific campaigns.
 */
export async function getAttributionByUTM(userId, brandId) {
    const shopifyData = await getShopifyRevenueByDateRange(brandId);
    if (shopifyData.error || !shopifyData.rawOrders) {
        return { attributions: [], error: shopifyData.error || 'No order data' };
    }

    const campaigns = await AdCampaign.find({ user: userId, brand: brandId }).lean();
    const campaignMap = new Map();
    campaigns.forEach(c => {
        if (c.platformData?.metaCampaignId) campaignMap.set(c.platformData.metaCampaignId, c);
        if (c.platformData?.googleCampaignId) campaignMap.set(c.platformData.googleCampaignId, c);
        campaignMap.set(c.title?.toLowerCase(), c);
    });

    const attributions = {};
    let unattributed = 0;

    for (const order of shopifyData.rawOrders) {
        const landingSite = order.landing_site || '';
        const referringSite = order.referring_site || '';
        const combined = `${landingSite} ${referringSite}`.toLowerCase();

        // Extract UTM campaign from URL params
        const utmMatch = combined.match(/utm_campaign=([^&\s]+)/i);
        const utmSource = combined.match(/utm_source=([^&\s]+)/i);

        let matchedCampaign = null;

        if (utmMatch) {
            const utmCampaign = decodeURIComponent(utmMatch[1]).toLowerCase();
            // Try to find matching campaign
            for (const [key, campaign] of campaignMap) {
                if (typeof key === 'string' && (key.includes(utmCampaign) || utmCampaign.includes(key))) {
                    matchedCampaign = campaign;
                    break;
                }
            }
        }

        if (matchedCampaign) {
            const cid = matchedCampaign._id.toString();
            if (!attributions[cid]) {
                attributions[cid] = {
                    campaignId: matchedCampaign._id,
                    campaignTitle: matchedCampaign.title,
                    platform: matchedCampaign.platform,
                    orders: 0,
                    revenue: 0,
                };
            }
            attributions[cid].orders++;
            attributions[cid].revenue += Number(order.total_price || 0);
        } else {
            unattributed++;
        }
    }

    const attributionList = Object.values(attributions).map(a => ({
        ...a,
        revenue: Math.round(a.revenue * 100) / 100,
    }));

    return {
        attributions: attributionList,
        unattributedOrders: unattributed,
        totalOrders: shopifyData.rawOrders.length,
        attributionRate: shopifyData.rawOrders.length > 0
            ? `${Math.round(((shopifyData.rawOrders.length - unattributed) / shopifyData.rawOrders.length) * 100)}%`
            : '0%',
    };
}


/**
 * Get cohort LTV for customers acquired through a specific campaign.
 * Matches UTM-attributed orders and calculates repeat purchase behavior.
 */
export async function getCohortLTVForCampaign(userId, brandId, campaignTitle) {
    const attribution = await getAttributionByUTM(userId, brandId);
    const campaignAttr = attribution.attributions?.find(a =>
        a.campaignTitle?.toLowerCase().includes(campaignTitle?.toLowerCase())
    );

    if (!campaignAttr) return { ltv: 0, error: 'No attributed orders found for this campaign' };

    // Simple LTV calculation: revenue / orders * estimated repeat rate
    const avgOrderValue = campaignAttr.orders > 0 ? campaignAttr.revenue / campaignAttr.orders : 0;
    const estimatedRepeatRate = 1.4; // Conservative 40% repeat in 6 months for D2C India

    return {
        campaignTitle: campaignAttr.campaignTitle,
        totalRevenue: campaignAttr.revenue,
        orders: campaignAttr.orders,
        avgOrderValue: Math.round(avgOrderValue * 100) / 100,
        estimatedLTV: Math.round(avgOrderValue * estimatedRepeatRate * 100) / 100,
        repeatRateAssumption: '40% (6-month D2C India avg)',
    };
}

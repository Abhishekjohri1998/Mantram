import ShopifyOrder from '../models/ShopifyOrder.js';
import ShopifyCustomer from '../models/ShopifyCustomer.js';

/**
 * Shopify Analytics Service
 * Aggregates order and customer data for Studio Reports.
 */

export async function getShopifyAnalytics(userId, brandId) {
    try {
        const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

        // 1. Revenue & Order Stats
        const orderStats = await ShopifyOrder.aggregate([
            { $match: { brand: brandId, shopifyCreatedAt: { $gte: sixtyDaysAgo } } },
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: '$totalPrice' },
                    orderCount: { $sum: 1 },
                    avgOrderValue: { $avg: '$totalPrice' },
                    paidOrders: {
                        $sum: { $cond: [{ $eq: ['$financialStatus', 'paid'] }, 1, 0] }
                    }
                }
            }
        ]);

        const stats = orderStats[0] || { totalRevenue: 0, orderCount: 0, avgOrderValue: 0, paidOrders: 0 };

        // 2. Top Products
        const topProducts = await ShopifyOrder.aggregate([
            { $match: { brand: brandId, shopifyCreatedAt: { $gte: sixtyDaysAgo } } },
            { $unwind: '$lineItems' },
            {
                $group: {
                    _id: '$lineItems.productId',
                    title: { $first: '$lineItems.title' },
                    unitsSold: { $sum: '$lineItems.quantity' },
                    revenue: { $sum: { $multiply: ['$lineItems.price', '$lineItems.quantity'] } }
                }
            },
            { $sort: { unitsSold: -1 } },
            { $limit: 10 }
        ]);

        // 3. Customer Segments (by City)
        const customerSegments = await ShopifyCustomer.aggregate([
            { $match: { brand: brandId } },
            {
                $group: {
                    _id: '$defaultAddress.city',
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } },
            { $limit: 5 }
        ]);

        return {
            revenue: {
                total: stats.totalRevenue,
                aov: stats.avgOrderValue,
                currency: 'INR'
            },
            orders: {
                total: stats.orderCount,
                paid: stats.paidOrders,
                pending: stats.orderCount - stats.paidOrders
            },
            topProducts: topProducts.map(p => ({
                id: p._id,
                title: p.title,
                sold: p.unitsSold,
                revenue: p.revenue
            })),
            customerSegments: customerSegments.reduce((acc, curr) => {
                if (curr._id) acc[curr._id] = curr.count;
                return acc;
            }, {})
        };
    } catch (err) {
        console.error('getShopifyAnalytics error:', err);
        throw err;
    }
}

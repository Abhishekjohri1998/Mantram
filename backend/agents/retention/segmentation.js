/**
 * Retention Studio — RFM Segmentation Engine
 * 
 * Scores customers using Recency-Frequency-Monetary model.
 * Also provides lifecycle segment classification and AI-powered segment suggestions.
 */

import ShopifyCustomer from '../../models/ShopifyCustomer.js';
import ShopifyOrder from '../../models/ShopifyOrder.js';
import Contact from '../../models/Contact.js';

// ── RFM Score Boundaries ──
const RFM_TIERS = {
    recency: [30, 90, 180, 365],      // days since last order
    frequency: [1, 2, 4, 8],          // total orders
    monetary: [500, 2000, 5000, 15000], // total spend (₹)
};

// ── Lifecycle Segments ──
const LIFECYCLE_SEGMENTS = {
    champions:     { r: [4, 5], f: [4, 5], m: [4, 5], label: 'Champions',         color: '#10b981', icon: '👑', desc: 'High value, recent, frequent buyers' },
    loyalists:     { r: [3, 5], f: [3, 5], m: [3, 5], label: 'Loyal Customers',    color: '#6366f1', icon: '💎', desc: 'Consistent buyers with strong affinity' },
    potential:     { r: [3, 5], f: [1, 3], m: [1, 3], label: 'Potential Loyalists', color: '#8b5cf6', icon: '🌱', desc: 'Recent buyers, could become loyal' },
    new:           { r: [4, 5], f: [1, 1], m: [1, 2], label: 'New Customers',      color: '#06b6d4', icon: '✨', desc: 'Just made first purchase' },
    promising:     { r: [3, 4], f: [1, 1], m: [1, 2], label: 'Promising',          color: '#f59e0b', icon: '📈', desc: 'Recent shoppers with potential' },
    needAttention: { r: [2, 3], f: [2, 4], m: [2, 4], label: 'Need Attention',     color: '#f97316', icon: '⚠️', desc: 'Were active but slowing down' },
    aboutToSleep:  { r: [2, 3], f: [1, 2], m: [1, 2], label: 'About to Sleep',     color: '#ef4444', icon: '😴', desc: "Haven't bought recently, low freq" },
    atRisk:        { r: [1, 2], f: [3, 5], m: [3, 5], label: 'At Risk',            color: '#dc2626', icon: '🚨', desc: 'Were high value but going silent' },
    cantLoseThem:  { r: [1, 2], f: [4, 5], m: [4, 5], label: "Can't Lose Them",    color: '#b91c1c', icon: '🔥', desc: 'Top spenders going dark' },
    hibernating:   { r: [1, 2], f: [1, 2], m: [1, 2], label: 'Hibernating',        color: '#6b7280', icon: '❄️', desc: 'Low engagement across the board' },
    lost:          { r: [1, 1], f: [1, 1], m: [1, 1], label: 'Lost',               color: '#374151', icon: '👻', desc: 'No recent activity at all' },
};

/**
 * Calculate RFM score (1-5) for a single metric
 */
function scoreMetric(value, boundaries, inverted = false) {
    let score = 1;
    for (let i = 0; i < boundaries.length; i++) {
        if (inverted ? value <= boundaries[i] : value >= boundaries[i]) {
            score = 5 - i;
            if (!inverted) score = i + 2;
            break;
        }
    }
    if (inverted) {
        // For recency: lower days = better score
        if (value <= boundaries[0]) return 5;
        if (value <= boundaries[1]) return 4;
        if (value <= boundaries[2]) return 3;
        if (value <= boundaries[3]) return 2;
        return 1;
    } else {
        // For frequency/monetary: higher = better score
        if (value >= boundaries[3]) return 5;
        if (value >= boundaries[2]) return 4;
        if (value >= boundaries[1]) return 3;
        if (value >= boundaries[0]) return 2;
        return 1;
    }
}

/**
 * Classify a customer into a lifecycle segment based on RFM scores
 */
function classifySegment(r, f, m) {
    for (const [key, seg] of Object.entries(LIFECYCLE_SEGMENTS)) {
        if (r >= seg.r[0] && r <= seg.r[1] &&
            f >= seg.f[0] && f <= seg.f[1] &&
            m >= seg.m[0] && m <= seg.m[1]) {
            return { key, ...seg };
        }
    }
    return { key: 'hibernating', ...LIFECYCLE_SEGMENTS.hibernating };
}

/**
 * Run RFM analysis for all customers of a brand
 */
export async function runRFMAnalysis(brandId) {
    const now = new Date();

    // Get all customers
    const customers = await ShopifyCustomer.find({ brand: brandId }).lean();
    
    // Get all orders for recency calculation
    const orders = await ShopifyOrder.find({ brand: brandId })
        .select('customer.shopifyCustomerId shopifyCreatedAt totalPrice')
        .sort({ shopifyCreatedAt: -1 })
        .lean();

    // Build per-customer order map
    const customerOrderMap = {};
    for (const order of orders) {
        const custId = order.customer?.shopifyCustomerId;
        if (!custId) continue;
        if (!customerOrderMap[custId]) customerOrderMap[custId] = [];
        customerOrderMap[custId].push(order);
    }

    // Score each customer
    const scored = customers.map(cust => {
        const custOrders = customerOrderMap[cust.shopifyCustomerId] || [];
        const lastOrderDate = custOrders[0]?.shopifyCreatedAt;
        const daysSinceLastOrder = lastOrderDate
            ? Math.floor((now - new Date(lastOrderDate)) / (1000 * 60 * 60 * 24))
            : 999;

        const rScore = scoreMetric(daysSinceLastOrder, RFM_TIERS.recency, true);
        const fScore = scoreMetric(cust.ordersCount || 0, RFM_TIERS.frequency, false);
        const mScore = scoreMetric(cust.totalSpent || 0, RFM_TIERS.monetary, false);

        const segment = classifySegment(rScore, fScore, mScore);
        const rfmTotal = rScore + fScore + mScore;

        return {
            customerId: cust._id,
            shopifyCustomerId: cust.shopifyCustomerId,
            email: cust.email,
            name: `${cust.firstName || ''} ${cust.lastName || ''}`.trim(),
            phone: cust.phone,
            city: cust.defaultAddress?.city,
            ordersCount: cust.ordersCount || 0,
            totalSpent: cust.totalSpent || 0,
            daysSinceLastOrder,
            scores: { r: rScore, f: fScore, m: mScore, total: rfmTotal },
            segment: segment.key,
            segmentLabel: segment.label,
            segmentColor: segment.color,
            segmentIcon: segment.icon,
            segmentDesc: segment.desc,
            acceptsMarketing: cust.acceptsMarketing,
        };
    });

    // Build segment summary
    const segmentSummary = {};
    for (const cust of scored) {
        if (!segmentSummary[cust.segment]) {
            segmentSummary[cust.segment] = {
                key: cust.segment,
                label: cust.segmentLabel,
                color: cust.segmentColor,
                icon: cust.segmentIcon,
                desc: cust.segmentDesc,
                count: 0,
                totalRevenue: 0,
                avgOrders: 0,
                emails: [],
            };
        }
        const seg = segmentSummary[cust.segment];
        seg.count++;
        seg.totalRevenue += cust.totalSpent;
        if (cust.email && cust.acceptsMarketing) seg.emails.push(cust.email);
    }

    // Calculate averages
    for (const seg of Object.values(segmentSummary)) {
        seg.avgRevenue = seg.count > 0 ? Math.round(seg.totalRevenue / seg.count) : 0;
        seg.marketableContacts = seg.emails.length;
    }

    return {
        totalCustomers: scored.length,
        segments: segmentSummary,
        customers: scored,
        tiers: RFM_TIERS,
        analyzedAt: new Date(),
    };
}

/**
 * Get customers for a specific segment
 */
export async function getSegmentCustomers(brandId, segmentKey, { limit = 100, offset = 0 } = {}) {
    const analysis = await runRFMAnalysis(brandId);
    const segmentCustomers = analysis.customers
        .filter(c => c.segment === segmentKey)
        .slice(offset, offset + limit);

    return {
        segment: analysis.segments[segmentKey] || null,
        customers: segmentCustomers,
        total: analysis.customers.filter(c => c.segment === segmentKey).length,
    };
}

/**
 * Get recommended actions per segment (for AI-generated campaign suggestions)
 */
export function getSegmentRecommendations() {
    return {
        champions:     { action: 'Reward & Upsell',   campaign: 'VIP exclusive + new arrivals preview',          urgency: 'low' },
        loyalists:     { action: 'Cross-sell',         campaign: 'Complementary products + loyalty rewards',      urgency: 'low' },
        potential:     { action: 'Nurture to Loyalty',  campaign: 'Product education series + membership offer',  urgency: 'medium' },
        new:           { action: 'Onboard & Educate',   campaign: 'Welcome series + brand story + how-to guide', urgency: 'medium' },
        promising:     { action: 'Second Purchase Push', campaign: 'Product review request + related items',      urgency: 'medium' },
        needAttention: { action: 'Re-engage',           campaign: 'Limited-time offer + what\'s new email',      urgency: 'high' },
        aboutToSleep:  { action: 'Win-Back Lite',       campaign: 'We miss you + small discount',                urgency: 'high' },
        atRisk:        { action: 'Urgency Offer',       campaign: 'Exclusive comeback deal + personal note',     urgency: 'critical' },
        cantLoseThem:  { action: 'VIP Recovery',        campaign: 'Personal outreach + premium discount + gift', urgency: 'critical' },
        hibernating:   { action: 'Reactivation',        campaign: 'Survey + big incentive + product update',     urgency: 'low' },
        lost:          { action: 'Final Attempt',        campaign: 'Last chance offer + unsubscribe option',     urgency: 'low' },
    };
}

export { LIFECYCLE_SEGMENTS, RFM_TIERS };

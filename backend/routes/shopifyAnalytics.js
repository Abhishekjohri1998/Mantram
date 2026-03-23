/**
 * Shopify Analytics Routes
 * D2C Analytics Command Center — computes intelligence from Shopify data.
 * Orders, products, customers → KPIs, health scores, red flags, AI insights.
 */

import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import Integration from '../models/Integration.js';
import Brand from '../models/Brand.js';
import Content from '../models/Content.js';
import AdCampaign from '../models/AdCampaign.js';
import Product from '../models/Product.js';
import ShopifyOrder from '../models/ShopifyOrder.js';
import ShopifyCustomer from '../models/ShopifyCustomer.js';
import { getShopInfo } from '../services/shopifyService.js';
import { safeErrorMessage } from '../utils/safeError.js';

const router = Router();

// ── Cache to avoid hammering Shopify API ──
const analyticsCache = {};
const CACHE_TTL = 15 * 60 * 1000; // 15 min

function getCacheKey(userId, brandId, type) {
    return `${userId}:${brandId || 'all'}:${type}`;
}

function getCached(key) {
    const entry = analyticsCache[key];
    if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
    return null;
}

function setCache(key, data) {
    analyticsCache[key] = { data, ts: Date.now() };
}

// ── Helper: get connected Shopify integration (brand-aware) ──
async function getShopifyIntegration(userId, brandId) {
    const query = {
        user: userId,
        platform: 'shopify',
        status: 'connected',
    };
    if (brandId) query.brand = brandId;
    return Integration.findOne(query).select('+accessToken');
}

// ── Helper: Grok availability check ──
function isGrokAvailable() {
    return !!(process.env.GROK_API_KEY || process.env.XAI_API_KEY);
}

async function callGrok(systemPrompt, userPrompt, maxTokens = 1500) {
    const key = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
    const resp = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
            model: 'grok-3-mini-fast',
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
            temperature: 0.7,
            max_tokens: maxTokens,
            response_format: { type: 'json_object' },
        }),
    });
    const data = await resp.json();
    const text = data.choices?.[0]?.message?.content || '';
    let clean = text.trim();
    if (clean.startsWith('```')) clean = clean.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    try { return JSON.parse(clean); } catch {
        const m = clean.match(/\{[\s\S]*\}/);
        return m ? JSON.parse(m[0]) : null;
    }
}

// ── Compute analytics from raw orders (Now using ShopifyOrder model fields) ──
function computeOrderAnalytics(orders, chartDays = 30) {
    const totalOrders = orders.length;
    const now = Date.now();
    const msDay = 24 * 60 * 60 * 1000;

    // Revenue
    const totalRevenue = orders.reduce((s, o) => s + (o.totalPrice || 0), 0);
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Weekly comparison
    const thisWeekOrders = orders.filter(o => (now - new Date(o.shopifyCreatedAt).getTime()) < 7 * msDay);
    const lastWeekOrders = orders.filter(o => {
        const age = now - new Date(o.shopifyCreatedAt).getTime();
        return age >= 7 * msDay && age < 14 * msDay;
    });
    const thisWeekRevenue = thisWeekOrders.reduce((s, o) => s + (o.totalPrice || 0), 0);
    const lastWeekRevenue = lastWeekOrders.reduce((s, o) => s + (o.totalPrice || 0), 0);
    const revenueGrowth = lastWeekRevenue > 0 ? Math.round(((thisWeekRevenue - lastWeekRevenue) / lastWeekRevenue) * 100) : 0;

    // Daily revenue for chart (respects days param)
    const numDays = Math.min(chartDays, 90);
    const dailyRevenue = [];
    for (let i = numDays - 1; i >= 0; i--) {
        const dayStart = new Date(now - i * msDay);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart.getTime() + msDay);
        const dayOrders = orders.filter(o => {
            const t = new Date(o.shopifyCreatedAt).getTime();
            return t >= dayStart.getTime() && t < dayEnd.getTime();
        });
        dailyRevenue.push({
            date: dayStart.toISOString().split('T')[0],
            revenue: dayOrders.reduce((s, o) => s + (o.totalPrice || 0), 0),
            orders: dayOrders.length,
        });
    }

    // Product performance from line items
    const productMap = {};
    orders.forEach(order => {
        (order.lineItems || []).forEach(item => {
            const key = item.productId || item.title;
            if (!productMap[key]) {
                productMap[key] = {
                    productId: item.productId,
                    title: item.title,
                    variant: item.variantTitle,
                    unitsSold: 0,
                    revenue: 0,
                    orderCount: 0,
                    image: null,
                };
            }
            productMap[key].unitsSold += item.quantity || 1;
            productMap[key].revenue += (item.price || 0) * (item.quantity || 1);
            productMap[key].orderCount++;
        });
    });

    const topProducts = Object.values(productMap)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 50); // increased limit for internal processing

    // Fulfillment stats
    const fulfilled = orders.filter(o => o.fulfillmentStatus === 'fulfilled').length;
    const unfulfilled = orders.filter(o => !o.fulfillmentStatus || o.fulfillmentStatus === null).length;
    const refunded = orders.filter(o => o.financialStatus === 'refunded' || o.financialStatus === 'partially_refunded').length;
    const refundRate = totalOrders > 0 ? Math.round((refunded / totalOrders) * 100) : 0;

    // Discount usage
    const discountedOrders = orders.filter(o => (o.totalDiscounts || 0) > 0).length;
    const totalDiscounts = orders.reduce((s, o) => s + (o.totalDiscounts || 0), 0);

    return {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalOrders,
        avgOrderValue: Math.round(avgOrderValue * 100) / 100,
        thisWeekRevenue: Math.round(thisWeekRevenue * 100) / 100,
        lastWeekRevenue: Math.round(lastWeekRevenue * 100) / 100,
        revenueGrowth,
        thisWeekOrders: thisWeekOrders.length,
        dailyRevenue,
        topProducts,
        fulfilled,
        unfulfilled,
        refunded,
        refundRate,
        discountedOrders,
        totalDiscounts: Math.round(totalDiscounts * 100) / 100,
    };
}

// ── Compute customer analytics (Using ShopifyCustomer model) ──
function computeCustomerAnalytics(customers, orders) {
    const totalCustomers = customers.length;
    const now = Date.now();
    const msDay = 24 * 60 * 60 * 1000;

    const newCustomers = customers.filter(c => (now - new Date(c.shopifyCreatedAt).getTime()) < 30 * msDay).length;
    const returningCustomers = customers.filter(c => (c.ordersCount || 0) > 1).length;

    // Geographic split
    const cityMap = {};
    const countryMap = {};
    customers.forEach(c => {
        const addr = c.defaultAddress;
        if (addr?.city) cityMap[addr.city] = (cityMap[addr.city] || 0) + 1;
        if (addr?.country) countryMap[addr.country] = (countryMap[addr.country] || 0) + 1;
    });
    const topCities = Object.entries(cityMap).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count, pct: Math.round((count / (totalCustomers || 1)) * 100) }));
    const topCountries = Object.entries(countryMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count, pct: Math.round((count / (totalCustomers || 1)) * 100) }));

    // LTV tiers
    const ltvTiers = { vip: 0, regular: 0, oneTime: 0 };
    const avgOrderValue = orders.length > 0 ? orders.reduce((s, o) => s + (o.totalPrice || 0), 0) / orders.length : 0;
    customers.forEach(c => {
        const ltv = (c.ordersCount || 0) * avgOrderValue;
        if (ltv > avgOrderValue * 5) ltvTiers.vip++;
        else if (c.ordersCount > 1) ltvTiers.regular++;
        else ltvTiers.oneTime++;
    });

    // Email marketing opted in
    const marketingConsent = customers.filter(c => c.acceptsMarketing).length;

    return {
        totalCustomers,
        newCustomers,
        returningCustomers,
        repeatRate: totalCustomers > 0 ? Math.round((returningCustomers / totalCustomers) * 100) : 0,
        topCities,
        topCountries,
        ltvTiers,
        marketingConsent,
        avgLTV: Math.round(avgOrderValue * (totalCustomers > 0 ? customers.reduce((s, c) => s + (c.ordersCount || 0), 0) / totalCustomers : 1) * 100) / 100,
    };
}

// ── Compute red flags ──
function computeRedFlags(orderAnalytics, products, customerAnalytics) {
    const flags = [];

    // Dead stock: products with 0 sales but stock > 0
    const soldProductIds = new Set(orderAnalytics.topProducts.map(p => String(p.productId)));
    const deadStock = products.filter(p => {
        const totalInventory = (p.variants || []).reduce((s, v) => s + (v.inventoryQuantity || 0), 0);
        return totalInventory > 0 && !soldProductIds.has(String(p.shopifyId));
    });
    if (deadStock.length > 0) {
        flags.push({
            type: 'dead_stock',
            severity: 'high',
            title: `${deadStock.length} Dead Stock Products`,
            desc: `${deadStock.length} product${deadStock.length > 1 ? 's' : ''} ha${deadStock.length > 1 ? 've' : 's'} inventory sitting idle with zero sales in the last 60 days.`,
            products: deadStock.slice(0, 5).map(p => ({ title: p.title, inventory: (p.variants || []).reduce((s, v) => s + (v.inventory_quantity || 0), 0), id: p.id })),
            icon: 'inventory',
            action: 'Run clearance campaigns or bundle these with top sellers.',
        });
    }

    // High refund rate
    if (orderAnalytics.refundRate > 10) {
        flags.push({
            type: 'high_refunds',
            severity: 'high',
            title: `Refund Rate at ${orderAnalytics.refundRate}%`,
            desc: `${orderAnalytics.refunded} out of ${orderAnalytics.totalOrders} orders have been refunded. Industry average is below 5%.`,
            icon: 'receipt_long',
            action: 'Review product descriptions for accuracy; check packaging and delivery quality.',
        });
    }

    // Revenue declining
    if (orderAnalytics.revenueGrowth < -15) {
        flags.push({
            type: 'revenue_decline',
            severity: 'high',
            title: `Revenue Down ${Math.abs(orderAnalytics.revenueGrowth)}% Week-over-Week`,
            desc: `This week's revenue (₹${orderAnalytics.thisWeekRevenue.toLocaleString()}) is significantly lower than last week (₹${orderAnalytics.lastWeekRevenue.toLocaleString()}).`,
            icon: 'trending_down',
            action: 'Launch a flash sale, email campaign, or push top-selling products on social.',
        });
    }

    // Low repeat rate
    if (customerAnalytics.repeatRate < 15 && customerAnalytics.totalCustomers > 20) {
        flags.push({
            type: 'low_repeat',
            severity: 'warning',
            title: `Only ${customerAnalytics.repeatRate}% Repeat Customers`,
            desc: `Most customers aren't coming back. Build loyalty with post-purchase email sequences, personalized recommendations, and subscription offers.`,
            icon: 'person_off',
            action: 'Set up automated post-purchase follow-ups and loyalty rewards.',
        });
    }

    // High unfulfilled orders
    const unfulfillRate = orderAnalytics.totalOrders > 0 ? Math.round((orderAnalytics.unfulfilled / orderAnalytics.totalOrders) * 100) : 0;
    if (unfulfillRate > 30 && orderAnalytics.unfulfilled > 5) {
        flags.push({
            type: 'unfulfilled_orders',
            severity: 'warning',
            title: `${orderAnalytics.unfulfilled} Unfulfilled Orders (${unfulfillRate}%)`,
            desc: `A large portion of orders remain unfulfilled. Slow fulfillment leads to cancellations and poor reviews.`,
            icon: 'local_shipping',
            action: 'Prioritize order dispatch; consider using a 3PL or fulfillment service.',
        });
    }

    // Heavy discounting
    const discountPct = orderAnalytics.totalOrders > 0 ? Math.round((orderAnalytics.discountedOrders / orderAnalytics.totalOrders) * 100) : 0;
    if (discountPct > 60) {
        flags.push({
            type: 'over_discounting',
            severity: 'low',
            title: `${discountPct}% of Orders Use Discounts`,
            desc: `Over-discounting erodes margins and trains customers to wait for sales. Total discounts given: ₹${orderAnalytics.totalDiscounts.toLocaleString()}.`,
            icon: 'sell',
            action: 'Reduce discount frequency; use value-adds (free shipping, gifts) instead.',
        });
    }

    return flags;
}

// ── Compute product health scores ──
function computeProductHealth(topProducts, allProducts) {
    const maxRevenue = topProducts[0]?.revenue || 1;
    return topProducts.map(p => {
        const salesScore = Math.min(100, (p.revenue / maxRevenue) * 100);
        const velocityScore = Math.min(100, p.unitsSold * 5); // arbitrary scaling
        const product = allProducts.find(sp => String(sp.shopifyId) === String(p.productId));
        const totalInventory = product ? (product.variants || []).reduce((s, v) => s + (v.inventoryQuantity || 0), 0) : 0;
        const inventoryHealth = totalInventory > 0 ? Math.min(100, (p.unitsSold / totalInventory) * 50) : 50;
        const overallScore = Math.round((salesScore * 0.5) + (velocityScore * 0.3) + (inventoryHealth * 0.2));

        return {
            ...p,
            inventory: totalInventory,
            price: product ? (product.price?.amount || product.variants?.[0]?.price || 0) : 0,
            image: product?.images?.[0]?.url || product?.images?.[0]?.src || null,
            healthScore: overallScore,
            healthBadge: overallScore >= 70 ? 'hot' : overallScore >= 40 ? 'warm' : 'cold',
            needsBoost: overallScore >= 30 && overallScore < 60 && totalInventory > 5,
        };
    });
}

// ── Compute advanced analytics (geo, velocity, variants, abandonment) ──
function computeAdvancedAnalytics(orders, products) {
    const now = Date.now();
    const msDay = 24 * 60 * 60 * 1000;

    // 1. Order Geo Radar — from customer addresses (using ShopifyOrder model fields)
    const cityOrders = {}, stateOrders = {}, countryOrders = {};
    orders.forEach(o => {
        const cust = o.customer;
        if (!cust) return;
        if (cust.city) cityOrders[cust.city] = (cityOrders[cust.city] || 0) + 1;
        if (cust.province) stateOrders[cust.province] = (stateOrders[cust.province] || 0) + 1;
        if (cust.country) countryOrders[cust.country] = (countryOrders[cust.country] || 0) + 1;
    });
    const colors = ['#8b5cf6', '#06b6d4', '#34d399', '#f59e0b', '#f43f5e', '#ec4899', '#3b82f6', '#a855f7', '#fb923c', '#14b8a6'];
    const geoRadar = {
        cities: Object.entries(cityOrders).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, count], i) => ({ name, orders: count, pct: Math.round((count / (orders.length || 1)) * 100), color: colors[i % colors.length] })),
        states: Object.entries(stateOrders).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, orders: count, pct: Math.round((count / (orders.length || 1)) * 100) })),
        countries: Object.entries(countryOrders).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, orders: count, pct: Math.round((count / (orders.length || 1)) * 100) })),
        totalLocations: Object.keys(cityOrders).length,
    };

    // 2. Product Velocity — WoW acceleration (using ShopifyOrder model fields)
    const thisWeek = orders.filter(o => (now - new Date(o.shopifyCreatedAt).getTime()) < 7 * msDay);
    const lastWeek = orders.filter(o => { const age = now - new Date(o.shopifyCreatedAt).getTime(); return age >= 7 * msDay && age < 14 * msDay; });
    const productThisWeek = {}, productLastWeek = {};
    thisWeek.forEach(o => (o.lineItems || []).forEach(li => { const k = li.productId || li.title; productThisWeek[k] = (productThisWeek[k] || { title: li.title, units: 0, revenue: 0 }); productThisWeek[k].units += li.quantity || 1; productThisWeek[k].revenue += parseFloat(li.price || 0) * (li.quantity || 1); }));
    lastWeek.forEach(o => (o.lineItems || []).forEach(li => { const k = li.productId || li.title; productLastWeek[k] = (productLastWeek[k] || { title: li.title, units: 0 }); productLastWeek[k].units += li.quantity || 1; }));
    const allProductKeys = new Set([...Object.keys(productThisWeek), ...Object.keys(productLastWeek)]);
    const productVelocity = [];
    allProductKeys.forEach(k => {
        const tw = productThisWeek[k] || { title: productLastWeek[k]?.title || 'Unknown', units: 0, revenue: 0 };
        const lw = productLastWeek[k] || { units: 0 };
        const change = lw.units > 0 ? Math.round(((tw.units - lw.units) / lw.units) * 100) : (tw.units > 0 ? 100 : 0);
        if (tw.units > 0 || lw.units > 0) productVelocity.push({ productId: k, title: tw.title, thisWeekUnits: tw.units, lastWeekUnits: lw.units, thisWeekRevenue: Math.round(tw.revenue), change, status: change > 20 ? 'accelerating' : change < -20 ? 'decelerating' : 'stable' });
    });
    productVelocity.sort((a, b) => b.change - a.change);

    // 3. Popular Variants — colors, sizes, options
    const variantMap = {};
    orders.forEach(o => (o.lineItems || []).forEach(li => {
        const name = li.variantTitle || 'Default';
        if (name === 'Default Title' || name === 'Default') return;
        variantMap[name] = (variantMap[name] || { name, units: 0, products: new Set() });
        variantMap[name].units += li.quantity || 1;
        variantMap[name].products.add(li.title);
    }));
    const popularVariants = Object.values(variantMap)
        .map(v => ({ name: v.name, units: v.units, productCount: v.products.size }))
        .sort((a, b) => b.units - a.units)
        .slice(0, 15);

    // 4. Abandonment Signals — stocked products with zero orders
    const soldIds = new Set();
    orders.forEach(o => (o.lineItems || []).forEach(li => { if (li.productId) soldIds.add(String(li.productId)); }));
    const abandonmentSignals = products
        .filter(p => {
            const inv = (p.variants || []).reduce((s, v) => s + (v.inventoryQuantity || 0), 0);
            return inv > 0 && !soldIds.has(String(p.shopifyId));
        })
        .map(p => {
            const inv = (p.variants || []).reduce((s, v) => s + (v.inventoryQuantity || 0), 0);
            const price = p.price?.amount || p.variants?.[0]?.price || 0;
            return { productId: p.shopifyId, title: p.title, inventory: inv, price, image: p.images?.[0]?.url || null, stuckValue: Math.round(inv * price), reason: inv > 20 ? 'High stock, zero sales' : 'In stock, no orders', suggestion: price > 1000 ? 'Consider targeted ads or influencer push' : 'Bundle with top sellers or run flash sale' };
        })
        .sort((a, b) => b.stuckValue - a.stuckValue)
        .slice(0, 10);

    return { geoRadar, productVelocity, popularVariants, abandonmentSignals };
}

// ── RFM Customer Segmentation ──
function computeRFMSegmentation(customers, orders) {
    const now = Date.now();
    const msDay = 24 * 60 * 60 * 1000;

    // Build per-customer order history
    const customerOrders = {};
    orders.forEach(o => {
        const cid = o.customer?.shopifyCustomerId || o.customer?.email;
        if (!cid) return;
        if (!customerOrders[cid]) customerOrders[cid] = { orders: 0, totalSpend: 0, lastOrderAt: null, firstOrderAt: null };
        customerOrders[cid].orders++;
        customerOrders[cid].totalSpend += o.totalPrice || 0;
        const d = new Date(o.shopifyCreatedAt);
        if (!customerOrders[cid].lastOrderAt || d > customerOrders[cid].lastOrderAt) customerOrders[cid].lastOrderAt = d;
        if (!customerOrders[cid].firstOrderAt || d < customerOrders[cid].firstOrderAt) customerOrders[cid].firstOrderAt = d;
    });

    const entries = Object.entries(customerOrders);
    if (entries.length === 0) return { segments: [], summary: {} };

    // Score each customer 1-5 on R, F, M
    const recencies = entries.map(([, v]) => v.lastOrderAt ? (now - v.lastOrderAt.getTime()) / msDay : 999);
    const frequencies = entries.map(([, v]) => v.orders);
    const monetaries = entries.map(([, v]) => v.totalSpend);

    const percentile = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length * p)] || 0; };
    const rThresholds = [percentile(recencies, 0.2), percentile(recencies, 0.4), percentile(recencies, 0.6), percentile(recencies, 0.8)];
    const fThresholds = [percentile(frequencies, 0.2), percentile(frequencies, 0.4), percentile(frequencies, 0.6), percentile(frequencies, 0.8)];
    const mThresholds = [percentile(monetaries, 0.2), percentile(monetaries, 0.4), percentile(monetaries, 0.6), percentile(monetaries, 0.8)];

    const score5 = (val, thresholds, invert = false) => {
        if (invert) { // lower is better (recency)
            if (val <= thresholds[0]) return 5;
            if (val <= thresholds[1]) return 4;
            if (val <= thresholds[2]) return 3;
            if (val <= thresholds[3]) return 2;
            return 1;
        }
        if (val >= thresholds[3]) return 5;
        if (val >= thresholds[2]) return 4;
        if (val >= thresholds[1]) return 3;
        if (val >= thresholds[0]) return 2;
        return 1;
    };

    const segmentLabels = {
        '55': 'Champions', '54': 'Champions', '45': 'Champions',
        '44': 'Loyal', '43': 'Loyal', '34': 'Loyal', '35': 'Loyal',
        '53': 'Potential Loyalists', '52': 'Potential Loyalists',
        '33': 'Promising', '32': 'Promising', '42': 'Promising',
        '51': 'New Customers', '41': 'New Customers',
        '23': 'At Risk', '22': 'At Risk', '13': 'At Risk',
        '24': 'At Risk', '25': 'At Risk', '14': 'At Risk', '15': 'At Risk',
        '31': 'About to Sleep', '21': 'About to Sleep',
        '12': 'Hibernating', '11': 'Lost',
    };

    const segmentColors = {
        'Champions': '#34d399', 'Loyal': '#8b5cf6', 'Potential Loyalists': '#06b6d4',
        'Promising': '#3b82f6', 'New Customers': '#a855f7', 'At Risk': '#f59e0b',
        'About to Sleep': '#fb923c', 'Hibernating': '#94a3b8', 'Lost': '#f43f5e',
    };

    const segmentActions = {
        'Champions': 'Reward with exclusive offers; ask for reviews & referrals',
        'Loyal': 'Upsell premium products; offer loyalty rewards',
        'Potential Loyalists': 'Offer membership/subscription; engage with personalized content',
        'Promising': 'Send targeted recommendations; nurture with email sequences',
        'New Customers': 'Welcome email series; first-purchase discount for next order',
        'At Risk': '🚨 Win-back campaign needed; send personalized offers now',
        'About to Sleep': 'Re-engage with limited-time offers before they churn',
        'Hibernating': 'Aggressive reactivation — deep discounts or exclusive drops',
        'Lost': 'Survey for feedback; test with brand-new product announcements',
    };

    const segmentCounts = {};

    entries.forEach(([cid, data], i) => {
        const r = score5(recencies[i], rThresholds, true);
        const f = score5(frequencies[i], fThresholds);
        const rfKey = `${r}${f}`;
        const segment = segmentLabels[rfKey] || 'Promising';
        if (!segmentCounts[segment]) segmentCounts[segment] = { segment, count: 0, totalSpend: 0, avgOrders: 0, ordersSum: 0 };
        segmentCounts[segment].count++;
        segmentCounts[segment].totalSpend += data.totalSpend;
        segmentCounts[segment].ordersSum += data.orders;
    });

    const segments = Object.values(segmentCounts).map(s => ({
        segment: s.segment,
        count: s.count,
        pct: Math.round((s.count / entries.length) * 100),
        totalSpend: Math.round(s.totalSpend),
        avgSpend: Math.round(s.totalSpend / (s.count || 1)),
        avgOrders: Math.round((s.ordersSum / (s.count || 1)) * 10) / 10,
        color: segmentColors[s.segment] || '#64748b',
        action: segmentActions[s.segment] || '',
    })).sort((a, b) => b.totalSpend - a.totalSpend);

    return {
        segments,
        totalSegmented: entries.length,
        summary: {
            champions: segmentCounts['Champions']?.count || 0,
            atRisk: (segmentCounts['At Risk']?.count || 0) + (segmentCounts['About to Sleep']?.count || 0),
            lost: (segmentCounts['Lost']?.count || 0) + (segmentCounts['Hibernating']?.count || 0),
        },
    };
}

// ── Inventory Forecasting: Days Until Stockout ──
function computeInventoryForecast(products, orders) {
    const now = Date.now();
    const msDay = 24 * 60 * 60 * 1000;
    const last30 = orders.filter(o => (now - new Date(o.shopifyCreatedAt).getTime()) < 30 * msDay);

    // Sales per product in last 30d
    const salesMap = {};
    last30.forEach(o => (o.lineItems || []).forEach(li => {
        const k = String(li.productId);
        salesMap[k] = (salesMap[k] || 0) + (li.quantity || 1);
    }));

    return products.map(p => {
        const totalInventory = (p.variants || []).reduce((s, v) => s + (v.inventoryQuantity || 0), 0);
        const sold30d = salesMap[String(p.shopifyId)] || 0;
        const dailyRate = sold30d / 30;
        const daysUntilStockout = dailyRate > 0 ? Math.round(totalInventory / dailyRate) : totalInventory > 0 ? 999 : 0;
        const urgency = daysUntilStockout <= 7 ? 'critical' : daysUntilStockout <= 14 ? 'warning' : daysUntilStockout <= 30 ? 'watch' : 'healthy';

        return {
            productId: p.shopifyId,
            title: p.title,
            image: p.images?.[0]?.url || p.images?.[0]?.src || null,
            currentStock: totalInventory,
            sold30d,
            dailyRate: Math.round(dailyRate * 10) / 10,
            daysUntilStockout,
            urgency,
            reorderSuggestion: dailyRate > 0 ? `Reorder ${Math.ceil(dailyRate * 30)} units to cover next 30 days` : null,
        };
    })
    .filter(p => p.currentStock > 0 || p.sold30d > 0)
    .sort((a, b) => a.daysUntilStockout - b.daysUntilStockout)
    .slice(0, 20);
}

// ── Predictive LTV: 90-day and 365-day projections ──
function computePredictiveLTV(customers, orders) {
    const now = Date.now();
    const msDay = 24 * 60 * 60 * 1000;

    const customerData = {};
    orders.forEach(o => {
        const cid = o.customer?.shopifyCustomerId || o.customer?.email;
        if (!cid) return;
        if (!customerData[cid]) customerData[cid] = { spend: 0, orders: 0, firstOrder: null, lastOrder: null };
        customerData[cid].spend += o.totalPrice || 0;
        customerData[cid].orders++;
        const d = new Date(o.shopifyCreatedAt);
        if (!customerData[cid].firstOrder || d < customerData[cid].firstOrder) customerData[cid].firstOrder = d;
        if (!customerData[cid].lastOrder || d > customerData[cid].lastOrder) customerData[cid].lastOrder = d;
    });

    const entries = Object.values(customerData).filter(c => c.orders > 0);
    if (entries.length === 0) return { avg90d: 0, avg365d: 0, projections: [] };

    // Calculate per-customer daily spend rate, then project
    const projections = entries.map(c => {
        const lifespanDays = Math.max(1, (now - c.firstOrder.getTime()) / msDay);
        const dailyRate = c.spend / lifespanDays;
        return {
            totalSpend: Math.round(c.spend),
            orders: c.orders,
            lifespanDays: Math.round(lifespanDays),
            projected90d: Math.round(dailyRate * 90),
            projected365d: Math.round(dailyRate * 365),
        };
    });

    const avg90d = Math.round(projections.reduce((s, p) => s + p.projected90d, 0) / projections.length);
    const avg365d = Math.round(projections.reduce((s, p) => s + p.projected365d, 0) / projections.length);
    const median365d = (() => { const sorted = projections.map(p => p.projected365d).sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)] || 0; })();
    const top10pct = (() => { const sorted = projections.map(p => p.projected365d).sort((a, b) => b - a); return sorted[Math.floor(sorted.length * 0.1)] || 0; })();

    // Distribution buckets
    const buckets = [
        { label: '₹0-500', min: 0, max: 500, count: 0 },
        { label: '₹500-2K', min: 500, max: 2000, count: 0 },
        { label: '₹2K-5K', min: 2000, max: 5000, count: 0 },
        { label: '₹5K-10K', min: 5000, max: 10000, count: 0 },
        { label: '₹10K+', min: 10000, max: Infinity, count: 0 },
    ];
    projections.forEach(p => {
        const b = buckets.find(b => p.projected365d >= b.min && p.projected365d < b.max);
        if (b) b.count++;
    });

    return { avg90d, avg365d, median365d, top10pctLTV: top10pct, distribution: buckets, totalCustomers: projections.length };
}

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/shopify-analytics/overview — Complete D2C analytics overview
// ═══════════════════════════════════════════════════════════════════════════

router.get('/overview', protect, async (req, res) => {
    try {
        const { brandId, days = 60 } = req.query;
        const userId = req.user._id;
        const cacheKey = getCacheKey(userId, brandId, `overview-${days}`);
        const cached = getCached(cacheKey);
        if (cached) return res.json(cached);

        const integration = await getShopifyIntegration(userId, brandId);
        if (!integration) {
            return res.json({ connected: false, message: 'Shopify not connected.' });
        }

        const brandFilter = brandId ? { brand: brandId } : { user: userId };
        const dateLimit = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000);

        // Fetch from OUR Database instead of live API
        // Fetch ALL orders (not date-limited) for RFM/LTV full-history analysis
        const [orders, allOrders, products, customers] = await Promise.all([
            ShopifyOrder.find({ ...brandFilter, shopifyCreatedAt: { $gte: dateLimit } }).lean(),
            ShopifyOrder.find(brandFilter).lean(),
            Product.find({ ...brandFilter, source: 'shopify' }).lean(),
            ShopifyCustomer.find(brandFilter).lean(),
        ]);

        const orderAnalytics = computeOrderAnalytics(orders, parseInt(days));
        const customerAnalytics = computeCustomerAnalytics(customers, orders);
        const productHealth = computeProductHealth(orderAnalytics.topProducts, products);
        const redFlags = computeRedFlags(orderAnalytics, products, customerAnalytics);
        const advanced = computeAdvancedAnalytics(orders, products);
        const rfmSegmentation = computeRFMSegmentation(customers, allOrders);
        const inventoryForecast = computeInventoryForecast(products, orders);
        const predictiveLTV = computePredictiveLTV(customers, allOrders);

        // Extract shop info from integration
        const shopDomain = integration.platformData?.shopDomain || integration.platformData?.shop || '';
        const accessToken = integration.accessToken || '';

        let shopInfo = null;
        try { if (accessToken && shopDomain) shopInfo = await getShopInfo(accessToken, shopDomain); } catch { /* ok */ }

        const result = {
            connected: true,
            shop: {
                name: shopInfo?.name || integration.platformData?.shopName || shopDomain || 'Store',
                domain: shopDomain || '',
                lastSyncAt: integration.lastSyncAt,
                currency: shopInfo?.currency || 'INR',
            },
            period: { days: parseInt(days), from: new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000).toISOString(), to: new Date().toISOString() },
            kpis: {
                totalRevenue: orderAnalytics.totalRevenue,
                totalOrders: orderAnalytics.totalOrders,
                avgOrderValue: orderAnalytics.avgOrderValue,
                revenueGrowth: orderAnalytics.revenueGrowth,
                totalCustomers: customerAnalytics.totalCustomers,
                newCustomers: customerAnalytics.newCustomers,
                repeatRate: customerAnalytics.repeatRate,
                refundRate: orderAnalytics.refundRate,
            },
            dailyRevenue: orderAnalytics.dailyRevenue,
            productHealth,
            customerAnalytics,
            redFlags,
            totalProducts: products.length,
            geoRadar: advanced.geoRadar,
            productVelocity: advanced.productVelocity,
            popularVariants: advanced.popularVariants,
            abandonmentSignals: advanced.abandonmentSignals,
            rfmSegmentation,
            inventoryForecast,
            predictiveLTV,
        };

        setCache(cacheKey, result);
        res.json(result);
    } catch (error) {
        console.error('Shopify analytics overview error:', error);
        res.status(500).json({ error: safeErrorMessage(error) });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/shopify-analytics/snapshot — Lightweight D2C data for main dashboard
// ═══════════════════════════════════════════════════════════════════════════

router.get('/snapshot', protect, async (req, res) => {
    try {
        const userId = req.user._id;
        const { brandId } = req.query;
        const cacheKey = getCacheKey(userId, brandId, 'snapshot');
        const cached = getCached(cacheKey);
        if (cached) return res.json(cached);

        const integration = await getShopifyIntegration(userId, brandId);
        if (!integration) return res.json({ connected: false });

        const brandFilter = { user: userId };
        const dateLimit = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        const orders = await ShopifyOrder.find({ ...brandFilter, shopifyCreatedAt: { $gte: dateLimit } }).lean();

        const revenue = orders.reduce((s, o) => s + (o.totalPrice || 0), 0);
        const aov = orders.length > 0 ? revenue / orders.length : 0;

        // Top 3 products
        const productMap = {};
        orders.forEach(o => (o.lineItems || []).forEach(li => {
            const k = li.productId || li.title;
            if (!productMap[k]) productMap[k] = { title: li.title, units: 0, revenue: 0 };
            productMap[k].units += li.quantity || 1;
            productMap[k].revenue += (li.price || 0) * (li.quantity || 1);
        }));
        const topProducts = Object.values(productMap).sort((a, b) => b.revenue - a.revenue).slice(0, 3);

        const result = {
            connected: true,
            shopName: integration.platformData?.shopName || integration.platformData?.shopDomain || integration.platformData?.shop || 'Store',
            weeklyRevenue: Math.round(revenue),
            weeklyOrders: orders.length,
            aov: Math.round(aov),
            topProducts,
        };

        setCache(cacheKey, result);
        res.json(result);
    } catch (error) {
        console.error('Snapshot error:', error);
        res.json({ connected: false });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/shopify-analytics/ai-insights — AI-powered analysis
// ═══════════════════════════════════════════════════════════════════════════

router.post('/ai-insights', protect, async (req, res) => {
    try {
        const { overview, brandId } = req.body;
        if (!overview) return res.status(400).json({ error: 'Overview data required' });

        let brand = null;
        if (brandId) brand = await Brand.findById(brandId).lean();

        // Helper: generate rule-based insights from data (no AI needed)
        const generateRuleBasedInsights = () => {
            const insights = {
                summary: `Your ${brand?.name || overview.shop?.name || 'store'} has generated ₹${overview.kpis?.totalRevenue?.toLocaleString()} from ${overview.kpis?.totalOrders} orders with an AOV of ₹${overview.kpis?.avgOrderValue?.toLocaleString()}.`,
                whatsWorking: [],
                whatsNot: [],
                actionPlan: [],
            };

            if (overview.productHealth?.[0]) {
                insights.whatsWorking.push({ title: `${overview.productHealth[0].title} is your #1 product`, desc: `Revenue of ₹${overview.productHealth[0].revenue.toLocaleString()} with ${overview.productHealth[0].unitsSold} units sold.`, icon: 'star' });
            }
            if (overview.kpis?.revenueGrowth > 0) {
                insights.whatsWorking.push({ title: `Revenue is growing ${overview.kpis.revenueGrowth}% WoW`, desc: 'Keep the momentum with consistent marketing and fresh content.', icon: 'trending_up' });
            }
            if (overview.kpis?.repeatRate > 20) {
                insights.whatsWorking.push({ title: `${overview.kpis.repeatRate}% repeat rate is healthy`, desc: 'Your customers are coming back, which signals strong product-market fit.', icon: 'loyalty' });
            }
            if (overview.kpis?.refundRate > 5) {
                insights.whatsNot.push({ title: `Refund rate is ${overview.kpis.refundRate}%`, desc: 'Review product quality, sizing guides, and delivery experience.', icon: 'warning' });
            }
            if (overview.kpis?.repeatRate < 20) {
                insights.whatsNot.push({ title: `Only ${overview.kpis.repeatRate}% repeat customers`, desc: 'Launch loyalty programs and post-purchase email sequences.', icon: 'person_off' });
            }
            if (overview.kpis?.revenueGrowth < 0) {
                insights.whatsNot.push({ title: `Revenue declined ${overview.kpis.revenueGrowth}% WoW`, desc: 'Investigate drop-off points and consider running a flash sale or re-engagement campaign.', icon: 'trending_down' });
            }

            const boostable = (overview.productHealth || []).filter(p => p.needsBoost);
            if (boostable.length > 0) {
                insights.actionPlan.push({ title: `Boost ${boostable.length} underperforming products`, desc: `Products like "${boostable[0].title}" have potential but need performance marketing. Run targeted ad campaigns.`, priority: 'high', icon: 'rocket_launch' });
            }
            insights.actionPlan.push({ title: 'Run a this-week flash sale', desc: `Your AOV is ₹${overview.kpis?.avgOrderValue?.toLocaleString()}. Create bundles above this to increase order value.`, priority: 'medium', icon: 'sell' });
            insights.actionPlan.push({ title: 'Email dormant customers', desc: `${(overview.customerAnalytics?.totalCustomers || 0) - (overview.customerAnalytics?.newCustomers || 0)} existing customers haven't ordered recently. Send a win-back campaign.`, priority: 'medium', icon: 'email' });

            return insights;
        };

        if (!isGrokAvailable()) {
            return res.json({ insights: generateRuleBasedInsights() });
        }

        // Try AI with a 20-second timeout, fallback to rule-based if it fails
        try {
            const parsed = await Promise.race([
                callGrok(
                    `You are a D2C e-commerce strategist AI — a CMO-level advisor billing ₹50,000/hour. Analyze the store data and provide STRATEGIC, MEASURABLE insights that reference specific products, numbers, and percentages from the data.

Respond in JSON:
{
  "summary": "One-paragraph executive summary referencing specific KPIs and their strategic implications",
  "whatsWorking": [{ "title": "Specific finding with numbers", "desc": "Why this matters strategically and how to scale it — reference actual data", "icon": "material_icon", "kpi": "The metric proving this (e.g., '₹12,500 AOV from repeat buyers')", "scaleAction": "Exact next step to scale this win (e.g., 'Create lookalike audience from top 50 buyers and run ₹2,000/day campaign')" }],
  "whatsNot": [{ "title": "Specific problem with data", "desc": "Root cause analysis — not just what's wrong but WHY", "icon": "material_icon", "kpi": "Current metric (e.g., '4.2% refund rate, industry avg is 2%')", "targetKpi": "Where this should be (e.g., 'Below 2.5% within 30 days')", "fixAction": "The one specific thing to change first" }],
  "actionPlan": [{
    "title": "Specific action — NOT generic advice like 'Run ads' or 'Improve marketing'",
    "desc": "2-3 sentence strategic recommendation referencing specific products and data",
    "priority": "high|medium|low",
    "icon": "material_icon",
    "kpi": "What to measure (e.g., 'Weekly revenue from product X')",
    "baseline": "Current value from data (e.g., '₹45,000/week, 23 units')",
    "target": "Measurable target (e.g., '₹75,000/week, 40 units within 21 days')",
    "timeline": "Implementation timeline (e.g., '3 days to set up, measure after 14 days')",
    "proofMethod": "How to verify success (e.g., 'Compare weekly revenue before/after in Shopify analytics')",
    "expectedROI": "Expected business impact (e.g., '₹30,000 additional weekly revenue at ₹5,000 ad spend = 6x ROAS')"
  }]
}

STRATEGIC RULES (MANDATORY):
1. NEVER give generic advice like 'Run marketing campaigns' or 'Improve customer experience' — be SPECIFIC with product names and numbers
2. Every actionPlan item MUST have a measurable KPI with baseline from the data and a specific target
3. Every recommendation MUST reference actual products, revenue figures, or customer metrics from the data
4. Think like a consultant billing ₹50,000/hour — if a recommendation could apply to ANY D2C store, it's too generic. DELETE IT.
5. Reference specific products by name, specific revenue figures, and specific customer segments

Be specific — reference product names, actual numbers, and percentages from the data.`,
                    `Brand: ${brand?.name || overview.shop?.name || 'Unknown'}
Industry: ${brand?.dna?.industry || 'D2C'}
KPIs: Revenue ₹${overview.kpis?.totalRevenue}, Orders: ${overview.kpis?.totalOrders}, AOV: ₹${overview.kpis?.avgOrderValue}, Growth: ${overview.kpis?.revenueGrowth}%, Repeat: ${overview.kpis?.repeatRate}%, Refund: ${overview.kpis?.refundRate}%
Top Products: ${JSON.stringify(overview.productHealth?.slice(0, 5).map(p => ({ title: p.title, revenue: p.revenue, units: p.unitsSold, health: p.healthScore, needsBoost: p.needsBoost })))}
Red Flags: ${JSON.stringify(overview.redFlags?.map(f => f.title))}
Customers: Total ${overview.customerAnalytics?.totalCustomers}, New: ${overview.customerAnalytics?.newCustomers}, Top Cities: ${JSON.stringify(overview.customerAnalytics?.topCities?.slice(0, 3))}`,
                    2000
                ),
                new Promise((_, reject) => setTimeout(() => reject(new Error('AI timeout after 20s')), 20000)),
            ]);

            res.json({ insights: parsed });
        } catch (aiErr) {
            console.warn('⚠️ AI insights failed/timed out, using rule-based fallback:', aiErr.message);
            res.json({ insights: generateRuleBasedInsights() });
        }
    } catch (error) {
        console.error('AI insights error:', error);
        res.status(500).json({ error: safeErrorMessage(error) });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/shopify-analytics/boost-plan — Generate boost plan for a product
// ═══════════════════════════════════════════════════════════════════════════

router.post('/boost-plan', protect, async (req, res) => {
    try {
        const { product, brandId, kpis } = req.body;
        if (!product) return res.status(400).json({ error: 'Product data required' });

        let brand = null;
        if (brandId) brand = await Brand.findById(brandId).lean();

        if (!isGrokAvailable()) {
            return res.json({
                boostPlan: {
                    product: product.title,
                    status: product.healthBadge,
                    campaigns: [
                        {
                            channel: 'Meta Ads',
                            type: 'Conversion Campaign',
                            budget: `₹${Math.max(500, Math.round(product.price * 10))}–₹${Math.max(2000, Math.round(product.price * 30))}/day`,
                            targeting: 'Lookalike of existing buyers + Interest-based targeting',
                            creative: `Product showcase carousel with lifestyle images. Lead with ₹${product.price} price point.`,
                            expectedROAS: '3-5x',
                        },
                        {
                            channel: 'Google Ads',
                            type: 'Shopping + Search',
                            budget: `₹${Math.max(300, Math.round(product.price * 5))}–₹${Math.max(1500, Math.round(product.price * 20))}/day`,
                            targeting: 'High-intent keywords for product category',
                            creative: 'Optimized product feed with compelling titles and competitive pricing.',
                            expectedROAS: '4-8x',
                        },
                        {
                            channel: 'Instagram Reels',
                            type: 'Organic + Boosted',
                            budget: '₹500–₹1000/boost',
                            targeting: 'Existing followers + Similar audiences',
                            creative: `15-30s product demo or unboxing reel. Show real use-case.`,
                            expectedROAS: '2-4x (organic reach bonus)',
                        },
                    ],
                    estimatedImpact: {
                        additionalSales: `${Math.round(product.unitsSold * 0.5)}–${Math.round(product.unitsSold * 1.5)} units/week`,
                        additionalRevenue: `₹${Math.round(product.revenue * 0.3).toLocaleString()}–₹${Math.round(product.revenue * 1.0).toLocaleString()}/week`,
                    },
                    quickWins: [
                        'Update product images with lifestyle shots',
                        'Add customer reviews/UGC to product page',
                        `Create a bundle with your #1 product to increase AOV`,
                    ],
                },
            });
        }

        const parsed = await callGrok(
            `You are a D2C performance marketing strategist — the kind who manages ₹10L+/month ad budgets. Create a SPECIFIC, DATA-BACKED growth campaign plan for this product.

Respond in JSON:
{
  "product": "product name",
  "status": "health status",
  "diagnosis": "2-3 sentence analysis of WHY this product needs boosting based on its health score, sales velocity, and inventory levels",
  "campaigns": [{
    "channel": "Meta Ads|Google Ads|Instagram Reels|YouTube Shorts",
    "type": "campaign type",
    "budget": "daily budget range in INR — calculated from product price and margin",
    "targeting": "SPECIFIC targeting strategy referencing the product's actual buyer persona",
    "creative": "SPECIFIC creative direction — not generic 'product showcase' but exact format and messaging angle",
    "expectedROAS": "expected return with reasoning (e.g., '4-6x based on ₹X price point and industry benchmarks')",
    "kpi": "Primary metric to track (e.g., 'Cost per purchase under ₹200')",
    "proofMethod": "How to verify after 7 days (e.g., 'Check Meta Ads Manager — CPA should be below ₹X')"
  }],
  "estimatedImpact": {
    "additionalSales": "units/week — calculated from current sales rate",
    "additionalRevenue": "INR/week — calculated from price × units",
    "breakEvenDays": "Days to recover ad spend at projected ROAS"
  },
  "quickWins": [{
    "action": "Specific action — NOT generic like 'Update images'",
    "kpi": "What this improves (e.g., 'Product page conversion rate')",
    "baseline": "Current state (e.g., 'No reviews on product page')",
    "target": "Goal (e.g., '5+ reviews within 7 days by emailing past buyers')",
    "timeline": "How long (e.g., '2 hours setup + 7 days collection')"
  }]
}

STRATEGIC RULES: Every recommendation MUST reference this product's actual data. No generic advice.`,
            `Brand: ${brand?.name || 'Unknown'}, Industry: ${brand?.dna?.industry || 'D2C'}
Product: ${product.title}, Price: ₹${product.price}, Units Sold: ${product.unitsSold}, Revenue: ₹${product.revenue}
Health Score: ${product.healthScore}/100, Status: ${product.healthBadge}, Inventory: ${product.inventory}
Store AOV: ₹${kpis?.avgOrderValue || 0}, Total Customers: ${kpis?.totalCustomers || 0}`,
            1200
        );

        res.json({ boostPlan: parsed });
    } catch (error) {
        console.error('Boost plan error:', error);
        res.status(500).json({ error: safeErrorMessage(error) });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/shopify-analytics/sync — Force re-sync and clear cache
// ═══════════════════════════════════════════════════════════════════════════

router.post('/sync', protect, async (req, res) => {
    try {
        const userId = req.user._id;
        // Clear cache for this user
        Object.keys(analyticsCache).forEach(k => {
            if (k.startsWith(`${userId}:`)) delete analyticsCache[k];
        });
        res.json({ success: true, message: 'Cache cleared. Analytics will refresh on next load.' });
    } catch (error) {
        res.status(500).json({ error: safeErrorMessage(error) });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/shopify-analytics/creative-cockpit — Creative performance analytics
// ═══════════════════════════════════════════════════════════════════════════

router.get('/creative-cockpit', protect, async (req, res) => {
    try {
        const { brandId } = req.query;
        const userId = req.user._id;
        const cacheKey = getCacheKey(userId, brandId, 'creative-cockpit');
        const cached = getCached(cacheKey);
        if (cached) return res.json(cached);

        // Fetch published content with engagement
        const contentFilter = { user: userId, status: 'published' };
        if (brandId) contentFilter.brand = brandId;
        const contents = await Content.find(contentFilter).sort('-publishedAt').limit(100).lean();

        // Fetch ad campaigns with performance
        const campaignFilter = { user: userId };
        if (brandId) campaignFilter.brand = brandId;
        const campaigns = await AdCampaign.find(campaignFilter).sort('-createdAt').limit(50).lean();

        // Content type performance
        const typePerf = {};
        contents.forEach(c => {
            const t = c.type || 'other';
            if (!typePerf[t]) typePerf[t] = { type: t, count: 0, totalEngagement: 0, totalViews: 0, avgAlignment: 0, alignments: [] };
            typePerf[t].count++;
            const eng = (c.engagement?.likes || 0) + (c.engagement?.comments || 0) * 3 + (c.engagement?.shares || 0) * 5;
            typePerf[t].totalEngagement += eng;
            typePerf[t].totalViews += c.engagement?.views || 0;
            if (c.aiMeta?.brandAlignmentScore) typePerf[t].alignments.push(c.aiMeta.brandAlignmentScore);
        });
        Object.values(typePerf).forEach(t => {
            t.avgEngagement = t.count > 0 ? Math.round(t.totalEngagement / t.count) : 0;
            t.avgAlignment = t.alignments.length > 0 ? Math.round(t.alignments.reduce((s, v) => s + v, 0) / t.alignments.length) : 0;
            delete t.alignments;
        });
        const contentTypeRanking = Object.values(typePerf).sort((a, b) => b.totalEngagement - a.totalEngagement);

        // Platform performance
        const platformPerf = {};
        contents.forEach(c => {
            const p = c.platform || 'Unknown';
            if (!platformPerf[p]) platformPerf[p] = { platform: p, count: 0, engagement: 0, views: 0 };
            platformPerf[p].count++;
            platformPerf[p].engagement += (c.engagement?.likes || 0) + (c.engagement?.comments || 0) * 3 + (c.engagement?.shares || 0) * 5;
            platformPerf[p].views += c.engagement?.views || 0;
        });
        const platformRanking = Object.values(platformPerf).sort((a, b) => b.engagement - a.engagement);

        // Top performing creatives (by engagement score)
        const topCreatives = contents
            .map(c => ({
                id: c._id,
                title: c.title || c.content?.substring(0, 60) + '...',
                type: c.type,
                platform: c.platform,
                publishedAt: c.publishedAt,
                engagement: {
                    ...c.engagement,
                    score: (c.engagement?.likes || 0) + (c.engagement?.comments || 0) * 3 + (c.engagement?.shares || 0) * 5,
                },
                brandAlignment: c.aiMeta?.brandAlignmentScore || 0,
                rating: c.rating,
            }))
            .sort((a, b) => b.engagement.score - a.engagement.score)
            .slice(0, 15);

        // Ad creative ROAS ranking
        const adCreativePerf = [];
        campaigns.forEach(camp => {
            (camp.creatives || []).forEach((cr, idx) => {
                const variant = camp.abTest?.variants?.find(v => v.creativeIndex === idx);
                adCreativePerf.push({
                    campaignTitle: camp.title,
                    platform: camp.platform,
                    format: cr.format,
                    headline: cr.headline,
                    spend: variant?.performance?.spend || camp.performance?.spend || 0,
                    conversions: variant?.performance?.conversions || camp.performance?.conversions || 0,
                    clicks: variant?.performance?.clicks || camp.performance?.clicks || 0,
                    impressions: camp.performance?.impressions || 0,
                    roas: camp.performance?.roas || 0,
                    ctr: variant?.performance?.ctr || camp.performance?.ctr || 0,
                    status: camp.status,
                });
            });
        });
        adCreativePerf.sort((a, b) => b.roas - a.roas);

        // Ad spend totals
        const totalAdSpend = campaigns.reduce((s, c) => s + (c.performance?.spend || 0), 0);
        const totalAdConversions = campaigns.reduce((s, c) => s + (c.performance?.conversions || 0), 0);
        const blendedROAS = totalAdSpend > 0 ? Math.round((totalAdConversions / totalAdSpend) * 100) / 100 : 0;

        const result = {
            totalContent: contents.length,
            totalCampaigns: campaigns.length,
            contentTypeRanking,
            platformRanking,
            topCreatives,
            adCreativePerf: adCreativePerf.slice(0, 15),
            totalAdSpend: Math.round(totalAdSpend * 100) / 100,
            totalAdConversions,
            blendedROAS,
            winningFormat: contentTypeRanking[0]?.type || 'social',
        };

        setCache(cacheKey, result);
        res.json(result);
    } catch (error) {
        console.error('Creative cockpit error:', error);
        res.status(500).json({ error: safeErrorMessage(error) });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/shopify-analytics/cohort-ltv — Cohort retention & LTV analysis
// ═══════════════════════════════════════════════════════════════════════════

router.get('/cohort-ltv', protect, async (req, res) => {
    try {
        const { brandId } = req.query;
        const userId = req.user._id;
        const cacheKey = getCacheKey(userId, brandId, 'cohort-ltv');
        const cached = getCached(cacheKey);
        if (cached) return res.json(cached);

        const integration = await getShopifyIntegration(userId, brandId);
        if (!integration) return res.json({ connected: false });

        // Query from MongoDB (stored data) instead of live Shopify API
        const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
        const bId = brandId || integration.brand;
        const orders = await ShopifyOrder.find({ brand: bId, shopifyCreatedAt: { $gte: yearAgo } }).lean();

        // Build customer first-purchase date map
        const customerFirstOrder = {};
        orders.sort((a, b) => new Date(a.shopifyCreatedAt) - new Date(b.shopifyCreatedAt));
        orders.forEach(o => {
            const cId = o.customer?.shopifyCustomerId || o.customer?.email;
            if (cId && !customerFirstOrder[cId]) {
                customerFirstOrder[cId] = new Date(o.shopifyCreatedAt);
            }
        });

        // Build monthly cohorts (last 6 months)
        const now = new Date();
        const cohorts = [];
        for (let m = 5; m >= 0; m--) {
            const cohortStart = new Date(now.getFullYear(), now.getMonth() - m, 1);
            const cohortEnd = new Date(now.getFullYear(), now.getMonth() - m + 1, 0, 23, 59, 59);
            const label = cohortStart.toLocaleString('default', { month: 'short', year: '2-digit' });

            // Customers whose first order was in this month
            const cohortCustomers = Object.entries(customerFirstOrder)
                .filter(([, d]) => d >= cohortStart && d <= cohortEnd)
                .map(([id]) => id);

            const size = cohortCustomers.length;
            if (size === 0) { cohorts.push({ label, size: 0, retention: [], revenue: 0, avgLTV: 0 }); continue; }

            // Retention: for each subsequent month, how many ordered again?
            const retention = [];
            let totalCohortRevenue = 0;
            for (let rm = 0; rm <= m; rm++) {
                const retStart = new Date(now.getFullYear(), now.getMonth() - m + rm, 1);
                const retEnd = new Date(now.getFullYear(), now.getMonth() - m + rm + 1, 0, 23, 59, 59);
                const activeInMonth = new Set();
                let monthRevenue = 0;
                orders.forEach(o => {
                    const cId = o.customer?.shopifyCustomerId || o.customer?.email;
                    const oDate = new Date(o.shopifyCreatedAt);
                    if (cohortCustomers.includes(cId) && oDate >= retStart && oDate <= retEnd) {
                        activeInMonth.add(cId);
                        monthRevenue += (o.totalPrice || 0);
                    }
                });
                retention.push({ month: rm, active: activeInMonth.size, rate: Math.round((activeInMonth.size / size) * 100), revenue: Math.round(monthRevenue) });
                totalCohortRevenue += monthRevenue;
            }

            cohorts.push({
                label,
                size,
                retention,
                revenue: Math.round(totalCohortRevenue),
                avgLTV: Math.round(totalCohortRevenue / size),
            });
        }

        // Overall LTV curve (cumulative revenue per customer over months)
        const allCustomerLTV = {};
        orders.forEach(o => {
            const cId = o.customer?.shopifyCustomerId || o.customer?.email;
            if (!cId) return;
            if (!allCustomerLTV[cId]) allCustomerLTV[cId] = 0;
            allCustomerLTV[cId] += (o.totalPrice || 0);
        });
        const ltvValues = Object.values(allCustomerLTV).sort((a, b) => b - a);
        const avgLTV = ltvValues.length > 0 ? Math.round(ltvValues.reduce((s, v) => s + v, 0) / ltvValues.length) : 0;
        const medianLTV = ltvValues.length > 0 ? Math.round(ltvValues[Math.floor(ltvValues.length / 2)]) : 0;
        const top10PctLTV = ltvValues.length > 10 ? Math.round(ltvValues.slice(0, Math.ceil(ltvValues.length * 0.1)).reduce((s, v) => s + v, 0) / Math.ceil(ltvValues.length * 0.1)) : avgLTV;

        // New vs returning revenue
        let newRevenue = 0, returningRevenue = 0;
        const cOrderCount = {};
        orders.forEach(o => {
            const cId = o.customer?.shopifyCustomerId || o.customer?.email;
            if (!cId) return;
            cOrderCount[cId] = (cOrderCount[cId] || 0) + 1;
            if (cOrderCount[cId] === 1) newRevenue += (o.totalPrice || 0);
            else returningRevenue += (o.totalPrice || 0);
        });

        // Churn: customers who ordered >60 days ago but not in last 30
        const msDay = 24 * 60 * 60 * 1000;
        const activeRecently = new Set();
        const wasPreviouslyActive = new Set();
        orders.forEach(o => {
            const cId = o.customer?.shopifyCustomerId || o.customer?.email;
            const age = Date.now() - new Date(o.shopifyCreatedAt).getTime();
            if (age < 30 * msDay) activeRecently.add(cId);
            if (age >= 30 * msDay && age < 120 * msDay) wasPreviouslyActive.add(cId);
        });
        const churned = [...wasPreviouslyActive].filter(c => !activeRecently.has(c)).length;
        const churnRate = wasPreviouslyActive.size > 0 ? Math.round((churned / wasPreviouslyActive.size) * 100) : 0;

        const result = {
            connected: true,
            cohorts,
            ltvMetrics: { avgLTV, medianLTV, top10PctLTV, totalCustomersTracked: ltvValues.length },
            revenueSplit: { new: Math.round(newRevenue), returning: Math.round(returningRevenue) },
            churn: { churned, churnRate, previouslyActive: wasPreviouslyActive.size },
        };

        setCache(cacheKey, result);
        res.json(result);
    } catch (error) {
        console.error('Cohort LTV error:', error);
        res.status(500).json({ error: safeErrorMessage(error) });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/shopify-analytics/profitability — True profit & MER
// ═══════════════════════════════════════════════════════════════════════════

router.get('/profitability', protect, async (req, res) => {
    try {
        const { brandId, days = 60 } = req.query;
        const userId = req.user._id;
        const cacheKey = getCacheKey(userId, brandId, `profit-${days}`);
        const cached = getCached(cacheKey);
        if (cached) return res.json(cached);

        const integration = await getShopifyIntegration(userId, brandId);
        if (!integration) return res.json({ connected: false });

        // Query from MongoDB (stored data) instead of live Shopify API
        const dateLimit = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000);
        const bId = brandId || integration.brand;
        const [orders, products] = await Promise.all([
            ShopifyOrder.find({ brand: bId, shopifyCreatedAt: { $gte: dateLimit } }).lean(),
            Product.find({ brand: bId, source: 'shopify' }).lean(),
        ]);

        // Revenue (using stored schema field names)
        const totalRevenue = orders.reduce((s, o) => s + (o.totalPrice || 0), 0);
        const totalDiscounts = orders.reduce((s, o) => s + (o.totalDiscounts || 0), 0);
        // Tax and shipping not stored in our model — estimate from revenue
        const totalTax = Math.round(totalRevenue * 0.05); // Estimated 5% GST
        const totalShipping = Math.round(orders.length * 45); // Estimated ₹45/order avg shipping

        // COGS estimate using Product variants
        let estimatedCOGS = 0;
        const productCostMap = {};
        products.forEach(p => {
            (p.variants || []).forEach(v => {
                const price = v.price || p.price?.amount || 0;
                // Use 60% of selling price as cost if no compare_at_price data
                productCostMap[String(v.sku || v.title)] = price * 0.6;
            });
        });
        orders.forEach(o => {
            (o.lineItems || []).forEach(item => {
                const cost = productCostMap[String(item.sku)] || ((item.price || 0) * 0.6);
                const qty = item.quantity || 1;
                estimatedCOGS += cost * qty;
            });
        });

        // Ad Spend from AdCampaign
        const campaignFilter = { user: userId };
        if (brandId) campaignFilter.brand = brandId;
        const campaigns = await AdCampaign.find(campaignFilter).lean();
        const totalAdSpend = campaigns.reduce((s, c) => s + (c.performance?.spend || 0), 0);
        const totalAdConversions = campaigns.reduce((s, c) => s + (c.performance?.conversions || 0), 0);
        const totalAdClicks = campaigns.reduce((s, c) => s + (c.performance?.clicks || 0), 0);
        const totalAdImpressions = campaigns.reduce((s, c) => s + (c.performance?.impressions || 0), 0);

        // Profitability
        const grossProfit = totalRevenue - estimatedCOGS;
        const netProfit = grossProfit - totalAdSpend - totalDiscounts;
        const grossMargin = totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 100) : 0;
        const netMargin = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 100) : 0;

        // MER & Blended ROAS
        const mer = totalAdSpend > 0 ? Math.round((totalRevenue / totalAdSpend) * 100) / 100 : 0;
        const blendedROAS = totalAdSpend > 0 ? Math.round((totalRevenue / totalAdSpend) * 100) / 100 : 0;
        const cac = totalAdConversions > 0 ? Math.round(totalAdSpend / totalAdConversions) : 0;

        // Per-product profitability (using stored lineItems field names)
        const productProfitMap = {};
        orders.forEach(o => {
            (o.lineItems || []).forEach(item => {
                const key = item.productId || item.title;
                if (!productProfitMap[key]) productProfitMap[key] = { title: item.title, revenue: 0, estimatedCost: 0, units: 0 };
                const qty = item.quantity || 1;
                const rev = (item.price || 0) * qty;
                productProfitMap[key].revenue += rev;
                productProfitMap[key].estimatedCost += rev * 0.6; // 60% cost assumption
                productProfitMap[key].units += qty;
            });
        });
        const productProfitability = Object.values(productProfitMap)
            .map(p => ({ ...p, profit: Math.round(p.revenue - p.estimatedCost), margin: p.revenue > 0 ? Math.round(((p.revenue - p.estimatedCost) / p.revenue) * 100) : 0 }))
            .sort((a, b) => b.profit - a.profit)
            .slice(0, 15);

        // Cost breakdown for pie chart
        const costBreakdown = [
            { name: 'COGS', value: Math.round(estimatedCOGS), color: '#f43f5e' },
            { name: 'Ad Spend', value: Math.round(totalAdSpend), color: '#f59e0b' },
            { name: 'Discounts', value: Math.round(totalDiscounts), color: '#8b5cf6' },
            { name: 'Tax', value: Math.round(totalTax), color: '#64748b' },
            { name: 'Shipping', value: Math.round(totalShipping), color: '#06b6d4' },
            { name: 'Net Profit', value: Math.round(Math.max(0, netProfit)), color: '#34d399' },
        ];

        const result = {
            connected: true,
            period: parseInt(days),
            revenue: { total: Math.round(totalRevenue), discounts: Math.round(totalDiscounts), tax: Math.round(totalTax), shipping: Math.round(totalShipping) },
            costs: { cogs: Math.round(estimatedCOGS), adSpend: Math.round(totalAdSpend) },
            profit: { gross: Math.round(grossProfit), net: Math.round(netProfit), grossMargin, netMargin },
            efficiency: { mer, blendedROAS, cac, adConversions: totalAdConversions, adClicks: totalAdClicks, adImpressions: totalAdImpressions },
            productProfitability,
            costBreakdown,
            health: netMargin > 20 ? 'excellent' : netMargin > 10 ? 'good' : netMargin > 0 ? 'warning' : 'critical',
        };

        setCache(cacheKey, result);
        res.json(result);
    } catch (error) {
        console.error('Profitability error:', error);
        res.status(500).json({ error: safeErrorMessage(error) });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/shopify-analytics/ai-copilot — Conversational AI (Moby-style)
// ═══════════════════════════════════════════════════════════════════════════

router.post('/ai-copilot', protect, async (req, res) => {
    try {
        const { question, context } = req.body;
        if (!question) return res.status(400).json({ error: 'Question is required' });

        if (!isGrokAvailable()) {
            // Keyword-based fallback
            const q = question.toLowerCase();
            let answer = '';
            if (q.includes('revenue') || q.includes('sales')) {
                answer = `Your total revenue is ₹${context?.kpis?.totalRevenue?.toLocaleString() || 'N/A'} from ${context?.kpis?.totalOrders || 'N/A'} orders. Revenue growth is ${context?.kpis?.revenueGrowth || 0}% week-over-week. ${context?.kpis?.revenueGrowth < 0 ? 'Consider running a flash sale or email campaign to boost sales.' : 'Good momentum — keep investing in your top channels.'}`;
            } else if (q.includes('product') || q.includes('best') || q.includes('top')) {
                const top = context?.productHealth?.[0];
                answer = top ? `Your best product is "${top.title}" with ₹${top.revenue?.toLocaleString()} in revenue and ${top.unitsSold} units sold. Health score: ${top.healthScore}/100.` : 'No product data available.';
            } else if (q.includes('customer') || q.includes('repeat')) {
                answer = `You have ${context?.kpis?.totalCustomers || 0} total customers. Repeat rate: ${context?.kpis?.repeatRate || 0}%. ${(context?.kpis?.repeatRate || 0) < 20 ? 'This is below healthy levels. Set up post-purchase email flows and loyalty rewards.' : 'Healthy repeat rate!'}`;
            } else if (q.includes('ad') || q.includes('roas') || q.includes('campaign') || q.includes('spend')) {
                answer = 'Check the Profitability tab for blended ROAS, MER, ad spend analysis, and the Creative Cockpit for creative-level ROAS rankings.';
            } else if (q.includes('refund') || q.includes('return')) {
                answer = `Refund rate is ${context?.kpis?.refundRate || 0}%. ${(context?.kpis?.refundRate || 0) > 5 ? 'This is above healthy levels. Review product descriptions, sizing guides, and packaging quality.' : 'Refund rate is healthy.'}`;
            } else {
                answer = `Based on your data: Revenue ₹${context?.kpis?.totalRevenue?.toLocaleString() || 'N/A'}, ${context?.kpis?.totalOrders || 0} orders, AOV ₹${context?.kpis?.avgOrderValue?.toLocaleString() || 'N/A'}, ${context?.kpis?.totalCustomers || 0} customers. Check the specific tabs for detailed analysis, or ask me about revenue, products, customers, ads, or refunds.`;
            }
            return res.json({ answer, sources: ['Store KPIs', 'Product Health'], aiPowered: false });
        }

        const parsed = await callGrok(
            `You are an AI co-pilot for D2C e-commerce brands — a data-driven strategist who answers with SPECIFIC numbers and MEASURABLE recommendations.

Rules:
- Be SPECIFIC: use actual product names, exact numbers, and percentages from the data
- Be STRATEGIC: every answer must include a measurable recommendation with a target metric
- Be CONCISE: 3-5 sentences max
- Reference data sources when citing numbers
- NEVER give generic advice — every recommendation must reference specific data from this store

Respond in JSON:
{
  "answer": "Your concise, data-backed answer with specific numbers and product names",
  "sources": ["list of data sources used like 'Orders Data', 'Product Health', 'Customer Analytics'"],
  "actions": [{
    "action": "Specific measurable action — NOT generic like 'Improve marketing'",
    "kpi": "What to measure (e.g., 'Repeat purchase rate')",
    "target": "Measurable goal (e.g., 'Increase from 12% to 20% within 30 days')",
    "proofMethod": "How to verify (e.g., 'Compare repeat rate in D2C analytics next month')"
  }]
}`,
            `Store Data Context:
${JSON.stringify(context, null, 0)}

User Question: ${question}`,
            800
        );

        res.json({ ...parsed, aiPowered: true });
    } catch (error) {
        console.error('AI copilot error:', error);
        res.status(500).json({ error: safeErrorMessage(error) });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// TEMPORARY: POST /api/shopify-analytics/seed-demo — Seed ACwO D2C dummy data
// DELETE /api/shopify-analytics/seed-demo — Remove seeded data
// ═══════════════════════════════════════════════════════════════════════════

const SEED_TAG = 'acwo-d2c-demo';

const ACWO_PRODUCTS = [
    { id: 'ACWO-001', title: 'ACwO DwOTS 2.0 True Wireless Earbuds', price: 1299, inventory: 450 },
    { id: 'ACWO-002', title: 'ACwO Neckband X1 Pro', price: 899, inventory: 320 },
    { id: 'ACWO-003', title: 'ACwO StudioBass Over-Ear Headphones', price: 1999, inventory: 180 },
    { id: 'ACWO-004', title: 'ACwO SmartWatch Ultra S1', price: 2499, inventory: 150 },
    { id: 'ACWO-005', title: 'ACwO PowerBank 10000mAh', price: 799, inventory: 600 },
    { id: 'ACWO-006', title: 'ACwO SoundBar 60W Bluetooth', price: 3499, inventory: 85 },
    { id: 'ACWO-007', title: 'ACwO Type-C Fast Charging Cable 2m', price: 299, inventory: 1200 },
    { id: 'ACWO-008', title: 'ACwO ANC Earbuds Pro Max', price: 2999, inventory: 95 },
    { id: 'ACWO-009', title: 'ACwO Portable Speaker Boom X', price: 1499, inventory: 210 },
    { id: 'ACWO-010', title: 'ACwO Gaming TWS G1', price: 1799, inventory: 130 },
    { id: 'ACWO-011', title: 'ACwO Magnetic Car Mount', price: 499, inventory: 340, deadStock: true },
    { id: 'ACWO-012', title: 'ACwO Wired Earphones Classic', price: 199, inventory: 800, deadStock: true },
];
const FIRST_NAMES = ['Aarav','Priya','Rohan','Ananya','Vikram','Meera','Arjun','Sneha','Karthik','Divya','Aditya','Neha','Rahul','Pooja','Suresh','Kavitha','Manish','Ritu','Deepak','Swati','Amit','Lakshmi','Rajesh','Sonal','Vishal','Anjali','Nikhil','Shruti','Gaurav','Pallavi','Sanjay','Nidhi','Ashish','Isha','Harsh','Tina','Mohit','Riya','Sumit','Komal'];
const LAST_NAMES = ['Sharma','Patel','Singh','Kumar','Gupta','Joshi','Mehta','Reddy','Nair','Iyer','Das','Verma','Chauhan','Mishra','Agarwal','Rao','Bhat','Saxena','Kapoor','Malhotra'];
const CITIES = [
    { city:'Mumbai', province:'Maharashtra', country:'India', zip:'400001', weight:20 },
    { city:'Delhi', province:'Delhi', country:'India', zip:'110001', weight:18 },
    { city:'Bangalore', province:'Karnataka', country:'India', zip:'560001', weight:15 },
    { city:'Hyderabad', province:'Telangana', country:'India', zip:'500001', weight:12 },
    { city:'Pune', province:'Maharashtra', country:'India', zip:'411001', weight:10 },
    { city:'Chennai', province:'Tamil Nadu', country:'India', zip:'600001', weight:8 },
    { city:'Ahmedabad', province:'Gujarat', country:'India', zip:'380001', weight:6 },
    { city:'Jaipur', province:'Rajasthan', country:'India', zip:'302001', weight:4 },
    { city:'Kolkata', province:'West Bengal', country:'India', zip:'700001', weight:4 },
    { city:'Lucknow', province:'Uttar Pradesh', country:'India', zip:'226001', weight:3 },
];
const VARIANT_POOL = ['Black','White','Blue','Green','Grey','Red','Navy','Matte Black','Rose Gold','Midnight Blue'];
function _rPick(a) { return a[Math.floor(Math.random()*a.length)]; }
function _rBetween(a,b) { return Math.floor(Math.random()*(b-a+1))+a; }
function _rDate(d) { return new Date(Date.now()-Math.random()*d*864e5); }
function _wCity() { const tw=CITIES.reduce((s,c)=>s+c.weight,0); let r=Math.random()*tw; for(const c of CITIES){r-=c.weight;if(r<=0)return c;} return CITIES[0]; }

router.post('/seed-demo', protect, async (req, res) => {
    try {
        const userId = req.user._id;
        let brand = await Brand.findOne({ user: userId, name: /acwo/i });
        if (!brand) {
            // Auto-create ACwO brand for this user
            brand = await Brand.create({
                user: userId,
                name: 'ACwO',
                description: 'ACwO — Next-gen audio & gadget brand. Premium earbuds, neckbands, smartwatches & accessories.',
                dna: {
                    industry: 'Consumer Electronics',
                    targetAudience: 'Gen Z & Millennials in India who want premium audio at accessible prices',
                    brandVoice: 'Bold, youthful, tech-forward',
                    brandValues: ['Innovation', 'Accessibility', 'Quality Sound'],
                    competitors: ['boAt', 'Noise', 'Realme', 'OnePlus'],
                    website: 'https://acwo.in',
                },
                status: 'active',
            });
            console.log(`🏷️ Created ACwO brand: ${brand._id}`);
        }
        const brandId = brand._id;

        // 1. Integration
        await Integration.findOneAndUpdate(
            { user: userId, brand: brandId, platform: 'shopify' },
            { user: userId, brand: brandId, platform: 'shopify', status: 'connected', accessToken: 'shpat_demo_token', platformData: { shopDomain: 'acwo-official.myshopify.com', shopName: 'ACwO Official Store' }, lastSyncAt: new Date(), syncCount: 1, displayName: 'ACwO Official Store', metadata: { _seedTag: SEED_TAG } },
            { upsert: true, returnDocument: 'after' }
        );

        // 2. Products
        for (const p of ACWO_PRODUCTS) {
            const v = _rPick(VARIANT_POOL);
            await Product.findOneAndUpdate(
                { brand: brandId, shopifyId: p.id },
                { user: userId, brand: brandId, source: 'shopify', shopifyId: p.id, title: p.title, description: `Premium ${p.title} by ACwO.`, price: { amount: p.price, currency: 'INR' }, images: [], variants: [{ title: v, price: p.price, inventoryQuantity: p.inventory, sku: p.id }, { title: 'Default Title', price: p.price, inventoryQuantity: Math.floor(p.inventory/3), sku: p.id+'-DEF' }], status: 'active', tags: ['acwo','electronics'], metadata: { _seedTag: SEED_TAG } },
                { upsert: true, returnDocument: 'after' }
            );
        }

        // 3. Customers
        const NUM_CUST = 85;
        const custIds = [];
        for (let i = 0; i < NUM_CUST; i++) {
            const fn = _rPick(FIRST_NAMES), ln = _rPick(LAST_NAMES), ct = _wCity();
            const oc = i < 8 ? _rBetween(4,12) : i < 25 ? _rBetween(2,4) : 1;
            const cid = `demo-cust-${i+1}`;
            await ShopifyCustomer.findOneAndUpdate(
                { brand: brandId, shopifyCustomerId: cid },
                { user: userId, brand: brandId, shopifyCustomerId: cid, email: `${fn.toLowerCase()}.${ln.toLowerCase()}${i}@gmail.com`, firstName: fn, lastName: ln, phone: `+91${_rBetween(7e9,1e10-1)}`, ordersCount: oc, totalSpent: oc * _rBetween(800,3000), currency: 'INR', defaultAddress: { city: ct.city, province: ct.province, country: ct.country, zip: ct.zip }, acceptsMarketing: Math.random()>0.35, state: 'enabled', tags: ['demo'], shopifyCreatedAt: _rDate(120), shopifyUpdatedAt: _rDate(30), syncedAt: new Date() },
                { upsert: true, returnDocument: 'after' }
            );
            custIds.push(cid);
        }

        // 4. Orders
        const sell = ACWO_PRODUCTS.filter(p => !p.deadStock);
        const NUM_ORD = 210;
        const bulkOps = [];
        for (let i = 0; i < NUM_ORD; i++) {
            const oDate = _rDate(60);
            const ci = _rBetween(0, NUM_CUST-1);
            const fn = FIRST_NAMES[ci % FIRST_NAMES.length], ln = LAST_NAMES[ci % LAST_NAMES.length];
            const ct = _wCity();
            const nItems = Math.random() > 0.7 ? _rBetween(2,3) : 1;
            const lineItems = [], used = new Set();
            for (let j = 0; j < nItems; j++) {
                let pr = _rPick(sell); while(used.has(pr.id)) pr = _rPick(sell); used.add(pr.id);
                const q = Math.random() > 0.85 ? 2 : 1;
                lineItems.push({ shopifyLineItemId: `li-${i}-${j}`, productId: pr.id, variantId: `${pr.id}-v1`, title: pr.title, variantTitle: _rPick(VARIANT_POOL), quantity: q, price: pr.price, sku: pr.id });
            }
            const sub = lineItems.reduce((s,l) => s + l.price * l.quantity, 0);
            const disc = Math.random() > 0.65 ? Math.round(sub * _rBetween(5,20)/100) : 0;
            let fs = 'paid'; if (Math.random()<0.04) fs='refunded'; else if (Math.random()<0.02) fs='partially_refunded';
            let ff = 'fulfilled'; if (oDate > new Date(Date.now()-3*864e5)) ff = Math.random()>0.5 ? null : 'fulfilled'; else if (Math.random()<0.08) ff = null;
            bulkOps.push({ updateOne: { filter: { brand: brandId, shopifyOrderId: `demo-order-${i+1}` }, update: { $set: { user: userId, brand: brandId, shopifyOrderId: `demo-order-${i+1}`, shopifyOrderNumber: `#ACW-${1001+i}`, totalPrice: sub-disc, subtotalPrice: sub, totalDiscounts: disc, currency: 'INR', financialStatus: fs, fulfillmentStatus: ff, customer: { shopifyCustomerId: custIds[ci], email: `${fn.toLowerCase()}.${ln.toLowerCase()}${ci}@gmail.com`, firstName: fn, lastName: ln, city: ct.city, province: ct.province, country: ct.country }, lineItems, shopifyCreatedAt: oDate, shopifyUpdatedAt: oDate, syncedAt: new Date(), rawData: { _seedTag: SEED_TAG } } }, upsert: true } });
        }
        await ShopifyOrder.bulkWrite(bulkOps);

        // Clear analytics cache
        Object.keys(analyticsCache).forEach(k => delete analyticsCache[k]);

        res.json({ success: true, message: `Seeded D2C demo: 12 products, 85 customers, 210 orders for ACwO.` });
    } catch (error) {
        console.error('Seed demo error:', error);
        res.status(500).json({ error: safeErrorMessage(error) });
    }
});

router.delete('/seed-demo', protect, async (req, res) => {
    try {
        const userId = req.user._id;
        const brand = await Brand.findOne({ user: userId, name: /acwo/i });
        if (!brand) return res.status(404).json({ error: 'ACwO brand not found.' });
        const brandId = brand._id;

        const intR = await Integration.deleteMany({ user: userId, brand: brandId, platform: 'shopify', 'metadata._seedTag': SEED_TAG });
        const ordR = await ShopifyOrder.deleteMany({ brand: brandId, 'rawData._seedTag': SEED_TAG });
        const custR = await ShopifyCustomer.deleteMany({ brand: brandId, shopifyCustomerId: /^demo-cust-/ });
        const prodR = await Product.deleteMany({ brand: brandId, source: 'shopify', 'metadata._seedTag': SEED_TAG });
        Object.keys(analyticsCache).forEach(k => delete analyticsCache[k]);

        res.json({ success: true, deleted: { integrations: intR.deletedCount, orders: ordR.deletedCount, customers: custR.deletedCount, products: prodR.deletedCount } });
    } catch (error) {
        console.error('Delete seed error:', error);
        res.status(500).json({ error: safeErrorMessage(error) });
    }
});

export default router;

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
function computeOrderAnalytics(orders) {
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

    // Daily revenue for chart (last 30 days)
    const dailyRevenue = [];
    for (let i = 29; i >= 0; i--) {
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
            severity: 'medium',
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
            severity: 'medium',
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

    // 1. Order Geo Radar — from shipping addresses
    const cityOrders = {}, stateOrders = {}, countryOrders = {};
    orders.forEach(o => {
        const addr = o.shipping_address || o.billing_address;
        if (!addr) return;
        if (addr.city) cityOrders[addr.city] = (cityOrders[addr.city] || 0) + 1;
        if (addr.province) stateOrders[addr.province] = (stateOrders[addr.province] || 0) + 1;
        if (addr.country) countryOrders[addr.country] = (countryOrders[addr.country] || 0) + 1;
    });
    const colors = ['#8b5cf6', '#06b6d4', '#34d399', '#f59e0b', '#f43f5e', '#ec4899', '#3b82f6', '#a855f7', '#fb923c', '#14b8a6'];
    const geoRadar = {
        cities: Object.entries(cityOrders).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, count], i) => ({ name, orders: count, pct: Math.round((count / orders.length) * 100), color: colors[i % colors.length] })),
        states: Object.entries(stateOrders).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, orders: count, pct: Math.round((count / orders.length) * 100) })),
        countries: Object.entries(countryOrders).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, orders: count, pct: Math.round((count / orders.length) * 100) })),
        totalLocations: Object.keys(cityOrders).length,
    };

    // 2. Product Velocity — WoW acceleration
    const thisWeek = orders.filter(o => (now - new Date(o.created_at).getTime()) < 7 * msDay);
    const lastWeek = orders.filter(o => { const age = now - new Date(o.created_at).getTime(); return age >= 7 * msDay && age < 14 * msDay; });
    const productThisWeek = {}, productLastWeek = {};
    thisWeek.forEach(o => (o.line_items || []).forEach(li => { const k = li.product_id || li.title; productThisWeek[k] = (productThisWeek[k] || { title: li.title, units: 0, revenue: 0 }); productThisWeek[k].units += li.quantity || 1; productThisWeek[k].revenue += parseFloat(li.price || 0) * (li.quantity || 1); }));
    lastWeek.forEach(o => (o.line_items || []).forEach(li => { const k = li.product_id || li.title; productLastWeek[k] = (productLastWeek[k] || { title: li.title, units: 0 }); productLastWeek[k].units += li.quantity || 1; }));
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
        const [orders, products, customers] = await Promise.all([
            ShopifyOrder.find({ ...brandFilter, shopifyCreatedAt: { $gte: dateLimit } }).lean(),
            Product.find({ ...brandFilter, source: 'shopify' }).lean(),
            ShopifyCustomer.find(brandFilter).lean(),
        ]);

        const orderAnalytics = computeOrderAnalytics(orders);
        const customerAnalytics = computeCustomerAnalytics(customers, orders);
        const productHealth = computeProductHealth(orderAnalytics.topProducts, products);
        const redFlags = computeRedFlags(orderAnalytics, products, customerAnalytics);
        const advanced = computeAdvancedAnalytics(orders, products);

        let shopInfo = null;
        try { shopInfo = await getShopInfo(accessToken, shopDomain); } catch { /* ok */ }

        const result = {
            connected: true,
            shop: {
                name: shopInfo?.name || integration.platformData.shopName || shopDomain,
                domain: shopDomain,
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
            shopName: integration.platformData.shopName || shopDomain,
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

        if (!isGrokAvailable()) {
            // Smart fallback
            const insights = {
                summary: `Your ${overview.shop?.name || 'store'} has generated ₹${overview.kpis?.totalRevenue?.toLocaleString()} from ${overview.kpis?.totalOrders} orders.`,
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
            if (overview.kpis?.refundRate > 5) {
                insights.whatsNot.push({ title: `Refund rate is ${overview.kpis.refundRate}%`, desc: 'Review product quality, sizing guides, and delivery experience.', icon: 'warning' });
            }
            if (overview.kpis?.repeatRate < 20) {
                insights.whatsNot.push({ title: `Only ${overview.kpis.repeatRate}% repeat customers`, desc: 'Launch loyalty programs and post-purchase email sequences.', icon: 'person_off' });
            }

            const boostable = (overview.productHealth || []).filter(p => p.needsBoost);
            if (boostable.length > 0) {
                insights.actionPlan.push({ title: `Boost ${boostable.length} underperforming products`, desc: `Products like "${boostable[0].title}" have potential but need performance marketing. Run targeted ad campaigns.`, priority: 'high', icon: 'rocket_launch' });
            }
            insights.actionPlan.push({ title: 'Run a this-week flash sale', desc: `Your AOV is ₹${overview.kpis?.avgOrderValue?.toLocaleString()}. Create bundles above this to increase order value.`, priority: 'medium', icon: 'sell' });
            insights.actionPlan.push({ title: 'Email dormant customers', desc: `${overview.customerAnalytics?.totalCustomers - overview.customerAnalytics?.newCustomers} existing customers haven't ordered recently. Send a win-back campaign.`, priority: 'medium', icon: 'email' });

            return res.json({ insights });
        }

        const parsed = await callGrok(
            `You are a D2C e-commerce strategist AI. Analyze the store data and provide actionable insights.

Respond in JSON:
{
  "summary": "One-paragraph executive summary of the store's health",
  "whatsWorking": [{ "title": "...", "desc": "...", "icon": "material_icon" }],
  "whatsNot": [{ "title": "...", "desc": "...", "icon": "material_icon" }],
  "actionPlan": [{ "title": "...", "desc": "2-3 sentence specific recommendation", "priority": "high|medium|low", "icon": "material_icon" }]
}

Be specific — reference product names, actual numbers, and percentages from the data.`,
            `Brand: ${brand?.name || overview.shop?.name || 'Unknown'}
Industry: ${brand?.dna?.industry || 'D2C'}
KPIs: Revenue ₹${overview.kpis?.totalRevenue}, Orders: ${overview.kpis?.totalOrders}, AOV: ₹${overview.kpis?.avgOrderValue}, Growth: ${overview.kpis?.revenueGrowth}%, Repeat: ${overview.kpis?.repeatRate}%, Refund: ${overview.kpis?.refundRate}%
Top Products: ${JSON.stringify(overview.productHealth?.slice(0, 5).map(p => ({ title: p.title, revenue: p.revenue, units: p.unitsSold, health: p.healthScore, needsBoost: p.needsBoost })))}
Red Flags: ${JSON.stringify(overview.redFlags?.map(f => f.title))}
Customers: Total ${overview.customerAnalytics?.totalCustomers}, New: ${overview.customerAnalytics?.newCustomers}, Top Cities: ${JSON.stringify(overview.customerAnalytics?.topCities?.slice(0, 3))}`,
            2000
        );

        res.json({ insights: parsed });
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
            `You are a D2C performance marketing strategist. Create a growth /boost campaign plan for the product.

Respond in JSON:
{
  "product": "product name",
  "status": "health status",
  "campaigns": [{ "channel": "Meta Ads|Google Ads|Instagram Reels", "type": "campaign type", "budget": "daily budget range in INR", "targeting": "targeting strategy", "creative": "creative direction", "expectedROAS": "expected return" }],
  "estimatedImpact": { "additionalSales": "units/week", "additionalRevenue": "INR/week" },
  "quickWins": ["action1", "action2", "action3"]
}`,
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

        const [orders, customers] = await Promise.all([
            fetchShopifyOrders(integration.accessToken, integration.platformData.shopDomain, { days: 365 }).catch(() => []),
            fetchShopifyCustomers(integration.accessToken, integration.platformData.shopDomain).catch(() => []),
        ]);

        // Build customer first-purchase date map
        const customerFirstOrder = {};
        orders.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        orders.forEach(o => {
            const cId = o.customer?.id || o.email;
            if (cId && !customerFirstOrder[cId]) {
                customerFirstOrder[cId] = new Date(o.created_at);
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
                    const cId = o.customer?.id || o.email;
                    const oDate = new Date(o.created_at);
                    if (cohortCustomers.includes(cId) && oDate >= retStart && oDate <= retEnd) {
                        activeInMonth.add(cId);
                        monthRevenue += parseFloat(o.total_price || 0);
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
            const cId = o.customer?.id || o.email;
            if (!cId) return;
            if (!allCustomerLTV[cId]) allCustomerLTV[cId] = 0;
            allCustomerLTV[cId] += parseFloat(o.total_price || 0);
        });
        const ltvValues = Object.values(allCustomerLTV).sort((a, b) => b - a);
        const avgLTV = ltvValues.length > 0 ? Math.round(ltvValues.reduce((s, v) => s + v, 0) / ltvValues.length) : 0;
        const medianLTV = ltvValues.length > 0 ? Math.round(ltvValues[Math.floor(ltvValues.length / 2)]) : 0;
        const top10PctLTV = ltvValues.length > 10 ? Math.round(ltvValues.slice(0, Math.ceil(ltvValues.length * 0.1)).reduce((s, v) => s + v, 0) / Math.ceil(ltvValues.length * 0.1)) : avgLTV;

        // New vs returning revenue
        let newRevenue = 0, returningRevenue = 0;
        const cOrderCount = {};
        orders.forEach(o => {
            const cId = o.customer?.id || o.email;
            if (!cId) return;
            cOrderCount[cId] = (cOrderCount[cId] || 0) + 1;
            if (cOrderCount[cId] === 1) newRevenue += parseFloat(o.total_price || 0);
            else returningRevenue += parseFloat(o.total_price || 0);
        });

        // Churn: customers who ordered >60 days ago but not in last 30
        const msDay = 24 * 60 * 60 * 1000;
        const activeRecently = new Set();
        const wasPreviouslyActive = new Set();
        orders.forEach(o => {
            const cId = o.customer?.id || o.email;
            const age = Date.now() - new Date(o.created_at).getTime();
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

        const [orders, products] = await Promise.all([
            fetchShopifyOrders(integration.accessToken, integration.platformData.shopDomain, { days: parseInt(days) }).catch(() => []),
            fetchShopifyProducts(integration.accessToken, integration.platformData.shopDomain).catch(() => []),
        ]);

        // Revenue
        const totalRevenue = orders.reduce((s, o) => s + parseFloat(o.total_price || 0), 0);
        const totalDiscounts = orders.reduce((s, o) => s + parseFloat(o.total_discounts || 0), 0);
        const totalTax = orders.reduce((s, o) => s + parseFloat(o.total_tax || 0), 0);
        const totalShipping = orders.reduce((s, o) => s + (o.shipping_lines || []).reduce((ss, sl) => ss + parseFloat(sl.price || 0), 0), 0);

        // COGS estimate (cost = comparing variant price to compare_at_price, or 40% margin as default)
        let estimatedCOGS = 0;
        const productCostMap = {};
        products.forEach(p => {
            (p.variants || []).forEach(v => {
                const price = parseFloat(v.price || 0);
                const cost = v.compare_at_price ? price - (parseFloat(v.compare_at_price) - price) : price * 0.6; // 60% of selling price if no compare
                productCostMap[String(v.id)] = Math.max(0, price - cost);
            });
        });
        orders.forEach(o => {
            (o.line_items || []).forEach(item => {
                const margin = productCostMap[String(item.variant_id)];
                const qty = item.quantity || 1;
                const revenue = parseFloat(item.price || 0) * qty;
                estimatedCOGS += margin !== undefined ? revenue - (margin * qty) : revenue * 0.6;
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

        // Per-product profitability
        const productProfitMap = {};
        orders.forEach(o => {
            (o.line_items || []).forEach(item => {
                const key = item.product_id || item.title;
                if (!productProfitMap[key]) productProfitMap[key] = { title: item.title, revenue: 0, estimatedCost: 0, units: 0 };
                const qty = item.quantity || 1;
                const rev = parseFloat(item.price || 0) * qty;
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
            `You are an AI co-pilot for D2C e-commerce brands, similar to Triple Whale's Moby AI. Answer questions using the store's data.

Rules:
- Be specific: use actual product names, numbers, and percentages
- Be actionable: every answer should include a recommendation
- Be concise: 3-5 sentences max
- Reference data sources when citing numbers

Respond in JSON:
{
  "answer": "Your concise, actionable answer",
  "sources": ["list of data sources used like 'Orders Data', 'Product Health', 'Customer Analytics'"],
  "actions": ["optional list of specific actions the user should take"]
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

export default router;

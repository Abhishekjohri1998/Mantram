/**
 * Shared Analytics Engine
 * Computes D2C KPIs from order/product/customer data.
 * Used by Shopify, Etsy, and WooCommerce analytics routes.
 * All functions are platform-agnostic — they operate on normalised DB models.
 */

export function computeOrderAnalytics(orders, chartDays = 30) {
    const totalOrders = orders.length;
    const now = Date.now();
    const msDay = 86400000;

    const totalRevenue = orders.reduce((s, o) => s + (o.totalPrice || 0), 0);
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    const thisWeekOrders = orders.filter(o => (now - new Date(o.shopifyCreatedAt || o.createdAt).getTime()) < 7 * msDay);
    const lastWeekOrders = orders.filter(o => {
        const age = now - new Date(o.shopifyCreatedAt || o.createdAt).getTime();
        return age >= 7 * msDay && age < 14 * msDay;
    });
    const thisWeekRevenue = thisWeekOrders.reduce((s, o) => s + (o.totalPrice || 0), 0);
    const lastWeekRevenue = lastWeekOrders.reduce((s, o) => s + (o.totalPrice || 0), 0);
    const revenueGrowth = lastWeekRevenue > 0 ? Math.round(((thisWeekRevenue - lastWeekRevenue) / lastWeekRevenue) * 100) : 0;

    const numDays = Math.min(chartDays, 90);
    const dailyRevenue = [];
    for (let i = numDays - 1; i >= 0; i--) {
        const dayStart = new Date(now - i * msDay);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart.getTime() + msDay);
        const dayOrders = orders.filter(o => {
            const t = new Date(o.shopifyCreatedAt || o.createdAt).getTime();
            return t >= dayStart.getTime() && t < dayEnd.getTime();
        });
        dailyRevenue.push({
            date: dayStart.toISOString().split('T')[0],
            revenue: dayOrders.reduce((s, o) => s + (o.totalPrice || 0), 0),
            orders: dayOrders.length,
        });
    }

    const productMap = {};
    orders.forEach(order => {
        (order.lineItems || []).forEach(item => {
            const key = item.productId || item.title;
            if (!productMap[key]) {
                productMap[key] = { productId: item.productId, title: item.title, unitsSold: 0, revenue: 0, orderCount: 0 };
            }
            productMap[key].unitsSold += item.quantity || 1;
            productMap[key].revenue += (item.price || 0) * (item.quantity || 1);
            productMap[key].orderCount++;
        });
    });
    const topProducts = Object.values(productMap).sort((a, b) => b.revenue - a.revenue).slice(0, 50);

    const fulfilled = orders.filter(o => o.fulfillmentStatus === 'fulfilled').length;
    const unfulfilled = orders.filter(o => !o.fulfillmentStatus || o.fulfillmentStatus === null).length;
    const refunded = orders.filter(o => o.financialStatus === 'refunded' || o.financialStatus === 'partially_refunded').length;
    const refundRate = totalOrders > 0 ? Math.round((refunded / totalOrders) * 100) : 0;
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

export function computeCustomerAnalytics(customers, orders) {
    const totalCustomers = customers.length;
    const now = Date.now();
    const msDay = 86400000;
    const newCustomers = customers.filter(c => (now - new Date(c.shopifyCreatedAt || c.createdAt).getTime()) < 30 * msDay).length;
    const returningCustomers = customers.filter(c => (c.ordersCount || 0) > 1).length;

    const cityMap = {}, countryMap = {};
    customers.forEach(c => {
        const addr = c.defaultAddress;
        if (addr?.city) cityMap[addr.city] = (cityMap[addr.city] || 0) + 1;
        if (addr?.country) countryMap[addr.country] = (countryMap[addr.country] || 0) + 1;
    });
    const topCities = Object.entries(cityMap).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count, pct: Math.round((count / (totalCustomers || 1)) * 100) }));
    const topCountries = Object.entries(countryMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count, pct: Math.round((count / (totalCustomers || 1)) * 100) }));
    const marketingConsent = customers.filter(c => c.acceptsMarketing).length;
    const avgOrderValue = orders.length > 0 ? orders.reduce((s, o) => s + (o.totalPrice || 0), 0) / orders.length : 0;

    return {
        totalCustomers,
        newCustomers,
        returningCustomers,
        repeatRate: totalCustomers > 0 ? Math.round((returningCustomers / totalCustomers) * 100) : 0,
        topCities,
        topCountries,
        marketingConsent,
        avgLTV: Math.round(avgOrderValue * (totalCustomers > 0 ? customers.reduce((s, c) => s + (c.ordersCount || 0), 0) / totalCustomers : 1) * 100) / 100,
    };
}

export function computeRedFlags(orderAnalytics, products, customerAnalytics) {
    const flags = [];
    const soldProductIds = new Set(orderAnalytics.topProducts.map(p => String(p.productId)));
    const deadStock = products.filter(p => {
        const totalInventory = (p.variants || []).reduce((s, v) => s + (v.inventoryQuantity || 0), 0);
        return totalInventory > 0 && !soldProductIds.has(String(p.shopifyId || p._id));
    });
    if (deadStock.length > 0) {
        flags.push({ type: 'dead_stock', severity: 'high', title: `${deadStock.length} Dead Stock Products`, desc: `${deadStock.length} product(s) have inventory sitting idle with zero sales in the last 60 days.`, icon: 'inventory', action: 'Run clearance campaigns or bundle these with top sellers.' });
    }
    if (orderAnalytics.refundRate > 10) {
        flags.push({ type: 'high_refunds', severity: 'high', title: `Refund Rate at ${orderAnalytics.refundRate}%`, desc: `${orderAnalytics.refunded} out of ${orderAnalytics.totalOrders} orders have been refunded.`, icon: 'receipt_long', action: 'Review product descriptions for accuracy; check packaging and delivery quality.' });
    }
    if (orderAnalytics.revenueGrowth < -15) {
        flags.push({ type: 'revenue_decline', severity: 'high', title: `Revenue Down ${Math.abs(orderAnalytics.revenueGrowth)}% Week-over-Week`, desc: `This week's revenue is significantly lower than last week.`, icon: 'trending_down', action: 'Launch a flash sale, email campaign, or push top-selling products on social.' });
    }
    if (customerAnalytics.repeatRate < 15 && customerAnalytics.totalCustomers > 20) {
        flags.push({ type: 'low_repeat', severity: 'warning', title: `Only ${customerAnalytics.repeatRate}% Repeat Customers`, desc: `Most customers aren't coming back.`, icon: 'person_off', action: 'Set up automated post-purchase follow-ups and loyalty rewards.' });
    }
    return flags;
}

export function computeProductHealth(topProducts, allProducts) {
    const maxRevenue = topProducts[0]?.revenue || 1;
    return topProducts.map(p => {
        const salesScore = Math.min(100, (p.revenue / maxRevenue) * 100);
        const velocityScore = Math.min(100, p.unitsSold * 5);
        const product = allProducts.find(sp => String(sp.shopifyId || sp._id) === String(p.productId));
        const totalInventory = product ? (product.variants || []).reduce((s, v) => s + (v.inventoryQuantity || 0), 0) : 0;
        const inventoryHealth = totalInventory > 0 ? Math.min(100, (p.unitsSold / totalInventory) * 50) : 50;
        const overallScore = Math.round((salesScore * 0.5) + (velocityScore * 0.3) + (inventoryHealth * 0.2));
        return {
            ...p,
            inventory: totalInventory,
            image: product?.images?.[0]?.url || null,
            healthScore: overallScore,
            healthBadge: overallScore >= 70 ? 'hot' : overallScore >= 40 ? 'warm' : 'cold',
            needsBoost: overallScore >= 30 && overallScore < 60 && totalInventory > 5,
        };
    });
}

export function computeAdvancedAnalytics(orders, products) {
    const now = Date.now();
    const msDay = 86400000;
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
    };

    const thisWeek = orders.filter(o => (now - new Date(o.shopifyCreatedAt || o.createdAt).getTime()) < 7 * msDay);
    const lastWeek = orders.filter(o => { const age = now - new Date(o.shopifyCreatedAt || o.createdAt).getTime(); return age >= 7 * msDay && age < 14 * msDay; });
    const productThisWeek = {}, productLastWeek = {};
    thisWeek.forEach(o => (o.lineItems || []).forEach(li => { const k = li.productId || li.title; if (!productThisWeek[k]) productThisWeek[k] = { title: li.title, units: 0, revenue: 0 }; productThisWeek[k].units += li.quantity || 1; productThisWeek[k].revenue += parseFloat(li.price || 0) * (li.quantity || 1); }));
    lastWeek.forEach(o => (o.lineItems || []).forEach(li => { const k = li.productId || li.title; if (!productLastWeek[k]) productLastWeek[k] = { title: li.title, units: 0 }; productLastWeek[k].units += li.quantity || 1; }));
    const allKeys = new Set([...Object.keys(productThisWeek), ...Object.keys(productLastWeek)]);
    const productVelocity = [];
    allKeys.forEach(k => {
        const tw = productThisWeek[k] || { title: productLastWeek[k]?.title || 'Unknown', units: 0, revenue: 0 };
        const lw = productLastWeek[k] || { units: 0 };
        const change = lw.units > 0 ? Math.round(((tw.units - lw.units) / lw.units) * 100) : (tw.units > 0 ? 100 : 0);
        if (tw.units > 0 || lw.units > 0) productVelocity.push({ productId: k, title: tw.title, thisWeekUnits: tw.units, lastWeekUnits: lw.units, change, status: change > 20 ? 'accelerating' : change < -20 ? 'decelerating' : 'stable' });
    });
    productVelocity.sort((a, b) => b.change - a.change);

    const soldIds = new Set();
    orders.forEach(o => (o.lineItems || []).forEach(li => { if (li.productId) soldIds.add(String(li.productId)); }));
    const abandonmentSignals = products
        .filter(p => { const inv = (p.variants || []).reduce((s, v) => s + (v.inventoryQuantity || 0), 0); return inv > 0 && !soldIds.has(String(p.shopifyId || p._id)); })
        .map(p => { const inv = (p.variants || []).reduce((s, v) => s + (v.inventoryQuantity || 0), 0); const price = p.variants?.[0]?.price || 0; return { title: p.title, inventory: inv, price, stuckValue: Math.round(inv * price) }; })
        .sort((a, b) => b.stuckValue - a.stuckValue).slice(0, 10);

    return { geoRadar, productVelocity, abandonmentSignals };
}

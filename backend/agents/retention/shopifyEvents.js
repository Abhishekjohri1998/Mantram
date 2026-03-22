/**
 * Retention Studio — Shopify Event Handlers
 * 
 * Handles Shopify webhook events for retention workflows:
 * - Abandoned checkout detection → triggers cart recovery flow
 * - Product inventory changes → triggers back-in-stock alerts
 * - Order completion → triggers post-purchase flow
 * 
 * These hook into the existing Shopify webhook infrastructure.
 */

import RetentionCampaign from '../../models/RetentionCampaign.js';
import Contact from '../../models/Contact.js';
import Product from '../../models/Product.js';
import ShopifyCustomer from '../../models/ShopifyCustomer.js';

// ═══════════════════════════════════════════════════════════════
//  ABANDONED CHECKOUT HANDLER
// ═══════════════════════════════════════════════════════════════

/**
 * Process a Shopify abandoned checkout webhook payload.
 * Creates a retention event record for cart recovery campaigns.
 */
export async function handleAbandonedCheckout(checkoutData, integration) {
    try {
        const email = checkoutData.email;
        if (!email) return { skipped: true, reason: 'No email on checkout' };

        const brandId = integration.brand;
        const userId = integration.user;

        // Check opt-out / marketing consent
        if (checkoutData.buyer_accepts_marketing === false) {
            return { skipped: true, reason: 'Customer does not accept marketing' };
        }

        // Build cart items from line_items
        const items = (checkoutData.line_items || []).map(item => ({
            productId: String(item.product_id),
            variantId: String(item.variant_id),
            title: item.title,
            variantTitle: item.variant_title,
            price: parseFloat(item.price),
            quantity: item.quantity,
            image: item.image?.src || '',
            sku: item.sku || '',
        }));

        const cartTotal = items.reduce((sum, i) => sum + (i.price * i.quantity), 0);

        // Create or update retention event
        const event = {
            type: 'abandoned_checkout',
            shopifyCheckoutId: String(checkoutData.id),
            shopifyCheckoutToken: checkoutData.token,
            email,
            customerName: `${checkoutData.billing_address?.first_name || ''} ${checkoutData.billing_address?.last_name || ''}`.trim(),
            phone: checkoutData.phone || checkoutData.billing_address?.phone || '',
            items,
            cartTotal,
            currency: checkoutData.currency || 'INR',
            abandonedUrl: checkoutData.abandoned_checkout_url || '',
            abandonedAt: checkoutData.updated_at || new Date(),
            brand: brandId,
            user: userId,
            processed: false,
        };

        console.log(`🛒 Abandoned checkout: ${email} — ${items.length} items, ₹${cartTotal}`);

        return { success: true, event };
    } catch (err) {
        console.error('[Retention] Abandoned checkout handler error:', err);
        return { error: err.message };
    }
}


// ═══════════════════════════════════════════════════════════════
//  BACK-IN-STOCK HANDLER
// ═══════════════════════════════════════════════════════════════

/**
 * Check if a product was previously out of stock and is now back.
 * Triggered by products-update webhook.
 */
export async function handleProductInventoryChange(productData, integration) {
    try {
        const brandId = integration.brand;
        const shopifyId = String(productData.id);

        // Get the existing product to compare inventory
        const existing = await Product.findOne({
            brand: brandId,
            shopifyId,
        }).lean();

        if (!existing) return { skipped: true, reason: 'Product not in our catalog' };

        const notifications = [];

        for (const variant of (productData.variants || [])) {
            const existingVariant = (existing.variants || []).find(
                v => v.shopifyVariantId === String(variant.id)
            );

            // Was 0 or null, now > 0 = BACK IN STOCK
            const wasOutOfStock = !existingVariant || (existingVariant.inventoryQuantity || 0) === 0;
            const isNowInStock = (variant.inventory_quantity || 0) > 0;

            if (wasOutOfStock && isNowInStock) {
                notifications.push({
                    type: 'back_in_stock',
                    productId: existing._id,
                    shopifyId,
                    productTitle: productData.title,
                    variantTitle: variant.title,
                    variantId: String(variant.id),
                    price: parseFloat(variant.price),
                    compareAtPrice: variant.compare_at_price ? parseFloat(variant.compare_at_price) : null,
                    inventoryQuantity: variant.inventory_quantity,
                    image: productData.images?.[0]?.src || '',
                    brand: brandId,
                    user: integration.user,
                });
            }
        }

        if (notifications.length > 0) {
            console.log(`🔔 Back in stock: ${productData.title} — ${notifications.length} variant(s)`);
        }

        return { success: true, notifications, total: notifications.length };
    } catch (err) {
        console.error('[Retention] Inventory change handler error:', err);
        return { error: err.message };
    }
}


// ═══════════════════════════════════════════════════════════════
//  POST-PURCHASE EVENT HANDLER
// ═══════════════════════════════════════════════════════════════

/**
 * Process a completed order for post-purchase follow-up.
 * Triggered by orders-create webhook — only processes paid orders.
 */
export async function handleOrderForRetention(orderData, integration) {
    try {
        if (orderData.financial_status !== 'paid') {
            return { skipped: true, reason: 'Order not yet paid' };
        }

        const email = orderData.email || orderData.customer?.email;
        if (!email) return { skipped: true, reason: 'No email on order' };

        const event = {
            type: 'post_purchase',
            shopifyOrderId: String(orderData.id),
            orderNumber: orderData.order_number,
            email,
            customerName: `${orderData.customer?.first_name || ''} ${orderData.customer?.last_name || ''}`.trim(),
            orderTotal: parseFloat(orderData.total_price),
            currency: orderData.currency || 'INR',
            items: (orderData.line_items || []).map(li => ({
                productId: String(li.product_id),
                title: li.title,
                price: parseFloat(li.price),
                quantity: li.quantity,
            })),
            brand: integration.brand,
            user: integration.user,
            orderedAt: orderData.created_at,
        };

        console.log(`📦 Post-purchase event: ${email} — Order #${orderData.order_number}`);
        return { success: true, event };
    } catch (err) {
        console.error('[Retention] Post-purchase handler error:', err);
        return { error: err.message };
    }
}

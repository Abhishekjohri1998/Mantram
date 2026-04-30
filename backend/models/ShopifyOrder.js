import mongoose from 'mongoose';

const shopifyOrderSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true },

    // Shopify Specific IDs
    shopifyOrderId: { type: String, required: true, index: true },
    shopifyOrderNumber: { type: String },

    // Order Details
    totalPrice: { type: Number, default: 0 },
    subtotalPrice: { type: Number, default: 0 },
    totalDiscounts: { type: Number, default: 0 },
    currency: { type: String, default: 'INR' },

    // Statuses
    financialStatus: { type: String }, // paid, partially_paid, voided, etc.
    fulfillmentStatus: { type: String }, // fulfilled, null, partial, etc.

    // Customer info (summary)
    customer: {
        shopifyCustomerId: String,
        email: String,
        firstName: String,
        lastName: String,
        city: String,
        province: String,
        country: String
    },

    // Line items (simplified for analytics)
    lineItems: [{
        shopifyLineItemId: String,
        productId: String,
        variantId: String,
        title: String,
        quantity: Number,
        price: Number,
        sku: String
    }],

    // Raw data for future debugging or extra fields
    rawData: { type: mongoose.Schema.Types.Mixed },

    // Platform source — distinguishes Shopify, Etsy, WooCommerce orders
    source: { type: String, enum: ['shopify', 'etsy', 'woocommerce'], default: 'shopify', index: true },

    // Dates
    shopifyCreatedAt: { type: Date },
    shopifyUpdatedAt: { type: Date },
    syncedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Indexes for common analytics queries
shopifyOrderSchema.index({ brand: 1, shopifyCreatedAt: -1 });
shopifyOrderSchema.index({ brand: 1, financialStatus: 1 });
shopifyOrderSchema.index({ brand: 1, 'customer.shopifyCustomerId': 1 });

// compound index for upserting during sync/webhooks
shopifyOrderSchema.index({ brand: 1, shopifyOrderId: 1 }, { unique: true });
shopifyOrderSchema.index({ brand: 1, source: 1, shopifyCreatedAt: -1 });

export default mongoose.model('ShopifyOrder', shopifyOrderSchema);

import mongoose from 'mongoose';

const shopifyCustomerSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true },

    // Shopify Specific
    shopifyCustomerId: { type: String, required: true, index: true },

    // Core info
    email: { type: String, lowercase: true, trim: true },
    firstName: { type: String },
    lastName: { type: String },
    phone: { type: String },

    // Stats
    ordersCount: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    currency: { type: String, default: 'INR' },

    // Address (Last known/Default)
    defaultAddress: {
        city: String,
        province: String,
        country: String,
        zip: String
    },

    // Marketing
    acceptsMarketing: { type: Boolean, default: false },
    marketingConsent: { type: mongoose.Schema.Types.Mixed },

    // Platform source — distinguishes Shopify, Etsy, WooCommerce customers
    source: { type: String, enum: ['shopify', 'etsy', 'woocommerce'], default: 'shopify', index: true },

    // Metadata
    tags: [String],
    state: { type: String }, // enabled, disabled, invited, declined
    shopifyCreatedAt: { type: Date },
    shopifyUpdatedAt: { type: Date },
    syncedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Indexes for analytics
shopifyCustomerSchema.index({ brand: 1, email: 1 });
shopifyCustomerSchema.index({ brand: 1, totalSpent: -1 });
shopifyCustomerSchema.index({ brand: 1, ordersCount: -1 });

// compound index for upserting
shopifyCustomerSchema.index({ brand: 1, shopifyCustomerId: 1 }, { unique: true });
shopifyCustomerSchema.index({ brand: 1, source: 1 });

export default mongoose.model('ShopifyCustomer', shopifyCustomerSchema);

import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true },

    // Core fields
    type: { type: String, enum: ['product', 'service'], default: 'product' },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    shortDescription: { type: String, default: '' },  // AI-friendly 1-liner
    handle: { type: String, default: '' },
    vendor: { type: String, default: '' },
    productType: { type: String, default: '' },
    tags: [String],
    status: { type: String, enum: ['active', 'draft', 'archived'], default: 'active' },

    // Features & Specs (for AI content generation)
    features: [String],                                // Key selling points / USPs
    specifications: { type: mongoose.Schema.Types.Mixed, default: {} }, // Flexible specs

    // Images — URL-only, never downloaded to our server
    images: [{
        url: { type: String },
        alt: { type: String, default: '' },
        position: { type: Number, default: 0 },
    }],

    // Pricing — unified at product level
    price: {
        amount: { type: Number, default: 0 },
        currency: { type: String, default: 'INR' },
        mrp: { type: Number },                        // Max retail / compare-at price
    },

    // Variants (sizes, colors, etc.)
    variants: [{
        shopifyVariantId: String,
        title: { type: String, default: 'Default' },
        price: { type: Number, default: 0 },
        compareAtPrice: { type: Number },
        sku: { type: String, default: '' },
        inventoryQuantity: { type: Number, default: 0 },
        weight: Number,
        weightUnit: String,
    }],

    // E-commerce platform listings — links to existing listings
    platformListings: [{
        platform: { type: String },    // amazon, flipkart, myntra, shopify, etc.
        url: { type: String },
        listingId: { type: String },
    }],

    // Categorization for AI matching
    category: { type: String, default: '' },       // e.g. "Electronics", "Fashion"
    subCategory: { type: String, default: '' },     // e.g. "Earphones", "Dresses"
    targetGender: { type: String, enum: ['all', 'male', 'female', 'unisex', ''], default: '' },
    ageGroup: { type: String, default: '' },         // e.g. "adults", "kids", "teens"
    occasions: [String],                             // AI-detected: ["gifting", "womens-day", "diwali"]
    keywords: [String],                              // AI-extracted product keywords

    // Shopify-specific
    shopifyId: { type: String, index: true },
    shopifyUpdatedAt: { type: Date },

    // Metadata
    source: { type: String, enum: ['shopify', 'shopify_public', 'manual', 'woocommerce', 'website_scan', 'csv_import'], default: 'manual' },
    aiEnriched: { type: Boolean, default: false },
    syncedAt: { type: Date, default: Date.now },
}, { timestamps: true });

// Text search index for AI product matching
productSchema.index({ title: 'text', description: 'text', tags: 'text', keywords: 'text' });
productSchema.index({ brand: 1, status: 1 });
productSchema.index({ brand: 1, productType: 1 });

export default mongoose.model('Product', productSchema);

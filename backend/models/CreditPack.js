import mongoose from 'mongoose';

/**
 * CreditPack — admin-managed credit top-up packs.
 * 
 * Super admin can create, edit, discount, enable/disable, and run
 * time-limited promos. Replaces the old hardcoded TOPUP_PACKS constant.
 * 
 * Inspired by Kling's tiered store:
 *   - 8 standard tiers with volume discounts
 *   - Flash sale badges on higher packs
 *   - Promo section with time-limited % discounts
 *   - Per-100-credits pricing display
 */
const creditPackSchema = new mongoose.Schema({
    // ── Identity ──
    name:     { type: String, required: true, trim: true },        // "⚡ Spark"
    slug:     { type: String, required: true, unique: true, lowercase: true }, // "spark"

    // ── Credit allocation ──
    credits:      { type: Number, required: true },   // Base credits (e.g. 150)
    bonusCredits: { type: Number, default: 0 },        // Bonus on top (e.g. +15)
    // Total a user gets = credits + bonusCredits

    // ── Pricing ──
    price:    { type: Number, required: true },         // In smallest unit: 899 (₹)
    currency: { type: String, default: 'INR' },
    validityDays: { type: Number, default: 180 },       // How long credits last

    // ── Display ──
    icon:       { type: String, default: 'bolt' },       // Material icon name
    badge:      { type: String, default: '' },            // "Flash Sale", "Best Value", "Popular", ""
    badgeColor: { type: String, default: '#f59e0b' },     // Badge bg color
    description: { type: String, default: '' },           // Short description
    color:      { type: String, default: '#f59e0b' },     // Card accent color (gradient)

    // ── Promo features (Kling-style) ──
    isPromo:           { type: Boolean, default: false },  // Shows in promo section
    promoDiscount:     { type: Number, default: 0 },       // % discount (e.g. 33)
    promoOriginalPrice:{ type: Number, default: 0 },       // Strike-through price
    promoExpiresAt:    { type: Date, default: null },      // null = no expiry
    promoLabel:        { type: String, default: '' },      // "33% off limited time"

    // ── Admin controls ──
    isActive:   { type: Boolean, default: true },
    isFirstPurchaseEligible: { type: Boolean, default: true }, // 2× on first purchase
    displayOrder: { type: Number, default: 0 },             // Sort order in store
    minPlanRequired: { type: String, default: null },        // null = any, "professional", etc.
    maxPerUser: { type: Number, default: 0 },                // 0 = unlimited per user

    // ── Stats (auto-updated) ──
    purchaseCount: { type: Number, default: 0 },
    totalRevenue:  { type: Number, default: 0 },

    // ── Metadata ──
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Indexes for efficient querying
creditPackSchema.index({ isActive: 1, displayOrder: 1 });
creditPackSchema.index({ isPromo: 1, promoExpiresAt: 1 });

// Virtual: total credits user receives
creditPackSchema.virtual('totalCredits').get(function () {
    return this.credits + this.bonusCredits;
});

// Virtual: effective price per credit
creditPackSchema.virtual('perCredit').get(function () {
    const total = this.credits + this.bonusCredits;
    return total > 0 ? parseFloat((this.price / total).toFixed(2)) : 0;
});

// Virtual: is promo still valid?
creditPackSchema.virtual('promoActive').get(function () {
    if (!this.isPromo) return false;
    if (!this.promoExpiresAt) return true; // No expiry = always active
    return new Date(this.promoExpiresAt) > new Date();
});

creditPackSchema.set('toJSON', { virtuals: true });
creditPackSchema.set('toObject', { virtuals: true });

export default mongoose.model('CreditPack', creditPackSchema);

import mongoose from 'mongoose';

const subscriptionSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    plan: { type: String, required: true },
    billingCycle: { type: String, enum: ['monthly', 'quarterly', 'yearly', 'lifetime'], default: 'monthly' },

    // Credits
    credits: {
        total: { type: Number, default: 50 },
        used: { type: Number, default: 0 },
    },

    // Pricing
    price: { type: Number, default: 0 }, // amount paid
    currency: { type: String, default: 'INR' },

    // Dates
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date },
    renewalDate: { type: Date },

    // Status
    status: { type: String, enum: ['active', 'expired', 'cancelled', 'trial'], default: 'active' },

    // ── Cancellation ──
    cancelledAt: { type: Date },
    cancelReason: { type: String, default: '' },
    gracePeriodEnd: { type: Date },            // access continues until this date after cancel

    // ── Retention Offer ──
    retentionOfferApplied: { type: Boolean, default: false },
    retentionOfferId: { type: mongoose.Schema.Types.ObjectId, ref: 'RetentionOffer' },

    // ── Auto-Renewal / Mandate ──
    autoRenew: { type: Boolean, default: false },
    razorpaySubscriptionId: { type: String, default: '' }, // for future mandate support

    // Coupon
    couponApplied: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon' },
    couponCode: { type: String, default: '' },
    discountAmount: { type: Number, default: 0 },

    // Payment
    paymentMethod: { type: String, default: '' },
    transactionId: { type: String, default: '' },

    // Pro-rata tracking
    proRataCredit: { type: Number, default: 0 },   // credit from previous plan
    proRataCharged: { type: Number, default: 0 },   // actual amount charged after pro-rata

    // Metadata
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // admin who assigned
    notes: { type: String, default: '' },
}, { timestamps: true });

// Virtual: remaining credits
subscriptionSchema.virtual('creditsRemaining').get(function () {
    if (this.plan === 'enterprise') return Infinity;
    return Math.max(0, this.credits.total - this.credits.used);
});

// Virtual: is active
subscriptionSchema.virtual('isActive').get(function () {
    if (this.status !== 'active') return false;
    if (this.endDate && new Date() > this.endDate) return false;
    return true;
});

subscriptionSchema.set('toJSON', { virtuals: true });

export default mongoose.model('Subscription', subscriptionSchema);

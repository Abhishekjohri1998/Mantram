import mongoose from 'mongoose';

const couponSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    description: { type: String, default: '' },

    // Discount type
    discountType: { type: String, enum: ['percentage', 'fixed', 'credits'], required: true },
    discountValue: { type: Number, required: true }, // e.g. 20 (for 20%), ₹500, or 100 credits

    // Usage limits
    maxUses: { type: Number, default: 0 }, // 0 = unlimited
    usedCount: { type: Number, default: 0 },
    maxUsesPerUser: { type: Number, default: 1 },

    // Validity
    validFrom: { type: Date, default: Date.now },
    validUntil: { type: Date },
    isActive: { type: Boolean, default: true },

    // Restrictions
    applicablePlans: [{ type: String, enum: ['starter', 'professional', 'enterprise'] }], // empty = all plans
    minPurchaseAmount: { type: Number, default: 0 },

    // Tracking
    usedBy: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        usedAt: { type: Date, default: Date.now },
    }],

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Virtual: is valid right now
couponSchema.virtual('isValid').get(function () {
    if (!this.isActive) return false;
    const now = new Date();
    if (this.validFrom && now < this.validFrom) return false;
    if (this.validUntil && now > this.validUntil) return false;
    if (this.maxUses > 0 && this.usedCount >= this.maxUses) return false;
    return true;
});

couponSchema.set('toJSON', { virtuals: true });

export default mongoose.model('Coupon', couponSchema);

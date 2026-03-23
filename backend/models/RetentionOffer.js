import mongoose from 'mongoose';

/**
 * RetentionOffer — SuperAdmin-managed offers shown to users who try to cancel.
 * Types: discount (% off next renewal), bonus_credits, free_month, downgrade suggestion.
 */
const retentionOfferSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },

    // Offer type
    offerType: {
        type: String,
        enum: ['discount', 'bonus_credits', 'free_month', 'downgrade'],
        required: true,
    },

    // Value interpretation depends on offerType:
    //   discount      → percentage off (e.g., 30 = 30% off next renewal)
    //   bonus_credits → number of bonus credits awarded
    //   free_month    → number of free months (e.g., 1)
    //   downgrade     → target plan slug to suggest downgrading to
    value: { type: mongoose.Schema.Types.Mixed, required: true },

    // Duration (how many billing cycles the offer lasts, for discount type)
    duration: { type: Number, default: 1 },

    // Which plans this offer targets (empty = all plans)
    targetPlans: [{ type: String }],

    // Display
    headline: { type: String, default: '' },  // e.g., "Wait! We have a deal for you"
    icon: { type: String, default: 'local_offer' },
    color: { type: String, default: '#f59e0b' },

    // Controls
    isActive: { type: Boolean, default: true },
    priority: { type: Number, default: 0 },       // higher = shown first
    maxClaims: { type: Number, default: 0 },       // 0 = unlimited
    claimCount: { type: Number, default: 0 },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

retentionOfferSchema.index({ isActive: 1, priority: -1 });

export default mongoose.model('RetentionOffer', retentionOfferSchema);

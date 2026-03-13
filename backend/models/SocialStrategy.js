import mongoose from 'mongoose';

const socialStrategySchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true },

    type: {
        type: String,
        enum: ['strategy', 'calendar', 'audit', 'competitor'],
        required: true,
    },

    title: { type: String, default: '' },

    // Platforms analyzed
    platforms: [{
        type: String,
        enum: ['instagram', 'facebook', 'linkedin', 'twitter', 'youtube', 'pinterest', 'threads'],
    }],

    // Timeframe
    timeframe: { type: String, enum: ['weekly', 'monthly', 'quarterly', 'yearly'], default: 'monthly' },

    // AI-generated data (flexible structure per type)
    data: { type: mongoose.Schema.Types.Mixed, default: {} },

    // User inputs that generated this
    inputs: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Status
    status: { type: String, enum: ['draft', 'active', 'archived'], default: 'active' },

}, { timestamps: true });

socialStrategySchema.index({ user: 1, brand: 1, type: 1 });
socialStrategySchema.index({ createdAt: -1 });

export default mongoose.model('SocialStrategy', socialStrategySchema);

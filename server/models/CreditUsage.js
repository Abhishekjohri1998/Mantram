import mongoose from 'mongoose';

const creditUsageSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    action: { type: String, required: true }, // e.g. 'content', 'creative', 'seoHealthCheck'
    cost: { type: Number, required: true },
    balanceAfter: { type: Number },
    description: { type: String }, // human-readable label
    metadata: {
        route: String,           // e.g. '/api/content/generate'
        brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand' },
        brandName: String,
    },
    createdAt: { type: Date, default: Date.now },
});

// TTL index: auto-delete after 90 days
creditUsageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

// Compound index for efficient user+date queries
creditUsageSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model('CreditUsage', creditUsageSchema);

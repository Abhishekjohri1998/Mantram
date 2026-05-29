import mongoose from 'mongoose';

const webhookEventSchema = new mongoose.Schema({
    webhookId: { type: String, required: true, unique: true },
    topic: { type: String },
    shop: { type: String },
    createdAt: { type: Date, default: Date.now }
});

// Auto-delete records after 7 days to keep the collection small
webhookEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

export default mongoose.model('WebhookEvent', webhookEventSchema);

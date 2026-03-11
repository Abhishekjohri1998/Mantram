import mongoose from 'mongoose';

// ── Funnel Stage Schema ──
const funnelStageSchema = new mongoose.Schema({
    name: { type: String, required: true },
    order: { type: Number, required: true },
    type: {
        type: String,
        enum: ['awareness', 'interest', 'consideration', 'decision', 'retention', 'custom'],
        default: 'custom',
    },
    color: { type: String, default: '#6366f1' },
    description: { type: String, default: '' },
    // Links to other Mantram studios for this stage
    studioLinks: [{
        studio: { type: String }, // e.g. 'contentStudio', 'creativeStudio', 'conversationStudio'
        action: { type: String }, // e.g. 'generate_nurture_email', 'create_ad_creative'
        label: { type: String },
    }],
    automationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Automation' },
    // Stage-level metrics (computed)
    metrics: {
        totalEntries: { type: Number, default: 0 },
        avgTimeInStage: { type: Number, default: 0 }, // seconds
        dropOffRate: { type: Number, default: 0 },     // percentage
    },
}, { _id: true });

// ── Main Funnel Schema ──
const funnelSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true },

    name: { type: String, required: true },
    description: { type: String, default: '' },
    icon: { type: String, default: 'filter_alt' },
    color: { type: String, default: '#6366f1' },

    // Funnel type
    type: {
        type: String,
        enum: ['lead_gen', 'product_launch', 'webinar', 'e_commerce', 'nurture_sequence', 'custom'],
        default: 'custom',
    },

    // Ordered stages
    stages: [funnelStageSchema],

    // Aggregate metrics (recomputed periodically)
    metrics: {
        totalEntries: { type: Number, default: 0 },
        activeEntries: { type: Number, default: 0 },
        convertedEntries: { type: Number, default: 0 },
        lostEntries: { type: Number, default: 0 },
        conversionRate: { type: Number, default: 0 },
        avgTimeToConvert: { type: Number, default: 0 }, // seconds
        revenue: { type: Number, default: 0 },
    },

    // Status
    status: { type: String, enum: ['draft', 'active', 'paused', 'archived'], default: 'draft' },

    // AI-generated metadata
    aiGenerated: { type: Boolean, default: false },
    aiPrompt: { type: String, default: '' },

}, { timestamps: true });

funnelSchema.index({ user: 1, brand: 1 });
funnelSchema.index({ status: 1 });

export default mongoose.model('Funnel', funnelSchema);

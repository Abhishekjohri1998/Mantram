import mongoose from 'mongoose';

/**
 * BrandStrategy — Stores generated strategies with measurable KPI tracking
 */
const kpiEntrySchema = new mongoose.Schema({
    name: { type: String, required: true },
    target: { type: Number, required: true },
    current: { type: Number, default: 0 },
    unit: { type: String, default: '' }, // '%', 'K', 'leads', '₹', etc.
    channel: { type: String, default: '' }, // social, seo, pm, influencer, etc.
}, { _id: false });

const milestoneSchema = new mongoose.Schema({
    title: { type: String, required: true },
    week: { type: Number }, // week number within strategy period
    completed: { type: Boolean, default: false },
    completedAt: { type: Date },
    channel: { type: String, default: '' },
}, { _id: true });

const brandStrategySchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand' },

    // Strategy metadata
    title: { type: String, required: true },
    duration: { type: String, enum: ['1-month', '3-month'], default: '1-month' },
    objective: { type: String, default: '' },
    status: { type: String, enum: ['active', 'completed', 'paused', 'draft'], default: 'active' },

    // Full AI-generated strategy JSON
    strategy: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Slides JSON for presentation
    slides: { type: mongoose.Schema.Types.Mixed, default: null },

    // Measurable KPIs
    kpis: [kpiEntrySchema],

    // Milestones / tasks
    milestones: [milestoneSchema],

    // Progress (auto-calculated)
    overallProgress: { type: Number, default: 0 }, // 0-100

    // Dates
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date },

}, { timestamps: true });

brandStrategySchema.index({ user: 1, brand: 1, status: 1 });
brandStrategySchema.index({ user: 1, createdAt: -1 });

export default mongoose.model('BrandStrategy', brandStrategySchema);

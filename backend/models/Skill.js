import mongoose from 'mongoose';

const inputFieldSchema = new mongoose.Schema({
    name: { type: String, required: true },
    label: { type: String, required: true },
    type: { type: String, enum: ['text', 'textarea', 'select', 'url', 'number', 'toggle'], default: 'text' },
    required: { type: Boolean, default: false },
    placeholder: String,
    options: [String],      // for select type
    defaultValue: String,
}, { _id: false });

const skillSchema = new mongoose.Schema({
    // ── Ownership ──
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand' },
    visibility: { type: String, enum: ['private', 'team', 'marketplace'], default: 'private' },

    // ── Metadata (loaded for matching — lightweight) ──
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    category: {
        type: String,
        enum: ['content', 'creative', 'seo', 'social', 'performance', 'video', 'general'],
        default: 'general'
    },
    tags: [String],
    icon: { type: String, default: 'auto_awesome' },
    color: { type: String, default: 'violet' },

    // ── Instructions (loaded only when activated) ──
    instructions: { type: String, required: true },
    systemPrompt: String,
    modelPreference: { type: String, enum: ['auto', 'grok', 'gemini', 'claude', 'openai'], default: 'auto' },
    temperature: { type: Number, default: 0.7, min: 0, max: 2 },

    // ── Input Schema ──
    inputFields: [inputFieldSchema],

    // ── Output Format ──
    outputFormat: { type: String, enum: ['markdown', 'json', 'html', 'structured'], default: 'structured' },

    // ── Examples ──
    exampleOutput: String,

    // ── Chain Support ──
    chainable: { type: Boolean, default: true },
    suggestedNextSkills: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Skill' }],

    // ── Analytics ──
    usageCount: { type: Number, default: 0 },
    avgRating: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0 },
    lastUsedAt: Date,

    // ── Versioning ──
    version: { type: Number, default: 1 },
    changelog: [{
        version: Number,
        changes: String,
        date: { type: Date, default: Date.now },
    }],

    // ── Status ──
    status: { type: String, enum: ['active', 'draft', 'deprecated'], default: 'draft' },

    // ── Pre-built flag (Mantram-curated, cannot be deleted by user) ──
    isPrebuilt: { type: Boolean, default: false },

}, { timestamps: true });

// Indexes for fast queries
skillSchema.index({ user: 1, status: 1 });
skillSchema.index({ visibility: 1, status: 1, category: 1 });
skillSchema.index({ tags: 1 });
skillSchema.index({ isPrebuilt: 1, status: 1 });

export default mongoose.model('Skill', skillSchema);

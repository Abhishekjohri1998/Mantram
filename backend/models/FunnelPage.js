import mongoose from 'mongoose';

/**
 * FunnelPage — Landing pages + forms tied to funnel stages.
 * Each page captures leads that auto-enter funnel entries.
 */

// ── Form Field Schema ──
const formFieldSchema = new mongoose.Schema({
    name: { type: String, required: true },       // field key (e.g. 'email', 'name', 'phone')
    label: { type: String, required: true },       // display label
    type: { type: String, enum: ['text', 'email', 'phone', 'number', 'textarea', 'select', 'checkbox', 'hidden'], default: 'text' },
    placeholder: { type: String, default: '' },
    required: { type: Boolean, default: false },
    options: [{ type: String }],                   // for select type
    mapToContact: { type: String, default: '' },   // maps to Contact model field (e.g. 'name', 'email', 'phone')
    order: { type: Number, default: 0 },
}, { _id: true });

// ── Page Section Schema ──
const pageSectionSchema = new mongoose.Schema({
    type: { type: String, enum: ['hero', 'features', 'testimonial', 'cta', 'form', 'text', 'image', 'video', 'faq', 'pricing'], default: 'text' },
    order: { type: Number, default: 0 },
    content: {
        headline: { type: String, default: '' },
        subheadline: { type: String, default: '' },
        body: { type: String, default: '' },
        buttonText: { type: String, default: '' },
        buttonUrl: { type: String, default: '' },
        imageUrl: { type: String, default: '' },
        videoUrl: { type: String, default: '' },
        items: [{ title: { type: String }, description: { type: String }, icon: { type: String } }],
    },
    style: {
        backgroundColor: { type: String, default: '' },
        textColor: { type: String, default: '' },
        alignment: { type: String, enum: ['left', 'center', 'right'], default: 'center' },
    },
}, { _id: true });

// ── Main FunnelPage Schema ──
const funnelPageSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true },
    funnel: { type: mongoose.Schema.Types.ObjectId, ref: 'Funnel', required: true },

    name: { type: String, required: true },
    slug: { type: String, required: true },        // URL slug (unique per user)
    description: { type: String, default: '' },

    // Which funnel stage this page feeds into
    targetStage: { type: String, required: true },
    leadSource: { type: String, default: 'landing_page' },

    // Page content
    sections: [pageSectionSchema],

    // Form configuration
    form: {
        enabled: { type: Boolean, default: true },
        title: { type: String, default: 'Get Started' },
        description: { type: String, default: '' },
        fields: [formFieldSchema],
        submitButtonText: { type: String, default: 'Submit' },
        successMessage: { type: String, default: 'Thanks! We\'ll be in touch.' },
        redirectUrl: { type: String, default: '' },
    },

    // Page styling
    style: {
        primaryColor: { type: String, default: '#6366f1' },
        backgroundColor: { type: String, default: '#0f172a' },
        fontFamily: { type: String, default: 'Inter' },
        headerImage: { type: String, default: '' },
    },

    // Status
    status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft' },

    // AI metadata
    aiGenerated: { type: Boolean, default: false },
    aiPrompt: { type: String, default: '' },

    // Metrics
    metrics: {
        views: { type: Number, default: 0 },
        submissions: { type: Number, default: 0 },
        conversionRate: { type: Number, default: 0 },   // submissions / views * 100
        avgTimeOnPage: { type: Number, default: 0 },     // seconds
    },

    // #5 A/B Testing
    isVariant: { type: Boolean, default: false },
    variantName: { type: String, default: 'A' },          // 'A', 'B', 'C', etc.
    parentPage: { type: mongoose.Schema.Types.ObjectId, ref: 'FunnelPage' }, // original page
    abTestActive: { type: Boolean, default: false },
    abTrafficSplit: { type: Number, default: 50 },        // % traffic to variant B

}, { timestamps: true });

funnelPageSchema.index({ user: 1, brand: 1 });
funnelPageSchema.index({ funnel: 1 });
funnelPageSchema.index({ slug: 1, user: 1 }, { unique: true });
funnelPageSchema.index({ status: 1 });

export default mongoose.model('FunnelPage', funnelPageSchema);

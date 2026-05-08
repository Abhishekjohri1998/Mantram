import mongoose from 'mongoose';

const templateSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 80
    },
    categoryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TemplateCategory',
        default: null,
    },
    studioOrigin: {
        type: String,
        enum: ['creative', 'video', 'content'],
        required: true
    },
    // ── Studio Section — scopes which studio section shows this template ──────
    studioSection: {
        type: String,
        enum: ['ai_create', 'carousel', 'campaign', 'campaign_shot', 'avatar', 'video_ugc', 'video_qads', 'general', 'homepage'],
        default: 'general'
    },
    description: {
        type: String,
        maxlength: 200
    },
    tags: {
        type: [String],
        default: []
    },
    // previewUrl kept for backwards compatibility — previewImageUrl is canonical
    previewUrl: {
        type: String,
        required: true
    },
    // ── Canonical preview field — always an S3 URL ───────────────────────────
    previewImageUrl: {
        type: String,
        default: ''
    },
    previewType: {
        type: String,
        enum: ['image', 'video'],
        required: true
    },
    // ── Generated video URL (separate from poster/thumbnail) ─────────────
    previewVideoUrl: {
        type: String,
        default: ''
    },
    // ── Structured Asset Slots ───────────────────────────────────────────
    // Each asset is labeled with its role so users know what they can swap
    templateAssets: [{
        role: { type: String, enum: ['product', 'avatar', 'background', 'reference'] },
        label: String,
        url: String,
        swappable: { type: Boolean, default: true }
    }],
    savedPrompt: {
        type: String,
        required: true
    },
    // ── Parameterized prompt with {product_name}, {brand_color} placeholders ─
    promptTemplate: {
        type: String,
        default: ''
    },
    savedBrief: {
        type: String
    },
    savedStyle: {
        type: mongoose.Schema.Types.Mixed
    },
    savedModelSettings: {
        type: mongoose.Schema.Types.Mixed
    },
    savedGenerationSource: {
        type: String
    },
    // ── Model that created the preview — replayed on user generation ──────────
    generationModel: {
        type: String,
        default: 'gpt-image-2'
    },
    // ── Params used at generation time (aspectRatio, size string, etc.) ───────
    generationParams: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    // ── isActive = soft-delete flag. isPublished = user-visibility flag. ──────
    // Users see templates only when BOTH isActive: true AND isPublished: true.
    isActive: {
        type: Boolean,
        default: true
    },
    isPublished: {
        type: Boolean,
        default: false
    },
    isFeatured: {
        type: Boolean,
        default: false
    },
    showOnHomeScreen: {
        type: Boolean,
        default: false
    },
    usageCount: {
        type: Number,
        default: 0
    },
    // ── Unique user count (incremented once per user per template) ────────────
    usedByCount: {
        type: Number,
        default: 0
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    sourceJobId: {
        type: String
    },
    sourceJobType: {
        type: String,
        enum: ['GenerationJob', 'VideoProject', 'Content']
    },
    // ── Video Template Recreation Metadata ────────────────────────────────
    // Stores the product/avatar/settings used when creating this template so
    // users can "Recreate" with the same inputs pre-filled in Q-Ads
    savedProductUrl: {
        type: String,
        default: ''
    },
    savedProductImageUrls: {
        type: [String],
        default: []
    },
    savedAvatarUrl: {
        type: String,
        default: ''
    },
    savedVideoSettings: {
        type: mongoose.Schema.Types.Mixed,
        default: {}  // { duration, format, model, presetId }
    },
    // ── Brand-scoped user-created templates ────────────────────────────────────
    brandId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Brand',
        default: null,
    },
    // ── userCreated flag — distinguishes user templates from admin-published ────
    userCreated: {
        type: Boolean,
        default: false,
    },
    // ── Design DNA — AI-extracted visual blueprint of the reference image ──────
    // Written once at template creation time, never changes (like savedPrompt)
    dna: {
        type: mongoose.Schema.Types.Mixed,
        default: null,
        // Shape: {
        //   layout: String,                // e.g. "split-left-right", "centered-hero"
        //   colorPalette: [String],        // hex codes extracted from image
        //   contentZones: [{               // each zone the AI detected
        //     role: String,               // "headline", "product", "offer", "cta", "logo"
        //     position: String,           // "top-left", "center", "bottom-right"
        //     style: String,              // "bold 72px white uppercase"
        //   }],
        //   mood: String,                  // "festive bold", "minimal luxury"
        //   typography: {
        //     headingStyle: String,
        //     bodyStyle: String,
        //   },
        //   promptFormula: String,         // full reusable formula with {{PLACEHOLDERS}}
        //   fitInstruction: String,        // how to map product onto zones
        // }
    },
    // ── System reference image — used by the pipeline as a style/layout anchor ──
    // Must be an S3/CDN URL (not base64). Used in templateRefImageUrl inpainting path.
    systemReferenceImage: {
        type: String,
        default: ''
    },
    // ── defaultSettings — overrides for the generation pipeline ───────────────
    // Examples: { format: 'instagram-post', aspectRatio: '1:1', model: 'gemini-flash' }
    defaultSettings: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    // ── enableProductAnalysis — opt-out flag for the two-pass product analyzer ─
    // Set to false to skip Stage 4 product intelligence (e.g. for non-product templates)
    enableProductAnalysis: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

// Immutability guard — savedPrompt cannot change after creation
templateSchema.pre('save', function() {
    if (!this.isNew && this.isModified('savedPrompt')) {
        const error = new Error('savedPrompt is immutable after creation. Create a new template to change the prompt.');
        error.name = 'ValidationError';
        throw error;
    }
});

// Sync previewImageUrl ← previewUrl on save if canonical field is empty
templateSchema.pre('save', function() {
    if (!this.previewImageUrl && this.previewUrl) {
        this.previewImageUrl = this.previewUrl;
    }
    if (!this.previewUrl && this.previewImageUrl) {
        this.previewUrl = this.previewImageUrl;
    }
});

// Existing indexes
templateSchema.index({ categoryId: 1 });
templateSchema.index({ studioOrigin: 1 });
templateSchema.index({ isActive: 1 });
templateSchema.index({ isFeatured: 1 });
templateSchema.index({ usageCount: -1 });

// ── Compound index for section-scoped template queries (Step 9) ───────────────
templateSchema.index({ studioSection: 1, isPublished: 1, isActive: 1 });

// ── Compound index for brand-scoped user-created template queries ─────────────
templateSchema.index({ brandId: 1, userCreated: 1, isActive: 1, createdAt: -1 });

export default mongoose.model('Template', templateSchema);

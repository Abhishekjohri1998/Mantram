import mongoose from 'mongoose';

const avatarSchema = new mongoose.Schema({
    // ── name is REQUIRED — a nameless avatar cannot be saved ─────────────────
    name: {
        type: String,
        required: [true, 'Avatar name is required. Give this avatar a name before saving.'],
        trim: true
    },
    imageUrl: { type: String, required: true },
    gender: { type: String, enum: ['male', 'female', 'unspecified'], default: 'unspecified' },
    tags: [{ type: String }],

    // ── Legacy flag — kept for backwards compatibility with existing queries ──
    isTemplate: { type: Boolean, default: false },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isPinned: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },

    generatedFromPrompt: { type: String, default: '' },
    source: { type: String, enum: ['upload', 'generated', 'template'], default: 'upload' },

    // ── New fields for multi-role avatar management ───────────────────────────
    // Determines which picker section shows this avatar
    createdByRole: {
        type: String,
        enum: ['user', 'superadmin'],
        default: 'user'
    },
    // When true + createdByRole=superadmin → appears in every user's Avatar Library section
    isPublished: {
        type: Boolean,
        default: false
    },
    // How the avatar was created
    generationMode: {
        type: String,
        enum: ['structured', 'advanced', 'reference'],
        default: 'structured'
    },
    // S3 URL of reference image (only when generationMode = 'reference')
    referenceImageUrl: {
        type: String,
        default: ''
    },
    // Exact final prompt sent to the model
    promptUsed: {
        type: String,
        default: ''
    },
    // Model used to generate this avatar
    modelUsed: {
        type: String,
        default: 'gpt-image-2'
    },
    // Always mid_shot for avatars
    frameType: {
        type: String,
        default: 'mid_shot'
    },
    // Always 9:16 for avatars
    resolution: {
        type: String,
        default: '9:16'
    },
}, { timestamps: true });

// Existing indexes
avatarSchema.index({ isTemplate: 1, isActive: 1 });
avatarSchema.index({ createdBy: 1, isActive: 1 });
avatarSchema.index({ name: 'text', tags: 'text' });

// ── New compound index for user + library split queries ───────────────────────
avatarSchema.index({ createdBy: 1, createdByRole: 1, isPublished: 1 });

export default mongoose.model('Avatar', avatarSchema);

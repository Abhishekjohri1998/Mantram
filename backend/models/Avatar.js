import mongoose from 'mongoose';

const avatarSchema = new mongoose.Schema({
    name: { type: String, default: '' },
    imageUrl: { type: String, required: true },
    gender: { type: String, enum: ['male', 'female', 'unspecified'], default: 'unspecified' },
    tags: [{ type: String }],
    isTemplate: { type: Boolean, default: false },   // true = Super Admin template
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // null for templates
    isPinned: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    generatedFromPrompt: { type: String, default: '' }, // AI prompt used, if any
    source: { type: String, enum: ['upload', 'generated', 'template'], default: 'upload' },
}, { timestamps: true });

// Indexes for fast queries
avatarSchema.index({ isTemplate: 1, isActive: 1 });
avatarSchema.index({ createdBy: 1, isActive: 1 });
avatarSchema.index({ name: 'text', tags: 'text' });

export default mongoose.model('Avatar', avatarSchema);

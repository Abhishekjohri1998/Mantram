import mongoose from 'mongoose';

const qAdsPresetSchema = new mongoose.Schema({
    categoryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'QAdsCategory',
        required: true
    },
    presetCode: {
        type: String,
        required: true,
        unique: true
    },
    name: {
        type: String,
        required: true
    },
    tagline: {
        type: String,
        required: true
    },
    description: {
        type: String
    },
    previewMediaUrl: {
        type: String
    },
    previewMediaType: {
        type: String,
        enum: ['video', 'image'],
        default: 'image'
    },
    promptRules: {
        cameraSignature: { type: String, required: true },
        pacing: { type: String, required: true },
        register: { type: String, required: true },
        environmentDefault: { type: String, required: true }
    },
    isMantramExclusive: {
        type: Boolean,
        default: false
    },
    isActive: {
        type: Boolean,
        default: true
    },
    sortOrder: {
        type: Number,
        default: 0
    },
    usageCount: {
        type: Number,
        default: 0
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, { timestamps: true });

qAdsPresetSchema.index({ categoryId: 1 });
qAdsPresetSchema.index({ isActive: 1 });
qAdsPresetSchema.index({ sortOrder: 1 });

export default mongoose.model('QAdsPreset', qAdsPresetSchema);

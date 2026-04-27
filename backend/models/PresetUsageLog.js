import mongoose from 'mongoose';

const presetUsageLogSchema = new mongoose.Schema({
    presetId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'QAdsPreset',
        required: true
    },
    presetCode: {
        type: String
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    brandId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Brand'
    }
}, { timestamps: true });

presetUsageLogSchema.index({ presetId: 1, createdAt: -1 });

export default mongoose.model('PresetUsageLog', presetUsageLogSchema);

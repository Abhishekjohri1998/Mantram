import mongoose from 'mongoose';

const templateUsageLogSchema = new mongoose.Schema({
    templateId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Template',
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    brandId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Brand'
    },
    studioOrigin: {
        type: String
    },
    userBrief: {
        type: String
    },
    hadProductImage: {
        type: Boolean
    },
    hadAvatarImage: {
        type: Boolean
    },
    resultJobId: {
        type: String
    },
    resultJobType: {
        type: String
    },
    // ── Generation outcome tracking ───────────────────────────────────────────
    status: {
        type: String,
        enum: ['success', 'failed'],
        default: 'success'
    },
    errorMessage: {
        type: String,
        default: ''
    },
    // The S3 URL of the generated image if status = success
    resultS3Url: {
        type: String,
        default: ''
    },
    // Generation duration in milliseconds
    generationDurationMs: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

templateUsageLogSchema.index({ templateId: 1, userId: 1, createdAt: -1 });
templateUsageLogSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('TemplateUsageLog', templateUsageLogSchema);

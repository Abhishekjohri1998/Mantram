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
        required: true
    },
    studioOrigin: {
        type: String,
        enum: ['creative', 'video', 'content'],
        required: true
    },
    description: {
        type: String,
        maxlength: 200
    },
    tags: {
        type: [String],
        default: []
    },
    previewUrl: {
        type: String,
        required: true
    },
    previewType: {
        type: String,
        enum: ['image', 'video'],
        required: true
    },
    savedPrompt: {
        type: String,
        required: true
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
    isActive: {
        type: Boolean,
        default: false
    },
    isFeatured: {
        type: Boolean,
        default: false
    },
    usageCount: {
        type: Number,
        default: 0
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    sourceJobId: {
        type: mongoose.Schema.Types.ObjectId
    },
    sourceJobType: {
        type: String,
        enum: ['GenerationJob', 'VideoProject', 'Content']
    }
}, { timestamps: true });

templateSchema.pre('save', function() {
    if (!this.isNew && this.isModified('savedPrompt')) {
        const error = new Error('savedPrompt is immutable after creation. Create a new template to change the prompt.');
        error.name = 'ValidationError';
        throw error;
    }
});

templateSchema.index({ categoryId: 1 });
templateSchema.index({ studioOrigin: 1 });
templateSchema.index({ isActive: 1 });
templateSchema.index({ isFeatured: 1 });
templateSchema.index({ usageCount: -1 });

export default mongoose.model('Template', templateSchema);

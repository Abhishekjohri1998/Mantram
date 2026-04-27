import mongoose from 'mongoose';

const templateCategorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    slug: {
        type: String,
        required: true,
        unique: true,
        lowercase: true
    },
    description: {
        type: String,
        default: ''
    },
    color: {
        type: String,
        default: '#888888'
    },
    iconEmoji: {
        type: String
    },
    isActive: {
        type: Boolean,
        default: true
    },
    sortOrder: {
        type: Number,
        default: 0
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, { timestamps: true });

// Auto-generate slug on save if not provided or if name changed
templateCategorySchema.pre('validate', function() {
    if (this.name && (!this.slug || this.isModified('name'))) {
        this.slug = this.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    }
});

templateCategorySchema.index({ sortOrder: 1, isActive: 1 });

export default mongoose.model('TemplateCategory', templateCategorySchema);

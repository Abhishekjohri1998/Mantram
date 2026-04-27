import mongoose from 'mongoose';

const qAdsCategorySchema = new mongoose.Schema({
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
    color: {
        type: String,
        default: '#888888'
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
qAdsCategorySchema.pre('validate', function(next) {
    if (this.name && (!this.slug || this.isModified('name'))) {
        this.slug = this.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    }
    next();
});

export default mongoose.model('QAdsCategory', qAdsCategorySchema);

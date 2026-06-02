/**
 * Cast — Mongoose Model
 * Stores cast members for the YouTube Studio Casting Bay
 */

import mongoose from 'mongoose';

const CastSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    role: { type: String, trim: true, default: '' },
    imageUrl: { type: String, trim: true, default: '' },
}, { timestamps: true });

// Index for quick brand cast listings and uniqueness check
CastSchema.index({ brandId: 1, name: 1 }, { unique: true });

export default mongoose.model('Cast', CastSchema);

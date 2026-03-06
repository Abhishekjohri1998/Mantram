import mongoose from 'mongoose';

const socialAccountSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    platform: { type: String, enum: ['facebook', 'instagram', 'linkedin', 'twitter'], required: true },

    // The ID of the specific Page, IG Account, or Profile
    accountId: { type: String, required: true },
    accountName: { type: String, required: true },
    avatar: { type: String, default: '' },

    // For Meta, we need the page access token or user access token
    accessToken: { type: String, required: true },
    refreshToken: { type: String, default: '' },

    // Additional metadata (e.g., category for FB pages)
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },

    tokenExpiresAt: { type: Date },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

// Ensure a user can't connect the exact same page twice
socialAccountSchema.index({ user: 1, platform: 1, accountId: 1 }, { unique: true });

export default mongoose.model('SocialAccount', socialAccountSchema);

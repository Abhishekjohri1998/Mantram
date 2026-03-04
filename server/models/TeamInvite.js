import mongoose from 'mongoose';
import crypto from 'crypto';

const teamInviteSchema = new mongoose.Schema({
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // team owner
    email: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, default: '' },

    // Role within the team
    role: { type: String, enum: ['member', 'manager'], default: 'member' },

    // Granular studio access
    studioAccess: {
        contentStudio: { type: Boolean, default: false },
        creativeStudio: { type: Boolean, default: false },
        seoStudio: { type: Boolean, default: false },
        brainstormStudio: { type: Boolean, default: false },
        videoStudio: { type: Boolean, default: false },
        d2cAnalytics: { type: Boolean, default: false },
        adStudio: { type: Boolean, default: false },
        smartCalendar: { type: Boolean, default: false },
        conversationStudio: { type: Boolean, default: false },
    },

    // Which brands this member can access
    brandAccess: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Brand' }],

    // Invite token
    token: { type: String, unique: true },
    expiresAt: { type: Date, required: true },

    // Status
    status: { type: String, enum: ['pending', 'accepted', 'expired', 'revoked'], default: 'pending' },
    acceptedAt: { type: Date },
    acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // Optional message from the inviter
    message: { type: String, default: '' },
}, { timestamps: true });

// Auto-generate secure token
teamInviteSchema.pre('save', function () {
    if (!this.token) {
        this.token = crypto.randomBytes(32).toString('hex');
    }
});

teamInviteSchema.index({ organization: 1, status: 1 });
teamInviteSchema.index({ email: 1, status: 1 });
teamInviteSchema.index({ token: 1 });

export default mongoose.model('TeamInvite', teamInviteSchema);

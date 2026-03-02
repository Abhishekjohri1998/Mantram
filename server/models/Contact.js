import mongoose from 'mongoose';

const contactSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true },

    // Platform identity
    platform: { type: String, enum: ['instagram', 'facebook'], required: true },
    platformUserId: { type: String, required: true },
    platformUsername: { type: String, default: '' },
    profilePicture: { type: String, default: '' },

    // Contact info
    name: { type: String, default: 'Unknown' },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    location: { type: String, default: '' },

    // Segmentation
    tags: [{ type: String }],
    attributes: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Engagement
    interestScore: { type: Number, default: 0, min: 0, max: 100 },
    language: { type: String, default: 'en' },
    totalMessages: { type: Number, default: 0 },
    lastInteractionAt: { type: Date },

    // Lead tracking
    leadSource: { type: String, default: '' }, // e.g. "comment_campaign", "dm_keyword", "story_reply"
    campaignTag: { type: String, default: '' },
    leadStatus: { type: String, enum: ['new', 'warm', 'hot', 'converted', 'cold'], default: 'new' },

    // Automation
    automationHistory: [{
        automationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Automation' },
        name: { type: String },
        triggeredAt: { type: Date },
        completedAt: { type: Date },
        status: { type: String, enum: ['active', 'completed', 'dropped'] },
    }],

    // Opt-out
    optedOut: { type: Boolean, default: false },

}, { timestamps: true });

contactSchema.index({ user: 1, brand: 1 });
contactSchema.index({ platform: 1, platformUserId: 1 }, { unique: true });
contactSchema.index({ tags: 1 });
contactSchema.index({ leadStatus: 1 });
contactSchema.index({ lastInteractionAt: -1 });

export default mongoose.model('Contact', contactSchema);

import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
    role: { type: String, enum: ['contact', 'brand', 'system'], required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    messageType: { type: String, enum: ['text', 'image', 'quick_reply', 'button', 'template', 'story_reply', 'story_mention'], default: 'text' },
    sentBy: { type: String, enum: ['ai', 'human', 'automation', 'contact'], default: 'contact' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    // Meta platform message ID for tracking
    platformMessageId: { type: String, default: '' },
    // AI confidence for auto-generated messages
    aiConfidence: { type: Number, min: 0, max: 100 },
    // Was this message edited by human before sending?
    wasEdited: { type: Boolean, default: false },
}, { _id: true });

const conversationSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true },
    contact: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', required: true },

    // Channel
    channel: {
        type: String,
        enum: ['instagram_dm', 'facebook_messenger', 'instagram_comment', 'instagram_story_reply', 'instagram_mention'],
        required: true,
    },

    // Status
    status: {
        type: String,
        enum: ['active', 'resolved', 'snoozed', 'handed_off', 'waiting'],
        default: 'active',
    },

    // Messages
    messages: [messageSchema],
    lastMessageAt: { type: Date, default: Date.now },
    lastMessagePreview: { type: String, default: '' },
    unreadCount: { type: Number, default: 0 },

    // AI handling
    isAIHandling: { type: Boolean, default: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // Intent detection
    intent: { type: String, default: '' },
    intentConfidence: { type: Number, default: 0, min: 0, max: 100 },
    intentHistory: [{
        intent: String,
        confidence: Number,
        detectedAt: { type: Date, default: Date.now },
    }],

    // Compliance — 24h messaging window
    complianceWindow: {
        opensAt: { type: Date },
        closesAt: { type: Date },
        canSendPromotional: { type: Boolean, default: false },
    },

    // Active automation
    activeAutomation: {
        automationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Automation' },
        currentNode: { type: String, default: '' },
        startedAt: { type: Date },
        data: { type: mongoose.Schema.Types.Mixed, default: {} },
    },

    // Tags
    tags: [{ type: String }],

    // Source tracking
    sourcePostId: { type: String, default: '' }, // For comment-to-DM campaigns

}, { timestamps: true });

conversationSchema.index({ user: 1, brand: 1, status: 1 });
conversationSchema.index({ contact: 1 });
conversationSchema.index({ lastMessageAt: -1 });
conversationSchema.index({ status: 1, isAIHandling: 1 });
conversationSchema.index({ intent: 1 });

export default mongoose.model('Conversation', conversationSchema);

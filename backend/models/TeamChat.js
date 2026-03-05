import mongoose from 'mongoose';

const teamChatSchema = new mongoose.Schema({
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // Channel type
    channel: { type: String, default: 'general' }, // 'general', 'brand-{brandId}', 'dm-{sortedUserIds}'
    channelType: { type: String, enum: ['general', 'brand', 'dm'], default: 'general' },
    brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand' }, // if brand channel

    // Message content
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, default: '' },
    messageType: { type: String, enum: ['text', 'attachment', 'approval-share', 'system'], default: 'text' },

    // Attachments — can reference generated content/creatives
    attachments: [{
        type: { type: String, enum: ['content', 'creative', 'image', 'file', 'link'] },
        refId: { type: mongoose.Schema.Types.ObjectId }, // ref to Content/Creative
        url: { type: String, default: '' },
        name: { type: String, default: '' },
        preview: { type: String, default: '' }, // thumbnail or text preview
    }],

    // Threading
    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'TeamChat' },

    // Reactions
    reactions: [{
        emoji: { type: String },
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    }],

    // Read receipts
    readBy: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        readAt: { type: Date, default: Date.now },
    }],

    // Pinned
    pinned: { type: Boolean, default: false },

    // Soft delete
    deleted: { type: Boolean, default: false },
}, { timestamps: true });

teamChatSchema.index({ organization: 1, channel: 1, createdAt: -1 });
teamChatSchema.index({ sender: 1 });
teamChatSchema.index({ replyTo: 1 });

export default mongoose.model('TeamChat', teamChatSchema);

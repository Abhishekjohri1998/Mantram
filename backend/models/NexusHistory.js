/**
 * NexusHistory — Persistent, subject-indexed conversation history for Fidato Nexus
 *
 * Design decisions:
 *  - Max 20 conversations per user (enforced by route layer, not schema)
 *  - Each conversation is a full thread with typed output attachments
 *  - Subject is auto-tagged by Fidato from the first user message
 *  - Types: 'image' | 'video' | 'content' | 'research' | 'chat'
 *  - When full: user is prompted to delete, later can purchase extra storage
 */

import mongoose from 'mongoose';

// ── Attachment: a rich output from Fidato (image, video, content text, etc.) ──
const OutputSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['image', 'video', 'content', 'research', 'avatar'],
        required: true,
    },
    url: { type: String, default: '' },         // S3 URL for image/video
    thumbnailUrl: { type: String, default: '' }, // S3 thumbnail for video
    prompt: { type: String, default: '' },       // Prompt used
    text: { type: String, default: '' },         // For content type outputs
    meta: { type: mongoose.Schema.Types.Mixed, default: {} }, // Extra: aspectRatio, model, duration, etc.
    createdAt: { type: Date, default: Date.now },
}, { _id: false });

// ── Message: a single chat turn ──
const MessageSchema = new mongoose.Schema({
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, default: '' },
    images: [{ type: String }],  // S3 URLs of user-uploaded images in this turn
    createdAt: { type: Date, default: Date.now },
}, { _id: false });

// ── Main History Thread ──
const NexusHistorySchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    brandId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Brand',
        default: null,
        index: true,
    },

    // Auto-tagged subject from first user message (can be renamed)
    subject: {
        type: String,
        default: 'New conversation',
        maxlength: 120,
        trim: true,
    },

    // Primary type of this conversation (derived from first significant output)
    type: {
        type: String,
        enum: ['chat', 'image', 'video', 'content', 'research'],
        default: 'chat',
        index: true,
    },

    // All messages in this thread
    messages: [MessageSchema],

    // Structured rich outputs (images, videos, content cards)
    outputs: [OutputSchema],

    // Pinned by user?
    isPinned: { type: Boolean, default: false },

    // Soft-delete
    isDeleted: { type: Boolean, default: false, index: true },

    // Timestamps auto-managed
}, { timestamps: true });

// ── Compound indexes ──
NexusHistorySchema.index({ userId: 1, isDeleted: 1, updatedAt: -1 });
NexusHistorySchema.index({ userId: 1, brandId: 1, isDeleted: 1, updatedAt: -1 });
NexusHistorySchema.index({ userId: 1, type: 1, isDeleted: 1, updatedAt: -1 });

// ── Static: count active conversations per user ──
NexusHistorySchema.statics.countForUser = function (userId) {
    return this.countDocuments({ userId, isDeleted: false });
};

// ── Static: get max allowed conversations (can be extended later) ──
NexusHistorySchema.statics.MAX_CONVERSATIONS = 20;

export default mongoose.model('NexusHistory', NexusHistorySchema);

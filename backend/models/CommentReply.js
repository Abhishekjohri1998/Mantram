/**
 * CommentReply Model
 * Logs every auto-reply the autonomous agent sends to Instagram/Facebook comments.
 * Used for auditing, analytics, and the "Recent Auto-Replies" UI in AI Settings.
 */

import mongoose from 'mongoose';

const commentReplySchema = new mongoose.Schema({
    brand:          { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true, index: true },
    user:           { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    platform:       { type: String, enum: ['instagram', 'facebook', 'page'], required: true },
    commentId:      { type: String, default: '' },
    postId:         { type: String, default: '' },
    commentText:    { type: String, default: '' },
    commenterName:  { type: String, default: 'Unknown' },
    commenterId:    { type: String, default: '' },
    replyText:      { type: String, default: '' },
    intent:         { type: String, default: 'unknown' },
    confidence:     { type: Number, default: 0 },
    action: {
        type: String,
        enum: ['comment_replied', 'comment_to_dm', 'skipped', 'error', 'no_action'],
        default: 'no_action',
    },
    replySource:    { type: String, enum: ['ai', 'template', 'none'], default: 'none' },
    errorMessage:   { type: String, default: '' },
    apiSuccess:     { type: Boolean, default: false },
}, { timestamps: true });

// Index for fast brand + date lookups
commentReplySchema.index({ brand: 1, createdAt: -1 });
commentReplySchema.index({ commentId: 1 }, { unique: true, sparse: true });

export default mongoose.model('CommentReply', commentReplySchema);

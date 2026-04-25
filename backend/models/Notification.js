/**
 * Notification — In-app notification for background job completions
 * TTL: 7 days via MongoDB expiresAt index
 */
import mongoose from 'mongoose';

const NotificationSchema = new mongoose.Schema(
    {
        user:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        brand:  { type: mongoose.Schema.Types.ObjectId, ref: 'Brand' },

        // Display
        title:  { type: String, required: true },
        body:   { type: String, default: '' },
        type:   {
            type: String,
            enum: ['monthly-strategy', 'research', 'video', 'creative', 'system'],
            default: 'system',
        },

        // Deep-link — where to navigate on click
        link:   { type: String, default: '' },

        // Source job (optional for traceability)
        jobId:  { type: String, index: true },

        read:   { type: Boolean, default: false, index: true },

        // TTL — auto-delete 7 days after creation
        expiresAt: {
            type: Date,
            default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            index: { expireAfterSeconds: 0 },
        },
    },
    { timestamps: true }
);

NotificationSchema.index({ user: 1, read: 1, createdAt: -1 });

export default mongoose.model('Notification', NotificationSchema);

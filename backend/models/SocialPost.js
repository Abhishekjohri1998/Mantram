import mongoose from 'mongoose';

const socialPostSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand' },

    // Target account
    platform: { type: String, required: true }, // instagram, facebook, linkedin, twitter
    accountId: { type: String, required: true },
    accountName: { type: String, default: '' },

    // Content
    caption: { type: String, default: '' },
    imageUrl: { type: String, default: '' },
    imageUrls: [{ type: String }], // For carousel/multi-image posts
    videoUrl: { type: String, default: '' }, // For video/reel posts

    // Platform response
    postId: { type: String, default: '' },
    postUrl: { type: String, default: '' },

    // Analytics — fetched from platform API after publishing (enriches strategy generation)
    analytics: {
        likes:       { type: Number, default: 0 },
        comments:    { type: Number, default: 0 },
        impressions: { type: Number, default: 0 },
        reach:       { type: Number, default: 0 },
        retweets:    { type: Number, default: 0 },  // Twitter/X only
        engagement:  { type: Number, default: 0 },  // Composite engagement (IG)
        fetchedAt:   { type: Date, default: null },
    },

    // Status
    status: {
        type: String,
        enum: ['published', 'scheduled', 'processing', 'failed', 'cancelled'],
        default: 'published'
    },
    error: { type: String, default: '' },

    // Scheduling
    scheduledFor: { type: Date },
    processingStartedAt: { type: Date, default: null },

    // Source traceability — which studio/workflow created this post
    sourceType: {
        type: String,
        enum: ['manual', 'strategy', 'creative', 'content', 'video'],
        default: 'manual',
    },
    sourceTitle:      { type: String, default: '' },         // Human-readable source label
    calendarItemId:   { type: String, default: null },       // Strategy calendarItem._id (string)
    strategyId:       { type: mongoose.Schema.Types.ObjectId, ref: 'MonthlyStrategy', default: null },

    // Retry tracking — used by scheduledPostPublisher for exponential backoff
    retryCount:  { type: Number, default: 0 },   // Number of publish attempts so far
    lastRetryAt: { type: Date, default: null },   // When the last retry was attempted
    maxRetries:  { type: Number, default: 3 },    // Max retries before permanent failure

    // Reminder tracking — used by scheduledPostPublisher to send 1-hr email
    reminderSentAt: { type: Date, default: null },

    // Timestamps
    publishedAt: { type: Date },

}, { timestamps: true });

socialPostSchema.index({ user: 1, status: 1 });
socialPostSchema.index({ user: 1, brand: 1 });
socialPostSchema.index({ scheduledFor: 1, status: 1 });
socialPostSchema.index({ brand: 1, scheduledFor: 1 }); // For calendar queries
socialPostSchema.index({ scheduledFor: 1, status: 1, reminderSentAt: 1 }); // For reminder queries

export default mongoose.model('SocialPost', socialPostSchema);

import mongoose from 'mongoose';

const postSchema = new mongoose.Schema({
    type: { type: String }, // 'founder_story', 'product_insight', 'standalone', 'thread', etc.
    content: { type: String, required: true },
    hashtags: [String],
    bestTime: String,
    posted: { type: Boolean, default: false },
    postedAt: Date,
}, { _id: false });

const instagramSlideSchema = new mongoose.Schema({
    slideNumber: Number,
    text: String,
    visualDescription: String,
}, { _id: false });

const storySlideSchema = new mongoose.Schema({
    slideNumber: Number,
    type: { type: String, enum: ['text', 'image', 'video', 'poll', 'quiz', 'countdown'] },
    text: String,
    visualDescription: String,
    ctaText: String,
    stickerSuggestion: String,
}, { _id: false });

const twitterPostSchema = new mongoose.Schema({
    type: { type: String, enum: ['standalone', 'thread'] },
    tweets: [String],
    bestTime: String,
    posted: { type: Boolean, default: false },
    postedAt: Date,
}, { _id: false });

const redditPostSchema = new mongoose.Schema({
    subreddit: String,
    title: String,
    body: String,
    tone: String,
    bestTime: String,
    posted: { type: Boolean, default: false },
    postedAt: Date,
}, { _id: false });

const growthContentSchema = new mongoose.Schema({
    date: { type: Date, required: true, index: true },
    dateKey: { type: String, required: true, unique: true }, // 'YYYY-MM-DD' for fast lookup
    dayOfWeek: { type: String, enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] },
    theme: { type: String },
    status: { type: String, enum: ['generated', 'partial', 'posted', 'skipped'], default: 'generated' },

    linkedin: [postSchema],

    instagram: {
        post: {
            caption: String,
            hashtags: [String],
            slides: [instagramSlideSchema],
            bestTime: String,
            posted: { type: Boolean, default: false },
            postedAt: Date,
        },
        story: {
            slides: [storySlideSchema],
            posted: { type: Boolean, default: false },
            postedAt: Date,
        },
    },

    twitter: [twitterPostSchema],

    reddit: [redditPostSchema],

    metadata: {
        generatedAt: Date,
        model: String,
        tokensUsed: Number,
        trendingTopics: [String],
        contentBankIndicesUsed: [Number], // Track which talking points were used to avoid repetition
    },
}, { timestamps: true });

// Compound index for efficient queries
growthContentSchema.index({ dateKey: 1 });
growthContentSchema.index({ createdAt: -1 });

export default mongoose.model('GrowthContent', growthContentSchema);

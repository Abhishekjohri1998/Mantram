import mongoose from 'mongoose';

// Core RLHF data — every user interaction with AI output is stored here
const feedbackSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true },

    // What was generated
    contentType: { type: String, required: true }, // social, blog, ad, image, etc.
    contentId: { type: mongoose.Schema.Types.ObjectId }, // ref to Content or Creative
    prompt: { type: String, default: '' },
    aiOutput: { type: String, default: '' },

    // Feedback signals
    signalType: {
        type: String,
        enum: [
            'rating',          // explicit 1-5 star rating
            'thumbs',          // thumbs up/down
            'edit',            // user edited the output
            'regenerate',      // user asked to regenerate (negative)
            'accept',          // user accepted as-is (strong positive)
            'publish',         // user published without edits (strongest positive)
            'select_variant',  // user chose this from multiple options
            'reject_variant',  // user rejected this variant
            'style_adjust',    // user adjusted style parameters
        ],
        required: true,
    },

    // Signal data
    rating: { type: Number, min: 1, max: 5 }, // for 'rating' type
    thumbs: { type: String, enum: ['up', 'down'] }, // for 'thumbs' type
    editBefore: { type: String, default: '' }, // original AI output
    editAfter: { type: String, default: '' }, // user's edited version
    styleAdjustments: { type: mongoose.Schema.Types.Mixed }, // voice/tone slider changes

    // Context at time of feedback
    context: {
        provider: { type: String, default: '' },
        model: { type: String, default: '' },
        systemPromptVersion: { type: Number, default: 1 },
        temperature: { type: Number },
        brandVoiceSettings: { type: mongoose.Schema.Types.Mixed },
    },

    // Computed
    sentimentScore: { type: Number, default: 0, min: -1, max: 1 }, // -1 negative, 0 neutral, 1 positive
    processed: { type: Boolean, default: false }, // has this been used to update preferences

}, { timestamps: true });

feedbackSchema.index({ user: 1, brand: 1, signalType: 1 });
feedbackSchema.index({ processed: 1 });
feedbackSchema.index({ brand: 1, contentType: 1, createdAt: -1 });

// Compute sentiment score before save
feedbackSchema.pre('save', function () {
    const scores = {
        publish: 1.0,
        accept: 0.8,
        select_variant: 0.6,
        thumbs: this.thumbs === 'up' ? 0.7 : -0.5,
        rating: ((this.rating || 3) - 3) / 2,
        edit: 0.2,
        style_adjust: 0.0,
        regenerate: -0.6,
        reject_variant: -0.4,
    };
    this.sentimentScore = scores[this.signalType] || 0;
});

export default mongoose.model('Feedback', feedbackSchema);

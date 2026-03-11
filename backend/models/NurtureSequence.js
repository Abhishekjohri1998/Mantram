import mongoose from 'mongoose';

/**
 * NurtureSequence — Multi-channel nurture automation tied to funnel stages.
 * Each sequence has ordered steps with channel type, delay, content, and conditions.
 * Steps can trigger DMs, emails, notifications, or content generation.
 */

// ── Step Schema ──
const nurtureStepSchema = new mongoose.Schema({
    order: { type: Number, required: true },
    name: { type: String, default: '' },

    // Channel configuration
    channel: {
        type: String,
        enum: ['dm', 'email', 'sms', 'whatsapp', 'push_notification', 'internal_task'],
        default: 'dm',
    },

    // Delay before executing this step (from previous step or trigger)
    delay: {
        value: { type: Number, default: 0 },
        unit: { type: String, enum: ['minutes', 'hours', 'days'], default: 'hours' },
    },

    // Content
    subject: { type: String, default: '' },       // For email/notification
    content: { type: String, default: '' },        // Message body / template
    contentType: { type: String, enum: ['text', 'html', 'template', 'ai_generated'], default: 'text' },

    // AI content generation config
    aiPrompt: { type: String, default: '' },       // Custom AI prompt for this step
    aiTone: { type: String, default: '' },         // Override tone (e.g. 'friendly', 'urgent', 'educational')
    aiContentType: { type: String, default: '' },  // What to generate: 'nurture_email', 'follow_up_dm', 'offer_message'

    // Conditions (optional — skip step if not met)
    condition: {
        field: { type: String, default: '' },      // e.g. 'score', 'status', 'source', 'tags'
        operator: { type: String, enum: ['equals', 'not_equals', 'gt', 'lt', 'contains', 'exists', ''], default: '' },
        value: { type: String, default: '' },
    },

    // Action after step
    onComplete: {
        moveToStage: { type: String, default: '' },   // Auto-move entry to a different stage
        addTag: { type: String, default: '' },          // Tag the entry
        updateScore: { type: Number, default: 0 },      // Bump score by N
    },

    // Step metrics
    metrics: {
        sent: { type: Number, default: 0 },
        opened: { type: Number, default: 0 },
        clicked: { type: Number, default: 0 },
        replied: { type: Number, default: 0 },
        skipped: { type: Number, default: 0 },
    },
}, { _id: true });


// ── Main Nurture Sequence Schema ──
const nurtureSequenceSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true },
    funnel: { type: mongoose.Schema.Types.ObjectId, ref: 'Funnel', required: true },

    name: { type: String, required: true },
    description: { type: String, default: '' },

    // Which funnel stage triggers this sequence
    triggerStage: { type: String, required: true },
    triggerEvent: {
        type: String,
        enum: ['stage_enter', 'stage_exit', 'manual', 'score_threshold', 'time_in_stage'],
        default: 'stage_enter',
    },
    triggerConfig: {
        scoreThreshold: { type: Number, default: 0 },       // For score_threshold trigger
        timeInStageHours: { type: Number, default: 0 },      // For time_in_stage trigger
    },

    // Ordered steps
    steps: [nurtureStepSchema],

    // Sequence-level settings
    settings: {
        maxRunsPerEntry: { type: Number, default: 1 },       // Max times an entry runs through this sequence
        stopOnConversion: { type: Boolean, default: true },  // Stop if entry converts
        stopOnReply: { type: Boolean, default: false },      // Stop if entry replies
        respectQuietHours: { type: Boolean, default: true }, // Don't send between 10pm-8am
        quietHoursStart: { type: Number, default: 22 },      // 10 PM
        quietHoursEnd: { type: Number, default: 8 },         // 8 AM
    },

    // Status
    status: { type: String, enum: ['draft', 'active', 'paused', 'archived'], default: 'draft' },

    // AI-generated metadata
    aiGenerated: { type: Boolean, default: false },
    aiPrompt: { type: String, default: '' },

    // Aggregate metrics
    metrics: {
        totalRuns: { type: Number, default: 0 },
        completedRuns: { type: Number, default: 0 },
        totalSent: { type: Number, default: 0 },
        totalOpened: { type: Number, default: 0 },
        totalClicked: { type: Number, default: 0 },
        totalReplied: { type: Number, default: 0 },
        conversionRate: { type: Number, default: 0 },
    },

}, { timestamps: true });

nurtureSequenceSchema.index({ user: 1, brand: 1 });
nurtureSequenceSchema.index({ funnel: 1, triggerStage: 1 });
nurtureSequenceSchema.index({ status: 1 });

export default mongoose.model('NurtureSequence', nurtureSequenceSchema);

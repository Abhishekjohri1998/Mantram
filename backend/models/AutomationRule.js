import mongoose from 'mongoose';

/**
 * AutomationRule — The brain of Funnel Studio's agentic engine.
 * Each rule: WHEN [trigger + conditions] → THEN [actions]
 */

// ── Condition Schema ──
const conditionSchema = new mongoose.Schema({
    field: {
        type: String,
        required: true,
        // 'score', 'stage', 'source', 'status', 'daysSinceLastActivity', 'touchpointCount', 'hasEmail', 'hasPhone', 'tag'
    },
    operator: {
        type: String,
        enum: ['equals', 'not_equals', 'greater_than', 'less_than', 'contains', 'not_contains', 'exists', 'not_exists'],
        default: 'equals',
    },
    value: { type: mongoose.Schema.Types.Mixed }, // string, number, boolean depending on field
}, { _id: false });

// ── Action Schema ──
const actionSchema = new mongoose.Schema({
    type: {
        type: String,
        required: true,
        enum: [
            'move_stage',         // Move entry to another stage
            'change_status',      // active, converted, lost, paused
            'update_score',       // Add/subtract score points
            'add_tag',            // Tag the entry
            'remove_tag',         // Remove tag
            'start_nurture',      // Trigger a nurture sequence
            'send_notification',  // In-app notification or email alert
            'trigger_studio',     // Cross-studio action (content, creative, PM)
            'assign_team',        // Assign to team member
            'add_touchpoint',     // Log a touchpoint
        ],
    },
    // Action-specific config
    targetStage: { type: String },           // for move_stage
    targetStatus: { type: String },          // for change_status
    scoreChange: { type: Number },           // for update_score (+/- points)
    tagName: { type: String },               // for add_tag / remove_tag
    nurtureSequenceId: { type: mongoose.Schema.Types.ObjectId, ref: 'NurtureSequence' },
    studioName: { type: String },            // for trigger_studio
    studioAction: { type: String },          // for trigger_studio
    notificationMessage: { type: String },   // for send_notification
    teamMemberId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    touchpointType: { type: String },        // for add_touchpoint
    touchpointDetails: { type: String },     // for add_touchpoint
}, { _id: false });

// ── Execution Log Schema ──
const executionLogSchema = new mongoose.Schema({
    entryId: { type: mongoose.Schema.Types.ObjectId, ref: 'FunnelEntry' },
    entryName: { type: String },
    actionsExecuted: [{ type: String }], // human-readable action descriptions
    executedAt: { type: Date, default: Date.now },
}, { _id: false });

// ── Main AutomationRule Schema ──
const automationRuleSchema = new mongoose.Schema({
    funnel: { type: mongoose.Schema.Types.ObjectId, ref: 'Funnel', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true },

    name: { type: String, required: true },
    description: { type: String, default: '' },
    icon: { type: String, default: 'bolt' },
    color: { type: String, default: '#f59e0b' },

    // Trigger: What event kicks off this rule?
    trigger: {
        type: {
            type: String,
            required: true,
            enum: [
                'entry_created',        // New entry added to funnel
                'stage_changed',        // Entry moved to a new stage
                'score_changed',        // Entry score updated
                'status_changed',       // Entry status changed
                'inactivity',           // Entry inactive for X days
                'form_submitted',       // Landing page form submitted
                'touchpoint_added',     // New touchpoint logged
                'score_threshold',      // Score crosses a threshold
                'manual',               // Manually triggered by user
            ],
        },
        // Trigger-specific config
        fromStage: { type: String },      // for stage_changed
        toStage: { type: String },        // for stage_changed
        scoreThreshold: { type: Number }, // for score_threshold
        scoreDirection: { type: String, enum: ['above', 'below'] }, // for score_threshold
        inactivityDays: { type: Number }, // for inactivity
        pageId: { type: mongoose.Schema.Types.ObjectId, ref: 'FunnelPage' }, // for form_submitted
    },

    // Conditions: Additional filters (all must match)
    conditions: [conditionSchema],

    // Actions: What to do when triggered (executed in order)
    actions: [actionSchema],

    // Status
    enabled: { type: Boolean, default: true },
    priority: { type: Number, default: 0 }, // higher = runs first

    // Execution tracking
    executionCount: { type: Number, default: 0 },
    lastExecutedAt: { type: Date },
    recentExecutions: [executionLogSchema], // last 20

    // AI-generated metadata
    aiGenerated: { type: Boolean, default: false },
    aiPrompt: { type: String, default: '' },

}, { timestamps: true });

automationRuleSchema.index({ funnel: 1, enabled: 1 });
automationRuleSchema.index({ user: 1, brand: 1 });
automationRuleSchema.index({ 'trigger.type': 1 });

export default mongoose.model('AutomationRule', automationRuleSchema);

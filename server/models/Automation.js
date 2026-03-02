import mongoose from 'mongoose';

// ── Flow Node Schema ──
const flowNodeSchema = new mongoose.Schema({
    nodeId: { type: String, required: true }, // Unique ID within the flow
    type: {
        type: String,
        required: true,
        enum: [
            'send_message',       // Send a text/image message
            'quick_replies',      // Show button options
            'ask_question',       // Ask and save answer to contact field
            'condition',          // If/else branching
            'tag_user',           // Add tag to contact
            'delay',              // Wait before next step
            'action',             // Webhook / assign agent
            'human_handoff',      // Transfer to human
            'end',                // End automation
        ],
    },
    label: { type: String, default: '' },
    config: {
        // send_message
        messageText: { type: String, default: '' },
        messageType: { type: String, default: 'text' },
        imageUrl: { type: String, default: '' },

        // quick_replies / buttons
        buttons: [{
            label: { type: String },
            value: { type: String },
            nextNodeId: { type: String }, // Which node to go to
        }],

        // ask_question
        questionText: { type: String, default: '' },
        saveToField: { type: String, default: '' }, // e.g. "email", "phone", "name"

        // condition
        conditionField: { type: String, default: '' },    // What to check
        conditionOperator: { type: String, default: 'equals' }, // equals, contains, exists
        conditionValue: { type: String, default: '' },
        trueNodeId: { type: String, default: '' },
        falseNodeId: { type: String, default: '' },

        // tag_user
        tagName: { type: String, default: '' },

        // delay
        delaySeconds: { type: Number, default: 0 },

        // action
        webhookUrl: { type: String, default: '' },
        assignToUserId: { type: String, default: '' },
    },
    // Position for visual editor
    position: {
        x: { type: Number, default: 0 },
        y: { type: Number, default: 0 },
    },
    nextNodeId: { type: String, default: '' }, // Default next node (linear flow)
}, { _id: false });


// ── Trigger Schema ──
const triggerSchema = new mongoose.Schema({
    type: {
        type: String,
        required: true,
        enum: [
            'dm_received',        // Any DM
            'keyword_match',      // DM contains keyword
            'intent_detected',    // AI intent classification
            'comment_keyword',    // Comment contains keyword
            'comment_any',        // Any comment on selected post
            'story_reply',        // Story reply
            'story_mention',      // Story mention
        ],
    },
    keywords: [{ type: String }],       // For keyword-based triggers
    intent: { type: String, default: '' }, // For intent-based triggers
    postId: { type: String, default: '' }, // For comment triggers on specific post
}, { _id: false });


// ── Main Automation Schema ──
const automationSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true },

    name: { type: String, required: true },
    description: { type: String, default: '' },
    icon: { type: String, default: 'bolt' },
    color: { type: String, default: '#6366f1' },

    // Recipe type
    recipe: {
        type: String,
        enum: ['faq_auto_reply', 'lead_capture', 'comment_to_dm', 'product_recommendation', 'custom'],
        default: 'custom',
    },

    // Status
    isActive: { type: Boolean, default: false },
    status: { type: String, enum: ['draft', 'active', 'paused', 'archived'], default: 'draft' },

    // Triggers
    triggers: [triggerSchema],

    // Flow
    nodes: [flowNodeSchema],
    startNodeId: { type: String, default: '' },

    // Language
    language: { type: String, default: 'en' }, // en, hi, hinglish, auto
    usesBrandVoice: { type: Boolean, default: true },

    // Stats
    stats: {
        totalRuns: { type: Number, default: 0 },
        completedRuns: { type: Number, default: 0 },
        droppedRuns: { type: Number, default: 0 },
        leadsCollected: { type: Number, default: 0 },
        avgCompletionRate: { type: Number, default: 0 },
    },

}, { timestamps: true });

automationSchema.index({ user: 1, brand: 1 });
automationSchema.index({ isActive: 1, 'triggers.type': 1 });
automationSchema.index({ recipe: 1 });

export default mongoose.model('Automation', automationSchema);

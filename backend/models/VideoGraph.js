/**
 * VideoGraph — The canonical graph model for the Canvas Copilot.
 *
 * One VideoGraph per VideoAgentSession (lazy-created when user opens the canvas).
 * The graph is the single source of truth for the workflow node canvas.
 * All mutations go through the Command Bus (commandBus.js), never direct DB writes.
 */

import mongoose from 'mongoose';

const PortSchema = new mongoose.Schema({
    id:       { type: String, required: true },
    type:     { type: String, required: true },  // text|image|video|audio|mask|number|asset_list|ref
    label:    { type: String, default: '' },
    required: { type: Boolean, default: false },
    multi:    { type: Boolean, default: false },  // true = accepts multiple edges
}, { _id: false });

const NodePortsSchema = new mongoose.Schema({
    inputs:  { type: [PortSchema], default: [] },
    outputs: { type: [PortSchema], default: [] },
}, { _id: false });

const NodeSchema = new mongoose.Schema({
    id:        { type: String, required: true },
    type:      { type: String, required: true },  // must be in NODE_CATALOG
    position:  {
        x: { type: Number, default: 100 },
        y: { type: Number, default: 100 },
    },
    params:    { type: mongoose.Schema.Types.Mixed, default: {} },
    ports:     { type: NodePortsSchema },
    state:     {
        type: String,
        enum: ['idle', 'queued', 'running', 'done', 'error', 'cached', 'stale'],
        default: 'idle',
    },
    outputRef: { type: String, default: null },  // S3 asset URL once generated
    author:    { type: String, enum: ['user', 'agent'], default: 'user' },
    error:     { type: String, default: null },
    _cacheKey: { type: String, default: null },   // hash of (type+params+upstreamInputs) for cache lookup
}, { _id: false });

const EdgeSchema = new mongoose.Schema({
    id:     { type: String, required: true },
    from:   {
        node: { type: String, required: true },
        port: { type: String, required: true },
    },
    to:     {
        node: { type: String, required: true },
        port: { type: String, required: true },
    },
    author: { type: String, enum: ['user', 'agent'], default: 'user' },
}, { _id: false });

const UndoEntrySchema = new mongoose.Schema({
    command:     { type: mongoose.Schema.Types.Mixed },  // original command
    inverse:     { type: mongoose.Schema.Types.Mixed },  // inverse command (for undo)
    version:     { type: Number },
    author:      { type: String },
    commandId:   { type: String },                       // idempotency key
    ts:          { type: Number, default: Date.now },
}, { _id: false });

const VideoGraphSchema = new mongoose.Schema({
    graphId:   { type: String, required: true, unique: true, index: true },
    session:   { type: mongoose.Schema.Types.ObjectId, ref: 'VideoAgentSession', required: true, index: true },
    user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    brand:     { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', default: null },

    // Monotonic version — incremented by every applied command.
    // Used for STALE_BASE conflict detection.
    version:   { type: Number, default: 0 },

    nodes: { type: [NodeSchema], default: [] },
    edges: { type: [EdgeSchema], default: [] },

    // Custom prompt enhancer presets saved at project scope
    customPresets: { type: [mongoose.Schema.Types.Mixed], default: [] },

    // Undo / redo stacks (capped at 50 entries each)
    undoStack: { type: [UndoEntrySchema], default: [] },
    redoStack: { type: [UndoEntrySchema], default: [] },

    // Active run metadata (null when not running)
    activeRun: {
        runId:     { type: String, default: null },
        startedAt: { type: Date,   default: null },
        status:    { type: String, enum: ['running', 'completed', 'cancelled', 'failed', null], default: null },
    },

    // Spend gate policy for this project
    spendPolicy: {
        mode:           { type: String, enum: ['manual', 'budgeted', 'free_only'], default: 'manual' },
        budgetCredits:  { type: Number, default: 0 },  // only used in 'budgeted' mode
        sessionSpent:   { type: Number, default: 0 },  // running total for budgeted mode
    },

}, { timestamps: true });

// TTL: expire graphs after 7 days (graphs last longer than sessions — user may resume)
VideoGraphSchema.index({ createdAt: 1 }, { expireAfterSeconds: 604800 });
VideoGraphSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model('VideoGraph', VideoGraphSchema);

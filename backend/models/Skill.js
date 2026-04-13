import mongoose from 'mongoose';

// ─── Input Field Schema ───────────────────────────────────────────────────────
const inputFieldSchema = new mongoose.Schema({
    name:         { type: String, required: true },
    label:        { type: String, required: true },
    type:         { type: String, enum: ['text', 'textarea', 'select', 'url', 'number', 'toggle', 'image_upload', 'image_library', 'multi_text', 'date_picker'], default: 'text' },
    required:     { type: Boolean, default: false },
    placeholder:  String,
    options:      [String],      // for select type
    defaultValue: String,
    helpText:     String,        // shown as field description
}, { _id: false });

// ─── MCP Action Schema ────────────────────────────────────────────────────────
// Each action is a tool call the skill can invoke during execution
const mcpActionSchema = new mongoose.Schema({
    tool:        { type: String, required: true },  // e.g. 'creative_studio.generate_image'
    label:       String,                            // human-readable step label
    params:      { type: mongoose.Schema.Types.Mixed, default: {} }, // static params + {{template}} vars
    condition:   String,                            // optional: JS condition string to skip
    optional:    { type: Boolean, default: false },
}, { _id: false });

// ─── Main Skill Schema ────────────────────────────────────────────────────────
const skillSchema = new mongoose.Schema({

    // ── Ownership ──
    user:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    brand:      { type: mongoose.Schema.Types.ObjectId, ref: 'Brand' },
    visibility: { type: String, enum: ['private', 'team', 'mantram_users'], default: 'private' },

    // ─── Skill Type (the core new field) ───────────────────────────────────────
    // text_output   → AI generates structured text/JSON (legacy default)
    // generate_image → invokes Creative Studio to generate image(s)
    // generate_video → invokes Video Studio to queue video generation
    // create_content → generates content and saves it to Content Studio / Calendar
    // orchestrate   → chains multiple tool calls in sequence (multi-step agent)
    skillType: {
        type: String,
        enum: ['text_output', 'generate_image', 'generate_video', 'create_content', 'orchestrate'],
        default: 'text_output',
    },

    // ── Metadata (loaded for matching — lightweight) ──
    name:        { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    category:    {
        type: String,
        enum: ['content', 'creative', 'seo', 'social', 'performance', 'video', 'general'],
        default: 'general',
    },
    tags:   [String],
    icon:   { type: String, default: 'auto_awesome' },
    color:  { type: String, default: 'violet' },

    // ── Instructions (loaded only when activated/executed) ──
    instructions:    { type: String, required: true },
    systemPrompt:    String,
    modelPreference: { type: String, enum: ['auto', 'grok', 'gemini', 'claude', 'openai'], default: 'auto' },
    temperature:     { type: Number, default: 0.7, min: 0, max: 2 },

    // ── Input Schema ──
    inputFields: [inputFieldSchema],

    // ── MCP Tool Actions (new) ────────────────────────────────────────────────
    // The ordered list of tool calls this skill will invoke at runtime.
    // Only relevant for generate_image / generate_video / create_content / orchestrate types.
    mcpActions: [mcpActionSchema],

    // ── Output Configuration ──
    outputFormat: { type: String, enum: ['markdown', 'json', 'html', 'structured', 'image', 'video', 'mixed'], default: 'structured' },

    // What to do with the AI output automatically:
    //   display       → show in UI only (default)
    //   save_to_content → auto-save to Content Studio as draft(s)
    //   save_to_calendar → auto-save and schedule in Smart Calendar
    //   queue_generation → queue a generation job (image/video)
    //   chain         → pipe output as input to chainSkillId
    outputAction: { type: String, enum: ['display', 'save_to_content', 'save_to_calendar', 'queue_generation', 'chain'], default: 'display' },

    // Reference to next skill in a chain
    chainSkillId: { type: mongoose.Schema.Types.ObjectId, ref: 'Skill' },
    // Maps output keys of this skill → input field names of the chained skill
    // e.g. { "campaignTheme": "theme", "adCopy": "brief" }
    chainInputMap: { type: Map, of: String, default: {} },

    // ── Credit Cost Estimate ──────────────────────────────────────────────────
    // Shown upfront before execution so user knows the cost.
    // Set manually per skill; updated by the execution engine from actuals.
    estimatedCreditCost: { type: Number, default: 1 },   // credits consumed per run
    creditAction:        { type: String, default: 'content' }, // maps to requireCredits() middleware key

    // ── Examples ──
    exampleOutput: String,

    // ── Chain Support ──
    chainable:           { type: Boolean, default: true },
    suggestedNextSkills: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Skill' }],

    // ── Analytics ──
    usageCount:  { type: Number, default: 0 },
    avgRating:   { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0 },
    lastUsedAt:  Date,

    // ── Versioning ──
    version:   { type: Number, default: 1 },
    changelog: [{
        version: Number,
        changes: String,
        date:    { type: Date, default: Date.now },
    }],

    // ── Status ──
    status: { type: String, enum: ['active', 'draft', 'deprecated'], default: 'draft' },

    // ── Pre-built flag (Mantram-curated, cannot be deleted by user) ──
    isPrebuilt: { type: Boolean, default: false },

    // ── Marketplace fields (Phase 1: Mantram users only) ──
    isPublished:    { type: Boolean, default: false },  // published to Mantram marketplace
    publishedAt:    Date,
    publisherName:  String,                             // display name of publisher
    installCount:   { type: Number, default: 0 },       // how many users installed it
    originalSkillId: { type: mongoose.Schema.Types.ObjectId, ref: 'Skill' }, // if installed from marketplace

}, { timestamps: true });

// ─── Indexes ──────────────────────────────────────────────────────────────────
skillSchema.index({ user: 1, status: 1 });
skillSchema.index({ visibility: 1, status: 1, category: 1 });
skillSchema.index({ tags: 1 });
skillSchema.index({ isPrebuilt: 1, status: 1 });
skillSchema.index({ isPublished: 1, status: 1, installCount: -1 }); // marketplace browse
skillSchema.index({ skillType: 1, status: 1 });

export default mongoose.model('Skill', skillSchema);

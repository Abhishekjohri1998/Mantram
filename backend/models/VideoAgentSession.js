import mongoose from 'mongoose';

/**
 * VideoAgentSession — 5-Stage AI Video Agent pipeline state
 *
 * Stages (sequential, each requires previous gate approval):
 *   1. ANALYZE  — multimodal input analysis (auto)
 *   2. PLAN     — creative plan generation (gate: planApproved)
 *   3. REFS     — reference image generation (gate: refsApproved)
 *   4. STORYBOARD — storyboard generation (gate: storyboardApproved)
 *   5. MODEL    — model selection + prompt build (gate: modelApproved)
 *   6. GENERATE — video generation (async + polling)
 */
const VideoAgentSessionSchema = new mongoose.Schema({
    sessionId: { type: String, required: true, unique: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', default: null, index: true },

    // ── Current gate stage ──────────────────────────────────────────────────────
    stage: {
        type: String,
        enum: ['analyze', 'plan', 'refs', 'storyboard', 'model', 'generate', 'done', 'failed'],
        default: 'analyze',
    },

    // ── Gate approval flags (set by user, validated by each downstream route) ──
    planApproved:       { type: Boolean, default: false },
    refsApproved:       { type: Boolean, default: false },
    storyboardApproved: { type: Boolean, default: false },
    modelApproved:      { type: Boolean, default: false },

    // ── Stage 1 — Input ─────────────────────────────────────────────────────────
    input: {
        brief:       { type: String, default: '' },
        images:      [{ url: String, label: String, source: String }],   // uploaded refs
        videoUrl:    { type: String, default: '' },                       // optional video input
        productId:   { type: String, default: null },
        productImages: [{ type: String }],
        audioFileUrl:  { type: String, default: '' },
        characterPhoto: { type: String, default: '' },
        characterDescriptions: { type: String, default: '' },
    },

    // ── Stage 1 — Analysis Result ───────────────────────────────────────────────
    analysis: {
        contentType:         { type: String, default: '' },    // 'product-ad', 'ugc', 'brand-story', 'explainer', 'social-reel'
        brandCategory:       { type: String, default: '' },    // 'fashion', 'beauty', 'food', 'tech', etc.
        detectedStyle:       { type: String, default: '' },    // 'cinematic', 'raw-ugc', 'minimalist', etc.
        productFeatures:     [{ type: String }],
        audienceProfile:     { type: String, default: '' },
        toneKeywords:        [{ type: String }],
        suggestedDuration:   { type: Number, default: 30 },
        suggestedRatio:      { type: String, default: '9:16' },
        hasCharacter:        { type: Boolean, default: false },
        hasProduct:          { type: Boolean, default: false },
        hasLocation:         { type: Boolean, default: false },
        visualGrounding:     { type: mongoose.Schema.Types.Mixed, default: null }, // MCoT result
        summary:             { type: String, default: '' },    // Human-readable analysis summary for chat
    },

    // ── Stage 2 — Creative Plan ─────────────────────────────────────────────────
    plan: {
        title:           { type: String, default: '' },
        videoType:       { type: String, default: 'ad-film' }, // 'ad-film', 'ugc', 'product-demo', 'social-reel', 'explainer', 'brand-story'
        narrativeArc:    { type: String, default: '' },
        hookStrategy:    { type: String, default: '' },
        duration:        { type: Number, default: 30 },        // user-editable
        ratio:           { type: String, default: '9:16' },    // user-editable
        style:           { type: String, default: 'hyperrealistic' }, // 'hyperrealistic', '3d', '2d'
        styleGuide:      { type: String, default: '' },        // color/mood/pacing description
        scenePlan:       [{ role: String, duration: Number, purpose: String }],
        modelRecommendation: { type: String, default: 'seedance-2.0' },
        refsNeeded:      {
            character: { type: Boolean, default: false },
            product:   { type: Boolean, default: false },
            location:  { type: Boolean, default: false },
        },
    },

    // ── Stage 3 — Reference Images ───────────────────────────────────────────────
    refs: {
        characterRefs: [{ url: String, label: String, approved: Boolean }],
        productRefs:   [{ url: String, label: String, approved: Boolean }],
        locationRefs:  [{ url: String, label: String, approved: Boolean }],
        // All approved ref image URLs, in order for @image tagging
        approvedUrls:  [{ type: String }],
    },

    // ── Stage 4 — Storyboard ─────────────────────────────────────────────────────
    storyboard: {
        // storyboardDirector.js full output
        colorPalette:          [{ type: String }],
        paletteNames:          [{ type: String }],
        materialNotes:         { type: String, default: '' },
        environmentFingerprint: { type: String, default: '' },
        cuts:                  { type: mongoose.Schema.Types.Mixed, default: [] },
        moodKeywords:          [{ type: String }],
        cinematographyRules:   { type: String, default: '' },
        emotionalArc:          { type: String, default: '' },
        narrativeArc:          { type: String, default: '' },
        hookStrategy:          { type: String, default: '' },
        imagePrompt:           { type: String, default: '' },
        // Generated storyboard poster image URL
        posterUrl:             { type: String, default: '' },
        totalDuration:         { type: Number, default: 0 },
    },

    // ── Stage 5 — Model Selection ────────────────────────────────────────────────
    modelSelection: {
        model:          { type: String, default: 'seedance-2.0' },
        resolution:     { type: String, default: '1080p' },
        qualityMode:    { type: String, default: 'fast' },
        finalPrompt:    { type: String, default: '' },   // model-specific final video prompt
        costEstimate:   { type: mongoose.Schema.Types.Mixed, default: {} },
    },

    // ── Stage 6 — Generation ─────────────────────────────────────────────────────
    generation: {
        isLongForm:     { type: Boolean, default: false },
        longFormJobId:  { type: String, default: '' },
        scenes: [{
            sceneId:    { type: Number },
            projectId:  { type: String },    // VideoProject _id for each scene
            status:     { type: String, enum: ['pending', 'generating', 'done', 'failed'], default: 'pending' },
            videoUrl:   { type: String, default: '' },
            progress:   { type: Number, default: 0 },
            error:      { type: String, default: '' },
        }],
        finalVideoUrl:  { type: String, default: '' },
        compiledAt:     { type: Date },
        error:          { type: String, default: '' },
    },

    // ── Chat messages (agent ↔ user dialogue, persisted for context) ──
    messages: [{ type: mongoose.Schema.Types.Mixed }],

    creditsUsed: { type: Number, default: 0 },

}, { timestamps: true });

// Auto-expire sessions after 48 hours
VideoAgentSessionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 172800 });
VideoAgentSessionSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model('VideoAgentSession', VideoAgentSessionSchema);

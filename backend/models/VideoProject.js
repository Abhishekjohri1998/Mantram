import mongoose from 'mongoose';

/**
 * VideoProject — Stores the full state of a video creation project.
 * Each project flows through the multi-agent pipeline:
 *   brainstorm → script → references → routing → generating → critique → editing → done
 */
const videoProjectSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', index: true },
    title: { type: String, default: 'Untitled Video' },

    // ── Current pipeline status ──
    status: {
        type: String,
        enum: ['brainstorm', 'script', 'voiceover', 'references', 'routing', 'generating', 'critique', 'editing', 'done', 'failed', 'advanced-generating'],
        default: 'brainstorm',
    },
    checkpoint: { type: Number, default: 0 }, // for resumability

    // ── Studio mode ──
    mode: { type: String, enum: ['advanced', 'storyboard', 'ugc', 'agent-scene', 'image-to-video'], default: 'storyboard' },

    // ── Advanced Mode Config (power-user direct generation) ──
    advancedConfig: {
        prompt: { type: String, default: '' },
        enhancedPrompt: { type: String, default: '' },
        firstImageUrl: { type: String, default: '' },
        lastImageUrl: { type: String, default: '' },
        referenceImages: [{ url: String, label: String }],
        aspectRatio: { type: String, default: '16:9' },
        duration: { type: Number, default: 5 },
        generateAudio: { type: Boolean, default: true },
    },

    // ── Duration Extension — segments for chaining ──
    segments: [{
        segmentIndex: { type: Number },
        videoUrl: { type: String, default: '' },
        duration: { type: Number },
        status: { type: String, enum: ['pending', 'generating', 'completed', 'failed'], default: 'pending' },
        requestId: { type: String, default: '' },
    }],

    // ── Step 1: Input ──
    input: {
        brief: { type: String, default: '' },
        inputType: { type: String, enum: ['text', 'image', 'both'], default: 'text' },
        images: [{
            url: { type: String },
            source: { type: String, enum: ['upload', 'existing', 'ai-generated', 'ai-generate', 'library', 'url'], default: 'upload' },
            label: { type: String, default: '' },
        }],
        videoType: { type: String, enum: ['ad-film', 'ugc', 'product-demo', 'social-reel', 'explainer'], default: 'ad-film' },
    },

    // ── Step 2: Brainstorm Agent Output ──
    concepts: [{
        title: { type: String },
        description: { type: String },
        style: { type: String },        // cinematic, raw-ugc, product-hero, etc.
        duration: { type: Number },      // seconds
        hook: { type: String },          // opening hook
        mood: { type: String },
        targetPlatform: { type: String },
    }],
    selectedConceptIndex: { type: Number, default: null },

    // ── Step 3: Script Director Agent Output ──
    script: {
        shots: [{
            shotNum: { type: Number },
            duration: { type: Number },   // seconds
            visual: { type: String },     // what's seen
            dialogue: { type: String },   // spoken words / VO
            camera: { type: String },     // camera movement
            audio: { type: String },      // background audio description
            transition: { type: String }, // cut, fade, dissolve, etc.
        }],
        totalDuration: { type: Number, default: 0 },
        narrative: { type: String, default: '' },  // overall story arc
    },
    backendPrompt: { type: String, default: '' },  // exact fal.ai prompt (user-visible)

    // ── Voice Over Preview (QC before video generation) ──
    voiceoverPreview: {
        audioUrl: { type: String, default: '' },
        voiceProvider: { type: String, default: '' },  // 'minimax' | 'sarvam' | 'cloned'
        voiceId: { type: String, default: '' },
        speed: { type: Number, default: 1.0 },
        generatedAt: { type: Date },
    },

    // ── Step 4: Reference Curator Output ──
    references: {
        brandImages: [{ url: String, label: String }],
        userUploaded: [{ url: String, label: String }],
        aiGenerated: [{ url: String, label: String }],
        styleNotes: { type: String, default: '' },
    },

    // ── Step 5: Model Router Output ──
    routing: {
        selectedModel: { type: String, enum: ['veo-3.1', 'veo-3.1-fast', 'kling-3.0', 'seedance-2.0', 'seedance-1.0', 'grok-imagine', 'heygen', 'heygen-photo-avatar', 'heygen-product-placement', 'heygen-audio-avatar', 'heygen-video-agent'], default: 'kling-3.0' },
        resolution: { type: String, enum: ['720p', '1080p', '4k'], default: '1080p' },
        mode: { type: String, enum: ['fast', 'quality'], default: 'fast' },
        reasoning: { type: String, default: '' },
        costPreview: {
            credits: { type: Number, default: 0 },
            inr: { type: Number, default: 0 },
            usd: { type: Number, default: 0 },
        },
    },

    // ── Step 6: Generated Video ──
    generation: {
        falRequestId: { type: String, default: '' },
        falEndpoint: { type: String, default: '' },
        falStatusUrl: { type: String, default: '' },
        falResultUrl: { type: String, default: '' },
        provider: { type: String, enum: ['fal', 'grok', 'kie', 'heygen', 'piapi'], default: 'fal' },
        videoUrl: { type: String, default: '' },
        s3VideoUrl: { type: String, default: '' },
        thumbnailUrl: { type: String, default: '' },
        audioUrl: { type: String, default: '' },
        progress: { type: Number, default: 0 },  // 0-100
        startedAt: { type: Date },
        completedAt: { type: Date },
        error: { type: String, default: '' },
    },

    // ── Step 7: Critic Agent Output ──
    critique: {
        overallScore: { type: Number, default: 0 },   // 1-10
        strengths: [String],
        suggestions: [String],
        technicalNotes: { type: String, default: '' },
    },

    // ── Edit History (for self-learning) ──
    editHistory: [{
        field: { type: String },      // 'backendPrompt', 'dialogue', etc.
        before: { type: String },
        after: { type: String },
        timestamp: { type: Date, default: Date.now },
    }],

    // ── Final Output ──
    finalVideoUrl: { type: String, default: '' },
    creditsUsed: { type: Number, default: 0 },

}, { timestamps: true });

// Indexes
videoProjectSchema.index({ user: 1, status: 1, createdAt: -1 });
// Removed redundant brand index here as it's defined inline

export default mongoose.model('VideoProject', videoProjectSchema);

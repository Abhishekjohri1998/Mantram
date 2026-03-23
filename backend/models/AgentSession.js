import mongoose from 'mongoose';

const AgentSessionSchema = new mongoose.Schema({
    sessionId: { type: String, required: true, unique: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', default: null },
    prompt: { type: String, required: true },
    storyboard: { type: mongoose.Schema.Types.Mixed, required: true },
    model: { type: String, default: 'kling-3.0' },
    audioFileUrl: { type: String, default: null },
    audioTranscript: { type: String, default: null },
    characterRefUrl: { type: String, default: null },
    characterDescriptions: { type: String, default: null },
    allImages: [{ type: String }],
    productId: { type: String, default: null },
    productImages: [{ type: String }],
    referenceImages: [{ type: String }],
    voiceover: { type: mongoose.Schema.Types.Mixed, default: {} },
    music: { type: mongoose.Schema.Types.Mixed, default: {} },
    textOverlays: { type: mongoose.Schema.Types.Mixed, default: {} },
    aspectRatio: { type: String, default: '16:9' },
    qualityMode: { type: String, default: 'fast' },
    status: { type: String, enum: ['storyboard-ready', 'frames-ready', 'generating', 'done', 'failed'], default: 'storyboard-ready' },
    firstFrames: [{ type: mongoose.Schema.Types.Mixed }],
    sceneProjects: [{ type: mongoose.Schema.Types.Mixed }],
}, { timestamps: true });

// Auto-expire old sessions after 24 hours
AgentSessionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

export default mongoose.model('AgentSession', AgentSessionSchema);

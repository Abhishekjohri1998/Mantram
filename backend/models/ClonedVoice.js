import mongoose from 'mongoose';

/**
 * ClonedVoice — Stores user's cloned voices from Minimax (fal.ai) or Sarvam AI.
 * Voices can be used in UGC video generation.
 */
const clonedVoiceSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', index: true },

    name: { type: String, required: true, default: 'My Voice' },
    provider: { type: String, enum: ['minimax', 'sarvam'], required: true },

    // Provider-specific voice ID
    voiceId: { type: String, default: '' },           // Minimax custom_voice_id
    falRequestId: { type: String, default: '' },       // fal.ai queue request ID (for polling)

    // Audio URLs
    sampleAudioUrl: { type: String, default: '' },     // Original audio sample (S3)
    previewAudioUrl: { type: String, default: '' },    // Preview TTS audio (S3)

    // Metadata
    language: { type: String, default: 'English' },
    gender: { type: String, enum: ['Male', 'Female', 'Unknown'], default: 'Unknown' },
    status: { type: String, enum: ['cloning', 'ready', 'failed'], default: 'cloning' },
    error: { type: String, default: '' },

}, { timestamps: true });

clonedVoiceSchema.index({ user: 1, status: 1, createdAt: -1 });

export default mongoose.model('ClonedVoice', clonedVoiceSchema);

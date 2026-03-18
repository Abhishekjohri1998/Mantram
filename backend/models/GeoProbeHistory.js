import mongoose from 'mongoose';

const geoProbeHistorySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true, index: true },
  website: { type: String, required: true },

  // Core metrics (for trend charts)
  score: { type: Number, default: 0 },
  mentionRate: { type: Number, default: 0 },
  totalProbes: { type: Number, default: 0 },
  totalMentions: { type: Number, default: 0 },
  competitivePosition: { type: String, enum: ['Leader', 'Challenger', 'Niche'], default: 'Niche' },

  // Per-model breakdown (for per-model trend)
  modelBreakdown: { type: Object, default: {} },

  // Sentiment (for sentiment trend)
  sentimentDistribution: {
    positive: { type: Number, default: 0 },
    neutral: { type: Number, default: 0 },
    negative: { type: Number, default: 0 },
  },

  // Share of voice snapshot
  shareOfVoice: { type: Object, default: {} },

  // Entity confidence
  entityConfidence: {
    probed: { type: Number, default: 0 },
    recognized: { type: Number, default: 0 },
    recognitionRate: { type: Number, default: 0 },
  },

  // Models used in this probe
  modelsUsed: [{ type: String }],
  modelCoverage: { type: String },

  // Content gaps count
  contentGapsCount: { type: Number, default: 0 },

  // Citations count
  citationsCount: { type: Number, default: 0 },

  // On-page score at probe time (for comparison)
  onPageScore: { type: Number, default: 0 },
  blendedScore: { type: Number, default: 0 },

  // Samples per prompt (v3: multi-sampling)
  samplesPerPrompt: { type: Number, default: 1 },

  // Full citations list (for drift detection across probes)
  citations: [{ type: String }],

}, { timestamps: true });

// Compound index for efficient brand+time queries
geoProbeHistorySchema.index({ brand: 1, createdAt: -1 });

const GeoProbeHistory = mongoose.model('GeoProbeHistory', geoProbeHistorySchema);
export default GeoProbeHistory;

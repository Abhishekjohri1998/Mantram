import mongoose from 'mongoose';

/**
 * BrainstormSession — Persists brainstorm conversations for history & resumability.
 * Each session holds the full Fidato chat, generated ideas, deep dives, and calendars.
 */

const messageSchema = new mongoose.Schema({
  role: { type: String, enum: ['user', 'fidato'], required: true },
  content: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now },
  // Rich payloads attached to Fidato messages
  ideasPayload: { type: mongoose.Schema.Types.Mixed, default: null },
  screenplayPayload: { type: mongoose.Schema.Types.Mixed, default: null },
  strategyPayload: { type: mongoose.Schema.Types.Mixed, default: null },
  deepDivePayload: { type: mongoose.Schema.Types.Mixed, default: null },
  calendarPayload: { type: mongoose.Schema.Types.Mixed, default: null },
  intent: { type: String, default: null },
  questionOptions: { type: [String], default: undefined },
}, { _id: true });

const brainstormSessionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true },

  // Session metadata
  title: { type: String, default: 'New Brainstorm' },
  intent: { type: String, default: null }, // ad-film, campaign, product-launch, etc.
  status: { type: String, enum: ['active', 'completed', 'archived'], default: 'active' },

  // Full conversation
  messages: [messageSchema],

  // Session state (mirrors frontend sessionState — used to resume)
  sessionState: { type: mongoose.Schema.Types.Mixed, default: {} },

  // Quick-access final outputs
  selectedIdea: { type: mongoose.Schema.Types.Mixed, default: null },
  deepDive: { type: mongoose.Schema.Types.Mixed, default: null },
  calendar: { type: mongoose.Schema.Types.Mixed, default: null },

  // Counters for sidebar badges
  ideaCount: { type: Number, default: 0 },
  hasDeepDive: { type: Boolean, default: false },
  hasCalendar: { type: Boolean, default: false },

  lastMessageAt: { type: Date, default: Date.now },
}, { timestamps: true });

// Indexes for fast listing
brainstormSessionSchema.index({ user: 1, brand: 1, status: 1, lastMessageAt: -1 });
brainstormSessionSchema.index({ user: 1, lastMessageAt: -1 });

export default mongoose.model('BrainstormSession', brainstormSessionSchema);

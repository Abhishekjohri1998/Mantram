import mongoose from 'mongoose';

// ============================================================================
// Skill Execution History — Stores every run with output and routing status
// ============================================================================

const skillExecutionSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    skill: { type: mongoose.Schema.Types.ObjectId, ref: 'Skill', required: true },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand' },

    // Skill metadata snapshot (in case skill is later modified/deleted)
    skillName: { type: String, required: true },
    skillCategory: { type: String, default: 'general' },
    skillIcon: { type: String, default: 'auto_awesome' },
    skillColor: { type: String, default: 'violet' },

    // Inputs provided by user
    inputs: { type: mongoose.Schema.Types.Mixed, default: {} },

    // AI output
    output: { type: mongoose.Schema.Types.Mixed, required: true },
    outputFormat: { type: String, enum: ['markdown', 'json', 'html', 'structured'], default: 'structured' },

    // Output routing — where was the output sent?
    routedTo: [{
        destination: { type: String, enum: ['content_studio', 'calendar', 'clipboard', 'none'], default: 'none' },
        contentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Content' }],
        itemCount: { type: Number, default: 0 },
        routedAt: { type: Date, default: Date.now },
    }],

    // User rating for this execution
    rating: { type: Number, min: 1, max: 5 },

    // Status
    status: { type: String, enum: ['completed', 'failed', 'routed'], default: 'completed' },

}, { timestamps: true });

// Indexes
skillExecutionSchema.index({ user: 1, createdAt: -1 });
skillExecutionSchema.index({ user: 1, skill: 1 });
skillExecutionSchema.index({ user: 1, brand: 1, createdAt: -1 });

export default mongoose.model('SkillExecution', skillExecutionSchema);

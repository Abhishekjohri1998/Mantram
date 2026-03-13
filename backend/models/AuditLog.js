import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
    admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    action: { type: String, required: true, index: true }, // e.g., 'DELETE_USER', 'UPDATE_SETTING', 'IMPERSONATE'
    targetModel: { type: String, required: true }, // e.g., 'User', 'SystemSettings'
    targetId: { type: mongoose.Schema.Types.Mixed },
    changes: {
        before: { type: mongoose.Schema.Types.Mixed },
        after: { type: mongoose.Schema.Types.Mixed }
    },
    ipAddress: { type: String },
    userAgent: { type: String },
    severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'info' },
    metadata: { type: mongoose.Schema.Types.Mixed }
}, { timestamps: true });

// Compound index for efficient searching
auditLogSchema.index({ admin: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

export default mongoose.model('AuditLog', auditLogSchema);

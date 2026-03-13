import AuditLog from '../models/AuditLog.js';

/**
 * Log an administrative action to the AuditLog collection.
 */
export const logAudit = async (req, { action, targetModel, targetId, changes, severity = 'info', metadata = {} }) => {
    try {
        await AuditLog.create({
            admin: req.user._id,
            action,
            targetModel,
            targetId,
            changes,
            ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress,
            userAgent: req.get('User-Agent'),
            severity,
            metadata
        });
    } catch (error) {
        console.error('❌ Audit Log Creation Failed:', error.message);
    }
};

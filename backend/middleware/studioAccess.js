/**
 * studioAccess.js — Middleware to enforce studio-level permissions for team members.
 * Team owners always have full access. Team members are checked against their studioAccess flags.
 */

import SubscriptionPackage from '../models/SubscriptionPackage.js';

const STUDIO_MAP = {
    'content-studio': 'contentStudio',
    'content': 'contentStudio',
    'creatives': 'creativeStudio',
    'creative-studio': 'creativeStudio',
    'seo-studio': 'seoStudio',
    'brainstorm-studio': 'brainstormStudio',
    'brainstorm': 'brainstormStudio',
    'video-studio': 'videoStudio',
    'd2c-analytics': 'd2cAnalytics',
    'shopify-analytics': 'd2cAnalytics',
    'performance-marketing': 'adStudio',
    'pm-connections': 'adStudio',
    'smart-calendar': 'smartCalendar',
    'conversations': 'conversationStudio',
};

export function requireStudio(studioKey) {
    return async (req, res, next) => {
        const user = req.user;
        if (!user) return res.status(401).json({ error: 'Not authenticated' });

        // Resolve studio key for telemetry/logging if needed
        const key = STUDIO_MAP[studioKey] || studioKey;
        req.currentStudio = key;

        // "all the users can access everything accept admin panel/super admin panel"
        // Admin panels are protected by role-based checks elsewhere.
        // For studios, we allow everyone who is logged in.
        next();
    };
}

// Check if user has access to a specific brand
export function requireBrandAccess(req, res, next) {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    // Owners, admins, superadmins always have access
    if (user.role === 'superadmin' || user.role === 'admin') return next();
    if (!user.organization || user.teamRole === 'owner') return next();

    const brandId = req.query.brandId || req.body.brandId || req.params.brandId;
    if (!brandId) return next(); // no brand context, allow

    const hasAccess = !user.brandAccess?.length || user.brandAccess.some(id => String(id) === String(brandId));
    if (!hasAccess) {
        return res.status(403).json({
            error: 'Brand access denied',
            message: `You don't have access to this brand. Contact your team admin.`,
        });
    }

    next();
}

export default { requireStudio, requireBrandAccess };

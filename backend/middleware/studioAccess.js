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

        // Resolve studio key
        const key = STUDIO_MAP[studioKey] || studioKey;

        // 1. Superadmins always have access
        if (user.role === 'superadmin') return next();

        // 2. Resolve Plan Access (Tiered Gating)
        const userPlan = user.plan || 'starter';
        try {
            const pkg = await SubscriptionPackage.findOne({ slug: userPlan }).lean();
            if (pkg) {
                // If package defines studio access, check it
                if (pkg.studios && pkg.studios[key] === false) {
                    return res.status(403).json({
                        error: 'Plan access denied',
                        message: `The ${pkg.name} plan does not include access to ${STUDIO_MAP[studioKey] || studioKey}. Please upgrade your plan to unlock this studio.`,
                        action: 'UPGRADE_REQUIRED',
                        currentPlan: pkg.name
                    });
                }
            }
        } catch (err) {
            console.error('Error checking plan access:', err);
            // On error, we fallback to default behavior (allow if next checks pass)
        }

        // 3. Team Member Permission Check (Admin/Owner Bypass)
        // Owners and Admins of an org usually have full access within their plan's limits
        if (user.teamRole === 'owner' || user.role === 'admin') return next();

        // If it's a team member, check their specific submanagment flags
        if (user.organization) {
            const hasMemberAccess = user.studioAccess?.[key] === true;
            if (!hasMemberAccess) {
                return res.status(403).json({
                    error: 'Studio access denied',
                    message: `You don't have access to this studio. Contact your team admin to request access.`,
                    studio: studioKey,
                });
            }
        }

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

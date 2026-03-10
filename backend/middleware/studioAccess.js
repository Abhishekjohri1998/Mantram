/**
 * studioAccess.js — Middleware to enforce studio-level permissions for team members.
 * Team owners always have full access. Team members are checked against their studioAccess flags.
 */

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
    return (req, res, next) => {
        const user = req.user;
        if (!user) return res.status(401).json({ error: 'Not authenticated' });

        // Owners, admins, superadmins always have full access
        if (user.role === 'superadmin' || user.role === 'admin') return next();
        if (!user.organization || user.teamRole === 'owner') return next();

        // Resolve studio key
        const key = STUDIO_MAP[studioKey] || studioKey;
        const hasAccess = user.studioAccess?.[key] === true;

        if (!hasAccess) {
            return res.status(403).json({
                error: 'Studio access denied',
                message: `You don't have access to this studio. Contact your team admin to request access.`,
                studio: studioKey,
            });
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

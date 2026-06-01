/**
 * studioAccess.js — 3-tier studio access control.
 * 
 * Resolution order:
 *   1. SuperAdmin → always has access
 *   2. Portal = "hidden" → no one can access
 *   3. User has explicit studioAccess override → use it
 *   4. Portal = "private" → whitelist only (no override = denied)
 *   5. Portal = "public" → everyone (plan-based)
 */

import { getSetting } from '../models/SystemSettings.js';
import SubscriptionPackage from '../models/SubscriptionPackage.js';

// Internal cache for subscription packages to avoid DB hits on every request
let cachedPackages = null;
let lastPackageFetch = 0;
const PACKAGE_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

async function getAllPackages() {
    const now = Date.now();
    if (cachedPackages && (now - lastPackageFetch) < PACKAGE_CACHE_TTL) {
        return cachedPackages;
    }
    try {
        const pkgs = await SubscriptionPackage.find({ isActive: true });
        cachedPackages = {};
        pkgs.forEach(p => {
            cachedPackages[p.slug] = p;
        });
        lastPackageFetch = now;
        return cachedPackages;
    } catch (err) {
        console.error('Failed to fetch packages for studio access check:', err.message);
        return cachedPackages || {};
    }
}

/**
 * Complete list of studio keys — single source of truth.
 */
export const STUDIO_KEYS = [
    'brainstormStudio',
    'researchStudio',      // ← independent studio — NOT part of Brainstorm
    'contentStudio',
    'creativeStudio',
    'videoStudio',
    'socialMediaStudio',
    'conversationStudio',
    'seoStudio',
    'adStudio',
    'funnelStudio',
    'd2cAnalytics',
    'skillsHub',
    'pulseStudio',
    'retentionStudio',
];

export const STUDIO_LABELS = {
    brainstormStudio: 'Brainstorm Studio',
    researchStudio:   'Research Studio',   // ← independent label
    contentStudio: 'Content Studio',
    creativeStudio: 'Creative Studio',
    videoStudio: 'Video Studio',
    socialMediaStudio: 'Social Media Studio',
    conversationStudio: 'Conversation Studio',
    seoStudio: 'SEO Studio',
    adStudio: 'Performance Studio',
    funnelStudio: 'Funnel Studio',
    d2cAnalytics: 'D2C Studio',
    skillsHub: 'Skills Hub',
    pulseStudio: 'Pulse Studio',
    retentionStudio: 'Retention Studio',
};

/**
 * Map route-path segments to studio keys (for route-based middleware).
 */
const STUDIO_MAP = {
    'content-studio': 'contentStudio',
    'content': 'contentStudio',
    'creatives': 'creativeStudio',
    'creative-studio': 'creativeStudio',
    'seo-studio': 'seoStudio',
    'brainstorm-studio': 'brainstormStudio',
    'brainstorm': 'brainstormStudio',
    'research-studio': 'researchStudio',   // ← own route mapping
    'video-studio': 'videoStudio',
    'd2c-analytics': 'd2cAnalytics',
    'shopify-analytics': 'd2cAnalytics',
    'performance-marketing': 'adStudio',
    'pm-connections': 'adStudio',
    'smart-calendar': 'socialMediaStudio',
    'social-media-studio': 'socialMediaStudio',
    'conversations': 'conversationStudio',
    'funnel-studio': 'funnelStudio',
    'skills': 'skillsHub',
};

/**
 * Default portal visibility — all public.
 */
const DEFAULT_PORTAL_VISIBILITY = Object.fromEntries(
    STUDIO_KEYS.map(k => [k, 'public'])
);

/**
 * Get portal-level visibility from SystemSettings.
 * @returns {{ [studioKey: string]: 'public' | 'private' | 'hidden' }}
 */
export async function getPortalVisibility() {
    const stored = await getSetting('studio_portal_visibility', {});
    return { ...DEFAULT_PORTAL_VISIBILITY, ...stored };
}

/**
 * Check if a user can access a specific studio.
 */
export async function canAccessStudio(portalVisibility, user, studioKey) {
    if (user?.role === 'superadmin') return true;

    const status = portalVisibility[studioKey] || 'public';

    if (status === 'hidden') return false;

    // User-level explicit override (highest priority for individuals)
    const override = user?.studioAccess?.[studioKey];
    if (override === true) return true;
    if (override === false) return false;

    // Plan-level restriction (for 'public' and 'private' studios)
    const pkgs = await getAllPackages();
    const userPlan = user?.plan || 'free';
    const pkg = pkgs[userPlan];

    if (pkg && pkg.studios) {
        // If the plan explicitly disables this studio, deny access
        if (pkg.studios[studioKey] === false) {
            return false;
        }
    }

    if (status === 'private') return false;

    // public → everyone (who passed plan check)
    return true;
}

/**
 * Resolve studio access map for a user.
 * Returns { access: { studioKey: boolean }, portalVisibility: { studioKey: status } }
 */
export async function resolveStudioAccess(user) {
    const portalVisibility = await getPortalVisibility();
    const access = {};

    for (const key of STUDIO_KEYS) {
        access[key] = await canAccessStudio(portalVisibility, user, key);
    }

    return { access, portalVisibility };
}

/**
 * Express middleware: require access to a specific studio.
 * Usage: router.get('/...', protect, requireStudioAccess('seoStudio'), handler)
 */
export function requireStudioAccess(studioKey) {
    return async (req, res, next) => {
        try {
            if (req.user?.role === 'superadmin') return next();

            const portalVisibility = await getPortalVisibility();
            const key = STUDIO_MAP[studioKey] || studioKey;
            const hasAccess = await canAccessStudio(portalVisibility, req.user, key);

            if (!hasAccess) {
                const status = portalVisibility[key] || 'public';
                return res.status(403).json({
                    success: false,
                    error: status === 'hidden'
                        ? 'This studio is currently unavailable'
                        : 'You do not have access to this studio',
                    studioKey: key,
                    studioStatus: status,
                });
            }

            req.currentStudio = key;
            next();
        } catch (error) {
            console.error('Studio access check error:', error);
            return res.status(500).json({ success: false, error: 'Studio access check failed. Please try again.' });
        }
    };
}

/**
 * Legacy alias for backward compatibility.
 */
export const requireStudio = requireStudioAccess;

/**
 * Check if user has access to a specific brand (team-member restriction).
 */
export function requireBrandAccess(req, res, next) {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    if (user.role === 'superadmin' || user.role === 'admin') return next();
    if (!user.organization || user.teamRole === 'owner') return next();

    const brandId = req.query.brandId || req.body.brandId || req.params.brandId;
    if (!brandId) return next();

    const hasAccess = !user.brandAccess?.length || user.brandAccess.some(id => String(id) === String(brandId));
    if (!hasAccess) {
        return res.status(403).json({
            error: 'Brand access denied',
            message: `You don't have access to this brand. Contact your team admin.`,
        });
    }

    next();
}

export default { requireStudioAccess, requireStudio, requireBrandAccess, resolveStudioAccess, getPortalVisibility, STUDIO_KEYS, STUDIO_LABELS };

/**
 * Brand Ownership Middleware — SEC-002 (FIX-07)
 * 
 * Verifies the requesting user owns or has shared access to the brand
 * referenced in the request. Prevents IDOR attacks where a user passes
 * another user's brandId to access their brand DNA, assets, or generate
 * content using their brand context.
 * 
 * Usage: router.post('/generate', protect, requireBrandAccess, requireCredits('content'), handler)
 */

import Brand from '../models/Brand.js';

/**
 * Middleware: Require brand ownership or shared access.
 * Checks brandId from req.body, req.query, or req.params.
 * Skips if no brandId is present (some endpoints are brand-optional).
 * Superadmins bypass the check.
 */
export const requireBrandAccess = async (req, res, next) => {
    try {
        const brandId = req.body?.brandId || req.query?.brandId || req.params?.brandId || req.params?.id;

        // No brand context — skip (some endpoints are brand-optional)
        if (!brandId) return next();

        // Superadmins can access any brand (needed for admin panel)
        if (req.user?.role === 'superadmin') return next();

        // Validate ObjectId format to prevent MongoDB injection
        if (!/^[0-9a-fA-F]{24}$/.test(brandId)) {
            return res.status(400).json({ success: false, error: 'Invalid brand ID format' });
        }

        const brand = await Brand.findOne({
            _id: brandId,
            $or: [
                { user: req.user._id },
                { sharedWith: req.user._id }
            ]
        }).select('_id name user').lean();

        if (!brand) {
            console.warn(`🚫 [SEC-002] Brand access denied: User ${req.user._id} tried to access brand ${brandId}`);
            return res.status(403).json({ success: false, error: 'You do not have access to this brand' });
        }

        // Attach verified brand info for downstream use
        req.verifiedBrand = brand;
        next();
    } catch (error) {
        console.error('Brand ownership check error:', error);
        return res.status(500).json({ success: false, error: 'Authorization check failed' });
    }
};

export default requireBrandAccess;

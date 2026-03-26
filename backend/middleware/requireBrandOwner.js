import Brand from '../models/Brand.js';
import { safeErrorMessage } from '../utils/safeError.js';

/**
 * Middleware to ensure the authenticated user is the OWNER of the brand.
 * Used for destructive actions (delete, invite, remove members, transfer).
 */
export const requireBrandOwner = async (req, res, next) => {
    try {
        // Try to find brand ID in params, body, or query
        const brandId = req.params.id || req.params.brandId || req.body.brandId || req.query.brandId;
        
        if (!brandId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Brand ID is required for this action.' 
            });
        }

        const brand = await Brand.findById(brandId);
        if (!brand) {
            return res.status(404).json({ 
                success: false, 
                error: 'Brand not found.' 
            });
        }

        // Only the user field (original creator/owner) can proceed
        // Use toString() to handle ObjectId comparisons safely
        const brandOwnerId = brand.user?.toString();
        const authenticatedUserId = req.user?._id?.toString();

        if (brandOwnerId !== authenticatedUserId) {
            return res.status(403).json({ 
                success: false, 
                error: 'Permission Denied: Only the brand owner can perform this action.' 
            });
        }

        // Attach brand to request object for convenience in the next handler
        req.brand = brand;
        next();
    } catch (error) {
        console.error('🛡️ Permission Check Error:', error);
        res.status(500).json({ 
            success: false, 
            error: `Authorization failed: ${safeErrorMessage(error)}` 
        });
    }
};

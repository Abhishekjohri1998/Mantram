import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import Integration from '../models/Integration.js';

const router = Router();

/**
 * GET /api/integrations
 * Fetch all integrations for the authenticated user globally or scoped to a brand.
 * 
 * Query Params:
 *  - brandId (string): Optional. If provided, returns integrations mapped specifically to this brand.
 */
router.get('/', protect, async (req, res) => {
    try {
        const query = { user: req.user._id };
        
        // Scope to brand if provided
        if (req.query.brandId) {
            query.brand = req.query.brandId;
        } else {
            // Unscoped mode: explicitly request integrations not bound to a brand
            query.brand = { $exists: false };
        }

        const integrations = await Integration.find(query)
            .sort({ platform: 1, createdAt: -1 })
            .lean();

        // Create a structured response map of active platforms
        const connectedPlatforms = {};
        
        integrations.forEach(intg => {
            if (!connectedPlatforms[intg.platform]) {
                connectedPlatforms[intg.platform] = [];
            }
            
            // Clean up token data (even though select: false is on schema, lean() might bypass if projection is manual)
            delete intg.accessToken;
            delete intg.refreshToken;
            delete intg.pageAccessToken;
            
            connectedPlatforms[intg.platform].push({
                _id: intg._id,
                platform: intg.platform,
                status: intg.status,
                displayName: intg.displayName || intg.platformData?.shopName || intg.platformData?.pageName || undefined,
                shopDomain: intg.platformData?.shopDomain,
                profileUrl: intg.profileUrl,
                lastSyncAt: intg.lastSyncAt
            });
        });

        res.json({
            success: true,
            total: integrations.length,
            platforms: connectedPlatforms,
            integrations
        });
    } catch (error) {
        console.error('Fetch Integrations error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch integrations', detail: error.message });
    }
});

/**
 * DELETE /api/integrations/:id
 * General path to disconnect any integration directly by ID,
 * rather than calling platform-specific disconnect endpoints.
 */
router.delete('/:id', protect, async (req, res) => {
    try {
        const integration = await Integration.findOne({ 
            _id: req.params.id, 
            user: req.user._id 
        });

        if (!integration) {
            return res.status(404).json({ success: false, error: 'Integration not found or unauthorized' });
        }

        // We completely wipe tokens and set status to disconnected
        // A cron or queue could pick this up to hit provider-specific revoke endpoints
        integration.status = 'disconnected';
        integration.accessToken = '';
        integration.refreshToken = '';
        
        // Specifically clean up platform tokens too
        if (integration.platformData?.pageAccessToken) integration.platformData.pageAccessToken = '';
        
        await integration.save();

        res.json({ success: true, message: 'Integration disconnected successfully' });
    } catch (error) {
        console.error('Disconnect Integration error:', error);
        res.status(500).json({ success: false, error: 'Failed to disconnect integration', detail: error.message });
    }
});

export default router;

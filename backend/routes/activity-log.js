import { Router } from 'express';
import ActivityLog from '../models/ActivityLog.js';
import { protect } from '../middleware/auth.js';
import { safeErrorMessage } from '../utils/safeError.js';

const router = Router();

// ═══════════════════════════════════════════════════════════════
// GET /api/activity — User's own activity (across all brands)
// Query params: page, limit, studio, action
// ═══════════════════════════════════════════════════════════════
router.get('/', protect, async (req, res) => {
    try {
        const { page = 1, limit = 30, studio, action } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const filter = { user: req.user._id };
        if (studio) filter.studio = studio;
        if (action) filter.action = action;

        const [logs, total] = await Promise.all([
            ActivityLog.find(filter)
                .sort('-createdAt')
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            ActivityLog.countDocuments(filter),
        ]);

        res.json({
            success: true,
            logs,
            total,
            page: parseInt(page),
            pages: Math.ceil(total / parseInt(limit)),
        });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/activity/brand/:brandId — Activity for a specific brand
// Shows all team members' activity (for brand owners/managers)
// Query params: page, limit, studio, userId
// ═══════════════════════════════════════════════════════════════
router.get('/brand/:brandId', protect, async (req, res) => {
    try {
        const { page = 1, limit = 30, studio, userId } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const filter = { brand: req.params.brandId };
        if (studio) filter.studio = studio;
        if (userId) filter.user = userId;

        const [logs, total] = await Promise.all([
            ActivityLog.find(filter)
                .sort('-createdAt')
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            ActivityLog.countDocuments(filter),
        ]);

        res.json({
            success: true,
            logs,
            total,
            page: parseInt(page),
            pages: Math.ceil(total / parseInt(limit)),
        });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/activity/brand/:brandId/stats — Summary stats for dashboard
// Returns counts per studio for the last 30 days
// ═══════════════════════════════════════════════════════════════
router.get('/brand/:brandId/stats', protect, async (req, res) => {
    try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const [studioStats, recentCount, topUsers] = await Promise.all([
            ActivityLog.aggregate([
                { $match: { brand: req.params.brandId, createdAt: { $gte: thirtyDaysAgo } } },
                { $group: { _id: '$studio', count: { $sum: 1 }, totalCredits: { $sum: '$creditCost' } } },
                { $sort: { count: -1 } },
            ]),
            ActivityLog.countDocuments({ brand: req.params.brandId, createdAt: { $gte: thirtyDaysAgo } }),
            ActivityLog.aggregate([
                { $match: { brand: req.params.brandId, createdAt: { $gte: thirtyDaysAgo } } },
                { $group: { _id: '$userName', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 5 },
            ]),
        ]);

        res.json({
            success: true,
            period: '30d',
            totalActions: recentCount,
            byStudio: studioStats,
            topUsers,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

export default router;

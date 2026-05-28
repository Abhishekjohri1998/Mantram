import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import Brand from '../models/Brand.js';
import User from '../models/User.js';
import CreditUsage from '../models/CreditUsage.js';
import ActivityLog from '../models/ActivityLog.js';
import { safeErrorMessage } from '../utils/safeError.js';

const router = Router();

/**
 * GET /api/export/user — Export user's own data (GDPR: data portability)
 * Returns: profile, brands, credit usage, activity log
 */
router.get('/user', protect, async (req, res) => {
    try {
        const userId = req.user._id;

        const [user, brands, creditHistory, activity] = await Promise.all([
            User.findById(userId).select('-password -__v').lean(),
            Brand.find({ $or: [{ user: userId }, { sharedWith: userId }] }).lean(),
            CreditUsage.find({ user: userId }).sort('-createdAt').limit(500).lean(),
            ActivityLog.find({ user: userId }).sort('-createdAt').limit(500).lean(),
        ]);

        const exportData = {
            exportedAt: new Date().toISOString(),
            exportFormat: 'mantram-ai-user-export-v1',
            profile: {
                name: user.name,
                email: user.email,
                userId: user.userId,
                company: user.company,
                plan: user.plan,
                role: user.role,
                createdAt: user.createdAt,
                credits: user.credits,
            },
            brands: brands.map(b => ({
                name: b.name,
                website: b.website,
                status: b.status,
                createdAt: b.createdAt,
                dna: b.dna,
                customTemplates: b.customTemplates,
                customCategories: b.customCategories,
            })),
            creditHistory: creditHistory.map(c => ({
                action: c.action,
                cost: c.cost,
                studio: c.studio,
                description: c.description,
                date: c.createdAt,
            })),
            activityLog: activity.map(a => ({
                action: a.action,
                studio: a.studio,
                details: a.details,
                date: a.createdAt,
            })),
        };

        // Set headers for file download
        const filename = `mantram-export-${user.email.replace(/[^a-zA-Z0-9]/g, '_')}-${new Date().toISOString().slice(0, 10)}.json`;
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'application/json');
        res.json({ success: true, data: exportData });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

/**
 * GET /api/export/brand/:id — Export brand data
 * Returns: brand DNA, templates, categories, and all associated content
 */
router.get('/brand/:id', protect, async (req, res) => {
    try {
        const brand = await Brand.findOne({
            _id: req.params.id,
            $or: [{ user: req.user._id }, { sharedWith: req.user._id }],
        }).lean();

        if (!brand) {
            return res.status(404).json({ success: false, error: 'Brand not found' });
        }

        const [creditHistory, activity] = await Promise.all([
            CreditUsage.find({ 'metadata.brandId': brand._id.toString() }).sort('-createdAt').limit(500).lean(),
            ActivityLog.find({ brand: brand._id }).sort('-createdAt').limit(500).lean(),
        ]);

        const exportData = {
            exportedAt: new Date().toISOString(),
            exportFormat: 'mantram-ai-brand-export-v1',
            brand: {
                name: brand.name,
                website: brand.website,
                status: brand.status,
                createdAt: brand.createdAt,
                dna: brand.dna,
                customTemplates: brand.customTemplates,
                customCategories: brand.customCategories,
                autonomy: brand.autonomy,
            },
            creditUsage: creditHistory.map(c => ({
                action: c.action,
                cost: c.cost,
                studio: c.studio,
                description: c.description,
                date: c.createdAt,
            })),
            activityLog: activity.map(a => ({
                action: a.action,
                studio: a.studio,
                details: a.details,
                userName: a.userName,
                date: a.createdAt,
            })),
        };

        const filename = `mantram-brand-${brand.name.replace(/[^a-zA-Z0-9]/g, '_')}-${new Date().toISOString().slice(0, 10)}.json`;
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'application/json');
        res.json({ success: true, data: exportData });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

export default router;

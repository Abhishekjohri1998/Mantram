import { Router } from 'express';
import User from '../models/User.js';
import Brand from '../models/Brand.js';
import Content from '../models/Content.js';
import Creative from '../models/Creative.js';
import Feedback from '../models/Feedback.js';
import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { protect, authorize } from '../middleware/auth.js';

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// All admin routes require admin role
router.use(protect, authorize('admin'));

// GET /api/admin/stats — platform-wide statistics
router.get('/stats', async (req, res) => {
    try {
        const [totalUsers, totalBrands, totalContent, totalCreatives, totalFeedback] = await Promise.all([
            User.countDocuments(),
            Brand.countDocuments(),
            Content.countDocuments(),
            Creative.countDocuments(),
            Feedback.countDocuments(),
        ]);

        const planDistribution = await User.aggregate([
            { $group: { _id: '$plan', count: { $sum: 1 } } },
        ]);

        const recentUsers = await User.find().sort('-createdAt').limit(5).select('name email plan role createdAt lastActive');

        res.json({
            success: true,
            stats: {
                totalUsers,
                totalBrands,
                totalContent,
                totalCreatives,
                totalFeedback,
                planDistribution,
                recentUsers,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/admin/users
router.get('/users', async (req, res) => {
    try {
        const { page = 1, limit = 20, search, plan, role } = req.query;
        const filter = {};
        if (search) {
            const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            filter.$or = [{ name: new RegExp(safeSearch, 'i') }, { email: new RegExp(safeSearch, 'i') }];
        }
        if (plan) filter.plan = plan;
        if (role) filter.role = role;

        const users = await User.find(filter)
            .sort('-createdAt')
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit))
            .select('-password');

        const total = await User.countDocuments(filter);
        res.json({ success: true, users, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// PUT /api/admin/users/:id — update user role/plan
router.put('/users/:id', async (req, res) => {
    try {
        const { role, plan } = req.body;
        // BUG-13 FIX: Prevent admin from escalating to superadmin
        if (role === 'superadmin') {
            return res.status(403).json({ success: false, error: 'Cannot assign superadmin role' });
        }
        const user = await User.findByIdAndUpdate(req.params.id, { role, plan }, { new: true }).select('-password');
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });
        res.json({ success: true, user });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'User deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/admin/ai-health — AI system status
router.get('/ai-health', async (req, res) => {
    try {
        const recentFeedback = await Feedback.aggregate([
            { $match: { createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } },
            { $group: { _id: '$signalType', count: { $sum: 1 }, avgSentiment: { $avg: '$sentimentScore' } } },
        ]);

        res.json({
            success: true,
            aiHealth: {
                recentFeedback,
                status: 'operational',
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/admin/waitlist/export — download waitlist excel data
router.get('/waitlist/export', async (req, res) => {
    try {
        const excelPath = path.join(__dirname, '../../waitlist.xlsx');
        if (!fs.existsSync(excelPath)) {
            return res.status(404).json({ success: false, message: 'No waitlist data found.' });
        }
        res.download(excelPath, 'Mantram-AI-Waitlist.xlsx');
    } catch (error) {
        console.error('Export error:', error);
        res.status(500).json({ success: false, message: 'Error exporting data' });
    }
});

// GET /api/admin/settings/watermark — get watermark status
router.get('/settings/watermark', async (req, res) => {
    try {
        const enabled = await getSetting('watermark_enabled', true);
        res.json({ success: true, watermarkEnabled: enabled });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// PUT /api/admin/settings/watermark — toggle watermark on/off
router.put('/settings/watermark', async (req, res) => {
    try {
        const { enabled } = req.body;
        await setSetting('watermark_enabled', !!enabled, req.user._id);
        console.log(`⚙️ Watermark ${enabled ? 'ENABLED' : 'DISABLED'} by admin ${req.user.email}`);
        res.json({ success: true, watermarkEnabled: !!enabled });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;

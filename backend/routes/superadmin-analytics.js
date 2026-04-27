import { Router } from 'express';
import { protect, authorize } from '../middleware/auth.js';
import TemplateUsageLog from '../models/TemplateUsageLog.js';
import PresetUsageLog from '../models/PresetUsageLog.js';
import Template from '../models/Template.js';
import QAdsPreset from '../models/QAdsPreset.js';

const router = Router();

router.get('/templates', protect, authorize('superadmin'), async (req, res) => {
    try {
        const now = new Date();
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        // Get top 10 templates by overall usage
        const topTemplates = await Template.find()
            .sort({ usageCount: -1 })
            .limit(10)
            .select('name usageCount studioOrigin categoryId')
            .lean();

        // Get most used template this month using aggregation on TemplateUsageLog
        const monthlyStats = await TemplateUsageLog.aggregate([
            { $match: { createdAt: { $gte: firstDayOfMonth } } },
            { $group: { _id: '$templateId', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 1 }
        ]);

        // Get total usage overall
        const totalAgg = await TemplateUsageLog.aggregate([
            { $group: { _id: null, total: { $sum: 1 } } }
        ]);
        const totalUsage = totalAgg.length > 0 ? totalAgg[0].total : 0;

        let mostUsedThisMonth = null;
        if (monthlyStats.length > 0) {
            const template = await Template.findById(monthlyStats[0]._id).select('name').lean();
            if (template) {
                mostUsedThisMonth = {
                    name: template.name,
                    count: monthlyStats[0].count
                };
            }
        }

        res.json({ success: true, topTemplates, mostUsedThisMonth, totalUsage });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/presets', protect, authorize('superadmin'), async (req, res) => {
    try {
        const now = new Date();
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        // Get top 10 presets by overall usage (aggregating from PresetUsageLog)
        const overallStats = await PresetUsageLog.aggregate([
            { $group: { _id: '$presetId', usageCount: { $sum: 1 } } },
            { $sort: { usageCount: -1 } },
            { $limit: 10 }
        ]);

        const topPresets = [];
        for (const stat of overallStats) {
            const p = await QAdsPreset.findById(stat._id).select('name').lean();
            if (p) topPresets.push({ _id: p._id, name: p.name, usageCount: stat.usageCount });
        }

        // Get most used preset this month
        const monthlyStats = await PresetUsageLog.aggregate([
            { $match: { createdAt: { $gte: firstDayOfMonth } } },
            { $group: { _id: '$presetId', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 1 }
        ]);

        // Get total usage overall
        const totalAgg = await PresetUsageLog.aggregate([
            { $group: { _id: null, total: { $sum: 1 } } }
        ]);
        const totalUsage = totalAgg.length > 0 ? totalAgg[0].total : 0;

        let mostUsedThisMonth = null;
        if (monthlyStats.length > 0) {
            const p = await QAdsPreset.findById(monthlyStats[0]._id).select('name').lean();
            if (p) {
                mostUsedThisMonth = {
                    name: p.name,
                    count: monthlyStats[0].count
                };
            }
        }

        res.json({ success: true, topPresets, mostUsedThisMonth, totalUsage });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;

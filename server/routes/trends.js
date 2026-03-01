/**
 * Trends Routes — Real-time trending topics for brand content
 */

import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { requireCredits } from '../middleware/credits.js';
import Brand from '../models/Brand.js';
import { getOrchestrator } from '../agents/orchestrator.js';
import { fetchAllTrends, matchTrendsToBrand, clearTrendCache } from '../services/trendEngine.js';

const router = Router();

// GET /api/trends/now — Raw trending topics (fast, cached)
router.get('/now', protect, async (req, res) => {
    try {
        const geo = req.query.geo || 'IN';
        const trends = await fetchAllTrends(geo);
        res.json({
            success: true,
            trends,
            count: trends.length,
            cached: true,
        });
    } catch (error) {
        console.error('Trends fetch error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/trends/brand-match — Trends scored by brand relevance
router.get('/brand-match', protect, async (req, res) => {
    try {
        const { brandId, geo } = req.query;
        if (!brandId) return res.status(400).json({ success: false, error: 'brandId is required' });

        const brand = await Brand.findById(brandId);
        if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });

        const trends = await fetchAllTrends(geo || 'IN');
        const orchestrator = getOrchestrator();
        const matched = await matchTrendsToBrand(trends, brand, orchestrator);

        res.json({
            success: true,
            trends: matched,
            count: matched.length,
            brandName: brand.name,
        });
    } catch (error) {
        console.error('Brand trend match error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/trends/refresh — Force refresh trend cache
router.post('/refresh', protect, requireCredits('trendRefresh'), async (req, res) => {
    try {
        clearTrendCache();
        const geo = req.query.geo || 'IN';
        const trends = await fetchAllTrends(geo);
        res.json({
            success: true,
            trends,
            count: trends.length,
            message: 'Trends refreshed',
        });
    } catch (error) {
        console.error('Trend refresh error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;

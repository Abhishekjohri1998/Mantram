/**
 * Trends Routes — Real-time trending topics for brand content
 */

import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { requireCredits } from '../middleware/credits.js';
import Brand from '../models/Brand.js';
import { getOrchestrator } from '../agents/orchestrator.js';
import { fetchAllTrends, matchTrendsToBrand, clearTrendCache } from '../services/trendEngine.js';
import {
import { safeErrorMessage } from '../utils/safeError.js';
    getTrendingTopics,
    getTrendingSEOKeywords,
    getCompetitorTrendIntel,
    getContentSuggestions,
    isGrokAvailable,
} from '../services/grokTrends.js';

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
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
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
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
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
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ── GROK-POWERED ENDPOINTS ──────────────────────────────────────────────

// GET /api/trends/grok-topics — Live trending topics by industry (xAI Grok)
router.get('/grok-topics', protect, async (req, res) => {
    try {
        if (!isGrokAvailable()) return res.json({ success: true, trends: [], message: 'Grok not configured' });
        const { industry, country, brandId } = req.query;
        const brandIndustry = industry || 'general';
        if (brandId) {
            const brand = await Brand.findById(brandId);
            if (brand?.dna?.industry) {
                const data = await getTrendingTopics(brand.dna.industry, country || 'India');
                return res.json({ success: true, ...data, source: 'grok' });
            }
        }
        const data = await getTrendingTopics(brandIndustry, country || 'India');
        res.json({ success: true, ...data, source: 'grok' });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// GET /api/trends/grok-seo — Trending SEO keywords by industry (xAI Grok)
router.get('/grok-seo', protect, async (req, res) => {
    try {
        if (!isGrokAvailable()) return res.json({ success: true, risingKeywords: [], message: 'Grok not configured' });
        const { industry, website, country, brandId } = req.query;
        let brandIndustry = industry || 'general';
        let brandWebsite = website || '';
        if (brandId) {
            const brand = await Brand.findById(brandId);
            if (brand) {
                brandIndustry = brand.dna?.industry || brandIndustry;
                brandWebsite = brand.website || brandWebsite;
            }
        }
        const data = await getTrendingSEOKeywords(brandIndustry, brandWebsite, country || 'India');
        res.json({ success: true, ...data, source: 'grok' });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// GET /api/trends/grok-competitors — Competitor trend intelligence (xAI Grok)
router.get('/grok-competitors', protect, async (req, res) => {
    try {
        if (!isGrokAvailable()) return res.json({ success: true, competitors: [], message: 'Grok not configured' });
        const { competitors, industry, country, brandId } = req.query;
        const compList = competitors ? competitors.split(',').map(c => c.trim()) : [];
        let brandIndustry = industry || 'general';
        if (brandId) {
            const brand = await Brand.findById(brandId);
            if (brand) {
                brandIndustry = brand.dna?.industry || brandIndustry;
                if (!compList.length && brand.competitors?.length) {
                    compList.push(...brand.competitors.map(c => c.name).filter(Boolean));
                }
            }
        }
        if (!compList.length) return res.status(400).json({ success: false, error: 'No competitors specified' });
        const data = await getCompetitorTrendIntel(compList, brandIndustry, country || 'India');
        res.json({ success: true, ...data, source: 'grok' });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// GET /api/trends/grok-content — AI content suggestions based on what's trending (xAI Grok)
router.get('/grok-content', protect, async (req, res) => {
    try {
        if (!isGrokAvailable()) return res.json({ success: true, suggestions: [], message: 'Grok not configured' });
        const { brandId, platforms } = req.query;
        if (!brandId) return res.status(400).json({ success: false, error: 'brandId is required' });
        const brand = await Brand.findById(brandId);
        if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });
        const platList = platforms ? platforms.split(',') : ['instagram', 'twitter'];
        const data = await getContentSuggestions(brand, platList);
        res.json({ success: true, ...data, source: 'grok', brandName: brand.name });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

export default router;

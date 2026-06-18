/**
 * Brand Kit API Routes
 *
 * POST /api/brand-kit/identity/generate     — Logo + identity marks
 * POST /api/brand-kit/stationery/generate   — Full stationery kit
 * POST /api/brand-kit/guide/generate        — Interactive brand guide HTML
 * POST /api/brand-kit/collection/generate   — New product/range collection pack
 * POST /api/brand-kit/wizard/generate       — Zero-brand all-in-one wizard
 * GET  /api/brand-kit/assets                — List brand's generated assets
 * DELETE /api/brand-kit/assets/:id          — Delete an asset
 */

import express from 'express';
import { protect } from '../middleware/auth.js';
import { deductCredits } from '../middleware/credits.js';
import BrandKitAsset from '../models/BrandKitAsset.js';

import { generateBrandIdentity } from '../agents/brandKit/identityAgent.js';
import { generateStationeryKit } from '../agents/brandKit/stationeryAgent.js';
import { generateBrandGuide } from '../agents/brandKit/brandGuideAgent.js';
import { generateProductCollection } from '../agents/brandKit/collectionAgent.js';

const router = express.Router();

// ── Credit costs ──────────────────────────────────────────────────────────────
const COSTS = {
    identity:   20,
    stationery: 25,
    guide:      15,
    collection: 30,
    wizard:     60, // All-in-one: identity + stationery + guide
};

// ── Helper: read credit balance (mirrors existing brand-studio pattern) ──────
const getBalance = (user) => (user.credits?.total || 0) + (user.credits?.bonus || 0);

// ── Helper: save asset to DB ──────────────────────────────────────────────────
async function saveAsset(userId, brandId, assetType, result, brief, scopeLabel, creditsUsed) {
    return BrandKitAsset.create({
        user:  userId,
        brand: brandId || null,
        assetType,
        scope: result.collectionType ? 'campaign' : 'brand',
        title: result.copy?.campaignName
            || (result.artStrategy?.designMovement ? `${assetType} — ${result.artStrategy.designMovement}` : assetType),
        brief: brief || '',
        scopeLabel: scopeLabel || '',
        artDirectorIntelligence: {
            brandArchetype:      result.artStrategy?.brandArchetype || '',
            designMovement:      result.artStrategy?.designMovement || '',
            colorStrategy:       JSON.stringify(result.artStrategy?.colorStrategy || {}),
            typographyRationale: JSON.stringify(result.artStrategy?.typographyStrategy || {}),
            moodKeywords:        result.artStrategy?.moodKeywords || [],
            trend2026:           result.artStrategy?.trend2026 || result.artStrategy?.designMovement || '',
            artDirectorNotes:    result.artStrategy?.artDirectorNotes || '',
        },
        assets: result.assets || [],
        creditsUsed,
        status: 'completed',
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /identity/generate — Logo, Icon Mark, Favicon
// ─────────────────────────────────────────────────────────────────────────────
router.post('/identity/generate', protect, async (req, res) => {
    const { brandId, brief, briefBrand, scope, existingLogoUrl, collateralBrief } = req.body;
    const cost = COSTS.identity;

    try {
        const balance = getBalance(req.user);
        if (balance < cost) return res.status(402).json({ success: false, error: 'Insufficient credits', required: cost });

        console.log(`🎨 [BrandKit] Identity generation for user ${req.user._id}${existingLogoUrl ? ' (with existing logo)' : ' (new logo)'}`);
        const result = await generateBrandIdentity({ brandId, brief, briefBrand, scope, existingLogoUrl, collateralBrief });

        if (!result.success) throw new Error('Identity generation failed');

        await deductCredits(req.user._id, cost, 'brand-kit-identity');
        const saved = await saveAsset(req.user._id, brandId, 'identity', result, brief, '', cost);

        res.json({ success: true, asset: saved, artStrategy: result.artStrategy });
    } catch (err) {
        console.error('[BrandKit] Identity error:', err.message);
        res.status(500).json({ error: err.message || 'Identity generation failed' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /stationery/generate — Business card, letterhead, email sig
// ─────────────────────────────────────────────────────────────────────────────
router.post('/stationery/generate', protect, async (req, res) => {
    const { brandId, brief, briefBrand, contactDetails } = req.body;
    const cost = COSTS.stationery;

    try {
        const balance = getBalance(req.user);
        if (balance < cost) return res.status(402).json({ success: false, error: 'Insufficient credits', required: cost });

        const result = await generateStationeryKit({ brandId, brief, briefBrand, contactDetails });
        if (!result.success) throw new Error('Stationery generation failed');

        await deductCredits(req.user._id, cost, 'brand-kit-stationery');
        const saved = await saveAsset(req.user._id, brandId, 'stationery', result, brief, '', cost);

        res.json({ success: true, asset: saved, artStrategy: result.artStrategy });
    } catch (err) {
        console.error('[BrandKit] Stationery error:', err.message);
        res.status(500).json({ error: err.message || 'Stationery generation failed' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /guide/generate — Interactive brand guide
// ─────────────────────────────────────────────────────────────────────────────
router.post('/guide/generate', protect, async (req, res) => {
    const { brandId, brief, briefBrand } = req.body;
    const cost = COSTS.guide;

    try {
        const balance = getBalance(req.user);
        if (balance < cost) return res.status(402).json({ success: false, error: 'Insufficient credits', required: cost });

        const result = await generateBrandGuide({ brandId, brief, briefBrand });
        if (!result.success) throw new Error('Guide generation failed');

        await deductCredits(req.user._id, cost, 'brand-kit-guide');
        const saved = await saveAsset(req.user._id, brandId, 'guide', result, brief, '', cost);

        res.json({ success: true, asset: saved, hostedUrl: result.hostedUrl, artStrategy: result.artStrategy });
    } catch (err) {
        console.error('[BrandKit] Guide error:', err.message);
        res.status(500).json({ error: err.message || 'Guide generation failed' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /collection/generate — New product/range/campaign pack
// ─────────────────────────────────────────────────────────────────────────────
router.post('/collection/generate', protect, async (req, res) => {
    const { brandId, brief, briefBrand, collectionType, scopeLabel, scope } = req.body;
    const cost = COSTS.collection;

    try {
        const balance = getBalance(req.user);
        if (balance < cost) return res.status(402).json({ success: false, error: 'Insufficient credits', required: cost });

        const result = await generateProductCollection({ brandId, brief, briefBrand, collectionType, scopeLabel, scope });
        if (!result.success) throw new Error('Collection generation failed');

        await deductCredits(req.user._id, cost, 'brand-kit-collection');
        const saved = await saveAsset(req.user._id, brandId, 'collection', result, brief, scopeLabel, cost);

        res.json({ success: true, asset: saved, copy: result.copy, artStrategy: result.artStrategy });
    } catch (err) {
        console.error('[BrandKit] Collection error:', err.message);
        res.status(500).json({ error: err.message || 'Collection generation failed' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /wizard/generate — Zero-brand all-in-one wizard
// Generates identity + stationery + guide from a brief (no brand onboarding needed)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/wizard/generate', protect, async (req, res) => {
    const { briefBrand, contactDetails, existingLogoUrl, collateralBrief } = req.body;
    const cost = COSTS.wizard;

    if (!briefBrand?.name || !briefBrand?.products) {
        return res.status(400).json({ error: 'briefBrand.name and briefBrand.products are required' });
    }

    try {
        const balance = getBalance(req.user);
        if (balance < cost) return res.status(402).json({ success: false, error: 'Insufficient credits', required: cost });

        console.log(`🧙 [BrandKit Wizard] Generating all-in-one kit for "${briefBrand.name}"${existingLogoUrl ? ' (with existing logo)' : ' (new logo)'}...`);

        // Run all 3 generators in parallel for speed
        const [identityResult, stationeryResult, guideResult] = await Promise.allSettled([
            generateBrandIdentity({ brief: `Brand kit for ${briefBrand.name}`, briefBrand, existingLogoUrl, collateralBrief }),
            generateStationeryKit({ brief: `Stationery for ${briefBrand.name}`, briefBrand, contactDetails }),
            generateBrandGuide({ brief: `Brand guide for ${briefBrand.name}`, briefBrand }),
        ]);

        // Check if the core identity generation failed. Without visual identity, stationery & guide are useless.
        const isIdentitySuccess = identityResult.status === 'fulfilled' && identityResult.value?.success;
        if (!isIdentitySuccess) {
            const errorMsg = (identityResult.status === 'fulfilled' ? identityResult.value?.error : identityResult.reason?.message) || 'Identity generation failed';
            throw new Error(`Wizard failed: ${errorMsg}`);
        }

        await deductCredits(req.user._id, cost, 'brand-kit-wizard');

        // Save all successfully generated assets
        const savedAssets = [];
        const pairs = [
            ['identity',   identityResult],
            ['stationery', stationeryResult],
            ['guide',      guideResult],
        ];
        for (const [type, result] of pairs) {
            if (result.status === 'fulfilled' && result.value?.success) {
                const saved = await saveAsset(req.user._id, null, type, result.value, `Wizard: ${briefBrand.name}`, '', 0);
                savedAssets.push(saved);
            }
        }

        res.json({
            success: true,
            assets: savedAssets,
            guideUrl: guideResult.status === 'fulfilled' ? guideResult.value?.hostedUrl : null,
            artStrategy: identityResult.status === 'fulfilled' ? identityResult.value?.artStrategy : null,
        });
    } catch (err) {
        console.error('[BrandKit] Wizard error:', err.message);
        res.status(500).json({ error: err.message || 'Wizard generation failed' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /assets — List all brand kit assets for the user
// ─────────────────────────────────────────────────────────────────────────────
router.get('/assets', protect, async (req, res) => {
    const { brandId, assetType, limit = 20, offset = 0 } = req.query;

    try {
        const filter = { user: req.user._id };
        if (brandId) filter.brand = brandId;
        if (assetType) filter.assetType = assetType;

        const [assets, total] = await Promise.all([
            BrandKitAsset.find(filter)
                .sort({ createdAt: -1 })
                .skip(parseInt(offset))
                .limit(parseInt(limit))
                .lean(),
            BrandKitAsset.countDocuments(filter),
        ]);

        res.json({ success: true, assets, total, offset: parseInt(offset), limit: parseInt(limit) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /assets/:id — Delete an asset
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/assets/:id', protect, async (req, res) => {
    try {
        const asset = await BrandKitAsset.findOneAndDelete({ _id: req.params.id, user: req.user._id });
        if (!asset) return res.status(404).json({ error: 'Asset not found' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;

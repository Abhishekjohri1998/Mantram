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
import Brand from '../models/Brand.js';
import redis from '../utils/redisClient.js';
import { clearBrandMemCache } from '../agents/shared/agentUtils.js';
import config from '../config/env.js';
import { getSignedUrlIfNeeded } from '../utils/s3.js';

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

const getBalance = (user) => {
    if (user.role === 'superadmin' || user.role === 'admin' || user.plan === 'enterprise') {
        return Infinity;
    }
    if (typeof user.credits === 'number') {
        return user.credits;
    }
    return (user.credits?.total || 0) + (user.credits?.bonus || 0);
};

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

async function signBrandKitAsset(asset) {
    if (!asset) return asset;
    const assetObj = typeof asset.toObject === 'function' ? asset.toObject() : asset;
    if (assetObj.assets && Array.isArray(assetObj.assets)) {
        assetObj.assets = await Promise.all(assetObj.assets.map(async (sub) => {
            if (sub.imageUrl) {
                sub.imageUrl = await getSignedUrlIfNeeded(sub.imageUrl);
            }
            return sub;
        }));
    }
    return assetObj;
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

        // If brandId is provided, update the Brand DNA logo with the newly generated icon mark
        let updatedBrand = null;
        if (brandId) {
            try {
                const logoAsset = result.assets?.find(a => a.assetSubType === 'identity-system-light')
                    || result.assets?.find(a => a.assetSubType === 'logo-icon-mark');
                if (logoAsset?.imageUrl) {
                    updatedBrand = await Brand.findByIdAndUpdate(
                        brandId,
                        {
                            'dna.logo.url': logoAsset.imageUrl,
                            'dna.logo.metadata.source': 'ai-generated',
                        },
                        { new: true }
                    ).lean();
                    console.log(`🎯 [BrandKit] Updated Brand ${brandId} DNA logo URL to: ${logoAsset.imageUrl}`);
                    
                    // Invalidate caches so other engines pick up the change immediately
                    await redis.del(`brand:${brandId}:context`);
                    clearBrandMemCache(brandId.toString());
                }
            } catch (brandErr) {
                console.error('⚠️ [BrandKit] Failed to update brand logo:', brandErr.message);
            }
        }

        let signedBrand = null;
        if (updatedBrand) {
            signedBrand = { ...updatedBrand };
            if (signedBrand.dna?.logo?.url) {
                signedBrand.dna.logo.url = await getSignedUrlIfNeeded(signedBrand.dna.logo.url);
            }
        }

        res.json({ success: true, asset: await signBrandKitAsset(saved), artStrategy: result.artStrategy, brand: signedBrand });
    } catch (err) {
        console.error('[BrandKit] Identity error:', err.message);
        res.status(500).json({ error: err.message || 'Identity generation failed' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /stationery/generate — Business card, letterhead, email sig
// ─────────────────────────────────────────────────────────────────────────────
router.post('/stationery/generate', protect, async (req, res) => {
    const { brandId, brief, briefBrand, contactDetails, existingLogoUrl } = req.body;
    const cost = COSTS.stationery;

    try {
        const balance = getBalance(req.user);
        if (balance < cost) return res.status(402).json({ success: false, error: 'Insufficient credits', required: cost });

        const result = await generateStationeryKit({ brandId, brief, briefBrand, contactDetails, existingLogoUrl });
        if (!result.success) throw new Error('Stationery generation failed');

        await deductCredits(req.user._id, cost, 'brand-kit-stationery');
        const saved = await saveAsset(req.user._id, brandId, 'stationery', result, brief, '', cost);

        res.json({ success: true, asset: await signBrandKitAsset(saved), artStrategy: result.artStrategy });
    } catch (err) {
        console.error('[BrandKit] Stationery error:', err.message);
        res.status(500).json({ error: err.message || 'Stationery generation failed' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /guide/generate — Interactive brand guide
// ─────────────────────────────────────────────────────────────────────────────
router.post('/guide/generate', protect, async (req, res) => {
    const { brandId, brief, briefBrand, existingLogoUrl } = req.body;
    const cost = COSTS.guide;

    try {
        const balance = getBalance(req.user);
        if (balance < cost) return res.status(402).json({ success: false, error: 'Insufficient credits', required: cost });

        const result = await generateBrandGuide({ brandId, brief, briefBrand, existingLogoUrl });
        if (!result.success) throw new Error('Guide generation failed');

        await deductCredits(req.user._id, cost, 'brand-kit-guide');
        const saved = await saveAsset(req.user._id, brandId, 'guide', result, brief, '', cost);

        // Normalize fallback/Catbox URLs to local backend viewer URL
        const guideAsset = saved.assets?.[0];
        if (guideAsset && (!guideAsset.hostedUrl || guideAsset.hostedUrl.includes('catbox') || guideAsset.hostedUrl.includes('tmpfiles'))) {
            const backendViewUrl = `/api/brand-kit/guide/view/${saved._id}`;
            await BrandKitAsset.updateOne(
                { _id: saved._id },
                { $set: { "assets.0.hostedUrl": backendViewUrl } }
            );
            guideAsset.hostedUrl = backendViewUrl;
        }

        res.json({ success: true, asset: await signBrandKitAsset(saved), hostedUrl: guideAsset?.hostedUrl || result.hostedUrl, artStrategy: result.artStrategy });
    } catch (err) {
        console.error('[BrandKit] Guide error:', err.message);
        res.status(500).json({ error: err.message || 'Guide generation failed' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /collection/generate — New product/range/campaign pack
// ─────────────────────────────────────────────────────────────────────────────
router.post('/collection/generate', protect, async (req, res) => {
    const { brandId, brief, briefBrand, collectionType, scopeLabel, scope, existingLogoUrl } = req.body;
    const cost = COSTS.collection;

    try {
        const balance = getBalance(req.user);
        if (balance < cost) return res.status(402).json({ success: false, error: 'Insufficient credits', required: cost });

        const result = await generateProductCollection({ brandId, brief, briefBrand, collectionType, scopeLabel, scope, existingLogoUrl });
        if (!result.success) throw new Error('Collection generation failed');

        await deductCredits(req.user._id, cost, 'brand-kit-collection');
        const saved = await saveAsset(req.user._id, brandId, 'collection', result, brief, scopeLabel, cost);

        res.json({ success: true, asset: await signBrandKitAsset(saved), copy: result.copy, artStrategy: result.artStrategy });
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

        // Step 1: Run identity FIRST — stationery and guide must use the generated logo as visual reference
        console.log(`🧙 [BrandKit Wizard] Step 1: Generating brand identity...`);
        const identityResult = await generateBrandIdentity({ brief: `Brand kit for ${briefBrand.name}`, briefBrand, existingLogoUrl, collateralBrief })
            .then(v => ({ status: 'fulfilled', value: v }))
            .catch(e => ({ status: 'rejected', reason: e }));

        // Check if the core identity generation failed. Without visual identity, stationery & guide are useless.
        const isIdentitySuccess = identityResult.status === 'fulfilled' && identityResult.value?.success;
        if (!isIdentitySuccess) {
            const errorMsg = (identityResult.status === 'fulfilled' ? identityResult.value?.error : identityResult.reason?.message) || 'Identity generation failed';
            throw new Error(`Wizard failed: ${errorMsg}`);
        }

        // Extract the generated logo to use as a grounding reference for stationery + guide
        const generatedLogoAsset = identityResult.value?.assets?.find(a => a.assetSubType === 'identity-system-light')
            || identityResult.value?.assets?.find(a => a.assetSubType === 'logo-icon-mark');
        const generatedLogoUrl = generatedLogoAsset?.imageUrl || existingLogoUrl || null;
        if (generatedLogoUrl) {
            console.log(`🧙 [BrandKit Wizard] Generated identity reference: ${generatedLogoUrl}`);
        }

        // Step 2: Run stationery + guide in parallel, passing generated logo as reference
        console.log(`🧙 [BrandKit Wizard] Step 2: Generating stationery + guide using brand identity reference...`);
        const [stationeryResult, guideResult] = await Promise.allSettled([
            generateStationeryKit({ brief: `Stationery for ${briefBrand.name}`, briefBrand, contactDetails, existingLogoUrl: generatedLogoUrl }),
            generateBrandGuide({ brief: `Brand guide for ${briefBrand.name}`, briefBrand, existingLogoUrl: generatedLogoUrl }),
        ]);

        // 🎯 Create new Brand document in DB using the brief details
        let brandObj = null;
        try {
            const logoAsset = identityResult.value?.assets?.find(a => a.assetSubType === 'identity-system-light')
                || identityResult.value?.assets?.find(a => a.assetSubType === 'logo-icon-mark');
            const colors = identityResult.value?.brand?.dna?.colors || briefBrand.colors || [];
            
            brandObj = await Brand.create({
                user: req.user._id,
                name: briefBrand.name,
                onboardingMethod: 'brainstorm',
                status: 'active',
                dna: {
                    logo: {
                        url: logoAsset?.imageUrl || '',
                        metadata: {
                            source: 'ai-generated',
                            confidence: 'high',
                        }
                    },
                    industry: briefBrand.industry || '',
                    targetAudience: briefBrand.targetAudience || '',
                    brandDescription: briefBrand.products || '',
                    tagline: briefBrand.vision || '',
                    country: briefBrand.country || 'India',
                    colors: colors,
                }
            });
            console.log(`🎯 [BrandKit Wizard] Created brand "${briefBrand.name}" (ID: ${brandObj._id})`);
        } catch (brandErr) {
            console.error('⚠️ [BrandKit Wizard] Brand creation failed:', brandErr.message);
        }

        await deductCredits(req.user._id, cost, 'brand-kit-wizard');

        // Save all successfully generated assets, linking them to the new brandObj._id
        const savedAssets = [];
        const pairs = [
            ['identity',   identityResult],
            ['stationery', stationeryResult],
            ['guide',      guideResult],
        ];
        for (const [type, result] of pairs) {
            if (result.status === 'fulfilled' && result.value?.success) {
                const saved = await saveAsset(req.user._id, brandObj?._id || null, type, result.value, `Wizard: ${briefBrand.name}`, '', 0);
                
                // If it is the brand guide, normalize its hostedUrl if S3 failed
                if (type === 'guide') {
                    const guideAsset = saved.assets?.[0];
                    if (guideAsset && (!guideAsset.hostedUrl || guideAsset.hostedUrl.includes('catbox') || guideAsset.hostedUrl.includes('tmpfiles'))) {
                        const backendViewUrl = `/api/brand-kit/guide/view/${saved._id}`;
                        await BrandKitAsset.updateOne(
                            { _id: saved._id },
                            { $set: { "assets.0.hostedUrl": backendViewUrl } }
                        );
                        guideAsset.hostedUrl = backendViewUrl;
                    }
                }
                savedAssets.push(saved);
            }
        }

        const savedGuide = savedAssets.find(a => a.assetType === 'guide');
        const guideUrl = savedGuide?.assets?.[0]?.hostedUrl || (guideResult.status === 'fulfilled' ? guideResult.value?.hostedUrl : null);

        const signedSavedAssets = await Promise.all(savedAssets.map(a => signBrandKitAsset(a)));
        let signedBrand = null;
        if (brandObj) {
            signedBrand = brandObj.toObject ? brandObj.toObject() : brandObj;
            if (signedBrand.dna?.logo?.url) {
                signedBrand.dna.logo.url = await getSignedUrlIfNeeded(signedBrand.dna.logo.url);
            }
        }

        res.json({
            success: true,
            assets: signedSavedAssets,
            guideUrl,
            artStrategy: identityResult.status === 'fulfilled' ? identityResult.value?.artStrategy : null,
            brand: signedBrand,
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

        const signedAssets = await Promise.all(assets.map(a => signBrandKitAsset(a)));
        res.json({ success: true, assets: signedAssets, total, offset: parseInt(offset), limit: parseInt(limit) });
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

// ─────────────────────────────────────────────────────────────────────────────
// GET /guide/view/:id — Public view endpoint for interactive brand guide HTML
// ─────────────────────────────────────────────────────────────────────────────
router.get('/guide/view/:id', async (req, res) => {
    try {
        const asset = await BrandKitAsset.findById(req.params.id).lean();
        if (!asset || asset.assetType !== 'guide') {
            return res.status(404).send('<h1>Brand Guide not found</h1>');
        }

        const guideAsset = asset.assets?.[0];
        if (!guideAsset) {
            return res.status(404).send('<h1>Brand Guide content not found</h1>');
        }

        if (guideAsset.htmlContent) {
            res.setHeader('Content-Type', 'text/html');
            return res.send(guideAsset.htmlContent);
        }

        if (guideAsset.hostedUrl) {
            console.log(`🌐 [BrandKit] Fetching guide HTML from hosted url: ${guideAsset.hostedUrl}`);
            const response = await fetch(guideAsset.hostedUrl);
            if (response.ok) {
                const html = await response.text();
                // Async save to database so next time is instant
                BrandKitAsset.updateOne(
                    { _id: req.params.id },
                    { $set: { "assets.0.htmlContent": html } }
                ).catch(err => console.error('Failed to cache htmlContent:', err.message));

                res.setHeader('Content-Type', 'text/html');
                return res.send(html);
            }
        }

        res.status(404).send('<h1>Brand Guide content is empty</h1>');
    } catch (err) {
        console.error('[BrandKit] View guide error:', err.message);
        res.status(500).send(`<h1>Error loading Brand Guide</h1><p>${err.message}</p>`);
    }
});

export default router;

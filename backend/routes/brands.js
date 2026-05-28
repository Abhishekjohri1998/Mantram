import { Router } from 'express';
import Brand from '../models/Brand.js';
import BrandAuditLog from '../models/BrandAuditLog.js';
import Product from '../models/Product.js';
import Integration from '../models/Integration.js';
import User from '../models/User.js';
import { protect } from '../middleware/auth.js';
import { requireBrandOwner } from '../middleware/requireBrandOwner.js';
import multer from 'multer';
import crypto from 'crypto';
import { getOrchestrator } from '../agents/orchestrator.js';
import { safeErrorMessage } from '../utils/safeError.js';
import { sanitizeBody } from '../utils/sanitize.js';
import { mirrorBrandAssets } from '../services/assetMirror.js';
import { uploadToS3, mirrorUrlToS3, getSignedUrlIfNeeded } from '../utils/s3.js';
import redis from '../utils/redisClient.js';
import { clearBrandMemCache } from '../agents/shared/agentUtils.js';

/**
 * Invalidate brand context caches (L1 memory + L2 Redis) for a given brand ID.
 * Called after any brand update so the next generation gets fresh data.
 * Non-blocking — never throws.
 */
async function invalidateBrandCache(brandId) {
    if (!brandId) return;
    try {
        // L1: Clear in-process memory cache (instant)
        clearBrandMemCache(brandId.toString());
        // L2: Clear Redis cache
        await redis.del(`brand:${brandId}:context`, `trending:${brandId}`);
        console.log(`🗑️  Brand cache invalidated (L1+L2) for ${brandId}`);
    } catch (err) {
        console.warn(`⚠️ Brand cache invalidation failed: ${err.message}`);
    }
}


const router = Router();

// ═══════════════════════════════════════════════════════════════
// Helper: Create audit log entry
// ═══════════════════════════════════════════════════════════════
async function logAudit(brand, user, action, { section = '', summary = '', changes = {} } = {}) {
    try {
        await BrandAuditLog.create({
            brand: brand._id || brand,
            user: user._id || user,
            userName: user.name || user.email || 'Unknown',
            action,
            section,
            summary,
            changes,
        });
    } catch (err) {
        console.warn('Audit log write failed:', err.message);
    }
}

// Helper: Check brand ownership or shared access
async function findBrandWithAccess(brandId, userId) {
    return Brand.findOne({
        _id: brandId,
        $or: [{ user: userId }, { sharedWith: userId }],
    });
}

/**
 * Sign all S3 URLs in the brand object (DNA assets, images, templates)
 * to ensure they render correctly in the frontend.
 */
async function signBrandAssets(brand) {
    if (!brand) return null;
    const b = brand.toObject ? brand.toObject() : brand;

    // Handle DNA assets
    if (b.dna) {
        if (b.dna.logo?.url) b.dna.logo.url = await getSignedUrlIfNeeded(b.dna.logo.url);
        if (b.dna.favicon?.url) b.dna.favicon.url = await getSignedUrlIfNeeded(b.dna.favicon.url);
        
        if (Array.isArray(b.dna.brandImages)) {
            for (const img of b.dna.brandImages) {
                if (img.url) img.url = await getSignedUrlIfNeeded(img.url);
                if (img.s3Url) img.s3Url = await getSignedUrlIfNeeded(img.s3Url);
            }
        }
        
        if (Array.isArray(b.dna.bannerImages)) {
            for (const img of b.dna.bannerImages) {
                if (img.url) img.url = await getSignedUrlIfNeeded(img.url);
            }
        }
    }

    // Handle Custom Templates
    if (Array.isArray(b.customTemplates)) {
        for (const t of b.customTemplates) {
            if (t.referenceImageUrl) t.referenceImageUrl = await getSignedUrlIfNeeded(t.referenceImageUrl);
        }
    }

    // Handle Custom Categories
    if (Array.isArray(b.customCategories)) {
        for (const c of b.customCategories) {
            if (c.referenceImageUrl) c.referenceImageUrl = await getSignedUrlIfNeeded(c.referenceImageUrl);
        }
    }

    return b;
}

// ═══════════════════════════════════════════════════════════════
// GET /api/brands — list user's brands
// By default, excludes archived brands.
// ?include=archived → only archived brands (for archive page)
// ?include=all      → everything (admin use)
// ═══════════════════════════════════════════════════════════════
router.get('/', protect, async (req, res) => {
    try {
        const query = {
            $or: [{ user: req.user._id }, { sharedWith: req.user._id }]
        };

        // Status filtering — exclude archived by default
        const include = req.query.include;
        if (include === 'archived') {
            query.status = 'archived';
        } else if (include === 'all') {
            // No status filter — return everything
        } else {
            // Default: exclude archived
            query.status = { $ne: 'archived' };
        }

        const brands = await Brand.find(query).sort('-updatedAt');
        const signedBrands = await Promise.all(brands.map(b => signBrandAssets(b)));
        res.json({ success: true, brands: signedBrands });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/brands/:id
// ═══════════════════════════════════════════════════════════════
router.get('/:id', protect, async (req, res) => {
    try {
        const brand = await findBrandWithAccess(req.params.id, req.user._id);
        if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });
        const signedBrand = await signBrandAssets(brand);
        res.json({ success: true, brand: signedBrand });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ═══════════════════════════════════════════════════════════════
// POST /api/brands — create new brand
// ═══════════════════════════════════════════════════════════════
router.post('/', protect, sanitizeBody(['name']), async (req, res) => {
    try {
        const { name, website } = req.body;
        const userId = req.user._id;

        // Normalization helper for website comparison
        const normalizeUrl = (url) => {
            if (!url) return '';
            return url.toLowerCase()
                .replace(/^https?:\/\//, '')
                .replace(/^www\./, '')
                .replace(/\/$/, '');
        };

        const normalizedInputUrl = normalizeUrl(website);

        // Check for existing brands (active/draft) for this user (OWNED OR SHARED)
        // We allow duplicates for archived brands, but prevent them for active ones.
        const existingBrands = await Brand.find({ 
            $or: [{ user: userId }, { sharedWith: userId }],
            status: { $ne: 'archived' } 
        });

        const isDuplicate = existingBrands.some(b => {
            const nameMatch = name && b.name?.toLowerCase() === name.toLowerCase();
            const urlMatch = normalizedInputUrl && normalizeUrl(b.website) === normalizedInputUrl;
            return nameMatch || urlMatch;
        });

        if (isDuplicate) {
            return res.status(400).json({ 
                success: false, 
                error: 'Duplicate Brand Detected', 
                message: 'This brand already exists in your profile. Please add a different brand name or website.' 
            });
        }

        // Mirror assets if DNA is provided manually
        if (req.body.dna) {
            const tempId = crypto.randomUUID();
            await mirrorBrandAssets(req.body.dna, tempId);
        }

        const brandData = await Brand.create({ ...req.body, user: userId });
        await req.user.updateOne({ $inc: { 'usage.brandsCreated': 1 } });
        const signedBrand = await signBrandAssets(brandData);
        res.status(201).json({ success: true, brand: signedBrand });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ═══════════════════════════════════════════════════════════════
// PUT /api/brands/:id — update brand (general fields)
// ═══════════════════════════════════════════════════════════════
router.put('/:id', protect, sanitizeBody(['name']), async (req, res) => {
    try {
        // Mirror assets if DNA is updated
        if (req.body.dna) {
            await mirrorBrandAssets(req.body.dna, req.params.id);
        }

        const brand = await Brand.findOneAndUpdate(
            { _id: req.params.id, $or: [{ user: req.user._id }, { sharedWith: req.user._id }] },
            req.body,
            { returnDocument: 'after', runValidators: true }
        );
        if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });

        // If website is added/updated, trigger SEO baseline audit in background
        if (req.body.website && (req.body.website !== brand.website)) {
            import('../services/seoBaseline.js').then(async ({ runSEOBaseline }) => {
                try {
                    await runSEOBaseline(brand);
                    console.log(`✅ SEO Baseline auto-triggered for ${brand.name} following website update.`);
                } catch (e) { console.warn('⚠️ Background SEO Baseline failed after website update:', e.message); }
            });
        }

        const signedBrand = await signBrandAssets(brand);
        res.json({ success: true, brand: signedBrand });
        // Invalidate cache after response — non-blocking
        invalidateBrandCache(req.params.id);

    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ═══════════════════════════════════════════════════════════════
// PUT /api/brands/:id/dna — update specific DNA fields (with audit)
// ═══════════════════════════════════════════════════════════════
router.put('/:id/dna', protect, async (req, res) => {
    try {
        // Fetch current brand for before-values
        const currentBrand = await findBrandWithAccess(req.params.id, req.user._id);
        if (!currentBrand) return res.status(404).json({ success: false, error: 'Brand not found' });

        const updates = {};
        const changedSections = [];
        const changeDetails = {};

        for (const [key, value] of Object.entries(req.body)) {
            updates[`dna.${key}`] = value;
            changedSections.push(key);
            // Capture before/after for audit
            changeDetails[key] = {
                from: currentBrand.dna?.[key],
                to: value,
            };
        }

        const brand = await Brand.findOneAndUpdate(
            { _id: req.params.id, $or: [{ user: req.user._id }, { sharedWith: req.user._id }] },
            { $set: updates },
            { returnDocument: 'after' }
        );

        // Determine the most specific audit action
        const sectionMap = {
            voice: 'voice_updated',
            colors: 'colors_updated',
            fonts: 'fonts_updated',
            contentStyle: 'content_style_updated',
            brandDescription: 'description_updated',
            targetAudience: 'audience_updated',
            industry: 'industry_updated',
            brandImages: 'images_updated',
        };

        const action = changedSections.length === 1 && sectionMap[changedSections[0]]
            ? sectionMap[changedSections[0]]
            : 'dna_updated';

        await logAudit(brand, req.user, action, {
            section: changedSections.join(', '),
            summary: `Updated brand DNA: ${changedSections.join(', ')}`,
            changes: changeDetails,
        });

        const signedBrand = await signBrandAssets(brand);
        res.json({ success: true, brand: signedBrand });
        invalidateBrandCache(req.params.id);
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});
// ═══════════════════════════════════════════════════════════════
// PUT /api/brands/:id/knowledge — dedicated knowledge update endpoint
// Supports updating any combination of knowledge fields with full audit trail
// ═══════════════════════════════════════════════════════════════
router.put('/:id/knowledge', protect, async (req, res) => {
    try {
        const currentBrand = await findBrandWithAccess(req.params.id, req.user._id);
        if (!currentBrand) return res.status(404).json({ success: false, error: 'Brand not found' });

        const { section, data } = req.body;
        if (!section || !data) {
            return res.status(400).json({ success: false, error: 'section and data are required' });
        }

        // Build update based on section
        const updates = {};
        const validSections = [
            'voice', 'colors', 'fonts', 'contentStyle', 'brandDescription',
            'targetAudience', 'industry', 'country', 'region',
            'defaultLanguage', 'languageStyle', 'brandImages',
        ];

        if (!validSections.includes(section)) {
            return res.status(400).json({ success: false, error: `Invalid section: ${section}` });
        }

        // For object/array sections, merge or replace
        if (typeof data === 'object' && !Array.isArray(data) && ['voice', 'fonts', 'contentStyle'].includes(section)) {
            // Merge sub-fields (e.g. voice.tone = 75)
            for (const [key, value] of Object.entries(data)) {
                updates[`dna.${section}.${key}`] = value;
            }
        } else {
            updates[`dna.${section}`] = data;
        }

        const brand = await Brand.findOneAndUpdate(
            { _id: req.params.id },
            { $set: updates },
            { returnDocument: 'after' }
        );

        const sectionMap = {
            voice: 'voice_updated', colors: 'colors_updated', fonts: 'fonts_updated',
            contentStyle: 'content_style_updated', brandDescription: 'description_updated',
            targetAudience: 'audience_updated', industry: 'industry_updated',
            brandImages: 'images_updated',
        };

        await logAudit(brand, req.user, sectionMap[section] || 'knowledge_added', {
            section,
            summary: `Updated ${section} knowledge`,
            changes: { from: currentBrand.dna?.[section], to: data },
        });

        const signedBrand = await signBrandAssets(brand);
        res.json({ success: true, brand: signedBrand });
        invalidateBrandCache(req.params.id);
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/brands/:id/audit-log — paginated change history
// ═══════════════════════════════════════════════════════════════
router.get('/:id/audit-log', protect, async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [logs, total] = await Promise.all([
            BrandAuditLog.find({ brand: req.params.id })
                .sort('-createdAt')
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            BrandAuditLog.countDocuments({ brand: req.params.id }),
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
// POST /api/brands/:id/analyze-visual-dna — AI-powered visual identity analysis
// Extracts design style, typography, layout, mood, rules from brand data
// ═══════════════════════════════════════════════════════════════
router.post('/:id/analyze-visual-dna', protect, async (req, res) => {
    try {
        const brand = await findBrandWithAccess(req.params.id, req.user._id);
        if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });

        console.log(`🎨 Analyzing Visual DNA for brand: ${brand.name}`);
        const { analyzeVisualDNA } = await import('../services/visualDNA.js');
        const visualDNA = await analyzeVisualDNA(brand);

        if (!visualDNA) {
            return res.status(500).json({ success: false, error: 'Visual DNA analysis failed — please try again' });
        }

        // Save to brand
        await Brand.findOneAndUpdate(
            { _id: brand._id },
            { $set: { 'dna.visualDNA': visualDNA } }
        );

        await logAudit(brand, req.user, 'visual_dna_analyzed', {
            section: 'visualDNA',
            summary: `AI Visual DNA analyzed: ${visualDNA.designStyle}, ${visualDNA.typographyStyle}, ${visualDNA.imageMood}`,
            changes: { visualDNA },
        });

        console.log(`✅ Visual DNA saved for ${brand.name}: style=${visualDNA.designStyle}, mood=${visualDNA.imageMood}`);
        res.json({ success: true, visualDNA });
    } catch (error) {
        console.error('❌ Visual DNA analysis error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ═══════════════════════════════════════════════════════════════
// PUT /api/brands/:id/autonomy — update autonomy settings
// ═══════════════════════════════════════════════════════════════
router.put('/:id/autonomy', protect, async (req, res) => {
    try {
        const updates = {};
        for (const [key, value] of Object.entries(req.body)) {
            updates[`autonomy.${key}`] = value;
        }
        const brand = await Brand.findOneAndUpdate(
            { _id: req.params.id, user: req.user._id },
            { $set: updates },
            { returnDocument: 'after' }
        );
        if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });
        res.json({ success: true, brand });
        invalidateBrandCache(req.params.id);
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ═══════════════════════════════════════════════════════════════
// POST /api/brands/:id/rescan — Re-scan brand's website & refresh DNA
// Preserves user-edited fields, refreshes brand images & products
// ═══════════════════════════════════════════════════════════════
router.post('/:id/rescan', protect, async (req, res) => {
    try {
        const brand = await findBrandWithAccess(req.params.id, req.user._id);
        if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });
        if (!brand.website) return res.status(400).json({ success: false, error: 'Brand has no website URL to scan' });

        console.log(`🔄 Re-scanning brand "${brand.name}" from ${brand.website}...`);

        const orchestrator = getOrchestrator();
        const scanResult = await orchestrator.scanWebsite(brand.website);

        const newDna = scanResult.dna;
        const updates = {};

        // ── Mirror all assets in DNA using centralized service ──
        await mirrorBrandAssets(newDna, brand._id);
        
        // ── Merge brand images (add new, keep existing) ──
        if (newDna.brandImages?.length > 0) {
            const existingUrls = new Set((brand.dna.brandImages || []).map(i => i.url));
            const freshImages = newDna.brandImages.filter(i => i.url && !existingUrls.has(i.url));
            if (freshImages.length > 0) {
                updates['dna.brandImages'] = [...(brand.dna.brandImages || []), ...freshImages];
                console.log(`📸 Added ${freshImages.length} new brand images`);
            }
        }

        // ── Merge banner images (add new, keep existing) ──
        if (newDna.bannerImages?.length > 0) {
            const existingUrls = new Set((brand.dna.bannerImages || []).map(i => i.url));
            const freshBanners = newDna.bannerImages.filter(i => i.url && !existingUrls.has(i.url));
            if (freshBanners.length > 0) {
                updates['dna.bannerImages'] = [...(brand.dna.bannerImages || []), ...freshBanners];
            }
        }

        // ── Update fields ONLY if they were empty (preserve user edits) ──
        const fillIfEmpty = (key, newVal) => {
            if (newVal && !brand.dna[key]) updates[`dna.${key}`] = newVal;
        };
        fillIfEmpty('industry', newDna.industry);
        fillIfEmpty('targetAudience', newDna.targetAudience);
        fillIfEmpty('companyOverview', newDna.companyOverview);
        fillIfEmpty('missionStatement', newDna.missionStatement);
        fillIfEmpty('tagline', newDna.tagline);
        fillIfEmpty('photographyStyle', newDna.photographyStyle);

        // ── Always refresh: services, USPs, values (additive) ──
        if (newDna.servicesOffered?.length > 0) {
            const existing = new Set(brand.dna.servicesOffered || []);
            const merged = [...(brand.dna.servicesOffered || []), ...newDna.servicesOffered.filter(s => !existing.has(s))];
            if (merged.length > (brand.dna.servicesOffered || []).length) updates['dna.servicesOffered'] = merged;
        }
        if (newDna.uniqueSellingPoints?.length > 0) {
            const existing = new Set(brand.dna.uniqueSellingPoints || []);
            const merged = [...(brand.dna.uniqueSellingPoints || []), ...newDna.uniqueSellingPoints.filter(s => !existing.has(s))];
            if (merged.length > (brand.dna.uniqueSellingPoints || []).length) updates['dna.uniqueSellingPoints'] = merged;
        }

        // ── Social links (always update if new ones found) ──
        if (newDna.socialLinks) {
            for (const [platform, link] of Object.entries(newDna.socialLinks)) {
                if (link && (!brand.dna.socialLinks || !brand.dna.socialLinks[platform])) {
                    updates[`dna.socialLinks.${platform}`] = link;
                }
            }
        }

        // Apply updates
        const updateCount = Object.keys(updates).length;
        if (updateCount > 0) {
            await Brand.findOneAndUpdate(
                { _id: brand._id },
                { $set: updates }
            );
        }

        // Re-trigger Visual DNA analysis in background
        import('../services/visualDNA.js').then(async ({ analyzeVisualDNA }) => {
            try {
                const updatedBrand = await Brand.findById(brand._id);
                const visualDNA = await analyzeVisualDNA(updatedBrand);
                if (visualDNA) {
                    await Brand.findOneAndUpdate(
                        { _id: brand._id },
                        { $set: { 'dna.visualDNA': visualDNA } }
                    );
                    console.log(`✅ Visual DNA re-analyzed for ${brand.name}`);
                }
            } catch (e) { console.warn('⚠️ Re-scan Visual DNA failed:', e.message); }
        });

        await logAudit(brand, req.user, 'brand_rescanned', {
            section: 'dna',
            summary: `Website re-scanned. Updated ${updateCount} fields.`,
            changes: { updatedFields: Object.keys(updates) },
        });

        // Fetch updated brand to return
        const updatedBrand = await Brand.findById(brand._id);
        console.log(`✅ Re-scan complete for "${brand.name}" — ${updateCount} fields updated`);

        const signedBrand = await signBrandAssets(updatedBrand);
        res.json({
            success: true,
            brand: signedBrand,
            updates: updateCount,
            message: `Re-scan complete! ${updateCount} fields refreshed.`,
        });
        // Invalidate cache so next agent call fetches fresh DNA
        invalidateBrandCache(brand._id.toString());
    } catch (error) {
        console.error('❌ Brand re-scan error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ═══════════════════════════════════════════════════════════════
// DELETE /api/brands/:id — cascade delete brand and all related data
// ═══════════════════════════════════════════════════════════════
router.delete('/:id', protect, requireBrandOwner, async (req, res) => {
    try {
        const brand = await Brand.findOne({ _id: req.params.id, user: req.user._id });
        if (!brand) return res.status(404).json({ success: false, error: 'Brand not found or access denied' });

        const brandName = brand.name;

        // Cascade delete related data
        const [deletedProducts, deletedIntegrations, deletedLogs] = await Promise.all([
            Product.deleteMany({ brand: brand._id }),
            Integration.deleteMany({ brand: brand._id }),
            BrandAuditLog.deleteMany({ brand: brand._id }),
        ]);

        // Remove brand from team members' brandAccess
        await User.updateMany(
            { brandAccess: brand._id },
            { $pull: { brandAccess: brand._id } }
        );

        // Delete the brand itself
        await Brand.deleteOne({ _id: brand._id });

        console.log(`🗑️ Brand "${brandName}" deleted. Cleaned: ${deletedProducts.deletedCount} products, ${deletedIntegrations.deletedCount} integrations, ${deletedLogs.deletedCount} audit logs`);

        res.json({
            success: true,
            message: `Brand "${brandName}" and all related data deleted`,
            cleaned: {
                products: deletedProducts.deletedCount,
                integrations: deletedIntegrations.deletedCount,
                auditLogs: deletedLogs.deletedCount,
            },
        });
        // Purge cache for the deleted brand
        invalidateBrandCache(req.params.id);
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ═══════════════════════════════════════════════════════════════
// PUT /api/brands/:id/status — toggle active/archived
// ═══════════════════════════════════════════════════════════════
router.put('/:id/status', protect, requireBrandOwner, async (req, res) => {
    try {
        const { status } = req.body;
        if (!['active', 'archived'].includes(status)) {
            return res.status(400).json({ success: false, error: 'Status must be active or archived' });
        }
        const brand = await Brand.findOneAndUpdate(
            { _id: req.params.id, user: req.user._id },
            { status },
            { returnDocument: 'after' }
        );
        if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });

        await logAudit(brand, req.user, status === 'archived' ? 'brand_archived' : 'brand_restored', {
            summary: `Brand ${status === 'archived' ? 'archived' : 'restored to active'}`,
        });

        const signedBrand = await signBrandAssets(brand);
        res.json({ success: true, brand: signedBrand });
        invalidateBrandCache(req.params.id);
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ═══════════════════════════════════════════════════════════════
// Custom Templates (Prompt Library)
// ═══════════════════════════════════════════════════════════════

// POST /api/brands/:id/templates — save a new custom template
router.post('/:id/templates', protect, async (req, res) => {
    try {
        const { templateId, label, icon, description, category, type, style, promptFormula, referenceImageUrl, fields } = req.body;
        if (!label || !promptFormula) {
            return res.status(400).json({ success: false, error: 'label and promptFormula are required' });
        }
        const brand = await Brand.findOne({ _id: req.params.id, user: req.user._id });
        if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });

        const newTemplate = {
            templateId: templateId || `custom-${Date.now()}`,
            label, icon: icon || 'auto_awesome', description: description || '',
            category: category || '',
            type: type || 'instagram-post', style: style || 'modern',
            promptFormula, referenceImageUrl: referenceImageUrl || '',
            fields: fields || [],
        };
        brand.customTemplates.push(newTemplate);
        await brand.save();
        res.status(201).json({ success: true, template: newTemplate, total: brand.customTemplates.length });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// GET /api/brands/:id/templates — list custom templates
router.get('/:id/templates', protect, async (req, res) => {
    try {
        const brand = await findBrandWithAccess(req.params.id, req.user._id);
        if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });
        res.json({ success: true, templates: brand.customTemplates || [] });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// DELETE /api/brands/:id/templates/:templateId — delete a custom template
router.delete('/:id/templates/:templateId', protect, async (req, res) => {
    try {
        const brand = await Brand.findOne({ _id: req.params.id, user: req.user._id });
        if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });
        brand.customTemplates = brand.customTemplates.filter(t => t.templateId !== req.params.templateId);
        await brand.save();
        res.json({ success: true, message: 'Template deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ═══════════════════════════════════════════════════════════════
// Custom Categories
// ═══════════════════════════════════════════════════════════════

// POST /api/brands/:id/categories — save a new custom category
router.post('/:id/categories', protect, async (req, res) => {
    try {
        const { label, icon, color, description, referenceImageUrl, basePromptFormula } = req.body;
        if (!label) {
            return res.status(400).json({ success: false, error: 'label is required' });
        }
        const brand = await Brand.findOne({ _id: req.params.id, user: req.user._id });
        if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });

        const categoryId = `custom-cat-${Date.now()}`;
        const newCategory = {
            categoryId, label, icon: icon || 'auto_awesome',
            color: color || '#f59e0b', description: description || '',
            referenceImageUrl: referenceImageUrl || '',
            basePromptFormula: basePromptFormula || '',
        };
        brand.customCategories.push(newCategory);
        await brand.save();
        res.status(201).json({ success: true, category: newCategory });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// GET /api/brands/:id/categories — list custom categories
router.get('/:id/categories', protect, async (req, res) => {
    try {
        const brand = await findBrandWithAccess(req.params.id, req.user._id);
        if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });
        res.json({ success: true, categories: brand.customCategories || [] });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// DELETE /api/brands/:id/categories/:categoryId — delete a custom category
router.delete('/:id/categories/:categoryId', protect, async (req, res) => {
    try {
        const brand = await Brand.findOne({ _id: req.params.id, user: req.user._id });
        if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });
        brand.customCategories = brand.customCategories.filter(c => c.categoryId !== req.params.categoryId);
        brand.customTemplates = brand.customTemplates.filter(t => t.category !== req.params.categoryId);
        await brand.save();
        res.json({ success: true, message: 'Category and its templates deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ═══════════════════════════════════════════════════════════════
// BRAND KNOWLEDGE INGESTION
// ═══════════════════════════════════════════════════════════════

const knowledgeUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        const allowed = [
            'application/pdf',
            'text/plain',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/csv',
            'text/markdown',
        ];
        if (allowed.includes(file.mimetype) || file.originalname.match(/\.(pdf|txt|doc|docx|csv|md)$/i)) {
            cb(null, true);
        } else {
            cb(new Error('Unsupported file type. Use PDF, TXT, DOC, DOCX, CSV, or MD.'));
        }
    },
});

// POST /api/brands/:id/knowledge/ingest — add knowledge from text, file, or URL
router.post('/:id/knowledge/ingest', protect, knowledgeUpload.single('file'), async (req, res) => {
    try {
        const brand = await findBrandWithAccess(req.params.id, req.user._id);
        if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });

        const { sourceType, title, text, url } = req.body;
        let content = '';
        let entryTitle = title || '';
        let sourceUrl = '';
        let fileName = '';

        // ── TEXT INPUT ──
        if (sourceType === 'text') {
            content = (text || '').trim();
            if (!content) return res.status(400).json({ success: false, error: 'Text content is required' });
            entryTitle = entryTitle || content.substring(0, 80).replace(/\n/g, ' ') + (content.length > 80 ? '…' : '');
        }

        // ── FILE UPLOAD ──
        else if (sourceType === 'file') {
            if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
            fileName = req.file.originalname;
            entryTitle = entryTitle || fileName;

            if (req.file.mimetype === 'application/pdf' || fileName.endsWith('.pdf')) {
                try {
                    const pdfParse = (await import('pdf-parse')).default;
                    const result = await pdfParse(req.file.buffer);
                    content = result.text?.trim() || '';
                } catch (err) {
                    return res.status(400).json({ success: false, error: `Failed to parse PDF: ${err.message}` });
                }
            } else {
                // TXT, CSV, MD, DOC — read as text
                content = req.file.buffer.toString('utf-8').trim();
            }

            if (!content) return res.status(400).json({ success: false, error: 'Could not extract text from file' });

            // Upload original file to S3
            const s3Key = `knowledge/${req.params.id}/${Date.now()}_${fileName}`;
            const s3Url = await uploadToS3(req.file.buffer, s3Key, req.file.mimetype);
            if (s3Url) sourceUrl = s3Url;
        }

        // ── URL SCRAPING ──
        else if (sourceType === 'url') {
            if (!url) return res.status(400).json({ success: false, error: 'URL is required' });
            // BUG-9 FIX: Block SSRF to internal/private networks
            try {
                const parsed = new URL(url);
                const host = parsed.hostname.toLowerCase();
                const blocked = [/^localhost$/i, /^127\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^169\.254\./, /^0\./, /\.internal$/, /\.local$/];
                if (blocked.some(p => p.test(host)) || !['http:', 'https:'].includes(parsed.protocol)) {
                    return res.status(400).json({ success: false, error: 'URL points to an internal or blocked network' });
                }
            } catch { return res.status(400).json({ success: false, error: 'Invalid URL format' }); }
            sourceUrl = url;
            try {
                const { crawlPage } = await import('../utils/web-research.js');
                const pageData = await crawlPage(url);
                if (!pageData.success) {
                    return res.status(400).json({ success: false, error: `Failed to scrape URL: ${pageData.error}` });
                }
                content = pageData.contentSnippet || '';
                // Get full body text if available
                const rawFetch = await fetch(url, {
                    headers: { 'User-Agent': 'MantramAI-KnowledgeBot/1.0' },
                    signal: AbortSignal.timeout(12000),
                });
                if (rawFetch.ok) {
                    const html = await rawFetch.text();
                    // Strip tags to get full text
                    const fullText = html
                        .replace(/<(script|style|nav|header|footer|noscript)[^>]*>[\s\S]*?<\/\1>/gi, '')
                        .replace(/<[^>]+>/g, '')
                        .replace(/&nbsp;/g, ' ')
                        .replace(/\s+/g, ' ')
                        .trim();
                    if (fullText.length > content.length) {
                        content = fullText.substring(0, 50000); // cap at 50k chars
                    }
                }
                entryTitle = entryTitle || pageData.title || new URL(url).hostname;
            } catch (err) {
                return res.status(400).json({ success: false, error: `Failed to scrape URL: ${err.message}` });
            }
        } else {
            return res.status(400).json({ success: false, error: 'sourceType must be text, file, or url' });
        }

        // Cap content at 50k characters
        if (content.length > 50000) content = content.substring(0, 50000);

        // ══════════════════════════════════════════════════════════════
        // SMART DUPLICATE DETECTION — analyze before saving
        // ══════════════════════════════════════════════════════════════
        const force = req.body.force === 'true' || req.body.force === true;
        const replaceEntryId = req.body.replaceEntryId || null;

        if (!force) {
            const { detectDuplicates } = await import('../utils/knowledge-dedup.js');
            const existingEntries = brand.knowledge?.entries || [];
            const warnings = detectDuplicates(
                { title: entryTitle, content, sourceUrl, fileName, sourceType },
                existingEntries
            );

            if (warnings.length > 0) {
                // Don't save — return warnings for the user to decide
                return res.json({
                    success: false,
                    duplicateWarnings: warnings,
                    pendingEntry: { title: entryTitle, charCount: content.length, sourceType },
                    message: 'Potential duplicates detected. Review and choose an action.',
                });
            }
        }

        // If replacing an existing entry, remove it first
        if (replaceEntryId && brand.knowledge?.entries) {
            brand.knowledge.entries = brand.knowledge.entries.filter(e => e.id !== replaceEntryId);
        }

        const entry = {
            id: crypto.randomUUID(),
            sourceType,
            title: entryTitle,
            content,
            sourceUrl,
            fileName,
            charCount: content.length,
            addedAt: new Date(),
        };

        // Push to knowledge entries
        if (!brand.knowledge) brand.knowledge = { entries: [] };
        brand.knowledge.entries.push(entry);
        await brand.save();

        await logAudit(brand, req.user, 'knowledge_added', {
            section: 'knowledge',
            summary: `Added ${sourceType} knowledge: "${entryTitle}" (${content.length} chars)${replaceEntryId ? ' [replaced existing]' : ''}`,
        });

        // Invalidate brand cache — new knowledge must be reflected immediately in agent prompts
        invalidateBrandCache(brand._id.toString());

        res.json({ success: true, entry });
    } catch (error) {
        console.error('Knowledge ingest error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// GET /api/brands/:id/knowledge/entries — list knowledge entries (without full content)
router.get('/:id/knowledge/entries', protect, async (req, res) => {
    try {
        const brand = await findBrandWithAccess(req.params.id, req.user._id);
        if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });

        const entries = (brand.knowledge?.entries || []).map(e => ({
            id: e.id,
            sourceType: e.sourceType,
            title: e.title,
            sourceUrl: e.sourceUrl,
            fileName: e.fileName,
            charCount: e.charCount,
            addedAt: e.addedAt,
            preview: e.content?.substring(0, 200) || '',
        }));

        res.json({ success: true, entries });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// DELETE /api/brands/:id/knowledge/entries/:entryId — remove a knowledge entry
router.delete('/:id/knowledge/entries/:entryId', protect, async (req, res) => {
    try {
        const brand = await findBrandWithAccess(req.params.id, req.user._id);
        if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });

        const entry = brand.knowledge?.entries?.find(e => e.id === req.params.entryId);
        if (!entry) return res.status(404).json({ success: false, error: 'Entry not found' });

        brand.knowledge.entries = brand.knowledge.entries.filter(e => e.id !== req.params.entryId);
        await brand.save();

        await logAudit(brand, req.user, 'knowledge_removed', {
            section: 'knowledge',
            summary: `Removed ${entry.sourceType} knowledge: "${entry.title}"`,
        });

        // Invalidate brand cache — deleted knowledge must stop appearing in agent prompts
        invalidateBrandCache(brand._id.toString());

        res.json({ success: true, message: 'Entry deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

export default router;

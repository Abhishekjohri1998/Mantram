import express from 'express';
import { protect } from '../middleware/auth.js';
import Template from '../models/Template.js';
import TemplateCategory from '../models/TemplateCategory.js';
import TemplateUsageLog from '../models/TemplateUsageLog.js';
import GenerationJob from '../models/GenerationJob.js';
import { buildTemplatePrompt } from '../agents/shared/templatePromptCombiner.js';
import { analyzeProduct } from '../agents/templates/productAnalyzer.js';
import { deductCredits } from '../middleware/credits.js';
import { internalGenerateCreative } from './creatives.js';
import Brand from '../models/Brand.js';

const router = express.Router();

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/templates/public/homepage
// Unprotected route for the marketing landing page
// ══════════════════════════════════════════════════════════════════════════════
router.get('/public/homepage', async (req, res) => {
    try {
        const templates = await Template.find({ isActive: true, isPublished: true, showOnHomeScreen: true })
            .select('name previewUrl previewImageUrl previewVideoUrl previewType studioOrigin')
            .populate('categoryId', 'name color iconEmoji')
            .sort({ isFeatured: -1, createdAt: -1 })
            .limit(10)
            .lean();
            
        res.json({ success: true, templates });
    } catch (error) {
        console.error('GET /api/templates/public/homepage error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/templates
// User-facing browse — published only, prompt fields excluded
// Supports ?studioSection=ai_create, ?brandId=xxx (brand-aware templates first)
// ══════════════════════════════════════════════════════════════════════════════
router.get('/', protect, async (req, res) => {
    try {
        const { limit = 50, page = 1, categoryId, studioOrigin, studioSection, brandId, search } = req.query;
        const baseFilter = { isActive: true, isPublished: true };

        if (categoryId) baseFilter.categoryId = categoryId;
        if (studioOrigin) baseFilter.studioOrigin = studioOrigin;
        if (studioSection) baseFilter.studioSection = studioSection;

        if (search) {
            baseFilter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { tags: { $regex: search, $options: 'i' } }
            ];
        }

        let templates;

        if (brandId) {
            // Step 9: when brandId present, brand-aware templates returned first
            const [brandAware, general] = await Promise.all([
                Template.find({ ...baseFilter, promptTemplate: { $regex: '\\{brand\\}|\\{product\\}', $options: 'i' } })
                    .select('-savedPrompt -promptTemplate -generationParams')
                    .sort({ isFeatured: -1, usageCount: -1, createdAt: -1 })
                    .limit(parseInt(limit))
                    .populate('categoryId', 'name color iconEmoji')
                    .lean(),
                Template.find({
                    ...baseFilter,
                    $or: [
                        { promptTemplate: { $not: /\{brand\}|\{product\}/i } },
                        { promptTemplate: { $exists: false } },
                        { promptTemplate: '' },
                    ],
                })
                    .select('-savedPrompt -promptTemplate -generationParams')
                    .sort({ isFeatured: -1, usageCount: -1, createdAt: -1 })
                    .skip((parseInt(page) - 1) * parseInt(limit))
                    .limit(parseInt(limit))
                    .populate('categoryId', 'name color iconEmoji')
                    .lean(),
            ]);
            templates = [
                ...brandAware.map(t => ({ ...t, isBrandAware: true })),
                ...general.map(t => ({ ...t, isBrandAware: false })),
            ];
        } else {
            templates = (await Template.find(baseFilter)
                .select('-savedPrompt -promptTemplate -generationParams')
                .sort({ isFeatured: -1, usageCount: -1, createdAt: -1 })
                .skip((parseInt(page) - 1) * parseInt(limit))
                .limit(parseInt(limit))
                .populate('categoryId', 'name color iconEmoji')
                .lean()).map(t => ({ ...t, isBrandAware: false }));
        }

        res.json({ success: true, templates });
    } catch (error) {
        console.error('GET /api/templates error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/templates/by-section/:section — clean section-scoped alias (Step 9)
// ══════════════════════════════════════════════════════════════════════════════
router.get('/by-section/:section', protect, async (req, res) => {
    try {
        const { section } = req.params;
        const { brandId, limit = 30 } = req.query;
        const filter = { isActive: true, isPublished: true, studioSection: section };

        let templates;
        if (brandId) {
            const [brandAware, general] = await Promise.all([
                Template.find({ ...filter, promptTemplate: { $regex: '\\{brand\\}|\\{product\\}', $options: 'i' } })
                    .select('-generationParams')
                    .sort({ isFeatured: -1, usageCount: -1 })
                    .limit(10)
                    .lean(),
                Template.find({ ...filter, $or: [{ promptTemplate: { $not: /\{brand\}|\{product\}/i } }, { promptTemplate: '' }] })
                    .select('-generationParams')
                    .sort({ isFeatured: -1, usageCount: -1 })
                    .limit(parseInt(limit))
                    .lean(),
            ]);
            templates = [
                ...brandAware.map(t => ({ ...t, isBrandAware: true })),
                ...general.map(t => ({ ...t, isBrandAware: false })),
            ];
        } else {
            templates = (await Template.find(filter)
                .select('-generationParams')
                .sort({ isFeatured: -1, usageCount: -1, createdAt: -1 })
                .limit(parseInt(limit))
                .lean()).map(t => ({ ...t, isBrandAware: false }));
        }

        res.json({ success: true, section, templates });
    } catch (error) {
        console.error('GET /api/templates/by-section error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/templates/:id — single template (prompt excluded for regular users)
// ══════════════════════════════════════════════════════════════════════════════
router.get('/:id', protect, async (req, res) => {
    try {
        const template = await Template.findOne({ _id: req.params.id, isActive: true })
            .populate('categoryId', 'name color iconEmoji')
            .lean();

        if (!template) {
            return res.status(404).json({ success: false, error: 'Template not found' });
        }
        // Include prompt fields so template hydration (pre-filling studio prompt) works
        const { generationParams, ...safeTemplate } = template;
        res.json({ success: true, template: safeTemplate });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/templates/:id/use — Step 10 rebuild
// Accepts productImageUrl + avatarImageUrl as S3 URLs, never base64
// ══════════════════════════════════════════════════════════════════════════════
router.post('/:id/use', protect, async (req, res) => {
    const startTime = Date.now();
    let usageLog = null;

    try {
        const template = await Template.findOne({ _id: req.params.id, isActive: true, isPublished: true });
        if (!template) {
            return res.status(404).json({ success: false, error: 'Template not found or inactive' });
        }

        const { userInputs = {} } = req.body;
        // Step 10 + BUG-03 FIX: Accept S3 URL strings — base64 deprecated
        const { userPrompt, isFullPrompt, productImageUrl, avatarImageUrl, settings, brandId: inputBrandId } = userInputs;

        // Resolve brandId — use provided, or fall back to user's first brand
        let brandId = inputBrandId || null;
        if (!brandId) {
            const fallbackBrand = await Brand.findOne({ user: req.user._id }, '_id').lean();
            brandId = fallbackBrand?._id?.toString() || null;
            if (brandId) console.log(`[Template] No brandId in request — using fallback brand: ${brandId}`);
        }

        // 1. Stage 4: Run two-pass product intelligence if product image is present
        //    This classifies the product and extracts detailed specs for accurate generation
        let productIntelligence = null;
        if (productImageUrl && template.enableProductAnalysis !== false) {
            console.log(`[Template] Starting product analysis for template: ${template.name}`);
            productIntelligence = await analyzeProduct(productImageUrl);
            if (productIntelligence) {
                console.log(`[Template] Product classified: ${productIntelligence.category} (${productIntelligence.complexity} complexity, ${(productIntelligence.confidence * 100).toFixed(0)}% confidence)`);
            }
        }

        // 2. Build prompt — pass brandId + product intelligence for full substitution
        const promptData = await buildTemplatePrompt({
            template,
            userPrompt,
            isFullPrompt,
            productImageUrl,
            avatarImageUrl,
            brandId,
            productDescription: productIntelligence?.description || '',
            productClassification: productIntelligence || null,
        });

        // 2. Determine cost & deduct credits
        let deductCategory = null;
        if (template.studioOrigin === 'creative') deductCategory = 'creative';
        else if (template.studioOrigin === 'video') deductCategory = 'videoGenerate';
        else if (template.studioOrigin === 'content') deductCategory = 'content';

        // Resolve actual credit cost for GenerationJob tracking
        const { getCreditCosts } = await import('../middleware/credits.js');
        const creditCosts = await getCreditCosts();
        const cost = deductCategory ? (creditCosts[deductCategory] || 0) : 0;

        if (deductCategory) {
            // Use action string so deductCredits logs studio + brand correctly
            await deductCredits(req.user._id, deductCategory, 1, brandId);
        }

        // 3. Increment usageCount; increment usedByCount only first time per user
        const alreadyUsed = await TemplateUsageLog.exists({
            templateId: template._id,
            userId: req.user._id,
            status: 'success',
        });
        await Template.findByIdAndUpdate(template._id, {
            $inc: { usageCount: 1, ...(alreadyUsed ? {} : { usedByCount: 1 }) }
        });

        // 4. Pre-create usage log
        usageLog = await TemplateUsageLog.create({
            templateId: template._id,
            userId: req.user._id,
            brandId: brandId || null,
            studioOrigin: template.studioOrigin,
            userBrief: userPrompt || '',
            hadProductImage: !!productImageUrl,
            hadAvatarImage: !!avatarImageUrl,
            status: 'success', // optimistic — update to 'failed' in catch
        });

        // 5. Route to correct pipeline
        let jobId;

        if (template.studioOrigin === 'creative') {
            jobId = `create-${Date.now()}`;

            // BUG-FIX: Create the GenerationJob record FIRST so the frontend poller finds it
            await GenerationJob.create({
                jobId,
                user: req.user._id,
                brand: brandId || null,
                type: 'ai-create',
                format: template.defaultSettings?.format || settings?.format || 'instagram-post',
                status: 'pending',
                prompt: promptData.finalPrompt,
                creditsDeducted: cost,
                options: { ...(promptData.settings || {}), ...(settings || {}) },
                meta: { label: `Template: ${template.name}`, page: '/creative-studio' }
            });

            // Fire generation in background — uses refImageUrls (flat S3 URL list) for image refs
            internalGenerateCreative({
                body: {
                    brandId: brandId || null,
                    type: template.defaultSettings?.format || settings?.format || 'instagram-post',
                    prompt: promptData.finalPrompt,
                    refImageUrls: promptData.refImageUrls || [],  // flat S3 URL list for Gemini refs
                    options: {
                        ...(promptData.settings || {}),
                        ...(settings || {}),
                        // Pass product/avatar as structured options for the pipeline
                        productImageUrl: productImageUrl || null,
                        avatarImageUrl: avatarImageUrl || null,
                        // System reference image (template design reference)
                        templateRefImageUrl: template.systemReferenceImage?.startsWith('http') ? template.systemReferenceImage : null,
                        templateInpainting: !!template.systemReferenceImage?.startsWith('http'),
                        // FIX #3: Skip the agentic pipeline — template prompt is already production-ready
                        // buildTemplatePrompt() already resolved placeholders, injected brand DNA, and
                        // added product preservation directives. The Art Director would REWRITE it.
                        skipPipeline: true,
                        alreadyEnhanced: true,
                        // Use the model that originally created this template's preview
                        imageModel: template.generationModel || settings?.imageModel || 'nanobanana-2',
                        // Pass aspect ratio from template defaults
                        aspectRatio: template.defaultSettings?.aspectRatio || settings?.aspectRatio || '1:1',
                    },
                    jobId
                },
                user: req.user,
                creditsDeducted: cost,
                jobId
            }).catch(async (e) => {
                console.error('Creative background dispatch error:', e);
                await GenerationJob.updateOne({ jobId }, { status: 'failed', errorMessage: e.message || 'Pipeline failed' }).catch(() => {});
            });

        } else if (template.studioOrigin === 'video') {
            jobId = `vid-${Date.now()}`;
            await GenerationJob.create({
                jobId,
                user: req.user._id,
                type: 'video',
                status: 'pending',
                prompt: promptData.finalPrompt,
                options: { ...promptData.settings, ...settings },
                creditsDeducted: cost,
                meta: { label: `Template: ${template.name}`, page: '/video-studio' }
            });
            fetch(`http://localhost:${process.env.PORT || 3001}/api/video-studio/agent/create`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': req.headers.authorization,
                    'X-Skip-Credits': 'true'
                },
                body: JSON.stringify({
                    jobId,
                    prompt: promptData.finalPrompt,
                    visionInputs: promptData.visionInputs,
                    settings: promptData.settings
                })
            }).catch(async (e) => {
                console.error('Video background dispatch error:', e);
                await GenerationJob.updateOne({ jobId }, { status: 'failed', errorMessage: e.message || 'Pipeline failed' }).catch(() => {});
            });

        } else {
            // content
            jobId = `content-${Date.now()}`;
            await GenerationJob.create({
                jobId,
                user: req.user._id,
                type: 'content',
                status: 'pending',
                prompt: promptData.finalPrompt,
                options: { ...promptData.settings, ...settings },
                creditsDeducted: cost,
                meta: { label: `Template: ${template.name}`, page: '/content-studio' }
            });
            fetch(`http://localhost:${process.env.PORT || 3001}/api/content/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': req.headers.authorization,
                    'X-Skip-Credits': 'true'
                },
                body: JSON.stringify({ jobId, prompt: promptData.finalPrompt, topic: promptData.finalPrompt })
            }).catch(async (e) => {
                console.error('Content background dispatch error:', e);
                await GenerationJob.updateOne({ jobId }, { status: 'failed', errorMessage: e.message || 'Pipeline failed' }).catch(() => {});
            });
        }

        // 6. Update log with jobId + duration
        if (usageLog && jobId) {
            usageLog.resultJobId = jobId;
            usageLog.generationDurationMs = Date.now() - startTime;
            await usageLog.save();
        }

        res.json({
            success: true,
            jobId,
            status: 'processing',
            message: `Template generation started for ${template.studioOrigin}`
        });

    } catch (error) {
        console.error('POST /api/templates/:id/use error:', error);
        if (usageLog) {
            usageLog.status = 'failed';
            usageLog.errorMessage = error.message;
            usageLog.generationDurationMs = Date.now() - startTime;
            await usageLog.save().catch(() => {});
        }
        res.status(500).json({ success: false, error: error.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/templates/my-brand — brand-scoped user-created DNA templates
// Returns templates created by this user for this brand
// ══════════════════════════════════════════════════════════════════════════════
router.get('/my-brand', protect, async (req, res) => {
    try {
        const { brandId } = req.query;
        if (!brandId) return res.status(400).json({ success: false, error: 'brandId is required' });

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/templates/analyze-and-create — Gemini DNA extraction pipeline
// Accepts: referenceImageUrl (S3), brandId, name, aspectRatio
// Returns: { success, template } with full DNA object
// ══════════════════════════════════════════════════════════════════════════════
router.post('/analyze-and-create', protect, async (req, res) => {
    const start = Date.now();
    try {
        const {
            referenceImageUrl,
            brandId,
            name,
            aspectRatio = '1:1',
        } = req.body;

        if (!referenceImageUrl) return res.status(400).json({ success: false, error: 'referenceImageUrl is required' });

// ══════════════════════════════════════════════════════════════════════════════
// DELETE /api/templates/:id — Soft-delete a user-created template
// Only the creator can delete their own templates
// ══════════════════════════════════════════════════════════════════════════════
router.delete('/:id', protect, async (req, res) => {
    try {
        const template = await Template.findOne({
            _id: req.params.id,
            userCreated: true,
            createdBy: req.user._id,
        });

export default router;

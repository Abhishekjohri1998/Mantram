import express from 'express';
import { protect } from '../middleware/auth.js';
import Template from '../models/Template.js';
import TemplateCategory from '../models/TemplateCategory.js';
import TemplateUsageLog from '../models/TemplateUsageLog.js';
import GenerationJob from '../models/GenerationJob.js';
import { buildTemplatePrompt } from '../agents/shared/templatePromptCombiner.js';
import { deductCredits } from '../middleware/credits.js';
import { internalGenerateCreative } from './creatives.js';
import Brand from '../models/Brand.js';

const router = express.Router();

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
        // Remove prompt fields from user-facing single template response too
        const { savedPrompt, promptTemplate, generationParams, ...safeTemplate } = template;
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
        const { userPrompt, productImageUrl, avatarImageUrl, settings, brandId: inputBrandId } = userInputs;

        // Resolve brandId — use provided, or fall back to user's first brand
        let brandId = inputBrandId || null;
        if (!brandId) {
            const fallbackBrand = await Brand.findOne({ user: req.user._id }, '_id').lean();
            brandId = fallbackBrand?._id?.toString() || null;
            if (brandId) console.log(`[Template] No brandId in request — using fallback brand: ${brandId}`);
        }

        // 1. Build prompt — pass correct S3 URL param names
        const promptData = await buildTemplatePrompt({
            template,
            userPrompt,
            productImageUrl,  // S3 URL or null (maps to resolvedProduct in combiner)
            avatarImageUrl,   // S3 URL or null (maps to resolvedAvatar in combiner)
        });

        // 2. Determine cost & deduct credits
        let cost = 0;
        let deductCategory = 'template';
        if (template.studioOrigin === 'creative') { cost = 4; deductCategory = 'creative'; }
        else if (template.studioOrigin === 'video') { cost = 8; deductCategory = 'videoGenerate'; }
        else if (template.studioOrigin === 'content') { cost = 2; deductCategory = 'content'; }

        if (cost > 0) {
            await deductCredits(req.user._id, cost, deductCategory);
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

export default router;

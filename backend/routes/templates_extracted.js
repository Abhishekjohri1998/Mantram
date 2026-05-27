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
        const templates = await Template.find({ isActive: true, isPublished: true, studioSection: 'homepage' })
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
// GET /api/templates/my-brand — brand-scoped user-created DNA templates
// Returns templates created by this user for this brand
// ══════════════════════════════════════════════════════════════════════════════
router.get('/my-brand', protect, async (req, res) => {
    try {
        const { brandId } = req.query;
        if (!brandId) return res.status(400).json({ success: false, error: 'brandId is required' });

        const templates = await Template.find({
            brandId,
            userCreated: true,
            isActive: true,
            createdBy: req.user._id,
        })
            .select('-savedPrompt -promptTemplate -generationParams')
            .sort({ createdAt: -1 })
            .lean();

        res.json({ success: true, templates });
    } catch (error) {
        console.error('GET /api/templates/my-brand error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

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
        if (!brandId) return res.status(400).json({ success: false, error: 'brandId is required' });
        if (!name || !name.trim()) return res.status(400).json({ success: false, error: 'name is required' });

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return res.status(500).json({ success: false, error: 'GEMINI_API_KEY not configured' });

        // ── Load brand for DNA context ──────────────────────────────────────────
        const brand = await Brand.findById(brandId).select('name dna').lean();
        const brandColors = brand?.dna?.colors?.map(c => c.hex).filter(Boolean).join(', ') || 'not specified';
        const brandName = brand?.name || 'the brand';

        // ── Fetch reference image as inline base64 for Gemini Vision ───────────
        console.log(`[TemplateCreate] Fetching reference image for DNA analysis...`);
        let imagePart = null;
        try {
            const imageRes = await fetch(referenceImageUrl, { signal: AbortSignal.timeout(15_000) });
            if (imageRes.ok) {
                const arrayBuffer = await imageRes.arrayBuffer();
                const base64 = Buffer.from(arrayBuffer).toString('base64');
                const mimeType = imageRes.headers.get('content-type') || 'image/jpeg';
                imagePart = { inlineData: { mimeType: mimeType.split(';')[0], data: base64 } };
            }
        } catch (fetchErr) {
            console.warn('[TemplateCreate] Failed to fetch reference image:', fetchErr.message);
        }
        if (!imagePart) return res.status(400).json({ success: false, error: 'Could not process the reference image' });

        // ── Gemini Vision — Design DNA Extraction ───────────────────────────────
        const DNA_PROMPT = `You are a world-class brand design analyst. Study this marketing creative image with extreme precision.

Your task: Extract the complete Design DNA so this EXACT visual style can be perfectly replicated for any product or content.

Brand: ${brandName}
Brand Colors (for context): ${brandColors}

Analyze and return ONLY valid JSON (no markdown, no code fences, no comments):

{
  "layout": "one of: centered-hero | split-left-right | split-right-left | top-hero-bottom-text | grid | full-bleed | asymmetric | minimal-white | dark-cinematic",
  "colorPalette": ["#HEX1", "#HEX2", "#HEX3"],
  "mood": "2-4 word description, e.g. bold festive luxury",
  "typography": {
    "headingStyle": "describe the headline font weight, size, case, color, and position",
    "bodyStyle": "describe body/subtext style if visible, else write 'not present'"
  },
  "contentZones": [
    {
      "role": "headline | product | offer | cta | logo | subtext | model | background | decorative",
      "position": "top-left | top-center | top-right | center | bottom-left | bottom-center | bottom-right | full-bleed | left-half | right-half",
      "style": "concise visual description of this zone"
    }
  ],
  "fitInstruction": "A precise instruction for how a new product image should be placed in this template.",
  "promptFormula": "A complete, reusable image generation prompt starting with 'Create a' that captures this EXACT visual style. Use {{BRAND}} for brand name, {{PRODUCT_DESCRIPTION}} for the product, {{HEADLINE}} for main text, {{OFFER}} for offer/discount text, {{CTA}} for call-to-action."
}

RULES:
- Only describe what is ACTUALLY visible in the image
- colorPalette must be real hex codes extracted from the image
- promptFormula must be detailed enough to recreate this design without seeing the original`;

        const ANALYSIS_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash-001', 'gemini-2.0-flash-lite'];
        let rawText = '';

        for (const modelId of ANALYSIS_MODELS) {
            try {
                console.log(`[TemplateCreate] DNA extraction via ${modelId}...`);
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;
                const resp = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ role: 'user', parts: [imagePart, { text: DNA_PROMPT }] }],
                        generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
                    }),
                    signal: AbortSignal.timeout(35_000),
                });
                const data = await resp.json();
                if (data.error) {
                    const msg = data.error.message || '';
                    const overloaded = msg.toLowerCase().includes('high demand') || msg.toLowerCase().includes('overload') || resp.status === 503;
                    if (overloaded) { console.warn(`[TemplateCreate] ${modelId} overloaded, trying next`); continue; }
                    throw new Error(msg);
                }
                const parts = data.candidates?.[0]?.content?.parts || [];
                for (const p of parts) { if (p.text && !p.thought) rawText += p.text; }
                if (rawText) { console.log(`[TemplateCreate] DNA extracted via ${modelId} (${rawText.length} chars)`); break; }
            } catch (e) {
                if (e.name !== 'TimeoutError') console.warn(`[TemplateCreate] ${modelId} failed: ${e.message?.substring(0, 80)}`);
            }
        }

        // ── Parse DNA JSON ──────────────────────────────────────────────────────
        let dna = null;
        try {
            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            if (jsonMatch) dna = JSON.parse(jsonMatch[0]);
        } catch (e) {
            console.warn('[TemplateCreate] DNA JSON parse failed, using fallback:', e.message);
        }

        // ── Fallback DNA if parsing failed ──────────────────────────────────────
        if (!dna) {
            dna = {
                layout: 'centered-hero',
                colorPalette: [],
                mood: 'modern professional',
                typography: { headingStyle: 'bold uppercase headline', bodyStyle: 'not present' },
                contentZones: [
                    { role: 'product', position: 'center', style: 'hero product placement' },
                    { role: 'headline', position: 'top-center', style: 'bold headline' },
                ],
                fitInstruction: 'Place the product prominently in the center of the frame with professional studio lighting.',
                promptFormula: `Create a professional marketing image for {{BRAND}} featuring {{PRODUCT_DESCRIPTION}}. Brand colors: ${brandColors}. Include: {{HEADLINE}} as main text. Clean, modern composition.`,
            };
        }

        // ── Create Template document ────────────────────────────────────────────
        const promptForSave = dna.promptFormula ||
            `Create a professional marketing image for {{BRAND}} featuring {{PRODUCT_DESCRIPTION}}. Brand colors: ${brandColors}. Include: {{HEADLINE}} as main text.`;

        const template = new Template({
            name: name.trim(),
            previewImageUrl: referenceImageUrl,
            previewUrl: referenceImageUrl,         // required by schema
            previewType: 'image',                  // required by schema
            savedPrompt: promptForSave,            // required by schema (non-empty)
            promptTemplate: promptForSave,
            dna,
            brandId,
            userCreated: true,
            createdBy: req.user._id,
            isActive: true,
            isPublished: true,
            studioOrigin: 'creative',
            studioSection: 'ai_create',            // valid enum value
            enableProductAnalysis: true,
            aspectRatio,
        });

        await template.save();
        console.log(`[TemplateCreate] Created template "${template.name}" (${template._id}) in ${Date.now() - start}ms`);

        res.json({
            success: true,
            template: {
                _id: template._id,
                name: template.name,
                previewImageUrl: template.previewImageUrl,
                dna: template.dna,
                aspectRatio: template.aspectRatio,
                createdAt: template.createdAt,
            },
        });
    } catch (error) {
        console.error('[TemplateCreate] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/templates
// User-facing browse — published only, prompt fields excluded
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
// GET /api/templates/by-section/:section
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
// GET /api/templates/:id — single template
// ══════════════════════════════════════════════════════════════════════════════
router.get('/:id', protect, async (req, res) => {
    try {
        const template = await Template.findOne({ _id: req.params.id, isActive: true })
            .populate('categoryId', 'name color iconEmoji')
            .lean();

        if (!template) {
            return res.status(404).json({ success: false, error: 'Template not found' });
        }
        const { generationParams, ...safeTemplate } = template;
        res.json({ success: true, template: safeTemplate });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

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

        if (!template) {
            return res.status(404).json({ success: false, error: 'Template not found or not owned by you' });
        }

        template.isActive = false;
        await template.save();

        res.json({ success: true, message: 'Template deleted' });
    } catch (error) {
        console.error('DELETE /api/templates/:id error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/templates/:id/use — Template Fit Engine
// FAST RESPOND: returns jobId immediately (<1s), all heavy work runs in background
// Pipeline: respond → [bg] product analysis → buildFitPrompt → generate
// ══════════════════════════════════════════════════════════════════════════════
router.post('/:id/use', protect, async (req, res) => {
    const startTime = Date.now();

    try {
        const template = await Template.findOne({ _id: req.params.id, isActive: true, isPublished: true });
        if (!template) {
            return res.status(404).json({ success: false, error: 'Template not found or inactive' });
        }

        const { userInputs = {} } = req.body;
        const { userPrompt, brief, productImageUrl, avatarImageUrl, settings, brandId: inputBrandId } = userInputs;

        // Resolve brandId — use provided, or fall back to user's first brand
        let brandId = inputBrandId || null;
        if (!brandId) {
            const fallbackBrand = await Brand.findOne({ user: req.user._id }, '_id').lean();
            brandId = fallbackBrand?._id?.toString() || null;
            if (brandId) console.log(`[Template] No brandId in request — using fallback brand: ${brandId}`);
        }

        // ── Determine credit cost ────────────────────────────────────────────────
        let deductCategory = null;
        if (template.studioOrigin === 'creative') deductCategory = 'creative';
        else if (template.studioOrigin === 'video') deductCategory = 'videoGenerate';
        else if (template.studioOrigin === 'content') deductCategory = 'content';

        const { getCreditCosts } = await import('../middleware/credits.js');
        const creditCosts = await getCreditCosts();
        const cost = deductCategory ? (creditCosts[deductCategory] || 0) : 0;

        if (deductCategory) {
            await deductCredits(req.user._id, deductCategory, 1, brandId);
        }

        // ── Create the jobId and GenerationJob record NOW so polling works immediately
        let jobId;
        if (template.studioOrigin === 'creative') {
            jobId = `create-${Date.now()}`;
        } else if (template.studioOrigin === 'video') {
            jobId = `vid-${Date.now()}`;
        } else {
            jobId = `content-${Date.now()}`;
        }

        await GenerationJob.create({
            jobId,
            user: req.user._id,
            brand: brandId || null,
            type: template.studioOrigin === 'creative' ? 'ai-create' : template.studioOrigin,
            format: template.defaultSettings?.format || settings?.format || 'instagram-post',
            status: 'pending',
            prompt: `Template: ${template.name}`,  // placeholder until full prompt is built in background
            creditsDeducted: cost,
            options: { ...(settings || {}) },
            meta: { label: `Template: ${template.name}`, page: '/creative-studio' }
        });

        // ── RESPOND IMMEDIATELY — all heavy work below runs in background ─────────
        res.json({
            success: true,
            jobId,
            status: 'processing',
            message: `Template generation started for ${template.studioOrigin}`
        });

        // ── Background pipeline (non-blocking) ──────────────────────────────────
        // Capture req.user (Mongoose doc) before setImmediate — needed for user.updateOne() inside internalGenerateCreative
        const reqUser = req.user;
        const reqAuthHeader = req.headers.authorization;
        setImmediate(async () => {
            let usageLog = null;
            try {
                // 1. Two-pass product intelligence (Claude, ~30-60s)
                let productIntelligence = null;
                if (productImageUrl && template.enableProductAnalysis !== false) {
                    console.log(`[Template] Running product intelligence for: ${template.name}`);
                    try {
                        productIntelligence = await analyzeProduct(productImageUrl);
                        if (productIntelligence) {
                            console.log(`[Template] Product: ${productIntelligence.category} | ${productIntelligence.complexity} | ${(productIntelligence.confidence * 100).toFixed(0)}%`);
                        }
                    } catch (analyzeErr) {
                        console.warn('[Template] Product analysis failed (non-blocking):', analyzeErr.message);
                    }
                }

                // 2. Build final prompt using DNA fit engine
                const promptData = await buildTemplatePrompt({
                    template,
                    userPrompt: userPrompt || brief || '',
                    brief: brief || '',
                    productImageUrl,
                    avatarImageUrl,
                    brandId,
                    productDescription: productIntelligence?.description || '',
                    productClassification: productIntelligence || null,
                    useDnaFormula: !!(template.userCreated && template.dna?.promptFormula),
                });

                // Update the job record with the real prompt now that we have it
                await GenerationJob.updateOne({ jobId }, {
                    prompt: promptData.finalPrompt,
                    options: { ...(promptData.settings || {}), ...(settings || {}) },
                    status: 'processing',
                });

                // 3. Usage tracking
                const alreadyUsed = await TemplateUsageLog.exists({
                    templateId: template._id,
                    userId: req.user._id,
                    status: 'success',
                });
                await Template.findByIdAndUpdate(template._id, {
                    $inc: { usageCount: 1, ...(alreadyUsed ? {} : { usedByCount: 1 }) }
                });

                usageLog = await TemplateUsageLog.create({
                    templateId: template._id,
                    userId: req.user._id,
                    brandId: brandId || null,
                    studioOrigin: template.studioOrigin,
                    userBrief: userPrompt || brief || '',
                    hadProductImage: !!productImageUrl,
                    hadAvatarImage: !!avatarImageUrl,
                    status: 'success',
                    resultJobId: jobId,
                });

                // 4. Fire generation pipeline
                if (template.studioOrigin === 'creative') {
                    await internalGenerateCreative({
                        body: {
                            brandId: brandId || null,
                            type: template.defaultSettings?.format || settings?.format || 'instagram-post',
                            prompt: promptData.finalPrompt,
                            refImageUrls: promptData.refImageUrls || [],
                            options: {
                                ...(promptData.settings || {}),
                                ...(settings || {}),
                                productImageUrl: productImageUrl || null,
                                avatarImageUrl: avatarImageUrl || null,
                                templateRefImageUrl: template.systemReferenceImage?.startsWith('http') ? template.systemReferenceImage : null,
                                templateInpainting: !!template.systemReferenceImage?.startsWith('http'),
                            },
                            jobId
                        },
                        user: reqUser,
                        creditsDeducted: cost,
                        jobId
                    });

                } else if (template.studioOrigin === 'video') {
                    await fetch(`http://localhost:${process.env.PORT || 3001}/api/video-studio/agent/create`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': reqAuthHeader || '',
                            'X-Internal-Secret': process.env.INTERNAL_JOB_SECRET || ''
                        },
                        body: JSON.stringify({ jobId, prompt: promptData.finalPrompt, visionInputs: promptData.visionInputs, settings: promptData.settings })
                    });

                } else {
                    await fetch(`http://localhost:${process.env.PORT || 3001}/api/content/generate`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': reqAuthHeader || '',
                            'X-Internal-Secret': process.env.INTERNAL_JOB_SECRET || ''
                        },
                        body: JSON.stringify({ jobId, prompt: promptData.finalPrompt, topic: promptData.finalPrompt })
                    });
                }

                // Update usage log duration
                if (usageLog) {
                    usageLog.generationDurationMs = Date.now() - startTime;
                    await usageLog.save().catch(() => {});
                }

            } catch (bgError) {
                console.error('[Template] Background pipeline error:', bgError.message);
                await GenerationJob.updateOne({ jobId }, { status: 'failed', errorMessage: bgError.message }).catch(() => {});
                if (usageLog) {
                    usageLog.status = 'failed';
                    usageLog.errorMessage = bgError.message;
                    await usageLog.save().catch(() => {});
                }
            }
        });

    } catch (error) {
        console.error('POST /api/templates/:id/use error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;

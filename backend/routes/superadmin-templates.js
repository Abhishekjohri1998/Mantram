import { Router } from 'express';
import multer from 'multer';
import { protect, superadmin } from '../middleware/auth.js';
import { uploadToS3, ensureS3Url } from '../utils/s3.js';
import TemplateCategory from '../models/TemplateCategory.js';
import Template from '../models/Template.js';
import VideoProject from '../models/VideoProject.js';
import GenerationJob from '../models/GenerationJob.js';
import { submitVideoGeneration } from '../agents/videoStudio/falClient.js';
import { submitAtlasCloudVideoGeneration, getAtlasCloudGenerationStatus as pollAtlasCloudStatus } from '../agents/videoStudio/atlasClient.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const router = Router();

// ==========================================
// TEMPLATE CATEGORIES
// ==========================================

router.get('/categories', protect, superadmin, async (req, res) => {
    try {
        const categories = await TemplateCategory.find().sort({ sortOrder: 1 });
        res.json({ success: true, categories });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/categories', protect, superadmin, async (req, res) => {
    try {
        const category = await TemplateCategory.create(req.body);
        res.status(201).json({ success: true, category });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

router.put('/categories/reorder', protect, superadmin, async (req, res) => {
    try {
        const { orderedIds } = req.body;
        if (!orderedIds || !Array.isArray(orderedIds)) {
            return res.status(400).json({ success: false, error: 'orderedIds array required' });
        }
        
        const bulkOps = orderedIds.map((id, index) => ({
            updateOne: {
                filter: { _id: id },
                update: { sortOrder: index * 10 }
            }
        }));
        
        if (bulkOps.length > 0) {
            await TemplateCategory.bulkWrite(bulkOps);
        }
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.put('/categories/:id', protect, superadmin, async (req, res) => {
    try {
        const category = await TemplateCategory.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!category) return res.status(404).json({ success: false, error: 'Not found' });
        res.json({ success: true, category });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

router.delete('/categories/:id', protect, superadmin, async (req, res) => {
    try {
        const templatesCount = await Template.countDocuments({ categoryId: req.params.id });
        if (templatesCount > 0) return res.status(400).json({ success: false, error: 'Cannot delete category containing templates' });
        
        const category = await TemplateCategory.findByIdAndDelete(req.params.id);
        if (!category) return res.status(404).json({ success: false, error: 'Not found' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});


// ==========================================
// TEMPLATES
// ==========================================

// GET all templates (admin view — includes ALL fields including savedPrompt + studioSection)
router.get('/', protect, superadmin, async (req, res) => {
    try {
        const { studioSection, isPublished, isActive, search } = req.query;
        const filter = {};
        if (studioSection) filter.studioSection = studioSection;
        if (isPublished !== undefined) filter.isPublished = isPublished === 'true';
        if (isActive !== undefined) filter.isActive = isActive === 'true';
        if (search) filter.$or = [
            { name: { $regex: search, $options: 'i' } },
            { tags: { $regex: search, $options: 'i' } },
        ];

        const templates = await Template.find(filter)
            .sort({ studioSection: 1, usageCount: -1, createdAt: -1 })
            .populate('categoryId', 'name color iconEmoji')
            .lean();

        // Step 6: Add isBrandAware label for admin view too
        const enriched = templates.map(t => ({
            ...t,
            isBrandAware: !!(t.promptTemplate && (t.promptTemplate.includes('{brand}') || t.promptTemplate.includes('{product}'))),
        }));

        res.json({ success: true, templates: enriched, count: enriched.length });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/', protect, superadmin, async (req, res) => {
    try {
        const template = await Template.create({ ...req.body, createdBy: req.user._id });
        res.status(201).json({ success: true, template });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

// ==========================================
// ANALYZE IMAGE — AI Design DNA extraction (no template creation)
// ==========================================
router.post('/analyze-image', protect, superadmin, async (req, res) => {
    const start = Date.now();
    try {
        const { imageUrl } = req.body;
        if (!imageUrl) return res.status(400).json({ success: false, error: 'imageUrl is required' });

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return res.status(500).json({ success: false, error: 'GEMINI_API_KEY not configured' });

        // Fetch image as base64 for Gemini Vision
        console.log(`[SuperAdmin AnalyzeImage] Fetching image for DNA analysis...`);
        let imagePart = null;
        try {
            const imageRes = await fetch(imageUrl, { signal: AbortSignal.timeout(15_000) });
            if (imageRes.ok) {
                const arrayBuffer = await imageRes.arrayBuffer();
                const base64 = Buffer.from(arrayBuffer).toString('base64');
                const mimeType = imageRes.headers.get('content-type') || 'image/jpeg';
                imagePart = { inlineData: { mimeType: mimeType.split(';')[0], data: base64 } };
            }
        } catch (fetchErr) {
            console.warn('[SuperAdmin AnalyzeImage] Failed to fetch image:', fetchErr.message);
        }
        if (!imagePart) return res.status(400).json({ success: false, error: 'Could not process the image' });

        // Gemini Vision — Design DNA Extraction
        const DNA_PROMPT = `You are a world-class creative director and prompt engineer. Study this marketing creative image with extreme precision.

Your task: Extract the complete Design DNA AND write a hyper-detailed image generation prompt that can perfectly replicate this EXACT visual style for any new product or content.

Analyze and return ONLY valid JSON (no markdown, no code fences, no comments):

{
  "layout": "one of: centered-hero | split-left-right | split-right-left | top-hero-bottom-text | grid | full-bleed | asymmetric | minimal-white | dark-cinematic",
  "colorPalette": ["#HEX1", "#HEX2", "#HEX3", "#HEX4"],
  "mood": "2-4 word description, e.g. bold festive luxury",
  "typography": {
    "headingStyle": "describe the headline font weight, size, case, color, effects (glow/shadow/outline), and exact position",
    "bodyStyle": "describe body/subtext style if visible, else write 'not present'"
  },
  "contentZones": [
    {
      "role": "headline | product | offer | cta | logo | subtext | model | background | decorative",
      "position": "top-left | top-center | top-right | center | bottom-left | bottom-center | bottom-right | full-bleed | left-half | right-half",
      "style": "detailed visual description of this zone including size proportion, spacing, effects"
    }
  ],
  "fitInstruction": "A precise instruction for how a new product image should be placed in this template — position, size proportion, lighting direction, shadow angle.",
  "promptFormula": "SEE RULES BELOW — this must be a 15-25 line detailed generation prompt"
}

CRITICAL RULES FOR promptFormula:
The promptFormula is the MOST IMPORTANT field. It will be used directly as an image generation prompt to recreate this design with different content. It must be 15-25 lines long and capture EVERY visual detail:

1. Start with: "Create a premium marketing creative image with the following EXACT design specifications:"
2. BACKGROUND: Describe the exact background — gradients (direction, colors), textures, patterns, lighting direction and intensity, any bokeh/blur/particle effects
3. LAYOUT: Describe the exact spatial layout — what occupies which portion of the frame (e.g. "product hero occupying 45% of the left half, vertically centered")
4. PRODUCT ZONE: Write "{{PRODUCT_DESCRIPTION}}" as a placeholder where the product goes, with exact instructions on scale, position, lighting, and shadow
5. TYPOGRAPHY: Describe every text element — font characteristics, size relative to frame, color with hex values, effects, exact position
6. HEADLINE: Use {{HEADLINE}} as placeholder text. Describe its exact style and position
7. OFFER/PRICE: If present, use {{OFFER}} as placeholder. Describe badge/callout style
8. CTA: If present, use {{CTA}} as placeholder. Describe button/banner style
9. BRAND: Use {{BRAND}} where the brand name/logo appears. Describe position and style
10. DECORATIVE ELEMENTS: Describe ALL decorative elements — borders, dividers, icons, shapes, overlays, glow effects
11. COLOR SCHEME: Reference exact hex colors from colorPalette for each element
12. PHOTOGRAPHY DIRECTION: Describe camera angle, depth of field, lighting setup
13. MOOD & ATMOSPHERE: Describe the emotional feel
14. End with: "The overall composition should feel [mood] with magazine-quality production value."

- Do NOT use vague terms like "professional" or "modern" without specifics
- Every element must have an explicit color, position, and size description
- The prompt must be self-contained
- colorPalette must be real hex codes extracted from the image
- Only describe what is ACTUALLY visible in the image`;

        const ANALYSIS_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash-001', 'gemini-2.0-flash-lite'];
        let rawText = '';

        for (const modelId of ANALYSIS_MODELS) {
            try {
                console.log(`[SuperAdmin AnalyzeImage] DNA extraction via ${modelId}...`);
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;
                const resp = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ role: 'user', parts: [imagePart, { text: DNA_PROMPT }] }],
                        generationConfig: { temperature: 0.15, maxOutputTokens: 8192 },
                    }),
                    signal: AbortSignal.timeout(60_000),
                });
                const data = await resp.json();
                if (data.error) {
                    const msg = data.error.message || '';
                    const overloaded = msg.toLowerCase().includes('high demand') || msg.toLowerCase().includes('overload') || resp.status === 503;
                    if (overloaded) { console.warn(`[SuperAdmin AnalyzeImage] ${modelId} overloaded, trying next`); continue; }
                    throw new Error(msg);
                }
                const parts = data.candidates?.[0]?.content?.parts || [];
                for (const p of parts) { if (p.text && !p.thought) rawText += p.text; }
                if (rawText) { console.log(`[SuperAdmin AnalyzeImage] DNA extracted via ${modelId} (${rawText.length} chars)`); break; }
            } catch (e) {
                if (e.name !== 'TimeoutError') console.warn(`[SuperAdmin AnalyzeImage] ${modelId} failed: ${e.message?.substring(0, 80)}`);
            }
        }

        // Parse DNA JSON
        let dna = null;
        try {
            const firstBrace = rawText.indexOf('{');
            const lastBrace = rawText.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace > firstBrace) {
                const jsonCandidate = rawText.substring(firstBrace, lastBrace + 1);
                dna = JSON.parse(jsonCandidate);
            }
        } catch (e1) {
            console.warn('[SuperAdmin AnalyzeImage] Primary JSON parse failed:', e1.message);
            try {
                const firstBrace = rawText.indexOf('{');
                const lastBrace = rawText.lastIndexOf('}');
                if (firstBrace !== -1 && lastBrace > firstBrace) {
                    let cleaned = rawText.substring(firstBrace, lastBrace + 1);
                    cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');
                    cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
                    dna = JSON.parse(cleaned);
                    console.log('[SuperAdmin AnalyzeImage] JSON parsed after cleaning');
                }
            } catch (e2) {
                console.warn('[SuperAdmin AnalyzeImage] Secondary JSON parse also failed:', e2.message);
            }
        }

        // Fallback DNA
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
                promptFormula: `Create a professional marketing image featuring {{PRODUCT_DESCRIPTION}}. Include: {{HEADLINE}} as main text. Clean, modern composition.`,
            };
        }

        const promptFormula = dna.promptFormula || `Create a professional marketing image featuring {{PRODUCT_DESCRIPTION}}. Include: {{HEADLINE}} as main text.`;

        console.log(`[SuperAdmin AnalyzeImage] Analysis complete in ${Date.now() - start}ms`);

        res.json({
            success: true,
            dna,
            promptFormula,
        });
    } catch (error) {
        console.error('[SuperAdmin AnalyzeImage] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/upload', protect, superadmin, upload.single('file'), async (req, res) => {
    try {
        const {
            name, categoryId, description, tags, savedPrompt, studioOrigin,
            isFeatured, isActive, isPublished, showOnHomeScreen,
            studioSection, promptTemplate, generationModel,
            savedProductUrl, savedProductImageUrls, savedAvatarUrl, savedVideoSettings,
            dna: rawDna,
        } = req.body;

        if (!req.file) {
            return res.status(400).json({ success: false, error: 'Media file is required' });
        }

        const s3Key = `templates/previews/${Date.now()}-${req.file.originalname}`;
        const previewUrl = await uploadToS3(req.file.buffer, s3Key, req.file.mimetype);
        const previewType = req.file.mimetype.startsWith('video/') ? 'video' : 'image';

        let parsedTags = [];
        if (tags) {
            try {
                parsedTags = JSON.parse(tags);
            } catch (e) {
                parsedTags = typeof tags === 'string' ? tags.split(',').map(t => t.trim()) : [];
            }
        }

        // Parse video-specific metadata
        let parsedProductImageUrls = [];
        if (savedProductImageUrls) {
            try { parsedProductImageUrls = JSON.parse(savedProductImageUrls); }
            catch { parsedProductImageUrls = typeof savedProductImageUrls === 'string' ? savedProductImageUrls.split(',').map(u => u.trim()).filter(Boolean) : []; }
        }
        let parsedVideoSettings = {};
        if (savedVideoSettings) {
            try { parsedVideoSettings = typeof savedVideoSettings === 'string' ? JSON.parse(savedVideoSettings) : savedVideoSettings; }
            catch { parsedVideoSettings = {}; }
        }

        // Build templateAssets from product/avatar data
        const templateAssets = [];
        if (savedAvatarUrl) {
            templateAssets.push({ role: 'avatar', label: 'Avatar / Model', url: savedAvatarUrl, swappable: true });
        }
        for (const pUrl of parsedProductImageUrls) {
            templateAssets.push({ role: 'product', label: 'Product Image', url: pUrl, swappable: true });
        }

        // Parse DNA from AI analysis (if present)
        let parsedDna = null;
        if (rawDna) {
            try { parsedDna = typeof rawDna === 'string' ? JSON.parse(rawDna) : rawDna; }
            catch { parsedDna = null; }
        }

        const template = await Template.create({
            name,
            categoryId,
            description,
            tags: parsedTags,
            savedPrompt,
            studioOrigin,
            studioSection: studioSection || 'general',
            promptTemplate: promptTemplate || savedPrompt || '',
            generationModel: generationModel || 'gpt-image-2',
            previewUrl,
            previewImageUrl: previewUrl,
            previewType,
            previewVideoUrl: previewType === 'video' ? previewUrl : '',
            isFeatured: isFeatured === 'true' || isFeatured === true,
            showOnHomeScreen: showOnHomeScreen === 'true' || showOnHomeScreen === true,
            isActive: isActive === 'true' || isActive === true,
            isPublished: isPublished === 'true' || isPublished === true,
            savedProductUrl: savedProductUrl || '',
            savedProductImageUrls: parsedProductImageUrls,
            savedAvatarUrl: savedAvatarUrl || '',
            savedVideoSettings: parsedVideoSettings,
            templateAssets,
            createdBy: req.user._id,
            ...(parsedDna ? { dna: parsedDna, systemReferenceImage: previewUrl } : {}),
        });

        res.status(201).json({ success: true, template });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

// ==========================================
// GENERATE TEMPLATE VIA AI
// ==========================================

// POST /generate — Generate a video/image via AI and create a draft template
router.post('/generate', protect, superadmin, async (req, res) => {
    try {
        const {
            name, categoryId, description, tags, studioOrigin, studioSection,
            prompt, model, productImageUrls, avatarUrl,
            duration, format, quality,
        } = req.body;

        if (!prompt || !prompt.trim()) return res.status(400).json({ success: false, error: 'Prompt is required' });
        if (!name || !name.trim()) return res.status(400).json({ success: false, error: 'Template name is required' });
        if (!categoryId) return res.status(400).json({ success: false, error: 'Category is required' });

        const parsedProductImgs = Array.isArray(productImageUrls) ? productImageUrls.filter(u => u && u.startsWith('http')) : [];
        const parsedTags = Array.isArray(tags) ? tags : [];
        const selectedModel = model || 'seedance-2.0';
        const isVideoModel = ['seedance-2.0', 'kling-v2', 'wan-2.1', 'luma-ray-2', 'minimax-video', 'happyhorse-1.0', 'gemini-flash'].some(m => selectedModel.includes(m));

        // Build templateAssets from inputs
        const templateAssets = [];
        if (avatarUrl) templateAssets.push({ role: 'avatar', label: 'Avatar / Model', url: avatarUrl, swappable: true });
        for (const pUrl of parsedProductImgs) {
            templateAssets.push({ role: 'product', label: 'Product Image', url: pUrl, swappable: true });
        }

        if (isVideoModel) {
            // ── VIDEO GENERATION ──
            const imageUrls = [...parsedProductImgs];
            const avatarFaceRefs = avatarUrl ? [avatarUrl] : [];
            let finalPrompt = prompt.replace(/<<<image_1>>>/g, '@Image1').replace(/<<<image_2>>>/g, '@Image2');

            // Filter out empty strings just to be safe
            const allRefs = [...avatarFaceRefs, ...imageUrls].filter(Boolean);
            
            console.log(`🎬 [Superadmin Video] Submitting generation. Refs: ${allRefs.length} (Avatar: ${avatarUrl ? 'Yes' : 'No'}, Products: ${imageUrls.length})`);

            // Clean the prompt to remove @Image tags so the video generator doesn't get confused
            let cleanPrompt = finalPrompt.replace(/@Image\d+/g, '').replace(/\s{2,}/g, ' ').trim();

            const genResult = await submitVideoGeneration({
                prompt: cleanPrompt,
                model: selectedModel,
                duration: Math.min(parseInt(duration || 8), 15),
                aspectRatio: format || '9:16',
                qualityMode: quality || 'high',
                generateAudio: true,
                imageUrl: imageUrls[0] || null, // First product image is the source frame
                referenceImages: [...avatarFaceRefs, ...imageUrls.slice(1)].filter(Boolean),
            });

            // Create draft template with generation taskId — poll for completion
            const template = await Template.create({
                name: name.trim(),
                categoryId,
                description: description || '',
                tags: parsedTags,
                studioOrigin: studioOrigin || 'video',
                studioSection: studioSection || 'video_qads',
                generationModel: selectedModel,
                savedPrompt: prompt,
                promptTemplate: prompt,
                previewUrl: 'pending', // Will be updated when generation completes
                previewType: 'video',
                previewVideoUrl: '',
                templateAssets,
                savedProductImageUrls: parsedProductImgs,
                savedAvatarUrl: avatarUrl || '',
                savedVideoSettings: { duration: parseInt(duration || 8), format: format || '9:16', model: selectedModel },
                isActive: false,
                isPublished: false,
                createdBy: req.user._id,
                sourceJobId: genResult.requestId || genResult.taskId,
                sourceJobType: 'VideoProject',
            });

            res.json({
                success: true,
                template,
                taskId: genResult.requestId || genResult.taskId,
                status: 'generating',
                type: 'video',
            });
        } else {
            // ── IMAGE GENERATION ──
            const allRefs = [];
            if (avatarUrl) allRefs.push(avatarUrl);
            allRefs.push(...parsedProductImgs);
            
            const validRefs = allRefs.filter(Boolean);
            console.log(`🎨 [Superadmin Image] Submitting generation. Refs: ${validRefs.length} (Avatar: ${avatarUrl ? 'Yes' : 'No'}, Products: ${parsedProductImgs.length})`);
            
            // Build an enriched prompt that tells Gemini what each reference image is.
            // Strip @Image tags from the text (the actual images are sent inline as parts).
            let finalPrompt = prompt
                .replace(/<<<image_1>>>/g, '@Image1')
                .replace(/<<<image_2>>>/g, '@Image2');
            
            // Build context prefix so the model knows what the inline images represent
            const contextParts = [];
            
            if (validRefs.length > 0) {
                contextParts.push('STRICT DESIGN INSTRUCTIONS - MULTIMODAL REFERENCES:');
                if (avatarUrl) {
                    contextParts.push(`- IMAGE 1 (Reference): This is the exact Avatar/Model face. You MUST preserve this person's facial identity, likeness, and features exactly.`);
                }
                if (parsedProductImgs.length > 0) {
                    const prodIndex = avatarUrl ? 'IMAGE 2' : 'IMAGE 1';
                    contextParts.push(`- ${prodIndex} (Reference): This is the exact Product. You MUST preserve its specific design, shape, branding, and color exactly.`);
                }
                contextParts.push('\nUse the reference images above to generate the following scene:');
            }
            
            // Remove @Image1/@Image2 text tags from prompt (the images are sent as inline parts)
            let cleanPrompt = finalPrompt
                .replace(/@Image\d+/g, '')
                .replace(/\s{2,}/g, ' ')
                .trim();
            
            const enrichedPrompt = contextParts.length > 0
                ? `${contextParts.join('\n')}\n\nScene description: ${cleanPrompt}`
                : cleanPrompt;

            console.log(`🎨 Enriched prompt:\n${enrichedPrompt.substring(0, 500)}...`);

            let result;
            if (selectedModel === 'gpt-image-2') {
                console.log(`🎨 Using GPT Image 2 (OpenAI via LaoZhang)...`);
                const { openaiImageGenerate } = await import('./creatives.js');
                const generationData = await openaiImageGenerate(
                    enrichedPrompt,
                    format || '1:1',
                    'standard',
                    'gpt-image-2',
                    'webp',
                    'opaque',
                    validRefs
                );
                result = { imageUrl: generationData.imageUrl };
            } else {
                console.log(`🎨 Using Gemini Native...`);
                const { geminiImageGenerate } = await import('../agents/videoStudio/firstFrame.js');
                result = await geminiImageGenerate(enrichedPrompt, [], 0.5, {
                    aspectRatio: format || '1:1',
                    referenceImageUrls: validRefs,
                });
            }

            if (!result || !result.imageUrl) {
                return res.status(500).json({ success: false, error: 'Image generation failed — no image returned' });
            }

            // Ensure the generated image is on S3
            const s3Url = await ensureS3Url(result.imageUrl, `templates/gen-${Date.now()}.webp`);

            const template = await Template.create({
                name: name.trim(),
                categoryId,
                description: description || '',
                tags: parsedTags,
                studioOrigin: studioOrigin || 'creative',
                studioSection: studioSection || 'ai_create',
                generationModel: selectedModel,
                savedPrompt: prompt,
                promptTemplate: prompt,
                previewUrl: s3Url,
                previewImageUrl: s3Url,
                previewType: 'image',
                templateAssets,
                savedProductImageUrls: parsedProductImgs,
                savedAvatarUrl: avatarUrl || '',
                savedVideoSettings: { format: format || '1:1', model: selectedModel },
                isActive: false,
                isPublished: false,
                createdBy: req.user._id,
            });

            res.json({
                success: true,
                template,
                status: 'done',
                type: 'image',
                previewUrl: s3Url,
            });
        }
    } catch (err) {
        console.error('[SuperAdmin Template Generate] Error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /generate/status/:taskId — Poll video generation status for template creation
router.get('/generate/status/:taskId', protect, superadmin, async (req, res) => {
    try {
        const { taskId } = req.params;

        // Prevent race condition & duplicate S3 uploads
        const existing = await Template.findOne({ sourceJobId: taskId });
        if (existing && existing.previewUrl !== 'pending') {
            return res.json({
                success: true,
                status: existing.previewUrl === 'failed' ? 'FAILED' : 'COMPLETED',
                progress: 100,
                videoUrl: existing.previewVideoUrl || existing.previewUrl,
            });
        }

        const result = await pollAtlasCloudStatus(taskId);

        if (!result) return res.json({ success: true, status: 'IN_PROGRESS', progress: 10 });

        // If generation completed, update the template with the video URL
        if (result.status === 'COMPLETED' && result.videoUrl) {
            const s3VideoUrl = await ensureS3Url(result.videoUrl, `templates/gen-video-${Date.now()}.mp4`);
            await Template.findOneAndUpdate(
                { sourceJobId: taskId },
                {
                    previewUrl: s3VideoUrl,
                    previewVideoUrl: s3VideoUrl,
                }
            );
        } else if (result.status === 'FAILED') {
            await Template.findOneAndUpdate(
                { sourceJobId: taskId },
                { previewUrl: 'failed' }
            );
        }

        res.json({
            success: true,
            status: result.status,
            progress: result.progress || 0,
            videoUrl: result.videoUrl || null,
            error: result.error || null,
        });
    } catch (err) {
        console.error('[SuperAdmin Template Status] Error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.put('/reorder', protect, superadmin, async (req, res) => {
    try {
        const { orderedIds } = req.body;
        if (!orderedIds || !Array.isArray(orderedIds)) {
            return res.status(400).json({ success: false, error: 'orderedIds array required' });
        }
        
        const bulkOps = orderedIds.map((id, index) => ({
            updateOne: {
                filter: { _id: id },
                update: { sortOrder: index * 10 }
            }
        }));
        
        if (bulkOps.length > 0) {
            await Template.bulkWrite(bulkOps);
        }
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.put('/:id', protect, superadmin, async (req, res) => {
    try {
        // savedPrompt is immutable — block any attempt to change it here
        if (req.body.savedPrompt !== undefined) {
            return res.status(400).json({ success: false, error: 'savedPrompt is immutable after creation. Create a new template to change the prompt.' });
        }

        // Step 6: allow studioSection, isPublished, promptTemplate, generationModel updates
        const ALLOWED_UPDATES = [
            'name', 'description', 'tags', 'categoryId', 'studioOrigin', 'studioSection',
            'isActive', 'isPublished', 'isFeatured', 'showOnHomeScreen',
            'previewUrl', 'previewImageUrl', 'previewType', 'previewVideoUrl',
            'promptTemplate', 'generationModel', 'generationParams',
            'sortOrder',
            'savedProductUrl', 'savedProductImageUrls', 'savedAvatarUrl', 'savedVideoSettings',
            'templateAssets',
        ];
        const updateData = {};
        for (const key of ALLOWED_UPDATES) {
            if (req.body[key] !== undefined) updateData[key] = req.body[key];
        }

        // Step 8: keep previewUrl and previewImageUrl in sync
        if (updateData.previewUrl && !updateData.previewImageUrl) {
            updateData.previewImageUrl = updateData.previewUrl;
        } else if (updateData.previewImageUrl && !updateData.previewUrl) {
            updateData.previewUrl = updateData.previewImageUrl;
        }

        const template = await Template.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
        if (!template) return res.status(404).json({ success: false, error: 'Not found' });
        res.json({ success: true, template });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

router.delete('/:id', protect, superadmin, async (req, res) => {
    try {
        const template = await Template.findById(req.params.id);
        if (!template) return res.status(404).json({ success: false, error: 'Not found' });

        if (req.query.permanent === 'true') {
            if (template.usageCount > 0) {
                return res.status(400).json({ success: false, error: `Cannot permanently delete a template that has been used ${template.usageCount} times. Deactivate it instead.` });
            }
            await Template.findByIdAndDelete(req.params.id);
        } else {
            await Template.findByIdAndUpdate(req.params.id, { isActive: false });
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================
// PROMOTE FROM JOB
// ==========================================

router.post('/promote-from-job', protect, superadmin, async (req, res) => {
    try {
        let { sourceJobId, sourceType, name, categoryId, description, tags, studioOrigin } = req.body;
        if (!sourceJobId || !sourceType) {
            return res.status(400).json({ success: false, error: 'sourceJobId and sourceType (VideoProject or GenerationJob) are required' });
        }

        let extractedPrompt = '';
        let previewUrl = '';
        let previewType = 'image';

        if (sourceType === 'VideoProject') {
            const project = await VideoProject.findById(sourceJobId);
            if (!project) return res.status(404).json({ success: false, error: 'VideoProject not found' });
            extractedPrompt = project.backendPrompt || project.advancedConfig?.prompt || project.advancedConfig?.enhancedPrompt || '';
            // Resolve video URL: finalVideoUrl > s3VideoUrl > generation.videoUrl > thumbnailUrl
            const rawVideoUrl = project.finalVideoUrl
                || project.generation?.s3VideoUrl
                || project.generation?.videoUrl
                || project.generation?.thumbnailUrl
                || '';
            previewUrl = rawVideoUrl ? await ensureS3Url(rawVideoUrl, `templates/preview-${Date.now()}.mp4`) : '';
            previewType = 'video';
            sourceJobId = project._id; // Ensure it's an ObjectId
        } else if (sourceType === 'GenerationJob') {
            // Using findById to support _id, since jobId is sometimes used interchangeably in frontend
            let job = await GenerationJob.findOne({ jobId: sourceJobId });
            if (!job) job = await GenerationJob.findById(sourceJobId);
            if (!job) return res.status(404).json({ success: false, error: 'GenerationJob not found' });
            extractedPrompt = job.prompt;
            // BUG-02 FIX: mirror job.imageUrl to S3 before storing (may be provider URL that expires)
            const rawJobUrl = job.imageUrl || '';
            previewUrl = rawJobUrl ? await ensureS3Url(rawJobUrl, `templates/preview-${Date.now()}.webp`) : '';
            previewType = 'image';
            sourceJobId = job._id; // Ensure it's an ObjectId
        } else {
            return res.status(400).json({ success: false, error: 'Invalid sourceType' });
        }

        if (!extractedPrompt || !extractedPrompt.trim()) {
            return res.status(400).json({ success: false, error: 'Source job does not contain a valid prompt to promote' });
        }

        const template = await Template.create({
            name,
            categoryId,
            description,
            tags,
            studioOrigin,
            studioSection: previewType === 'video' ? 'video_qads' : 'ai_create',
            previewUrl,
            previewImageUrl: previewUrl, // canonical S3 field — always mirrors previewUrl
            previewVideoUrl: previewType === 'video' ? previewUrl : '',
            previewType,
            savedPrompt: extractedPrompt,
            sourceJobId,
            sourceJobType: sourceType,
            createdBy: req.user._id,
            isActive: false, // requires admin to activate after review
        });

        res.json({ success: true, template });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /promote-from-generated
// Save an AI-generated image (already on S3) directly as a Template.
// No file upload needed — previewUrl is the S3 URL from avatar-studio or admin/generate.
// ══════════════════════════════════════════════════════════════════════════════
router.post('/promote-from-generated', protect, superadmin, async (req, res) => {
    try {
        const {
            name, categoryId, description, tags, studioOrigin,
            previewUrl, savedPrompt,
            studioSection, promptTemplate, generationModel, generationParams,
        } = req.body;

        if (!previewUrl) return res.status(400).json({ success: false, error: 'previewUrl is required (S3 URL of generated image)' });
        if (!savedPrompt) return res.status(400).json({ success: false, error: 'savedPrompt is required' });
        if (!name || !name.trim()) return res.status(400).json({ success: false, error: 'Template name is required' });

        // Step 8: guarantee both previewUrl and previewImageUrl are populated
        const canonicalUrl = previewUrl;

        const template = await Template.create({
            name: name.trim(),
            categoryId: categoryId || null,
            description: description || '',
            tags: Array.isArray(tags) ? tags : [],
            studioOrigin: studioOrigin || 'creative',
            studioSection: studioSection || 'general',
            promptTemplate: promptTemplate || '',
            generationModel: generationModel || 'gpt-image-2',
            generationParams: generationParams || {},
            previewUrl: canonicalUrl,
            previewImageUrl: canonicalUrl, // Step 8: both fields populated
            previewType: 'image',
            savedPrompt,
            isActive: false,  // Admin must activate
            isPublished: false,
            isFeatured: false,
            createdBy: req.user._id,
        });

        res.json({ success: true, template });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

export default router;


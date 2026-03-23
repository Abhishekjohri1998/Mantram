import { Router } from 'express';
import Content from '../models/Content.js';
import Feedback from '../models/Feedback.js';
import Brand from '../models/Brand.js';
import { protect, optionalAuth } from '../middleware/auth.js';
import { requireStudio } from '../middleware/studioAccess.js';
import { getOrchestrator } from '../agents/orchestrator.js';
import { requireCredits, refundCredits } from '../middleware/credits.js';
import { safeErrorMessage } from '../utils/safeError.js';
import { mineAutocomplete } from '../utils/autocomplete.js';

const router = Router();

// ── In-memory cache for trending data (30 min TTL per brand) ──
const trendingCache = new Map();
const TRENDING_TTL = 30 * 60 * 1000; // 30 minutes

// GET /api/content/providers — list available AI models for frontend dropdown
router.get('/providers', optionalAuth, async (req, res) => {
    try {
        const orchestrator = getOrchestrator();
        const providers = orchestrator.getAvailableProviders();
        res.json({ success: true, providers });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// POST /api/content/trending — Fetch trending topics & keywords for content ideation
router.post('/trending', protect, async (req, res) => {
    try {
        const { brandId } = req.body;
        let brand = brandId ? await Brand.findById(brandId) : null;
        if (!brand) brand = await Brand.findOne({ user: req.user._id }).sort('-createdAt');
        if (!brand) return res.status(400).json({ success: false, error: 'No brand found' });

        // Check cache
        const cacheKey = `trending_${brand._id}`;
        const cached = trendingCache.get(cacheKey);
        if (cached && (Date.now() - cached.ts) < TRENDING_TTL) {
            return res.json({ success: true, ...cached.data, cached: true });
        }

        const dna = brand.dna || {};
        const industry = dna.industry || dna.brandDescription?.split(' ').slice(0, 3).join(' ') || '';
        const country = dna.country || 'India';

        // Parallel: Grok scout for trends + Google Autocomplete for keywords
        const grokKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
        const [scoutResult, autocompleteResult] = await Promise.allSettled([
            // Grok Scout — real-time trending topics
            grokKey ? (async () => {
                const resp = await fetch('https://api.x.ai/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${grokKey}` },
                    body: JSON.stringify({
                        model: 'grok-3-mini-fast',
                        messages: [{
                            role: 'user',
                            content: `You are a CONTENT IDEATION SCOUT for a ${industry} brand called "${brand.name}" in ${country}.

Find what's TRENDING RIGHT NOW that this brand should create content about. Include:
1. Trending topics people are talking about related to ${industry} (from social media, news, search)
2. Emerging content angles that are gaining traction
3. Seasonal/timely topics for ${new Date().toLocaleString('en', { month: 'long', year: 'numeric' })}
4. High-intent keywords people are searching for

Respond in JSON:
{
  "trending": [
    { "topic": "short title", "description": "why this is trending + content angle", "type": "trending|emerging|seasonal", "urgency": "high|medium|low" }
  ],
  "keywords": [
    { "keyword": "search term", "intent": "informational|commercial|transactional", "volume": "high|medium|low" }
  ]
}

Provide 6-8 trending topics and 10-12 keywords. Be SPECIFIC to ${industry} + ${country}. Focus on what's happening THIS WEEK.`
                        }],
                        temperature: 0.5,
                        max_tokens: 3000,
                        response_format: { type: 'json_object' },
                    }),
                    signal: AbortSignal.timeout(15000),
                });
                const data = await resp.json();
                let text = data.choices?.[0]?.message?.content || '{}';
                text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
                try {
                    const jsonMatch = text.match(/\{[\s\S]*\}/);
                    return JSON.parse(jsonMatch ? jsonMatch[0] : text);
                } catch { return {}; }
            })() : Promise.resolve({}),
            // Google Autocomplete — real keyword suggestions
            mineAutocomplete(brand.name, industry, dna.targetAudience || '', country).catch(() => ({})),
        ]);

        const scoutData = scoutResult.status === 'fulfilled' ? scoutResult.value : {};
        const autoData = autocompleteResult.status === 'fulfilled' ? autocompleteResult.value : {};

        // Merge autocomplete keywords with scout keywords
        const allKeywords = [...(scoutData.keywords || [])];
        if (autoData.allSuggestions) {
            autoData.allSuggestions.slice(0, 8).forEach(kw => {
                if (!allKeywords.find(k => k.keyword?.toLowerCase() === kw.toLowerCase())) {
                    allKeywords.push({ keyword: kw, intent: 'informational', volume: 'medium' });
                }
            });
        }

        const result = {
            trending: (scoutData.trending || []).slice(0, 8),
            keywords: allKeywords.slice(0, 15),
            brandName: brand.name,
            industry,
        };

        // Cache result
        trendingCache.set(cacheKey, { ts: Date.now(), data: result });

        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Trending fetch error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// POST /api/content/blog-image — Lightweight AI image generation for blog editor
router.post('/blog-image', protect, async (req, res) => {
    try {
        const { brandId, prompt, context } = req.body;
        if (!prompt) return res.status(400).json({ success: false, error: 'Prompt is required' });

        const brand = brandId ? await Brand.findById(brandId) : null;

        // Use Gemini for image generation (same as creative studio but without studio/credit middleware)
        const imageKey = process.env.GEMINI_IMAGE_API_KEY || process.env.GEMINI_API_KEY;
        if (!imageKey) return res.status(500).json({ success: false, error: 'Image generation not configured' });

        const baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
        const models = ['gemini-3.1-flash-image-preview', 'gemini-2.5-flash-image'];

        const brandContext = brand?.name ? ` for ${brand.name}${brand.dna?.industry ? ` (${brand.dna.industry})` : ''}` : '';
        const fullPrompt = `${prompt}${brandContext}. The image should be suitable as a blog article illustration. High quality, editorial style, 16:9 aspect ratio. No text, watermarks, or overlays.`;

        let imageUrl = null;
        for (const modelId of models) {
            try {
                console.log(`📸 Blog image: trying ${modelId}...`);
                const url = `${baseUrl}/models/${modelId}:generateContent?key=${imageKey}`;
                const resp = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
                        generationConfig: {
                            responseModalities: ['TEXT', 'IMAGE'],
                            temperature: 0.4,
                        },
                    }),
                });

                const data = await resp.json();
                if (data.error) {
                    console.warn(`⚠️ Blog image ${modelId}: ${data.error.message}`);
                    continue;
                }

                const resParts = data.candidates?.[0]?.content?.parts || [];
                for (const part of resParts) {
                    if (part.inlineData?.mimeType?.startsWith('image/')) {
                        imageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                        break;
                    }
                }
                if (imageUrl) {
                    console.log(`✅ Blog image generated with ${modelId}`);
                    break;
                }
            } catch (e) {
                console.error(`❌ Blog image ${modelId} error:`, e.message);
            }
        }

        if (!imageUrl) return res.status(500).json({ success: false, error: 'Image generation failed' });

        // Upload to S3 for persistent URL
        try {
            const { uploadToS3 } = await import('../utils/s3.js');
            const s3Url = await uploadToS3(imageUrl, `blog-images/${brandId || 'general'}/${Date.now()}.png`);
            imageUrl = s3Url;
        } catch (s3Err) {
            console.warn('Blog image S3 upload failed, returning base64:', s3Err.message);
            // Keep base64 data URI as fallback
        }

        res.json({ success: true, imageUrl });
    } catch (error) {
        console.error('Blog image error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// POST /api/content/generate — AI content generation (credits deducted)
router.post('/generate', protect, requireStudio('contentStudio'), requireCredits('content'), async (req, res) => {
    try {
        const { brandId, type, prompt, platform, options, subType, toneSettings, trendingKeywords } = req.body;
        if (!prompt) {
            return res.status(400).json({ success: false, error: 'prompt is required' });
        }

        // Find brand (by ID or use last known brand)
        let brand = null;
        if (brandId && brandId !== 'preview') {
            brand = await Brand.findById(brandId);
        }
        if (!brand && req.user) {
            brand = await Brand.findOne({ user: req.user._id }).sort('-createdAt');
        }
        // If still no brand, create a minimal placeholder for generation
        if (!brand) {
            brand = { name: 'My Brand', dna: {}, _id: null };
        }

        // Inject trending keywords into the prompt if provided
        let enrichedPrompt = prompt;
        if (trendingKeywords && Array.isArray(trendingKeywords) && trendingKeywords.length > 0) {
            enrichedPrompt += `\n\nTRENDING KEYWORDS TO WEAVE IN NATURALLY: ${trendingKeywords.join(', ')}\n(Include these keywords naturally in the content where relevant — do NOT force them or list them separately.)`;
        }

        // Use the agent orchestrator for generation (with smart language routing)
        const orchestrator = getOrchestrator();
        const result = await orchestrator.generateContent({
            brand,
            user: req.user || { preferences: {} },
            type: type || 'social',
            prompt: enrichedPrompt,
            platform: platform || '',
            options: options || {},
            toneSettings: toneSettings || {},
        });

        // Save content only if user is authenticated
        let content = {
            _id: null,
            type: type || 'social',
            content: result.content,
            aiMeta: result.aiMeta || {},
        };

        if (req.user && brand._id) {
            content = await Content.create({
                user: req.user._id,
                brand: brand._id,
                type: type || 'social',
                title: result.title || '',
                content: result.content,
                prompt,
                platform: platform || '',
                originalContent: result.content,
                aiMeta: result.aiMeta || {},
            });
            await req.user.updateOne({ $inc: { 'usage.contentGenerated': 1 } });
        }

        res.json({ success: true, content, brandAlignmentScore: result.aiMeta?.brandAlignmentScore });
    } catch (error) {
        console.error('Content generation error:', error);
        if (req.creditsDeducted > 0) {
            await refundCredits(req.user._id, req.creditsDeducted, 'contentGenerate', `Refund: Content Generation Sync Failure (${safeErrorMessage(error)})`, 'content');
        }
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// GET /api/content — list user's content
router.get('/', protect, async (req, res) => {
    try {
        const { brandId, type, status, limit = 20, page = 1 } = req.query;
        const filter = { user: req.user._id };
        if (brandId) filter.brand = brandId;
        if (type) filter.type = type;
        if (status) filter.status = status;

        const content = await Content.find(filter)
            .sort('-createdAt')
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit))
            .populate('brand', 'name');

        const total = await Content.countDocuments(filter);
        res.json({ success: true, content, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// GET /api/content/:id
router.get('/:id', protect, async (req, res) => {
    try {
        const content = await Content.findOne({ _id: req.params.id, user: req.user._id }).populate('brand', 'name dna.voice');
        if (!content) return res.status(404).json({ success: false, error: 'Content not found' });
        res.json({ success: true, content });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// PUT /api/content/:id — update (user edits content)
router.put('/:id', protect, async (req, res) => {
    try {
        const existing = await Content.findOne({ _id: req.params.id, user: req.user._id });
        if (!existing) return res.status(404).json({ success: false, error: 'Content not found' });

        const updates = { ...req.body };

        // Track edits for RLHF
        if (req.body.content && req.body.content !== existing.content) {
            updates.userEdited = true;
            updates.editDiff = req.body.content; // simplified diff

            // Record feedback
            await Feedback.create({
                user: req.user._id,
                brand: existing.brand,
                contentType: existing.type,
                contentId: existing._id,
                prompt: existing.prompt,
                aiOutput: existing.originalContent,
                signalType: 'edit',
                editBefore: existing.content,
                editAfter: req.body.content,
                context: {
                    provider: existing.aiMeta?.provider,
                    model: existing.aiMeta?.model,
                },
            });
        }

        const content = await Content.findByIdAndUpdate(req.params.id, updates, { returnDocument: 'after' });
        res.json({ success: true, content });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// POST /api/content/:id/feedback — explicit feedback
router.post('/:id/feedback', protect, async (req, res) => {
    try {
        const { signalType, rating, thumbs } = req.body;
        const content = await Content.findOne({ _id: req.params.id, user: req.user._id });
        if (!content) return res.status(404).json({ success: false, error: 'Content not found' });

        // Update content rating
        if (rating) await content.updateOne({ rating });

        // Record RLHF feedback
        const feedback = await Feedback.create({
            user: req.user._id,
            brand: content.brand,
            contentType: content.type,
            contentId: content._id,
            prompt: content.prompt,
            aiOutput: content.originalContent || content.content,
            signalType: signalType || 'rating',
            rating,
            thumbs,
            context: {
                provider: content.aiMeta?.provider,
                model: content.aiMeta?.model,
            },
        });

        res.json({ success: true, feedback });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// POST /api/content/:id/regenerate
router.post('/:id/regenerate', protect, requireCredits('contentRefine'), async (req, res) => {
    try {
        const existing = await Content.findOne({ _id: req.params.id, user: req.user._id });
        if (!existing) return res.status(404).json({ success: false, error: 'Content not found' });

        // Record negative feedback (regenerate signal)
        await Feedback.create({
            user: req.user._id,
            brand: existing.brand,
            contentType: existing.type,
            contentId: existing._id,
            prompt: existing.prompt,
            aiOutput: existing.originalContent || existing.content,
            signalType: 'regenerate',
            context: { provider: existing.aiMeta?.provider, model: existing.aiMeta?.model },
        });

        const brand = await Brand.findById(existing.brand);
        const orchestrator = getOrchestrator();
        const result = await orchestrator.generateContent({
            brand,
            user: req.user,
            type: existing.type,
            prompt: req.body.prompt || existing.prompt,
            platform: existing.platform,
            options: { previousOutput: existing.content, isRegeneration: true },
        });

        const content = await Content.create({
            user: req.user._id,
            brand: existing.brand,
            type: existing.type,
            title: result.title || '',
            content: result.content,
            prompt: req.body.prompt || existing.prompt,
            platform: existing.platform,
            originalContent: result.content,
            aiMeta: result.aiMeta || {},
        });

        res.json({ success: true, content });
    } catch (error) {
        console.error('Content regenerate error:', error);
        if (req.creditsDeducted > 0) {
            await refundCredits(req.user._id, req.creditsDeducted, 'contentRegenerate', `Refund: Content Regeneration Sync Failure (${safeErrorMessage(error)})`, 'content', { contentId: req.params.id });
        }
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// POST /api/content/:id/refine — AI-assisted content refinement
router.post('/:id/refine', protect, requireCredits('contentRefine'), async (req, res) => {
    try {
        const { instruction, currentContent } = req.body;
        if (!instruction) return res.status(400).json({ success: false, error: 'Refine instruction is required' });

        const existing = await Content.findOne({ _id: req.params.id, user: req.user._id });
        const textToRefine = currentContent || existing?.content || '';
        if (!textToRefine) return res.status(400).json({ success: false, error: 'No content to refine' });

        const brand = existing ? await Brand.findById(existing.brand) : null;
        const orchestrator = getOrchestrator();

        const result = await orchestrator.generateContent({
            brand: brand || { name: 'Brand', dna: {}, _id: null },
            user: req.user,
            type: existing?.type || 'social',
            prompt: `REFINE the following content based on this instruction:

INSTRUCTION: ${instruction}

ORIGINAL CONTENT:
${textToRefine}

RULES:
- Keep the same general message and intent
- Apply ONLY the requested changes
- Maintain the brand voice and tone
- Output ONLY the refined content — no explanations`,
            platform: existing?.platform || '',
            options: {},
            toneSettings: {},
        });

        // Update existing content if it has an ID
        if (existing) {
            await existing.updateOne({
                content: result.content,
                userEdited: true,
            });

            // Record RLHF feedback
            await Feedback.create({
                user: req.user._id,
                brand: existing.brand,
                contentType: existing.type,
                contentId: existing._id,
                prompt: existing.prompt,
                aiOutput: textToRefine,
                signalType: 'refine',
                editBefore: textToRefine,
                editAfter: result.content,
                context: {
                    refineInstruction: instruction,
                    provider: result.aiMeta?.provider,
                    model: result.aiMeta?.model,
                },
            });
        }

        res.json({
            success: true,
            content: result.content,
            aiMeta: result.aiMeta,
        });
    } catch (error) {
        console.error('Content refine error:', error);
        if (req.creditsDeducted > 0) {
            await refundCredits(req.user._id, req.creditsDeducted, 'contentRefine', `Refund: Content Refinement Sync Failure (${safeErrorMessage(error)})`, 'content', { contentId: req.params.id });
        }
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// POST /api/content/refine-text — refine without a saved content ID (ad-hoc)
router.post('/refine-text', optionalAuth, async (req, res) => {
    try {
        const { instruction, currentContent, brandId } = req.body;
        if (!instruction || !currentContent) {
            return res.status(400).json({ success: false, error: 'instruction and currentContent are required' });
        }

        let brand = null;
        if (brandId) brand = await Brand.findById(brandId);
        if (!brand && req.user) brand = await Brand.findOne({ user: req.user._id }).sort('-createdAt');
        if (!brand) brand = { name: 'Brand', dna: {}, _id: null };

        const orchestrator = getOrchestrator();
        const result = await orchestrator.generateContent({
            brand,
            user: req.user || { preferences: {} },
            type: 'social',
            prompt: `REFINE the following content based on this instruction:

INSTRUCTION: ${instruction}

ORIGINAL CONTENT:
${currentContent}

RULES:
- Keep the same general message and intent
- Apply ONLY the requested changes
- Maintain the brand voice and tone
- Output ONLY the refined content — no explanations`,
            platform: '',
            options: {},
            toneSettings: {},
        });

        res.json({ success: true, content: result.content, aiMeta: result.aiMeta });
    } catch (error) {
        console.error('Refine text error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// DELETE /api/content/:id
router.delete('/:id', protect, async (req, res) => {
    try {
        await Content.findOneAndDelete({ _id: req.params.id, user: req.user._id });
        res.json({ success: true, message: 'Content deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

export default router;

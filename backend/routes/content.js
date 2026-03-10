import { Router } from 'express';
import Content from '../models/Content.js';
import Feedback from '../models/Feedback.js';
import Brand from '../models/Brand.js';
import { protect, optionalAuth } from '../middleware/auth.js';
import { getOrchestrator } from '../agents/orchestrator.js';
import { requireCredits } from '../middleware/credits.js';
import { safeErrorMessage } from '../utils/safeError.js';

const router = Router();

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

// POST /api/content/generate — AI content generation (credits deducted)
router.post('/generate', protect, requireCredits('content'), async (req, res) => {
    try {
        const { brandId, type, prompt, platform, options, subType, toneSettings } = req.body;
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

        // Use the agent orchestrator for generation (with smart language routing)
        const orchestrator = getOrchestrator();
        const result = await orchestrator.generateContent({
            brand,
            user: req.user || { preferences: {} },
            type: type || 'social',
            prompt,
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
        const content = await Content.findById(req.params.id).populate('brand', 'name dna.voice');
        if (!content) return res.status(404).json({ success: false, error: 'Content not found' });
        res.json({ success: true, content });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// PUT /api/content/:id — update (user edits content)
router.put('/:id', protect, async (req, res) => {
    try {
        const existing = await Content.findById(req.params.id);
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

        const content = await Content.findByIdAndUpdate(req.params.id, updates, { new: true });
        res.json({ success: true, content });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// POST /api/content/:id/feedback — explicit feedback
router.post('/:id/feedback', protect, async (req, res) => {
    try {
        const { signalType, rating, thumbs } = req.body;
        const content = await Content.findById(req.params.id);
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
        const existing = await Content.findById(req.params.id);
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
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// POST /api/content/:id/refine — AI-assisted content refinement
router.post('/:id/refine', protect, requireCredits('contentRefine'), async (req, res) => {
    try {
        const { instruction, currentContent } = req.body;
        if (!instruction) return res.status(400).json({ success: false, error: 'Refine instruction is required' });

        const existing = await Content.findById(req.params.id);
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

/**
 * Creative Studio — Agentic API Routes
 * 
 * Multi-agent pipeline for creative generation.
 * Endpoints:
 *   POST /api/creatives/agentic/start       — ArtDirector + PromptEngineer + StyleCritic → Generate
 *   POST /api/creatives/agentic/:id/variations — Generate 3 style variations
 *   POST /api/creatives/agentic/:id/regenerate — Edit prompt + regenerate
 */

import { Router } from 'express';
import Creative from '../models/Creative.js';
import Brand from '../models/Brand.js';
import { protect } from '../middleware/auth.js';
import { requireCredits } from '../middleware/credits.js';
import { getOrchestrator } from '../agents/orchestrator.js';
import { safeErrorMessage } from '../utils/safeError.js';
import { getSignedUrlIfNeeded } from '../utils/s3.js';
import {
    artDirectorNode,
    promptEngineerNode,
    styleCriticNode,
    variationGeneratorNode,
} from '../agents/creativeStudio/nodes.js';

const router = Router();

// ── Helper: generate image from prompt using existing infrastructure ──
async function generateImage(prompt, brand, type, user, options = {}) {
    const orchestrator = getOrchestrator();
    return orchestrator.generateCreative({
        brand,
        user,
        type,
        prompt,
        options,
    });
}

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/creatives/agentic/start — Full pipeline: ArtDir → PromptEng → Critic → Generate
// ══════════════════════════════════════════════════════════════════════════════
router.post('/start', protect, requireCredits('creative'), async (req, res) => {
    try {
        const { brandId, brief, format, aspectRatio, style, references, productName, options: clientOptions } = req.body;
        if (!brandId || !brief) return res.status(400).json({ success: false, error: 'brandId and brief are required' });

        const brand = await Brand.findById(brandId);
        if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });

        // Step 1: Art Director — define creative vision
        let state = {
            userId: req.user._id.toString(),
            brandId,
            brief,
            format: format || 'instagram-post',
            aspectRatio: aspectRatio || '1:1',
            style: style || '',
            references: references || '',
            productName: productName || '',
        };

        state = await artDirectorNode(state);

        // Step 2: Prompt Engineer — craft optimal prompt
        state = await promptEngineerNode(state);

        // Step 3: Style Critic — pre-gen quality check (auto-improves if needed)
        state = await styleCriticNode(state);

        // Step 4: Generate the image using the engineered prompt
        const result = await generateImage(state.finalPrompt, brand, format || 'instagram-post', req.user, {
            ...clientOptions,
            aspectRatio: aspectRatio || '1:1',
            style: style || '',
        });

        // Save creative
        const creative = await Creative.create({
            user: req.user._id,
            brand: brandId,
            type: format || 'instagram-post',
            title: brief.substring(0, 50),
            prompt: brief,
            imageUrl: result.imageUrl || '',
            designData: result.designData || {},
            aiMeta: {
                ...(result.aiMeta || {}),
                agenticPipeline: true,
                artDirection: state.artDirection,
                engineeredPrompt: state.engineeredPrompt,
                styleCritique: state.styleCritique,
                finalPromptUsed: state.finalPrompt,
                brandAlignmentScore: state.styleCritique?.brandAlignmentPrediction || 85,
            },
        });

        await req.user.updateOne({ $inc: { 'usage.creativesGenerated': 1 } });

        const creativeObj = creative.toObject();
        creativeObj.imageUrl = await getSignedUrlIfNeeded(creativeObj.imageUrl);

        res.json({
            success: true,
            creative: {
                ...creativeObj,
                agenticData: {
                    artDirection: state.artDirection,
                    engineeredPrompt: state.engineeredPrompt,
                    styleCritique: state.styleCritique,
                    finalPrompt: state.finalPrompt,
                },
            },
        });
    } catch (error) {
        console.error('Creative agentic start error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/creatives/agentic/:id/variations — Generate 3 style variations
// ══════════════════════════════════════════════════════════════════════════════
router.post('/:id/variations', protect, requireCredits('creative'), async (req, res) => {
    try {
        const creative = await Creative.findOne({ _id: req.params.id, user: req.user._id });
        if (!creative) return res.status(404).json({ success: false, error: 'Creative not found' });

        const brand = await Brand.findById(creative.brand);

        let state = {
            brandId: creative.brand?.toString(),
            brief: creative.prompt,
            format: creative.type,
            artDirection: creative.aiMeta?.artDirection || {},
            engineeredPrompt: creative.aiMeta?.engineeredPrompt || {},
            finalPrompt: creative.aiMeta?.finalPromptUsed || creative.prompt,
        };

        // Generate variation prompts
        state = await variationGeneratorNode(state);

        // Generate images for each variation (parallel)
        const variationResults = await Promise.all(
            (state.variations || []).map(async (v) => {
                try {
                    const result = await generateImage(v.prompt, brand, creative.type, req.user);
                    const signedUrl = await getSignedUrlIfNeeded(result.imageUrl);
                    return { ...v, imageUrl: signedUrl, success: true };
                } catch (err) {
                    return { ...v, imageUrl: null, success: false, error: err.message };
                }
            })
        );

        res.json({
            success: true,
            variations: variationResults,
            originalCreativeId: creative._id,
        });
    } catch (error) {
        console.error('Creative variation error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/creatives/agentic/:id/regenerate — Edit prompt, re-generate
// ══════════════════════════════════════════════════════════════════════════════
router.post('/:id/regenerate', protect, requireCredits('creative'), async (req, res) => {
    try {
        const { editedPrompt } = req.body;
        const creative = await Creative.findOne({ _id: req.params.id, user: req.user._id });
        if (!creative) return res.status(404).json({ success: false, error: 'Creative not found' });

        const brand = await Brand.findById(creative.brand);
        const prompt = editedPrompt || creative.aiMeta?.finalPromptUsed || creative.prompt;

        // Re-generate with edited prompt
        const result = await generateImage(prompt, brand, creative.type, req.user);

        // Create new creative (keeps history)
        const newCreative = await Creative.create({
            user: req.user._id,
            brand: creative.brand,
            type: creative.type,
            title: creative.title,
            prompt: creative.prompt,
            imageUrl: result.imageUrl || '',
            designData: result.designData || {},
            aiMeta: {
                ...(result.aiMeta || {}),
                agenticPipeline: true,
                finalPromptUsed: prompt,
                regeneratedFrom: creative._id,
                brandAlignmentScore: 85,
            },
        });

        const creativeObj = newCreative.toObject();
        creativeObj.imageUrl = await getSignedUrlIfNeeded(creativeObj.imageUrl);

        res.json({ success: true, creative: creativeObj });
    } catch (error) {
        console.error('Creative regenerate error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

export default router;

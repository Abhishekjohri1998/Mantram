/**
 * Content Studio — Agentic API Routes
 * 
 * Adds agentic multi-agent pipeline alongside existing single-shot generate.
 * Endpoints:
 *   POST /api/content/agentic/start    — Brief → Research + Writer
 *   POST /api/content/agentic/:id/refine — Run SEO + Tone + Critic
 *   POST /api/content/agentic/:id/edit   — Edit content, re-run critic
 *   POST /api/content/agentic/:id/finalize — Save final content
 */

import { Router } from 'express';
import Content from '../models/Content.js';
import Brand from '../models/Brand.js';
import { protect } from '../middleware/auth.js';
import { requireCredits } from '../middleware/credits.js';
import {
    researchNode,
    writerNode,
    seoNode,
    toneMatcherNode,
    qualityCriticNode,
} from '../agents/contentStudio/nodes.js';

const router = Router();

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/content/agentic/start — Kick off the 5-agent pipeline
// ══════════════════════════════════════════════════════════════════════════════
router.post('/start', protect, requireCredits('content'), async (req, res) => {
    try {
        const { brandId, brief, contentType, platform, tone, language, targetAudience } = req.body;
        if (!brief) return res.status(400).json({ success: false, error: 'Brief is required' });

        // Step 1: Research
        let state = {
            userId: req.user._id.toString(),
            brandId: brandId || null,
            brief,
            contentType: contentType || 'social',
            platform: platform || 'instagram',
            tone: tone || '',
            language: language || '',
            targetAudience: targetAudience || '',
        };

        state = await researchNode(state);

        // Step 2: Writer (auto-chains from research)
        state = await writerNode(state);

        // Save initial content
        const brand = brandId ? await Brand.findById(brandId) : null;
        const content = await Content.create({
            user: req.user._id,
            brand: brandId || undefined,
            type: contentType || 'social',
            title: state.draft?.title || '',
            content: state.draft?.content || '',
            prompt: brief,
            platform: platform || 'instagram',
            originalContent: state.draft?.content || '',
            aiMeta: {
                provider: 'anthropic',
                model: 'claude-sonnet',
                agenticPipeline: true,
                pipelineStep: 'draft',
                research: state.research,
                brandAlignmentScore: 70, // Pre-optimization
            },
        });

        await req.user.updateOne({ $inc: { 'usage.contentGenerated': 1 } });

        res.json({
            success: true,
            content: {
                ...content.toObject(),
                agenticData: {
                    research: state.research,
                    draft: state.draft,
                    pipelineProgress: 40, // 2/5 steps done
                    nextStep: 'refine',
                },
            },
        });
    } catch (error) {
        console.error('Content agentic start error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/content/agentic/:id/refine — Run SEO + Tone + Critic
// ══════════════════════════════════════════════════════════════════════════════
router.post('/:id/refine', protect, requireCredits('contentRefine'), async (req, res) => {
    try {
        const content = await Content.findOne({ _id: req.params.id, user: req.user._id });
        if (!content) return res.status(404).json({ success: false, error: 'Content not found' });

        let state = {
            userId: req.user._id.toString(),
            brandId: content.brand?.toString(),
            brief: content.prompt,
            contentType: content.type,
            platform: content.platform,
            draft: {
                title: content.title,
                content: req.body.editedContent || content.content,
            },
            research: content.aiMeta?.research || {},
            tone: req.body.tone || '',
            language: req.body.language || '',
        };

        // Step 3: SEO Optimization
        state = await seoNode(state);

        // Step 4: Tone Matching
        state = await toneMatcherNode(state);

        // Step 5: Quality Critic
        state = await qualityCriticNode(state);

        // Update content with final optimized version
        content.content = state.finalContent;
        content.title = state.finalTitle;
        content.aiMeta = {
            ...content.aiMeta,
            agenticPipeline: true,
            pipelineStep: 'refined',
            seoOptimized: state.seoOptimized,
            toneMatched: state.toneMatched,
            critique: state.critique,
            brandAlignmentScore: state.critique?.scores?.brandAlignment || 85,
        };
        await content.save();

        res.json({
            success: true,
            content: {
                ...content.toObject(),
                agenticData: {
                    seoOptimized: state.seoOptimized,
                    toneMatched: state.toneMatched,
                    critique: state.critique,
                    pipelineProgress: 100,
                    nextStep: 'finalize',
                },
            },
        });
    } catch (error) {
        console.error('Content agentic refine error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/content/agentic/:id/edit — Edit and re-critique
// ══════════════════════════════════════════════════════════════════════════════
router.post('/:id/edit', protect, async (req, res) => {
    try {
        const { editedContent, editedTitle } = req.body;
        const content = await Content.findOne({ _id: req.params.id, user: req.user._id });
        if (!content) return res.status(404).json({ success: false, error: 'Content not found' });

        // Re-run critic on edited content
        let state = {
            userId: req.user._id.toString(),
            brandId: content.brand?.toString(),
            brief: content.prompt,
            contentType: content.type,
            platform: content.platform,
            draft: { title: editedTitle || content.title, content: editedContent || content.content },
            toneMatched: { matchedContent: editedContent || content.content },
            seoOptimized: { optimizedTitle: editedTitle || content.title },
        };

        state = await qualityCriticNode(state);

        content.content = editedContent || content.content;
        content.title = editedTitle || content.title;
        content.aiMeta = { ...content.aiMeta, critique: state.critique, pipelineStep: 'edited' };
        await content.save();

        res.json({
            success: true,
            content: {
                ...content.toObject(),
                agenticData: { critique: state.critique, pipelineProgress: 100 },
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;

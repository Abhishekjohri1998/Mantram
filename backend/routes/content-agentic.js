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
import { safeErrorMessage } from '../utils/safeError.js';
    researchNode,
    writerNode,
    seoNode,
    toneMatcherNode,
    qualityCriticNode,
    youtubeResearchNode,
    youtubeWriterNode,
    youtubeSeoNode,
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
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
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
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
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
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/content/agentic/youtube — YouTube Content Generation Pipeline
// ══════════════════════════════════════════════════════════════════════════════
router.post('/youtube', protect, requireCredits('content'), async (req, res) => {
    try {
        const { brandId, brief, format, videoLength, targetAudience, style, language, subType } = req.body;
        if (!brief) return res.status(400).json({ success: false, error: 'Video brief is required' });

        const contentType = format === 'shorts' ? 'youtube_shorts' : 'youtube_video';

        // Build pipeline state
        let state = {
            userId: req.user._id.toString(),
            brandId: brandId || null,
            brief,
            format: format || 'video',
            videoLength: videoLength || 'medium',
            targetAudience: targetAudience || '',
            style: style || '',
            language: language || 'english',
            subType: subType || '',
        };

        // Step 1: YouTube Research
        state = await youtubeResearchNode(state);

        // Step 2: YouTube Writer
        state = await youtubeWriterNode(state);

        const yt = state.youtubeContent || {};

        // Save content with structured YouTube metadata
        const content = await Content.create({
            user: req.user._id,
            brand: brandId || undefined,
            type: contentType,
            title: yt.videoTitle || '',
            content: yt.script || '',
            prompt: brief,
            platform: 'youtube',
            originalContent: yt.script || '',
            aiMeta: {
                provider: 'anthropic',
                model: 'claude-sonnet',
                agenticPipeline: true,
                pipelineStep: 'youtube_complete',
            },
            youtubeMeta: {
                videoTitle: yt.videoTitle || '',
                description: yt.description || '',
                tags: yt.tags || [],
                keywords: {
                    primary: yt.keywords?.primary || [],
                    secondary: yt.keywords?.secondary || [],
                },
                timestamps: yt.timestamps || [],
                thumbnailIdeas: yt.thumbnailTextSuggestions || [],
                hookScript: yt.hookScript || '',
                ctaText: yt.ctaText || '',
                format: format || 'video',
                estimatedDuration: yt.estimatedDuration || '',
                hashtags: yt.hashtags || [],
            },
        });

        await req.user.updateOne({ $inc: { 'usage.contentGenerated': 1 } });

        res.json({
            success: true,
            content: {
                ...content.toObject(),
                youtubeData: {
                    research: state.youtubeResearch,
                    ...yt,
                },
            },
        });
    } catch (error) {
        console.error('YouTube content generation error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/content/agentic/youtube-seo — YouTube Publish Optimizer (metadata only)
// ══════════════════════════════════════════════════════════════════════════════
router.post('/youtube-seo', protect, requireCredits('content'), async (req, res) => {
    try {
        const { brandId, brief, format, videoCategory, targetAudience, language } = req.body;
        if (!brief) return res.status(400).json({ success: false, error: 'Video topic/brief is required' });

        // Build pipeline state
        let state = {
            userId: req.user._id.toString(),
            brandId: brandId || null,
            brief: `[VIDEO CATEGORY: ${videoCategory || 'general'}] ${brief}`,
            format: format || 'video',
            videoCategory: videoCategory || 'general',
            targetAudience: targetAudience || '',
            language: language || 'english',
        };

        // Step 1: YouTube Research (keywords, competitive analysis)
        state = await youtubeResearchNode(state);

        // Step 2: YouTube SEO Optimizer (metadata only — no script)
        state = await youtubeSeoNode(state);

        const seo = state.youtubeSeo || {};

        // Save content with structured YouTube SEO metadata
        const content = await Content.create({
            user: req.user._id,
            brand: brandId || undefined,
            type: 'youtube_seo',
            title: seo.titles?.[0]?.text || '',
            content: seo.description || '',
            prompt: brief,
            platform: 'youtube',
            originalContent: seo.description || '',
            aiMeta: {
                provider: 'anthropic',
                model: 'claude-sonnet',
                agenticPipeline: true,
                pipelineStep: 'youtube_seo',
            },
            youtubeMeta: {
                videoTitle: seo.titles?.[0]?.text || '',
                titleOptions: seo.titles || [],
                description: seo.description || '',
                tags: seo.tags || [],
                keywords: {
                    primary: seo.keywords?.primary || [],
                    secondary: seo.keywords?.secondary || [],
                },
                hashtags: seo.hashtags || [],
                seoScore: seo.seoScore || {},
                competitorInsight: seo.competitorInsight || '',
                format: format || 'video',
            },
        });

        await req.user.updateOne({ $inc: { 'usage.contentGenerated': 1 } });

        res.json({
            success: true,
            content: {
                ...content.toObject(),
                youtubeSeoData: {
                    research: state.youtubeResearch,
                    ...seo,
                },
            },
        });
    } catch (error) {
        console.error('YouTube SEO generation error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

export default router;

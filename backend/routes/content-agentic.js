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
import { requireCredits, refundCredits } from '../middleware/credits.js';
import { safeErrorMessage } from '../utils/safeError.js';
import {
    researchNode,
    contentStrategistNode,
    writerNode,
    seoNode,
    toneMatcherNode,
    platformOptimizerNode,
    qualityCriticNode,
    youtubeResearchNode,
    youtubeWriterNode,
    youtubeSeoNode,
} from '../agents/contentStudio/nodes.js';

const router = Router();

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/content/agentic/parse-intent — AI-powered natural language parsing
// ══════════════════════════════════════════════════════════════════════════════
router.post('/parse-intent', protect, async (req, res) => {
    try {
        const { input } = req.body;
        if (!input?.trim()) return res.status(400).json({ success: false, error: 'Input is required' });

        const grokKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
        if (!grokKey) {
            // Fallback to regex if no API key
            return res.json({ success: true, parsed: regexFallback(input), method: 'regex' });
        }

        const resp = await fetch('https://api.x.ai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${grokKey}` },
            body: JSON.stringify({
                model: 'grok-3-mini-fast',
                messages: [{
                    role: 'system',
                    content: `You are an intent parser for a content creation platform. Parse the user's natural language input and extract structured intent. Respond ONLY with valid JSON, no explanation.

GOALS (pick one): promote, celebrate, launch, educate, engage, brand, hijack, press_release, product_content
CHANNELS (pick one or multiple): instagram, facebook, linkedin, twitter, email, website, whatsapp, youtube, ecommerce
SUB_TYPES: blog, carousel, reel, story, thread, newsletter, ad_copy, product_description

Response format:
{
  "goal": "the detected goal or null",
  "channel": "primary channel or null",
  "channels": ["all detected channels"],
  "subType": "specific sub-type or null",
  "tone": "detected tone preference or null",
  "brief": "cleaned-up version of what user wants to create",
  "confidence": 0.0 to 1.0
}`
                }, {
                    role: 'user',
                    content: input
                }],
                temperature: 0.1,
                max_tokens: 300,
                response_format: { type: 'json_object' },
            }),
            signal: AbortSignal.timeout(6000),
        });

        const data = await resp.json();
        let text = data.choices?.[0]?.message?.content || '{}';
        text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);

        res.json({ success: true, parsed, method: 'ai' });
    } catch (err) {
        console.warn('Intent parse AI failed, using regex fallback:', err.message);
        res.json({ success: true, parsed: regexFallback(req.body.input || ''), method: 'regex' });
    }
});

// Regex fallback for intent parsing (original SmartInput logic)
function regexFallback(input) {
    const lower = input.toLowerCase();
    let goal = null, subType = null, channel = null;

    if (/promot|offer|sale|discount|deal|product/.test(lower)) goal = 'promote';
    else if (/festival|diwali|christmas|celebrat|occasion|milestone/.test(lower)) goal = 'celebrate';
    else if (/launch|new|announce|pr |press|collab/.test(lower)) goal = 'launch';
    else if (/blog|seo|article|guide|how.to|educat|tip/.test(lower)) goal = 'educate';
    else if (/brand|story|about|tagline|website|vision/.test(lower)) goal = 'brand';
    else if (/engage|poll|quiz|question|interact/.test(lower)) goal = 'engage';
    else if (/hijack|meme|trend|moment/.test(lower)) goal = 'hijack';

    if (/instagram|insta/i.test(lower)) channel = 'instagram';
    else if (/facebook|fb/i.test(lower)) channel = 'facebook';
    else if (/linkedin/i.test(lower)) channel = 'linkedin';
    else if (/twitter|tweet/i.test(lower)) channel = 'twitter';
    else if (/email|newsletter/i.test(lower)) channel = 'email';
    else if (/amazon|ecommerce|shopify/i.test(lower)) channel = 'ecommerce';
    else if (/website|blog|web/i.test(lower)) channel = 'website';
    else if (/whatsapp/i.test(lower)) channel = 'whatsapp';
    else if (/youtube|yt |video script|shorts/i.test(lower)) channel = 'youtube';

    return { goal, subType, channel, brief: input, confidence: goal ? 0.5 : 0.2 };
}

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/content/agentic/start — Kick off the agentic pipeline
// ══════════════════════════════════════════════════════════════════════════════
router.post('/start', protect, requireCredits('content'), async (req, res) => {
    try {
        const { brandId, brief, contentType, platform, tone, language, targetAudience, researchDepth } = req.body;
        if (!brief) return res.status(400).json({ success: false, error: 'Brief is required' });

        // Step 1: Research (with real intelligence gathering)
        let state = {
            userId: req.user._id.toString(),
            brandId: brandId || null,
            brief,
            contentType: contentType || 'social',
            platform: platform || 'instagram',
            tone: tone || '',
            language: language || '',
            targetAudience: targetAudience || '',
            researchDepth: researchDepth || 'quick', // 'quick' = Grok (cheap), 'deep' = Perplexity (premium)
        };

        state = await researchNode(state);

        // Step 2: Content Strategist (turns research into strategic plan)
        state = await contentStrategistNode(state);

        // Step 3: Writer (auto-chains from strategy, enriched with real data)
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
                provider: 'router',
                model: 'auto',
                agenticPipeline: true,
                pipelineStep: 'draft',
                research: state.research,
                researchDepth: researchDepth || 'quick',
                brandAlignmentScore: 70,
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
                    intelligence: {
                        sourcesUsed: [
                            state.intelligence?.web?.success ? `Web(${state.intelligence.web.source})` : null,
                            state.intelligence?.seo?.success ? 'SEO Audit' : null,
                            state.intelligence?.contentHistory?.success ? 'Content History' : null,
                            state.intelligence?.trending?.success ? 'Trending' : null,
                            state.intelligence?.competitors?.success ? 'Competitors' : null,
                        ].filter(Boolean),
                        researchDepth: state.researchDepth,
                    },
                    pipelineProgress: 40,
                    nextStep: 'refine',
                },
            },
        });

    } catch (error) {
        console.error('Content agentic start error:', error);
        if (req.creditsDeducted > 0) {
            await refundCredits(req.user._id, req.creditsDeducted, 'contentGenerate', `Refund: Agentic Content Start Failure (${safeErrorMessage(error)})`, 'content');
        }
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
            researchDepth: content.aiMeta?.researchDepth || 'quick',
        };

        // Gather intelligence so SEO + Tone agents have real data
        const { gatherIntelligence } = await import('../agents/contentStudio/tools.js');
        state.intelligence = await gatherIntelligence(state);

        // Step 4: SEO Optimization (now with real SEO data)
        state = await seoNode(state);

        // Step 5: Tone Matching
        state = await toneMatcherNode(state);

        // Step 6: Platform Optimizer (adapts for target platform algorithm)
        state = await platformOptimizerNode(state);

        // Step 7: Quality Critic (with auto-loop to Writer)
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
            platformOptimized: state.platformOptimized ? { platformScore: state.platformOptimized.platformScore, optimizationChanges: state.platformOptimized.optimizationChanges } : null,
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
        if (req.creditsDeducted > 0) {
            await refundCredits(req.user._id, req.creditsDeducted, 'contentRefine', `Refund: Agentic Content Refine Failure (${safeErrorMessage(error)})`, 'content');
        }
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
                provider: 'router', // Uses default (gemini) unless user selects Claude
                model: 'auto',
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
        if (req.creditsDeducted > 0) {
            await refundCredits(req.user._id, req.creditsDeducted, 'contentGenerate', `Refund: YouTube Content Generation Failure (${safeErrorMessage(error)})`, 'content');
        }
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
                provider: 'router', // Uses default (gemini) unless user selects Claude
                model: 'auto',
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
        if (req.creditsDeducted > 0) {
            await refundCredits(req.user._id, req.creditsDeducted, 'contentGenerate', `Refund: YouTube SEO Generation Failure (${safeErrorMessage(error)})`, 'content');
        }
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

export default router;

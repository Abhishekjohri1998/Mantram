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
import { laozhangImageGenerate, isLaozhangAvailable } from '../agents/videoStudio/laozhangClient.js';
import {
    researchNode,
    contentStrategistNode,
    writerNode,
    seoNode,
    toneMatcherNode,
    platformOptimizerNode,
    qualityCriticNode,
    contentABTestNode,
    youtubeResearchNode,
    youtubeWriterNode,
    youtubeSeoNode,
    blogWriterNode,
    contentVisualGroundingNode,
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

        // Step 1.5: MCoT Visual Grounding (non-blocking — runs concurrently with research results)
        // Analyzes brand/product images to produce copywriting context for the Writer Agent
        if (brandId) {
            try {
                state = await contentVisualGroundingNode(state);
            } catch (gErr) {
                console.warn('[Content MCoT] Visual grounding failed (non-critical):', gErr.message);
            }
        }

        // Step 2: Content Strategist (turns research into strategic plan)
        state = await contentStrategistNode(state);

        // Step 3: Writer (auto-chains from strategy, enriched with real data + visual grounding)
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
                            state.intelligence?.performanceLearnings?.success ? 'Playbook' : null,
                            state.intelligence?.ga4?.success ? 'GA4' : null,
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
// POST /api/content/agentic/:id/ab-variants — Generate A/B test variants
// ══════════════════════════════════════════════════════════════════════════════
router.post('/:id/ab-variants', protect, requireCredits('content'), async (req, res) => {
    try {
        const content = await Content.findOne({ _id: req.params.id, user: req.user._id });
        if (!content) return res.status(404).json({ success: false, error: 'Content not found' });

        // Build state from existing content
        let state = {
            userId: req.user._id.toString(),
            brandId: content.brand?.toString(),
            brief: content.prompt,
            contentType: content.type,
            platform: content.platform,
            finalContent: content.content,
            finalTitle: content.title,
            strategy: content.aiMeta?.strategy || null,
        };

        // Gather intelligence for performance data
        const { gatherIntelligence } = await import('../agents/contentStudio/tools.js');
        state.intelligence = await gatherIntelligence(state);

        // Generate A/B variants
        state = await contentABTestNode(state);

        // Generate a unique A/B test group ID
        const abTestGroup = `ab_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

        // Save each variant as a separate Content document
        const savedVariants = [];
        const variants = state.abTestPlan?.variants || [];

        for (const variant of variants) {
            if (variant.changeType === 'control') {
                // Update parent content with A/B test metadata
                content.abTestGroup = abTestGroup;
                content.variantLabel = variant.label || 'A — Control';
                content.abTestChangeType = 'control';
                content.abTestHypothesis = variant.hypothesis || '';
                await content.save();
                savedVariants.push(content.toObject());
            } else {
                // Create new content doc for each variant
                const variantDoc = await Content.create({
                    user: req.user._id,
                    brand: content.brand || undefined,
                    type: content.type,
                    title: variant.title || content.title,
                    content: variant.content || content.content,
                    prompt: content.prompt,
                    platform: content.platform,
                    originalContent: variant.content || '',
                    variantOf: content._id,
                    variantLabel: variant.label || '',
                    abTestGroup,
                    abTestHypothesis: variant.hypothesis || '',
                    abTestChangeType: variant.changeType || '',
                    aiMeta: {
                        provider: 'router',
                        model: 'auto',
                        agenticPipeline: true,
                        pipelineStep: 'ab_variant',
                    },
                });
                savedVariants.push(variantDoc.toObject());
            }
        }

        await req.user.updateOne({ $inc: { 'usage.contentGenerated': Math.max(0, savedVariants.length - 1) } });

        res.json({
            success: true,
            abTestGroup,
            testPlan: {
                primaryMetric: state.abTestPlan?.primaryMetric || 'engagement_rate',
                testDuration: state.abTestPlan?.testDuration || '7 days',
                sampleSize: state.abTestPlan?.sampleSizeRecommendation || '',
            },
            variants: savedVariants.map(v => ({
                ...v,
                isControl: v.abTestChangeType === 'control',
            })),
        });
    } catch (error) {
        console.error('A/B variant generation error:', error);
        if (req.creditsDeducted > 0) {
            await refundCredits(req.user._id, req.creditsDeducted, 'contentGenerate', `Refund: AB Variant Generation Failure (${safeErrorMessage(error)})`, 'content');
        }
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

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/content/agentic/blog/generate — Generate structured blog article
// ══════════════════════════════════════════════════════════════════════════════
router.post('/blog/generate', protect, requireCredits('content'), async (req, res) => {
    try {
        const { brandId, topic, blogType, targetWordCount, keywords, targetAudience, tone } = req.body;
        if (!topic) return res.status(400).json({ success: false, error: 'Topic is required' });

        // Step 1: Research (same intelligence gathering as /start)
        let state = {
            userId: req.user._id.toString(),
            brandId: brandId || null,
            brief: topic,
            topic,
            blogType: blogType || 'seo_blog',
            targetWordCount: targetWordCount || 1500,
            keywords: keywords || [],
            targetAudience: targetAudience || 'general',
            tone: tone || 'professional',
            contentType: 'blog',
            platform: 'website',
            researchDepth: 'quick',
        };

        state = await researchNode(state);

        // Step 2: Blog Writer (structured JSON output)
        state = await blogWriterNode(state);

        const blogData = state.blogData || {};
        const fullContent = (blogData.sections || []).map(s => `## ${s.heading}\n\n${s.body}`).join('\n\n') || `Blog article about: ${topic}`;

        // Save to Content model
        const content = await Content.create({
            user: req.user._id,
            brand: brandId || undefined,
            type: 'blog',
            title: blogData.title || topic,
            content: fullContent,
            prompt: topic,
            platform: 'website',
            originalContent: fullContent,
            blogMeta: {
                slug: blogData.slug || topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
                metaTitle: blogData.metaTitle || blogData.title || '',
                metaDescription: blogData.metaDescription || '',
                subtitle: blogData.subtitle || '',
                keywords: blogData.keywords || keywords || [],
                sections: (blogData.sections || []).map(s => ({
                    heading: s.heading,
                    body: s.body,
                    imagePrompt: s.imagePrompt || '',
                    imageUrl: '',
                })),
                tableOfContents: (blogData.sections || []).map(s => s.heading),
                estimatedReadTime: blogData.estimatedReadTime || `${Math.ceil(fullContent.split(/\s+/).length / 200)} min read`,
                targetWordCount: targetWordCount || 1500,
            },
            aiMeta: {
                provider: 'router',
                model: 'auto',
                agenticPipeline: true,
                pipelineStep: 'blog_draft',
                research: state.research,
                researchDepth: 'quick',
            },
        });

        await req.user.updateOne({ $inc: { 'usage.contentGenerated': 1 } });

        res.json({
            success: true,
            content: {
                ...content.toObject(),
                agenticData: {
                    research: state.research,
                    intelligence: {
                        sourcesUsed: [
                            state.intelligence?.web?.success ? `Web(${state.intelligence.web.source})` : null,
                            state.intelligence?.seo?.success ? 'SEO Audit' : null,
                            state.intelligence?.trending?.success ? 'Trending' : null,
                            state.intelligence?.competitors?.success ? 'Competitors' : null,
                            state.intelligence?.performanceLearnings?.success ? 'Playbook' : null,
                            state.intelligence?.ga4?.success ? 'GA4' : null,
                        ].filter(Boolean),
                    },
                },
            },
        });
    } catch (error) {
        console.error('Blog generation error:', error);
        if (req.creditsDeducted > 0) {
            await refundCredits(req.user._id, req.creditsDeducted, 'contentGenerate', `Refund: Blog Generation Failure (${safeErrorMessage(error)})`, 'content');
        }
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/content/agentic/blog/:id/generate-image — Generate AI image for blog section
// ══════════════════════════════════════════════════════════════════════════════
router.post('/blog/:id/generate-image', protect, async (req, res) => {
    try {
        const { sectionIndex, customPrompt, imageStyle, brandImageUrl, brandImageRef } = req.body;
        // brandImageUrl = Use brand image directly (no AI generation)
        // brandImageRef = Use brand image as reference for NanoBanana 2 AI generation
        const content = await Content.findOne({ _id: req.params.id, user: req.user._id });
        if (!content) return res.status(404).json({ success: false, error: 'Content not found' });

        const isHero = sectionIndex === -1 || sectionIndex === undefined;

        // ── Mode 1: Use brand image DIRECTLY (no AI) ──
        if (brandImageUrl && !brandImageRef) {
            const seoContext = isHero
                ? (content.title || 'Blog')
                : (content.blogMeta?.sections?.[sectionIndex]?.heading || 'Blog section');
            const seoAltText = `${seoContext} - Brand image`.substring(0, 125);

            if (isHero) {
                content.blogMeta.heroImageUrl = brandImageUrl;
                content.blogMeta.heroImagePrompt = 'Brand DNA image (used directly)';
                content.blogMeta.heroImageAlt = seoAltText;
            } else {
                content.blogMeta.sections[sectionIndex].imageUrl = brandImageUrl;
                content.blogMeta.sections[sectionIndex].imageAlt = seoAltText;
            }
            content.markModified('blogMeta');
            await content.save();
            return res.json({ success: true, imageUrl: brandImageUrl, altText: seoAltText, sectionIndex: isHero ? -1 : sectionIndex, model: 'Brand DNA' });
        }



        // ── Build contextual prompt from blog content ──
        const styleMap = {
            editorial: 'Professional editorial photography, clean composition, modern magazine style',
            infographic: 'Clean infographic style, data visualization, modern flat design with icons and charts',
            lifestyle: 'Lifestyle photography, candid natural look, warm lighting, authentic feel',
            '3d': '3D rendered illustration, glossy materials, clean studio lighting, modern 3D art style',
            line_drawing: 'Minimalist line drawing, elegant sketch style, black ink on white, editorial illustration',
            flat_illustration: 'Modern flat illustration, geometric shapes, vibrant colors, digital art style',
            photorealistic: 'Photorealistic, ultra detailed, professional stock photography quality',
            watercolor: 'Watercolor painting style, soft edges, artistic, flowing colors',
        };

        const styleDirective = styleMap[imageStyle] || styleMap.editorial;
        let imagePrompt, seoContext;

        if (customPrompt) {
            imagePrompt = `${customPrompt}. Style: ${styleDirective}`;
            seoContext = customPrompt;
        } else if (isHero) {
            const blogTitle = content.title || '';
            const blogSubtitle = content.blogMeta?.subtitle || '';
            imagePrompt = `${styleDirective}. Blog hero image for article titled "${blogTitle}"${blogSubtitle ? `. ${blogSubtitle}` : ''}. Wide cinematic composition, professional, high quality.`;
            seoContext = `${blogTitle} ${blogSubtitle}`;
        } else {
            const section = content.blogMeta?.sections?.[sectionIndex];
            if (!section) return res.status(400).json({ success: false, error: 'Section not found' });
            const bodyContext = (section.body || '').substring(0, 200).replace(/[*#>\[\]()-]/g, '').trim();
            imagePrompt = `${styleDirective}. Image for blog section: "${section.heading}". Context: ${bodyContext}. Professional quality, visually appealing.`;
            seoContext = `${section.heading} - ${bodyContext.substring(0, 80)}`;
        }

        // ── Generate SEO alt text ──
        const altText = seoContext
            .replace(/[*#>\[\]()"-]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 125);
        const seoAltText = isHero
            ? `${altText} - Featured blog image`
            : `${altText} - ${(imageStyle || 'editorial')} illustration`;

        console.log(`🎨 Blog image gen (NanoBanana 2): ${isHero ? 'HERO' : `Section ${sectionIndex}`}, style: ${imageStyle || 'editorial'}`);
        console.log(`   Prompt: ${imagePrompt.substring(0, 120)}...`);
        console.log(`   SEO Alt: ${seoAltText}`);

        // ── LaoZhang-First: Try LZ when no brand ref image (cheaper) ──
        // LZ doesn't support inline reference images, only plain text prompts
        if (!brandImageRef && isLaozhangAvailable()) {
            try {
                const blogAR = isHero ? '16:9' : '3:2';
                const AR_SIZE_MAP = { '16:9': '1792x1024', '3:2': '1536x1024', '1:1': '1024x1024' };
                const lzSize = AR_SIZE_MAP[blogAR] || '1024x1024';
                console.log(`🏷️ [LaoZhang-First] Blog image via LZ (${lzSize})...`);
                const lzResult = await laozhangImageGenerate(imagePrompt, { model: 'gemini-3.1-flash-image-preview', size: lzSize });
                if (lzResult?.imageUrl) {
                    console.log(`✅ [LaoZhang] Blog image generated successfully`);
                    // Upload to S3 if it's a base64 data URI
                    let imageUrl = lzResult.imageUrl;
                    if (imageUrl.startsWith('data:image/')) {
                        try {
                            const { uploadToS3 } = await import('../utils/s3.js');
                            const b64Match = imageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
                            if (b64Match) {
                                const buffer = Buffer.from(b64Match[2], 'base64');
                                const ext = b64Match[1] === 'png' ? 'png' : 'jpg';
                                const fileName = `blog-images/${content._id}/${isHero ? 'hero' : `section-${sectionIndex}`}-${Date.now()}.${ext}`;
                                imageUrl = await uploadToS3(buffer, fileName, `image/${b64Match[1]}`);
                            }
                        } catch (s3E) { console.warn('S3 upload failed for LZ blog image:', s3E.message); }
                    }

                    // Save to content
                    if (isHero) {
                        content.blogMeta.heroImageUrl = imageUrl;
                        content.blogMeta.heroImagePrompt = imagePrompt;
                        content.blogMeta.heroImageAlt = seoAltText;
                    } else {
                        content.blogMeta.sections[sectionIndex].imageUrl = imageUrl;
                        content.blogMeta.sections[sectionIndex].imageAlt = seoAltText;
                    }
                    content.markModified('blogMeta');
                    await content.save();
                    return res.json({ success: true, imageUrl, altText: seoAltText, sectionIndex: isHero ? -1 : sectionIndex, model: 'NanoBanana 2 (LaoZhang)' });
                }
            } catch (lzErr) {
                console.warn(`⚠️ [LaoZhang] Blog image failed (${lzErr.message?.substring(0, 80)}), falling through to Gemini direct...`);
            }
        }

        // ── Fallback: Call NanoBanana 2 (gemini-3.1-flash-image-preview) directly ──
        const imageKey = process.env.GEMINI_IMAGE_API_KEY || process.env.GEMINI_API_KEY;
        if (!imageKey) return res.status(500).json({ success: false, error: 'Image generation API key not configured' });

        const baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
        const modelId = 'gemini-3.1-flash-image-preview'; // NanoBanana 2
        const aspectRatio = isHero ? '16:9' : '3:2';
        const arInstruction = `Generate this image in ${aspectRatio} aspect ratio (${aspectRatio === '16:9' ? 'landscape/horizontal' : 'standard landscape'}). `;

        // Build parts array — optionally include brand reference image
        const contentParts = [];

        // ── Mode 2: Use brand image as REFERENCE for AI generation ──
        if (brandImageRef) {
            try {
                console.log(`📥 Fetching brand reference image: ${brandImageRef.substring(0, 80)}...`);
                const imgResp = await fetch(brandImageRef, {
                    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'image/*' },
                    redirect: 'follow',
                });
                if (imgResp.ok) {
                    const buf = await imgResp.arrayBuffer();
                    const ct = (imgResp.headers.get('content-type') || 'image/jpeg').split(';')[0];
                    const b64 = Buffer.from(buf).toString('base64');
                    contentParts.push({ inlineData: { mimeType: ct, data: b64 } });
                    // Modify prompt to reference the brand image
                    imagePrompt = `Using the provided brand reference image as visual inspiration — match its style, colors, and mood. Create a NEW image that is contextually relevant to this blog section. ${imagePrompt}`;
                    console.log(`✅ Brand reference image attached (${Math.round(buf.byteLength / 1024)}KB)`);
                }
            } catch (refErr) {
                console.warn('⚠️ Failed to fetch brand reference image:', refErr.message);
            }
        }

        contentParts.push({ text: arInstruction + imagePrompt });

        const url = `${baseUrl}/models/${modelId}:generateContent?key=${imageKey}`;
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: contentParts }],
                generationConfig: { responseModalities: ['TEXT', 'IMAGE'], temperature: 0.4 },
            }),
        });

        const data = await resp.json();
        if (data.error) {
            console.error(`❌ NanoBanana 2 error: ${data.error.message}`);
            return res.status(500).json({ success: false, error: `Image generation failed: ${data.error.message}` });
        }

        // Extract image from response
        const parts = data.candidates?.[0]?.content?.parts || [];
        let imageBase64 = null, imageMime = null;
        for (const part of parts) {
            if (part.inlineData?.mimeType?.startsWith('image/')) {
                imageBase64 = part.inlineData.data;
                imageMime = part.inlineData.mimeType;
                break;
            }
        }

        if (!imageBase64) {
            console.warn('NanoBanana 2 returned no image in response');
            return res.status(500).json({ success: false, error: 'NanoBanana 2 returned no image. Please try again.' });
        }

        // ── Upload to S3 for persistent URL ──
        let imageUrl;
        try {
            const { uploadToS3 } = await import('../utils/s3.js');
            const buffer = Buffer.from(imageBase64, 'base64');
            const ext = imageMime === 'image/png' ? 'png' : 'jpg';
            const fileName = `blog-images/${content._id}/${isHero ? 'hero' : `section-${sectionIndex}`}-${Date.now()}.${ext}`;
            imageUrl = await uploadToS3(buffer, fileName, imageMime);
            console.log(`✅ Blog image uploaded to S3: ${imageUrl.substring(0, 80)}...`);
        } catch (s3Err) {
            console.warn('S3 upload failed, using base64 data URI:', s3Err.message);
            imageUrl = `data:${imageMime};base64,${imageBase64}`;
        }

        // ── Save to content with SEO alt text ──
        if (isHero) {
            content.blogMeta.heroImageUrl = imageUrl;
            content.blogMeta.heroImagePrompt = imagePrompt;
            content.blogMeta.heroImageAlt = seoAltText;
        } else {
            content.blogMeta.sections[sectionIndex].imageUrl = imageUrl;
            content.blogMeta.sections[sectionIndex].imageAlt = seoAltText;
        }
        content.markModified('blogMeta');
        await content.save();

        res.json({ success: true, imageUrl, altText: seoAltText, sectionIndex: isHero ? -1 : sectionIndex, model: 'NanoBanana 2' });
    } catch (error) {
        console.error('Blog image generation error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/content/agentic/blog/:id/publish-website — Publish blog to website
// ══════════════════════════════════════════════════════════════════════════════
router.post('/blog/:id/publish-website', protect, async (req, res) => {
    try {
        const content = await Content.findOne({ _id: req.params.id, user: req.user._id });
        if (!content) return res.status(404).json({ success: false, error: 'Content not found' });

        // Build structured HTML from blog data
        const blogMeta = content.blogMeta || {};
        const sections = blogMeta.sections || [];

        let html = `<article>\n`;
        html += `<h1>${content.title || ''}</h1>\n`;
        if (blogMeta.subtitle) html += `<p class="subtitle">${blogMeta.subtitle}</p>\n`;
        if (blogMeta.heroImageUrl) html += `<img src="${blogMeta.heroImageUrl}" alt="${content.title}" class="hero-image" />\n`;

        for (const section of sections) {
            html += `\n<h2>${section.heading}</h2>\n`;
            // Convert markdown bold/italic to HTML
            let body = (section.body || '')
                .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.+?)\*/g, '<em>$1</em>')
                .replace(/^- (.+)$/gm, '<li>$1</li>')
                .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
                .replace(/\n\n/g, '</p>\n<p>')
                .replace(/^/, '<p>').replace(/$/, '</p>');
            html += body + '\n';
            if (section.imageUrl) {
                html += `<img src="${section.imageUrl}" alt="${section.heading}" class="section-image" />\n`;
            }
        }

        html += `</article>`;

        // Update content status
        content.status = 'published';
        content.publishedAt = new Date();
        content.blogMeta.publishUrl = 'clipboard'; // Will be updated if Shopify publish succeeds
        await content.save();

        res.json({
            success: true,
            html,
            blogMeta: {
                title: content.title,
                slug: blogMeta.slug,
                metaTitle: blogMeta.metaTitle,
                metaDescription: blogMeta.metaDescription,
                keywords: blogMeta.keywords,
            },
        });
    } catch (error) {
        console.error('Blog publish error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

export default router;

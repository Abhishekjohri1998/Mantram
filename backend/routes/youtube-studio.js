/**
 * YouTube Studio — Backend Route (All 4 Phases)
 * 
 * POST /api/youtube-studio/analyse           — Start full 8-node pipeline
 * GET  /api/youtube-studio/projects          — List all projects  ← MUST be before /:id
 * GET  /api/youtube-studio/:id              — Get single project
 * GET  /api/youtube-studio/:id/progress      — SSE real-time progress stream (Phase 4)
 * POST /api/youtube-studio/:id/thumbnail     — Regenerate AI thumbnail (Phase 3)
 * POST /api/youtube-studio/:id/characters    — Generate character portraits (Phase 2)
 * DELETE /api/youtube-studio/:id            — Delete project
 * 
 * IMPORTANT: Static paths (/analyse, /projects) MUST be registered before wildcard
 * paths (/:id, /:id/progress) to prevent Express matching /projects as /:id.
 */

import express from 'express';
import { protect } from '../middleware/auth.js';
import { loadBrandContext } from '../agents/shared/agentUtils.js';
import {
    transcriptNode, analysisNode, chapterNode,
    seoNode, brandCriticNode, thumbnailDirectionNode,
    thumbnailGenerationNode, characterPortraitNode,
    frameExtractionNode, promoNode,
} from '../agents/youtubeStudio/nodes.js';
import { extractVideoId } from '../agents/youtubeStudio/transcriptClient.js';
import YoutubeProject from '../models/YoutubeProject.js';

const router = express.Router();

// In-memory SSE registry: projectId → Set<res> (SSE client connections)
const sseClients = new Map();

function emitProgress(projectId, event) {
    const clients = sseClients.get(projectId);
    if (!clients?.size) return;
    const data = JSON.stringify(event);
    clients.forEach(res => {
        try { 
            res.write(`data: ${data}\n\n`); 
            if (typeof res.flush === 'function') res.flush();
        } catch { }
    });
}

// ── POST /analyse — Main 8-node pipeline ───────────────────────────────────
// STATIC: registered FIRST

router.post('/analyse', protect, async (req, res) => {
    const { urls, url, brandId, channelConfigId, showId } = req.body;
    const urlList = Array.isArray(urls) ? urls : (url ? [url] : []);

    if (!urlList.length) {
        return res.status(400).json({ success: false, error: 'Provide at least one YouTube URL' });
    }
    if (urlList.length > 10) {
        return res.status(400).json({ success: false, error: 'Maximum 10 URLs per request' });
    }

    // Validate all URLs upfront
    const videoIds = urlList.map(u => ({ url: u, id: extractVideoId(u) }));
    const invalid = videoIds.filter(v => !v.id);
    if (invalid.length) {
        return res.status(400).json({
            success: false,
            error: `Invalid YouTube URL(s): ${invalid.map(v => v.url).join(', ')}`,
        });
    }

    // Load brand context (Redis-cached via UPSTASH_REDIS_REST_URL)
    const { brandContext } = await loadBrandContext(brandId).catch(() => ({ brandContext: null }));

    // Create project records immediately so UI shows them
    const projects = await Promise.all(videoIds.map(async ({ url: videoUrl, id }) => {
        const project = new YoutubeProject({
            userId: req.user._id,
            brandId: brandId || null,
            channelConfigId: channelConfigId || null,
            showId: showId || null,
            videoId: id,
            videoUrl: `https://www.youtube.com/watch?v=${id}`,
            status: 'processing',
        });
        await project.save();
        return project;
    }));

    // Return immediately — pipeline runs async in background
    res.json({
        success: true,
        projects: projects.map(p => ({ _id: p._id, videoId: p.videoId, status: 'processing' })),
        message: `Analysis started for ${projects.length} video(s)`,
    });

    // Run pipeline async for each video
    for (let i = 0; i < videoIds.length; i++) {
        const { url: videoUrl, id } = videoIds[i];
        const project = projects[i];

        runPipeline({ videoUrl, videoId: id, brandContext, brandId, channelConfigId, showId, project }).catch(err => {
            console.error(`❌ YouTube pipeline crashed for ${id}:`, err.message);
            YoutubeProject.findByIdAndUpdate(project._id, {
                $set: { status: 'failed', error: err.message }
            }).catch(() => { });
        });
    }
});

// ── GET /projects — STATIC path, must be registered BEFORE /:id ─────────────

router.get('/projects', protect, async (req, res) => {
    try {
        const { brandId, limit = 20 } = req.query;
        const query = { userId: req.user._id };
        if (brandId) query.brandId = brandId;

        const projects = await YoutubeProject.find(query)
            .select('-transcript.fullText -transcript.segments')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .allowDiskUse(true)
            .lean();

        res.json({ success: true, projects });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── WILDCARD routes — registered AFTER all static paths ─────────────────────

// GET /:id — Get single project
router.get('/:id', protect, async (req, res) => {
    // Guard against Express matching static-looking IDs
    if (req.params.id === 'projects' || req.params.id === 'analyse' || req.params.id === 'settings') {
        return res.status(404).json({ success: false, error: 'Route not found' });
    }
    try {
        const project = await YoutubeProject.findOne({
            _id: req.params.id,
            userId: req.user._id,
        }).lean();

        if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
        res.json({ success: true, project });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /:id/progress — SSE real-time progress stream (Phase 4)
router.get('/:id/progress', protect, (req, res) => {
    const { id } = req.params;

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Register this client
    if (!sseClients.has(id)) sseClients.set(id, new Set());
    sseClients.get(id).add(res);

    // Send initial heartbeat
    res.write(`data: ${JSON.stringify({ type: 'connected', projectId: id })}\n\n`);
    if (typeof res.flush === 'function') res.flush();

    // Keepalive ping every 20s (prevents proxy timeout)
    const keepalive = setInterval(() => {
        try { 
            res.write(`: ping\n\n`); 
            if (typeof res.flush === 'function') res.flush();
        } catch { clearInterval(keepalive); }
    }, 20_000);

    // Cleanup on disconnect
    req.on('close', () => {
        clearInterval(keepalive);
        const clients = sseClients.get(id);
        if (clients) {
            clients.delete(res);
            if (!clients.size) sseClients.delete(id);
        }
    });
});

import YoutubeChannelConfig from '../models/YoutubeChannelConfig.js';
import ThumbnailTemplate from '../models/ThumbnailTemplate.js';

// ── Pipeline Runner (8 nodes, all phases) ─────────────────────────────────

async function runPipeline({ videoUrl, videoId, brandContext, brandId, channelConfigId, showId, project }) {
    const pid = project._id.toString();
    console.log(`🚀 [YouTube Pipeline] Starting 8-node pipeline for ${videoId}`);
    const startMs = Date.now();

    const emit = (node, status, data = {}) => emitProgress(pid, { type: 'node', node, status, ...data });

    try {
        // ── Node 1: Transcript + Metadata ──────────────────────────────────
        emit('transcript', 'running', { message: 'Fetching transcript & metadata…' });
        const { transcript, metadata, duration, youtubeUrl } = await transcriptNode({ videoId, videoUrl });
        await project.updateOne({ $set: { metadata, 'transcript.available': transcript.available, status: 'analysing' } });
        emit('transcript', 'done', { transcriptAvailable: transcript.available, title: metadata.title });
        console.log(`✅ [Node 1] Transcript: available=${transcript.available}, title="${metadata.title}"`);

        const video = { videoId, youtubeUrl, metadata, transcript, duration };

        // ── Nodes 2 & 3 in parallel: Analysis + Frame Extraction ───────────────
        emit('analysis',  'running', { message: 'Gemini 2.5 Pro watching the video…' });
        emit('frames',    'running', { message: 'Extracting key video frames…' });

        const [analysisRes, framesRes] = await Promise.all([
            analysisNode({ video, brandContext }),
            frameExtractionNode({ videoId }),
        ]);
        const { analysis } = analysisRes;
        const { extractedFrames } = framesRes;

        emit('analysis', 'done', { summary: analysis.summary?.substring(0, 100), characters: analysis.characters?.length });
        emit('frames',   'done', { count: extractedFrames.length });
        console.log(`✅ [Node 2] Analysis: ${analysis.contentType}, ${analysis.characters?.length} characters`);
        console.log(`✅ [Node 2b] Frames: ${extractedFrames.length} extracted`);

        // ── Node 3: Chapter Detection (AFTER analysis — uses highlights for alignment) ───
        emit('chapters', 'running', { message: 'Detecting smart chapters (analysis-grounded)…' });
        const { chapters } = await chapterNode({ video, analysis });
        emit('chapters', 'done', { count: chapters.length });
        console.log(`✅ [Node 3] Chapters: ${chapters.length} detected (analysis-grounded)`);

        // ── Nodes 4, 5 & Promo in parallel: SEO + Brand Critic + Promo Cuts ──────
        emit('seo',   'running', { message: 'Grok writing brand-aligned SEO copy…' });
        emit('brand', 'running', { message: 'Scoring brand alignment…' });
        emit('promo', 'running', { message: 'Building promo/teaser cut suggestions…' });

        const [seoRes, brandRes, promoRes] = await Promise.all([
            seoNode({ video, analysis, chapters, brandContext }),
            brandCriticNode({ video, analysis, brandContext }),
            promoNode({ analysis, video, brandContext }),
        ]);
        const { seo } = seoRes;
        const { brandAlignment } = brandRes;
        const { promoCuts } = promoRes;

        emit('seo',   'done', { recommendedTitle: seo?.recommendedTitle });
        emit('brand', 'done', { score: brandAlignment?.overallScore });
        emit('promo', 'done', { count: promoCuts?.length || 0 });
        console.log(`✅ [Node 4] SEO: title="${seo?.recommendedTitle}"`);
        console.log(`✅ [Node 5] Brand: score=${brandAlignment?.overallScore}`);
        console.log(`✅ [Node 5b] Promo: ${promoCuts?.length || 0} cuts`);

        // ── Node 6: Thumbnail Direction — Creative Director + Screen Grab Vision ─
        emit('thumbnailDirection', 'running', { message: 'Creative Director analyzing video frames (CTR strategy)…' });
        const { thumbnailDirection } = await thumbnailDirectionNode({
            video, analysis, seo, brandContext,
            extractedFrames,   // ✅ Real video frames → Creative Director sees actual content
        });
        emit('thumbnailDirection', 'done', {
            concept: thumbnailDirection?.concept?.substring(0, 80),
            ctrScore: thumbnailDirection?.ctrScoreEstimate,
        });
        console.log(`✅ [Node 6] Creative Director: CTR=${thumbnailDirection?.ctrScoreEstimate}% | "${thumbnailDirection?.ctrStrategy?.substring(0, 60)}"`);

        // ── Fetch Channel & Template Context ─────────────────────────────────────
        // Priority: (1) show-level templateId > (2) channel defaultTemplateId
        let template = null;
        let appliedShowName = null;
        if (channelConfigId) {
            try {
                const channel = await YoutubeChannelConfig.findById(channelConfigId)
                    .populate('shows.templateId', 'name icon visual classification generationPromptSuffix referenceImageUrl');

                // Try show-level template first
                if (showId && channel?.shows?.length) {
                    const show = channel.shows.find(s => s.showId === showId);
                    if (show?.templateId) {
                        template = show.templateId; // already populated
                        appliedShowName = show.showName;
                        console.log(`   🎬 [runPipeline] Show template resolved: "${show.showName}" → ${template.name}`);
                    }
                }

                // Fallback to channel default template
                if (!template && channel?.defaultTemplateId) {
                    template = await ThumbnailTemplate.findById(channel.defaultTemplateId);
                    console.log(`   🎨 [runPipeline] Channel default template: ${template?.name}`);
                }

                if (appliedShowName) project.appliedShowName = appliedShowName;
                if (template) project.appliedTemplateId = template._id;
            } catch (err) {
                console.warn(`⚠️ [runPipeline] Failed to load channel/template context: ${err.message}`);
            }
        }

        // ── Node 7: Character Portraits (Phase 2 — generated FIRST to anchor thumbnail) ──
        // Portraits must run before thumbnail generation so they can serve as face references
        emit('characters', 'running', { message: 'Generating AI character portraits (face reference for thumbnail)…' });
        const { characterPortraits } = await characterPortraitNode({ analysis, video, brandContext });
        emit('characters', 'done', { count: characterPortraits.filter(p => p.portraitUrl).length });
        console.log(`✅ [Node 7] Portraits: ${characterPortraits.filter(p => p.portraitUrl).length}/${analysis.characters?.length || 0}`);

        // ── Node 8: Thumbnail Generation (Phase 3 — uses portraits + extracted frames) ──
        emit('thumbnailGeneration', 'running', { message: 'Generating thumbnail with GPT Image 2 (HD)…' });
        const { generatedThumbnailUrl, thumbnailGenerationError, generatorModel } = await thumbnailGenerationNode({
            thumbnailDirection, video, brandContext, template,
            characterPortraits,   // ✅ Pass portraits so lead portrait is used as face anchor
            extractedFrames,      // ✅ YouTube CDN frames for visual grounding
        });
        emit('thumbnailGeneration', 'done', {
            success: !!generatedThumbnailUrl,
            model: generatorModel,
            error: thumbnailGenerationError,
        });
        console.log(`✅ [Node 8] Thumbnail via ${generatorModel || 'unknown'}: ${generatedThumbnailUrl ? 'generated' : `failed — ${thumbnailGenerationError}`}`);

        // ── Persist all results ────────────────────────────────────────────
        const elapsed = Math.round((Date.now() - startMs) / 1000);
        console.log(`\n🏁 [YouTube Pipeline] Complete for ${videoId} in ${elapsed}s`);

        await project.updateOne({
            $set: {
                status: 'done',
                metadata,
                duration,
                transcript: {
                    available: transcript.available,
                    language: transcript.language,
                    source: transcript.source,
                    segments: transcript.segments?.slice(0, 500) || [],
                    fullText: transcript.text?.substring(0, 50000) || '',
                },
                analysis,
                chapters,
                seo,
                brandAlignment,
                appliedTemplateId: project.appliedTemplateId,
                showId: showId || null,
                appliedShowName: project.appliedShowName || null,
                thumbnailDirection,
                generatedThumbnailUrl: generatedThumbnailUrl || null,
                generatorModel: generatorModel || null,
                characterPortraits,
                extractedFrames: extractedFrames || [],
                promoCuts: promoCuts || [],
                processingTimeSecs: elapsed,
                completedAt: new Date(),
            },
        });

        // Signal completion to all SSE listeners
        emitProgress(pid, { type: 'done', elapsed, videoId });

    } catch (err) {
        console.error(`❌ [YouTube Pipeline] Fatal error for ${videoId}:`, err);
        await project.updateOne({ $set: { status: 'failed', error: err.message } });
        emitProgress(pid, { type: 'error', error: err.message });
        throw err;
    }
}

router.post('/:id/thumbnail', protect, async (req, res) => {
    try {
        const project = await YoutubeProject.findOne({ _id: req.params.id, userId: req.user._id });
        if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
        if (!project.thumbnailDirection) {
            return res.status(400).json({ success: false, error: 'Run analysis first to get thumbnail direction' });
        }

        const { templateId, showId, customTextOverlay } = req.body;
        let template = null;
        let currentDirection = project.thumbnailDirection;

        // Apply any manual edits to the text overlay before generating
        if (customTextOverlay && currentDirection?.textOverlay) {
            if (customTextOverlay.line1 !== undefined) currentDirection.textOverlay.line1 = customTextOverlay.line1;
            if (customTextOverlay.line2 !== undefined) currentDirection.textOverlay.line2 = customTextOverlay.line2;
            await project.updateOne({ $set: { thumbnailDirection: currentDirection } });
        }

        // Priority: explicit templateId > showId from channel > project's stored template
        if (templateId) {
            template = await ThumbnailTemplate.findById(templateId);
            if (template) await project.updateOne({ $set: { appliedTemplateId: template._id } });
        } else if (showId && project.channelConfigId) {
            // Resolve via channel show
            const channel = await YoutubeChannelConfig.findById(project.channelConfigId)
                .populate('shows.templateId', 'name icon visual classification generationPromptSuffix referenceImageUrl');
            const show = channel?.shows?.find(s => s.showId === showId);
            if (show?.templateId) {
                template = show.templateId;
                await project.updateOne({ $set: { appliedTemplateId: template._id, showId, appliedShowName: show.showName } });
                console.log(`   🎬 [thumbnail regen] Show template: "${show.showName}" → ${template.name}`);
            }
        } else if (project.appliedTemplateId) {
            template = await ThumbnailTemplate.findById(project.appliedTemplateId);
        }

        const { brandContext } = await loadBrandContext(project.brandId?.toString()).catch(() => ({ brandContext: null }));

        const { generatedThumbnailUrl, thumbnailGenerationError } = await thumbnailGenerationNode({
            thumbnailDirection: currentDirection,
            video: {
                metadata: project.metadata,
                analysis:  project.analysis,   // characters, peakMoment, emotionalArc
            },
            brandContext,
            template,
            characterPortraits: project.characterPortraits || [],  // ✅ Use stored portraits as face anchors
            extractedFrames:    project.extractedFrames    || [],  // ✅ Use stored frames as visual ref
        });

        if (generatedThumbnailUrl) {
            await project.updateOne({ $set: { generatedThumbnailUrl } });
        }

        res.json({
            success: !!generatedThumbnailUrl,
            generatedThumbnailUrl,
            error: thumbnailGenerationError,
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── POST /:id/characters — Phase 2: Regenerate character portraits ──────────

router.post('/:id/characters', protect, async (req, res) => {
    try {
        const project = await YoutubeProject.findOne({ _id: req.params.id, userId: req.user._id });
        if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
        if (!project.analysis?.characters?.length) {
            return res.status(400).json({ success: false, error: 'No characters detected. Run analysis first.' });
        }

        const { brandContext } = await loadBrandContext(project.brandId?.toString()).catch(() => ({ brandContext: null }));

        const { characterPortraits } = await characterPortraitNode({
            analysis: project.analysis,
            video: { metadata: project.metadata },
            brandContext,
        });

        await project.updateOne({ $set: { characterPortraits } });
        res.json({ success: true, characterPortraits });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── PATCH /:id/title — Approve / edit the final title ───────────────────────
// titleMode: 'auto'   → use original YouTube metadata.title
// titleMode: 'manual' → use user's custom approvedTitle

router.patch('/:id/title', protect, async (req, res) => {
    try {
        const { titleMode, approvedTitle } = req.body;
        if (!['auto', 'manual'].includes(titleMode)) {
            return res.status(400).json({ success: false, error: 'titleMode must be auto or manual' });
        }

        const project = await YoutubeProject.findOne({ _id: req.params.id, userId: req.user._id });
        if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

        project.titleMode = titleMode;
        if (titleMode === 'manual' && approvedTitle) {
            project.approvedTitle = approvedTitle.trim();
        } else if (titleMode === 'auto') {
            project.approvedTitle = project.metadata?.title || null; // Original YouTube title
        }
        await project.save();

        res.json({
            success: true,
            titleMode: project.titleMode,
            approvedTitle: project.approvedTitle,
            finalTitle: project.titleMode === 'auto'
                ? (project.metadata?.title || project.approvedTitle)
                : project.approvedTitle,
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── DELETE /:id ─────────────────────────────────────────────────────────────

router.delete('/:id', protect, async (req, res) => {
    try {
        await YoutubeProject.deleteOne({ _id: req.params.id, userId: req.user._id });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;


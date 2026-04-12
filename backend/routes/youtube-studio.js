/**
 * YouTube Studio — Backend Route (All 4 Phases)
 * 
 * POST /api/youtube-studio/analyse           — Start full 8-node pipeline
 * GET  /api/youtube-studio/:id/progress      — SSE real-time progress stream (Phase 4)
 * GET  /api/youtube-studio/projects          — List all projects
 * GET  /api/youtube-studio/:id              — Get single project
 * POST /api/youtube-studio/:id/thumbnail     — Regenerate AI thumbnail (Phase 3)
 * POST /api/youtube-studio/:id/characters    — Generate character portraits (Phase 2)
 * DELETE /api/youtube-studio/:id            — Delete project
 */

import express from 'express';
import { protect } from '../middleware/auth.js';
import { loadBrandContext } from '../agents/shared/agentUtils.js';
import {
    transcriptNode, analysisNode, chapterNode,
    seoNode, brandCriticNode, thumbnailDirectionNode,
    thumbnailGenerationNode, characterPortraitNode,
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
        try { res.write(`data: ${data}\n\n`); } catch { }
    });
}

// ── POST /analyse — Main 8-node pipeline ───────────────────────────────────

router.post('/analyse', protect, async (req, res) => {
    const { urls, url, brandId } = req.body;
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

    // Load brand context (Redis-cached)
    const { brandContext } = await loadBrandContext(brandId).catch(() => ({ brandContext: null }));

    // Create project records immediately so UI shows them right away
    const projects = await Promise.all(videoIds.map(async ({ url: videoUrl, id }) => {
        const project = new YoutubeProject({
            userId: req.user._id,
            brandId: brandId || null,
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

        runPipeline({ videoUrl, videoId: id, brandContext, brandId, project }).catch(err => {
            console.error(`❌ YouTube pipeline crashed for ${id}:`, err.message);
            YoutubeProject.findByIdAndUpdate(project._id, {
                $set: { status: 'failed', error: err.message }
            }).catch(() => { });
        });
    }
});

// ── SSE: GET /:id/progress — Phase 4 real-time progress streaming ───────────

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

    // Cleanup on disconnect
    req.on('close', () => {
        const clients = sseClients.get(id);
        if (clients) {
            clients.delete(res);
            if (!clients.size) sseClients.delete(id);
        }
    });
});

// ── Pipeline Runner (8 nodes) ──────────────────────────────────────────────

async function runPipeline({ videoUrl, videoId, brandContext, brandId, project }) {
    const pid = project._id.toString();
    console.log(`🚀 YouTube pipeline starting for ${videoId} (8 nodes)`);
    const startMs = Date.now();

    const emit = (node, status, data = {}) => emitProgress(pid, { type: 'node', node, status, ...data });

    try {
        // ── Node 1: Transcript + Metadata ──────────────────────────────────
        emit('transcript', 'running', { message: 'Fetching transcript & metadata…' });
        const { transcript, metadata, duration, youtubeUrl } = await transcriptNode({ videoId, videoUrl });
        await project.updateOne({ $set: { metadata, 'transcript.available': transcript.available, status: 'analysing' } });
        emit('transcript', 'done', { transcriptAvailable: transcript.available, title: metadata.title });

        const video = { videoId, youtubeUrl, metadata, transcript, duration };

        // ── Nodes 2 & 3 in parallel: Analysis + Chapters ──────────────────
        emit('analysis', 'running', { message: 'Gemini is watching the video…' });
        emit('chapters', 'running', { message: 'Detecting chapters…' });

        const [{ analysis }, { chapters }] = await Promise.all([
            analysisNode({ video, brandContext }),
            chapterNode({ video }),
        ]);
        emit('analysis', 'done', { summary: analysis.summary?.substring(0, 100) });
        emit('chapters', 'done', { count: chapters.length });

        // ── Nodes 4 & 5 in parallel: SEO + Brand Critic ───────────────────
        emit('seo', 'running', { message: 'Writing brand-aligned SEO copy…' });
        emit('brand', 'running', { message: 'Scoring brand alignment…' });

        const [{ seo }, { brandAlignment }] = await Promise.all([
            seoNode({ video, analysis, chapters, brandContext }),
            brandCriticNode({ video, analysis, brandContext }),
        ]);
        emit('seo', 'done', { recommendedTitle: seo?.recommendedTitle });
        emit('brand', 'done', { score: brandAlignment?.overallScore });

        // ── Node 6: Thumbnail Direction ────────────────────────────────────
        emit('thumbnailDirection', 'running', { message: 'Creating thumbnail concept…' });
        const { thumbnailDirection } = await thumbnailDirectionNode({ video, analysis, seo, brandContext });
        emit('thumbnailDirection', 'done', { concept: thumbnailDirection?.concept?.substring(0, 80) });

        // ── Node 7: Thumbnail Generation (Phase 3 — FLUX Pro) ─────────────
        emit('thumbnailGeneration', 'running', { message: 'Generating thumbnail with NanoBanana 2 (multimodal)…' });
        const { generatedThumbnailUrl, thumbnailGenerationError } = await thumbnailGenerationNode({
            thumbnailDirection, video, brandContext
        });
        emit('thumbnailGeneration', 'done', {
            success: !!generatedThumbnailUrl,
            error: thumbnailGenerationError,
        });

        // ── Node 8: Character Portraits (Phase 2) ──────────────────────────
        emit('characters', 'running', { message: 'Generating character portraits…' });
        const { characterPortraits } = await characterPortraitNode({ analysis, video, brandContext });
        emit('characters', 'done', { count: characterPortraits.length });

        // ── Save all results ───────────────────────────────────────────────
        const elapsed = Math.round((Date.now() - startMs) / 1000);
        console.log(`✅ YouTube pipeline complete for ${videoId} in ${elapsed}s`);

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
                thumbnailDirection,
                generatedThumbnailUrl: generatedThumbnailUrl || null,
                characterPortraits,
                processingTimeSecs: elapsed,
                completedAt: new Date(),
            },
        });

        // Signal completion to all SSE listeners
        emitProgress(pid, { type: 'done', elapsed, videoId });

    } catch (err) {
        console.error(`❌ YouTube pipeline error for ${videoId}:`, err);
        await project.updateOne({ $set: { status: 'failed', error: err.message } });
        emitProgress(pid, { type: 'error', error: err.message });
        throw err;
    }
}

// ── GET /projects ───────────────────────────────────────────────────────────

router.get('/projects', protect, async (req, res) => {
    try {
        const { brandId, limit = 20 } = req.query;
        const query = { userId: req.user._id };
        if (brandId) query.brandId = brandId;

        const projects = await YoutubeProject.find(query)
            .select('-transcript.fullText -transcript.segments')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .lean();

        res.json({ success: true, projects });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── GET /:id ────────────────────────────────────────────────────────────────

router.get('/:id', protect, async (req, res) => {
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

// ── POST /:id/thumbnail — Phase 3: Regenerate thumbnail ────────────────────

router.post('/:id/thumbnail', protect, async (req, res) => {
    try {
        const project = await YoutubeProject.findOne({ _id: req.params.id, userId: req.user._id });
        if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
        if (!project.thumbnailDirection) return res.status(400).json({ success: false, error: 'Run analysis first to get thumbnail direction' });

        const { brandContext } = await loadBrandContext(project.brandId?.toString()).catch(() => ({ brandContext: null }));

        const { generatedThumbnailUrl, thumbnailGenerationError } = await thumbnailGenerationNode({
            thumbnailDirection: project.thumbnailDirection,
            video: { metadata: project.metadata },
            brandContext,
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

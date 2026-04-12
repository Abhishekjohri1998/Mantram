/**
 * YouTube Studio — Backend Route
 * 
 * POST /api/youtube-studio/analyse       — Analyse single/bulk YouTube URLs
 * GET  /api/youtube-studio/projects      — List all analysis projects
 * GET  /api/youtube-studio/:id           — Get single project
 * POST /api/youtube-studio/:id/thumbnail — Generate AI thumbnail
 */

import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { loadBrandContext } from '../agents/shared/agentUtils.js';
import {
    transcriptNode, analysisNode, chapterNode,
    seoNode, brandCriticNode, thumbnailDirectionNode,
} from '../agents/youtubeStudio/nodes.js';
import { extractVideoId } from '../agents/youtubeStudio/transcriptClient.js';
import YoutubeProject from '../models/YoutubeProject.js';

const router = express.Router();

// ── POST /analyse — Main pipeline ──────────────────────────────────────────

router.post('/analyse', authenticateToken, async (req, res) => {
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
            error: `Invalid YouTube URL(s): ${invalid.map(v => v.url).join(', ')}`
        });
    }

    // Load brand context
    const { brandContext } = await loadBrandContext(brandId).catch(() => ({ brandContext: null }));

    // Create project records immediately so user sees them in the UI
    const projects = await Promise.all(videoIds.map(async ({ url: videoUrl, id }) => {
        const project = new YoutubeProject({
            userId: req.user.id,
            brandId: brandId || null,
            videoId: id,
            videoUrl: `https://www.youtube.com/watch?v=${id}`,
            status: 'processing',
        });
        await project.save();
        return project;
    }));

    // Return immediately — let the pipeline run async & update the DB
    res.json({
        success: true,
        projects: projects.map(p => ({ _id: p._id, videoId: p.videoId, status: 'processing' })),
        message: `Analysis started for ${projects.length} video(s)`,
    });

    // Run pipeline async for all videos
    for (let i = 0; i < videoIds.length; i++) {
        const { url: videoUrl, id } = videoIds[i];
        const project = projects[i];

        runPipeline({ videoUrl, videoId: id, brandContext, brandId, project }).catch(err => {
            console.error(`❌ YouTube pipeline failed for ${id}:`, err.message);
            YoutubeProject.findByIdAndUpdate(project._id, { status: 'failed', error: err.message }).catch(() => {});
        });
    }
});

// ── Pipeline Runner ────────────────────────────────────────────────────────

async function runPipeline({ videoUrl, videoId, brandContext, brandId, project }) {
    console.log(`🚀 YouTube pipeline starting for ${videoId}`);
    const startMs = Date.now();

    try {
        // Node 1: Transcript + Metadata
        const { transcript, metadata, duration, youtubeUrl } = await transcriptNode({ videoId, videoUrl });
        await project.updateOne({ $set: { 'metadata': metadata, 'transcript.available': transcript.available, status: 'analysing' } });

        const video = { videoId, youtubeUrl, metadata, transcript, duration };

        // Nodes 2, 3 in parallel (analysis + chapters don't depend on each other)
        const [{ analysis }, { chapters }] = await Promise.all([
            analysisNode({ video, brandContext }),
            chapterNode({ video }),
        ]);

        // Node 4, 5 in parallel
        const [{ seo }, { brandAlignment }] = await Promise.all([
            seoNode({ video, analysis, chapters, brandContext }),
            brandCriticNode({ video, analysis, brandContext }),
        ]);

        // Node 6: Thumbnail direction
        const { thumbnailDirection } = await thumbnailDirectionNode({ video, analysis, seo, brandContext });

        const elapsed = Math.round((Date.now() - startMs) / 1000);
        console.log(`✅ YouTube pipeline complete for ${videoId} in ${elapsed}s`);

        await project.updateOne({
            $set: {
                status: 'done',
                'metadata': metadata,
                duration,
                transcript: {
                    available: transcript.available,
                    language: transcript.language,
                    source: transcript.source,
                    segments: transcript.segments?.slice(0, 500) || [], // Save first 500 segments
                    fullText: transcript.text?.substring(0, 50000) || '',
                },
                analysis,
                chapters,
                seo,
                brandAlignment,
                thumbnailDirection,
                processingTimeSecs: elapsed,
                completedAt: new Date(),
            }
        });

    } catch (err) {
        console.error(`❌ YouTube pipeline error for ${videoId}:`, err);
        await project.updateOne({ $set: { status: 'failed', error: err.message } });
        throw err;
    }
}

// ── GET /projects ──────────────────────────────────────────────────────────

router.get('/projects', authenticateToken, async (req, res) => {
    try {
        const { brandId, limit = 20 } = req.query;
        const query = { userId: req.user.id };
        if (brandId) query.brandId = brandId;

        const projects = await YoutubeProject.find(query)
            .select('-transcript.fullText -transcript.segments') // Exclude large fields from list
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .lean();

        res.json({ success: true, projects });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── GET /:id ───────────────────────────────────────────────────────────────

router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const project = await YoutubeProject.findOne({
            _id: req.params.id,
            userId: req.user.id,
        }).lean();

        if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
        res.json({ success: true, project });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── POST /:id/thumbnail — Generate AI thumbnail ────────────────────────────

router.post('/:id/thumbnail', authenticateToken, async (req, res) => {
    try {
        const project = await YoutubeProject.findOne({ _id: req.params.id, userId: req.user.id });
        if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
        if (!project.thumbnailDirection) return res.status(400).json({ success: false, error: 'Run analysis first' });

        // TODO Phase 3: FLUX + IP-Adapter thumbnail generation
        // For now return the direction so frontend can preview
        res.json({ success: true, thumbnailDirection: project.thumbnailDirection, status: 'direction-ready' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── DELETE /:id ────────────────────────────────────────────────────────────

router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        await YoutubeProject.deleteOne({ _id: req.params.id, userId: req.user.id });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;

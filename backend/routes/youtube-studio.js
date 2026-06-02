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
import Cast from '../models/Cast.js';
import multer from 'multer';
import crypto from 'crypto';
import { uploadToS3 } from '../utils/s3.js';

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

// ── POST /upload — Direct Video File Upload ───────────────────────────────
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit for direct video analysis uploads
    fileFilter: (req, file, cb) => {
        const allowed = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska'];
        if (allowed.includes(file.mimetype) || file.originalname.match(/\.(mp4|mov|webm|mkv)$/i)) cb(null, true);
        else cb(new Error('Invalid file type. Only video files (mp4, mov, webm, mkv) are allowed.'));
    }
});

router.post('/upload', protect, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });

        const { buffer, mimetype, originalname } = req.file;
        const ext = originalname.split('.').pop()?.toLowerCase() || 'mp4';
        const safeExt = ['mp4','mov','webm','mkv'].includes(ext) ? ext : 'mp4';
        const key = `youtube-studio-uploads/${req.user._id}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${safeExt}`;

        console.log(`📤 [youtube-studio-upload] Uploading ${Math.round(buffer.length / 1024 / 1024)}MB → ${key}`);
        const s3Url = await uploadToS3(buffer, key, mimetype);
        console.log(`✅ [youtube-studio-upload] Uploaded: ${s3Url}`);

        res.json({ success: true, url: s3Url, originalname });
    } catch (error) {
        console.error('YouTube Studio video upload error:', error);
        res.status(500).json({ success: false, error: `Upload failed: ${error.message}` });
    }
});

// ── POST /analyse — Main 8-node pipeline ───────────────────────────────────
// STATIC: registered FIRST

router.post('/analyse', protect, async (req, res) => {
    const { urls, url, brandId, channelConfigId, showId, requestedFeatures } = req.body;
    const urlList = Array.isArray(urls) ? urls : (url ? [url] : []);

    const features = Array.isArray(requestedFeatures) ? requestedFeatures : ['thumbnail', 'synopsis', 'seo', 'transcript', 'chapters', 'promo', 'brandCritic'];

    if (!urlList.length) {
        return res.status(400).json({ success: false, error: 'Provide at least one YouTube URL or uploaded video URL' });
    }
    if (urlList.length > 10) {
        return res.status(400).json({ success: false, error: 'Maximum 10 URLs per request' });
    }

    // Validate all URLs upfront
    const videoIds = urlList.map(u => {
        const isYT = u.includes('youtube.com') || u.includes('youtu.be');
        const id = isYT ? extractVideoId(u) : `upload-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
        return { url: u, id, isYT };
    });

    const invalid = videoIds.filter(v => v.isYT && !v.id);
    if (invalid.length) {
        return res.status(400).json({
            success: false,
            error: `Invalid YouTube URL(s): ${invalid.map(v => v.url).join(', ')}`,
        });
    }

    // Load brand context (Redis-cached via UPSTASH_REDIS_REST_URL)
    const { brandContext } = await loadBrandContext(brandId).catch(() => ({ brandContext: null }));

    // Create project records immediately so UI shows them
    const projects = await Promise.all(videoIds.map(async ({ url: videoUrl, id, isYT }) => {
        const project = new YoutubeProject({
            userId: req.user._id,
            brandId: brandId || null,
            channelConfigId: channelConfigId || null,
            showId: showId || null,
            videoId: id,
            videoUrl: videoUrl,
            requestedFeatures: features,
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
        const { url: videoUrl, id, isYT } = videoIds[i];
        const project = projects[i];

        runPipeline({ videoUrl, videoId: id, isYT, brandContext, brandId, channelConfigId, showId, project }).catch(err => {
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

    // Keepalive ping every 20s (prevents proxy timeout)
    const keepalive = setInterval(() => {
        try { res.write(`: ping\n\n`); } catch { clearInterval(keepalive); }
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

async function runPipeline({ videoUrl, videoId, isYT = true, brandContext, brandId, channelConfigId, showId, project }) {
    const pid = project._id.toString();
    console.log(`🚀 [YouTube Pipeline] Starting selective pipeline for ${videoId} (isYT: ${isYT})`);
    const startMs = Date.now();

    const emit = (node, status, data = {}) => emitProgress(pid, { type: 'node', node, status, ...data });

    try {
        const requestedFeatures = project.requestedFeatures || ['thumbnail', 'synopsis', 'seo', 'transcript', 'chapters', 'promo', 'brandCritic'];
        const hasFeature = (f) => requestedFeatures.includes(f);

        // Load channel config first for settings and templates
        let channel = null;
        let template = null;
        let appliedShowName = null;
        if (channelConfigId) {
            try {
                channel = await YoutubeChannelConfig.findById(channelConfigId)
                    .populate('shows.templateId', 'name icon visual classification generationPromptSuffix referenceImageUrl');

                if (channel) {
                    // Try show-level template first
                    if (showId && channel.shows?.length) {
                        const show = channel.shows.find(s => s.showId === showId);
                        if (show?.templateId) {
                            template = show.templateId;
                            appliedShowName = show.showName;
                            console.log(`   🎬 [runPipeline] Show template: "${show.showName}" → ${template.name}`);
                        }
                    }
                    // Fallback to channel default template
                    if (!template && channel.defaultTemplateId) {
                        template = await ThumbnailTemplate.findById(channel.defaultTemplateId);
                        console.log(`   🎨 [runPipeline] Channel default template: ${template?.name}`);
                    }
                    if (appliedShowName) project.appliedShowName = appliedShowName;
                    if (template) project.appliedTemplateId = template._id;
                }
            } catch (err) {
                console.warn(`⚠️ [runPipeline] Failed to load channel config: ${err.message}`);
            }
        }

        const writingStyleAnalysis = channel?.writingStyleAnalysis || null;

        // Load known casts for auto-mapping
        let knownCasts = [];
        if (brandId) {
            try {
                knownCasts = await Cast.find({ brandId, userId: project.userId }).select('name description role imageUrl').lean();
            } catch (err) {
                console.warn(`⚠️ [runPipeline] Failed to load Cast Bank: ${err.message}`);
            }
        }

        // ── Node 1: Transcript + Metadata (always runs to get basic metadata) ──
        emit('transcript', 'running', { message: 'Fetching transcript & metadata…' });
        const { transcript, metadata, duration } = await transcriptNode({ videoId, videoUrl, isYT });
        await project.updateOne({ $set: { metadata, 'transcript.available': transcript.available, status: 'analysing' } });
        emit('transcript', 'done', { transcriptAvailable: transcript.available, title: metadata.title });
        console.log(`✅ [Node 1] Metadata fetched: title="${metadata.title}"`);

        const video = { videoId, youtubeUrl: videoUrl, metadata, transcript, duration };

        // ── Stage 2: Analysis & Frame Extraction (conditional) ──
        const needAnalysis = hasFeature('synopsis') || hasFeature('thumbnail') || hasFeature('seo') || hasFeature('chapters') || hasFeature('promo') || hasFeature('brandCritic');
        const needFrames = hasFeature('thumbnail');

        let analysis = {};
        let extractedFrames = [];
        const tasks = [];
        let analysisIdx = -1;
        let framesIdx = -1;

        if (needAnalysis) {
            emit('analysis',  'running', { message: 'Gemini 2.5 Pro watching the video…' });
            analysisIdx = tasks.length;
            tasks.push(analysisNode({ video, brandContext, knownCasts, writingStyleAnalysis }));
        } else {
            emit('analysis', 'done', { message: 'Skipped' });
        }

        if (needFrames) {
            emit('frames',    'running', { message: 'Extracting key video frames…' });
            framesIdx = tasks.length;
            tasks.push(frameExtractionNode({ videoId, videoUrl, isYT }));
        } else {
            emit('frames', 'done', { message: 'Skipped' });
        }

        if (tasks.length > 0) {
            const results = await Promise.all(tasks);
            if (analysisIdx !== -1) {
                analysis = results[analysisIdx].analysis;
                emit('analysis', 'done', { summary: analysis.summary?.substring(0, 100), characters: analysis.characters?.length });
                console.log(`✅ [Node 2] Analysis done: ${analysis.contentType}, ${analysis.characters?.length || 0} characters`);
            }
            if (framesIdx !== -1) {
                extractedFrames = results[framesIdx].extractedFrames;
                emit('frames', 'done', { count: extractedFrames.length });
                console.log(`✅ [Node 2b] Frames: ${extractedFrames.length} extracted`);
            }
        }

        // ── Stage 3: Chapter Detection (conditional) ──
        let chapters = [];
        if (hasFeature('chapters') && transcript.available) {
            emit('chapters', 'running', { message: 'Detecting smart chapters (analysis-grounded)…' });
            const chapRes = await chapterNode({ video, analysis });
            chapters = chapRes.chapters;
            emit('chapters', 'done', { count: chapters.length });
            console.log(`✅ [Node 3] Chapters: ${chapters.length} detected`);
        } else {
            emit('chapters', 'done', { message: 'Skipped' });
        }

        // ── Stage 4: SEO, Brand alignment, and Promo Cuts (conditional) ──
        const nextTasks = [];
        let seoIdx = -1;
        let brandIdx = -1;
        let promoIdx = -1;

        if (hasFeature('seo')) {
            emit('seo',   'running', { message: 'Grok writing brand-aligned SEO copy…' });
            seoIdx = nextTasks.length;
            nextTasks.push(seoNode({ video, analysis, chapters, brandContext, writingStyleAnalysis }));
        } else {
            emit('seo', 'done', { message: 'Skipped' });
        }

        if (hasFeature('brandCritic') && brandContext && !brandContext.includes('No brand data')) {
            emit('brand', 'running', { message: 'Scoring brand alignment…' });
            brandIdx = nextTasks.length;
            nextTasks.push(brandCriticNode({ video, analysis, brandContext }));
        } else {
            emit('brand', 'done', { message: 'Skipped' });
        }

        if (hasFeature('promo')) {
            emit('promo', 'running', { message: 'Building promo/teaser cut suggestions…' });
            promoIdx = nextTasks.length;
            nextTasks.push(promoNode({ analysis, video, brandContext }));
        } else {
            emit('promo', 'done', { message: 'Skipped' });
        }

        let seo = null;
        let brandAlignment = null;
        let promoCuts = [];

        if (nextTasks.length > 0) {
            const nextResults = await Promise.all(nextTasks);
            if (seoIdx !== -1) {
                seo = nextResults[seoIdx].seo;
                emit('seo', 'done', { recommendedTitle: seo?.recommendedTitle });
                console.log(`✅ [Node 4] SEO generated`);
            }
            if (brandIdx !== -1) {
                brandAlignment = nextResults[brandIdx].brandAlignment;
                emit('brand', 'done', { score: brandAlignment?.overallScore });
                console.log(`✅ [Node 5] Brand align score: ${brandAlignment?.overallScore}`);
            }
            if (promoIdx !== -1) {
                promoCuts = nextResults[promoIdx].promoCuts;
                emit('promo', 'done', { count: promoCuts?.length || 0 });
                console.log(`✅ [Node 5b] Promo cuts: ${promoCuts?.length || 0} cuts`);
            }
        }

        // ── Stage 5: Thumbnail Generation (conditional) ──
        let thumbnailDirection = null;
        let characterPortraits = [];
        let generatedThumbnailUrl = null;
        let generatorModel = null;

        if (hasFeature('thumbnail')) {
            // Creative Director CTR strategy
            emit('thumbnailDirection', 'running', { message: 'Creative Director analyzing video frames (CTR strategy)…' });
            const dirRes = await thumbnailDirectionNode({
                video, analysis, seo, brandContext,
                extractedFrames,
            });
            thumbnailDirection = dirRes.thumbnailDirection;
            emit('thumbnailDirection', 'done', {
                concept: thumbnailDirection?.concept?.substring(0, 80),
                ctrScore: thumbnailDirection?.ctrScoreEstimate,
            });
            console.log(`✅ [Node 6] Creative Direction CTR: ${thumbnailDirection?.ctrScoreEstimate}%`);

            // Character portraits
            emit('characters', 'running', { message: 'Generating AI character portraits (face reference for thumbnail)…' });
            const portRes = await characterPortraitNode({ analysis, video, brandContext });
            characterPortraits = portRes.characterPortraits;
            emit('characters', 'done', { count: characterPortraits.filter(p => p.portraitUrl).length });
            console.log(`✅ [Node 7] Character portraits mapped: ${characterPortraits.length}`);

            // Final Thumbnail generation
            emit('thumbnailGeneration', 'running', { message: 'Generating thumbnail with GPT Image 2 (HD)…' });
            const genRes = await thumbnailGenerationNode({
                thumbnailDirection, video, brandContext, template,
                characterPortraits,
                extractedFrames,
            });
            generatedThumbnailUrl = genRes.generatedThumbnailUrl;
            generatorModel = genRes.generatorModel;
            emit('thumbnailGeneration', 'done', {
                success: !!generatedThumbnailUrl,
                model: generatorModel,
                error: genRes.thumbnailGenerationError,
            });
            console.log(`✅ [Node 8] Thumbnail: ${generatedThumbnailUrl ? 'success' : 'failed'}`);
        } else {
            emit('thumbnailDirection', 'done', { message: 'Skipped' });
            emit('characters', 'done', { message: 'Skipped' });
            emit('thumbnailGeneration', 'done', { message: 'Skipped' });
        }

        // ── Auto-save new characters to Cast Bank (Casting Bay) ──
        if (analysis.characters?.length && brandId) {
            try {
                await saveCharactersToCastingBay(project.userId, brandId, analysis.characters, characterPortraits);
            } catch (castErr) {
                console.error('⚠️ Failed to save characters to Casting Bay:', castErr.message);
            }
        }

        // ── Persist results to DB ──
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
                    segments: hasFeature('transcript') ? (transcript.segments?.slice(0, 500) || []) : [],
                    fullText: hasFeature('transcript') ? (transcript.text?.substring(0, 50000) || '') : '',
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

        emitProgress(pid, { type: 'done', elapsed, videoId });

    } catch (err) {
        console.error(`❌ [YouTube Pipeline] Fatal error for ${videoId}:`, err);
        await project.updateOne({ $set: { status: 'failed', error: err.message } });
        emitProgress(pid, { type: 'error', error: err.message });
        throw err;
    }
}

// ── Auto-save characters helper ──
async function saveCharactersToCastingBay(userId, brandId, characters, portraits = []) {
    if (!brandId) return;
    for (const char of characters) {
        const name = char.label?.trim();
        if (!name) continue;
        const exists = await Cast.findOne({
            brandId,
            name: { $regex: new RegExp(`^${name}$`, 'i') }
        });
        if (!exists) {
            const portrait = portraits.find(p => p.label === char.label && p.portraitUrl);
            const imageUrl = portrait?.portraitUrl || char.imageUrl || '';

            await Cast.create({
                userId,
                brandId,
                name,
                description: char.visualDescription || '',
                role: char.role || '',
                imageUrl
            });
            console.log(`👤 [Casting Bay] Auto-saved new character to Cast Bank: "${name}"`);
        }
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


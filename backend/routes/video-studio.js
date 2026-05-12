/**
 * Video Studio API Routes
 * 
 * Endpoints:
 *   POST   /api/video-studio/start          — Create project + run brainstorm
 *   POST   /api/video-studio/:id/select     — Pick concept → run script director
 *   POST   /api/video-studio/:id/approve    — Approve script → run references + routing
 *   POST   /api/video-studio/:id/generate   — Confirm cost → trigger fal.ai
 *   GET    /api/video-studio/:id/status      — Poll generation progress
 *   POST   /api/video-studio/:id/edit        — Edit prompt → re-generate
 *   POST   /api/video-studio/:id/finalize    — Accept final → save learnings
 *   GET    /api/video-studio                 — List user's projects
 *   GET    /api/video-studio/models          — Get supported models info
 *   DELETE /api/video-studio/:id             — Delete a project
 */

import { Router } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { s3Client, getSignedUrlForPath } from '../utils/s3.js';
import VideoProject from '../models/VideoProject.js';
import ClonedVoice from '../models/ClonedVoice.js';
import Avatar from '../models/Avatar.js';
import Brand from '../models/Brand.js';
import { protect } from '../middleware/auth.js';
import { requireCredits, refundCredits } from '../middleware/credits.js';
import { runStep, advanceWithApproval, getPipelineInfo } from '../agents/videoStudio/engine.js';
import {
    brainstormNode,
    scriptDirectorNode,
    referenceCuratorNode,
    modelRouterNode,
    videoGeneratorNode,
    pollGenerationStatus,
    criticNode,
    editorNode,
    enhancePromptNode,
    durationPlannerNode,
    advancedGenerateNode,
    videoVisualGroundingNode,
    ugcProductGroundingNode,
    ugcAvatarNode,
    ugcPromptBuilderNode,
} from '../agents/videoStudio/nodes.js';
import { estimateCost, getModelsInfo, MODEL_CAPABILITIES, submitVideoGeneration } from '../agents/videoStudio/falClient.js';
import { submitAtlasCloudImageToVideo, submitAtlasCloudVideoExtend } from '../agents/videoStudio/atlasClient.js';
import { listAvatars, listVoices, generateUGCVideo, generatePhotoAvatarVideo, getHeyGenVideoStatus, generateVideoWithAudio, uploadAssetToHeyGen, createPhotoAvatar, getPhotoAvatarStatus, checkPhotoGenStatus, generateVideoAgent, generatePlacementPoses, generatePlacementVideo, registerWebhook, generateLooks, addMotion, listAvatarGroups, listAvatarLooks } from '../agents/videoStudio/heygenClient.js';
import { generateUGCScript, UGC_STYLES } from '../agents/videoStudio/ugcScriptGenerator.js';
import { saveLearnings, getStylePreferences } from '../agents/videoStudio/selfLearning.js';
import { getRouter as getAIRouter } from '../ai/router.js';
import { getProviderBadge } from '../ai/providerRouting.js';
import { uploadToS3, mirrorUrlToS3, getSignedUrlIfNeeded, ensureS3Url } from '../utils/s3.js';
import { safeErrorMessage } from '../utils/safeError.js';
import { loadBrandContext, callMultimodalAgent, callAgent } from '../agents/shared/agentUtils.js';
import { buildEnhanceSystemPrompt, buildEnhanceUserPrompt, VISUAL_GROUNDING_SYSTEM } from '../agents/videoStudio/promptEnhancer.js';
import { submitAtlasCloudVideoGeneration, getAtlasCloudGenerationStatus as pollAtlasCloudStatus } from '../agents/videoStudio/atlasClient.js';
import { geminiImageGenerate } from '../agents/videoStudio/firstFrame.js';
import { falGenerateImage } from '../agents/youtubeStudio/nodes.js';
import { Q_ADS_CATEGORIES, getCategory, buildQAdPrompt, getQAdsCreditCost } from '../agents/videoStudio/qAdsCategories.js';
import { getPresets } from '../utils/qAdsCache.js';
import { runQAdsAgent } from '../agents/videoStudio/qAdsAgent.js';
import { isFashionCategory, resolveImageRole } from '../agents/videoStudio/promptSanitizer.js';
import { buildVideoHash } from '../utils/videoHash.js';
import { checkPromptSafety } from '../utils/promptSafety.js';
import redis from '../utils/redisClient.js';

const router = Router();

// ── Cost Optimization: Dedup Cache Guard ─────────────────────────────────────
/**
 * Checks if an identical generation already completed (within 72h).
 * Returns the cached VideoProject document or null.
 */
async function findCachedGeneration(hash) {
    if (!hash) return null;
    return VideoProject.findOne({
        contentHash: hash,
        status: { $in: ['completed', 'done'] },
        'generation.s3VideoUrl': { $exists: true, $ne: '' },
        createdAt: { $gte: new Date(Date.now() - 72 * 60 * 60 * 1000) }
    }).lean();
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Recursively signs all S3 URLs in a VideoProject object or array.
 */
async function signVideoProjectAssets(data) {
    if (!data) return data;
    if (Array.isArray(data)) {
        return Promise.all(data.map(item => signVideoProjectAssets(item)));
    }

    const project = typeof data.toObject === 'function' ? data.toObject() : { ...data };

    // Sign top-level URLs
    if (project.finalVideoUrl) project.finalVideoUrl = await getSignedUrlIfNeeded(project.finalVideoUrl);
    if (project.firstFrameUrl) project.firstFrameUrl = await getSignedUrlIfNeeded(project.firstFrameUrl);

    // Sign generation object
    if (project.generation) {
        if (project.generation.videoUrl) project.generation.videoUrl = await getSignedUrlIfNeeded(project.generation.videoUrl);
        if (project.generation.s3VideoUrl) project.generation.s3VideoUrl = await getSignedUrlIfNeeded(project.generation.s3VideoUrl);
        if (project.generation.thumbnailUrl) project.generation.thumbnailUrl = await getSignedUrlIfNeeded(project.generation.thumbnailUrl);
        if (project.generation.s3ThumbnailUrl) project.generation.s3ThumbnailUrl = await getSignedUrlIfNeeded(project.generation.s3ThumbnailUrl);
    }

    // Sign input images
    if (project.input?.images) {
        project.input.images = await Promise.all(project.input.images.map(img => getSignedUrlIfNeeded(img)));
    }
    if (project.images) { // in-memory response override
        project.images = await Promise.all(project.images.map(img => getSignedUrlIfNeeded(img)));
    }

    // Sign concepts
    if (project.concepts) {
        for (const concept of project.concepts) {
            if (concept.imageUrl) concept.imageUrl = await getSignedUrlIfNeeded(concept.imageUrl);
        }
    }

    // Sign script shots
    if (project.script?.shots) {
        for (const shot of project.script.shots) {
            if (shot.previewUrl) shot.previewUrl = await getSignedUrlIfNeeded(shot.previewUrl);
        }
    }

    return project;
}
// POST /api/video-studio/advanced/i2v — Alias for /advanced/image-to-video
// ══════════════════════════════════════════════════════════════════════════════
router.post(['/advanced/i2v', '/advanced/image-to-video'], protect, requireCredits('videoGenerate'), async (req, res) => {
    try {
        const { imageUrl, prompt, duration, aspectRatio, qualityMode, brandId, referenceImages, idempotencyKey } = req.body;

        if (!imageUrl) {
            return res.status(400).json({ success: false, error: 'An image is required for Image-to-Video' });
        }

        // ── COST OPT 1: IDEMPOTENCY GUARD ─────────────────────────────────────
        if (idempotencyKey) {
            const existing = await VideoProject.findOne({
                user: req.user._id, idempotencyKey,
                status: { $in: ['advanced-generating', 'generating', 'completed', 'done'] },
                createdAt: { $gte: new Date(Date.now() - 30 * 60 * 1000) }
            }).lean();
            if (existing) {
                console.log(`🔐 [Idempotency/I2V] Key ${idempotencyKey} already active → reconnecting to ${existing._id}`);
                if (req.creditsDeducted > 0) await refundCredits(req.user._id, req.creditsDeducted, 'videoIdempotency', 'Idempotency: I2V already in progress', 'video');
                return res.json({ success: true, reconnected: true, project: { _id: existing._id, status: existing.status, generation: { progress: existing.generation?.progress || 5 } } });
            }
        }

        // ── COST OPT 2: DEDUP CACHE GUARD ─────────────────────────────────────
        const isDraftI2V = req.body.isDraft !== false;
        const effectiveResI2V = isDraftI2V ? '720p' : '1080p';
        const contentHashI2V = buildVideoHash({ prompt: prompt || 'i2v', model: 'seedance-2.0', duration, resolution: effectiveResI2V, imageUrl, aspectRatio });
        const cachedI2V = await findCachedGeneration(contentHashI2V);
        if (cachedI2V) {
            console.log(`⚡ [Dedup/I2V] Cache hit for hash ${contentHashI2V} → returning ${cachedI2V._id}`);
            if (req.creditsDeducted > 0) await refundCredits(req.user._id, req.creditsDeducted, 'videoDedup', 'Dedup: Identical I2V video exists', 'video');
            return res.json({ success: true, cached: true, project: { _id: cachedI2V._id, status: 'completed', finalVideoUrl: cachedI2V.generation?.s3VideoUrl || cachedI2V.finalVideoUrl, generation: { videoUrl: cachedI2V.generation?.s3VideoUrl, progress: 100 } } });
        }

        // ── COST OPT 3: PRE-FLIGHT SAFETY CHECK ──────────────────────────────
        if (prompt) {
            const safetyI2V = await checkPromptSafety(prompt);
            if (!safetyI2V.safe) {
                if (req.creditsDeducted > 0) await refundCredits(req.user._id, req.creditsDeducted, 'videoSafetyBlock', `Safety block: ${safetyI2V.reason}`, 'video');
                return res.status(400).json({ success: false, error: 'This prompt cannot be processed. Please revise and try again.', safetyBlock: true });
            }
        }

        console.log(`🖼️→🎬 I2V request: quality=${qualityMode}, duration=${duration}, draft=${isDraftI2V}, res=${effectiveResI2V}`);

        // 1. ENHANCE PROMPT (Mandatory 5,000 words)
        // ══════════════════════════════════════════════════════════════════════════════
        console.log('✨ Enhancing I2V prompt with Gemini 1.5 Pro...');
        const enhancedState = await enhancePromptNode({
            prompt: prompt || 'Animate this image with natural cinematic motion',
            model: 'seedance-2.0',
            duration: duration || 5,
            aspectRatio: aspectRatio || '16:9',
            brandId: brandId || null,
            userId: req.user._id,
        });
        const finalPrompt = enhancedState.enhancedPrompt;
        console.log(`✅ Enhanced prompt length: ${finalPrompt.length} chars`);

        // 2. Create project
        const project = await VideoProject.create({
            user: req.user._id,
            brand: brandId || null,
            title: (prompt || 'Image to Video').substring(0, 60),
            status: 'advanced-generating',
            mode: 'image-to-video',
            advancedConfig: {
                prompt: prompt || '',
                firstImageUrl: imageUrl,
                aspectRatio: aspectRatio || '16:9',
                duration: duration || 5,
                referenceImages: (referenceImages || []).filter(Boolean).map(url => ({ url })),
            },
            routing: {
                selectedModel: 'seedance-2.0',
                resolution: effectiveResI2V,
                mode: qualityMode || 'fast',
            },
            contentHash: contentHashI2V,
            idempotencyKey: idempotencyKey || null,
            isDraft: isDraftI2V,
        });

        // 3. Submit to dynamic routing engine (MuAPI/LaoZhang/Kie.ai/PiAPI) asynchronously
        submitVideoGeneration({
            model: 'seedance-2.0',
            prompt: finalPrompt, // Use enhanced prompt
            imageUrl,
            duration: duration || 5,
            aspectRatio: aspectRatio || '16:9',
            mode: qualityMode || 'fast',
            referenceImages: referenceImages || [],
            generateAudio: true,
        }).then(async (result) => {
            // 4. Update project with generation details
            await VideoProject.findByIdAndUpdate(project._id, {
                generation: {
                    falRequestId: result.requestId,
                    falEndpoint: result.endpoint || 'seedance-2.0-i2v',
                    provider: result.provider,
                    _atlasCloudPayload: result._atlasCloudPayload || null,
                    _muApiPayload: result._muApiPayload || null,
                    _laozhangVideoUrl: result._laozhangVideoUrl || null,
                    videoUrl: result._laozhangVideoUrl || '',
                    progress: result._laozhangVideoUrl ? 100 : 5,
                    startedAt: new Date(),
                    ...(result._laozhangVideoUrl ? { completedAt: new Date() } : {}),
                },
                status: result._laozhangVideoUrl ? 'completed' : 'advanced-generating',
                backendPrompt: prompt || '',
                ...(result._laozhangVideoUrl ? { finalVideoUrl: result._laozhangVideoUrl } : {})
            });
            if (result._laozhangVideoUrl) {
                // Use downloadAndUploadVideoToS3 — structured S3 key + DB update
                downloadAndUploadVideoToS3(project._id.toString(), result._laozhangVideoUrl)
                    .catch(e => console.warn('⚠️ LZ Video S3 mirror failed:', e.message));
            }
        }).catch(async (error) => {
            console.error('I2V generate background error:', error);
            await VideoProject.findByIdAndUpdate(project._id, {
                status: 'failed',
                'generation.error': error.message
            });
        });

        res.json({
            success: true,
            project: {
                _id: project._id,
                status: 'advanced-generating',
                mode: 'image-to-video',
                generation: {
                    progress: 5,
                    startedAt: new Date()
                },
                costPreview: estimateCost('seedance-2.0', duration || 5, '1080p', qualityMode || 'fast'),
            },
        });
    } catch (error) {
        console.error('I2V generate error:', error);
        if (req.creditsDeducted > 0) {
            await refundCredits(req.user._id, req.creditsDeducted, 'videoGenerateRefund', `Refund: Image-to-Video Sync Failure (${safeErrorMessage(error)})`, 'video');
        }
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ══════════════════════════════════════════════════════════════════════════════
// POST /api/video-studio/:id/extend — Extend a completed video (Seedance 2.0)
// ══════════════════════════════════════════════════════════════════════════════
router.post('/extend-video', protect, requireCredits('videoGenerate'), async (req, res) => {
    try {
        const { projectId, prompt, duration, qualityMode } = req.body;

        if (!projectId) {
            return res.status(400).json({ success: false, error: 'Project ID is required' });
        }

        // Load original project
        const original = await VideoProject.findOne({ _id: projectId, user: req.user._id });
        if (!original) return res.status(404).json({ success: false, error: 'Original video project not found' });

        const parentTaskId = original.generation?.falRequestId;
        if (!parentTaskId) return res.status(400).json({ success: false, error: 'No task ID found on original video — cannot extend' });
        if (original.routing?.selectedModel !== 'seedance-2.0' && original.mode !== 'image-to-video') {
            console.warn(`⚠️ Attempted extension on non-seedance model: ${original.routing?.selectedModel}`);
        }

        console.log(`🔗 Extend request: parent=${parentTaskId}, duration=${duration}, quality=${qualityMode}`);

        // Create new project for the extended video SYNC
        const extended = await VideoProject.create({
            user: req.user._id,
            brand: original.brand || null,
            title: `${original.title} (Extended)`.substring(0, 80),
            status: 'advanced-generating',
            mode: 'extend',
            advancedConfig: {
                prompt: prompt || `Continuation of: ${original.backendPrompt || ''}`,
                duration: duration || 5,
                aspectRatio: original.advancedConfig?.aspectRatio || '16:9',
            },
            routing: {
                selectedModel: 'seedance-2.0',
                resolution: '1080p',
                mode: qualityMode || 'fast',
            },
        });

        // Submit extension ASYNCHRONOUSLY
        extendVideoGeneration({
            model: 'seedance-2.0',
            parentTaskId,
            prompt: prompt || '',
            duration: duration || 5,
            qualityMode: qualityMode || 'fast',
        }).then(async (result) => {
            await VideoProject.findByIdAndUpdate(extended._id, {
                status: result.provider === 'laozhang' ? 'completed' : 'advanced-generating',
                generation: {
                    falRequestId: result.requestId,
                    falEndpoint: result.endpoint || 'seedance-2.0-extend',
                    provider: result.provider,
                    _atlasCloudPayload: result._atlasCloudPayload,
                    _muApiPayload: result._muApiPayload,
                    _laozhangVideoUrl: result._laozhangVideoUrl,
                    videoUrl: result._laozhangVideoUrl || '',
                    progress: result._laozhangVideoUrl ? 100 : 5,
                    startedAt: new Date(),
                },
                backendPrompt: prompt || '',
                ...(result._laozhangVideoUrl ? { finalVideoUrl: result._laozhangVideoUrl } : {})
            });
            if (result._laozhangVideoUrl) {
                // Use downloadAndUploadVideoToS3 — structured S3 key + DB update
                downloadAndUploadVideoToS3(extended._id.toString(), result._laozhangVideoUrl)
                    .catch(e => console.warn('⚠️ LZ Video S3 mirror failed:', e.message));
            }
        }).catch(async (error) => {
            console.error('Video extend background error:', error);
            await VideoProject.findByIdAndUpdate(extended._id, {
                status: 'failed',
                'generation.error': error.message
            });
        });

        res.json({
            success: true,
            project: {
                _id: extended._id,
                status: 'advanced-generating',
                mode: 'extend',
                parentProjectId: projectId,
                generation: { progress: 5, startedAt: new Date() },
                costPreview: estimateCost('seedance-2.0', duration || 5, '1080p', qualityMode || 'fast'),
            },
        });
    } catch (error) {
        console.error('Video extend error:', error);
        if (req.creditsDeducted > 0) {
            await refundCredits(req.user._id, req.creditsDeducted, 'videoGenerateRefund', `Refund: Video Extend Sync Failure (${safeErrorMessage(error)})`, 'video');
        }
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ══════════════════════════════════════════════════════════════════════════════
// POST /api/video-studio/advanced/generate — Direct generation (Advanced Mode)
// ══════════════════════════════════════════════════════════════════════════════
router.post('/advanced/generate', protect, requireCredits('videoGenerate'), async (req, res) => {
    try {
        const {
            prompt, model, duration, resolution, aspectRatio,
            firstImageUrl, lastImageUrl, referenceImages,
            generateAudio, qualityMode, brandId, shots,
            refAudio, refVideo, idempotencyKey
        } = req.body;

        // 🔍 DIAGNOSTIC: Log start of handler
        console.log(`🎬 [ADVANCED] Start generate for User: ${req.user.email} | Model: ${model || 'kling-3.0'} | Duration: ${duration || 5}s`);

        if (!prompt || !prompt.trim()) {
            return res.status(400).json({ success: false, error: 'Prompt is required' });
        }

        // ── COST OPT 1: IDEMPOTENCY GUARD ─────────────────────────────────────
        if (idempotencyKey) {
            const existing = await VideoProject.findOne({
                user: req.user._id,
                idempotencyKey,
                status: { $in: ['advanced-generating', 'generating', 'completed', 'done'] },
                createdAt: { $gte: new Date(Date.now() - 30 * 60 * 1000) }
            }).lean();
            if (existing) {
                console.log(`🔐 [Idempotency] Key ${idempotencyKey} already active → reconnecting to ${existing._id}`);
                if (req.creditsDeducted > 0) {
                    await refundCredits(req.user._id, req.creditsDeducted, 'videoIdempotency',
                        'Idempotency: Request already in progress', 'video');
                }
                return res.json({
                    success: true, reconnected: true,
                    project: { _id: existing._id, status: existing.status, generation: { progress: existing.generation?.progress || 5 } },
                });
            }
        }

        // ── COST OPT 2: DEDUP CACHE GUARD ─────────────────────────────────────
        const isDraft = req.body.isDraft !== false; // default true
        const effectiveResolution = isDraft ? (resolution || '720p') : (resolution || '1080p');
        const contentHash = buildVideoHash({ prompt, model, duration, resolution: effectiveResolution, imageUrl: firstImageUrl, aspectRatio });
        const cached = await findCachedGeneration(contentHash);
        if (cached) {
            console.log(`⚡ [Dedup] Cache hit for hash ${contentHash} → returning ${cached._id}`);
            if (req.creditsDeducted > 0) {
                await refundCredits(req.user._id, req.creditsDeducted, 'videoDedup',
                    'Dedup: Identical video already exists', 'video');
            }
            return res.json({
                success: true, cached: true,
                project: {
                    _id: cached._id, status: 'completed',
                    finalVideoUrl: cached.generation?.s3VideoUrl || cached.finalVideoUrl,
                    generation: { videoUrl: cached.generation?.s3VideoUrl, progress: 100 },
                }
            });
        }

        // ── COST OPT 3: PRE-FLIGHT SAFETY CHECK ──────────────────────────────
        const safetyResult = await checkPromptSafety(prompt);
        if (!safetyResult.safe) {
            console.warn(`🛡️ [Safety] Blocked prompt: ${safetyResult.reason}`);
            if (req.creditsDeducted > 0) {
                await refundCredits(req.user._id, req.creditsDeducted, 'videoSafetyBlock',
                    `Safety block: ${safetyResult.reason}`, 'video');
            }
            return res.status(400).json({ success: false, error: 'This prompt cannot be processed. Please revise and try again.', safetyBlock: true });
        }

        console.log(`📸 Advanced generate: ${(referenceImages || []).length} ref images, firstImage: ${firstImageUrl ? 'yes' : 'no'}, model: ${model}, quality: ${qualityMode}, draft: ${isDraft}, res: ${effectiveResolution}`);

        // 1. SMART ENHANCE PROMPT — with Redis cache to avoid redundant Gemini calls
        // ══════════════════════════════════════════════════════════════════════════════
        console.log(`✨ [ADVANCED] Enhancing prompt for model: ${model || 'seedance-2.0'}`);
        let finalPrompt = prompt.trim();
        const promptCacheKey = `enhance:${contentHash}`;
        try {
            const cachedEnhanced = await redis.get(promptCacheKey);
            if (cachedEnhanced) {
                finalPrompt = cachedEnhanced;
                console.log(`⚡ [PromptCache] Hit for hash ${contentHash} (${finalPrompt.split(' ').length} words)`);
            } else {
                const { buildEnhanceSystemPrompt, buildEnhanceUserPrompt } = await import('../agents/videoStudio/promptEnhancer.js');
                const { callAgent: callAgt } = await import('../agents/shared/agentUtils.js');
                const { loadBrandContext: loadCtx } = await import('../agents/shared/agentUtils.js');
                const { brandContext } = await loadCtx(brandId);
                const sysPrompt = buildEnhanceSystemPrompt(model || 'seedance-2.0', 'shortvideo', Number(duration) || 5, aspectRatio || '16:9', brandContext);
                const usrPrompt = buildEnhanceUserPrompt(prompt.trim(), null, 'shortvideo');
                const enhanced = await callAgt(sysPrompt, usrPrompt, 0.65, 2000, { timeoutMs: 30000 });
                if (enhanced?.enhancedPrompt) {
                    finalPrompt = enhanced.enhancedPrompt;
                    // Cache for 24 hours
                    await redis.set(promptCacheKey, finalPrompt, { ex: 86400 }).catch(() => {});
                    console.log(`✅ [ADVANCED] Enhanced prompt (${finalPrompt.split(' ').length} words): "${finalPrompt.substring(0, 100)}..."`);
                } else {
                    console.warn('⚠️ [ADVANCED] Enhancement returned empty — using raw prompt');
                }
            }
        } catch (enhErr) {
            console.warn('⚠️ [ADVANCED] Enhancement failed (non-blocking) — using raw prompt:', enhErr.message);
        }

        // 2. Create project in advanced mode
        const project = await VideoProject.create({
            user: req.user._id,
            brand: brandId || null,
            title: prompt.trim().substring(0, 60) + '...',
            status: 'advanced-generating',
            mode: 'advanced',
            advancedConfig: {
                prompt: prompt.trim(),
                firstImageUrl: (firstImageUrl && !firstImageUrl.startsWith('data:')) ? firstImageUrl : '',
                lastImageUrl: (lastImageUrl && !lastImageUrl.startsWith('data:')) ? lastImageUrl : '',
                referenceImages: (referenceImages || []).filter(Boolean).map(url => ({ url })),
                refAudio: refAudio || '',
                refVideo: refVideo || '',
                shots: shots || [],
                aspectRatio: aspectRatio || '16:9',
                duration: duration || 5,
                generateAudio: generateAudio !== false,
            },
            routing: {
                selectedModel: model || 'kling-3.0',
                resolution: effectiveResolution,
                mode: qualityMode || 'fast',
            },
            creditsUsed: req.creditsDeducted || 0,
            contentHash,
            idempotencyKey: idempotencyKey || null,
            isDraft,
        });

        // 3. Plan duration if needed
        const durationPlan = await durationPlannerNode({
            model: model || 'kling-3.0',
            duration: duration || 5,
        });

        // 4. Run generation ASYNCHRONOUSLY
        advancedGenerateNode({
            prompt: finalPrompt, // Use enhanced prompt
            model: model || 'kling-3.0',
            duration: duration || 5,
            resolution: effectiveResolution,
            qualityMode: qualityMode || 'fast',
            firstImageUrl: firstImageUrl || '',
            generateAudio: generateAudio !== false,
            aspectRatio: aspectRatio || '16:9',
            referenceImages: referenceImages || [],
            shots: shots || [],
            refAudio: refAudio || '',
            refVideo: refVideo || ''
        }).then(async (state) => {
            // Update project with generation details
            // LaoZhang sync: state.status may be 'critique' (already completed)
            const projectStatus = state.status === 'critique' ? 'completed' : 'advanced-generating';
            
            // Ensure generation.status is explicitly set so frontend polling detects completion
            const genData = { ...state.generation };
            if (projectStatus === 'completed') {
                genData.status = 'COMPLETED';
                genData.progress = 100;
            }
            
            const updatePayload = {
                status: projectStatus,
                generation: genData,
                backendPrompt: prompt.trim(),
            };
            if (genData.videoUrl) {
                updatePayload.finalVideoUrl = genData.videoUrl;
            }
            await VideoProject.findByIdAndUpdate(project._id, updatePayload);
            console.log(`✅ [AdvancedGen] Background task done for ${project._id}: status=${projectStatus}, videoUrl=${genData.videoUrl ? 'yes' : 'no'}, provider=${genData.provider}`);
    
            // LaoZhang sync: video is already generated — upload to S3 before CDN expires
            // This normally happens in the polling loop, but LZ projects skip polling
            if (projectStatus === 'completed' && genData.videoUrl) {
                // Use downloadAndUploadVideoToS3 — structured S3 key + DB update
                downloadAndUploadVideoToS3(project._id.toString(), genData.videoUrl)
                    .catch(e => console.warn('⚠️ LZ Video S3 mirror failed:', e.message));
            }
        }).catch(async (error) => {
            console.error('Advanced generate background error:', error);
            await VideoProject.findByIdAndUpdate(project._id, {
                status: 'failed',
                'generation.error': error.message
            });
        });

        res.json({
            success: true,
            project: {
                _id: project._id,
                status: 'advanced-generating',
                mode: 'advanced',
                generation: { progress: 5, startedAt: new Date() },
                costPreview: 0,
                durationPlan: durationPlan.durationPlan,
            },
        });
    } catch (error) {
        console.error('Advanced generate error:', error);
        if (req.creditsDeducted > 0) {
            await refundCredits(req.user._id, req.creditsDeducted, 'videoGenerateRefund', `Refund: Advanced Video Generation sync failure (${safeErrorMessage(error)})`, 'video');
        }
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});
// ══════════════════════════════════════════════════════════════════════════════
// GET /api/video-studio/agent/products — List brand products with images for Video Agent UI
// ══════════════════════════════════════════════════════════════════════════════
router.get('/agent/products', protect, async (req, res) => {
    try {
        const { brandId } = req.query;
        if (!brandId) return res.json({ success: true, products: [], brandImages: [] });

        const Product = (await import('../models/Product.js')).default;
        const products = await Product.find({ brand: brandId, status: 'active' })
            .select('title shortDescription category images price features')
            .limit(30)
            .lean();

        // Also return brand images
        const brand = await Brand.findById(brandId).select('dna.brandImages dna.bannerImages name logo').lean();
        const brandImages = [
            ...(brand?.dna?.brandImages || []).map(i => ({ url: i.url, alt: i.alt || 'Brand image', source: 'brand' })),
            ...(brand?.dna?.bannerImages || []).map(i => ({ url: i.url || i, alt: 'Banner', source: 'banner' })),
        ].filter(i => i.url);

        res.json({
            success: true,
            products: products.map(p => ({
                _id: p._id,
                title: p.title,
                shortDescription: p.shortDescription || '',
                category: p.category || '',
                price: p.price,
                features: (p.features || []).slice(0, 3),
                images: (p.images || []).map(i => ({ url: i.url, alt: i.alt || p.title })),
            })),
            brandImages,
            brandName: brand?.name || '',
            brandLogo: brand?.logo || '',
        });
    } catch (error) {
        console.error('Agent products error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ══════════════════════════════════════════════════════════════════════════════
// POST /api/video-studio/agent/upload — Multipart file upload (images + audio)
// Returns S3 URL for use in the Video Agent pipeline
// ══════════════════════════════════════════════════════════════════════════════
const agentUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
router.post('/agent/upload', protect, agentUpload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file provided' });
        }

        const mimeType = req.file.mimetype || 'application/octet-stream';
        const ext = req.file.originalname?.split('.').pop() || 'bin';
        const folder = mimeType.startsWith('audio/') ? 'agent-audio' : 'agent-uploads';
        const s3Key = `${folder}/${req.user._id}/${Date.now()}-${req.file.originalname || `upload.${ext}`}`;

        console.log(`📤 Agent upload: ${req.file.originalname} (${Math.round(req.file.size / 1024)}KB, ${mimeType}) → s3://${s3Key}`);

        const s3Url = await uploadToS3(req.file.buffer, s3Key, mimeType);

        console.log(`✅ Agent upload complete: ${s3Url.substring(0, 80)}`);

        const finalUrl = await getSignedUrlIfNeeded(s3Url);
        res.json({ success: true, url: finalUrl });
    } catch (error) {
        console.error('Agent upload error:', error);
        res.status(500).json({ success: false, error: `Upload failed: ${error.message}` });
    }
});


// ══════════════════════════════════════════════════════════════════════════════
// POST /api/video-studio/agent/create — Full Agentic Video Pipeline
// User prompt → character ref sheet → AI storyboard → per-scene gen → VO → music → compile
// ══════════════════════════════════════════════════════════════════════════════
router.post('/agent/create', protect, requireCredits('videoGenerate'), async (req, res) => {
    try {
        const {
            prompt,            // Natural language creative brief
            productId,         // Optional: specific product to feature
            referenceImages,   // Optional: user-uploaded reference images
            characterPhoto,    // Optional: model/character photo URL for consistency
            audioFileUrl,      // Optional: user-uploaded audio (VO/music) — video syncs to this
            characterDescriptions, // Optional: user-defined character descriptions
            brandId,
            voiceover,         // { enabled, provider, voiceId, speed, langCode }
            music,             // { enabled, mood, genre }
            textOverlays,      // { enabled, brandName, ctaText, language }
            aspectRatio,       // Optional override
            qualityMode,       // Optional override
        } = req.body;

        if (!prompt?.trim()) {
            return res.status(400).json({ success: false, error: 'Creative brief/prompt is required' });
        }

        console.log(`🤖 Video Agent: "${prompt.substring(0, 80)}..." | brand=${brandId || "none"} | product=${productId || "none"}`);
        console.log(`   🎧 audioFileUrl: ${audioFileUrl ? audioFileUrl.substring(0, 80) : "NOT PROVIDED"} | charPhoto: ${characterPhoto ? "yes" : "no"} | charDesc: ${characterDescriptions ? "yes" : "no"}`);

        // ── Step 1: Load full brand context (DNA + products + images + knowledge) ──
        const { agentUtils } = await import('../agents/shared/agentUtils.js');
        const { brand, brandContext, products } = await agentUtils.loadBrandContext(brandId);

        // ── Step 2: Load specific product if selected ──
        let productContext = '';
        let productImages = [];
        if (productId) {
            const Product = (await import('../models/Product.js')).default;
            const product = await Product.findById(productId).lean();
            if (product) {
                productContext = `\n\nFEATURED PRODUCT:\nName: ${product.title}\nDescription: ${product.shortDescription || product.description || ''}\nCategory: ${product.category || ''}\nPrice: ${product.price?.currency || 'INR'} ${product.price?.amount || ''}\nFeatures: ${(product.features || []).join(', ')}\nKeywords: ${(product.keywords || []).join(', ')}`;
                productImages = (product.images || []).filter(i => i.url).map(i => i.url);
            }
        }

        // ── Step 3: Collect all available images (product + brand + user uploads) ──
        const allImages = [
            ...productImages,
            ...(referenceImages || []).filter(u => u && !u.startsWith('data:')),
            ...(brand?.dna?.brandImages || []).filter(i => i.url).map(i => i.url).slice(0, 5),
        ];

        // ── Step 3.5: Character Consistency — Generate reference sheet from character photo ──
        let characterRefUrl = '';
        if (characterPhoto && !characterPhoto.startsWith('data:')) {
            try {
                console.log('   \u{1F464} Generating character reference sheet from photo...');
                const { geminiImageGenerate } = await import('../agents/videoStudio/firstFrame.js');
                const charResp = await fetch(characterPhoto);
                const charBuffer = await charResp.arrayBuffer();
                const charBase64 = Buffer.from(charBuffer).toString('base64');
                const charMime = charResp.headers.get('content-type') || 'image/jpeg';
                const refResult = await geminiImageGenerate(
                    'Generate a character reference sheet showing this exact same person from 4 different angles: front view, 3/4 view, side profile, and a full body shot. Keep the face, hair, clothing, and overall appearance perfectly consistent across all 4 views. White background, professional character sheet layout.',
                    [{ mimeType: charMime, data: charBase64 }],
                    0.3
                );
                if (refResult?.imageUrl) {
                    characterRefUrl = refResult.imageUrl;
                    console.log('   \u2705 Character ref sheet generated');
                }
            } catch (charErr) {
                console.warn('   \u26A0\uFE0F Character ref sheet failed:', charErr.message);
                characterRefUrl = characterPhoto;
            }
        }

        // ── Step 3.6: Audio Transcription — transcribe uploaded audio so AI knows the script ──
        let audioTranscript = '';
        if (audioFileUrl) {
            try {
                console.log('   🎧 Transcribing uploaded audio...');
                const audioResp = await fetch(audioFileUrl);
                if (audioResp.ok) {
                    const audioBuffer = Buffer.from(await audioResp.arrayBuffer());
                    const audioMime = audioResp.headers.get('content-type') || 'audio/mpeg';
                    const ext = audioMime.includes('wav') ? 'wav' : audioMime.includes('mp4') || audioMime.includes('m4a') ? 'm4a' : audioMime.includes('ogg') ? 'ogg' : 'mp3';

                    // Try OpenAI Whisper first (best for all languages)
                    const openaiKey = process.env.OPENAI_API_KEY;
                    if (openaiKey) {
                        const form = new FormData();
                        const audioBlob = new Blob([audioBuffer], { type: audioMime });
                        form.append('file', audioBlob, `audio.${ext}`);
                        form.append('model', 'whisper-1');
                        form.append('response_format', 'json');

                        const whisperResp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${openaiKey}` },
                            body: form,
                        });

                        if (whisperResp.ok) {
                            const whisperData = await whisperResp.json();
                            audioTranscript = whisperData.text || '';
                            console.log(`   ✅ Audio transcribed (${audioTranscript.length} chars): "${audioTranscript.substring(0, 80)}..."`);
                        } else {
                            console.warn('   ⚠️ Whisper transcription failed:', (await whisperResp.json().catch(() => ({}))).error?.message);
                        }
                    }

                    // Fallback: try Sarvam STT for Indian languages
                    if (!audioTranscript) {
                        const sarvamKey = process.env.SARVAM_API_KEY;
                        if (sarvamKey) {
                            const form = new FormData();
                            const audioBlob = new Blob([audioBuffer], { type: audioMime });
                            form.append('file', audioBlob, `audio.${ext}`);
                            form.append('model', 'saaras:v3');
                            form.append('language_code', 'unknown');
                            form.append('mode', 'transcribe');

                            const sarvamResp = await fetch('https://api.sarvam.ai/speech-to-text', {
                                method: 'POST',
                                headers: { 'api-subscription-key': sarvamKey },
                                body: form,
                            });
                            if (sarvamResp.ok) {
                                const sarvamData = await sarvamResp.json();
                                audioTranscript = sarvamData.transcript || '';
                                console.log(`   ✅ Audio transcribed via Sarvam (${audioTranscript.length} chars)`);
                            }
                        }
                    }
                }
            } catch (transcribeErr) {
                console.warn('   ⚠️ Audio transcription failed:', transcribeErr.message);
            }
        }

        // ── Step 4: AI Storyboard — use Claude for intelligent film direction ──
        // Force Anthropic/Claude for storyboard — it's the best at narrative structure,
        // audio-visual mapping, and maintaining character consistency in structured output.
        const ai = getAIRouter();
        let storyboardProvider;
        try {
            storyboardProvider = ai.getProvider('anthropic');
            console.log('   📡 Using Anthropic/Claude for storyboard generation');
        } catch {
            storyboardProvider = null;
            console.log('   📡 Anthropic not available, falling back to default provider');
        }

        // ── Estimate audio duration from transcript for timing ──
        const estimatedAudioDuration = audioTranscript
            ? Math.ceil((audioTranscript.split(/\s+/).length / 150) * 60) // ~150 words/min
            : 0;

        const systemPrompt = `You are a world-class film director and cinematographer with expertise in:
- Visual storytelling and narrative structure
- Audio-visual synchronization (matching visuals to spoken word)
- Character consistency across multiple shots
- Cinematic camera work, lighting, and color grading
- Scene transitions and visual flow

Your job: Given a creative brief (and optionally an audio transcript), produce a professional shot-by-shot storyboard as JSON.

CRITICAL RULES FOR VISUAL CONSISTENCY:
1. Define "CHARACTER ANCHORS" — a precise physical description for each character that MUST appear VERBATIM in every scene's visualPrompt where that character appears
2. Define a "VISUAL STYLE" — a consistent art direction string (e.g., "cinematic warm tones, shallow depth of field, golden hour lighting") that MUST appear in every scene's visualPrompt
3. Each visualPrompt must be a self-contained, richly detailed prompt (as if it's the ONLY instruction a video generation AI will see)
4. Include camera angle, lighting, color palette, and character positions in every visualPrompt
5. Scenes must flow narratively — each should feel like the next shot in a continuous film

Output ONLY valid JSON. No markdown, no explanation, no commentary.`;

        const storyboardPrompt = `
BRAND CONTEXT:
${brandContext}
${productContext}

AVAILABLE IMAGES: ${allImages.length} reference images available for use as first frames.

USER'S CREATIVE BRIEF: "${prompt}"

CHARACTER REFERENCE: ${characterRefUrl ? 'A character reference sheet photo is available. Include this exact person in all relevant scenes. Describe their physical appearance consistently.' : 'No reference photo provided.'}
${characterDescriptions ? `
CHARACTER DESCRIPTIONS (user-defined):
${characterDescriptions}

You MUST create a "characterAnchors" array with these characters. Each anchor is an exact physical description string. Then COPY-PASTE that exact anchor string into every scene's visualPrompt where the character appears. This ensures the video generation AI renders the same person.` : ''}
${audioFileUrl ? `
═══ AUDIO-DRIVEN MODE ═══
The user uploaded their own audio. This video MUST precisely illustrate the audio content.
${audioTranscript ? `
FULL AUDIO TRANSCRIPT:
"${audioTranscript}"

ESTIMATED AUDIO DURATION: ~${estimatedAudioDuration} seconds

CRITICAL AUDIO-VISUAL SYNC RULES:
1. Split the transcript into SEMANTIC segments — break at natural sentence/paragraph boundaries, NOT arbitrary time cuts
2. Each segment becomes one scene. The scene's voiceoverText = that exact segment of transcript (verbatim, no rewording)
3. The voiceoverScript = the full transcript exactly as provided
4. Each scene's visualPrompt must DIRECTLY ILLUSTRATE what is being said in that segment
   - If audio says "a horse galloped across the plains" → visual shows a horse galloping across plains
   - If audio says "she smiled warmly" → visual shows the character smiling
   - Do NOT create generic/abstract visuals — they must match the SPECIFIC words
5. Scene duration = proportional to the segment's word count (total video ≈ ${estimatedAudioDuration}s)
6. Scene transitions should align with natural narrative beats
7. Maintain visual continuity — same setting should look the same across consecutive scenes` : `
- Split the audio timeline into scene segments matching the mood/content
- Total video duration must match the audio`}
- Do NOT generate separate voiceover — the user's audio IS the soundtrack
- voiceoverScript should contain the transcript (or empty if no transcript)` : ''}

TEXT OVERLAY LANGUAGE: ${textOverlays?.language || voiceover?.langCode || brand?.dna?.defaultLanguage || 'english'}
BRAND NAME FOR OVERLAYS: ${textOverlays?.brandName || brand?.name || ''}
CTA TEXT: ${textOverlays?.ctaText || ''}

SCENE DESIGN RULES:
- Each scene: 3-10 seconds (video models max at 15s)
- For a 1-minute story: 6-12 scenes
- For a 15-30s ad: 3-6 scenes
- Each visualPrompt must be a COMPLETE, self-contained description (100+ words) including:
  → Subject (who/what is in the scene, with exact character anchor if applicable)
  → Action (what is happening)
  → Setting (where, with specific environmental details)
  → Camera (angle, movement — e.g., "slow dolly in", "wide establishing shot", "close-up")
  → Lighting (e.g., "warm golden hour backlighting", "dramatic side lighting")
  → Color palette (e.g., "teal and orange color grade", "desaturated cool tones")
  → Mood/atmosphere (e.g., "intimate and tender", "epic and triumphant")
- If a product is featured, show it prominently
- Match the brand's visual identity

Output ONLY this JSON structure:
{
    "title": "Video title",
    "totalDuration": number,
    "visualStyle": "A consistent art direction string used across ALL scenes (e.g., 'Cinematic 35mm film look, warm amber tones, shallow depth of field, natural lighting')",
    "colorPalette": "Primary color scheme (e.g., 'warm ambers and deep browns with golden highlights')",
    "characterAnchors": [
        "Exact physical description of Character 1 — copy this verbatim into every scene featuring them",
        "Exact physical description of Character 2 — if applicable"
    ],
    "scenes": [
        {
            "sceneNumber": 1,
            "duration": 5,
            "visualPrompt": "COMPLETE cinematic prompt (100+ words). MUST include the character anchor text verbatim if character is in scene. MUST include visualStyle. MUST include camera angle, lighting, action, setting.",
            "voiceoverText": "Exact segment of transcript for this scene (verbatim from audio, or written VO)",
            "cameraAngle": "wide/medium/close-up/extreme-close-up/aerial/tracking/dolly",
            "lighting": "Description of lighting setup",
            "transitionFrom": "How this scene connects from the previous (e.g., 'cut from close-up of hands to wide landscape')",
            "useProductImage": false,
            "useCharacterRef": false,
            "mood": "specific mood for this scene",
            "textOverlay": { "text": "Brand Name or CTA", "position": "bottom-center", "style": "bold" }
        }
    ],
    "voiceoverScript": "Full combined voiceover script (or full transcript if audio-driven)",
    "suggestedModel": "kling-3.0 or seedance-2.0 or veo-3.1 or hunyuan",
    "suggestedAspectRatio": "16:9 or 9:16 or 1:1",
    "suggestedMusicMood": "upbeat/epic/calm/emotional/corporate",
    "reasoning": "Why these creative choices — explain the visual narrative strategy"
}`;

        // Use Claude specifically for storyboard, with fallback to router if Claude fails
        let storyboardResult;
        const storyboardParams = { systemPrompt, userPrompt: storyboardPrompt, maxTokens: 8192, temperature: 0.6 };

        if (storyboardProvider) {
            try {
                storyboardResult = await storyboardProvider.generateText(storyboardParams);
            } catch (claudeErr) {
                console.warn(`   ⚠️ Claude failed (${claudeErr.message?.substring(0, 80)}), falling back to router...`);
                storyboardResult = await ai.generateText(storyboardParams);
            }
        } else {
            storyboardResult = await ai.generateText(storyboardParams);
        }

        const raw = (storyboardResult.text || storyboardResult.content || '{}')
            .replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        let storyboard;
        try {
            storyboard = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
        } catch {
            // Fallback: single scene
            storyboard = {
                title: prompt.substring(0, 60),
                totalDuration: 10,
                scenes: [{ sceneNumber: 1, duration: 10, visualPrompt: prompt, voiceoverText: '', useProductImage: !!productId, mood: 'professional' }],
                voiceoverScript: '',
                suggestedModel: 'kling-3.0',
                suggestedAspectRatio: aspectRatio || '16:9',
            };
        }

        if (!storyboard.scenes?.length) {
            storyboard.scenes = [{ sceneNumber: 1, duration: 10, visualPrompt: prompt, voiceoverText: '', useProductImage: false, mood: 'professional' }];
        }

        console.log(`   📋 Storyboard: ${storyboard.scenes.length} scenes, ~${storyboard.totalDuration}s total`);

        // ── Step 5: Determine model ──
        const videoModel = req.body.videoModel || 'auto';
        const model = videoModel === 'auto'
            ? (qualityMode === 'draft' ? 'hunyuan' : (storyboard.suggestedModel || 'kling-3.0'))
            : videoModel;

        console.log(`   📋 Storyboard: ${storyboard.scenes.length} scenes, ~${storyboard.totalDuration}s total | model: ${model}`);

        // ── Save session for multi-step flow ──
        const sessionId = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const AgentSession = (await import('../models/AgentSession.js')).default;
        await AgentSession.create({
            sessionId,
            user: req.user._id,
            brand: brandId || null,
            prompt,
            storyboard,
            model,
            audioFileUrl: audioFileUrl || null,
            audioTranscript: audioTranscript || null,
            characterRefUrl: characterRefUrl || null,
            characterDescriptions: characterDescriptions || null,
            allImages,
            productId: productId || null,
            productImages,
            referenceImages: (referenceImages || []).filter(u => u && !u.startsWith('data:')),
            voiceover: voiceover || {},
            music: music || {},
            textOverlays: textOverlays || {},
            aspectRatio: storyboard.suggestedAspectRatio || aspectRatio || '16:9',
            qualityMode: qualityMode || 'fast',
            status: 'storyboard-ready',
        });

        // ── Return storyboard for user review (NO video gen yet) ──
        res.json({
            success: true,
            sessionId,
            pipeline: {
                title: storyboard.title,
                totalDuration: storyboard.totalDuration,
                totalScenes: storyboard.scenes.length,
                model,
                aspectRatio: storyboard.suggestedAspectRatio || aspectRatio || '16:9',
                reasoning: storyboard.reasoning || '',
                characterRefUsed: !!characterRefUrl,
            },
            storyboard: {
                voiceoverScript: storyboard.voiceoverScript || '',
                scenes: storyboard.scenes.map(s => ({
                    sceneNumber: s.sceneNumber,
                    duration: s.duration,
                    voiceoverText: s.voiceoverText || '',
                    mood: s.mood || '',
                    visualPrompt: s.visualPrompt || '',
                    textOverlay: s.textOverlay || null,
                    useProductImage: s.useProductImage || false,
                    useCharacterRef: s.useCharacterRef || false,
                })),
            },
            audioFile: audioFileUrl ? { url: audioFileUrl, isBase: true, transcript: audioTranscript || null } : null,
            textOverlays: storyboard.scenes.map(s => s.textOverlay).filter(Boolean),
            productUsed: productId ? { id: productId, imagesCount: productImages.length } : null,
        });

    } catch (error) {
        console.error('Video Agent create error:', error);
        if (req.creditsDeducted > 0) {
            await refundCredits(req.user._id, req.creditsDeducted, 'videoGenerateRefund', `Refund: Video Agent Sync Failure (${safeErrorMessage(error)})`, 'video');
        }
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ══════════════════════════════════════════════════════════════════════════════
// POST /api/video-studio/agent/first-frames — Generate preview first-frame images
// User approves storyboard → we generate 1 image per scene for preview
// ══════════════════════════════════════════════════════════════════════════════
router.post('/agent/first-frames', protect, async (req, res) => {
    try {
        const { sessionId } = req.body;
        if (!sessionId) return res.status(400).json({ success: false, error: 'sessionId is required' });

        const AgentSession = (await import('../models/AgentSession.js')).default;
        const session = await AgentSession.findOne({ sessionId, user: req.user._id });
        if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

        console.log(`🖼️ Generating first frames for session ${sessionId} (${session.storyboard.scenes.length} scenes)`);

        const { geminiImageGenerate } = await import('../agents/videoStudio/firstFrame.js');
        const frames = [];

        for (let i = 0; i < session.storyboard.scenes.length; i++) {
            const scene = session.storyboard.scenes[i];
            try {
                // Determine context images for the first frame
                const contextImages = [];
                if (scene.useCharacterRef && session.characterRefUrl) {
                    const charResp = await fetch(session.characterRefUrl);
                    const charBuf = await charResp.arrayBuffer();
                    contextImages.push({
                        mimeType: charResp.headers.get('content-type') || 'image/jpeg',
                        data: Buffer.from(charBuf).toString('base64'),
                    });
                } else if (scene.useProductImage && session.productImages?.length > 0) {
                    const prodResp = await fetch(session.productImages[0]);
                    const prodBuf = await prodResp.arrayBuffer();
                    contextImages.push({
                        mimeType: prodResp.headers.get('content-type') || 'image/jpeg',
                        data: Buffer.from(prodBuf).toString('base64'),
                    });
                } else if (session.referenceImages && session.referenceImages.length > 0) {
                    const refResp = await fetch(session.referenceImages[0]);
                    const refBuf = await refResp.arrayBuffer();
                    contextImages.push({
                        mimeType: refResp.headers.get('content-type') || 'image/jpeg',
                        data: Buffer.from(refBuf).toString('base64'),
                    });
                } else if (session.allImages && session.allImages.length > 0) {
                    const refResp = await fetch(session.allImages[0]);
                    const refBuf = await refResp.arrayBuffer();
                    contextImages.push({
                        mimeType: refResp.headers.get('content-type') || 'image/jpeg',
                        data: Buffer.from(refBuf).toString('base64'),
                    });
                }

                const injectedPrompt = contextImages.length > 0 
                    ? `\nCRITICAL MANDATE: Reference images are attached. You MUST accurately represent the exact subject shown in these reference images. Do not invent a new subject, faithfully recreate the one from the image in this scene.` 
                    : '';

                const framePrompt = `Generate a high-quality cinematic first frame for a video scene:\n${scene.visualPrompt}\n\nMood: ${scene.mood || 'professional'}. This should look like a movie still or the opening frame of a commercial. Photorealistic, high production value.${injectedPrompt}`;

                const result = await geminiImageGenerate(framePrompt, contextImages, 0.5);

                if (result?.imageUrl) {
                    frames.push({ sceneNumber: scene.sceneNumber || i + 1, imageUrl: result.imageUrl, status: 'done' });
                    console.log(`   ✅ Frame ${i + 1} generated`);
                } else {
                    frames.push({ sceneNumber: scene.sceneNumber || i + 1, imageUrl: null, status: 'failed', error: 'No image generated' });
                }
            } catch (err) {
                console.error(`   ❌ Frame ${i + 1} failed:`, err.message);
                frames.push({ sceneNumber: scene.sceneNumber || i + 1, imageUrl: null, status: 'failed', error: err.message });
            }
        }

        // Update session status
        await AgentSession.findOneAndUpdate({ sessionId }, { status: 'frames-ready', firstFrames: frames });

        res.json({ success: true, sessionId, frames });
    } catch (error) {
        console.error('Agent first-frames error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ══════════════════════════════════════════════════════════════════════════════
// POST /api/video-studio/agent/generate — Generate actual videos after approval
// User approves first frames → we create VideoProjects and start generation
// ══════════════════════════════════════════════════════════════════════════════
router.post('/agent/generate', protect, requireCredits('videoGenerate'), async (req, res) => {
    try {
        const { sessionId, selectedModel } = req.body;
        if (!sessionId) return res.status(400).json({ success: false, error: 'sessionId is required' });

        const AgentSession = (await import('../models/AgentSession.js')).default;
        const session = await AgentSession.findOne({ sessionId, user: req.user._id });
        if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

        const model = selectedModel || session.model || 'kling-3.0';
        const storyboard = session.storyboard;
        const aspectRatio = session.aspectRatio || '16:9';
        const qualityMode = session.qualityMode || 'fast';

        console.log(`🎬 Generating videos for session ${sessionId} (${storyboard.scenes.length} scenes, model: ${model})`);

        const sceneProjects = [];

        for (let i = 0; i < storyboard.scenes.length; i++) {
            const scene = storyboard.scenes[i];
            const dur = Math.min(Math.max(scene.duration || 5, 3), 15);

            // Use first frame from preview step if available
            let firstImageUrl = '';
            const savedFrames = session.firstFrames || [];
            const savedFrame = savedFrames.find(f => f.sceneNumber === (scene.sceneNumber || i + 1));
            if (savedFrame?.imageUrl) {
                firstImageUrl = savedFrame.imageUrl;
            } else if (scene.useCharacterRef && session.characterRefUrl) {
                firstImageUrl = session.characterRefUrl;
            } else if (scene.useProductImage && session.productImages?.length > 0) {
                firstImageUrl = session.productImages[0];
            } else if (session.productImages?.length > 0) {
                // Always anchor to product image for consistency across all scenes
                firstImageUrl = session.productImages[0];
            } else if (session.allImages?.length > 0) {
                firstImageUrl = session.allImages[0];
            }

            try {
                const project = await VideoProject.create({
                    user: req.user._id,
                    brand: session.brand || null,
                    title: `${storyboard.title} — Scene ${i + 1}`,
                    status: 'advanced-generating',
                    mode: 'agent-scene',
                    advancedConfig: {
                        prompt: scene.visualPrompt,
                        firstImageUrl,
                        aspectRatio,
                        duration: dur,
                        generateAudio: !(session.voiceover?.enabled || session.audioFileUrl),
                    },
                    routing: {
                        selectedModel: model,
                        resolution: '1080p',
                        mode: qualityMode,
                    },
                });

                // Build enriched prompt with storyboard context for script fidelity
                const enrichedPrompt = [
                    storyboard.visualStyle ? `VISUAL STYLE: ${storyboard.visualStyle}` : '',
                    storyboard.colorPalette ? `COLOR PALETTE: ${storyboard.colorPalette}` : '',
                    storyboard.characterAnchors?.length ? `CHARACTERS (maintain exact appearance): ${storyboard.characterAnchors.join('; ')}` : '',
                    scene.voiceoverText ? `NARRATION FOR THIS SCENE: "${scene.voiceoverText}" — the visuals MUST directly illustrate this narration.` : '',
                    scene.cameraAngle ? `CAMERA: ${scene.cameraAngle}` : '',
                    scene.lighting ? `LIGHTING: ${scene.lighting}` : '',
                    scene.visualPrompt,
                ].filter(Boolean).join('\n\n');

                const state = await advancedGenerateNode({
                    prompt: enrichedPrompt,
                    model,
                    duration: dur,
                    resolution: '1080p',
                    qualityMode,
                    firstImageUrl: firstImageUrl || '',
                    generateAudio: session.voiceover?.enabled !== true,
                    aspectRatio,
                    referenceImages: [
                        ...(session.referenceImages || []),
                        ...(session.productImages || []),
                    ].filter(u => u && !u.startsWith('data:')),
                });

                await VideoProject.findByIdAndUpdate(project._id, {
                    generation: state.generation,
                    backendPrompt: scene.visualPrompt,
                });

                sceneProjects.push({
                    projectId: project._id,
                    sceneNumber: scene.sceneNumber || i + 1,
                    duration: dur,
                    voiceoverText: scene.voiceoverText || '',
                    generation: state.generation,
                });

                console.log(`   🎥 Scene ${i + 1}: submitted (${model}, ${dur}s)`);
            } catch (sceneErr) {
                console.error(`   ❌ Scene ${i + 1} failed:`, sceneErr.message);
                sceneProjects.push({
                    projectId: null,
                    sceneNumber: scene.sceneNumber || i + 1,
                    duration: dur,
                    error: sceneErr.message,
                });
            }
        }

        // ── Generate voiceover if requested ──
        let voiceoverUrl = null;
        if (session.voiceover?.enabled && storyboard.voiceoverScript) {
            try {
                const voProvider = session.voiceover.provider || 'minimax';
                console.log(`   🎙️ Generating voiceover: ${voProvider}`);

                if (voProvider === 'minimax' || voProvider === 'elevenlabs') {
                    const falKey = process.env.FAL_API_KEY;
                    if (falKey) {
                        let ttsApiUrl, ttsPayload;
                        if (voProvider === 'elevenlabs') {
                            ttsApiUrl = 'https://fal.run/fal-ai/elevenlabs/tts/eleven-v3';
                            ttsPayload = {
                                text: storyboard.voiceoverScript,
                                voice: session.voiceover.voiceId || 'Rachel'
                            };
                        } else {
                            ttsApiUrl = 'https://fal.run/fal-ai/minimax/speech-02-hd';
                            ttsPayload = {
                                text: storyboard.voiceoverScript,
                                voice_setting: { voice_id: session.voiceover.voiceId || 'Deep_Voice_Man', speed: session.voiceover.speed || 1.0 }
                            };
                        }
                        // Use synchronous fal.run endpoint with timeout to guarantee completion
                        const ttsResp = await fetch(ttsApiUrl, {
                            method: 'POST',
                            headers: { 'Authorization': `Key ${falKey}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify(ttsPayload),
                            signal: AbortSignal.timeout(120000), // 120s for long scripts
                        });
                        if (ttsResp.ok) {
                            const ttsData = await ttsResp.json();
                            const rawAudioUrl = ttsData.audio?.url || ttsData.audio_url || ttsData.audio_file?.url || ttsData.url;
                            if (rawAudioUrl) {
                                // Mirror to S3 immediately so URL stays valid for compile
                                try {
                                    const audioResp = await fetch(rawAudioUrl, { signal: AbortSignal.timeout(20000) });
                                    const audioBuffer = Buffer.from(await audioResp.arrayBuffer());
                                    const s3Key = `agent-vo/${req.user._id}/${Date.now()}.mp3`;
                                    voiceoverUrl = await uploadToS3(audioBuffer, s3Key, 'audio/mpeg');
                                    console.log(`   ✅ Voiceover mirrored to S3: ${voiceoverUrl.substring(0, 60)}`);
                                } catch (mirrorErr) {
                                    console.warn(`   ⚠️ S3 mirror failed, using raw URL:`, mirrorErr.message);
                                    voiceoverUrl = rawAudioUrl;
                                }
                            }
                        } else {
                            console.warn(`   ⚠️ ${voProvider} generation failed:`, await ttsResp.text());
                        }
                    }
                } else if (voProvider === 'sarvam') {
                    const sarvamKey = process.env.SARVAM_API_KEY;
                    if (sarvamKey) {
                        const ttsResp = await fetch('https://api.sarvam.ai/text-to-speech', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'api-subscription-key': sarvamKey },
                            body: JSON.stringify({
                                inputs: [storyboard.voiceoverScript.substring(0, 2000)],
                                target_language_code: session.voiceover.langCode || 'en-IN',
                                speaker: session.voiceover.voiceId || 'anushka',
                                model: 'bulbul:v2',
                                pace: session.voiceover.speed || 1.0,
                            }),
                        });
                        if (ttsResp.ok) {
                            const ttsData = await ttsResp.json();
                            const audioBase64 = ttsData.audios?.[0];
                            if (audioBase64) {
                                const buffer = Buffer.from(audioBase64, 'base64');
                                const s3Key = `agent-vo/${req.user._id}/${Date.now()}.wav`;
                                voiceoverUrl = await uploadToS3(buffer, s3Key, 'audio/wav');
                            }
                        }
                    }
                }
            } catch (voErr) {
                console.error('   ⚠️ Voiceover generation failed:', voErr.message);
            }
        }

        // ── Generate AI background music if requested ──
        let musicUrl = null;
        if (session.music?.enabled) {
            try {
                const falKey = process.env.FAL_API_KEY;
                if (falKey) {
                    const musicMood = storyboard.suggestedMusicMood || session.music.mood || 'corporate';
                    const musicDuration = Math.min(storyboard.totalDuration || 30, 60);
                    const musicPrompt = `${musicMood} background music for a ${storyboard.title || 'brand'} video. Professional, modern, suitable for advertising. No vocals. Duration: ${musicDuration} seconds.`;

                    const musicResp = await fetch('https://queue.fal.run/fal-ai/stable-audio', {
                        method: 'POST',
                        headers: { 'Authorization': 'Key ' + falKey, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ prompt: musicPrompt, seconds_total: musicDuration, steps: 100 }),
                    });
                    if (musicResp.ok) {
                        const musicData = await musicResp.json();
                        if (musicData.request_id) musicUrl = 'fal-pending:' + musicData.request_id;
                        else if (musicData.audio_file?.url) musicUrl = musicData.audio_file.url;
                    }
                }
            } catch (musicErr) {
                console.error('   ⚠️ AI music gen failed:', musicErr.message);
            }
        }

        // Update session
        await AgentSession.findOneAndUpdate({ sessionId }, { status: 'generating', sceneProjects });

        const successfulScenes = sceneProjects.filter(s => s.projectId);

        res.json({
            success: true,
            sessionId,
            pipeline: {
                title: storyboard.title,
                totalDuration: storyboard.totalDuration,
                totalScenes: storyboard.scenes.length,
                model,
                aspectRatio,
            },
            scenes: sceneProjects,
            voiceover: {
                url: voiceoverUrl,
                script: storyboard.voiceoverScript || '',
                provider: session.voiceover?.provider || 'none',
            },
            music: { url: musicUrl, mood: storyboard.suggestedMusicMood || session.music?.mood || '' },
            audioFile: session.audioFileUrl ? { url: session.audioFileUrl, isBase: true, transcript: session.audioTranscript || null } : null,
        });

    } catch (error) {
        console.error('Video Agent generate error:', error);
        if (req.creditsDeducted > 0) {
            await refundCredits(req.user._id, req.creditsDeducted, 'videoGenerateRefund', `Refund: Video Agent Gen Failure (${safeErrorMessage(error)})`, 'video');
        }
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

router.post('/compile', protect, async (req, res) => {
    const fs = await import('fs');
    const path = await import('path');
    const os = await import('os');

    try {
        const { clips, voiceover, music, branding, brandId } = req.body;

        if (!clips || clips.length === 0) {
            return res.status(400).json({ success: false, error: 'At least one clip is required' });
        }

        console.log(`🎬 Video Agent: Compiling ${clips.length} clips`);

        // Create temp directory
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mantram-compile-'));

        try {
            // Step 1: Download all video clips
            const clipPaths = [];
            for (let i = 0; i < clips.length; i++) {
                const clip = clips[i];
                console.log(`   📥 Downloading clip ${i + 1}/${clips.length}: ${clip.title || 'clip'}`);

                const clipPath = path.join(tmpDir, `clip_${i}.mp4`);
                const resp = await fetch(clip.videoUrl, {
                    headers: { Authorization: req.headers.authorization || '' },
                    signal: AbortSignal.timeout(60000),
                }).catch(() => null);

                if (!resp || !resp.ok) {
                    // Retry without auth (external URLs)
                    const resp2 = await fetch(clip.videoUrl, {
                        signal: AbortSignal.timeout(60000),
                    });
                    if (!resp2.ok) throw new Error(`Failed to download clip ${i + 1}: ${resp2.status}`);
                    const buffer = Buffer.from(await resp2.arrayBuffer());
                    fs.writeFileSync(clipPath, buffer);
                } else {
                    const buffer = Buffer.from(await resp.arrayBuffer());
                    fs.writeFileSync(clipPath, buffer);
                }
                clipPaths.push(clipPath);
            }

            // Step 2: Download voiceover if provided
            let voiceoverPath = null;
            if (voiceover?.audioUrl) {
                console.log(`   🎙️ Downloading voiceover...`);
                voiceoverPath = path.join(tmpDir, 'voiceover.wav');
                const voResp = await fetch(voiceover.audioUrl, { signal: AbortSignal.timeout(30000) });
                if (voResp.ok) {
                    fs.writeFileSync(voiceoverPath, Buffer.from(await voResp.arrayBuffer()));
                }
            }

            // Step 3: Download music if provided
            let musicPath = null;
            if (music?.audioUrl && !music.audioUrl.startsWith('blob:')) {
                console.log(`   🎵 Downloading music track...`);
                musicPath = path.join(tmpDir, 'music.mp3');
                const musicResp = await fetch(music.audioUrl, { signal: AbortSignal.timeout(30000) });
                if (musicResp.ok) {
                    fs.writeFileSync(musicPath, Buffer.from(await musicResp.arrayBuffer()));
                }
            }

            // Step 4: Try FFmpeg compilation
            let outputPath = path.join(tmpDir, 'compiled.mp4');
            let usedFfmpeg = false;

            try {
                const { execSync } = await import('child_process');
                // Get ffmpeg path from npm package
                const ffmpegPath = (await import('@ffmpeg-installer/ffmpeg')).default?.path || (await import('@ffmpeg-installer/ffmpeg')).path;
                execSync(`"${ffmpegPath}" -version`, { stdio: 'pipe' });

                // Write concat file
                const concatFile = path.join(tmpDir, 'concat.txt');
                const concatContent = clipPaths.map(p => `file '${p}'`).join('\n');
                fs.writeFileSync(concatFile, concatContent);

                // Build ffmpeg command
                let ffmpegCmd = `"${ffmpegPath}" -y -f concat -safe 0 -i "${concatFile}"`;

                // Add voiceover as audio overlay
                if (voiceoverPath && fs.existsSync(voiceoverPath)) {
                    ffmpegCmd += ` -i "${voiceoverPath}"`;
                }

                // Add music as audio overlay
                if (musicPath && fs.existsSync(musicPath)) {
                    ffmpegCmd += ` -i "${musicPath}"`;
                }

                // Build filter complex for audio mixing
                const audioInputs = [];
                let inputIdx = 1; // 0 is video concat
                if (voiceoverPath && fs.existsSync(voiceoverPath)) {
                    audioInputs.push({ idx: inputIdx++, volume: 1.0, label: 'vo' });
                }
                if (musicPath && fs.existsSync(musicPath)) {
                    audioInputs.push({ idx: inputIdx++, volume: music?.volume || 0.3, label: 'music' });
                }

                if (audioInputs.length > 0) {
                    let filterComplex = '';
                    const mixInputs = ['[0:a]']; // original video audio

                    audioInputs.forEach(a => {
                        filterComplex += `[${a.idx}:a]volume=${a.volume}[${a.label}];`;
                        mixInputs.push(`[${a.label}]`);
                    });

                    filterComplex += `${mixInputs.join('')}amix=inputs=${mixInputs.length}:duration=longest[aout]`;
                    ffmpegCmd += ` -filter_complex "${filterComplex}" -map 0:v -map "[aout]"`;
                } else {
                    ffmpegCmd += ` -c copy`;
                }

                ffmpegCmd += ` -movflags +faststart "${outputPath}"`;

                console.log(`   🔧 FFmpeg command: ${ffmpegCmd.substring(0, 200)}...`);
                execSync(ffmpegCmd, { stdio: 'pipe', timeout: 120000 });
                usedFfmpeg = true;
                console.log(`   ✅ FFmpeg compilation complete`);

            } catch (ffmpegErr) {
                // FFmpeg not available — fall back to returning first clip or simple concat
                console.log(`   ⚠️ FFmpeg not available: ${ffmpegErr.message?.substring(0, 100)}`);

                if (clipPaths.length === 1) {
                    outputPath = clipPaths[0];
                    usedFfmpeg = false;
                } else {
                    // Without FFmpeg, return the clips as a sequence
                    // Upload each to S3 and return the list
                    const clipUrls = [];
                    for (let i = 0; i < clipPaths.length; i++) {
                        const clipBuffer = fs.readFileSync(clipPaths[i]);
                        const s3Key = `compiled-video/${req.user._id}/${Date.now()}-clip-${i}.mp4`;
                        const url = await uploadToS3(clipBuffer, s3Key, 'video/mp4');
                        clipUrls.push(url);
                    }

                    // Upload voiceover separately if present
                    let voiceoverUrl = voiceover?.audioUrl || null;

                    // Clean up
                    fs.rmSync(tmpDir, { recursive: true, force: true });

                    return res.json({
                        success: true,
                        compiled: false,
                        message: 'FFmpeg not installed — returning clips as sequence. Install FFmpeg on server for auto-compilation.',
                        clipUrls,
                        voiceoverUrl,
                        totalClips: clips.length,
                    });
                }
            }

            // Step 5: Upload compiled video to S3
            const compiledBuffer = fs.readFileSync(outputPath);
            const compiledKey = `compiled-video/${req.user._id}/${Date.now()}-compiled.mp4`;
            const videoUrl = await uploadToS3(compiledBuffer, compiledKey, 'video/mp4');

            console.log(`   ✅ Compiled video uploaded: ${videoUrl.substring(0, 80)}...`);

            // Clean up temp files
            fs.rmSync(tmpDir, { recursive: true, force: true });

            res.json({
                success: true,
                compiled: true,
                videoUrl,
                totalClips: clips.length,
                usedFfmpeg,
            });

        } catch (innerErr) {
            // Clean up on error
            try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
            throw innerErr;
        }

    } catch (error) {
        console.error('Video compile error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// Validate :id parameter — skip non-ObjectId values so named routes like /models work
router.param('id', (req, res, next, id) => {
    if (!mongoose.isValidObjectId(id)) {
        return next('route'); // Skip to next matching route instead of erroring
    }
    next();
});
// ══════════════════════════════════════════════════════════════════════════════
// POST /api/video-studio/start — Create project + brainstorm concepts
// ══════════════════════════════════════════════════════════════════════════════
router.post('/start', protect, requireCredits('videoBrainstorm'), async (req, res) => {
    try {
        const { brandId, brief, images, videoType } = req.body;

        if (!brief && (!images || images.length === 0)) {
            return res.status(400).json({ success: false, error: 'Provide a brief or at least one image' });
        }

        // Validate brand exists (optional — no brand = generic style)
        let brand = null;
        if (brandId) {
            brand = await Brand.findOne({ _id: brandId, $or: [{ user: req.user._id }, { sharedWith: req.user._id }] });
            if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });
        }

        // ── Upload data-URI images to S3 so they become HTTP URLs ──
        // Frontend sends user uploads as data:image/...;base64,... which gets
        // filtered out by all downstream url.startsWith('http') checks.
        // Fix: upload to S3 NOW so every downstream step can use them.
        const processedImages = [];
        for (const img of (images || [])) {
            if (img.url && img.url.startsWith('data:')) {
                try {
                    console.log(`📤 Uploading user image to S3: ${(img.label || 'unnamed').substring(0, 40)}...`);
                    const s3Url = await ensureS3Url(img.url, 'video-studio/user-uploads');
                    if (s3Url) {
                        processedImages.push({ url: s3Url, source: img.source || 'upload', label: img.label || '' });
                        console.log(`✅ User image uploaded: ${s3Url.substring(0, 80)}`);
                    } else {
                        processedImages.push({ url: img.url, source: img.source || 'upload', label: img.label || '' });
                    }
                } catch (e) {
                    console.warn(`⚠️ Failed to upload user image to S3: ${e.message}`);
                    processedImages.push({ url: img.url, source: img.source || 'upload', label: img.label || '' });
                }
            } else {
                processedImages.push({ url: img.url, source: img.source || 'upload', label: img.label || '' });
            }
        }

        // Create project
        const project = await VideoProject.create({
            user: req.user._id,
            brand: brandId || null,
            title: 'Untitled Video',
            status: 'brainstorm',
            input: {
                brief: brief || '',
                inputType: brief && processedImages.length ? 'both' : processedImages.length ? 'image' : 'text',
                images: processedImages,
                videoType: videoType || 'ad-film',
            },
        });

        console.log(`🎬 Video Studio: Created project ${project._id} (${processedImages.length} images, all S3)`);

        // Run MCoT visual grounding BEFORE brainstorm (non-blocking)
        let visualGrounding = null;
        if (brandId) {
            try {
                console.log(`🧠 MCoT Video: Running visual grounding before brainstorm...`);
                const groundingState = await videoVisualGroundingNode({
                    brandId,
                    brief: brief || '',
                });
                visualGrounding = groundingState.visualGrounding;
                if (visualGrounding) {
                    console.log(`🧠 MCoT Video: Visual grounding complete — mood: ${visualGrounding.brandMood || 'n/a'}`);
                }
            } catch (groundErr) {
                console.warn('🧠 MCoT Video: Visual grounding failed (non-blocking):', groundErr.message);
            }
        }

        // Run brainstorm node (with visual grounding injected)
        const state = await runStep(project._id, 'brainstorm', brainstormNode, {
            userId: req.user._id.toString(),
            brandId: brandId || null,
            brief: brief || '',
            inputImages: images || [],
            videoType: videoType || 'ad-film',
            visualGrounding,
        });

        // Get style preferences if available
        const stylePrefs = brandId ? await getStylePreferences(brandId, req.user._id) : null;

        res.json({
            success: true,
            project: {
                _id: project._id,
                status: 'brainstorm',
                concepts: state.concepts,
                pipeline: getPipelineInfo('brainstorm'),
                stylePreferences: stylePrefs,
            },
        });
    } catch (error) {
        console.error('Video Studio start error:', error);
        if (req.creditsDeducted > 0) {
            await refundCredits(req.user._id, req.creditsDeducted, 'videoBrainstorm', `Refund: Video Brainstorm Sync Failure (${safeErrorMessage(error)})`, 'video');
        }
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  HEYGEN UGC — Avatar-Based Video Generation                                ║
// ║  NOTE: These routes MUST be above /:id routes to avoid param conflicts      ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/video-studio/heygen/avatars — List available HeyGen avatars
// ══════════════════════════════════════════════════════════════════════════════
router.get('/heygen/avatars', protect, async (req, res) => {
    try {
        const avatars = await listAvatars();
        res.json({ success: true, avatars });
    } catch (error) {
        console.error('HeyGen avatars error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/video-studio/heygen/voices — List available HeyGen voices
// ══════════════════════════════════════════════════════════════════════════════
router.get('/heygen/voices', protect, async (req, res) => {
    try {
        const voices = await listVoices();
        const { language } = req.query;
        const filtered = language
            ? voices.filter(v => v.language?.toLowerCase().includes(language.toLowerCase()))
            : voices;
        res.json({ success: true, voices: filtered });
    } catch (error) {
        console.error('HeyGen voices error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/video-studio/heygen/styles — List UGC video styles
// ══════════════════════════════════════════════════════════════════════════════
router.get('/heygen/styles', protect, (req, res) => {
    res.json({ success: true, styles: UGC_STYLES });
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/video-studio/ugc/sarvam-voices — List Sarvam Indian voices
// ══════════════════════════════════════════════════════════════════════════════
router.get('/ugc/sarvam-voices', protect, (req, res) => {
    // Sarvam Bulbul v2 supported speakers and languages
    const SARVAM_VOICES = [
        { voice_id: 'sarvam__meera__hi-IN', name: 'Meera', language: 'Hindi', gender: 'Female', speaker: 'meera', lang_code: 'hi-IN', provider: 'sarvam' },
        { voice_id: 'sarvam__anushka__hi-IN', name: 'Anushka', language: 'Hindi', gender: 'Female', speaker: 'anushka', lang_code: 'hi-IN', provider: 'sarvam' },
        { voice_id: 'sarvam__arvind__hi-IN', name: 'Arvind', language: 'Hindi', gender: 'Male', speaker: 'arvind', lang_code: 'hi-IN', provider: 'sarvam' },
        { voice_id: 'sarvam__meera__ta-IN', name: 'Meera (Tamil)', language: 'Tamil', gender: 'Female', speaker: 'meera', lang_code: 'ta-IN', provider: 'sarvam' },
        { voice_id: 'sarvam__anushka__ta-IN', name: 'Anushka (Tamil)', language: 'Tamil', gender: 'Female', speaker: 'anushka', lang_code: 'ta-IN', provider: 'sarvam' },
        { voice_id: 'sarvam__arvind__ta-IN', name: 'Arvind (Tamil)', language: 'Tamil', gender: 'Male', speaker: 'arvind', lang_code: 'ta-IN', provider: 'sarvam' },
        { voice_id: 'sarvam__meera__te-IN', name: 'Meera (Telugu)', language: 'Telugu', gender: 'Female', speaker: 'meera', lang_code: 'te-IN', provider: 'sarvam' },
        { voice_id: 'sarvam__arvind__te-IN', name: 'Arvind (Telugu)', language: 'Telugu', gender: 'Male', speaker: 'arvind', lang_code: 'te-IN', provider: 'sarvam' },
        { voice_id: 'sarvam__meera__bn-IN', name: 'Meera (Bengali)', language: 'Bengali', gender: 'Female', speaker: 'meera', lang_code: 'bn-IN', provider: 'sarvam' },
        { voice_id: 'sarvam__arvind__bn-IN', name: 'Arvind (Bengali)', language: 'Bengali', gender: 'Male', speaker: 'arvind', lang_code: 'bn-IN', provider: 'sarvam' },
        { voice_id: 'sarvam__meera__mr-IN', name: 'Meera (Marathi)', language: 'Marathi', gender: 'Female', speaker: 'meera', lang_code: 'mr-IN', provider: 'sarvam' },
        { voice_id: 'sarvam__arvind__mr-IN', name: 'Arvind (Marathi)', language: 'Marathi', gender: 'Male', speaker: 'arvind', lang_code: 'mr-IN', provider: 'sarvam' },
        { voice_id: 'sarvam__meera__gu-IN', name: 'Meera (Gujarati)', language: 'Gujarati', gender: 'Female', speaker: 'meera', lang_code: 'gu-IN', provider: 'sarvam' },
        { voice_id: 'sarvam__arvind__gu-IN', name: 'Arvind (Gujarati)', language: 'Gujarati', gender: 'Male', speaker: 'arvind', lang_code: 'gu-IN', provider: 'sarvam' },
        { voice_id: 'sarvam__meera__kn-IN', name: 'Meera (Kannada)', language: 'Kannada', gender: 'Female', speaker: 'meera', lang_code: 'kn-IN', provider: 'sarvam' },
        { voice_id: 'sarvam__arvind__kn-IN', name: 'Arvind (Kannada)', language: 'Kannada', gender: 'Male', speaker: 'arvind', lang_code: 'kn-IN', provider: 'sarvam' },
        { voice_id: 'sarvam__meera__ml-IN', name: 'Meera (Malayalam)', language: 'Malayalam', gender: 'Female', speaker: 'meera', lang_code: 'ml-IN', provider: 'sarvam' },
        { voice_id: 'sarvam__arvind__ml-IN', name: 'Arvind (Malayalam)', language: 'Malayalam', gender: 'Male', speaker: 'arvind', lang_code: 'ml-IN', provider: 'sarvam' },
        { voice_id: 'sarvam__meera__pa-IN', name: 'Meera (Punjabi)', language: 'Punjabi', gender: 'Female', speaker: 'meera', lang_code: 'pa-IN', provider: 'sarvam' },
        { voice_id: 'sarvam__anushka__en-IN', name: 'Anushka (English)', language: 'English (Indian)', gender: 'Female', speaker: 'anushka', lang_code: 'en-IN', provider: 'sarvam' },
        { voice_id: 'sarvam__arvind__en-IN', name: 'Arvind (English)', language: 'English (Indian)', gender: 'Male', speaker: 'arvind', lang_code: 'en-IN', provider: 'sarvam' },
    ];

    res.json({ success: true, voices: SARVAM_VOICES });
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/video-studio/ugc/sarvam-tts — Generate TTS audio via Sarvam, upload to S3
// ══════════════════════════════════════════════════════════════════════════════
router.post('/ugc/sarvam-tts', protect, async (req, res) => {
    try {
        const { text, speaker, langCode } = req.body;
        if (!text?.trim()) return res.status(400).json({ success: false, error: 'Text is required' });

        const apiKey = process.env.SARVAM_API_KEY;
        if (!apiKey) return res.status(500).json({ success: false, error: 'Sarvam API key not configured' });

        // Generate TTS
        const ttsResp = await fetch('https://api.sarvam.ai/text-to-speech', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'api-subscription-key': apiKey },
            body: JSON.stringify({
                inputs: [text.trim().substring(0, 2000)],
                target_language_code: langCode || 'hi-IN',
                speaker: speaker || 'anushka',
                model: 'bulbul:v2',
                pitch: 0,
                pace: 1.0,
                loudness: 1.5,
                enable_preprocessing: true,
            }),
        });

        if (!ttsResp.ok) {
            const errBody = await ttsResp.text().catch(() => '');
            throw new Error(`Sarvam TTS failed (${ttsResp.status}): ${errBody.substring(0, 200)}`);
        }

        const ttsData = await ttsResp.json();
        const audioBase64 = ttsData.audios?.[0];
        if (!audioBase64) throw new Error('No audio returned from Sarvam');

        // Upload WAV to S3
        const buffer = Buffer.from(audioBase64, 'base64');
        const s3Key = `ugc-tts/${req.user._id}/${Date.now()}.wav`;
        const audioUrl = await uploadToS3(buffer, s3Key, 'audio/wav');

        console.log(`✅ Sarvam TTS uploaded to S3: ${audioUrl.substring(0, 80)}`);

        res.json({ success: true, audioUrl, duration: Math.round(buffer.length / 16000) }); // rough estimate
    } catch (error) {
        console.error('Sarvam TTS error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// Voice Cloning — Multer config for audio uploads
// ══════════════════════════════════════════════════════════════════════════════
const audioUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 30 * 1024 * 1024 }, // 30MB max
    fileFilter: (req, file, cb) => {
        const allowed = ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/x-m4a', 'audio/webm', 'audio/ogg', 'audio/mp3'];
        if (allowed.includes(file.mimetype) || file.originalname.match(/\.(mp3|wav|m4a|webm|ogg)$/i)) {
            cb(null, true);
        } else {
            cb(new Error('Only audio files (MP3, WAV, M4A, WebM, OGG) are allowed'), false);
        }
    },
});

// Indian languages that should route to Sarvam
const INDIAN_LANG_SET = new Set([
    'Hindi', 'Tamil', 'Telugu', 'Bengali', 'Marathi', 'Gujarati', 'Punjabi',
    'Kannada', 'Malayalam', 'Urdu', 'Odia', 'Assamese', 'Nepali',
    'hindi', 'tamil', 'telugu', 'bengali', 'marathi', 'gujarati', 'punjabi',
    'kannada', 'malayalam', 'urdu', 'odia', 'assamese', 'nepali',
]);

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/video-studio/ugc/voice-clone/upload — Upload audio sample for cloning
// ══════════════════════════════════════════════════════════════════════════════
router.post('/ugc/voice-clone/upload', protect, audioUpload.single('audio'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, error: 'Audio file is required (10s+ recommended)' });

        const ext = req.file.originalname.split('.').pop() || 'wav';
        const mimeType = req.file.mimetype || 'audio/wav';
        const s3Key = `voice-clones/${req.user._id}/${Date.now()}.${ext}`;
        const audioUrl = await uploadToS3(req.file.buffer, s3Key, mimeType);

        console.log(`✅ Voice sample uploaded: ${audioUrl.substring(0, 80)}... (${(req.file.size / 1024).toFixed(1)}KB)`);
        res.json({ success: true, audioUrl });
    } catch (error) {
        console.error('Voice clone upload error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/video-studio/ugc/voice-clone/clone — Submit voice cloning request
// Routes to Minimax (fal.ai) for global or Sarvam for Indian languages
// ══════════════════════════════════════════════════════════════════════════════
const FAL_QUEUE_URL = 'https://queue.fal.run';

router.post('/ugc/voice-clone/clone', protect, requireCredits('voiceClone'), async (req, res) => {
    try {
        const { audioUrl, name, language, gender, brandId } = req.body;
        if (!audioUrl) return res.status(400).json({ success: false, error: 'Audio URL is required' });

        const isIndian = INDIAN_LANG_SET.has(language);
        const provider = isIndian ? 'sarvam' : 'minimax';

        console.log(`🎙️ Voice Clone: provider=${provider}, language=${language}, name=${name}`);

        // Create ClonedVoice record
        const clonedVoice = new ClonedVoice({
            user: req.user._id,
            brand: brandId || undefined,
            name: name || 'My Cloned Voice',
            provider,
            language: language || 'English',
            gender: gender || 'Unknown',
            sampleAudioUrl: audioUrl,
            status: 'cloning',
        });

        if (provider === 'minimax') {
            // ── Minimax via fal.ai ──
            const falKey = process.env.FAL_API_KEY;
            if (!falKey) {
                clonedVoice.status = 'failed';
                clonedVoice.error = 'FAL_API_KEY not configured';
                await clonedVoice.save();
                return res.status(500).json({ success: false, error: 'Voice cloning service not configured' });
            }

            const endpoint = 'fal-ai/minimax/voice-clone';
            const payload = {
                audio_url: audioUrl,
                text: 'Hello, this is a preview of your cloned voice! I hope you like it!',
                model: 'speech-02-hd',
                noise_reduction: true,
                need_volume_normalization: true,
            };

            console.log(`🔊 Submitting to fal.ai: ${endpoint}`);
            const response = await fetch(`${FAL_QUEUE_URL}/${endpoint}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Key ${falKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(30000),
            });

            if (!response.ok) {
                const errText = await response.text();
                console.error(`❌ fal.ai voice-clone error: ${response.status}`, errText);
                clonedVoice.status = 'failed';
                clonedVoice.error = `Cloning failed (${response.status})`;
                await clonedVoice.save();
                return res.status(500).json({ success: false, error: `Voice cloning failed: ${errText.substring(0, 200)}` });
            }

            const data = await response.json();
            clonedVoice.falRequestId = data.request_id;
            console.log(`✅ fal.ai voice-clone queued: requestId=${data.request_id}`);

        } else {
            // ── Sarvam — use existing TTS voices as "cloned" voices ──
            // Sarvam doesn't have a public instant-clone API, but we can
            // create a personalized voice profile using their TTS with the
            // closest matching speaker. For now, mark as ready with the
            // best matching Sarvam speaker.
            const sarvamSpeaker = (gender || '').toLowerCase() === 'male' ? 'arvind' : 'anushka';
            clonedVoice.voiceId = `sarvam__${sarvamSpeaker}__custom`;
            clonedVoice.status = 'ready';
            clonedVoice.previewAudioUrl = audioUrl; // Use sample as preview
            console.log(`✅ Sarvam voice profile created: ${sarvamSpeaker}`);
        }

        await clonedVoice.save();

        res.json({
            success: true,
            cloneId: clonedVoice._id,
            status: clonedVoice.status,
            provider,
            message: provider === 'minimax'
                ? 'Voice cloning in progress — this takes 30-60 seconds'
                : 'Indian voice profile created successfully',
        });
    } catch (error) {
        console.error('Voice clone error:', error);
        if (req.creditsDeducted > 0) {
            await refundCredits(req.user._id, req.creditsDeducted, 'voiceCloneRefund', `Refund: Voice Cloning Sync Failure (${safeErrorMessage(error)})`, 'video');
        }
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/video-studio/ugc/voice-clone/status/:id — Poll voice cloning status
// ══════════════════════════════════════════════════════════════════════════════
router.get('/ugc/voice-clone/status/:id', protect, async (req, res) => {
    try {
        const clone = await ClonedVoice.findOne({ _id: req.params.id, user: req.user._id });
        if (!clone) return res.status(404).json({ success: false, error: 'Cloned voice not found' });

        // Already resolved
        if (clone.status !== 'cloning') {
            return res.json({
                success: true,
                status: clone.status,
                voiceId: clone.voiceId,
                previewAudioUrl: clone.previewAudioUrl,
                name: clone.name,
            });
        }

        // Poll fal.ai for Minimax
        if (clone.provider === 'minimax' && clone.falRequestId) {
            const falKey = process.env.FAL_API_KEY;
            const statusUrl = `${FAL_QUEUE_URL}/fal-ai/minimax/requests/${clone.falRequestId}/status`;
            const resultUrl = `${FAL_QUEUE_URL}/fal-ai/minimax/requests/${clone.falRequestId}`;

            const statusResp = await fetch(statusUrl, {
                headers: { 'Authorization': `Key ${falKey}` },
            });

            if (statusResp.ok) {
                const statusData = await statusResp.json();
                console.log(`📊 Voice clone status: ${statusData.status}`);

                if (statusData.status === 'COMPLETED') {
                    // Fetch result
                    const resultResp = await fetch(resultUrl, {
                        headers: { 'Authorization': `Key ${falKey}` },
                    });
                    const resultData = await resultResp.json();

                    clone.voiceId = resultData.custom_voice_id || '';
                    clone.status = 'ready';

                    // Save preview audio to S3
                    if (resultData.audio?.url) {
                        try {
                            const audioResp = await fetch(resultData.audio.url);
                            const audioBuffer = Buffer.from(await audioResp.arrayBuffer());
                            const s3Key = `voice-clones/${req.user._id}/preview-${Date.now()}.mp3`;
                            clone.previewAudioUrl = await uploadToS3(audioBuffer, s3Key, 'audio/mpeg');
                        } catch (e) {
                            clone.previewAudioUrl = resultData.audio.url; // Fallback to fal URL
                        }
                    }

                    await clone.save();
                    console.log(`✅ Voice cloned: ${clone.voiceId}`);
                } else if (statusData.status === 'FAILED') {
                    clone.status = 'failed';
                    clone.error = 'Voice cloning failed on the provider';
                    await clone.save();
                }
            }
        }

        res.json({
            success: true,
            status: clone.status,
            voiceId: clone.voiceId,
            previewAudioUrl: clone.previewAudioUrl,
            name: clone.name,
            error: clone.error,
        });
    } catch (error) {
        console.error('Voice clone status error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/video-studio/ugc/voice-clone/list — List user's cloned voices
// ══════════════════════════════════════════════════════════════════════════════
router.get('/ugc/voice-clone/list', protect, async (req, res) => {
    try {
        const voices = await ClonedVoice.find({
            user: req.user._id,
            status: { $ne: 'failed' },
        }).sort({ createdAt: -1 }).lean();

        res.json({
            success: true,
            voices: voices.map(v => ({
                _id: v._id,
                voice_id: `cloned__${v._id}`,
                name: v.name,
                provider: v.provider,
                voiceId: v.voiceId,
                language: v.language,
                gender: v.gender,
                status: v.status,
                previewAudioUrl: v.previewAudioUrl,
                sampleAudioUrl: v.sampleAudioUrl,
                createdAt: v.createdAt,
            })),
        });
    } catch (error) {
        console.error('Voice clone list error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// DELETE /api/video-studio/ugc/voice-clone/:id — Delete a cloned voice
// ══════════════════════════════════════════════════════════════════════════════
router.delete('/ugc/voice-clone/:id', protect, async (req, res) => {
    try {
        const deleted = await ClonedVoice.findOneAndDelete({ _id: req.params.id, user: req.user._id });
        if (!deleted) return res.status(404).json({ success: false, error: 'Voice not found' });
        console.log(`🗑️ Cloned voice deleted: ${deleted.name}`);
        res.json({ success: true });
    } catch (error) {
        console.error('Voice clone delete error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/video-studio/ugc/minimax-tts — Generate speech with cloned voice
// Uses fal.ai speech-02-hd with a custom_voice_id from voice-clone
// ══════════════════════════════════════════════════════════════════════════════
router.post('/ugc/minimax-tts', protect, async (req, res) => {
    try {
        const { text, voiceId, speed, emotion, languageBoost } = req.body;
        if (!text) return res.status(400).json({ success: false, error: 'Text is required' });
        if (!voiceId) return res.status(400).json({ success: false, error: 'voiceId (custom_voice_id) is required' });

        const falKey = process.env.FAL_API_KEY;
        if (!falKey) return res.status(500).json({ success: false, error: 'FAL_API_KEY not configured' });

        console.log(`🔊 Minimax TTS: voiceId=${voiceId}, text=${text.substring(0, 60)}...`);

        const payload = {
            text,
            voice_setting: {
                voice_id: voiceId,
                speed: speed || 1,
            },
            output_format: 'url',
            language_boost: languageBoost || 'auto',
        };
        if (emotion) payload.voice_setting.emotion = emotion;

        // Use synchronous fal.run endpoint — eliminates queue polling failures
        const FAL_SYNC_URL = 'https://fal.run';
        console.log(`🔊 Minimax TTS: calling synchronous endpoint for voice ${voiceId}...`);
        const resp = await fetch(`${FAL_SYNC_URL}/fal-ai/minimax/speech-02-hd`, {
            method: 'POST',
            headers: {
                'Authorization': `Key ${falKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(120000), // 120s timeout for longer scripts
        });

        if (!resp.ok) {
            const errText = await resp.text();
            console.error(`❌ Minimax TTS error: ${resp.status}`, errText);
            return res.status(500).json({ success: false, error: `TTS failed: ${errText.substring(0, 200)}` });
        }

        const result = await resp.json();

        const generatedAudioUrl = result?.audio?.url || result?.audio_url || result?.audio_file?.url || result?.url;
        if (!generatedAudioUrl) {
            return res.status(500).json({ success: false, error: 'Minimax TTS returned no audio' });
        }

        // Download audio and upload to S3
        const audioResp = await fetch(generatedAudioUrl);
        const audioBuffer = Buffer.from(await audioResp.arrayBuffer());
        const s3Key = `voice-tts/${req.user._id}/${Date.now()}.mp3`;
        const audioUrl = await uploadToS3(audioBuffer, s3Key, 'audio/mpeg');

        console.log(`✅ Minimax TTS complete: ${audioUrl.substring(0, 80)}...`);
        res.json({ success: true, audioUrl, durationMs: result.duration_ms });
    } catch (error) {
        console.error('Minimax TTS error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/video-studio/ugc/script/humanize — AI injects emotion/natural tags
// Supported tags: (laughs), (chuckle), (sighs), (breath), (gasp),
//                 (clear-throat), (coughs), (humming), (whistles)
// ══════════════════════════════════════════════════════════════════════════════
router.post('/ugc/script/humanize', protect, async (req, res) => {
    try {
        const { script, emotionTag, language } = req.body;
        if (!script?.trim()) return res.status(400).json({ success: false, error: 'Script text is required' });

        const supportedTags = '(laughs), (sighs), (coughs), (clears throat), (gasps), (sniffs), (groans), (yawns)';

        let emotionInstruction = '';
        if (emotionTag && emotionTag !== 'auto') {
            const emotionTagMap = {
                happy: '(laughs), (sniffs)',
                sad: '(sighs), (groans)',
                surprised: '(gasps)',
                nervous: '(clears throat), (sighs)',
                casual: '(laughs), (sighs), (yawns)',
                energetic: '(laughs), (gasps)',
            };
            emotionInstruction = `Focus on these emotion tags for a "${emotionTag}" tone: ${emotionTagMap[emotionTag] || supportedTags}.`;
        }

        const systemPrompt = `You are an expert voice-over script humanizer. Your job is to take a UGC script and inject natural human expression tags to make text-to-speech output sound realistic, emotional, and engaging.

SUPPORTED TAGS (use ONLY these): ${supportedTags}

RULES:
1. Insert tags naturally at pauses, transitions, and emotional moments
2. Don't overdo it — 3-6 tags for a 30-second script, 6-10 for a 60-second script
3. Place tags BETWEEN sentences or at natural pause points, wrapped in parentheses
4. Preserve the original script meaning — don't change words, only add tags
5. (sighs) or (clears throat) should go at the start of a new thought or after intense statements
6. (laughs) or (sniffs) for light/funny moments
7. (sighs) or (groans) for reflective, wistful, or tired moments
8. (gasps) for surprise or excitement reveals
9. (clears throat) at the very beginning for a natural start
10. Return ONLY the humanized script text, nothing else — no explanations
${emotionInstruction}
${language && language !== 'english' ? `The script is in ${language}. Keep the language as-is, only add English emotion tags.` : ''}`;

        const ai = getAIRouter();
        const result = await ai.generateText({
            systemPrompt,
            userPrompt: `Humanize this script:\n\n${script}`,
            maxTokens: 2000,
            temperature: 0.6,
        });

        let humanizedScript = (result.text || result.content || '')
            .replace(/<think>[\s\S]*?<\/think>/gi, '')
            .replace(/<\/?think>/gi, '')
            .replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '')
            .trim();

        // If AI returned JSON despite instructions, extract the script text
        if (humanizedScript.startsWith('{')) {
            try {
                const obj = JSON.parse(humanizedScript);
                humanizedScript = obj.humanizedScript || obj.script || obj.text || humanizedScript;
            } catch { /* not JSON */ }
        }
        // Strip wrapping quotes
        if ((humanizedScript.startsWith('"') && humanizedScript.endsWith('"')) ||
            (humanizedScript.startsWith("'") && humanizedScript.endsWith("'"))) {
            humanizedScript = humanizedScript.slice(1, -1);
        }

        if (!humanizedScript) throw new Error('AI did not return humanized script');

        console.log(`✨ Script humanized: ${humanizedScript.length} chars, emotion=${emotionTag || 'auto'}`);
        res.json({ success: true, humanizedScript });
    } catch (error) {
        console.error('Script humanize error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/video-studio/ugc/enhance-photo — Enhance avatar photo with AI (Nanobanana 2)
// ══════════════════════════════════════════════════════════════════════════════
router.post('/ugc/enhance-photo', protect, requireCredits('imageEnhance'), async (req, res) => {
    try {
        const { imageBase64, imageUrl, prompt } = req.body;
        if (!prompt?.trim()) return res.status(400).json({ success: false, error: 'Enhancement prompt is required' });
        if (!imageBase64 && !imageUrl) return res.status(400).json({ success: false, error: 'Image is required' });

        const geminiKey = process.env.GEMINI_IMAGE_API_KEY || process.env.GEMINI_API_KEY;
        if (!geminiKey) return res.status(500).json({ success: false, error: 'Gemini API key not configured' });

        console.log(`🎨 Enhancing photo with Nanobanana 2: prompt="${prompt.substring(0, 60)}"`);

        // Get image as base64
        let imgBase64, imgMime;
        if (imageBase64) {
            // Extract base64 data and mime type from data URL
            const match = imageBase64.match(/^data:(image\/\w+);base64,(.+)$/);
            if (match) {
                imgMime = match[1];
                imgBase64 = match[2];
            } else {
                imgBase64 = imageBase64;
                imgMime = 'image/png';
            }
        } else {
            // Download from URL
            const imgResp = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) });
            if (!imgResp.ok) throw new Error(`Failed to download source image (${imgResp.status})`);
            const imgBuffer = Buffer.from(await imgResp.arrayBuffer());
            imgBase64 = imgBuffer.toString('base64');
            imgMime = imgResp.headers.get('content-type') || 'image/png';
        }

        // Call NanoBanana 2 (Gemini 3.1 Flash Image Preview) with the image + edit prompt
        const modelId = 'gemini-3.1-flash-image-preview'; // NanoBanana 2
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${geminiKey}`;

        const geminiResp = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                // systemInstruction locks the model into photography mode — prevents 3D/illustration output
                systemInstruction: {
                    parts: [{ text: 'You are a professional photo editor. You only produce realistic photographs of real people. Never produce illustrations, 3D renders, cartoons, paintings, or digital art. Every output must look like a real photograph taken by a professional camera.' }]
                },
                contents: [{
                    role: 'user',
                    parts: [
                        { inlineData: { mimeType: imgMime, data: imgBase64 } },
                        { text: `Edit this real photograph: ${prompt.trim()}. Preserve the person's exact face, skin tone, and identity. Only modify what is described. Output must be a photorealistic photograph — not an illustration or render.` },
                    ],
                }],
                generationConfig: { responseModalities: ['TEXT', 'IMAGE'], temperature: 0.1 },
            }),
            signal: AbortSignal.timeout(60000),
        });

        if (!geminiResp.ok) {
            const errText = await geminiResp.text();
            console.error('Nanobanana 2 enhance error:', geminiResp.status, errText.substring(0, 300));
            throw new Error(`Nanobanana 2 enhancement failed (${geminiResp.status})`);
        }

        const geminiData = await geminiResp.json();
        if (geminiData.error) throw new Error(geminiData.error.message);

        // Extract the generated image from response parts
        const parts = geminiData.candidates?.[0]?.content?.parts || [];
        let enhancedBase64 = null;
        let enhancedMime = 'image/png';
        for (const part of parts) {
            if (part.inlineData?.mimeType?.startsWith('image/')) {
                enhancedBase64 = part.inlineData.data;
                enhancedMime = part.inlineData.mimeType;
                break;
            }
        }

        if (!enhancedBase64) throw new Error('Nanobanana 2 did not return an enhanced image');

        // Upload enhanced image to S3
        const buffer = Buffer.from(enhancedBase64, 'base64');
        const ext = enhancedMime.includes('jpeg') ? 'jpg' : 'png';
        const s3Key = `ugc-enhance/${req.user._id}/${Date.now()}-enhanced.${ext}`;
        const enhancedUrl = await uploadToS3(buffer, s3Key, enhancedMime);

        console.log(`✅ Photo enhanced with Nanobanana 2: ${enhancedUrl.substring(0, 80)}`);

        res.json({ success: true, enhancedUrl, model: 'NanoBanana 2' });
    } catch (error) {
        console.error('Photo enhance error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/video-studio/ugc/sarvam-preview — Short TTS preview for Sarvam voices
// ══════════════════════════════════════════════════════════════════════════════
router.post('/ugc/sarvam-preview', protect, async (req, res) => {
    try {
        const { speaker, langCode } = req.body;
        const apiKey = process.env.SARVAM_API_KEY;
        if (!apiKey) return res.status(500).json({ success: false, error: 'Sarvam API key not configured' });

        // Short sample sentence per language
        const SAMPLES = {
            'hi-IN': 'नमस्ते, मैं आपका डिजिटल सहायक हूँ।',
            'ta-IN': 'வணக்கம், நான் உங்கள் டிஜிட்டல் உதவியாளர்.',
            'te-IN': 'నమస్కారం, నేను మీ డిజిటల్ సహాయకుడిని.',
            'bn-IN': 'নমস্কার, আমি আপনার ডিজিটাল সহায়ক।',
            'mr-IN': 'नमस्कार, मी तुमचा डिजिटल सहाय्यक आहे.',
            'gu-IN': 'નમસ્તે, હું તમારો ડિજિટલ સહાયક છું.',
            'kn-IN': 'ನಮಸ್ಕಾರ, ನಾನು ನಿಮ್ಮ ಡಿಜಿಟಲ್ ಸಹಾಯಕ.',
            'ml-IN': 'നമസ്കാരം, ഞാൻ നിങ്ങളുടെ ഡിജിറ്റൽ സഹായിയാണ്.',
            'pa-IN': 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ, ਮੈਂ ਤੁਹਾਡਾ ਡਿਜੀਟਲ ਸਹਾਇਕ ਹਾਂ।',
            'en-IN': 'Hello, I am your digital brand assistant.',
        };

        const sampleText = SAMPLES[langCode] || SAMPLES['en-IN'];

        const ttsResp = await fetch('https://api.sarvam.ai/text-to-speech', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'api-subscription-key': apiKey },
            body: JSON.stringify({
                inputs: [sampleText],
                target_language_code: langCode || 'hi-IN',
                speaker: speaker || 'meera',
                model: 'bulbul:v2',
                pitch: 0,
                pace: 1.0,
                loudness: 1.5,
                enable_preprocessing: true,
            }),
        });

        if (!ttsResp.ok) {
            const errBody = await ttsResp.text().catch(() => '');
            throw new Error(`Sarvam TTS preview failed (${ttsResp.status}): ${errBody.substring(0, 200)}`);
        }

        const ttsData = await ttsResp.json();
        const audioBase64 = ttsData.audios?.[0];
        if (!audioBase64) throw new Error('No audio returned from Sarvam');

        // Upload to S3 for playback
        const buffer = Buffer.from(audioBase64, 'base64');
        const s3Key = `ugc-previews/${speaker}-${langCode}-${Date.now()}.wav`;
        const audioUrl = await uploadToS3(buffer, s3Key, 'audio/wav');

        res.json({ success: true, audioUrl });
    } catch (error) {
        console.error('Sarvam preview error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// POST /api/video-studio/ugc/fal-voice-preview — Short TTS preview for Minimax/ElevenLabs
// ══════════════════════════════════════════════════════════════════════════════
router.post('/ugc/minimax-preview', protect, async (req, res) => {
    try {
        const { voiceId, provider } = req.body;
        const falKey = process.env.FAL_API_KEY;
        if (!falKey) throw new Error('FAL_API_KEY missing');

        const isEleven = provider === 'elevenlabs';
        let payload, apiUrl;
        if (isEleven) {
            payload = {
                text: 'Hello, this is a brief voice preview. I hope you like my tone.',
                voice: voiceId || 'Rachel'
            };
            apiUrl = 'https://fal.run/fal-ai/elevenlabs/tts/eleven-v3';
        } else {
            payload = {
                text: 'Hello, this is a brief voice preview. I hope you like my tone.',
                voice_setting: { voice_id: voiceId || 'Deep_Voice_Man', speed: 1 }
            };
            apiUrl = 'https://fal.run/fal-ai/minimax/speech-02-hd';
        }

        console.log(`🔊 Voice preview: calling synchronous endpoint for voice ${voiceId} via ${isEleven ? 'elevenlabs' : 'minimax'}...`);
        const resp = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Authorization': `Key ${falKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(60000), // 60s timeout for sync call
        });
        
        if (!resp.ok) {
            const errText = await resp.text();
            throw new Error(`TTS preview failed (${resp.status}): ${errText.substring(0, 200)}`);
        }

        const result = await resp.json();

        const generatedAudioUrl = result?.audio?.url || result?.audio_url || result?.audio_file?.url || result?.url;
        if (!generatedAudioUrl) throw new Error('TTS preview returned no audio.');

        const audioResp = await fetch(generatedAudioUrl);
        const audioBuffer = Buffer.from(await audioResp.arrayBuffer());
        const s3Key = `ugc-previews/minimax-${voiceId}-${Date.now()}.mp3`;
        const audioUrl = await uploadToS3(audioBuffer, s3Key, 'audio/mpeg');

        res.json({ success: true, audioUrl });
    } catch (error) {
        console.error('Minimax preview error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/video-studio/ugc/create-avatar — Create AI avatar from text prompt
// ══════════════════════════════════════════════════════════════════════════════
router.post('/ugc/create-avatar', protect, async (req, res) => {
    try {
        const { name, age, gender, ethnicity, orientation, pose, style, appearance } = req.body;

        if (!name?.trim()) return res.status(400).json({ success: false, error: 'Avatar name is required' });
        if (!appearance?.trim()) return res.status(400).json({ success: false, error: 'Appearance description is required' });

        const result = await createPhotoAvatar({
            name, age, gender, ethnicity, orientation, pose, style, appearance,
        });

        res.json({ success: true, generationId: result.generationId });
    } catch (error) {
        console.error('Create avatar error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/video-studio/ugc/avatar-status/:id — Poll avatar generation status
// ══════════════════════════════════════════════════════════════════════════════
router.get('/ugc/avatar-status/:id', protect, async (req, res) => {
    try {
        const result = await getPhotoAvatarStatus(req.params.id);
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Avatar status error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/video-studio/ugc/generate-look — Generate a new look for an avatar group
// ══════════════════════════════════════════════════════════════════════════════
router.post('/ugc/generate-look', protect, async (req, res) => {
    try {
        const { avatarGroupId, prompt, orientation, pose, style } = req.body;
        if (!avatarGroupId || !prompt) {
            return res.status(400).json({ success: false, error: 'Avatar group ID and prompt are required' });
        }
        const result = await generateLooks({ avatarGroupId, prompt, orientation, pose, style });
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Generate look error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/video-studio/ugc/add-motion — Add motion to a photo avatar/look
// ══════════════════════════════════════════════════════════════════════════════
router.post('/ugc/add-motion', protect, async (req, res) => {
    try {
        const { id, prompt, motionType } = req.body;
        if (!id) {
            return res.status(400).json({ success: false, error: 'Avatar or look ID is required' });
        }
        const result = await addMotion({ id, prompt, motionType });
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Add motion error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/video-studio/ugc/avatar-groups — List all avatar groups
// ══════════════════════════════════════════════════════════════════════════════
router.get('/ugc/avatar-groups', protect, async (req, res) => {
    try {
        const includePublic = req.query.includePublic === 'true';
        const result = await listAvatarGroups({ includePublic });
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('List avatar groups error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/video-studio/ugc/avatar-groups/:id/looks — List looks in an avatar group
// ══════════════════════════════════════════════════════════════════════════════
router.get('/ugc/avatar-groups/:id/looks', protect, async (req, res) => {
    try {
        const result = await listAvatarLooks(req.params.id);
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('List avatar looks error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/video-studio/ugc/gen-status/:id — Check photo/look/motion generation status
// ══════════════════════════════════════════════════════════════════════════════
router.get('/ugc/gen-status/:id', protect, async (req, res) => {
    try {
        const result = await checkPhotoGenStatus(req.params.id);
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Generation status error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/video-studio/ugc/upload-product — Upload product image to S3 + HeyGen
// ══════════════════════════════════════════════════════════════════════════════
router.post('/ugc/upload-product', protect, async (req, res) => {
    try {
        const { imageBase64, filename } = req.body;
        if (!imageBase64) return res.status(400).json({ success: false, error: 'Product image is required' });

        // Upload to S3
        const s3Url = await uploadToS3(
            imageBase64,
            `ugc-products/${req.user._id}/${Date.now()}-${filename || 'product.png'}`,
            'image/png'
        );

        // Also upload to HeyGen assets for Video Agent usage
        let heygenAsset = null;
        try {
            const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
            const buffer = Buffer.from(base64Data, 'base64');
            heygenAsset = await uploadAssetToHeyGen(buffer, filename || 'product.png', 'image/png');
        } catch (e) {
            console.warn('HeyGen asset upload failed (non-critical):', e.message);
        }

        res.json({
            success: true,
            s3Url,
            heygenAssetId: heygenAsset?.assetId || null,
            heygenAssetUrl: heygenAsset?.assetUrl || null,
        });
    } catch (error) {
        console.error('Product upload error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/video-studio/ugc/placement-poses — Generate product placement keyframes
// ══════════════════════════════════════════════════════════════════════════════
router.post('/ugc/placement-poses', protect, async (req, res) => {
    try {
        const { productImageUrl, avatarId } = req.body;
        if (!productImageUrl || !avatarId) {
            return res.status(400).json({ success: false, error: 'productImageUrl and avatarId are required' });
        }

        const result = await generatePlacementPoses({ productImageUrl, avatarId });
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Placement poses error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/video-studio/ugc/placement-video — Render video with selected pose
// ══════════════════════════════════════════════════════════════════════════════
router.post('/ugc/placement-video', protect, requireCredits('videoGenerate'), async (req, res) => {
    try {
        const { selectedPoseUrl, avatarId, script, voiceId, audioUrl, aspectRatio, motionModel, title } = req.body;
        if (!selectedPoseUrl || !avatarId) {
            return res.status(400).json({ success: false, error: 'selectedPoseUrl and avatarId are required' });
        }

        const result = await generatePlacementVideo({
            selectedPoseUrl, avatarId, script, voiceId, audioUrl,
            aspectRatio: aspectRatio || '9:16',
            motionModel: motionModel || 'veo_3_1',
            title: title || 'Mantram AI Product Video',
        });

        // Save as VideoProject
        const project = await VideoProject.create({
            user: req.user._id,
            brand: req.body.brandId || req.user.activeBrand,
            title: title || 'Product Placement Video',
            status: 'generating',
            mode: 'ugc',
            input: { brief: script || 'Product placement video', videoType: 'ugc' },
            routing: { selectedModel: 'heygen-product-placement' },
            generation: {
                falRequestId: result.videoId,
                provider: 'heygen',
            },
        });

        res.json({ success: true, videoId: result.videoId, projectId: project._id });
    } catch (error) {
        console.error('Placement video error:', error);
        if (req.creditsDeducted > 0) {
            await refundCredits(req.user._id, req.creditsDeducted, 'videoGenerateRefund', `Refund: Placement Video Sync Failure (${safeErrorMessage(error)})`, 'video');
        }
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/video-studio/ugc/register-webhook — Register HeyGen webhook
// ══════════════════════════════════════════════════════════════════════════════
router.post('/ugc/register-webhook', protect, async (req, res) => {
    try {
        const callbackUrl = req.body.callbackUrl || `${process.env.BASE_URL || req.protocol + '://' + req.get('host')}/api/video-studio/ugc/webhook-callback`;
        const result = await registerWebhook(callbackUrl);
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Webhook registration error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/video-studio/ugc/webhook-callback — HeyGen webhook callback (no auth)
// ══════════════════════════════════════════════════════════════════════════════
router.post('/ugc/webhook-callback', async (req, res) => {
    try {
        const { event_type, event_data } = req.body;
        const videoId = event_data?.video_id;
        console.log(`🔔 HeyGen webhook: ${event_type} for video=${videoId}`);

        if (event_type === 'video.completed' && videoId) {
            // Find & update the project
            const project = await VideoProject.findOne({ 'generation.falRequestId': videoId });
            if (project) {
                project.status = 'done';
                project.generation.videoUrl = event_data.video_url || '';
                project.generation.thumbnailUrl = event_data.thumbnail_url || '';
                project.generation.progress = 100;
                project.generation.completedAt = new Date();
                project.finalVideoUrl = event_data.video_url || '';
                await project.save();
                console.log(`✅ Webhook: Project ${project._id} marked done`);

                // Mirror to S3 immediately
                if (event_data.video_url) {
                    downloadAndUploadVideoToS3(project._id.toString(), event_data.video_url)
                        .catch(e => console.warn('⚠️ Webhook Video S3 upload failed:', e.message));
                }
            }
        } else if (event_type === 'video.failed' && videoId) {
            const project = await VideoProject.findOne({ 'generation.falRequestId': videoId });
            if (project) {
                project.status = 'failed';
                project.generation.error = event_data.error || 'Video generation failed';
                if (project.creditsUsed > 0) {
                    await refundCredits(project.user, project.creditsUsed, 'videoGenerateRefund', `Refund: HeyGen Webhook Failure`, 'video', { projectId: project._id });
                    project.creditsUsed = 0;
                }
                await project.save();
                console.log(`❌ Webhook: Project ${project._id} marked failed`);
            }
        }

        res.json({ received: true });
    } catch (error) {
        console.error('Webhook callback error:', error);
        res.status(200).json({ received: true }); // Always return 200 to HeyGen
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/video-studio/ugc/generate-agent — Video Agent mode (AI product placement)
// ══════════════════════════════════════════════════════════════════════════════
router.post('/ugc/generate-agent', protect, requireCredits('videoGenerate'), async (req, res) => {
    try {
        const { prompt, avatarId, durationSec, orientation, fileAssetIds, brandId, title } = req.body;

        if (!prompt?.trim()) return res.status(400).json({ success: false, error: 'Prompt is required' });

        const project = await VideoProject.create({
            user: req.user._id,
            brand: brandId || null,
            title: (title || 'UGC — AI Agent Video').substring(0, 80),
            status: 'advanced-generating',
            mode: 'ugc',
            routing: { selectedModel: 'heygen-video-agent' },
            input: { videoType: 'ugc', brief: prompt.trim().substring(0, 200) },
        });

        const result = await generateVideoAgent({
            prompt: prompt.trim(),
            avatarId,
            durationSec: durationSec || 30,
            orientation: orientation || 'portrait',
            fileAssetIds: fileAssetIds || [],
        });

        await VideoProject.findByIdAndUpdate(project._id, {
            generation: {
                falRequestId: result.videoId,
                provider: 'heygen',
                videoUrl: '',
                progress: 5,
                startedAt: new Date(),
            },
            backendPrompt: prompt.trim(),
        });

        res.json({
            success: true,
            project: {
                _id: project._id,
                videoId: result.videoId,
                provider: 'heygen',
                model: result.model,
            },
        });
    } catch (error) {
        console.error('UGC Video Agent error:', error);
        if (req.creditsDeducted > 0) {
            await refundCredits(req.user._id, req.creditsDeducted, 'videoGenerateRefund', `Refund: UGC Agent Sync Failure (${safeErrorMessage(error)})`, 'video');
        }
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/video-studio/ugc/generate-script — AI-generate UGC script from brand DNA
// ══════════════════════════════════════════════════════════════════════════════
router.post('/ugc/generate-script', protect, requireCredits('promptEnhance'), async (req, res) => {
    try {
        const {
            brandId, style, productId, productName, productDescription,
            platform, duration, customPrompt, language,
        } = req.body;

        if (!brandId) {
            return res.status(400).json({ success: false, error: 'Brand ID is required for UGC script generation' });
        }

        console.log(`📝 UGC Script: brand=${brandId}, style=${style}, platform=${platform}, duration=${duration}`);

        const scriptResult = await generateUGCScript({
            brandId,
            userId: req.user._id.toString(),
            style: style || 'testimonial',
            productId,
            productName,
            productDescription,
            platform: platform || 'instagram',
            duration: duration || '30s',
            customPrompt,
            language: language || 'english',
        });

        res.json({ success: true, ...scriptResult });
    } catch (error) {
        console.error('UGC script generation error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/video-studio/ugc/generate — Generate UGC video via HeyGen
// ══════════════════════════════════════════════════════════════════════════════
router.post('/ugc/generate', protect, requireCredits('videoGenerate'), async (req, res) => {
    try {
        const {
            script, avatarId, voiceId, photoUrl, audioUrl,
            backgroundUrl, backgroundColor, aspectRatio,
            caption, speed, brandId, title, style, platform,
            voiceProvider, // 'heygen' or 'sarvam'
        } = req.body;

        if (!script?.trim() && !audioUrl) {
            return res.status(400).json({ success: false, error: 'Script text is required' });
        }
        if (!avatarId && !photoUrl) {
            return res.status(400).json({ success: false, error: 'Either an avatar ID or a photo URL is required' });
        }
        if (!voiceId && !audioUrl) {
            return res.status(400).json({ success: false, error: 'Voice ID or audio is required' });
        }

        // ── If photoUrl is base64, upload to S3 first ──
        let resolvedPhotoUrl = photoUrl;
        if (photoUrl && photoUrl.startsWith('data:')) {
            console.log('📤 Uploading base64 photo to S3...');
            try {
                resolvedPhotoUrl = await uploadToS3(
                    photoUrl,
                    `ugc-photos/${req.user._id}/${Date.now()}.png`,
                    'image/png'
                );
                console.log(`✅ Photo uploaded to S3: ${resolvedPhotoUrl.substring(0, 80)}`);
            } catch (uploadErr) {
                console.error('Photo S3 upload failed:', uploadErr.message);
                return res.status(500).json({ success: false, error: 'Failed to upload photo. Please try again.' });
            }
        }

        console.log(`🎬 UGC Generate: avatar=${avatarId || 'photo'}, voice=${voiceId || 'audio'}, script=${(script || '').substring(0, 60)}...`);

        const project = await VideoProject.create({
            user: req.user._id,
            brand: brandId || null,
            title: (title || `UGC — ${style || 'Video'}`).substring(0, 80),
            status: 'advanced-generating',
            mode: 'ugc',
            advancedConfig: {
                prompt: (script || '').trim(),
                aspectRatio: aspectRatio || '9:16',
            },
            routing: {
                selectedModel: resolvedPhotoUrl ? 'heygen-photo-avatar' : (audioUrl ? 'heygen-audio-avatar' : 'heygen-avatar'),
            },
            creditsUsed: req.creditsDeducted || 0,
            input: {
                videoType: 'ugc',
                brief: (script || '').trim().substring(0, 200),
            },
        });

        let result;
        if (resolvedPhotoUrl) {
            // Photo avatar mode
            result = await generatePhotoAvatarVideo({
                script: (script || '').trim(),
                photoUrl: resolvedPhotoUrl,
                voiceId,
                audioUrl,
                aspectRatio: aspectRatio || '9:16',
                caption: caption !== false,
                speed: speed || 1.0,
                title: title || `Mantram UGC — ${style || 'Video'}`,
            });
        } else if (audioUrl) {
            // Pre-generated audio mode (Sarvam)
            result = await generateVideoWithAudio({
                avatarId,
                audioUrl,
                backgroundUrl,
                backgroundColor,
                aspectRatio: aspectRatio || '9:16',
                caption: caption !== false,
                title: title || `Mantram UGC — ${style || 'Video'}`,
            });
        } else {
            // Standard HeyGen avatar + voice mode (Avatar IV)
            result = await generateUGCVideo({
                script: script.trim(),
                avatarId,
                voiceId,
                backgroundUrl,
                backgroundColor,
                aspectRatio: aspectRatio || '9:16',
                caption: caption !== false,
                speed: speed || 1.0,
                title: title || `Mantram UGC — ${style || 'Video'}`,
                motionPrompt: req.body.motionPrompt || '',
                expressiveness: req.body.expressiveness || 'medium',
                voicePitch: req.body.voicePitch || 0,
            });
        }

        await VideoProject.findByIdAndUpdate(project._id, {
            generation: {
                falRequestId: result.videoId,
                provider: 'heygen',
                videoUrl: '',
                progress: 5,
                startedAt: new Date(),
            },
            backendPrompt: (script || '').trim(),
        });

        res.json({
            success: true,
            project: {
                _id: project._id,
                status: 'advanced-generating',
                mode: 'ugc',
                generation: {
                    falRequestId: result.videoId,
                    provider: 'heygen',
                    progress: 5,
                },
            },
        });
    } catch (error) {
        console.error('UGC generate error:', error);
        if (req.creditsDeducted > 0) {
            await refundCredits(req.user._id, req.creditsDeducted, 'videoGenerateRefund', `Refund: UGC Video Sync Failure (${safeErrorMessage(error)})`, 'video');
        }
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/video-studio/ugc/:videoId/status — Poll HeyGen video status
// ══════════════════════════════════════════════════════════════════════════════
router.get('/ugc/:videoId/status', protect, async (req, res) => {
    try {
        const { videoId } = req.params;
        const statusData = await getHeyGenVideoStatus(videoId);

        if (statusData.status === 'COMPLETED' && statusData.videoUrl) {
            const project = await VideoProject.findOneAndUpdate(
                { 'generation.falRequestId': videoId, user: req.user._id },
                {
                    status: 'done',
                    'generation.videoUrl': statusData.videoUrl,
                    'generation.thumbnailUrl': statusData.thumbnailUrl || '',
                    'generation.progress': 100,
                    'generation.completedAt': new Date(),
                    finalVideoUrl: statusData.videoUrl,
                },
                { returnDocument: 'after' }
            );

            if (statusData.videoUrl && project) {
                downloadAndUploadVideoToS3(project._id.toString(), statusData.videoUrl)
                    .catch(e => console.warn('⚠️ UGC Video S3 upload failed:', e.message));
            }
        }

        if (statusData.status === 'FAILED') {
            await VideoProject.findOneAndUpdate(
                { 'generation.falRequestId': videoId, user: req.user._id },
                {
                    status: 'failed',
                    'generation.progress': 0,
                    'generation.error': statusData.error,
                }
            );
        }

        res.json({ success: true, ...statusData });
    } catch (error) {
        console.error('UGC status error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// UGC PRO — Seedance 2.0 via MuAPI (MCoT-driven pipeline)
// IMPORTANT: These routes use literal '/ugc-pro/' prefix and MUST be defined
// BEFORE any '/:id/' parameterized routes to prevent Express from matching
// 'ugc-pro' as an :id value.
// ══════════════════════════════════════════════════════════════════════════════

const ugcUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ══════════════════════════════════════════════════════════════════════════════
// AVATAR LIBRARY — Persistent avatar management for Q-Ads & UGC Pro
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /api/video-studio/ugc-pro/avatars ──
// Returns merged list: active templates + user's own avatars
router.get('/ugc-pro/avatars', protect, async (req, res) => {
    try {
        const { search, gender, filter } = req.query;
        const userId = req.user._id;

        // Build query for templates
        const templateQuery = { isTemplate: true, isActive: true };
        // Build query for user's own avatars
        const userQuery = { createdBy: userId, isTemplate: false };

        if (gender && gender !== 'all') {
            templateQuery.gender = gender;
            userQuery.gender = gender;
        }
        if (search) {
            const rx = new RegExp(search, 'i');
            templateQuery.$or = [{ name: rx }, { tags: rx }];
            userQuery.$or = [{ name: rx }, { tags: rx }];
        }

        let templates = [];
        let userAvatars = [];

        if (filter === 'my') {
            userAvatars = await Avatar.find(userQuery).sort({ createdAt: -1 }).limit(100).lean();
        } else if (filter === 'pinned') {
            userAvatars = await Avatar.find({ ...userQuery, isPinned: true }).sort({ createdAt: -1 }).limit(100).lean();
        } else {
            // 'all' — both templates and user avatars
            [templates, userAvatars] = await Promise.all([
                Avatar.find(templateQuery).sort({ isFeatured: -1, createdAt: -1 }).limit(100).lean(),
                Avatar.find(userQuery).sort({ createdAt: -1 }).limit(100).lean(),
            ]);
        }

        res.json({
            success: true,
            templates,
            userAvatars,
            total: templates.length + userAvatars.length,
        });
    } catch (err) {
        console.error('Avatar list error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── POST /api/video-studio/ugc-pro/avatars ──
// Save a new user avatar (from uploaded URL or after generation)
router.post('/ugc-pro/avatars', protect, ugcUpload.single('avatarImage'), async (req, res) => {
    try {
        const { name, gender, imageUrl } = req.body;
        let finalUrl = imageUrl;

        // If a file was uploaded, store in S3
        if (req.file) {
            const s3Key = `ugc-pro/avatars/${req.user._id}/${Date.now()}-${req.file.originalname}`;
            finalUrl = await uploadToS3(req.file.buffer, s3Key, req.file.mimetype);
        }

        if (!finalUrl) {
            return res.status(400).json({ success: false, error: 'Provide an image file or imageUrl' });
        }

        const avatar = await Avatar.create({
            name: name || '',
            imageUrl: finalUrl,
            gender: gender || 'unspecified',
            isTemplate: false,
            createdBy: req.user._id,
            source: 'upload',
        });

        res.json({ success: true, avatar });
    } catch (err) {
        console.error('Avatar save error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── PUT /api/video-studio/ugc-pro/avatars/:id/pin ──
// Toggle pin status on a user's avatar
router.put('/ugc-pro/avatars/:id/pin', protect, async (req, res) => {
    try {
        const avatar = await Avatar.findOne({ _id: req.params.id, createdBy: req.user._id });
        if (!avatar) return res.status(404).json({ success: false, error: 'Avatar not found' });
        avatar.isPinned = !avatar.isPinned;
        await avatar.save();
        res.json({ success: true, avatar });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── DELETE /api/video-studio/ugc-pro/avatars/:id ──
// Delete a user's own avatar
router.delete('/ugc-pro/avatars/:id', protect, async (req, res) => {
    try {
        const avatar = await Avatar.findOneAndDelete({ _id: req.params.id, createdBy: req.user._id });
        if (!avatar) return res.status(404).json({ success: false, error: 'Avatar not found or not yours' });
        res.json({ success: true, deleted: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── POST /api/video-studio/ugc-pro/analyze-product ──
// MCoT product grounding — URL or text + optional product images
router.post('/ugc-pro/analyze-product', protect, ugcUpload.array('productImages', 8), async (req, res) => {
    try {
        const { productUrl, productText, brandId } = req.body;
        if (!productUrl && !productText && (!req.files || req.files.length === 0)) {
            return res.status(400).json({ success: false, error: 'Provide a product URL, text description, or upload product images' });
        }

        // Upload product images to S3 to get public URLs for MCoT multimodal
        const productImageUrls = [];
        if (req.files?.length > 0) {
            for (const f of req.files) {
                const s3Key = `ugc-pro/products/${req.user._id}/${Date.now()}-${f.originalname}`;
                const url = await uploadToS3(f.buffer, s3Key, f.mimetype);
                productImageUrls.push(url);
            }
        }

        // Parse any additional image URLs from body
        if (req.body.productImageUrls) {
            const urls = typeof req.body.productImageUrls === 'string'
                ? JSON.parse(req.body.productImageUrls) : req.body.productImageUrls;
            productImageUrls.push(...(urls || []).filter(u => u?.startsWith('http')));
        }

        // Scrape page HTML once — reuse for BOTH image extraction AND product text (avoids double fetch)
        let scrapedProductText = productText || '';
        if (productUrl && productImageUrls.length === 0) {
            try {
                console.log(`[UGC Analyze] Fetching page: ${productUrl}`);
                const pageResp = await fetch(productUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    },
                    signal: AbortSignal.timeout(8000),
                });
                const pageHtml = await pageResp.text();

                // Extract product text for Gemini using simple string ops
                function extractMeta(html, attr, val) {
                    const rx = new RegExp('<meta[^>]+' + attr + '=["\']+' + val + '["\']+[^>]*content=["\']+([^"\']{5,500})["\']+', 'i');
                    const m = html.match(rx) || html.match(new RegExp('<meta[^>]+content=["\']+([^"\']{5,500})["\']+[^>]*' + attr + '=["\']+' + val + '["\']+', 'i'));
                    return m ? m[1] : null;
                }
                const rawTitle = (pageHtml.match(/(?<=<title[^>]*>)[^<]+(?=<\/title>)/i) || [])[0] || '';
                const metaDesc = extractMeta(pageHtml, 'name', 'description');
                const ogTitle = extractMeta(pageHtml, 'property', 'og:title');
                const ogDesc = extractMeta(pageHtml, 'property', 'og:description');

                // Pull JSON-LD product data (richest source)
                let ldText = '';
                const candidateUrls = [];

                // 1. JSON-LD structured data images
                for (const [, jsonStr] of pageHtml.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
                    try {
                        const ld = JSON.parse(jsonStr.trim());
                        const items = Array.isArray(ld) ? ld : [ld];
                        for (const item of items) {
                            if (item.image) {
                                const imgs = Array.isArray(item.image) ? item.image : [item.image];
                                for (const img of imgs) {
                                    const url = typeof img === 'string' ? img : (img?.url || img?.contentUrl);
                                    if (url?.startsWith('http')) candidateUrls.push(url);
                                }
                            }
                        }
                    } catch { }
                }

                // 2. OG + twitter meta images
                for (const [, url] of pageHtml.matchAll(/<meta[^>]*(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image(?::src)?)["'][^>]*content=["']([^"']+)["']/gi)) {
                    if (url?.startsWith('http')) candidateUrls.push(url);
                }

                // Helper: reject URLs that are clearly UI assets, not product images
                const isUiAsset = (u) => {
                    const lower = u.toLowerCase();
                    return (
                        // Social media icons
                        lower.includes('whatsapp') || lower.includes('facebook') || lower.includes('instagram') ||
                        lower.includes('twitter') || lower.includes('youtube') || lower.includes('pinterest') ||
                        lower.includes('tiktok') || lower.includes('snapchat') || lower.includes('telegram') ||
                        // Payment / trust badges
                        lower.includes('payment') || lower.includes('visa') || lower.includes('mastercard') ||
                        lower.includes('paypal') || lower.includes('upi') || lower.includes('razorpay') ||
                        lower.includes('secure') || lower.includes('badge') || lower.includes('trust') ||
                        lower.includes('guarantee') || lower.includes('certified') ||
                        // Shipping / returns
                        lower.includes('shipping') || lower.includes('delivery') || lower.includes('returns') ||
                        lower.includes('free-ship') || lower.includes('fast-ship') ||
                        // UI navigation
                        lower.includes('header') || lower.includes('footer') || lower.includes('/nav/') ||
                        lower.includes('breadcrumb') || lower.includes('banner') ||
                        // Known asset types
                        lower.includes('icon') || lower.includes('logo') || lower.includes('favicon') ||
                        lower.includes('sprite') || lower.includes('placeholder') || lower.includes('blank') ||
                        lower.includes('_small') || lower.includes('_thumb') || lower.includes('_compact') ||
                        lower.includes('_mini') || lower.includes('_tiny') || lower.includes('_xs') ||
                        lower.includes('background') || lower.includes('bg-') || lower.includes('/bg/')
                    );
                };

                // 3. Shopify CDN direct — with comprehensive UI asset filtering
                for (const [, url] of pageHtml.matchAll(/["'](https?:\/\/cdn\.shopify\.com\/s\/files\/[^"'?]+\.(?:jpg|jpeg|png|webp))(?:\?[^"']*)?["']/gi)) {
                    if (!isUiAsset(url)) candidateUrls.push(url);
                }

                // 4. Generic product/gallery images — tightened pattern to avoid nav/social assets
                // Only match URLs that explicitly have product/collection/variant in path segments
                for (const [, url] of pageHtml.matchAll(/["'](https?:\/\/[^"']*\/(?:products?|collections?|items?|goods|variants?)\/[^"']*\.(?:jpg|jpeg|png|webp))(?:\?[^"']*)?["']/gi)) {
                    if (!isUiAsset(url)) candidateUrls.push(url);
                }

                // Deduplicate by normalised base URL (strip query, size suffixes, and normalize http→https)
                const seen = new Set();
                const deduped = [];
                for (const rawUrl of candidateUrls) {
                    const base = rawUrl.split('?')[0]
                        .replace(/^http:/, 'https:')
                        .replace(/_\d+x\d*(\.\w+)$/, '$1')
                        .replace(/_\d+x(\.\w+)$/, '$1')
                        .replace(/\/\d+x\d+\//, '/');
                    if (!seen.has(base)) { seen.add(base); deduped.push(rawUrl); }
                }

                // Download and upload up to 4 diverse images in parallel with strict 8s timeout
                const uploadPromises = deduped.slice(0, 4).map(async (imgUrl, i) => {
                    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Image fetch/upload timeout')), 8000));
                    
                    const fetchAndUpload = async () => {
                        const imgResp = await fetch(imgUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(6000) });
                        if (!imgResp.ok) throw new Error('Bad response');
                        const contentType = imgResp.headers.get('content-type') || 'image/jpeg';
                        if (!contentType.startsWith('image/')) throw new Error('Not an image');
                        
                        const arrayBuffer = await imgResp.arrayBuffer();
                        const buffer = Buffer.from(arrayBuffer);
                        // Reject files under 20KB — icons, badges, and sprites are almost always < 20KB
                        // Max 10MB to avoid giant uncompressed images
                        if (buffer.length < 20_000 || buffer.length > 10_000_000) {
                            console.log(`[UGC Analyze] ⏭ Skipping ${imgUrl.substring(0, 60)} — size ${Math.round(buffer.length/1024)}KB (likely icon or invalid)`);
                            throw new Error('Invalid size');
                        }
                        
                        const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
                        const s3Key = `ugc-pro/products/${req.user._id}/${Date.now()}-${i}.${ext}`;
                        const s3Url = await uploadToS3(buffer, s3Key, contentType);
                        
                        console.log(`[UGC Analyze] ✅ Image ${i+1}: ${imgUrl.substring(0, 70)} (${Math.round(buffer.length/1024)}KB)`);
                        return s3Url;
                    };

                    try {
                        return await Promise.race([fetchAndUpload(), timeoutPromise]);
                    } catch (err) {
                        return null; // silently skip failures
                    }
                });

                const results = await Promise.all(uploadPromises);
                const successfulUrls = results.filter(Boolean);
                productImageUrls.push(...successfulUrls);
                let scraped = successfulUrls.length;

                // ── Build scrapedProductText from extracted page metadata ──
                // Extract JSON-LD product text data
                for (const [, jsonStr] of pageHtml.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
                    try {
                        const ld = JSON.parse(jsonStr.trim());
                        const items = Array.isArray(ld) ? ld : [ld];
                        for (const item of items) {
                            if (item['@type'] === 'Product' || item.name) {
                                ldText += `Name: ${item.name || ''} | Desc: ${(item.description || '').substring(0, 300)} | Price: ${item.offers?.price || ''} ${item.offers?.priceCurrency || ''}`.trim() + '\n';
                            }
                        }
                    } catch { /* skip */ }
                }

                scrapedProductText = [
                    `URL: ${productUrl}`,
                    ogTitle ? `Title: ${ogTitle}` : rawTitle ? `Title: ${rawTitle.trim()}` : '',
                    ogDesc ? `Description: ${ogDesc}` : metaDesc ? `Description: ${metaDesc}` : '',
                    ldText ? `Product Data:\n${ldText}` : '',
                ].filter(Boolean).join('\n').substring(0, 3000);

                console.log(`[UGC Analyze] ${scraped} images, productText: ${scrapedProductText.length} chars`);
            } catch (err) {
                console.warn(`[UGC Analyze] Page fetch failed: ${err.message}`);
                scrapedProductText = productText || `Product URL: ${productUrl}`;
            }
        } else if (productUrl) {
            // Images already uploaded — still need product text, use URL as minimal context
            scrapedProductText = productText || `Product URL: ${productUrl}`;
        }

        console.log(`[UGC Analyze] Grounding - ${productUrl || 'manual'}, ${productImageUrls.length} images, ${scrapedProductText.length} chars text`);

        // Run MCoT product grounding node — pass scraped text so node skips its own web_search
        const state = await ugcProductGroundingNode({
            productUrl: null, // Already scraped — prevent duplicate fetch inside the node
            productText: scrapedProductText,
            productImageUrls,
            brandId,
            userId: req.user._id,
        });

        res.json({
            success: true,
            productData: state.productData,
            productImageUrls,
        });
    } catch (err) {
        console.error('UGC Pro analyze error:', err.message);
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

// ── POST /api/video-studio/ugc-pro/build-prompt ──
// Builds the Seedance prompt via MCoT but returns it for user preview/edit
router.post('/ugc-pro/build-prompt', protect, async (req, res) => {
    try {
        const { brandId, productData, settings, avatarUrl, productImageUrls: bodyProductImgUrls } = req.body;

        const parsedProduct = typeof productData === 'string' ? JSON.parse(productData) : (productData || {});
        const parsedSettings = typeof settings === 'string' ? JSON.parse(settings) : (settings || {});
        const parsedProductImgs = Array.isArray(bodyProductImgUrls) ? bodyProductImgUrls : [];

        const imageUrls = [];
        if (avatarUrl) imageUrls.push(avatarUrl);
        for (const url of parsedProductImgs) {
            if (url && typeof url === 'string' && url.startsWith('http')) imageUrls.push(url);
        }

        console.log(`[UGC Build Prompt] Building with ${imageUrls.length} images...`);

        const promptState = await ugcPromptBuilderNode({
            brandId,
            userId: req.user._id,
            productData: parsedProduct,
            settings: parsedSettings,
            imageUrls,
        });

        res.json({
            success: true,
            prompt: promptState.backendPrompt,
            imageCount: imageUrls.length,
        });
    } catch (err) {
        console.error('UGC Pro build-prompt error:', err.message);
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

// ── POST /api/video-studio/ugc-pro/generate-avatar ──
// DEPRECATED — Step 11: Redirects internally to POST /api/avatar-studio/generate
// Frontend code still hitting this endpoint continues to work transparently.
// Remove this redirect once all frontend references are updated to /api/avatar-studio/generate
router.post('/ugc-pro/generate-avatar', protect, ugcUpload.single('avatarImage'), async (req, res) => {
    try {
        console.log(`⚠️  [DEPRECATED] /ugc-pro/generate-avatar called — proxying to /api/avatar-studio/generate`);

        // Build a forwarded request body that avatar-studio /generate understands
        // avatar-studio /generate accepts: { mode, prompt, genderExpression, origin, ... }
        // Legacy callers send: { description, environment, brandId }
        const { description, environment, brandId } = req.body;

        // If it was a file upload (Path 1 of old endpoint) — handle it directly, avatar-studio doesn't have this path
        if (req.file) {
            const s3Key = `ugc-pro/avatars/${req.user._id}/${Date.now()}-${req.file.originalname}`;
            const avatarUrl = await uploadToS3(req.file.buffer, s3Key, req.file.mimetype);
            console.log(`✅ [DEPRECATED redirect] Avatar upload preserved: ${avatarUrl.substring(0, 60)}`);
            return res.json({ success: true, avatarUrl, generated: false });
        }

        if (!description?.trim()) {
            return res.status(400).json({ success: false, error: 'Provide a model description or upload a photo' });
        }

        // Forward as directPrompt mode to avatar-studio/generate
        const forwardBody = {
            mode: 'directPrompt',
            directPrompt: description.trim(),
            brandId: brandId || undefined,
        };

        const PORT = process.env.PORT || 3001;
        const forwardRes = await fetch(`http://localhost:${PORT}/api/avatar-studio/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': req.headers.authorization,
            },
            body: JSON.stringify(forwardBody),
        });

        const forwardData = await forwardRes.json();

        if (!forwardRes.ok) {
            return res.status(forwardRes.status).json(forwardData);
        }

        // Adapt avatar-studio response shape to legacy shape so old frontend still works
        // avatar-studio returns: { success, variants: [{url},...] }
        // legacy expected: { success, avatarUrl, generated }
        const firstVariant = forwardData.variants?.find(v => !v.failed);
        if (firstVariant) {
            return res.json({
                success: true,
                avatarUrl: firstVariant.url,
                generated: true,
                variants: forwardData.variants, // bonus: expose all variants
            });
        }

        return res.status(502).json({ success: false, error: 'Avatar generation failed in new pipeline' });

    } catch (err) {
        console.error('[DEPRECATED redirect] ugc-pro/generate-avatar error:', err.message);
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});


// ── POST /api/video-studio/ugc-pro/generate ──
// Full UGC video generation — builds prompt via nodes, submits to MuAPI


// Full UGC video generation — builds prompt via nodes, submits to MuAPI
router.post('/ugc-pro/generate', protect, requireCredits('ugcProGenerate'), async (req, res) => {
    try {
        const {
            brandId, productData, settings,
            avatarUrl, productImageUrls: bodyProductImgUrls,
            prebuiltPrompt,
        } = req.body;

        console.log(`[UGC Generate] req.body keys: ${Object.keys(req.body).join(', ')}`);
        console.log(`[UGC Generate] avatarUrl: ${avatarUrl ? avatarUrl.substring(0, 60) + '...' : 'MISSING'}`);
        console.log(`[UGC Generate] productImageUrls type: ${typeof bodyProductImgUrls}, value: ${JSON.stringify(bodyProductImgUrls)?.substring(0, 200)}`);

        const parsedProduct = typeof productData === 'string' ? JSON.parse(productData) : (productData || {});
        const parsedSettings = typeof settings === 'string' ? JSON.parse(settings) : (settings || {});
        const parsedProductImgs = typeof bodyProductImgUrls === 'string'
            ? JSON.parse(bodyProductImgUrls) : (Array.isArray(bodyProductImgUrls) ? bodyProductImgUrls : []);

        // Collect image URLs: avatar first (@image1), then product images (@image2+)
        const imageUrls = [];
        if (avatarUrl) imageUrls.push(avatarUrl);
        for (const url of parsedProductImgs) {
            if (url && typeof url === 'string' && url.startsWith('http')) imageUrls.push(url);
        }

        console.log(`[UGC Generate] Final imageUrls (${imageUrls.length}): ${imageUrls.map(u => u.substring(0, 50)).join(' | ')}`);

        let prompt = prebuiltPrompt;
        
        if (!prompt || !prompt.trim()) {
            // Build Seedance prompt via MCoT node if no prompt was provided
            console.log(`[UGC Generate] No prebuilt prompt provided, building one...`);
            const promptState = await ugcPromptBuilderNode({
                brandId,
                userId: req.user._id,
                productData: parsedProduct,
                settings: parsedSettings,
                imageUrls,
            });
            prompt = promptState.backendPrompt;
        } else {
            console.log(`[UGC Generate] Using explicitly provided prebuilt prompt (${prompt.length} chars)`);
        }
        const duration = parseInt(parsedSettings.duration || 8);
        const aspectRatio = parsedSettings.aspectRatio || '9:16';
        const quality = parsedSettings.quality || 'high';
        const selectedModel = parsedSettings.model || 'seedance-2.0';
        const resolution = parsedSettings.resolution || '720p';

        console.log(`[UGC Generate] Final prompt @image check — @image1: ${prompt.includes('@image1')}, @image2: ${prompt.includes('@image2')}`);
        console.log(`[UGC Generate] Submitting — ${duration}s, model=${selectedModel}, ${imageUrls.length} images, prompt ${prompt.split(/\s+/).length}w`);

        let genResult;
        let usedProvider;

        if (selectedModel === 'seedance-2.0' || selectedModel === 'seedance-2.0-fast') {
            // Atlas Cloud path (reference-to-video with avatar face locking)
            genResult = await submitAtlasCloudVideoGeneration({
                prompt,
                imageUrl: imageUrls[0] || null,
                duration,
                aspectRatio,
                qualityMode: quality,
                generateAudio: true,
                referenceImages: imageUrls.slice(1),
            });
            usedProvider = 'atlascloud';
        } else {
            // Kling / Veo / other models via falClient submitVideoGeneration
            const result = await submitVideoGeneration({
                model: selectedModel,
                prompt,
                imageUrl: imageUrls[0] || null,
                duration,
                resolution,
                aspectRatio,
                generateAudio: true,
                referenceImages: imageUrls.slice(1),
            });
            genResult = { taskId: result.requestId, _payload: result._atlasCloudPayload };
            usedProvider = result.provider || selectedModel;
        }

        // Persist history as a VideoProject
        const project = await VideoProject.create({
            user: req.user._id,
            brand: brandId,
            studioMode: 'ugc-pro',
            status: 'generating',
            script: prompt,
            backendPrompt: prompt,
            input: { images: imageUrls.map(url => ({ url, source: 'existing' })), productData: parsedProduct },
            generation: {
                provider: usedProvider,
                model: selectedModel,
                taskId: genResult.taskId,
                requestId: genResult.taskId,
                duration,
                aspectRatio,
                progress: 0,
                status: 'GENERATING'
            }
        });

        res.json({
            success: true,
            projectId: project._id,
            requestId: genResult.taskId,
            provider: usedProvider,
            model: selectedModel,
            prompt,
            imageCount: imageUrls.length,
            duration,
            aspectRatio,
        });
    } catch (err) {
        console.error('UGC Pro generate error:', err.message);
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

// ── GET /api/video-studio/ugc-pro/status/:requestId ──
// Poll MuAPI generation status (uses existing muapiClient) and update history
router.get('/ugc-pro/status/:requestId', protect, async (req, res) => {
    try {
        const result = await pollAtlasCloudStatus(req.params.requestId);
        
        // Update DB history to maintain sync
        if (result && req.params.requestId) {
            const updatePayload = {
                'generation.progress': result.progress,
                'generation.status': result.status === 'COMPLETED' ? 'COMPLETED' : (result.status === 'FAILED' ? 'FAILED' : 'GENERATING')
            };
            if (result.videoUrl) updatePayload['generation.videoUrl'] = result.videoUrl;
            if (result.error) updatePayload['generation.error'] = result.error;
            if (result.status === 'COMPLETED' || result.status === 'FAILED') {
                updatePayload.status = result.status === 'COMPLETED' ? 'done' : 'failed';
            }
            await VideoProject.findOneAndUpdate(
                { 'generation.requestId': req.params.requestId, user: req.user._id, studioMode: 'ugc-pro' },
                updatePayload
            );
        }

        res.json({ success: true, ...result });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

// ── GET /api/video-studio/ugc-pro/credit-estimate ──
// Preview credit cost for UGC Pro generation
router.get('/ugc-pro/credit-estimate', protect, (req, res) => {
    const d = parseInt(req.query.duration || 8);
    // Credit tiers: ≤10s → 15 credits, ≤20s → 25 credits, ≤30s → 35 credits
    const credits = d <= 10 ? 15 : d <= 20 ? 25 : 35;
    res.json({ success: true, duration: d, credits });
});

// ══════════════════════════════════════════════════════════════════════════════
// Q-ADS (Quick Ads) — Category-first video ad generation
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /api/video-studio/ugc-pro/qads/categories ──
router.get('/ugc-pro/qads/categories', protect, (req, res) => {
    const categories = Q_ADS_CATEGORIES.map(c => ({
        id: c.id, name: c.name, tagline: c.tagline, description: c.description,
        msIcon: c.msIcon, color: c.color, noAvatar: !!c.noAvatar,
        recommendedDuration: c.recommendedDuration, recommendedFormat: c.recommendedFormat,
    }));
    res.json({ success: true, categories });
});

// ── POST /api/video-studio/ugc-pro/qads/build-prompt ──
router.post('/ugc-pro/qads/build-prompt', protect, async (req, res) => {
    try {
        const { brandId, categoryId, productData, settings, avatarUrl, productImageUrls } = req.body;
        const parsedProduct = typeof productData === 'string' ? JSON.parse(productData) : (productData || {});
        const parsedSettings = typeof settings === 'string' ? JSON.parse(settings) : (settings || {});

        console.log(`[Q-Ads Build Prompt] Category: ${categoryId}, product: ${parsedProduct.productName || 'unknown'}`);

        const prompt = await buildQAdPrompt({
            categoryId,
            productData: parsedProduct,
            settings: parsedSettings,
            brandId,
            userId: req.user._id,
        });

        // Count image slots
        const imageUrls = [];
        if (avatarUrl) imageUrls.push(avatarUrl);
        const parsedProdImgs = Array.isArray(productImageUrls) ? productImageUrls : [];
        for (const url of parsedProdImgs) {
            if (url && typeof url === 'string' && url.startsWith('http')) imageUrls.push(url);
        }

        res.json({ success: true, prompt, imageCount: imageUrls.length });
    } catch (err) {
        console.error('Q-Ads build-prompt error:', err.message);
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

// ── POST /api/video-studio/ugc-pro/qads/generate ──
router.post('/ugc-pro/qads/generate', protect, requireCredits('qAdsGenerate'), async (req, res) => {
    try {
        const { brandId, categoryId, productData, settings, avatarUrl, productImageUrls: bodyProductImgUrls, prebuiltPrompt } = req.body;
        const parsedProduct = typeof productData === 'string' ? JSON.parse(productData) : (productData || {});
        const parsedSettings = typeof settings === 'string' ? JSON.parse(settings) : (settings || {});
        const parsedProductImgs = typeof bodyProductImgUrls === 'string'
            ? JSON.parse(bodyProductImgUrls) : (Array.isArray(bodyProductImgUrls) ? bodyProductImgUrls : []);

        const category = getCategory(categoryId);
        if (!category) return res.status(400).json({ success: false, error: `Unknown Q-Ad category: ${categoryId}` });

        // Collect product image URLs for Seedance
        const imageUrls = [];
        for (const url of parsedProductImgs) {
            if (url && typeof url === 'string' && url.startsWith('http')) imageUrls.push(url);
        }

        // Avatar is passed as a face reference — Atlas registers it as an asset:// URI
        // which bypasses Seedance's raw-image safety filter and provides proper face fidelity.
        const avatarFaceRefs = (avatarUrl && !category.noAvatar) ? [avatarUrl] : [];
        if (avatarFaceRefs.length > 0) {
            console.log(`[Q-Ads Generate] Avatar → face reference (Atlas Asset Library): ${avatarUrl.substring(0, 60)}...`);
        }

        // Build or use prebuilt prompt
        let prompt = prebuiltPrompt;
        if (!prompt || !prompt.trim()) {
            console.log(`[Q-Ads Generate] Building prompt for category: ${categoryId}`);
            prompt = await buildQAdPrompt({ categoryId, productData: parsedProduct, settings: parsedSettings, brandId, userId: req.user._id });
        } else {
            console.log(`[Q-Ads Generate] Using prebuilt prompt (${prompt.length} chars)`);
        }

        // Remap image tags: @image1 → avatar (face-locked via Atlas), @image2 → product
        // Atlas will inject @Image1 (face asset) and @Image2 (product) into the prompt automatically.
        // Just clean the <<<image_n>>> template tags from the prompt here.
        prompt = prompt.replace(/@image1/g, '@Image1').replace(/@image2/g, '@Image2');
        console.log(`[Q-Ads Generate] Image tags preserved for Atlas face-lock injection`);

        const duration = parseInt(parsedSettings.duration || category.recommendedDuration);
        const aspectRatio = parsedSettings.format || category.recommendedFormat || '9:16';
        const quality = parsedSettings.quality || 'high';

        console.log(`[Q-Ads Generate] Submitting — ${categoryId}, ${duration}s, ${imageUrls.length} images`);

        // Determine correct imageRole for Atlas:
        //   'face'          — user provided an avatar (face-registered, UGC-style)
        //   'fashion-model' — garment/apparel brand, product image likely contains a human model
        //   'product'       — standalone product, no human
        const isFashion = isFashionCategory({ productData: parsedProduct, userBrief: prebuiltPrompt });
        const resolvedImageRole = resolveImageRole({
            hasAvatar: avatarFaceRefs.length > 0,
            isFashion,
        });
        if (isFashion && resolvedImageRole === 'fashion-model') {
            console.log(`👗 [Q-Ads Generate] Fashion/apparel brand detected — imageRole=fashion-model (garment-safe Asset registration)`);
        }

        const genResult = await submitAtlasCloudVideoGeneration({
            prompt,
            imageUrl: imageUrls[0] || null,
            duration, aspectRatio, qualityMode: quality, generateAudio: true,
            referenceImages: [...avatarFaceRefs, ...imageUrls.slice(1)],
            imageRole: resolvedImageRole,
        });

        // Persist as VideoProject
        const project = await VideoProject.create({
            user: req.user._id, brand: brandId, studioMode: 'q-ads', mode: 'image-to-video', status: 'generating',
            title: `Q-Ad: ${parsedProduct.productName || categoryId}`,
            backendPrompt: prompt,
            input: {
                brief: `Q-Ads [${categoryId}]: ${parsedProduct.productName || 'product'}`,
                images: imageUrls.map((u, i) => ({ url: u, source: 'upload', label: i === 0 ? 'avatar' : `product-${i}` })),
            },
            generation: {
                provider: 'atlascloud', model: 'seedance-2.0',
                falRequestId: genResult.taskId,
                taskId: genResult.taskId, requestId: genResult.taskId,
                duration, aspectRatio, progress: 0, status: 'GENERATING',
            },
        });

        res.json({
            success: true, projectId: project._id, requestId: genResult.taskId,
            provider: 'atlascloud', categoryId, prompt, imageCount: imageUrls.length, duration, aspectRatio,
        });
    } catch (err) {
        console.error('Q-Ads generate error:', err.message);
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

// ── GET /api/video-studio/ugc-pro/qads/status/:requestId ──
router.get('/ugc-pro/qads/status/:requestId', protect, async (req, res) => {
    try {
        const result = await pollAtlasCloudStatus(req.params.requestId);

        // 🛡️ SAFE MODE PIVOT: If Seedance blocked due to real person face detection,
        // automatically resubmit without the avatar image (product-only mode)
        if (result && result.safetyTriggered && result.retryable) {
            const project = await VideoProject.findOne({
                'generation.requestId': req.params.requestId, user: req.user._id, studioMode: 'q-ads'
            });

            if (project && !project.generation?.safeModeRetried) {
                console.log(`🛡️ [Q-Ads Safe Mode] Safety triggered — stripping avatar and resubmitting product-only...`);

                // Get original images; drop the first one (avatar)
                const originalImages = (project.input?.images || []).map(i => i.url).filter(Boolean);
                const productOnlyImages = originalImages.length > 1 ? originalImages.slice(1) : [];

                try {
                    const retryResult = await submitAtlasCloudVideoGeneration({
                        prompt: project.backendPrompt || project.script,
                        imageUrl: productOnlyImages[0] || null,
                        duration: project.generation?.duration || 5,
                        aspectRatio: project.generation?.aspectRatio || '9:16',
                        qualityMode: 'high',
                        generateAudio: true,
                        referenceImages: productOnlyImages.slice(1),
                    });

                    // Update the project with the new task ID
                    await VideoProject.findByIdAndUpdate(project._id, {
                        'generation.requestId': retryResult.taskId,
                        'generation.taskId': retryResult.taskId,
                        'generation.safeModeRetried': true,
                        'generation.progress': 5,
                        'generation.status': 'GENERATING',
                        'generation.error': '',
                        status: 'generating',
                    });

                    console.log(`✅ [Q-Ads Safe Mode] Resubmitted as product-only: new taskId=${retryResult.taskId}`);

                    // Return IN_PROGRESS with the NEW requestId so the frontend switches to polling it
                    return res.json({
                        success: true,
                        status: 'IN_PROGRESS',
                        progress: 5,
                        newRequestId: retryResult.taskId,
                        safeModeActivated: true,
                    });
                } catch (retryErr) {
                    console.error(`❌ [Q-Ads Safe Mode] Retry failed: ${retryErr.message}`);
                    // Fall through to normal failure handling
                }
            }
        }

        if (result && req.params.requestId) {
            const updatePayload = {
                'generation.progress': result.progress,
            };
            if (result.videoUrl) updatePayload['generation.videoUrl'] = result.videoUrl;
            if (result.error) updatePayload['generation.error'] = result.error;
            if (result.status === 'COMPLETED' || result.status === 'FAILED') {
                updatePayload.status = result.status === 'COMPLETED' ? 'done' : 'failed';
            }
            await VideoProject.findOneAndUpdate(
                { 'generation.falRequestId': req.params.requestId, user: req.user._id },
                updatePayload
            );
        }
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

// ── GET /api/video-studio/ugc-pro/qads/credit-estimate ──
router.get('/ugc-pro/qads/credit-estimate', protect, (req, res) => {
    const d = parseInt(req.query.duration || 8);
    const credits = getQAdsCreditCost(d);
    res.json({ success: true, duration: d, credits });
});

// ── GET /api/video-studio/ugc-pro/qads/v2/status/:requestId ──
// Polls Atlas Cloud for Q-Ads V2 video status and updates VideoProject.
// V2 jobs store the Atlas taskId in generation.requestId (not generation.falRequestId).
router.get('/ugc-pro/qads/v2/status/:requestId', protect, async (req, res) => {
    try {
        const { requestId } = req.params;
        
        // Guard against undefined/empty requestId (stale frontend state)
        if (!requestId || requestId === 'undefined' || requestId === 'null') {
            return res.json({ success: true, status: 'FAILED', error: 'Invalid request ID' });
        }
        
        const result = await pollAtlasCloudStatus(requestId);

        if (!result) return res.json({ success: true, status: 'IN_PROGRESS', progress: 10 });

        // Update VideoProject with latest status/videoUrl
        const updatePayload = { 'generation.progress': result.progress || 0 };
        
        if (result.status === 'COMPLETED' && result.videoUrl) {
            console.log(`[Q-Ads V2] Mirroring video to S3: ${result.videoUrl.substring(0, 80)}...`);
            const s3VideoUrl = await ensureS3Url(result.videoUrl, `qads/gen-video-${Date.now()}.mp4`);
            if (s3VideoUrl) {
                result.videoUrl = s3VideoUrl;
            }
        }
        
        if (result.videoUrl) updatePayload['generation.videoUrl'] = result.videoUrl;
        if (result.error) updatePayload['generation.error'] = result.error;
        if (result.status === 'COMPLETED' || result.status === 'FAILED') {
            updatePayload.status = result.status === 'COMPLETED' ? 'done' : 'failed';
            updatePayload['generation.status'] = result.status;
        }

        // Also set finalVideoUrl when completed for history listing
        if (result.status === 'COMPLETED' && result.videoUrl) {
            updatePayload.finalVideoUrl = result.videoUrl;
        }

        // V2 projects store taskId in generation.taskId, generation.requestId, and generation.falRequestId
        // Use $or to match all possible fields
        await VideoProject.findOneAndUpdate(
            { $or: [{ 'generation.falRequestId': requestId }, { 'generation.requestId': requestId }, { 'generation.taskId': requestId }], user: req.user._id },
            { $set: updatePayload }
        ).catch(e => console.warn('[Q-Ads V2 Status] DB update failed:', e.message));

        res.json({
            success: true,
            status: result.status,       // 'COMPLETED' | 'FAILED' | 'IN_PROGRESS' | 'IN_QUEUE'
            progress: result.progress,
            videoUrl: result.videoUrl || null,
            error: result.error || null,
        });
    } catch (err) {
        console.error('[Q-Ads V2 Status] Error:', err.message);
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// Q-Ads V2 Image Analysis (Visual Grounding)
// ─────────────────────────────────────────────────────────────────────────────

async function fetchImageAsInlineData(imageUrl) {
    if (!imageUrl || typeof imageUrl !== 'string') return null
    try {
        let fetchUrl = imageUrl
        const isOurS3 = imageUrl.includes('amazonaws.com') && (
            imageUrl.includes('mantram-assets') ||
            imageUrl.includes('mantram-media')
        )
        if (isOurS3) {
            fetchUrl = await getSignedUrlForPath(imageUrl, 300)
        }
        const resp = await fetch(fetchUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(20_000),
        })
        if (!resp.ok) return null
        const buffer = await resp.arrayBuffer()
        const contentType = resp.headers.get('content-type') || 'image/jpeg'
        return { inlineData: { mimeType: contentType, data: Buffer.from(buffer).toString('base64') } }
    } catch (err) {
        console.error(`❌ fetchImageAsInlineData failed: ${err.message}`)
        return null
    }
}

// ── POST /api/video-studio/ugc-pro/qads/v2/analyze-assets ──
// Deep visual analysis of uploaded product and avatar images to generate a rich video brief
// Accepts optional userBrief and productData to ground the analysis in user intent
router.post('/ugc-pro/qads/v2/analyze-assets', protect, async (req, res) => {
    try {
        const { productImageUrls, avatarUrl, brandName, userBrief, productData } = req.body;
        
        if ((!productImageUrls || productImageUrls.length === 0) && !avatarUrl) {
            return res.status(400).json({ success: false, error: 'At least one reference image is required' });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return res.status(400).json({ success: false, error: 'GEMINI_API_KEY not configured' });

        const parts = [];
        const labels = [];
        
        async function loadPart(url, label) {
            if (!url) return;
            const part = await fetchImageAsInlineData(url);
            if (part) {
                parts.push(part);
                labels.push(label);
            }
        }

        if (productImageUrls && productImageUrls.length > 0) {
            for (let i = 0; i < Math.min(productImageUrls.length, 3); i++) {
                await loadPart(productImageUrls[i], `IMAGE ${parts.length + 1}: Product Reference ${i + 1}`);
            }
        }
        if (avatarUrl) {
            await loadPart(avatarUrl, `IMAGE ${parts.length + 1}: The Avatar/Character`);
        }

        // Parse product data if provided
        const parsedProduct = typeof productData === 'string' ? (() => { try { return JSON.parse(productData); } catch { return null; } })() : (productData || null);

        // Build context sections
        const contextSections = [];
        
        if (userBrief && userBrief.trim()) {
            contextSections.push(`USER'S CREATIVE DIRECTION:\n"${userBrief.trim()}"\nThis is the user's vision — honor their intent, tone, and any specific instructions they provided.`);
        }
        
        if (parsedProduct && (parsedProduct.productName || parsedProduct.description)) {
            let productCtx = 'PRODUCT DETAILS (from URL analysis):';
            if (parsedProduct.productName) productCtx += `\n- Name: ${parsedProduct.productName}`;
            if (parsedProduct.brand) productCtx += `\n- Brand: ${parsedProduct.brand}`;
            if (parsedProduct.description) productCtx += `\n- Description: ${parsedProduct.description}`;
            if (parsedProduct.price) productCtx += `\n- Price: ${parsedProduct.price}`;
            if (parsedProduct.features && parsedProduct.features.length) productCtx += `\n- Key Features: ${parsedProduct.features.slice(0, 5).join(', ')}`;
            contextSections.push(productCtx);
        }
        
        if (brandName) {
            contextSections.push(`BRAND: ${brandName}`);
        }

        const contextBlock = contextSections.length > 0
            ? `\n\n═══ CONTEXT PROVIDED ═══\n${contextSections.join('\n\n')}\n═══ END CONTEXT ═══\n\n`
            : '\n\n';

        let promptText = `You are an expert AI Video Director specializing in cinematic ad generation.

I am providing you with reference images${contextSections.length > 0 ? ' and contextual information' : ''}.
Your task is to synthesize ALL provided inputs into a single, richly detailed video generation prompt.
${contextBlock}IMAGES PROVIDED:
${labels.join('\n')}

YOUR TASK — Write a comprehensive, cinematic video generation prompt following these rules:

1. HONOR THE USER'S BRIEF: If a creative direction was provided above, it is your PRIMARY guide. Build upon it — expand, enrich, and detail it, but do NOT contradict or ignore it.

2. PRODUCT ACCURACY: If product images or product data are provided, explicitly describe the product's exact physical appearance — shape, color, texture, packaging, logo placement, material. Use the product data (name, description, features) to accurately name and describe it. Do NOT invent features that are not visible or described.

3. AVATAR/CHARACTER FIDELITY: If an avatar/character image is provided, describe their exact appearance in exhaustive detail — face shape, skin tone, hair style and color, facial hair, expression, body build, posture, clothing (every garment piece, color, fit, pattern). Describe them so precisely that a video model can replicate them perfectly without seeing the image. Do NOT use age descriptors. Do NOT invent features.

4. SCENE COMPOSITION: Describe how the person and product interact — staging, hand placement, camera angle, background environment, lighting setup (direction, color temperature, shadows), depth of field, and mood.

5. MOTION & CINEMATOGRAPHY: Describe camera movement (dolly, pan, tracking), subject motion (gestures, expressions changing), product handling, and temporal flow of the scene from start to finish.

6. OUTPUT FORMAT: Write ONLY the video prompt — no pleasantries, no markdown headers, no quotes, no explanations. Start directly with the scene description. Be exhaustively detailed with no arbitrary length limits.

Write the detailed video prompt now:`;

        parts.push({ text: promptText });

        const baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
        const modelsToTry = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-pro'];
        
        let data = null;
        let lastError = null;

        for (const modelId of modelsToTry) {
            try {
                const url = `${baseUrl}/models/${modelId}:generateContent?key=${apiKey}`;
                const resp = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ role: 'user', parts }],
                        generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
                    }),
                    signal: AbortSignal.timeout(45_000),
                });

                data = await resp.json();
                
                if (data.error) {
                    const errMsg = data.error.message?.toLowerCase() || '';
                    const isRetryable = resp.status === 503 || resp.status === 429 || errMsg.includes('overloaded');
                    if (isRetryable) {
                        lastError = new Error(data.error.message);
                        data = null;
                        continue;
                    }
                    throw new Error(data.error.message);
                }
                break;
            } catch (fetchErr) {
                if (fetchErr.name === 'AbortError') {
                    lastError = fetchErr;
                    data = null;
                    continue;
                }
                throw fetchErr;
            }
        }

        if (!data) throw lastError || new Error('All Gemini models unavailable for asset analysis');

        let detailedPrompt = '';
        const allParts = data.candidates?.[0]?.content?.parts || [];
        for (const p of allParts) {
            if (p.text && !p.thought) detailedPrompt += p.text;
        }

        res.json({ success: true, prompt: detailedPrompt.trim() });

    } catch (error) {
        console.error('❌ Error analyzing video assets:', error.message);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ── GET /api/video-studio/ugc-pro/qads/v2/presets ──
// Returns all 13 presets for frontend grid
router.get('/ugc-pro/qads/v2/presets', protect, async (req, res) => {
    try {
        const data = await getPresets();
        res.json({ success: true, presets: data.presets, categories: data.categories });
    } catch (err) {
        console.error('[Q-Ads V2] get presets error:', err.message);
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

// ── POST /api/video-studio/ugc-pro/qads/v2/generate-prompts ──
// Single Claude call: Brand DNA + MCP + Preset rules → 3 cinematic prose variants (4 credits)
router.post('/ugc-pro/qads/v2/generate-prompts', protect, requireCredits('qAdsPrompt'), async (req, res) => {
    try {
        const { brandId, presetId, userBrief, productData, settings, avatarUrl, productImageUrls } = req.body;
        const parsedProduct = typeof productData === 'string' ? JSON.parse(productData) : (productData || {});
        const parsedSettings = typeof settings === 'string' ? JSON.parse(settings) : (settings || {});
        const parsedProdImgs = Array.isArray(productImageUrls) ? productImageUrls : [];

        if (!presetId) return res.status(400).json({ success: false, error: 'presetId is required' });

        console.log(`[Q-Ads V2] generate-prompts: brand=${brandId}, preset=${presetId}, images=${parsedProdImgs.length}`);

        const result = await runQAdsAgent({
            brandId,
            presetId,
            userBrief: userBrief || '',
            productData: parsedProduct,
            productImageUrls: parsedProdImgs,
            avatarUrl: avatarUrl || null,
            settings: parsedSettings,
            userId: req.user._id,
        });

        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[Q-Ads V2] generate-prompts error:', err.message);
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

// ── POST /api/video-studio/ugc-pro/qads/v2/generate-video ──
// Submit one variant paragraph to Seedance 2.0 (8 credits per call)
router.post('/ugc-pro/qads/v2/generate-video', protect, requireCredits('qAdsGenerate'), async (req, res) => {
    try {
        const { brandId, presetId, variantId, prompt, legend, productImageUrls: bodyProductImgUrls, avatarUrl, settings } = req.body;
        const parsedSettings = typeof settings === 'string' ? JSON.parse(settings) : (settings || {});
        const parsedProductImgs = typeof bodyProductImgUrls === 'string'
            ? JSON.parse(bodyProductImgUrls) : (Array.isArray(bodyProductImgUrls) ? bodyProductImgUrls : []);

        if (!prompt || !prompt.trim()) return res.status(400).json({ success: false, error: 'prompt is required' });

        // Get preset for metadata
        const allPresets = await getPresets();
        const rawPreset = allPresets.presets.find(p => p.presetCode === presetId || p.id === presetId || p._id?.toString() === presetId);
        if (!rawPreset) return res.status(400).json({ success: false, error: `Unknown preset: ${presetId}`});
        const preset = { ...rawPreset, ...(rawPreset.promptRules || {}) };

        // Product images for Seedance
        const imageUrls = parsedProductImgs.filter(u => u && typeof u === 'string' && u.startsWith('http'));

        // Avatar as face reference — Atlas Asset Library registers it, bypassing safety filters
        const avatarFaceRefs = avatarUrl ? [avatarUrl] : [];
        if (avatarFaceRefs.length > 0) {
            console.log(`[Q-Ads V2] Avatar → face reference (Atlas Asset Library): ${avatarUrl.substring(0, 60)}...`);
        }

        // Strip legend from prompt
        let finalPrompt = prompt
            .replace(/@image\d+\s*=.*\n?/g, '')  // remove legend lines if duplicated
            .trim();

        const selectedModel = parsedSettings.model || 'seedance-2.0';
        const duration = Math.min(parseInt(parsedSettings.duration || preset?.recommendedDuration || 8), 15);
        const aspectRatio = parsedSettings.format || preset?.recommendedFormat || '9:16';
        const resolution = parsedSettings.resolution || '720p';

        // Build reference images: avatar (face) + ALL product images (visual anchors)
        // Previously, only imageUrls.slice(1) was included — the FIRST product image was only
        // a "first frame" hint that the model drifted from. Now ALL product images are references
        // so the model locks onto the product's exact appearance throughout the video.
        const allReferenceImages = [...avatarFaceRefs, ...imageUrls];

        // Determine imageRole for Atlas Cloud processing:
        // - 'character' when avatar is present (face asset registration, no product face check)
        // - 'product' when only product images (skip face registration entirely)
        const imageRole = avatarFaceRefs.length > 0 ? 'character' : 'product';

        console.log(`[Q-Ads V2] Submitting variant ${variantId} — model=${selectedModel}, ${duration}s, res=${resolution}, ${imageUrls.length} product images, ${avatarFaceRefs.length} face refs, total refs=${allReferenceImages.length}`);

        // Determine correct imageRole for Atlas:
        //   'face'          — user provided avatar (UGC Pro style)
        //   'fashion-model' — garment/apparel brand; product image likely contains a human model
        //   'product'       — standalone product
        const brandContext = await loadBrandContext(brandId).catch(() => null);
        const parsedProduct = null; // product data not passed to generate-video endpoint
        const isFashionBrand = isFashionCategory({ productData: parsedProduct || {}, userBrief: '' });
        const resolvedV2ImageRole = resolveImageRole({
            hasAvatar: avatarFaceRefs.length > 0,
            isFashion: isFashionBrand,
        });
        if (isFashionBrand && resolvedV2ImageRole === 'fashion-model') {
            console.log(`👗 [Q-Ads V2] Fashion/apparel brand detected — imageRole=fashion-model`);
        }

        // CRITICAL ROUTING FIX:
        // We now bundle BOTH the product images and the avatar into referenceImages,
        // and set imageUrl to null. This forces the model into Reference-to-Video (R2V) mode,
        // rather than Image-to-Video (I2V) mode where it struggles with product hallucination.
        // The atlasClient will handle passing these through the Asset Library to bypass safety filters.
        
        // Order matters: qAdsAgent sets <<<image_1>>> = product, <<<image_2>>> = avatar
        const finalReferenceImages = [...imageUrls, ...avatarFaceRefs].slice(0, 9);

        const genResult = await submitVideoGeneration({
            prompt:           finalPrompt,
            model:            selectedModel,
            duration,
            aspectRatio,
            resolution,
            qualityMode:      'high',
            generateAudio:    true,
            imageUrl:         null,                     // No starting frame, pure R2V
            referenceImages:  finalReferenceImages,     // Avatar + Product(s) → Asset Library
            imageRole:        resolvedV2ImageRole,
        });


        // Persist as VideoProject for polling
        const { VideoProject } = await import('../models/VideoProject.js').catch(() => ({ VideoProject: null }));
        let projectId = null;
        if (VideoProject) {
            const project = await VideoProject.create({
                user: req.user._id,
                brand: brandId,
                studioMode: 'q-ads-v2',
                mode: 'image-to-video',
                status: 'generating',
                title: `Q-Ad [${preset?.name || presetId}] Variant ${variantId}`,
                backendPrompt: finalPrompt,
                input: {
                    brief: userBrief || `Q-Ads V2 [${preset?.name || presetId}] ${variantId}`,
                    images: imageUrls.map((u, i) => ({ url: u, source: 'upload', label: `product-${i + 1}` })),
                },
                generation: {
                    provider: genResult.provider || 'atlascloud',
                    model: selectedModel,
                    falRequestId: genResult.requestId || genResult.taskId || genResult.falRequestId,
                    taskId: genResult.requestId || genResult.taskId || genResult.falRequestId,
                    requestId: genResult.requestId || genResult.taskId || genResult.falRequestId,
                    duration,
                    aspectRatio,
                    progress: 0,
                    status: 'GENERATING',
                },
            }).catch(e => { console.warn('[Q-Ads V2 Gen] VideoProject create failed:', e.message); return null; });
            projectId = project?._id;
        }

        res.json({
            success: true,
            projectId,
            requestId: genResult.requestId || genResult.taskId,
            jobId: genResult.requestId || genResult.taskId,
            falRequestId: genResult.requestId || genResult.taskId,
            provider: 'atlascloud',
            variantId,
            presetId,
            prompt: finalPrompt,
            imageCount: imageUrls.length,
            duration,
            aspectRatio,
        });
    } catch (err) {
        console.error('[Q-Ads V2 Gen] Error:', err.message);
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});


// ══════════════════════════════════════════════════════════════════════════════
// POST /api/video-studio/:id/select — User picks a concept → script director
// ══════════════════════════════════════════════════════════════════════════════
router.post('/:id/select', protect, async (req, res) => {
    try {
        const { conceptIndex } = req.body;
        const project = await VideoProject.findOne({ _id: req.params.id, user: req.user._id });
        if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
        if (project.status !== 'brainstorm') return res.status(400).json({ success: false, error: 'Not in brainstorm stage' });

        // Save selected concept
        await VideoProject.findByIdAndUpdate(project._id, { selectedConceptIndex: conceptIndex });

        // Run script director
        if (!project.concepts || project.concepts.length === 0) {
            console.error(`❌ Video Studio select error: Project ${project._id} has no concepts.`, { status: project.status });
            return res.status(400).json({ success: false, error: 'Concepts missing. Please regenerate brainstorm.' });
        }

        // Re-run MCoT visual grounding for script director (non-blocking)
        let visualGrounding = null;
        if (project.brand) {
            try {
                const groundingState = await videoVisualGroundingNode({
                    brandId: project.brand.toString(),
                    brief: project.input?.brief || '',
                });
                visualGrounding = groundingState.visualGrounding;
            } catch (groundErr) {
                console.warn('🧠 MCoT Video Select: Visual grounding skipped:', groundErr.message);
            }
        }

        const state = await runStep(project._id, 'script', scriptDirectorNode, {
            userId: req.user._id.toString(),
            brandId: project.brand?.toString(),
            brief: project.input?.brief || '',
            inputImages: project.input?.images || [],
            videoType: project.input?.videoType || 'ad-film',
            concepts: project.concepts,
            selectedConceptIndex: conceptIndex,
            visualGrounding,
        });

        res.json({
            success: true,
            project: {
                _id: project._id,
                status: 'script',
                script: state.script,
                backendPrompt: state.backendPrompt,
                title: state.title,
                pipeline: getPipelineInfo('script'),
            },
        });
    } catch (error) {
        console.error('Video Studio select error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/video-studio/:id/approve — Approve script → references + routing
// ══════════════════════════════════════════════════════════════════════════════
router.post('/:id/approve', protect, async (req, res) => {
    try {
        const { editedPrompt, editedScript } = req.body;
        const project = await VideoProject.findOne({ _id: req.params.id, user: req.user._id });
        if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
        if (project.status !== 'script') return res.status(400).json({ success: false, error: 'Not in script stage' });

        // Track edits for self-learning
        const editHistory = [...(project.editHistory || [])];
        if (editedPrompt && editedPrompt !== project.backendPrompt) {
            editHistory.push({
                field: 'backendPrompt',
                before: project.backendPrompt,
                after: editedPrompt,
                timestamp: new Date(),
            });
            await VideoProject.findByIdAndUpdate(project._id, {
                backendPrompt: editedPrompt,
                editHistory,
            });
        }

        // Build full state from project
        const fullState = {
            userId: req.user._id.toString(),
            brandId: project.brand?.toString(),
            brief: project.input?.brief || '',
            inputImages: project.input?.images || [],
            videoType: project.input?.videoType || 'ad-film',
            concepts: project.concepts,
            selectedConceptIndex: project.selectedConceptIndex,
            script: editedScript || project.script,
            backendPrompt: editedPrompt || project.backendPrompt,
            title: project.title,
        };

        // Run reference curator + auto-generate first frame image in parallel
        const script = editedScript || project.script;
        const firstShot = script?.shots?.[0];
        // Collect user reference image URLs for style injection (S3 http: or fallback data: URIs)
        const userRefUrls = (fullState.inputImages || [])
            .map(img => img.url)
            .filter(url => url && (url.startsWith('http') || url.startsWith('data:image/')) && !url.includes('localhost') && !url.includes('127.0.0.1'));

        console.log(`🖼️ First frame check: firstShot=${!!firstShot}, userRefUrls=${userRefUrls.length}, inputImages=${fullState.inputImages?.length || 0}`);

        // Extract aspect ratio from project config (default to 16:9 for video)
        const targetAspectRatio = project.advancedConfig?.aspectRatio || '16:9';

        // Always generate a cinematic first frame — even when user provides reference images.
        // User reference images are injected INTO Gemini so it performs style-transfer and
        // subject-aware scene composition rather than using a raw product-on-white-bg as frame 1.
        let firstFramePromise = Promise.resolve(null);
        if (firstShot) {
            console.log(`🖼️ Auto-generating first frame image (refs=${userRefUrls.length}, ratio=${targetAspectRatio})...`);
            firstFramePromise = (async () => {
                try {
                    const { geminiImageGenerate } = await import('../agents/videoStudio/firstFrame.js');
                    const brand = project.brand ? await Brand.findById(project.brand).lean() : null;
                    const shotDesc = firstShot.description || firstShot.visual || firstShot.prompt || 'cinematic opening shot';

                    // Build a richer prompt that instructs Gemini to incorporate the reference images
                    const refInstruction = userRefUrls.length > 0
                        ? `\nREFERENCE IMAGES ARE ATTACHED — incorporate the subjects, products, colors, and visual style from these reference images into the scene. The scene should feel like a natural cinematic extension of the reference images, NOT a copy. Place the subjects/products naturally within the scene composition.`
                        : '';

                    const shotPrompt = `Generate a cinematic, photorealistic still frame for a video scene: ${shotDesc}.
Style: ${firstShot.style || script?.narrative || 'cinematic, professional'}.
Aspect Ratio: ${targetAspectRatio} — compose the image for this exact ratio.
${brand?.name ? `Brand: ${brand.name}` : ''}${refInstruction}
This image will be used as the FIRST FRAME of a video — make it visually striking, well-composed, and suitable as an opening shot.
Output ONLY the image, no text or labels.`;
                    console.log('🖼️ First frame prompt:', shotPrompt.substring(0, 250) + '...');
                    const result = await geminiImageGenerate(shotPrompt, [], 0.5, {
                        aspectRatio: targetAspectRatio,
                        referenceImageUrls: userRefUrls,
                    });
                    if (result.imageUrl) {
                        console.log('✅ First frame image generated successfully:', result.imageUrl.substring(0, 80));
                        return result.imageUrl;
                    }
                } catch (e) {
                    console.warn('⚠️ First frame generation failed (non-blocking):', e.message);
                }
                return null;
            })();
        } else {
            console.log('🖼️ Skipping first frame generation: no first shot in script');
        }

        // Run reference curator
        const refState = await runStep(project._id, 'references', referenceCuratorNode, fullState);

        // Wait for first frame and store it
        const firstFrameUrl = await firstFramePromise;
        if (firstFrameUrl) {
            const images = [...(project.input?.images || [])];
            images.unshift({ url: firstFrameUrl, source: 'ai-first-frame', label: `First shot: ${(firstShot.description || '').substring(0, 60)}` });
            await VideoProject.findByIdAndUpdate(project._id, { 'input.images': images });
            // Also inject into state for videoGeneratorNode
            refState.inputImages = images;
        }

        // Auto-advance to model router
        const routingState = await runStep(project._id, 'routing', modelRouterNode, {
            ...refState,
        });

        res.json({
            success: true,
            project: {
                _id: project._id,
                status: 'routing',
                references: routingState.references,
                routing: routingState.routing,
                pipeline: getPipelineInfo('routing'),
                firstFrameUrl: firstFrameUrl || null,
                images: firstFrameUrl ? routingState.inputImages : (project.input?.images || []),
            },
        });
    } catch (error) {
        console.error('Video Studio approve error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/video-studio/:id/voiceover-preview — Generate TTS voiceover for QC
// ══════════════════════════════════════════════════════════════════════════════
router.post('/:id/voiceover-preview', protect, async (req, res) => {
    try {
        const { voiceProvider, voiceId, speaker, langCode, speed, emotion } = req.body;
        const project = await VideoProject.findOne({ _id: req.params.id, user: req.user._id });
        if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

        // Extract dialogue from the script shots
        const shots = project.script?.shots || [];
        const dialogueParts = shots
            .filter(s => s.dialogue && s.dialogue.trim())
            .map(s => s.dialogue.trim());

        if (dialogueParts.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No dialogue found in the script. Add dialogue to your shots to generate a voiceover.',
            });
        }

        const fullScript = dialogueParts.join('\n\n');
        console.log(`🎙️ Voiceover preview: provider=${voiceProvider}, voice=${voiceId || speaker}, script=${fullScript.length} chars`);

        let audioUrl = '';
        let durationMs = 0;

        if (voiceProvider === 'sarvam') {
            // ── Sarvam TTS for Indian languages ──
            const apiKey = process.env.SARVAM_API_KEY;
            if (!apiKey) return res.status(500).json({ success: false, error: 'Sarvam API key not configured' });

            const ttsResp = await fetch('https://api.sarvam.ai/text-to-speech', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'api-subscription-key': apiKey },
                body: JSON.stringify({
                    inputs: [fullScript.substring(0, 2000)],
                    target_language_code: langCode || 'hi-IN',
                    // Map deprecated or invalid speakers
                    speaker: (() => {
                        const s = speaker || 'anushka';
                        if (s === 'arvind') return 'abhilash';
                        return s;
                    })(),
                    model: 'bulbul:v2',
                    pitch: 0,
                    pace: speed || 1.0,
                    loudness: 1.5,
                    enable_preprocessing: true,
                }),
            });

            if (!ttsResp.ok) {
                const errBody = await ttsResp.text().catch(() => '');
                throw new Error(`Sarvam TTS failed (${ttsResp.status}): ${errBody.substring(0, 200)}`);
            }

            const ttsData = await ttsResp.json();
            const audioBase64 = ttsData.audios?.[0];
            if (!audioBase64) throw new Error('No audio returned from Sarvam');

            const buffer = Buffer.from(audioBase64, 'base64');
            const s3Key = `voiceover-preview/${req.user._id}/${Date.now()}.wav`;
            audioUrl = await uploadToS3(buffer, s3Key, 'audio/wav');
            durationMs = Math.round(buffer.length / 16000) * 1000;

        } else {
            // ── Primary: Minimax or ElevenLabs via fal.ai (synchronous) ──
            if (true) {
                const falKey = process.env.FAL_API_KEY;
                if (!falKey) throw new Error('No TTS provider configured (FAL_API_KEY missing)');
                
                let apiUrl, payload;
                const isEleven = voiceProvider === 'elevenlabs';

                if (isEleven) {
                    apiUrl = 'https://fal.run/fal-ai/elevenlabs/tts/eleven-v3';
                    payload = {
                        text: fullScript.substring(0, 5000),
                        voice: voiceId || 'Rachel'
                    };
                } else {
                    apiUrl = 'https://fal.run/fal-ai/minimax/speech-02-hd';
                    payload = {
                        text: fullScript.substring(0, 5000),
                        voice_setting: { voice_id: voiceId || 'Deep_Voice_Man', speed: speed || 1 },
                        output_format: 'url',
                        language_boost: 'auto',
                    };
                    if (emotion) payload.voice_setting.emotion = emotion;
                }

                console.log(`🔊 [Voiceover] TTS: calling synchronous endpoint via ${isEleven ? 'elevenlabs' : 'minimax'}...`);
                const resp = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Authorization': `Key ${falKey}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    signal: AbortSignal.timeout(120000), // 120s for longer scripts
                });
                
                if (!resp.ok) {
                    const errText = await resp.text();
                    throw new Error(`TTS failed (${resp.status}): ${errText.substring(0, 200)}`);
                }

                const result = await resp.json();

                const generatedAudioUrl = result?.audio?.url || result?.audio_url || result?.audio_file?.url || result?.url;
                if (!generatedAudioUrl) throw new Error('TTS returned no audio.');

                const audioResp = await fetch(generatedAudioUrl, { signal: AbortSignal.timeout(20000) });
                const audioBuffer = Buffer.from(await audioResp.arrayBuffer());
                const s3Key = `voiceover-preview/${req.user._id}/${Date.now()}.mp3`;
                audioUrl = await uploadToS3(audioBuffer, s3Key, 'audio/mpeg');
                durationMs = result.duration_ms || 0;
                console.log(`✅ [Voiceover] Minimax TTS done: ${audioUrl.substring(0, 60)}`);
            }
        }

        // Save voiceover preview to project
        await VideoProject.findByIdAndUpdate(project._id, {
            voiceoverPreview: {
                audioUrl,
                voiceProvider: voiceProvider || 'minimax',
                voiceId: voiceId || speaker || '',
                speed: speed || 1.0,
                generatedAt: new Date(),
            },
        });

        console.log(`✅ Voiceover preview generated: ${audioUrl.substring(0, 80)}...`);
        res.json({ success: true, audioUrl, durationMs });
    } catch (error) {
        console.error('Voiceover preview error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/video-studio/:id/generate-images — Generate initial frames for review
// ══════════════════════════════════════════════════════════════════════════════
router.post('/:id/generate-images', protect, async (req, res) => {
    try {
        const { resolution, model, mode, aspectRatio } = req.body; // Optional overrides
        const project = await VideoProject.findOne({ _id: req.params.id, user: req.user._id });
        if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
        if (project.status !== 'routing') return res.status(400).json({ success: false, error: 'Not in routing stage' });

        // Apply any user overrides
        const routing = { ...(project.routing?.toObject ? project.routing.toObject() : project.routing) };
        if (resolution) routing.resolution = resolution;
        if (model) routing.selectedModel = model;
        if (mode) routing.mode = mode;
        if (aspectRatio) routing.aspectRatio = aspectRatio;
        if (resolution || model || mode || aspectRatio) {
            routing.costPreview = estimateCost(
                routing.selectedModel,
                project.script?.totalDuration || 5,
                routing.resolution,
                routing.mode
            );
        }
        await VideoProject.findByIdAndUpdate(project._id, { routing });

        const shots = project.script?.shots || [];
        const ar = routing.aspectRatio || '16:9';

        // Collect product/reference images
        const userRefUrls = (project.input?.images || [])
            .map(img => img.url)
            .filter(url => url && (url.startsWith('http') || url.startsWith('data:image/')) && !url.includes('localhost'));
        const brandRefUrls = (project.references?.brandImages || [])
            .map(img => img.url)
            .filter(url => url && url.startsWith('http'));
        const userUploadedUrls = (project.references?.userUploaded || [])
            .map(img => img.url)
            .filter(url => url && url.startsWith('http'));
        const allRefImages = [...userRefUrls, ...userUploadedUrls, ...brandRefUrls];

        if (shots.length > 0) {
            console.log(`🖼️ Generating images for ${shots.length} shots...`);
            const { geminiImageGenerate } = await import('../agents/videoStudio/firstFrame.js');
            const brand = project.brand ? await Brand.findById(project.brand).lean() : null;

            // Generate images sequentially with delay to avoid Gemini rate limits
            // Gemini image gen allows ~2-3 requests/minute, so we space them 5s apart
            const generatedImages = [];
            for (let i = 0; i < shots.length; i++) {
                // Rate limit spacing: wait 10s between shots to avoid Gemini "high demand" errors
                if (i > 0) {
                    console.log(`🖼️ Waiting 10s before shot ${i + 1} (Gemini rate limit spacing)...`);
                    await new Promise(r => setTimeout(r, 10000));
                }

                const shot = shots[i];
                const shotVisual = shot.visual || shot.description || shot.prompt || '';
                const shotCamera = shot.camera || '';
                const shotDialogue = shot.dialogue || '';

                try {
                    const shotPrompt = [
                        `Generate a cinematic, photorealistic still frame for shot ${i + 1} of a video:`,
                        shotVisual,
                        shotCamera ? `Camera: ${shotCamera}` : '',
                        shotDialogue ? `Scene narration: "${shotDialogue}"` : '',
                        `Aspect Ratio: ${ar}`,
                        brand?.name ? `Brand: ${brand.name}` : '',
                        allRefImages.length > 0 ? 'REFERENCE IMAGES ARE ATTACHED — incorporate the product, subjects, and visual style from these references. Maintain EXACT product appearance throughout.' : '',
                        'This image will be animated into a video — make it well-composed and suitable for motion.',
                        'Output ONLY the image, no text or labels.',
                    ].filter(Boolean).join('\n');

                    const result = await geminiImageGenerate(shotPrompt, [], 0.5, {
                        aspectRatio: ar,
                        referenceImageUrls: allRefImages.slice(0, 2), // 2 refs OK — images are resized to 512px via sharp
                    });
                    
                    generatedImages.push(result.imageUrl || (allRefImages.length > 0 && i === 0 ? allRefImages[0] : null));
                } catch (imgErr) {
                    console.warn(`⚠️ Shot ${i + 1} image gen failed:`, imgErr.message);
                    generatedImages.push(allRefImages.length > 0 && i === 0 ? allRefImages[0] : null);
                }
            }

            // Update shots with generated images
            shots.forEach((shot, i) => {
                shot.imageUrl = generatedImages[i] || ''; // Save intermediate image URL to the shot
            });

            // Set state to image-review
            await VideoProject.findByIdAndUpdate(project._id, {
                'script.shots': shots,
                status: 'image-review'
            });

            const updatedProject = await VideoProject.findById(project._id).lean();
            return res.json({
                success: true,
                project: {
                    ...updatedProject,
                    pipeline: getPipelineInfo('image-review')
                }
            });
        } else {
            // No shots, skip straight to single video generation
            await VideoProject.findByIdAndUpdate(project._id, { status: 'image-review' });
            const updatedProject = await VideoProject.findById(project._id).lean();
            return res.json({
                success: true,
                project: {
                    ...updatedProject,
                    pipeline: getPipelineInfo('image-review')
                }
            });
        }
    } catch (error) {
        console.error('Video Studio generate-images error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/video-studio/:id/regenerate-shot-image — Regenerate a single specific shot frame
// ══════════════════════════════════════════════════════════════════════════════
router.post('/:id/regenerate-shot-image', protect, async (req, res) => {
    try {
        const { shotIndex, overridePrompt } = req.body;
        const project = await VideoProject.findOne({ _id: req.params.id, user: req.user._id });
        if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
        if (project.status !== 'image-review') return res.status(400).json({ success: false, error: 'Not in image review stage' });
        
        const shots = project.script?.shots || [];
        if (shotIndex < 0 || shotIndex >= shots.length) {
            return res.status(400).json({ success: false, error: 'Invalid shot index' });
        }

        const shot = shots[shotIndex];
        const { geminiImageGenerate } = await import('../agents/videoStudio/firstFrame.js');
        const ar = project.routing?.aspectRatio || '16:9';
        
        // Collect product/reference images
        const userRefUrls = (project.input?.images || [])
            .map(img => img.url)
            .filter(url => url && (url.startsWith('http') || url.startsWith('data:image/')) && !url.includes('localhost'));
        const brandRefUrls = (project.references?.brandImages || [])
            .map(img => img.url)
            .filter(url => url && url.startsWith('http'));
        const userUploadedUrls = (project.references?.userUploaded || [])
            .map(img => img.url)
            .filter(url => url && url.startsWith('http'));
        const allRefImages = [...userRefUrls, ...userUploadedUrls, ...brandRefUrls];

        const shotVisual = overridePrompt || shot.visual || shot.description || shot.prompt || '';
        
        console.log(`🖼️ Regenerating image for shot ${shotIndex + 1}...`);
        
        const shotPrompt = [
            `Generate a cinematic, photorealistic still frame for shot ${shotIndex + 1} of a video:`,
            shotVisual,
            `Aspect Ratio: ${ar}`,
            allRefImages.length > 0 ? 'REFERENCE IMAGES ARE ATTACHED — incorporate the product, subjects, and visual style from these references. Maintain EXACT product appearance throughout.' : '',
            'This image will be animated into a video — make it well-composed and suitable for motion.',
            'Output ONLY the image, no text or labels.',
        ].filter(Boolean).join('\n');

        const result = await geminiImageGenerate(shotPrompt, [], 0.5, {
            aspectRatio: ar,
            referenceImageUrls: allRefImages.slice(0, 2) // 2 refs OK — images are resized to 512px via sharp
        });

        if (result.imageUrl) {
            shots[shotIndex].imageUrl = result.imageUrl;
            
            await VideoProject.findByIdAndUpdate(project._id, {
                'script.shots': shots
            });
            
            return res.json({ success: true, imageUrl: result.imageUrl, shots });
        } else {
            return res.status(500).json({ success: false, error: 'Failed to regenerate image' });
        }
    } catch (error) {
        console.error('Video Studio regenerate-shot-image error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/video-studio/:id/generate — Confirm cost → trigger fal.ai
// ══════════════════════════════════════════════════════════════════════════════
router.post('/:id/generate', protect, requireCredits('videoGenerate'), async (req, res) => {
    try {
        const { resolution, model, mode, aspectRatio } = req.body; // Optional overrides
        const project = await VideoProject.findOne({ _id: req.params.id, user: req.user._id });
        if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
        if (project.status !== 'routing') return res.status(400).json({ success: false, error: 'Not in routing stage' });

        // Apply any user overrides
        const routing = { ...(project.routing?.toObject ? project.routing.toObject() : project.routing) };
        if (resolution) routing.resolution = resolution;
        if (model) routing.selectedModel = model;
        if (mode) routing.mode = mode;
        if (aspectRatio) routing.aspectRatio = aspectRatio;
        if (resolution || model || mode || aspectRatio) {
            routing.costPreview = estimateCost(
                routing.selectedModel,
                project.script?.totalDuration || 5,
                routing.resolution,
                routing.mode
            );
        }
        await VideoProject.findByIdAndUpdate(project._id, { routing, creditsUsed: req.creditsDeducted || 0 });

        const shots = project.script?.shots || [];
        const selectedModel = routing.selectedModel || 'grok-imagine';
        const ar = routing.aspectRatio || '16:9';
        const qualityMode = routing.mode || 'fast';

        // Collect product/reference images for consistency across all shots
        const userRefUrls = (project.input?.images || [])
            .map(img => img.url)
            .filter(url => url && url.startsWith('http') && !url.includes('localhost'));
        const brandRefUrls = (project.references?.brandImages || [])
            .map(img => img.url)
            .filter(url => url && url.startsWith('http'));
        const userUploadedUrls = (project.references?.userUploaded || [])
            .map(img => img.url)
            .filter(url => url && url.startsWith('http'));
        const allRefImages = [...userRefUrls, ...userUploadedUrls, ...brandRefUrls];

        // ── SHOT-BY-SHOT PIPELINE ──
        if (shots.length > 1) {
            console.log(`🎬 Shot-by-shot pipeline: ${shots.length} shots × ${selectedModel}`);

            const shotGenerations = [];
            for (let i = 0; i < shots.length; i++) {
                const shot = shots[i];
                const shotDur = Math.min(Math.max(shot.duration || 5, 3), 10);
                const shotVisual = shot.visual || shot.description || shot.prompt || '';
                const shotCamera = shot.camera || '';
                const shotDialogue = shot.dialogue || '';

                // Use the pre-generated image chosen during the Image Review step
                let shotImageUrl = shot.imageUrl || null;

                // If no image is present but we have user ref images, fallback to the first one for shot 1
                if (!shotImageUrl && allRefImages.length > 0 && i === 0) {
                    shotImageUrl = allRefImages[0];
                }

                // Step B: Submit image-to-video (or text-to-video if no image)
                console.log(`   🎥 Shot ${i + 1}/${shots.length}: submitting to ${selectedModel} (${shotDur}s) with image: ${shotImageUrl ? 'YES' : 'NO'}`);
                try {
                    const enrichedPrompt = [
                        shotVisual,
                        shotCamera ? `Camera movement: ${shotCamera}` : '',
                        shotDialogue ? `The scene illustrates: "${shotDialogue}"` : '',
                    ].filter(Boolean).join('. ');

                    const genResult = await submitVideoGeneration({
                        model: selectedModel,
                        prompt: enrichedPrompt,
                        imageUrl: shotImageUrl || null,
                        duration: shotDur,
                        resolution: routing.resolution || '1080p',
                        mode: qualityMode,
                        generateAudio: routing.generateAudio !== false,
                        aspectRatio: ar,
                        referenceImages: allRefImages.slice(0, 3),
                    });

                    shotGenerations.push({
                        shotIndex: i,
                        shotNumber: i + 1,
                        duration: shotDur,
                        visual: shotVisual.substring(0, 200),
                        dialogue: shotDialogue,
                        imageUrl: shotImageUrl || '',
                        falRequestId: genResult.requestId,
                        falEndpoint: genResult.endpoint,
                        falStatusUrl: genResult.statusUrl,
                        falResultUrl: genResult.resultUrl,
                        provider: genResult.provider || 'fal',
                        _atlasCloudPayload: genResult._atlasCloudPayload || null,
                        _muApiPayload: genResult._muApiPayload || null,
                        _laozhangVideoUrl: genResult._laozhangVideoUrl || null,
                        videoUrl: genResult._laozhangVideoUrl || '',
                        status: genResult._laozhangVideoUrl ? 'COMPLETED' : 'IN_QUEUE',
                        progress: genResult._laozhangVideoUrl ? 100 : 5,
                        error: '',
                    });

                    console.log(`   🎬 Shot ${i + 1}: submitted (${genResult.provider}, ${shotDur}s)`);
                } catch (shotErr) {
                    console.error(`   ❌ Shot ${i + 1} submission failed:`, shotErr.message);
                    shotGenerations.push({
                        shotIndex: i,
                        shotNumber: i + 1,
                        duration: shotDur,
                        visual: shotVisual.substring(0, 200),
                        status: 'FAILED',
                        error: shotErr.message,
                    });
                }
            }

            // Save multi-shot generation state
            await VideoProject.findByIdAndUpdate(project._id, {
                status: 'multi-generating',
                generation: {
                    isMultiShot: true,
                    shots: shotGenerations,
                    totalShots: shots.length,
                    completedShots: shotGenerations.filter(s => s.status === 'COMPLETED').length,
                    progress: Math.round((shotGenerations.filter(s => s.status === 'COMPLETED').length / shots.length) * 100),
                    startedAt: new Date(),
                    model: selectedModel,
                },
                backendPrompt: project.backendPrompt,
            });

            return res.json({
                success: true,
                project: {
                    _id: project._id,
                    status: 'multi-generating',
                    generation: {
                        isMultiShot: true,
                        totalShots: shots.length,
                        completedShots: shotGenerations.filter(s => s.status === 'COMPLETED').length,
                        progress: Math.round((shotGenerations.filter(s => s.status === 'COMPLETED').length / shots.length) * 100),
                        shots: shotGenerations.map(s => ({ shotNumber: s.shotNumber, status: s.status, progress: s.progress })),
                    },
                    pipeline: getPipelineInfo('generating'),
                },
            });
        }

        // ── FALLBACK: Single-shot (no multi-shot script) ──
        console.log(`🎬 Single-shot generation: ${selectedModel}`);
        const updatedProject = await VideoProject.findById(project._id).lean();
        runStep(project._id, 'generating', videoGeneratorNode, {
            userId: req.user._id.toString(),
            brandId: project.brand?.toString(),
            concepts: updatedProject.concepts,
            selectedConceptIndex: updatedProject.selectedConceptIndex,
            script: updatedProject.script,
            backendPrompt: updatedProject.backendPrompt,
            routing: updatedProject.routing,
            inputImages: updatedProject.input?.images || [],
            references: updatedProject.references,
        }).catch(e => console.error('Background runStep generating failed:', e));

        res.json({
            success: true,
            project: {
                _id: project._id,
                status: 'generating',
                generation: { progress: 5, startedAt: new Date() },
                pipeline: getPipelineInfo('generating'),
            },
        });
    } catch (error) {
        console.error('Video Studio generate error:', error);
        if (req.creditsDeducted > 0) {
            await refundCredits(req.user._id, req.creditsDeducted, 'videoGenerateRefund', `Refund: Video Generation Sync Failure (${safeErrorMessage(error)})`, 'video', { projectId: req.params.id });
        }
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/video-studio/:id/status — Poll generation progress
// ══════════════════════════════════════════════════════════════════════════════
router.get('/:id/status', protect, async (req, res) => {
    try {
        const project = await VideoProject.findOne({ _id: req.params.id, user: req.user._id }).lean();
        if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

        // ── MULTI-SHOT GENERATION: Poll all shots + auto-compile ──
        if (project.status === 'multi-generating' && project.generation?.isMultiShot) {
            const shotGens = project.generation.shots || [];
            let anyChanged = false;

            // Poll each incomplete shot
            for (let i = 0; i < shotGens.length; i++) {
                const shot = shotGens[i];
                if (shot.status === 'COMPLETED' || shot.status === 'FAILED' || !shot.falRequestId) continue;

                try {
                    const shotState = {
                        generation: {
                            falRequestId: shot.falRequestId,
                            falEndpoint: shot.falEndpoint,
                            falStatusUrl: shot.falStatusUrl,
                            falResultUrl: shot.falResultUrl,
                            provider: shot.provider,
                            _atlasCloudPayload: shot._atlasCloudPayload,
                            _muApiPayload: shot._muApiPayload,
                            _laozhangVideoUrl: shot._laozhangVideoUrl,
                            videoUrl: shot.videoUrl,
                            progress: shot.progress,
                        },
                        routing: project.routing,
                    };
                    const updated = await pollGenerationStatus(shotState);

                    if (updated.generation.videoUrl && updated.generation.videoUrl !== shot.videoUrl) {
                        shotGens[i].videoUrl = updated.generation.videoUrl;
                        shotGens[i].status = 'COMPLETED';
                        shotGens[i].progress = 100;
                        anyChanged = true;
                    } else if (updated.generation.progress !== shot.progress) {
                        shotGens[i].progress = updated.generation.progress || shot.progress;
                        shotGens[i].status = updated.generation.status || shot.status;
                        anyChanged = true;
                    }
                    if (updated.status === 'failed' || updated.generation?.error) {
                        shotGens[i].status = 'FAILED';
                        shotGens[i].error = updated.generation.error || 'Generation failed';
                        anyChanged = true;
                    }
                } catch (pollErr) {
                    console.warn(`   ⚠️ Shot ${i + 1} poll error:`, pollErr.message);
                }
            }

            const completedShots = shotGens.filter(s => s.status === 'COMPLETED');
            const failedShots = shotGens.filter(s => s.status === 'FAILED');
            const totalProgress = Math.round((completedShots.length / shotGens.length) * 100);

            if (anyChanged) {
                await VideoProject.findByIdAndUpdate(project._id, {
                    'generation.shots': shotGens,
                    'generation.completedShots': completedShots.length,
                    'generation.progress': totalProgress,
                });
            }

            // All shots done (or failed) → auto-compile
            if (completedShots.length + failedShots.length === shotGens.length && completedShots.length > 0) {
                console.log(`🎬 All ${completedShots.length}/${shotGens.length} shots complete. Auto-compiling...`);

                try {
                    const fs = await import('fs');
                    const path = await import('path');
                    const os = await import('os');
                    const { execSync } = await import('child_process');
                    const ffmpegModule = await import('@ffmpeg-installer/ffmpeg');
                    const ffmpegPath = ffmpegModule.default?.path || ffmpegModule.path;

                    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mantram-multishot-'));

                    // Download all completed shot videos
                    const clipPaths = [];
                    for (const shot of completedShots.sort((a, b) => a.shotIndex - b.shotIndex)) {
                        const clipPath = path.join(tmpDir, `shot_${shot.shotIndex}.mp4`);
                        try {
                            let videoUrl = shot.videoUrl;
                            // Upload to S3 first if it's a CDN URL
                            if (videoUrl && !videoUrl.includes('mantram-assets')) {
                                const s3Result = await downloadAndUploadVideoToS3(`${project._id}-shot-${shot.shotIndex}`, videoUrl);
                                if (s3Result) videoUrl = s3Result;
                            }
                            const resp = await fetch(videoUrl, { signal: AbortSignal.timeout(60000) });
                            fs.writeFileSync(clipPath, Buffer.from(await resp.arrayBuffer()));
                            clipPaths.push(clipPath);
                        } catch (dlErr) {
                            console.warn(`   ⚠️ Shot ${shot.shotNumber} download failed:`, dlErr.message);
                        }
                    }

                    if (clipPaths.length === 0) throw new Error('No clips downloaded');

                    // Download voiceover if available
                    let voiceoverPath = null;
                    if (project.voiceoverPreview?.audioUrl) {
                        voiceoverPath = path.join(tmpDir, 'voiceover.mp3');
                        try {
                            const voResp = await fetch(project.voiceoverPreview.audioUrl, { signal: AbortSignal.timeout(30000) });
                            fs.writeFileSync(voiceoverPath, Buffer.from(await voResp.arrayBuffer()));
                            console.log(`   🎙️ Voiceover downloaded for mixing`);
                        } catch { voiceoverPath = null; }
                    }

                    // FFmpeg: concat all clips
                    const concatFile = path.join(tmpDir, 'concat.txt');
                    fs.writeFileSync(concatFile, clipPaths.map(p => `file '${p}'`).join('\n'));

                    const outputPath = path.join(tmpDir, 'compiled.mp4');
                    let ffCmd = `"${ffmpegPath}" -y -f concat -safe 0 -i "${concatFile}"`;

                    if (voiceoverPath) {
                        ffCmd += ` -i "${voiceoverPath}"`;
                        // Mix: original audio at 20% + voiceover at 100%
                        ffCmd += ` -filter_complex "[0:a]volume=0.2[orig];[1:a]volume=1.0[vo];[orig][vo]amix=inputs=2:duration=longest[aout]" -map 0:v -map "[aout]"`;
                    } else {
                        ffCmd += ` -c copy`;
                    }
                    ffCmd += ` -movflags +faststart "${outputPath}"`;

                    console.log(`   🔧 FFmpeg compile: ${clipPaths.length} clips + ${voiceoverPath ? 'VO' : 'no VO'}`);
                    execSync(ffCmd, { stdio: 'pipe', timeout: 180000 });

                    // Upload compiled video to S3
                    const compiledBuffer = fs.readFileSync(outputPath);
                    const compiledUserId = project.user?.toString() || 'unknown';
                    const s3Key = `videos/${compiledUserId}/${project._id}-compiled.mp4`;
                    const finalUrl = await uploadToS3(compiledBuffer, s3Key, 'video/mp4');
                    console.log(`   ✅ Compiled video: ${finalUrl.substring(0, 60)}`);

                    // Clean up temp
                    fs.rmSync(tmpDir, { recursive: true, force: true });

                    // Update project with final compiled video
                    const finalGeneration = {
                        ...project.generation,
                        shots: shotGens,
                        videoUrl: finalUrl,
                        status: 'COMPLETED',
                        progress: 100,
                        completedAt: new Date(),
                        isCompiled: true,
                        totalClips: clipPaths.length,
                        hasVoiceover: !!voiceoverPath,
                    };

                    await VideoProject.findByIdAndUpdate(project._id, {
                        status: 'critique',
                        generation: finalGeneration,
                        finalVideoUrl: finalUrl,
                    });

                    // Run critic on compiled video
                    const criticState = await runStep(project._id, 'critique', criticNode, {
                        userId: project.user.toString(),
                        brandId: project.brand?.toString(),
                        concepts: project.concepts,
                        selectedConceptIndex: project.selectedConceptIndex,
                        script: project.script,
                        backendPrompt: project.backendPrompt,
                        routing: project.routing,
                        generation: finalGeneration,
                    });

                    return res.json({
                        success: true,
                        project: await signVideoProjectAssets({
                            _id: project._id,
                            status: 'critique',
                            generation: finalGeneration,
                            critique: criticState.critique,
                            pipeline: getPipelineInfo('critique'),
                        }),
                    });
                } catch (compileErr) {
                    console.error(`❌ Multi-shot compile failed:`, compileErr.message);
                    // Fall back to returning first completed shot as the video
                    const firstCompleted = completedShots.sort((a, b) => a.shotIndex - b.shotIndex)[0];
                    await VideoProject.findByIdAndUpdate(project._id, {
                        status: 'critique',
                        generation: {
                            ...project.generation,
                            videoUrl: firstCompleted?.videoUrl || '',
                            status: 'COMPLETED',
                            progress: 100,
                            error: `Compile failed: ${compileErr.message}. Showing first shot only.`,
                        },
                    });
                }
            }

            // Still in progress — return per-shot status
            return res.json({
                success: true,
                project: await signVideoProjectAssets({
                    _id: project._id,
                    status: 'multi-generating',
                    generation: {
                        isMultiShot: true,
                        totalShots: shotGens.length,
                        completedShots: completedShots.length,
                        progress: totalProgress,
                        status: 'IN_PROGRESS',
                        shots: shotGens.map(s => ({
                            shotNumber: s.shotNumber,
                            status: s.status,
                            progress: s.progress,
                            visual: s.visual,
                            error: s.error || '',
                        })),
                    },
                    pipeline: getPipelineInfo('generating'),
                }),
            });
        }

        if (project.status === 'generating' || project.status === 'advanced-generating') {

            // ── Race Condition Guard: falRequestId not yet set ──
            // Between the initial HTTP response and advancedGenerateNode completing
            // (which takes ~5-30s for prompt enhancement + provider submission),
            // the DB has status='advanced-generating' but no falRequestId.
            // Return a proper IN_QUEUE status instead of falling through silently.
            if (!project.generation?.falRequestId) {
                return res.json({
                    success: true,
                    project: await signVideoProjectAssets({
                        _id: project._id,
                        status: project.status,
                        generation: {
                            ...(project.generation || {}),
                            status: 'IN_QUEUE',
                            progress: project.generation?.progress || 3,
                        },
                        pipeline: getPipelineInfo(project.status),
                    }),
                });
            }

            // ── HeyGen Provider: Poll HeyGen API directly ──
            if (project.generation?.provider === 'heygen') {
                const heygenStatus = await getHeyGenVideoStatus(project.generation.falRequestId);

                if (heygenStatus.status === 'COMPLETED') {
                    // Video is done — update DB, upload to S3 for persistence
                    const updatedGen = {
                        ...project.generation,
                        videoUrl: heygenStatus.videoUrl,
                        thumbnailUrl: heygenStatus.thumbnailUrl || '',
                        progress: 100,
                        completedAt: new Date(),
                    };
                    await VideoProject.findByIdAndUpdate(project._id, {
                        status: 'completed',
                        generation: updatedGen,
                        finalVideoUrl: heygenStatus.videoUrl,
                    });

                    // Fire-and-forget: upload video to S3 before HeyGen CDN expires
                    if (heygenStatus.videoUrl) {
                        downloadAndUploadVideoToS3(project._id.toString(), heygenStatus.videoUrl)
                            .catch(e => console.warn('⚠️ UGC Video S3 upload failed:', e.message));
                    }

                    return res.json({
                        success: true,
                        project: await signVideoProjectAssets({
                            _id: project._id,
                            status: 'completed',
                            generation: updatedGen,
                        }),
                    });
                }

                if (heygenStatus.status === 'FAILED') {
                    const updatedGen = {
                        ...project.generation,
                        progress: 0,
                        error: heygenStatus.error || 'HeyGen video generation failed',
                    };
                    await VideoProject.findByIdAndUpdate(project._id, {
                        status: 'failed',
                        generation: updatedGen,
                    });

                    if (project.creditsUsed > 0) {
                        await refundCredits(project.user, project.creditsUsed, 'videoGenerateRefund', `Refund: HeyGen Video Generation Async Failure (${heygenStatus.error || 'Unknown'})`, 'video', { projectId: project._id });
                        await VideoProject.findByIdAndUpdate(project._id, { creditsUsed: 0 });
                    }

                    return res.json({
                        success: true,
                        project: await signVideoProjectAssets({
                            _id: project._id,
                            status: 'failed',
                            generation: updatedGen,
                        }),
                    });
                }

                // Still processing — return real-time progress from HeyGen
                return res.json({
                    success: true,
                    project: await signVideoProjectAssets({
                        _id: project._id,
                        status: project.status,
                        generation: {
                            ...project.generation,
                            progress: heygenStatus.progress || project.generation.progress || 20,
                        },
                    }),
                });
            }

            // ── fal.ai / other providers: existing poll logic ──
            const state = {
                generation: project.generation,
                routing: project.routing,
                mode: project.mode,
                status: project.status,
            };
            const updated = await pollGenerationStatus(state);

            // Update project if status or progress changed
            const progressChanged = updated.generation?.progress !== project.generation?.progress;
            if (updated.status !== project.status || progressChanged) {
                await VideoProject.findByIdAndUpdate(project._id, {
                    status: updated.status,
                    generation: updated.generation,
                });

                if (updated.status === 'failed') {
                    // SAFE MODE PIVOT (Kling Fallback):
                    // If the failure was due to Bytedance's real-person safety filter, and we haven't pivoted yet,
                    // automatically reroute to Kling 3.0 which accepts real faces.
                    const isSafetyError = updated.generation?.error?.includes('Safe Mode') || updated.generation?.error?.includes('safety');
                    const currentModel = project.routing?.selectedModel || project.model;
                    
                    if (isSafetyError && currentModel !== 'kling-3.0') {
                        console.log(`🛡️ Safe Mode Pivot: Bytedance rejected real-person image. Falling back to Kling 3.0 (fal.ai) which accepts real faces.`);
                        try {
                            let prompt = '';
                            let imageUrl = null;
                            let duration = 5;
                            let resolution = project.routing?.resolution || '1080p';
                            let aspectRatio = project.routing?.aspectRatio || '16:9';
                            let mode = project.routing?.mode || 'fast';
                            
                            if (project.mode === 'advanced') {
                                prompt = project.advancedConfig?.prompt || project.title;
                                imageUrl = project.advancedConfig?.firstImageUrl || null;
                                duration = project.advancedConfig?.duration || 5;
                            } else {
                                prompt = project.backendPrompt || project.title;
                                imageUrl = project.input?.images?.[0]?.url || null;
                                duration = project.script?.totalDuration || 5;
                            }
                            
                            // Strip @image tags since Kling accepts the image natively for I2V
                            prompt = prompt.replace(/@Image\d+/gi, '').replace(/\s{2,}/g, ' ').trim();

                            const klingResult = await submitVideoGeneration({
                                model: 'kling-3.0',
                                prompt,
                                imageUrl,
                                duration: Math.min(duration, 10),
                                resolution,
                                mode,
                                generateAudio: true,
                                aspectRatio,
                                referenceImages: [],
                            });
                            
                            console.log(`✅ Safe Mode: Kling 3.0 task submitted: ${klingResult.requestId}`);
                            
                            // Update project with Kling generation details and switch status back to generating
                            // Update project with Kling generation details
                            const isLaozhangSync = !!klingResult._laozhangVideoUrl;
                            updated.status = isLaozhangSync ? 'completed' : (project.mode === 'advanced' ? 'advanced-generating' : 'generating');
                            
                            updated.generation = {
                                falRequestId: klingResult.requestId,
                                falEndpoint: klingResult.endpoint,
                                falStatusUrl: klingResult.statusUrl,
                                falResultUrl: klingResult.resultUrl,
                                provider: klingResult.provider || 'fal',
                                _laozhangVideoUrl: klingResult._laozhangVideoUrl || null,
                                videoUrl: klingResult._laozhangVideoUrl || '',
                                progress: isLaozhangSync ? 100 : 5,
                                startedAt: new Date(),
                                ...(isLaozhangSync ? { completedAt: new Date() } : {}),
                                error: '',
                            };
                            
                            if (isLaozhangSync) {
                                updated.finalVideoUrl = klingResult._laozhangVideoUrl;
                            }
                            
                            // Save the pivot back to the DB immediately
                            await VideoProject.findByIdAndUpdate(project._id, {
                                status: updated.status,
                                generation: updated.generation,
                                ...(isLaozhangSync ? { finalVideoUrl: updated.finalVideoUrl } : {}),
                                'routing.selectedModel': 'kling-3.0'
                            });
                            
                            if (isLaozhangSync) {
                                // Fire and forget async download to S3
                                downloadAndUploadVideoToS3(project._id.toString(), klingResult._laozhangVideoUrl)
                                    .catch(err => console.error(`[SafeMode] LaoZhang async S3 upload failed for ${project._id}:`, err.message));
                            }
                            
                        } catch (fallbackErr) {
                            console.error(`❌ Safe Mode Kling fallback failed: ${fallbackErr.message}`);
                            // Fall through to standard refund if fallback fails
                            if (project.creditsUsed > 0) {
                                await refundCredits(project.user, project.creditsUsed, 'videoGenerateRefund', `Refund: Video Generation Async Failure (${updated.generation?.error || 'Unknown'} - Fallback failed)`, 'video', { projectId: project._id });
                                await VideoProject.findByIdAndUpdate(project._id, { creditsUsed: 0 });
                            }
                        }
                    } else {
                        // Standard failure refund
                        if (project.creditsUsed > 0) {
                            await refundCredits(project.user, project.creditsUsed, 'videoGenerateRefund', `Refund: Video Generation Async Failure (${updated.generation?.error || 'Unknown'})`, 'video', { projectId: project._id });
                            await VideoProject.findByIdAndUpdate(project._id, { creditsUsed: 0 });
                        }
                    }
                }

                // If completed, auto-upload video to S3 before CDN URL expires, then run critic (if needed)
                if (updated.status === 'critique' || updated.status === 'completed') {
                    // Use CDN URL for immediate operations (voiceover mixing, critic, frontend display)
                    let finalVideoUrl = updated.generation?.videoUrl;

                    // ⚡ PERF: Fire S3 archival as background task — don't block the polling response.
                    // downloadAndUploadVideoToS3 handles its own DB update on completion.
                    // The CDN URL works for 24-72h which is plenty of time for the background upload.
                    if (finalVideoUrl && !finalVideoUrl.includes('amazonaws.com')) {
                        downloadAndUploadVideoToS3(project._id.toString(), finalVideoUrl)
                            .then(s3Url => {
                                if (s3Url) console.log(`✅ [BG-S3] Video archived: ${s3Url.substring(0, 80)}`);
                            })
                            .catch(e => console.warn('⚠️ [BG-S3] Video archive failed:', e.message));
                    }

                    // ── Auto-mix voiceover if the user generated a preview in step 3 ──
                    if (finalVideoUrl && project.voiceoverPreview?.audioUrl) {
                        try {
                            const fs = await import('fs');
                            const path = await import('path');
                            const os = await import('os');
                            const { execSync } = await import('child_process');
                            const ffmpegModule = await import('@ffmpeg-installer/ffmpeg');
                            const ffmpegPath = ffmpegModule.default?.path || ffmpegModule.path;

                            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mantram-vo-mix-'));
                            console.log(`🎙️ Auto-mixing voiceover into final video...`);

                            // Download video
                            const videoPath = path.join(tmpDir, 'video.mp4');
                            const vidResp = await fetch(finalVideoUrl, { signal: AbortSignal.timeout(60000) });
                            fs.writeFileSync(videoPath, Buffer.from(await vidResp.arrayBuffer()));

                            // Download voiceover
                            const voPath = path.join(tmpDir, 'voiceover.mp3');
                            const voResp = await fetch(project.voiceoverPreview.audioUrl, { signal: AbortSignal.timeout(30000) });
                            fs.writeFileSync(voPath, Buffer.from(await voResp.arrayBuffer()));

                            // Probe if video has an audio stream
                            let hasAudio = false;
                            try {
                                const ffprobePath = ffmpegPath.replace(/ffmpeg$/, 'ffprobe');
                                const probeCmd = `"${ffprobePath}" -v quiet -select_streams a -show_entries stream=codec_type -of csv=p=0 "${videoPath}"`;
                                const probeResult = execSync(probeCmd, { stdio: 'pipe', timeout: 10000 }).toString().trim();
                                hasAudio = probeResult.includes('audio');
                            } catch { hasAudio = false; }

                            const outputPath = path.join(tmpDir, 'mixed.mp4');
                            let ffCmd;
                            if (hasAudio) {
                                // Mix: original audio at 30% + voiceover at 100%
                                ffCmd = `"${ffmpegPath}" -y -i "${videoPath}" -i "${voPath}" -filter_complex "[0:a]volume=0.3[orig];[1:a]volume=1.0[vo];[orig][vo]amix=inputs=2:duration=longest[aout]" -map 0:v -map "[aout]" -c:v copy -movflags +faststart "${outputPath}"`;
                            } else {
                                // No original audio — just add voiceover track
                                ffCmd = `"${ffmpegPath}" -y -i "${videoPath}" -i "${voPath}" -map 0:v -map 1:a -c:v copy -shortest -movflags +faststart "${outputPath}"`;
                            }
                            execSync(ffCmd, { stdio: 'pipe', timeout: 60000 });

                            // Upload mixed video to S3
                            const mixedBuffer = fs.readFileSync(outputPath);
                            const mixUserId = project.user?.toString() || 'unknown';
                            const s3Key = `videos/${mixUserId}/${project._id}-mixed.mp4`;
                            finalVideoUrl = await uploadToS3(mixedBuffer, s3Key, 'video/mp4');
                            console.log(`✅ Voiceover mixed into final video: ${finalVideoUrl.substring(0, 60)}`);

                            // Update generation with mixed video URL
                            updated.generation.videoUrl = finalVideoUrl;
                            await VideoProject.findByIdAndUpdate(project._id, {
                                'generation.videoUrl': finalVideoUrl,
                                finalVideoUrl,
                            });

                            // Clean up temp files
                            fs.rmSync(tmpDir, { recursive: true, force: true });
                        } catch (mixErr) {
                            console.warn(`⚠️ Voiceover auto-mix failed (video still available without VO):`, mixErr.message);
                        }
                    }

                    let criticState = null;
                    if (updated.status === 'critique') {
                        criticState = await runStep(project._id, 'critique', criticNode, {
                            userId: project.user.toString(),
                            brandId: project.brand?.toString(),
                            concepts: project.concepts,
                            selectedConceptIndex: project.selectedConceptIndex,
                            script: project.script,
                            backendPrompt: project.backendPrompt,
                            routing: project.routing,
                            generation: updated.generation,
                        });
                    }

                    return res.json({
                        success: true,
                        project: await signVideoProjectAssets({
                            _id: project._id,
                            status: updated.status,
                            generation: updated.generation,
                            ...(criticState ? { critique: criticState.critique } : {}),
                            pipeline: getPipelineInfo(updated.status),
                        }),
                    });
                }
            }

            return res.json({
                success: true,
                project: await signVideoProjectAssets({
                    _id: project._id,
                    status: updated.status,
                    generation: updated.generation,
                    pipeline: getPipelineInfo(updated.status),
                }),
            });
        }

        // Not in generating state — return full project
        // Normalize generation.status for completed projects so frontend polling detects completion
        const gen = { ...(project.generation || {}) };
        if ((project.status === 'completed' || project.status === 'done' || project.status === 'critique') 
            && (gen.videoUrl || project.finalVideoUrl) 
            && gen.status !== 'COMPLETED') {
            gen.status = 'COMPLETED';
            gen.progress = 100;
            // Ensure videoUrl is populated from finalVideoUrl if missing
            if (!gen.videoUrl && project.finalVideoUrl) gen.videoUrl = project.finalVideoUrl;
        }
        res.json({
            success: true,
            project: await signVideoProjectAssets({
                _id: project._id,
                status: project.status,
                generation: gen,
                critique: project.critique,
                pipeline: getPipelineInfo(project.status),
            }),
        });
    } catch (error) {
        console.error('Video Studio status error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/video-studio/:id/edit — Edit prompt and re-generate
// ══════════════════════════════════════════════════════════════════════════════
router.post('/:id/edit', protect, requireCredits('videoEdit'), async (req, res) => {
    try {
        const { editedPrompt } = req.body;
        const project = await VideoProject.findOne({ _id: req.params.id, user: req.user._id });
        if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

        // Track edit
        const editHistory = [...(project.editHistory || [])];
        editHistory.push({
            field: 'backendPrompt',
            before: project.backendPrompt,
            after: editedPrompt,
            timestamp: new Date(),
        });

        await VideoProject.findByIdAndUpdate(project._id, {
            backendPrompt: editedPrompt,
            editHistory,
            status: 'routing', // Reset to routing for re-generation
        });

        // Re-run generate ASYNCHRONOUSLY
        const updatedProject = await VideoProject.findById(project._id).lean();
        runStep(project._id, 'generating', videoGeneratorNode, {
            userId: req.user._id.toString(),
            brandId: project.brand?.toString(),
            concepts: updatedProject.concepts,
            selectedConceptIndex: updatedProject.selectedConceptIndex,
            script: updatedProject.script,
            backendPrompt: editedPrompt,
            routing: updatedProject.routing,
            inputImages: updatedProject.input?.images || [],
            references: updatedProject.references,
        }).catch(e => console.error('Background runStep edit failed:', e));

        res.json({
            success: true,
            project: {
                _id: project._id,
                status: 'generating',
                generation: { progress: 5, startedAt: new Date() },
                pipeline: getPipelineInfo('generating'),
            },
        });
    } catch (error) {
        console.error('Video Studio edit error:', error);
        if (req.creditsDeducted > 0) {
            await refundCredits(req.user._id, req.creditsDeducted, 'videoEditRefund', `Refund: Video Edit Sync Failure (${safeErrorMessage(error)})`, 'video', { projectId: req.params.id });
        }
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/video-studio/:id/finalize — Accept final → save learnings
// ══════════════════════════════════════════════════════════════════════════════
router.post('/:id/finalize', protect, async (req, res) => {
    try {
        const project = await VideoProject.findOne({ _id: req.params.id, user: req.user._id });
        if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

        // Run editor suggestions
        const editorState = await runStep(project._id, 'editing', editorNode, {
            userId: req.user._id.toString(),
            brandId: project.brand?.toString(),
            concepts: project.concepts,
            selectedConceptIndex: project.selectedConceptIndex,
            script: project.script,
            backendPrompt: project.backendPrompt,
            routing: project.routing,
            generation: project.generation,
            critique: project.critique,
        });

        // Mark as done — prefer permanent S3 URL for finalVideoUrl so it doesn't expire
        await VideoProject.findByIdAndUpdate(project._id, {
            status: 'done',
            finalVideoUrl: project.generation?.s3VideoUrl || project.generation?.videoUrl || '',
        });

        // Save learnings for self-improvement (fire-and-forget)
        saveLearnings(project._id).catch(err => console.warn('Self-learning save failed:', err.message));

        // Update user's usage stats
        await req.user.updateOne({ $inc: { 'usage.videosGenerated': 1 } });

        const finalProject = await VideoProject.findById(project._id).lean();

        res.json({
            success: true,
            project: {
                ...finalProject,
                editorSuggestions: editorState.editorSuggestions,
                pipeline: getPipelineInfo('done'),
            },
        });
    } catch (error) {
        console.error('Video Studio finalize error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/video-studio — List user's video projects
// ══════════════════════════════════════════════════════════════════════════════
router.get('/', protect, async (req, res) => {
    try {
        const { brandId, status, mode, limit = 50, page = 1 } = req.query;
        const filter = {};

        if (req.user.role === 'superadmin') {
            if (brandId) filter.brand = brandId;
        } else {
            if (brandId) {
                const brand = await Brand.findOne({
                    _id: brandId,
                    $or: [{ user: req.user._id }, { sharedWith: req.user._id }]
                });
                if (!brand) {
                    return res.status(403).json({ success: false, error: 'Unauthorized access to this brand' });
                }
                // Strictly show only videos belonging to this brand
                filter.brand = brandId;
                filter.user = req.user._id;
            } else {
                filter.user = req.user._id;
            }
        }

        if (status) filter.status = status;
        if (mode) filter.mode = mode;

        const skip = (Number(page) - 1) * Number(limit);
        const selectFields = 'title status mode studioMode input.videoType input.brief input.images advancedConfig routing.selectedModel routing.costPreview generation finalVideoUrl createdAt updatedAt';

        // Build the query — use hint to force the compound index so MongoDB avoids an in-memory sort.
        // Also set allowDiskUse via setOptions (the chained .allowDiskUse() is unreliable on some driver versions).
        const query = VideoProject.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(Number(limit))
            .select(selectFields)
            .populate('brand', 'name dna.logo.url')
            .setOptions({ allowDiskUse: true })
            .lean();

        // Hint the correct compound index based on the filter shape
        if (filter.user && filter.brand) {
            query.hint({ user: 1, brand: 1, createdAt: -1 });
        } else if (filter.user) {
            query.hint({ user: 1, createdAt: -1 });
        }
        // superadmin without user filter: no hint (let MongoDB pick, but allowDiskUse will save it)

        const [projects, total] = await Promise.all([
            query.exec(),
            VideoProject.countDocuments(filter),
        ]);

        // ── STEP 0: Auto-expire truly stale generating projects ──
        // Wrapped in try-catch so it never crashes the main response
        try {
            const STALE_NO_ID_MS = 30 * 60 * 1000;       // 30 minutes
            const STALE_WITH_ID_MS = 2 * 60 * 60 * 1000;  // 2 hours
            const now = Date.now();
            let expiredCount = 0;

            for (const p of projects) {
                if (p.status !== 'generating' && p.status !== 'advanced-generating') continue;
                const age = now - new Date(p.updatedAt || p.createdAt).getTime();
                const hasRequestId = !!(p.generation?.falRequestId || p.generation?.taskId || p.generation?.requestId);

                if ((!hasRequestId && age > STALE_NO_ID_MS) || age > STALE_WITH_ID_MS) {
                    p.status = 'failed';
                    p.generation = {
                        ...(p.generation || {}),
                        status: 'FAILED',
                        error: 'Generation timed out — auto-expired',
                    };
                    VideoProject.findByIdAndUpdate(p._id, {
                        status: 'failed',
                        'generation.status': 'FAILED',
                        'generation.error': 'Generation timed out — auto-expired',
                    }).exec().catch(err => console.warn(`⚠️ Failed to expire project ${p._id}:`, err.message));
                    expiredCount++;
                }
            }
            if (expiredCount > 0) {
                console.log(`🧹 Auto-expired ${expiredCount} stale generating project(s)`);
            }
        } catch (autoExpireErr) {
            console.warn('⚠️ Auto-expire phase failed (non-fatal):', autoExpireErr.message);
        }

        // ── Auto-sync stuck generating projects (NON-BLOCKING) ──
        // Wrapped in try-catch so it never crashes the main response
        try {
            const stuckProjects = projects.filter(p =>
                (p.status === 'generating' || p.status === 'advanced-generating') && (p.generation?.falRequestId || p.generation?.taskId || p.generation?.requestId)
            );

            if (stuckProjects.length > 0) {
                console.log(`🔄 Auto-syncing ${stuckProjects.length} stuck generating project(s) in background...`);
                Promise.allSettled(stuckProjects.map(async (p) => {
                    try {
                        const model = p.routing?.selectedModel || '';
                        let provider = p.generation?.provider || '';
                        if (!provider) {
                            if (model === 'veo-3.1-fast') provider = 'kie';
                            else if (model === 'seedance-2.0') provider = 'atlascloud';
                            else if (model === 'grok-imagine') provider = 'grok';
                            else if (model === 'sora-2') provider = 'laozhang';
                            else if (model.startsWith('heygen')) provider = 'heygen';
                            else provider = 'fal';
                        }

                        if (provider === 'heygen') {
                            const hStatus = await getHeyGenVideoStatus(p.generation.falRequestId);
                            if (hStatus.status === 'COMPLETED') {
                                await VideoProject.findByIdAndUpdate(p._id, {
                                    status: 'completed',
                                    'generation.videoUrl': hStatus.videoUrl,
                                    'generation.thumbnailUrl': hStatus.thumbnailUrl || '',
                                    'generation.progress': 100,
                                    'generation.completedAt': new Date(),
                                    finalVideoUrl: hStatus.videoUrl,
                                });
                                if (hStatus.videoUrl) {
                                    downloadAndUploadVideoToS3(p._id.toString(), hStatus.videoUrl)
                                        .then(s3Url => { if (s3Url) console.log(`✅ [HeyGen-S3] Archived ${p._id}: ${s3Url.substring(0, 80)}`); })
                                        .catch(() => {});
                                }
                                console.log(`✅ HeyGen synced ${p._id}: completed`);
                            } else if (hStatus.status === 'FAILED') {
                                await VideoProject.findByIdAndUpdate(p._id, { status: 'failed', 'generation.error': hStatus.error });
                                if (p.creditsUsed > 0) {
                                    await refundCredits(p.user, p.creditsUsed, 'videoGenerateRefund', `Refund: Stuck HeyGen Video Generation Failed`, 'video', { projectId: p._id });
                                    await VideoProject.findByIdAndUpdate(p._id, { creditsUsed: 0 });
                                }
                            }
                            return;
                        }

                        console.log(`🔍 Syncing ${p._id}: model=${model}, provider=${provider}, reqId=${p.generation?.falRequestId?.substring(0, 20)}...`);

                        const state = {
                            generation: { ...p.generation, provider },
                            routing: { selectedModel: model },
                            mode: p.mode,
                            status: p.status,
                        };
                        const updated = await pollGenerationStatus(state);

                        if (updated.generation?.status === 'COMPLETED' || updated.generation?.status === 'FAILED') {
                            const newStatus = updated.generation.status === 'COMPLETED' ? (p.mode === 'image-to-video' ? 'completed' : 'critique') : 'failed';
                            await VideoProject.findByIdAndUpdate(p._id, {
                                status: newStatus,
                                'generation.videoUrl': updated.generation.videoUrl || '',
                                'generation.status': updated.generation.status,
                                'generation.progress': updated.generation.progress || 100,
                                'generation.provider': provider,
                            });
                            // 🛡️ CRITICAL: Archive completed video to S3 before provider CDN expires (1-7 days)
                            if (updated.generation.status === 'COMPLETED' && updated.generation.videoUrl && !updated.generation.videoUrl.includes('amazonaws.com')) {
                                downloadAndUploadVideoToS3(p._id.toString(), updated.generation.videoUrl)
                                    .then(s3Url => { if (s3Url) console.log(`✅ [AutoSync-S3] Archived ${p._id}: ${s3Url.substring(0, 80)}`); })
                                    .catch(e => console.warn(`⚠️ [AutoSync-S3] Archive failed for ${p._id}:`, e.message));
                            }
                            console.log(`✅ Synced project ${p._id}: ${newStatus} — videoUrl: ${updated.generation.videoUrl ? 'YES' : 'no'}`);
                        } else {
                            console.log(`⏳ Project ${p._id} still ${updated.generation?.status || 'unknown'}`);
                        }
                    } catch (e) {
                        console.warn(`⚠️ Failed to sync project ${p._id}:`, e.message);
                    }
                })).catch(() => {});
            }
        } catch (autoSyncErr) {
            console.warn('⚠️ Auto-sync phase failed (non-fatal):', autoSyncErr.message);
        }

        // ── Sign S3 video URLs before returning ──
        // S3 bucket uses "Bucket owner enforced" (ACLs disabled), so raw S3 path-style
        // URLs are inaccessible. We must presign them. CDN URLs pass through unchanged.
        // This is critical because downloadAndUploadVideoToS3 overwrites finalVideoUrl
        // with an S3 URL, and the original CDN URL expires after 12-24 hours.
        try {
            await Promise.all(projects.map(async (p) => {
                // Sign finalVideoUrl
                if (p.finalVideoUrl && p.finalVideoUrl.includes('amazonaws.com')) {
                    p.finalVideoUrl = await getSignedUrlIfNeeded(p.finalVideoUrl);
                }
                // Sign generation.videoUrl (may also be S3 after sync)
                if (p.generation?.videoUrl && p.generation.videoUrl.includes('amazonaws.com')) {
                    p.generation.videoUrl = await getSignedUrlIfNeeded(p.generation.videoUrl);
                }
                // Sign generation.s3VideoUrl
                if (p.generation?.s3VideoUrl && p.generation.s3VideoUrl.includes('amazonaws.com')) {
                    p.generation.s3VideoUrl = await getSignedUrlIfNeeded(p.generation.s3VideoUrl);
                }
                // Sign generation.s3ThumbnailUrl
                if (p.generation?.s3ThumbnailUrl && p.generation.s3ThumbnailUrl.includes('amazonaws.com')) {
                    p.generation.s3ThumbnailUrl = await getSignedUrlIfNeeded(p.generation.s3ThumbnailUrl);
                }
            }));
        } catch (signErr) {
            console.warn('⚠️ URL signing phase failed (non-fatal):', signErr.message);
        }

        res.json({ success: true, projects, total });
    } catch (error) {
        console.error('❌ GET /api/video-studio failed:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/video-studio/:id — Get full project details
// ══════════════════════════════════════════════════════════════════════════════
router.get('/:id', protect, async (req, res) => {
    try {
        const project = await VideoProject.findOne({ _id: req.params.id, user: req.user._id })
            .populate('brand', 'name dna.logo.url dna.colors dna.voice')
            .lean();
        if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

        res.json({
            success: true,
            project: await signVideoProjectAssets({
                ...project,
                pipeline: getPipelineInfo(project.status),
            }),
        });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/video-studio/models — List supported video models
// ══════════════════════════════════════════════════════════════════════════════
router.get('/models/info', protect, (req, res) => {
    res.json({ success: true, models: getModelsInfo() });
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/video-studio/models/capabilities — Full model capability matrix
// ══════════════════════════════════════════════════════════════════════════════
router.get('/models/capabilities', protect, async (req, res) => {
    try {
        const capabilities = JSON.parse(JSON.stringify(MODEL_CAPABILITIES));
        for (const modelId of Object.keys(capabilities)) {
            try {
                const badge = await getProviderBadge('video', modelId);
                capabilities[modelId].activeProvider = badge ? badge.label : null;
            } catch (e) {
                capabilities[modelId].activeProvider = null;
            }
        }
        res.json({ success: true, capabilities });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/video-studio/upload-image — Upload base64 image → hosted URL
// ══════════════════════════════════════════════════════════════════════════════
router.post('/upload-image', protect, async (req, res) => {
    try {
        const { imageData } = req.body; // base64 data URI
        if (!imageData) return res.status(400).json({ success: false, error: 'imageData is required' });

        if (!imageData.startsWith('data:')) {
            // Already a URL
            return res.json({ success: true, url: imageData });
        }

        // Extract base64 and mime type
        const match = imageData.match(/^data:(image\/\w+);base64,(.+)$/);
        if (!match) return res.status(400).json({ success: false, error: 'Invalid base64 image data' });

        const mimeType = match[1];
        const base64 = match[2];

        // ── Upload to S3 (Primary) ───────────────────────────────────────────
        let hostedUrl = null;
        try {
            const filename = `video-studio-${Date.now()}.${mimeType.includes('png') ? 'png' : 'jpg'}`;
            hostedUrl = await uploadToS3(imageData, `video-studio/uploads/${filename}`, mimeType);
            console.log(`📤 Image uploaded to S3: ${hostedUrl.substring(0, 80)}...`);
        } catch (s3Error) {
            console.warn('⚠️ S3 upload failed, trying FAL fallback:', s3Error.message);
        }

        // ── Fallback: Upload to fal storage ──────────────────────────────────
        if (!hostedUrl) {
            const falKey = process.env.FAL_API_KEY || process.env.FAL_KEY;
            if (falKey) {
                const buffer = Buffer.from(base64, 'base64');
                const ext = mimeType.includes('png') ? 'png' : 'jpg';
                const filename = `ref-image-${Date.now()}.${ext}`;

                // Try FAL initiate upload (legacy method, currently returning 404 in some envs)
                try {
                    const initResp = await fetch('https://fal.ai/api/storage/upload/initiate', {
                        method: 'POST',
                        headers: { 'Authorization': `Key ${falKey}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ file_name: filename, content_type: mimeType }),
                    });
                    if (initResp.ok) {
                        const data = await initResp.json();
                        if (data.upload_url) {
                            const putResp = await fetch(data.upload_url, {
                                method: 'PUT', headers: { 'Content-Type': mimeType }, body: buffer,
                            });
                            if (putResp.ok && data.file_url) hostedUrl = data.file_url;
                        }
                    }
                } catch (e) { console.warn('fal upload error:', e.message); }

                // Fallback: base64 upload via REST
                if (!hostedUrl) {
                    try {
                        const resp = await fetch('https://rest.alpha.fal.ai/storage/upload/base64', {
                            method: 'POST',
                            headers: { 'Authorization': `Key ${falKey}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ data: base64, content_type: mimeType, file_name: filename }),
                        });
                        if (resp.ok) {
                            const data = await resp.json();
                            hostedUrl = data.url || data.file_url;
                        }
                    } catch (e) { console.warn('fal base64 upload error:', e.message); }
                }
            }
        }

        if (hostedUrl) {
            res.json({ success: true, url: hostedUrl });
        } else {
            res.status(500).json({ success: false, error: 'Failed to upload image to any storage provider' });
        }

    } catch (err) {
        console.error('Upload image error:', err);
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/video-studio/generate-first-frame — AI-generate a first frame image
// ══════════════════════════════════════════════════════════════════════════════
router.post('/generate-first-frame', protect, async (req, res) => {
    try {
        const { prompt, brandId } = req.body;
        if (!prompt || !prompt.trim()) {
            return res.status(400).json({ success: false, error: 'Prompt is required' });
        }

        // Build brand-aware image prompt
        let imgPrompt = `Create a high-quality, cinematic first frame for an ad film: ${prompt.trim()}. Photorealistic, professional studio quality, suitable as the opening shot of a premium advertisement.`;
        if (brandId) {
            try {
                const brand = await Brand.findById(brandId).lean();
                if (brand) {
                    if (brand.dna?.colorPalette?.length) imgPrompt += ` Use brand colors: ${brand.dna.colorPalette.join(', ')}.`;
                    if (brand.dna?.visualStyle) imgPrompt += ` Visual style: ${brand.dna.visualStyle}.`;
                }
            } catch (e) { console.warn('Brand load failed:', e.message); }
        }

        console.log('🖼️ Generating first frame from prompt:', imgPrompt.substring(0, 100) + '...');

        const { geminiImageGenerate } = await import('../agents/videoStudio/firstFrame.js');
        const result = await geminiImageGenerate(imgPrompt);

        if (result?.imageUrl) {
            res.json({ success: true, imageUrl: result.imageUrl });
        } else {
            res.status(500).json({ success: false, error: 'Failed to generate first frame image' });
        }
    } catch (err) {
        console.error('❌ Generate first frame error:', err.message);
        res.status(500).json({ 
            success: false, 
            error: err.message.includes('Gemini image generation failed') 
                ? 'Gemini image generation failed — no image returned from any model' 
                : safeErrorMessage(err) 
        });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/video-studio/enhance-prompt — MCoT 2-Stage Prompt Enhancement
// Stage 1: Visual Grounding (MCoT) — if images attached, analyse them first
// Stage 2: Model-native, format-aware prompt generation via callAgent
// ══════════════════════════════════════════════════════════════════════════════
router.post('/enhance-prompt', protect, requireCredits('promptEnhance'), async (req, res) => {
    try {
        const {
            prompt, model, duration, aspectRatio, brandId,
            filmFormat = 'shortvideo',           // 'adfilm' | 'shortvideo'
            firstImageUrl = '',
            lastImageUrl = '',
            referenceImageUrls = [],
        } = req.body;

        if (!prompt?.trim()) {
            return res.status(400).json({ success: false, error: 'Prompt is required' });
        }

        const startMs = Date.now();
        console.log(`🎬 Enhance Prompt — model: ${model}, format: ${filmFormat}, images: ${[firstImageUrl, lastImageUrl, ...referenceImageUrls].filter(Boolean).length}`);

        // ── Load brand context (Redis-cached) and run Stage 1 MCoT in parallel ──
        const allImageUrls = [firstImageUrl, lastImageUrl, ...(Array.isArray(referenceImageUrls) ? referenceImageUrls : [])]
            .filter(url => url && typeof url === 'string' && (url.startsWith('http') || url.startsWith('data:')));

        const [{ brandContext }, visualDNA] = await Promise.all([
            loadBrandContext(brandId),
            // Stage 1: Visual Grounding — only fires if images are attached
            allImageUrls.length > 0
                ? callMultimodalAgent(
                    VISUAL_GROUNDING_SYSTEM,
                    `Analyse these images for this video brief: "${prompt.trim()}". Extract visual DNA for video prompt engineering.`,
                    allImageUrls,
                    { temperature: 0.2, maxTokens: 1024 }
                  )
                : Promise.resolve(null),
        ]);

        if (visualDNA && !visualDNA.error) {
            console.log(`🧠 MCoT Visual Grounding complete — mood: ${visualDNA.brandMood}, colors: ${JSON.stringify(visualDNA.heroColors)}, confidence: ${visualDNA.confidence}`);
        } else if (allImageUrls.length > 0) {
            console.warn('⚠️ MCoT Visual Grounding failed or returned error — proceeding without visual DNA');
        }

        // ── Stage 2: Model-native, format-aware enhancement ──
        const systemPrompt = buildEnhanceSystemPrompt(
            model || 'seedance-2.0',
            filmFormat,
            Number(duration) || 5,
            aspectRatio || '16:9',
            brandContext
        );
        const userPrompt = buildEnhanceUserPrompt(prompt.trim(), visualDNA, filmFormat);

        const result = await callAgent(systemPrompt, userPrompt, 0.72, 3000, { timeoutMs: 45000 });

        const elapsed = Date.now() - startMs;
        console.log(`✅ Enhance Prompt complete in ${elapsed}ms — images grounded: ${allImageUrls.length > 0}, adFilmPlan: ${!!result?.adFilmPlan}`);

        if (!result?.enhancedPrompt) {
            // Graceful fallback: return raw result if JSON parsing failed
            const rawText = typeof result?.raw === 'string' ? result.raw : '';
            // Strip any JSON wrapper from raw text
            const cleanRaw = rawText.replace(/^[\s\S]*?"enhancedPrompt"\s*:\s*"/, '').replace(/"\s*,?\s*"changes"[\s\S]*$/, '').replace(/\\n/g, '\n').replace(/\\"/g, '"') || prompt.trim();
            return res.json({
                success: true,
                enhancedPrompt: cleanRaw,
                adFilmPlan: null,
                changes: ['Enhancement produced raw output — prompt updated'],
                mcotUsed: allImageUrls.length > 0,
            });
        }

        res.json({
            success: true,
            enhancedPrompt: result.enhancedPrompt,
            adFilmPlan: result.adFilmPlan || null,
            changes: result.changes || [],
            mcotUsed: allImageUrls.length > 0 && !visualDNA?.error,
        });

    } catch (error) {
        console.error('Enhance prompt error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// DELETE /api/video-studio/:id — Delete a video project
// ══════════════════════════════════════════════════════════════════════════════
router.delete('/:id', protect, async (req, res) => {
    try {
        const project = await VideoProject.findOneAndDelete({ _id: req.params.id, user: req.user._id });
        if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
        res.json({ success: true, message: 'Project deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// VIDEO CACHING — Download ephemeral CDN videos → Upload to S3
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Downloads a video from a provider CDN URL and uploads it to S3.
 * Called after video generation completes — ensures the video persists
 * beyond the provider's 1-7 day retention window.
 *
 * RETRY: 3 attempts with exponential backoff (5s, 10s, 15s).
 * Also archives thumbnails and first-frame images when available.
 *
 * S3 key: videos/{userId}/{projectId}.mp4
 * Updates the project in DB with the permanent S3 URL + s3ArchivedAt timestamp.
 * Returns the S3 URL if successful, null otherwise.
 */
export async function downloadAndUploadVideoToS3(projectId, videoUrl) {
    if (!videoUrl || !videoUrl.startsWith('http')) return null;
    // Skip if already an S3 URL
    if (videoUrl.includes('amazonaws.com')) return videoUrl;

    const MAX_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            console.log(`📥 [Attempt ${attempt}/${MAX_RETRIES}] Downloading video for S3 upload: ${videoUrl.substring(0, 80)}...`);
            const resp = await fetch(videoUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                redirect: 'follow',
                signal: AbortSignal.timeout(120000), // 2-minute timeout for large videos
            });
            if (!resp.ok) {
                console.warn(`⚠️ Video download failed (${resp.status}): ${videoUrl.substring(0, 80)}`);
                if (resp.status === 403 || resp.status === 404 || resp.status === 410) {
                    // CDN URL expired — no point retrying
                    console.error(`❌ Video CDN URL expired (${resp.status}) for project ${projectId}. Cannot archive.`);
                    
                    // Mark as expired in DB so the sweep stops trying infinitely
                    await VideoProject.findByIdAndUpdate(projectId, {
                        'generation.s3VideoUrl': 'EXPIRED',
                        'generation.s3ArchivedAt': new Date()
                    }).catch(() => {});
                    
                    return null;
                }
                throw new Error(`Download HTTP ${resp.status}`);
            }
            const arrayBuf = await resp.arrayBuffer();
            const buffer = Buffer.from(arrayBuf);
            if (buffer.length < 1000) {
                console.warn(`⚠️ Video download too small (${buffer.length} bytes), likely expired`);
                return null;
            }

            // Load the project to get user context for S3 path
            const project = await VideoProject.findById(projectId)
                .select('user generation.thumbnailUrl firstFrameUrl')
                .lean();
            const userId = project?.user?.toString() || 'unknown';

            // S3 key: videos/{userId}/{projectId}.mp4
            const s3Key = `videos/${userId}/${projectId}.mp4`;
            console.log(`☁️ Uploading video to S3: ${s3Key} (${Math.round(buffer.length / 1024)}KB)...`);
            const s3Url = await uploadToS3(buffer, s3Key, 'video/mp4');
            console.log(`✅ Video uploaded to S3: ${s3Url}`);

            // Save permanent S3 URL + archival timestamp
            // DO NOT overwrite generation.videoUrl (keep original CDN URL as backup)
            const dbUpdate = {
                'generation.s3VideoUrl': s3Url,
                'generation.s3ArchivedAt': new Date(),
                finalVideoUrl: s3Url,
            };

            // 🖼️ Archive thumbnail to S3 (fire-and-forget, non-blocking)
            const thumbUrl = project?.generation?.thumbnailUrl;
            if (thumbUrl && thumbUrl.startsWith('http') && !thumbUrl.includes('amazonaws.com')) {
                mirrorUrlToS3(thumbUrl, `videos/${userId}/${projectId}-thumb.jpg`, 'image/jpeg')
                    .then(s3Thumb => {
                        if (s3Thumb) {
                            VideoProject.findByIdAndUpdate(projectId, { 'generation.s3ThumbnailUrl': s3Thumb }).exec();
                            console.log(`  🖼️ Thumbnail archived: ${s3Thumb.substring(0, 60)}`);
                        }
                    })
                    .catch(() => {});
            }

            // 🖼️ Archive first-frame image to S3 (fire-and-forget, non-blocking)
            const firstFrameUrl = project?.firstFrameUrl;
            if (firstFrameUrl && firstFrameUrl.startsWith('http') && !firstFrameUrl.includes('amazonaws.com')) {
                mirrorUrlToS3(firstFrameUrl, `videos/${userId}/${projectId}-firstframe.jpg`, 'image/jpeg')
                    .then(s3FF => {
                        if (s3FF) {
                            VideoProject.findByIdAndUpdate(projectId, { firstFrameUrl: s3FF }).exec();
                            console.log(`  🖼️ First-frame archived: ${s3FF.substring(0, 60)}`);
                        }
                    })
                    .catch(() => {});
            }

            await VideoProject.findByIdAndUpdate(projectId, dbUpdate);

            return s3Url;
        } catch (e) {
            console.warn(`⚠️ Video S3 upload attempt ${attempt}/${MAX_RETRIES} failed:`, e.message);
            if (attempt < MAX_RETRIES) {
                const delay = attempt * 5000; // 5s, 10s, 15s exponential backoff
                console.log(`🔄 Retrying S3 upload in ${delay / 1000}s...`);
                await new Promise(r => setTimeout(r, delay));
            } else {
                console.error(`❌ S3 upload exhausted ${MAX_RETRIES} retries for project ${projectId}`);
                // S3 failed — keep the original provider video URL (CDN)
                console.log(`📎 Keeping original video URL: ${videoUrl.substring(0, 80)}...`);
                return null;
            }
        }
    }
    return null;
}

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/video-studio/:id/video — Serve video (S3 → CDN fallback)
// No auth required — <video> tags can't send Authorization headers
// ══════════════════════════════════════════════════════════════════════════════
router.get('/:id/video', async (req, res) => {
    try {
        const project = await VideoProject.findById(req.params.id)
            .select('generation.videoUrl generation.s3VideoUrl finalVideoUrl')
            .lean();
        const hasCdnUrl = !!project?.generation?.videoUrl;
        const hasS3Url = !!project?.generation?.s3VideoUrl;
        const hasFinalUrl = !!project?.finalVideoUrl;

        if (!hasCdnUrl && !hasS3Url && !hasFinalUrl) {
            return res.status(404).send('Video not found');
        }

        // Check if explicitly marked as EXPIRED to avoid infinite retry loops
        if (project.generation?.s3VideoUrl === 'EXPIRED') {
            console.warn(`⚠️ [Proxy] Video explicitly marked as expired for project ${req.params.id}`);
            return res.status(410).send('Video expired from provider CDN');
        }

        // ✅ FIX: Prefer permanent S3 URL (finalVideoUrl or s3VideoUrl) over expiring CDN URL.
        // S3 URLs don't expire (they're stored as public-path URLs, not presigned).
        // Fall back to CDN URL only when no S3 copy exists yet.
        const finalUrl = project.finalVideoUrl || project.generation?.s3VideoUrl;
        if (finalUrl && finalUrl !== 'EXPIRED' && finalUrl.includes('amazonaws.com')) {
            // It's an S3 URL — generate a fresh presigned URL (7-day TTL)
            const { getSignedUrlIfNeeded } = await import('../utils/s3.js');
            const signed = await getSignedUrlIfNeeded(finalUrl).catch(() => finalUrl);
            return res.redirect(302, signed);
        }

        // CDN URL fallback — but verify it's still alive before redirecting
        const cdnUrl = project.generation?.videoUrl || project.finalVideoUrl;
        if (cdnUrl) {
            // Known long-lived CDNs (fal.media, muapi.ai, fal.run) → redirect directly
            const isLongLivedCdn = cdnUrl.includes('fal.media') || cdnUrl.includes('muapi.ai') || cdnUrl.includes('fal.run');
            if (isLongLivedCdn) {
                // Trigger async S3 mirror so next load is permanent
                downloadAndUploadVideoToS3(req.params.id, cdnUrl).catch(e => console.warn('⚠️ Async S3 mirror failed:', e.message));
                return res.redirect(302, cdnUrl);
            }

            // For other CDNs (r2cdn, copilotbase, etc.) — check if still alive before redirecting
            try {
                const check = await fetch(cdnUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
                if (check.ok) {
                    // URL is alive — mirror to S3 async, serve directly for now
                    downloadAndUploadVideoToS3(req.params.id, cdnUrl).catch(e => console.warn('⚠️ Async S3 mirror failed:', e.message));
                    return res.redirect(302, cdnUrl);
                }
                // URL is dead (404/403) — fall through to try re-download
                console.warn(`⚠️ [Proxy] CDN URL is dead (${check.status}) for project ${req.params.id}: ${cdnUrl.substring(0, 80)}`);
            } catch (headErr) {
                console.warn(`⚠️ [Proxy] CDN HEAD check failed: ${headErr.message}`);
            }
        }

        // No usable URL — try to trigger S3 upload from the provider URL
        const videoUrl = project.generation.videoUrl;
        if (!videoUrl) return res.status(404).send('Video URL not available');

        const s3Url = await downloadAndUploadVideoToS3(req.params.id, videoUrl);
        if (s3Url) {
            return res.redirect(302, s3Url);
        }

        // --- FALLBACK TO DIRECT URL ---
        console.warn(`⚠️ [Proxy] S3 backup failed for ${req.params.id}. Redirecting to direct model URL instead.`);
        return res.redirect(302, videoUrl);

    } catch (error) {
        console.error('Video serve error:', error);
        
        // Attempt ultimate fallback if we crashed midway but have the URL
        if (req.params.id) {
             const proj = await VideoProject.findById(req.params.id).select('generation.videoUrl');
             if (proj?.generation?.videoUrl) {
                 return res.redirect(302, proj.generation.videoUrl);
             }
        }
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


export default router;

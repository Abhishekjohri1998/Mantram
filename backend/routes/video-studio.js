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
import Cast from '../models/Cast.js';
import { protect } from '../middleware/auth.js';
import { requireCredits, refundCredits } from '../middleware/credits.js';
import { aiGenerationLimiter } from '../middleware/rateLimiter.js';
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
import { estimateCost, getModelsInfo, MODEL_CAPABILITIES, submitVideoGeneration, getUnifiedGenerationStatus } from '../agents/videoStudio/falClient.js';
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
import { submitAtlasCloudVideoGeneration, getAtlasCloudGenerationStatus as pollAtlasCloudStatus, submitInfiniteTalkVideoGeneration, submitGeminiFlashVideoGeneration } from '../agents/videoStudio/atlasClient.js';
import { geminiImageGenerate } from '../agents/videoStudio/firstFrame.js';
import { falGenerateImage } from '../agents/youtubeStudio/nodes.js';
import { Q_ADS_CATEGORIES, getCategory, buildQAdPrompt, getQAdsCreditCost } from '../agents/videoStudio/qAdsCategories.js';
import { getPresets } from '../utils/qAdsCache.js';
import { runQAdsAgent } from '../agents/videoStudio/qAdsAgent.js';
import { isFashionCategory, resolveImageRole } from '../agents/videoStudio/promptSanitizer.js';
import { buildVideoHash } from '../utils/videoHash.js';
import { checkPromptSafety } from '../utils/promptSafety.js';
import redis from '../utils/redisClient.js';
import { startLongFormGeneration, getLongFormJobStatus, cancelLongFormJob, estimateLongFormCost } from '../agents/videoStudio/longFormGenerator.js';
import { runStoryboardDirector, recreateVideoPrompt } from '../agents/videoStudio/storyboardDirector.js';
import { generateStoryboardPoster } from '../agents/videoStudio/storyboardFrames.js';
import { startStoryboardLongForm, getStoryboardLongFormJobStatus, cancelStoryboardLongFormJob, estimateStoryboardLongFormCredits, stitchSegments } from '../agents/videoStudio/storyboardLongForm.js';
import { stitchVideoClips } from '../utils/videoStitcher.js';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
const execFileAsync = promisify(execFile);

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
 * Helper to recursively sign raw URL or image objects with mixed structures
 */
async function signUrlOrObject(img) {
    if (!img) return img;
    if (typeof img === 'string') {
        return getSignedUrlIfNeeded(img);
    }
    if (typeof img === 'object') {
        if (img.url) {
            const signedUrl = await getSignedUrlIfNeeded(img.url);
            return { ...img, url: signedUrl };
        }
        if (img.imageUrl) {
            const signedUrl = await getSignedUrlIfNeeded(img.imageUrl);
            return { ...img, imageUrl: signedUrl };
        }
    }
    return img;
}

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
        project.input.images = await Promise.all(project.input.images.map(img => signUrlOrObject(img)));
    }
    // ✅ CRITICAL FIX: Sign the avatarUrl if present so the frontend can load/render it on project reuse
    if (project.input?.avatarUrl) {
        project.input.avatarUrl = await getSignedUrlIfNeeded(project.input.avatarUrl);
    }
    if (project.images) { // in-memory response override
        project.images = await Promise.all(project.images.map(img => signUrlOrObject(img)));
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

    // Sign storyboard
    if (project.storyboard) {
        if (project.storyboard.imageUrl) project.storyboard.imageUrl = await getSignedUrlIfNeeded(project.storyboard.imageUrl);
        if (project.storyboard.finalVideoUrl) project.storyboard.finalVideoUrl = await getSignedUrlIfNeeded(project.storyboard.finalVideoUrl);
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

        if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
            return res.status(400).json({ success: false, error: 'Valid Project ID is required' });
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
router.post('/advanced/generate', protect, requireCredits('videoGenerate'), aiGenerationLimiter, async (req, res) => {
    try {
        const {
            prompt, model, duration, resolution, aspectRatio,
            firstImageUrl, lastImageUrl, referenceImages,
            generateAudio, qualityMode, brandId, shots,
            refAudio, refVideo, idempotencyKey, language
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
                    await redis.setex(promptCacheKey, 86400, finalPrompt);
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
            generation: {
                language: language || 'English',
            },
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
            const genData = { ...state.generation, language: language || 'English' };
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

        const systemPrompt = `You are a world-class film director, screenwriter, and cinematographer with expertise in:
- High-fidelity visual storytelling, creative screenplays, and narrative arcs.
- Brand alignment and visual thematic aesthetics across various industries (e.g. luxury, tech, beauty, wellness, sports).
- Audio-visual synchronization (matching visuals to spoken word/dialogue pacing).
- Character and subject consistency across multiple consecutive shots.
- Advanced cinematic camera work (framing, movement), artistic lighting design, and professional color grading.
- Seamless scene transitions and spatial continuity.

Your job: Given a creative brief (and optionally an audio transcript), analyze the brand category and produce a highly creative, emotional, and visually compelling shot-by-shot storyboard as JSON.

CRITICAL RULES FOR NARRATIVE & VISUAL EXCELLENCE:
1. BRAND CATEGORY TAILORING:
   - Identify the brand's industry/vertical (e.g. luxury fashion, athletic performance, corporate tech, wellness, organic beauty) and tailor the tone, pacing, camerawork, color palette, and narrative structure to match this category's visual language and aspirations.
   - Avoid flat, literal translations of the brief. Craft an emotional/thematic storyline that builds a strong narrative connection with the audience.
2. CHARACTER ANCHORS:
   - Define "CHARACTER ANCHORS" — a precise, detailed physical description (hair, face, clothing, build) for each character that MUST appear VERBATIM in every scene's visualPrompt where that character appears.
3. VISUAL STYLE:
   - Define a "VISUAL STYLE" — a consistent art direction string (e.g., "cinematic 35mm film look, warm golden hour backlighting, shallow depth of field") that MUST appear in every scene's visualPrompt.
4. HIGH-END CINEMATOGRAPHY:
   - Each visualPrompt must be a self-contained, richly detailed description (100+ words) specifying active, dynamic motion, framing/angle (e.g. low-angle tracking shot, slow dolly-in, close-up), lighting setups (e.g. high-contrast key lighting, soft diffused studio light), and color palette. Avoid static poses; describe active, cinematic motion.
5. VISUAL CHAINING & CONTINUITY:
   - Ensure the scenes flow narratively and spatially. The end of each scene should visually link to the next one (using matches, camera pans, zoom transitions, or narrative logical progression) to create a single continuous, coherent film.

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
router.post('/agent/generate', protect, requireCredits('videoGenerate'), aiGenerationLimiter, async (req, res) => {
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

        // ── Voiceover generation (removed) ──
        let voiceoverUrl = null;

        // ── AI background music generation (removed) ──
        let musicUrl = null;

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


// ══════════════════════════════════════════════════════════════════════════════
// ██╗   ██╗██████╗      ██╗    ███╗   ███╗ ██████╗ ██████╗ ███████╗
// ██║   ██║╚════██╗    ██╔╝    ████╗ ████║██╔═══██╗██╔══██╗██╔════╝
// ██║   ██║ █████╔╝   ██╔╝     ██╔████╔██║██║   ██║██║  ██║█████╗
// ╚██╗ ██╔╝██╔═══╝   ██╔╝      ██║╚██╔╝██║██║   ██║██║  ██║██╔══╝
//  ╚████╔╝ ███████╗ ██╔╝       ██║ ╚═╝ ██║╚██████╔╝██████╔╝███████╗
//   ╚═══╝  ╚══════╝╚═╝        ╚═╝     ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝
//
// 5-Stage Sequential Video Agent — Stage-Gated Pipeline
// ══════════════════════════════════════════════════════════════════════════════
// POST /api/video-studio/agent/v2/start          — Stage 1: Analyze inputs
// POST /api/video-studio/agent/v2/plan           — Stage 2: Generate creative plan
// POST /api/video-studio/agent/v2/generate-refs  — Stage 3: Generate ref images
// POST /api/video-studio/agent/v2/approve-refs   — Stage 3 Gate: Approve refs
// POST /api/video-studio/agent/v2/storyboard     — Stage 4: Build storyboard
// POST /api/video-studio/agent/v2/select-model   — Stage 5: Model select + prompt
// POST /api/video-studio/agent/v2/generate       — Stage 6: Generate video
// GET  /api/video-studio/agent/v2/:sessionId     — Get session state
// POST /api/video-studio/agent/v2/:sessionId/regenerate-ref — Regenerate a single ref
// ══════════════════════════════════════════════════════════════════════════════

// Helper: strict stage gate validation
async function requireAgentStage(res, session, requiredStage, gateFlag = null) {
    const stageOrder = ['analyze', 'plan', 'refs', 'storyboard', 'model', 'generate', 'done'];
    const currentIdx = stageOrder.indexOf(session.stage);
    const requiredIdx = stageOrder.indexOf(requiredStage);
    if (currentIdx < requiredIdx) {
        res.status(400).json({
            success: false,
            error: `Stage gate blocked: session is at '${session.stage}', needs '${requiredStage}'`,
            currentStage: session.stage,
            requiredStage,
        });
        return false;
    }
    if (gateFlag && !session[gateFlag]) {
        res.status(400).json({
            success: false,
            error: `Approval gate not passed: '${gateFlag}' must be true before proceeding`,
            gateFlag,
        });
        return false;
    }
    return true;
}


// ── Stage 1: Analyze ──────────────────────────────────────────────────────────
router.post('/agent/v2/start', protect, async (req, res) => {
    try {
        const { brief, images, videoUrl, brandId, productId } = req.body;
        if (!brief?.trim() && (!images || images.length === 0)) {
            return res.status(400).json({ success: false, error: 'A brief or at least one image is required' });
        }

        const { analyzeInputs } = await import('../agents/videoStudio/videoAgentDirector.js');
        const VideoAgentSession = (await import('../models/VideoAgentSession.js')).default;

        // Load product data if productId provided
        let productData = null;
        let productImages = [];
        if (productId) {
            const Product = (await import('../models/Product.js')).default;
            productData = await Product.findById(productId).lean();
            if (productData) {
                productImages = (productData.images || []).filter(i => i.url).map(i => i.url);
            }
        }

        console.log(`🤖 [VideoAgent V2] Stage 1: Analyzing... brand=${brandId} product=${productId} images=${(images||[]).length}`);

        const analysis = await analyzeInputs({
            brief: brief?.trim() || '',
            images: images || [],
            videoUrl: videoUrl || '',
            brandId: brandId || null,
            productId: productId || null,
            productData,
        });

        // Create session
        const sessionId = `vas_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const session = await VideoAgentSession.create({
            sessionId,
            user: req.user._id,
            brand: brandId || null,
            stage: 'plan', // advance to next stage
            input: {
                brief: brief?.trim() || '',
                images: (images || []).map(img => ({ url: img.url, label: img.label || '', source: img.source || 'upload' })),
                videoUrl: videoUrl || '',
                productId: productId || null,
                productImages,
            },
            analysis,
            messages: [
                { role: 'agent', type: 'analysis', content: analysis.summary, timestamp: Date.now() }
            ],
        });

        res.json({ success: true, sessionId, analysis, stage: 'plan' });
    } catch (error) {
        console.error('[VideoAgent V2] Stage 1 error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ── Stage 2: Generate Creative Plan ─────────────────────────────────────────
router.post('/agent/v2/plan', protect, async (req, res) => {
    try {
        const { sessionId, durationOverride, ratioOverride, videoTypeOverride } = req.body;
        if (!sessionId) return res.status(400).json({ success: false, error: 'sessionId required' });

        const VideoAgentSession = (await import('../models/VideoAgentSession.js')).default;
        const session = await VideoAgentSession.findOne({ sessionId, user: req.user._id });
        if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

        const { generatePlan } = await import('../agents/videoStudio/videoAgentDirector.js');

        console.log(`🤖 [VideoAgent V2] Stage 2: Generating plan... session=${sessionId}`);

        const plan = await generatePlan({
            analysis: session.analysis,
            brief: session.input.brief,
            brandId: session.brand?.toString() || null,
        });

        // Apply user overrides
        if (durationOverride) plan.duration = Number(durationOverride);
        if (ratioOverride) plan.ratio = ratioOverride;
        if (videoTypeOverride) plan.videoType = videoTypeOverride;

        await VideoAgentSession.findOneAndUpdate(
            { sessionId },
            {
                plan,
                stage: 'refs',
                $push: { messages: { role: 'agent', type: 'plan', content: `Creative plan ready: "${plan.title}" — ${plan.duration}s ${plan.ratio} ${plan.videoType}`, timestamp: Date.now() } }
            }
        );

        res.json({ success: true, sessionId, plan, stage: 'refs' });
    } catch (error) {
        console.error('[VideoAgent V2] Stage 2 error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ── Stage 3: Generate Reference Images ───────────────────────────────────────
router.post('/agent/v2/generate-refs', protect, async (req, res) => {
    try {
        const { sessionId } = req.body;
        if (!sessionId) return res.status(400).json({ success: false, error: 'sessionId required' });

        const VideoAgentSession = (await import('../models/VideoAgentSession.js')).default;
        const session = await VideoAgentSession.findOne({ sessionId, user: req.user._id });
        if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

        if (!await requireAgentStage(res, session, 'refs')) return;

        const { generateReferenceImages } = await import('../agents/videoStudio/videoAgentDirector.js');

        console.log(`🤖 [VideoAgent V2] Stage 3: Generating refs... session=${sessionId} char=${session.plan?.refsNeeded?.character} product=${session.plan?.refsNeeded?.product}`);

        const refs = await generateReferenceImages({
            plan: session.plan,
            analysis: session.analysis,
            brief: session.input.brief,
            uploadedImages: session.input.images || [],
            characterPhoto: session.input.characterPhoto || '',
            productImages: session.input.productImages || [],
            brandId: session.brand?.toString() || null,
        });

        // If no refs needed at all, auto-approve and advance
        const needsAnyRef = session.plan?.refsNeeded?.character || session.plan?.refsNeeded?.product || session.plan?.refsNeeded?.location;
        const autoApprove = !needsAnyRef || (refs.characterRefs.length === 0 && refs.productRefs.length === 0 && refs.locationRefs.length === 0);

        await VideoAgentSession.findOneAndUpdate(
            { sessionId },
            {
                'refs.characterRefs': refs.characterRefs,
                'refs.productRefs': refs.productRefs,
                'refs.locationRefs': refs.locationRefs,
                ...(autoApprove ? { refsApproved: true, stage: 'storyboard' } : {}),
                $push: {
                    messages: {
                        role: 'agent', type: 'refs',
                        content: autoApprove ? 'No reference images needed — proceeding to storyboard.' : `Generated ${refs.characterRefs.length + refs.productRefs.length + refs.locationRefs.length} reference image(s). Review and approve to continue.`,
                        timestamp: Date.now(),
                    }
                }
            }
        );

        res.json({
            success: true, sessionId, refs,
            autoApproved: autoApprove,
            stage: autoApprove ? 'storyboard' : 'refs',
        });
    } catch (error) {
        console.error('[VideoAgent V2] Stage 3 generate-refs error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ── Stage 3b: Regenerate a single reference image ────────────────────────────
router.post('/agent/v2/:sessionId/regenerate-ref', protect, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { refType, refIndex } = req.body; // refType: 'character'|'product'|'location'

        const VideoAgentSession = (await import('../models/VideoAgentSession.js')).default;
        const session = await VideoAgentSession.findOne({ sessionId, user: req.user._id });
        if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

        const { generateReferenceImages } = await import('../agents/videoStudio/videoAgentDirector.js');

        // Generate just the requested type
        const partialPlan = { ...session.plan.toObject?.() || session.plan, refsNeeded: { character: refType === 'character', product: refType === 'product', location: refType === 'location' } };
        const refs = await generateReferenceImages({
            plan: partialPlan,
            analysis: session.analysis,
            brief: session.input.brief,
            uploadedImages: session.input.images || [],
            characterPhoto: session.input.characterPhoto || '',
            productImages: session.input.productImages || [],
            brandId: session.brand?.toString() || null,
        });

        const newRefs = refs[`${refType}Refs`] || [];
        if (newRefs.length === 0) {
            return res.status(500).json({ success: false, error: 'Failed to regenerate reference image' });
        }

        // Update the specific ref in the array
        const arrayKey = `refs.${refType}Refs`;
        const updateKey = `${arrayKey}.${refIndex || 0}`;
        await VideoAgentSession.findOneAndUpdate(
            { sessionId },
            { [updateKey]: newRefs[0] }
        );

        res.json({ success: true, ref: newRefs[0] });
    } catch (error) {
        console.error('[VideoAgent V2] Regenerate ref error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ── Stage 3c: Approve References ─────────────────────────────────────────────
router.post('/agent/v2/approve-refs', protect, async (req, res) => {
    try {
        const { sessionId, approvedRefs } = req.body;
        if (!sessionId) return res.status(400).json({ success: false, error: 'sessionId required' });

        const VideoAgentSession = (await import('../models/VideoAgentSession.js')).default;
        const session = await VideoAgentSession.findOne({ sessionId, user: req.user._id });
        if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

        // Build approved URL list in order: product → character → location
        const allApproved = [
            ...(approvedRefs?.productRefs || session.refs?.productRefs || []).map(r => r.url).filter(Boolean),
            ...(approvedRefs?.characterRefs || session.refs?.characterRefs || []).map(r => r.url).filter(Boolean),
            ...(approvedRefs?.locationRefs || session.refs?.locationRefs || []).map(r => r.url).filter(Boolean),
        ];

        await VideoAgentSession.findOneAndUpdate(
            { sessionId },
            {
                refsApproved: true,
                stage: 'storyboard',
                'refs.approvedUrls': allApproved,
                ...(approvedRefs?.characterRefs ? { 'refs.characterRefs': approvedRefs.characterRefs } : {}),
                ...(approvedRefs?.productRefs   ? { 'refs.productRefs':   approvedRefs.productRefs   } : {}),
                ...(approvedRefs?.locationRefs  ? { 'refs.locationRefs':  approvedRefs.locationRefs  } : {}),
                $push: {
                    messages: {
                        role: 'user', type: 'approval', content: '✅ Reference images approved',
                        timestamp: Date.now(),
                    }
                }
            }
        );

        res.json({ success: true, sessionId, stage: 'storyboard', approvedCount: allApproved.length });
    } catch (error) {
        console.error('[VideoAgent V2] approve-refs error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ── Stage 4: Build Storyboard ─────────────────────────────────────────────────
router.post('/agent/v2/storyboard', protect, async (req, res) => {
    try {
        const { sessionId } = req.body;
        if (!sessionId) return res.status(400).json({ success: false, error: 'sessionId required' });

        const VideoAgentSession = (await import('../models/VideoAgentSession.js')).default;
        const session = await VideoAgentSession.findOne({ sessionId, user: req.user._id });
        if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

        if (!await requireAgentStage(res, session, 'storyboard', 'refsApproved')) return;

        const { buildStoryboard } = await import('../agents/videoStudio/videoAgentDirector.js');

        console.log(`🤖 [VideoAgent V2] Stage 4: Building storyboard... session=${sessionId}`);

        const approvedRefs = {
            characterRefs: session.refs?.characterRefs || [],
            productRefs:   session.refs?.productRefs   || [],
            locationRefs:  session.refs?.locationRefs  || [],
        };

        const storyboardResult = await buildStoryboard({
            plan: session.plan,
            analysis: session.analysis,
            brief: session.input.brief,
            approvedRefs,
            productImages: session.input.productImages || [],
            brandId: session.brand?.toString() || null,
            userId: req.user._id,
        });

        const storyboardData = {
            colorPalette:            storyboardResult.colorPalette || [],
            paletteNames:            storyboardResult.paletteNames || [],
            materialNotes:           storyboardResult.materialNotes || '',
            environmentFingerprint:  storyboardResult.environmentFingerprint || '',
            cuts:                    storyboardResult.cuts || [],
            moodKeywords:            storyboardResult.moodKeywords || [],
            cinematographyRules:     storyboardResult.cinematographyRules || '',
            emotionalArc:            storyboardResult.emotionalArc || '',
            narrativeArc:            storyboardResult.narrativeArc || '',
            hookStrategy:            storyboardResult.hookStrategy || '',
            imagePrompt:             storyboardResult.imagePrompt || '',
            posterUrl:               storyboardResult.posterUrl || storyboardResult.storyboardImageUrl || '',
            totalDuration:           session.plan?.duration || 30,
        };

        await VideoAgentSession.findOneAndUpdate(
            { sessionId },
            {
                storyboard: storyboardData,
                stage: 'model',
                $push: {
                    messages: {
                        role: 'agent', type: 'storyboard',
                        content: `🎬 Storyboard complete! ${storyboardData.cuts?.length || 0} cuts planned. Environment: ${storyboardData.environmentFingerprint?.substring(0, 80) || 'defined'}`,
                        timestamp: Date.now(),
                    }
                }
            }
        );

        res.json({ success: true, sessionId, storyboard: storyboardData, stage: 'model' });
    } catch (error) {
        console.error('[VideoAgent V2] Stage 4 storyboard error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ── Stage 5: Model Selection + Prompt Build ──────────────────────────────────
router.post('/agent/v2/select-model', protect, async (req, res) => {
    try {
        const { sessionId, model, resolution, qualityMode } = req.body;
        if (!sessionId || !model) return res.status(400).json({ success: false, error: 'sessionId and model required' });

        const VideoAgentSession = (await import('../models/VideoAgentSession.js')).default;
        const session = await VideoAgentSession.findOne({ sessionId, user: req.user._id });
        if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

        if (!await requireAgentStage(res, session, 'model', 'refsApproved')) return;
        // Ensure storyboard exists
        if (!session.storyboard?.cuts?.length && !session.storyboard?.imagePrompt) {
            return res.status(400).json({ success: false, error: 'Storyboard must be generated before selecting a model' });
        }

        const { writeModelPrompt } = await import('../agents/videoStudio/videoAgentDirector.js');

        console.log(`🤖 [VideoAgent V2] Stage 5: Writing ${model} prompt... session=${sessionId}`);

        const approvedRefs = {
            characterRefs: session.refs?.characterRefs || [],
            productRefs:   session.refs?.productRefs   || [],
            locationRefs:  session.refs?.locationRefs  || [],
        };

        const modelResult = await writeModelPrompt({
            model,
            storyboard: session.storyboard,
            plan: session.plan,
            analysis: session.analysis,
            brief: session.input.brief,
            approvedRefs,
            brandId: session.brand?.toString() || null,
        });

        const modelSelection = {
            model,
            resolution: resolution || modelResult.resolution || '1080p',
            qualityMode: qualityMode || modelResult.qualityMode || 'fast',
            finalPrompt: modelResult.finalPrompt,
            costEstimate: modelResult.costEstimate,
        };

        await VideoAgentSession.findOneAndUpdate(
            { sessionId },
            {
                modelSelection,
                modelApproved: true,
                stage: 'generate',
                $push: {
                    messages: {
                        role: 'agent', type: 'model-ready',
                        content: `✅ ${model} prompt ready. Estimated cost: ${JSON.stringify(modelResult.costEstimate)}`,
                        timestamp: Date.now(),
                    }
                }
            }
        );

        res.json({ success: true, sessionId, modelSelection, stage: 'generate' });
    } catch (error) {
        console.error('[VideoAgent V2] Stage 5 select-model error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ── Stage 6: Generate Videos ──────────────────────────────────────────────────
router.post('/agent/v2/generate', protect, requireCredits('videoGenerate'), aiGenerationLimiter, async (req, res) => {
    try {
        const { sessionId } = req.body;
        if (!sessionId) return res.status(400).json({ success: false, error: 'sessionId required' });

        const VideoAgentSession = (await import('../models/VideoAgentSession.js')).default;
        const session = await VideoAgentSession.findOne({ sessionId, user: req.user._id });
        if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

        if (!await requireAgentStage(res, session, 'generate', 'modelApproved')) return;

        const { model, resolution, qualityMode, finalPrompt } = session.modelSelection;
        const plan = session.plan;
        const storyboard = session.storyboard;
        const approvedRefUrls = session.refs?.approvedUrls || [];
        const duration = plan.duration || 30;
        const aspectRatio = plan.ratio || '9:16';

        console.log(`🤖 [VideoAgent V2] Stage 6: Generating... session=${sessionId} model=${model} duration=${duration}s`);

        const isLongForm = (model === 'gemini-flash' || model === 'gemini-omni-flash') ? duration > 10 : duration > 15;
        const sceneProjects = [];

        if (isLongForm) {
            // ── Long-form: use scenePlanner + storyboardLongForm pipeline ──
            try {
                const { startStoryboardLongForm } = await import('../agents/videoStudio/storyboardLongForm.js');

                // Create a proxy VideoProject for long-form pipeline
                const proxyProject = await VideoProject.create({
                    user: req.user._id,
                    brand: session.brand || null,
                    title: plan.title || 'Video Agent Long Form',
                    status: 'storyboard-ready',
                    mode: 'storyboard',
                    storyboard: {
                        imagePrompt: finalPrompt,
                        videoPrompt: finalPrompt,
                        totalDuration: duration,
                        format: aspectRatio,
                        style: plan.style || 'hyperrealistic',
                        structuredPlan: {
                            cuts: storyboard.cuts || [],
                            colorPalette: storyboard.colorPalette || [],
                            environmentFingerprint: storyboard.environmentFingerprint || '',
                            moodKeywords: storyboard.moodKeywords || [],
                            cinematographyRules: storyboard.cinematographyRules || '',
                            emotionalArc: storyboard.emotionalArc || '',
                        },
                        characterRefSheetUrl: approvedRefUrls[0] || '',
                    },
                    input: {
                        brief: session.input.brief,
                        avatarUrls: session.refs?.characterRefs?.map(r => r.url).filter(Boolean) || [],
                        refImageUrls: approvedRefUrls,
                    },
                });

                // Start long-form job
                const longFormJob = await startStoryboardLongForm({
                    projectId: proxyProject._id.toString(),
                    userId: req.user._id.toString(),
                    model,
                    aspectRatio,
                    qualityMode: qualityMode || 'fast',
                    referenceImages: approvedRefUrls,
                    dialogueLanguage: 'English',
                    generateMode: 'automatic',
                });

                await VideoAgentSession.findOneAndUpdate(
                    { sessionId },
                    {
                        'generation.isLongForm': true,
                        'generation.longFormJobId': longFormJob?.jobId || proxyProject._id.toString(),
                        stage: 'generate',
                        $push: { messages: { role: 'agent', type: 'generating', content: `🎬 Long-form video generation started (${duration}s). Generating ${Math.ceil(duration/10)} segments...`, timestamp: Date.now() } }
                    }
                );

                res.json({
                    success: true, sessionId, isLongForm: true,
                    longFormJobId: longFormJob?.jobId || proxyProject._id.toString(),
                    projectId: proxyProject._id,
                    model, duration, aspectRatio,
                });

            } catch (lfErr) {
                console.error('[VideoAgent V2] Long-form failed:', lfErr.message);
                return res.status(500).json({ success: false, error: `Long-form generation failed: ${safeErrorMessage(lfErr)}` });
            }
        } else {
            // ── Short-form: generate per-scene directly ──
            const cuts = storyboard.cuts || [];
            const scenesData = cuts.length > 0 ? cuts : [{ id: 1, scene: finalPrompt, duration: duration }];

            for (let i = 0; i < scenesData.length; i++) {
                const cut = scenesData[i];
                const sceneDur = Math.min(Math.max(Number(cut.duration) || Math.ceil(duration / scenesData.length), 3), 15);

                const scenePrompt = [
                    storyboard.environmentFingerprint ? `ENVIRONMENT: ${storyboard.environmentFingerprint}` : '',
                    storyboard.colorPalette?.length ? `COLORS: ${storyboard.colorPalette.join(', ')}` : '',
                    cut.lens ? `CAMERA: ${cut.lens} ${cut.shot || ''} ${cut.move || ''}` : '',
                    cut.scene || finalPrompt,
                ].filter(Boolean).join('\n');

                const firstImageUrl = approvedRefUrls[0] || '';

                try {
                    const project = await VideoProject.create({
                        user: req.user._id,
                        brand: session.brand || null,
                        title: `${plan.title} — Scene ${i + 1}`,
                        status: 'advanced-generating',
                        mode: 'agent-scene',
                        advancedConfig: {
                            prompt: scenePrompt,
                            firstImageUrl,
                            aspectRatio,
                            duration: sceneDur,
                            referenceImages: approvedRefUrls.map(url => ({ url })),
                        },
                        routing: { selectedModel: model, resolution: resolution || '1080p', mode: qualityMode || 'fast' },
                    });

                    const state = await advancedGenerateNode({
                        prompt: scenePrompt,
                        model,
                        duration: sceneDur,
                        resolution: resolution || '1080p',
                        qualityMode: qualityMode || 'fast',
                        firstImageUrl,
                        generateAudio: model === 'veo-3.1' || model === 'veo-3.1-fast',
                        aspectRatio,
                        referenceImages: approvedRefUrls.filter(u => u && u.startsWith('http')),
                    });

                    await VideoProject.findByIdAndUpdate(project._id, {
                        generation: state.generation,
                        backendPrompt: scenePrompt,
                    });

                    sceneProjects.push({
                        sceneId: i + 1,
                        projectId: project._id.toString(),
                        duration: sceneDur,
                        status: 'generating',
                        generation: state.generation,
                    });
                    console.log(`   🎥 Scene ${i + 1}/${scenesData.length} submitted`);
                } catch (sceneErr) {
                    console.error(`   ❌ Scene ${i + 1} failed:`, sceneErr.message);
                    sceneProjects.push({ sceneId: i + 1, projectId: null, duration: sceneDur, status: 'failed', error: sceneErr.message });
                }
            }

            await VideoAgentSession.findOneAndUpdate(
                { sessionId },
                {
                    'generation.scenes': sceneProjects,
                    'generation.isLongForm': false,
                    stage: 'generate',
                    creditsUsed: (req.creditsDeducted || 0),
                    $push: { messages: { role: 'agent', type: 'generating', content: `🎬 ${sceneProjects.filter(s => s.projectId).length}/${sceneProjects.length} scene(s) submitted for generation.`, timestamp: Date.now() } }
                }
            );

            res.json({
                success: true, sessionId, isLongForm: false,
                scenes: sceneProjects,
                model, aspectRatio, totalDuration: duration,
            });
        }
    } catch (error) {
        console.error('[VideoAgent V2] Stage 6 generate error:', error);
        if (req.creditsDeducted > 0) {
            await refundCredits(req.user._id, req.creditsDeducted, 'videoGenerateRefund', `Refund: VideoAgent V2 Gen Failure (${safeErrorMessage(error)})`, 'video');
        }
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ── GET /api/video-studio/agent/v2/node-catalog ──────────────────────────────
router.get('/agent/v2/node-catalog', async (req, res) => {
    try {
        const { NODE_CATALOG } = await import('../agents/videoStudio/nodeCatalog.js');
        res.json({ success: true, catalog: NODE_CATALOG });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});


// ── GET /api/video-studio/agent/v2/graph/:sessionId/presets ────────────────────
router.get('/agent/v2/graph/:sessionId/presets', protect, async (req, res) => {
    try {
        const { BUILTIN_PRESETS } = await import('../agents/videoStudio/presets.js');
        const VideoGraph = (await import('../models/VideoGraph.js')).default;
        const VideoAgentSession = (await import('../models/VideoAgentSession.js')).default;

        const sessionDoc = await VideoAgentSession.findOne({ sessionId: req.params.sessionId, user: req.user._id }).lean();
        if (!sessionDoc) return res.status(404).json({ success: false, error: 'Session not found' });

        const graph = await VideoGraph.findOne({ session: sessionDoc._id, user: req.user._id }).lean();
        const customPresets = graph?.customPresets || [];

        res.json({ success: true, presets: [...BUILTIN_PRESETS, ...customPresets] });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

// ── POST /api/video-studio/agent/v2/graph/:sessionId/presets ───────────────────
router.post('/agent/v2/graph/:sessionId/presets', protect, async (req, res) => {
    try {
        const { name, category, target_model, system_prompt, char_limit, style_tokens, preserve_mentions } = req.body;
        if (!name || !system_prompt) {
            return res.status(400).json({ success: false, error: 'Name and System Prompt are required' });
        }

        const VideoGraph = (await import('../models/VideoGraph.js')).default;
        const VideoAgentSession = (await import('../models/VideoAgentSession.js')).default;

        const sessionDoc = await VideoAgentSession.findOne({ sessionId: req.params.sessionId, user: req.user._id }).lean();
        if (!sessionDoc) return res.status(404).json({ success: false, error: 'Session not found' });

        const newPreset = {
            id: `custom_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            name,
            category: category || 'task',
            target_model: target_model || null,
            system_prompt,
            char_limit: Number(char_limit) || 2000,
            style_tokens: Array.isArray(style_tokens) ? style_tokens : [],
            preserve_mentions: preserve_mentions !== false,
            scope: 'project',
            editable: true
        };

        const graph = await VideoGraph.findOneAndUpdate(
            { session: sessionDoc._id, user: req.user._id },
            { $push: { customPresets: newPreset } },
            { new: true }
        );

        if (!graph) return res.status(404).json({ success: false, error: 'Graph not found' });
        res.json({ success: true, preset: newPreset });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

// ── DELETE /api/video-studio/agent/v2/graph/:sessionId/presets/:presetId ───────
router.delete('/agent/v2/graph/:sessionId/presets/:presetId', protect, async (req, res) => {
    try {
        const VideoGraph = (await import('../models/VideoGraph.js')).default;
        const VideoAgentSession = (await import('../models/VideoAgentSession.js')).default;

        const sessionDoc = await VideoAgentSession.findOne({ sessionId: req.params.sessionId, user: req.user._id }).lean();
        if (!sessionDoc) return res.status(404).json({ success: false, error: 'Session not found' });

        const graph = await VideoGraph.findOneAndUpdate(
            { session: sessionDoc._id, user: req.user._id },
            { $pull: { customPresets: { id: req.params.presetId } } },
            { new: true }
        );

        if (!graph) return res.status(404).json({ success: false, error: 'Graph not found' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

// Helper for prompt enhancement used by both API and Copilot Agent
export async function _enhancePromptInternal(sessionId, userId, nodeId, presetId, rawPrompt, graphObj) {
    const { BUILTIN_PRESETS, mapModelToPresetId } = await import('../agents/videoStudio/presets.js');
    const VideoGraph = (await import('../models/VideoGraph.js')).default;
    const VideoAgentSession = (await import('../models/VideoAgentSession.js')).default;

    let graph = graphObj;
    if (!graph) {
        const sessionDoc = await VideoAgentSession.findOne({ sessionId, user: userId }).lean();
        if (!sessionDoc) throw new Error('Session not found');
        graph = await VideoGraph.findOne({ session: sessionDoc._id, user: userId }).lean();
    }
    if (!graph) throw new Error('Graph not found');

    let targetPresetId = presetId || 'auto';
    if (targetPresetId === 'auto') {
        let targetModel = null;
        const visited = new Set();
        function traverse(id) {
            if (visited.has(id)) return;
            visited.add(id);
            const nodeObj = graph.nodes.find(n => n.id === id);
            if (!nodeObj) return;
            if (nodeObj.type === 'image_generate' || nodeObj.type === 'video_generate') {
                targetModel = nodeObj.params?.model || null;
                return;
            }
            const outEdges = graph.edges.filter(e => e.from.node === id);
            for (const edge of outEdges) {
                traverse(edge.to.node);
                if (targetModel) return;
            }
        }
        traverse(nodeId);
        targetPresetId = mapModelToPresetId(targetModel);
    }

    let preset = BUILTIN_PRESETS.find(p => p.id === targetPresetId);
    if (!preset && graph.customPresets) {
        preset = graph.customPresets.find(p => p.id === targetPresetId);
    }
    if (!preset) {
        preset = BUILTIN_PRESETS.find(p => p.id === 'seedance');
    }

    const systemPrompt = `You are an expert AI prompt engineer. Your job is to rewrite the user idea into the perfect optimized prompt using the following preset's instruction:
    Preset: "${preset.name}"
    Preset instruction:
    ${preset.system_prompt}

    CRITICAL REQUIREMENT:
    - Incorporate all @-mentions (such as @image1, @n_123, @text_input) exactly as written. Never delete, change, or strip any word starting with @. Leave it intact so it remains a functional variable link.
    - Ensure the enhanced prompt does not exceed ${preset.char_limit} characters.
    
    Return a clean JSON object with this exact structure:
    {
      "enhancedPrompt": "The enhanced prompt text...",
      "changes": ["List of visual enhancements made", "Description of layout additions..."]
    }`;

    const userPrompt = `User Raw Prompt: "${rawPrompt}"`;

    const { callAgentText } = await import('../agents/shared/agentUtils.js');
    const responseText = await callAgentText(systemPrompt, userPrompt, 0.7, 2048, {
        provider: 'gemini',
        preferFast: true
    });

    let parsed;
    try {
        const cleanText = responseText.replace(/```json/i, '').replace(/```/g, '').trim();
        parsed = JSON.parse(cleanText);
    } catch (e) {
        parsed = {
            enhancedPrompt: responseText.trim(),
            changes: ['Expanded prompt based on preset style']
        };
    }

    if (parsed.enhancedPrompt.length > preset.char_limit) {
        parsed.enhancedPrompt = parsed.enhancedPrompt.substring(0, preset.char_limit);
    }

    return {
        success: true,
        presetId: preset.id,
        presetName: preset.name,
        rawPrompt,
        enhancedPrompt: parsed.enhancedPrompt,
        changes: parsed.changes || []
    };
}

// ── POST /api/video-studio/agent/v2/graph/:sessionId/enhance-prompt ────────────
router.post('/agent/v2/graph/:sessionId/enhance-prompt', protect, async (req, res) => {
    try {
        const { nodeId, presetId, rawPrompt } = req.body;
        if (!nodeId || !presetId || !rawPrompt) {
            return res.status(400).json({ success: false, error: 'nodeId, presetId, and rawPrompt are required' });
        }

        const enhanceResult = await _enhancePromptInternal(req.params.sessionId, req.user._id, nodeId, presetId, rawPrompt);
        res.json(enhanceResult);
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});


// ── GET Session State ──────────────────────────────────────────────────────────
router.get('/agent/v2/:sessionId', protect, async (req, res) => {
    try {
        const VideoAgentSession = (await import('../models/VideoAgentSession.js')).default;
        const session = await VideoAgentSession.findOne({
            sessionId: req.params.sessionId,
            user: req.user._id,
        }).lean();
        if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
        res.json({ success: true, session });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ── Update Plan (user edits before generating) ────────────────────────────────
router.patch('/agent/v2/:sessionId/plan', protect, async (req, res) => {
    try {
        const { duration, ratio, videoType, style } = req.body;
        const VideoAgentSession = (await import('../models/VideoAgentSession.js')).default;
        const session = await VideoAgentSession.findOne({ sessionId: req.params.sessionId, user: req.user._id });
        if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

        const updates = {};
        if (duration) updates['plan.duration'] = Number(duration);
        if (ratio) updates['plan.ratio'] = ratio;
        if (videoType) updates['plan.videoType'] = videoType;
        if (style) updates['plan.style'] = style;

        await VideoAgentSession.findOneAndUpdate({ sessionId: req.params.sessionId }, updates);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});




// ══════════════════════════════════════════════════════════════════════════════
// END — 5-Stage Video Agent V2
// ══════════════════════════════════════════════════════════════════════════════


// ── POST /agent/v2/analyze-media — Media-as-Brief: analyze image/video/audio ──
// User uploads any media → AI analyzes → returns a generated creative brief
// ══════════════════════════════════════════════════════════════════════════════
router.post('/agent/v2/analyze-media', protect, async (req, res) => {
    const multer = (await import('multer')).default;
    const upload = multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: 60 * 1024 * 1024 }, // 60MB max
    }).single('file');

    upload(req, res, async (uploadErr) => {
        if (uploadErr) {
            return res.status(400).json({ success: false, error: uploadErr.message || 'File upload failed' });
        }

        try {
            const file = req.file;
            const brandId = req.body?.brandId || null;

            if (!file) return res.status(400).json({ success: false, error: 'No file uploaded' });

            const mime = file.mimetype || '';
            const isImage = mime.startsWith('image/');
            const isVideo = mime.startsWith('video/');
            const isAudio = mime.startsWith('audio/');

            if (!isImage && !isVideo && !isAudio) {
                return res.status(400).json({ success: false, error: 'Unsupported file type. Upload image, video, or audio.' });
            }

            console.log(`🎬 [analyze-media] type=${mime} size=${(file.size/1024).toFixed(0)}KB brand=${brandId}`);

            const { loadBrandContext } = await import('../agents/shared/agentUtils.js');
            const { brand } = await loadBrandContext(brandId);
            const brandName = brand?.name || '';
            const brandCategory = brand?.dna?.category || brand?.category || '';

            let generatedBrief = '';
            let mediaUrl = '';
            let thumbnailUrl = '';
            let mediaType = isImage ? 'image' : isVideo ? 'video' : 'audio';

            // ── Upload file to S3 first ──────────────────────────────────────
            const { uploadToS3 } = await import('../utils/s3.js').catch(() => ({ uploadToS3: null }));
            if (uploadToS3) {
                try {
                    const ext = mime.split('/')[1]?.split(';')[0] || 'bin';
                    const s3Key = `video-studio/media-brief/${req.user._id}/${Date.now()}.${ext}`;
                    mediaUrl = await uploadToS3(file.buffer, s3Key, mime);
                    console.log(`📤 [analyze-media] Uploaded to S3: ${mediaUrl?.substring(0, 60)}`);
                } catch (s3Err) {
                    console.warn('[analyze-media] S3 upload failed:', s3Err.message);
                }
            }

            // ── IMAGE: Vision analysis ───────────────────────────────────────
            if (isImage) {
                try {
                    const sharp = (await import('sharp')).default;
                    const resized = await sharp(file.buffer)
                        .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
                        .jpeg({ quality: 75 })
                        .toBuffer();
                    const base64 = resized.toString('base64');

                    const { getRouter } = await import('../ai/router.js');
                    const router = getRouter();

                    const systemPrompt = `You are an expert creative director and brand strategist.
Analyze this image and generate a creative brief for a video advertisement.

${brandName ? `Brand: ${brandName} (${brandCategory})` : 'Infer brand from the image.'}

Generate a compelling, specific creative brief in 2-3 sentences that describes:
- What product/brand is shown or implied
- The visual style, mood, and aesthetic
- A recommendation for the video format (30s ad, 15s reel, etc.)
- The target audience implied by the image
- The emotional hook or CTA direction

Return ONLY the brief text — no JSON, no bullet points. Write it as a clear instruction to a video director.`;

                    const result = await router.chat([
                        { role: 'user', content: [
                            { type: 'text', text: systemPrompt },
                            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } },
                        ]}
                    ], { provider: 'openai', model: 'gpt-4o', temperature: 0.7, maxTokens: 300 });

                    generatedBrief = result?.content || result?.message || '';
                    thumbnailUrl = mediaUrl;
                } catch (visionErr) {
                    console.error('[analyze-media] Vision analysis failed:', visionErr.message);
                    generatedBrief = `Create a video ad inspired by this product image. Focus on premium visuals, lifestyle shots, and a strong CTA.`;
                }
            }

            // ── VIDEO: Extract frames → analyze ──────────────────────────────
            else if (isVideo) {
                try {
                    const { execSync } = await import('child_process');
                    const fs = await import('fs');
                    const path = await import('path');
                    const os = await import('os');

                    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mantram-media-'));
                    const inputPath = path.join(tmpDir, `input.${mime.split('/')[1] || 'mp4'}`);
                    fs.writeFileSync(inputPath, file.buffer);

                    // Get ffmpeg path
                    let ffmpegPath = 'ffmpeg';
                    try {
                        ffmpegPath = (await import('@ffmpeg-installer/ffmpeg')).default?.path || ffmpegPath;
                    } catch { /* use system ffmpeg */ }

                    // Extract 3 frames: 10%, 40%, 70% through video
                    const framePaths = [];
                    const frameTimestamps = ['0:00:01', '0:00:05', '0:00:10'];

                    for (let i = 0; i < frameTimestamps.length; i++) {
                        const framePath = path.join(tmpDir, `frame${i}.jpg`);
                        try {
                            execSync(`"${ffmpegPath}" -y -ss ${frameTimestamps[i]} -i "${inputPath}" -vframes 1 -q:v 3 -vf "scale=720:-1" "${framePath}" 2>/dev/null`, {
                                timeout: 15000, stdio: 'pipe',
                            });
                            if (fs.existsSync(framePath)) framePaths.push(framePath);
                        } catch { /* skip failed frame */ }
                    }

                    if (framePaths.length === 0) {
                        // FFmpeg failed — extract first few bytes as image attempt
                        throw new Error('No frames extracted');
                    }

                    // Upload first frame as thumbnail
                    if (uploadToS3 && framePaths[0]) {
                        const frameBuffer = fs.readFileSync(framePaths[0]);
                        const thumbKey = `video-studio/media-brief/${req.user._id}/${Date.now()}-thumb.jpg`;
                        thumbnailUrl = await uploadToS3(frameBuffer, thumbKey, 'image/jpeg').catch(() => '');
                    }

                    // Vision analyze the first 2 frames
                    const { getRouter } = await import('../ai/router.js');
                    const router = getRouter();

                    const frameImages = framePaths.slice(0, 2).map(fp => {
                        const buf = fs.readFileSync(fp);
                        return { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${buf.toString('base64')}` } };
                    });

                    const result = await router.chat([
                        { role: 'user', content: [
                            { type: 'text', text: `You are an expert creative director. Analyze these video frames and generate a creative brief for a new video advertisement inspired by this content.${brandName ? ` Brand: ${brandName} (${brandCategory}).` : ''} Write a 2-3 sentence brief describing: the visual style and aesthetic, the content/product/message shown, the target audience, and a recommendation for the new video format. Write as a clear instruction to a video director. Return ONLY the brief text.` },
                            ...frameImages,
                        ]}
                    ], { provider: 'openai', model: 'gpt-4o', temperature: 0.7, maxTokens: 300 });

                    generatedBrief = result?.content || result?.message || '';

                    // Cleanup tmp
                    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
                } catch (videoErr) {
                    console.error('[analyze-media] Video analysis failed:', videoErr.message);
                    generatedBrief = `Create a video ad inspired by the uploaded reference video. Match the energy, pacing, and visual style. Adapt the content to showcase our brand.`;
                    thumbnailUrl = '';
                }
            }

            // ── AUDIO: Whisper transcription → brief ─────────────────────────
            else if (isAudio) {
                try {
                    const openaiKey = process.env.OPENAI_API_KEY;
                    let transcript = '';

                    if (openaiKey) {
                        const FormDataNode = (await import('form-data')).default;
                        const form = new FormDataNode();
                        const ext = mime.includes('wav') ? 'wav' : mime.includes('mp4') || mime.includes('m4a') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'mp3';
                        form.append('file', file.buffer, { filename: `audio.${ext}`, contentType: mime });
                        form.append('model', 'whisper-1');
                        form.append('response_format', 'text');

                        const whisperResp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                            method: 'POST',
                            headers: { Authorization: `Bearer ${openaiKey}`, ...form.getHeaders() },
                            body: form,
                            signal: AbortSignal.timeout(30000),
                        });

                        if (whisperResp.ok) {
                            transcript = (await whisperResp.text()).trim();
                        }
                    }

                    if (transcript) {
                        const { callAgent } = await import('../agents/shared/agentUtils.js');
                        const brief = await callAgent(
                            `You are a video creative director. The user has recorded an audio brief for a video ad. Convert this spoken brief into a clean, professional written creative brief in 2-3 sentences. Keep all the key details but make it crisp and actionable for a video production team.`,
                            `Audio brief transcript: "${transcript}"${brandName ? `\nBrand: ${brandName}` : ''}`,
                            0.5, 300
                        );
                        generatedBrief = typeof brief === 'string' ? brief : brief?.brief || transcript;
                    } else {
                        generatedBrief = `Create a compelling video ad. Audio brief uploaded for reference. Focus on brand storytelling and emotional connection.`;
                    }
                } catch (audioErr) {
                    console.error('[analyze-media] Audio analysis failed:', audioErr.message);
                    generatedBrief = `Create a compelling video ad based on the uploaded audio brief.`;
                }
            }

            // Clean up brief
            generatedBrief = generatedBrief
                .replace(/<think>[\s\S]*?<\/think>/gi, '')
                .replace(/^["']|["']$/g, '')
                .trim();

            console.log(`✅ [analyze-media] Brief generated: "${generatedBrief.substring(0, 80)}..."`);

            res.json({
                success: true,
                generatedBrief,
                mediaUrl,
                thumbnailUrl,
                mediaType,
            });

        } catch (error) {
            console.error('[analyze-media] Error:', error);
            res.status(500).json({ success: false, error: safeErrorMessage(error) });
        }
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /agent/v2/chat — Contextual AI Video Director
// ══════════════════════════════════════════════════════════════════════════════
// A real conversational AI that understands context, sentiment, and nuance.
// Not keyword matching — the LLM reads the full conversation history and
// genuinely understands what the user wants and how they feel.
// ══════════════════════════════════════════════════════════════════════════════
router.post('/agent/v2/chat', protect, async (req, res) => {
    try {
        const {
            sessionId,
            stage,
            message,
            conversationHistory = [], // Full chat log from frontend: [{role, content}]
            planContext = {},
            storyboardContext = {},
            analysisContext = {},
        } = req.body;
        if (!message?.trim()) return res.status(400).json({ success: false, error: 'No message provided' });

        const { callAgent } = await import('../agents/shared/agentUtils.js');

        // ── Load session for rich context ─────────────────────────────────────
        // CRITICAL: sessionId is a custom string like "vas_1234_abc", NOT a
        // MongoDB ObjectId. Must use findOne({ sessionId }) not findById().
        let sessionDoc = null;
        if (sessionId) {
            const VideoAgentSession = (await import('../models/VideoAgentSession.js')).default;
            sessionDoc = await VideoAgentSession.findOne({ sessionId, user: req.user._id }).lean();
        }

        // ── Assemble full context ─────────────────────────────────────────────
        const brandName = sessionDoc?.brand?.name || planContext?.brandName || 'your brand';
        const plan      = sessionDoc?.plan       || planContext       || {};
        const storyboard = sessionDoc?.storyboard || storyboardContext || {};
        const analysis  = sessionDoc?.analysis   || analysisContext   || {};

        // Build a readable conversation thread for context (last 12 messages)
        const historyText = (conversationHistory.slice(-12) || [])
            .map(m => `${m.role === 'user' ? 'User' : 'Director'}: ${m.content}`)
            .join('\n');

        // Stage-specific hints so the AI knows what actions make sense right now
        const stageHints = {
            idle:         'User has not started yet. Help them craft a brief or get started.',
            analyze:      'Analysis complete. Next logical action: generate the creative plan.',
            plan:         'Creative plan is shown. Next: generate reference images OR adjust plan details.',
            refs:         'Reference images generated. User should review and approve them.',
            'refs-review':'User is reviewing refs. They can approve, regenerate, or tweak.',
            storyboard:   'Storyboard is built. Next: select the AI video model.',
            model:        'Model selected. Next: confirm and generate the video.',
            generate:     'Video is being generated or is done. Help user download, share, or iterate.',
        };

        const MODEL_IDS = ['seedance-2.0', 'seedance-2.0-mini', 'kling-3.0', 'veo-3.1', 'veo-3.1-fast', 'veo-3.1-lite', 'grok-imagine', 'gemini-flash', 'gemini-omni-flash'];

        const MODEL_CONTEXT = `
- seedance-2.0: Best for most ads. Fast, great image-to-video consistency, supports up to 120s.
- seedance-2.0-mini: Lightweight, lower-cost video generation. Best for high-volume social media ads and rapid prototyping.
- kling-3.0: Best cinematic quality, multi-shot scripts, great for brand films. Up to 60s.
- veo-3.1: Native audio/dialogue generation. Most realistic. Up to 30s.
- veo-3.1-fast: Same as Veo but faster. Good for quick turnarounds.
- veo-3.1-lite: Google Veo 3.1 Lite — high efficiency cinematic video with native audio, routed via Atlas.
- grok-imagine: Fastest for short social reels & UGC. Up to 15s.
- gemini-flash: Best for motion graphics and animated explainers.`;

        const systemPrompt = `You are Mantram's AI Video Director — a brilliant, warm, deeply experienced creative director who genuinely cares about making great work.

You are NOT a keyword matcher or a command parser. You are having a REAL conversation.

You understand:
- What the user means, not just what they say
- How they FEEL (excited, frustrated, confused, impatient, uncertain)
- The full context of what has been created so far
- When to push forward vs when to slow down and clarify

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CURRENT PROJECT STATE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Stage: ${stage || 'idle'}
What this means: ${stageHints[stage] || stageHints.idle}

Brand: ${brandName}
Analysis summary: ${analysis.summary || 'Not yet analyzed'}
Content type: ${analysis.contentType || 'unknown'} | Style: ${analysis.detectedStyle || 'unknown'}
Audience: ${analysis.audienceProfile || 'unknown'}

Creative Plan:
  Title: ${plan.title || 'Not yet created'}
  Duration: ${plan.duration ? plan.duration + 's' : 'TBD'} | Ratio: ${plan.ratio || 'TBD'}
  Type: ${plan.videoType || 'TBD'} | Style: ${plan.style || 'TBD'}
  Hook: ${plan.hookStrategy || 'TBD'}
  Recommended model: ${plan.modelRecommendation || 'seedance-2.0'}
  Scenes planned: ${Array.isArray(plan.scenePlan) ? plan.scenePlan.length : 0}

Storyboard:
  Cuts: ${Array.isArray(storyboard.cuts) ? storyboard.cuts.length : 0}
  Color palette: ${(storyboard.colorPalette || []).join(', ') || 'not set'}
  Environment: ${storyboard.environmentFingerprint?.substring(0, 80) || 'not set'}

${MODEL_CONTEXT}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONVERSATION HISTORY:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${historyText || '(start of conversation)'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HOW TO RESPOND:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Read the user's message. Understand BOTH what they're saying AND how they feel.

SENTIMENT AWARENESS:
- If they seem frustrated/impatient → acknowledge their feeling first, be efficient, cut the fluff
- If they're excited/enthusiastic → match their energy, be celebratory
- If they seem confused → slow down, explain clearly, offer to help
- If they seem uncertain/hesitant → give them confidence and your honest recommendation
- If they're being casual/playful → be warm and casual back
- Never sound robotic, never give generic responses

INTENT — Classify into ONE of:
- APPROVE: They want to proceed with what's been shown (yes, looks good, love it, go ahead, 👍, fire, etc.)
- MODIFY_PLAN: They want to change plan details (duration, ratio, type, style, audience, hook)
- SWITCH_MODEL: They mention a different AI model to use
- ADD_CONTEXT: They're adding more info to the brief (new details, references, corrections)
- ASK_QUESTION: They're genuinely asking something (how does X work, what's the difference, why)
- CLARIFY: Their intent is unclear — you need to ask a smart focused question to understand
- ENCOURAGE: They need motivation or a pep talk (they seem stuck, worried, or doubting)
- START_OVER: They explicitly want to reset (start fresh, try different product, scrap this)
- GENERATE_NOW: They want to skip ahead to generation

PARAMS — Extract only what's relevant and explicitly mentioned:
- MODIFY_PLAN: { duration?: number, ratio?: string, videoType?: string, style?: string }
- SWITCH_MODEL: { model?: string } — map to: ${MODEL_IDS.join(' | ')}
- ADD_CONTEXT: { additionalContext?: string }

AGENT RESPONSE — Write as a real creative director would:
- Max 2 sentences. Natural. Warm but professional.
- For APPROVE: say what you're doing next with specificity
- For MODIFY_PLAN: confirm the change naturally, say what adjusting
- For ASK_QUESTION: give a genuinely useful, direct answer
- For CLARIFY: ask ONE specific focused question (not multiple)
- For ENCOURAGE: be real and genuine, not generic
- NO bullet lists. NO formatting. First person. Conversational.
- Reference the actual brand/plan details when relevant — show you know their project

Return ONLY valid JSON (no markdown, no explanation):
{ "intent": "...", "params": {}, "agentResponse": "...", "sentiment": "excited|confident|neutral|confused|frustrated|impatient" }`;

        const userPrompt = `User just said: "${message}"

Given everything you know about this project and the conversation so far, what is their intent and how should you respond? Return the JSON.`;

        let result;
        try {
            result = await callAgent(systemPrompt, userPrompt, 0.55, 600);
        } catch (err) {
            console.warn('[VideoAgent/chat] LLM call failed:', err.message);
            result = {
                intent: 'CLARIFY',
                params: {},
                agentResponse: "I want to make sure I get this right — could you tell me a bit more about what you're looking for?",
                sentiment: 'neutral',
            };
        }

        // Normalize response
        const intent        = result?.intent       || 'CLARIFY';
        const params        = result?.params        || {};
        const agentResponse = result?.agentResponse || "Got it! What would you like to do next?";
        const sentiment     = result?.sentiment     || 'neutral';

        console.log(`[VideoAgent/chat] stage=${stage} sentiment=${sentiment} msg="${message.substring(0,50)}" → intent=${intent}`);

        // Save the message exchange to session history if we have a session
        if (sessionDoc && sessionId) {
            try {
                const VideoAgentSession = (await import('../models/VideoAgentSession.js')).default;
                await VideoAgentSession.findOneAndUpdate(
                    { sessionId },
                    {
                        $push: {
                            messages: {
                                $each: [
                                    { role: 'user',  type: 'chat', content: message,       timestamp: Date.now() },
                                    { role: 'agent', type: 'chat', content: agentResponse, timestamp: Date.now() + 1 },
                                ],
                            },
                        },
                    }
                );
            } catch (saveErr) {
                console.warn('[VideoAgent/chat] Failed to save messages to session:', saveErr.message);
            }
        }

        res.json({ success: true, intent, params, agentResponse, sentiment });

    } catch (error) {
        console.error('[VideoAgent/chat] Error:', error);
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

            // Step 2: Audio logic removed (no longer mixing music or TTS here)

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

                // Build ffmpeg command for simple concat
                let ffmpegCmd = `"${ffmpegPath}" -y -f concat -safe 0 -i "${concatFile}" -c copy`;


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

                    let voiceoverUrl = null;

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

        const { generateImageWithVertex } = await import('../services/vertexImage.js');
        const modelId = 'gemini-3.1-flash-image-preview'; // NanoBanana 2

        const promptText = `SYSTEM INSTRUCTION: You are a professional photo editor. You only produce realistic photographs of real people. Never produce illustrations, 3D renders, cartoons, paintings, or digital art. Every output must look like a real photograph taken by a professional camera.\n\nEdit this real photograph: ${prompt.trim()}. Preserve the person's exact face, skin tone, and identity. Only modify what is described. Output must be a photorealistic photograph — not an illustration or render.`;

        const parts = [
            { inlineData: { mimeType: imgMime, data: imgBase64 } },
            { text: promptText },
        ];

        let geminiData;
        try {
            geminiData = await generateImageWithVertex(parts, modelId, 0.1);
        } catch(e) {
            console.error('Nanobanana 2 enhance error:', e.message);
            throw new Error(`Nanobanana 2 enhancement failed: ${e.message}`);
        }

        // Extract the generated image from response parts
        const responseParts = geminiData.candidates?.[0]?.content?.parts || [];
        let enhancedBase64 = null;
        let enhancedMime = 'image/png';
        for (const part of responseParts) {
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
// POST /api/video-studio/ugc/webhook-callback — HeyGen webhook callback
// ══════════════════════════════════════════════════════════════════════════════
router.post('/ugc/webhook-callback', async (req, res) => {
    // Verify HeyGen webhook authenticity
    const webhookToken = req.headers['x-heygen-signature'] || req.headers.authorization?.replace('Bearer ', '');
    if (webhookToken !== process.env.HEYGEN_WEBHOOK_SECRET && process.env.HEYGEN_WEBHOOK_SECRET) {
        console.warn('⚠️ UGC webhook callback rejected — invalid signature');
        return res.status(401).json({ error: 'Unauthorized webhook callback' });
    }

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
router.post('/ugc/generate-agent', protect, requireCredits('videoGenerate'), aiGenerationLimiter, async (req, res) => {
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
router.post('/ugc/generate', protect, requireCredits('videoGenerate'), aiGenerationLimiter, async (req, res) => {
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
        const templateQuery = { 
            $or: [
                { isTemplate: true },
                { isPublished: true, createdByRole: 'superadmin' }
            ],
            isActive: true 
        };
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

        const [templatesSigned, userAvatarsSigned] = await Promise.all([
            Promise.all(templates.map(async (av) => ({
                ...av,
                imageUrl: await getSignedUrlIfNeeded(av.imageUrl),
            }))),
            Promise.all(userAvatars.map(async (av) => ({
                ...av,
                imageUrl: await getSignedUrlIfNeeded(av.imageUrl),
            }))),
        ]);

        res.json({
            success: true,
            templates: templatesSigned,
            userAvatars: userAvatarsSigned,
            total: templatesSigned.length + userAvatarsSigned.length,
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

        const isSuperAdmin = req.user.role === 'superadmin' || req.user.email === 'user@mantram.ai';
        const avatar = await Avatar.create({
            name: name || '',
            imageUrl: finalUrl,
            gender: gender || 'unspecified',
            isTemplate: isSuperAdmin,
            createdBy: req.user._id,
            source: 'upload',
            createdByRole: isSuperAdmin ? 'superadmin' : 'user',
            isPublished: isSuperAdmin
        });

        const signedUrl = await getSignedUrlIfNeeded(avatar.imageUrl);
        res.json({
            success: true,
            avatar: {
                ...avatar.toObject(),
                imageUrl: signedUrl
            }
        });
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

function sanitizeScrapedText(text) {
    if (!text) return '';
    const patterns = [
        /free\s+delivery/gi,
        /free\s+shipping/gi,
        /secure\s+checkout/gi,
        /satisfaction\s+guaranteed/gi,
        /easy\s+returns/gi,
        /30-day\s+money\s+back/gi,
        /money\s+back\s+guarantee/gi,
        /add\s+to\s+cart/gi,
        /buy\s+now/gi,
        /checkout/gi,
        /payment\s+methods/gi,
        /visa,\s+mastercard,\s+paypal/gi,
        /shipping\s+rates/gi,
        /track\s+order/gi,
        /customer\s+support/gi,
        /trust\s+badge/gi,
        /certified/gi,
    ];
    let sanitized = text;
    for (const rx of patterns) {
        sanitized = sanitized.replace(rx, '');
    }
    return sanitized.replace(/\n\s*\n+/g, '\n').trim();
}

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
            productText: sanitizeScrapedText(scrapedProductText),
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

        const selectedModel = parsedSettings.model || 'seedance-2.0';
        console.log(`[UGC Build Prompt] Building with ${imageUrls.length} images, model=${selectedModel}...`);

        const promptState = await ugcPromptBuilderNode({
            brandId,
            userId: req.user._id,
            productData: parsedProduct,
            settings: parsedSettings,
            imageUrls,
            selectedModel, // ← model-aware routing
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
router.post('/ugc-pro/generate', protect, requireCredits('ugcProGenerate'), aiGenerationLimiter, async (req, res) => {
    try {
        const {
            brandId, productData, settings,
            avatarUrl, productImageUrls: bodyProductImgUrls,
            prebuiltPrompt,
        } = req.body;

        // Retrieve cast names to pass down as custom character names for prompt sanitization
        let customCharacterNames = [];
        try {
            const query = req.user.role === 'superadmin' ? { brandId } : { brandId, userId: req.user._id };
            const brandCast = await Cast.find(query).lean();
            customCharacterNames = brandCast.map(c => c.name);
            console.log(`[UGC Generate] Loaded ${customCharacterNames.length} cast names:`, customCharacterNames);
        } catch (castErr) {
            console.error('Failed to retrieve brand cast:', castErr.message);
        }

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

        // Extract parameters early to avoid temporal dead zone / reference errors
        const selectedModel = parsedSettings.model || 'seedance-2.0';
        const duration = parseInt(parsedSettings.duration || 8);
        const aspectRatio = parsedSettings.aspectRatio || '9:16';
        const quality = parsedSettings.quality || 'high';
        const resolution = parsedSettings.resolution || '720p';

        let prompt = prebuiltPrompt;
        
        if (!prompt || !prompt.trim()) {
            // Build model-aware UGC prompt via MCoT node
            console.log(`[UGC Generate] No prebuilt prompt provided, building one...`);
            const promptState = await ugcPromptBuilderNode({
                brandId,
                userId: req.user._id,
                productData: parsedProduct,
                settings: parsedSettings,
                imageUrls,
                selectedModel, // ← model-aware routing inside the node
            });
            prompt = promptState.backendPrompt;
        } else {
            console.log(`[UGC Generate] Using explicitly provided prebuilt prompt (${prompt.length} chars)`);
        }

        console.log(`[UGC Generate] Final prompt @image check — @image1: ${prompt.includes('@image1')}, @image2: ${prompt.includes('@image2')}`);
        console.log(`[UGC Generate] Submitting — ${duration}s, model=${selectedModel}, ${imageUrls.length} images, prompt ${prompt.split(/\s+/).length}w`);

        const isLongForm = ((selectedModel === 'gemini-flash' || selectedModel === 'gemini-omni-flash') && duration > 10) ||
                           ((selectedModel === 'seedance-2.0' || selectedModel === 'seedance-2.0-fast' || selectedModel === 'seedance-2.0-mini') && duration > 15);

        if (isLongForm) {
            console.log(`[UGC Generate] Routing to LONG-FORM generation: duration=${duration}s, model=${selectedModel}`);
            const allRefImages = (selectedModel === 'gemini-flash' || selectedModel === 'gemini-omni-flash') ? imageUrls.slice(0, 7) : imageUrls.slice(0, 9);
            const longFormRefs = allRefImages.map((url, idx) => ({
                url,
                role: idx === 0 ? 'avatar' : 'product'
            }));

            // Create temporary/skeleton project first so startStoryboardLongForm can auto-persist to it
            const project = await VideoProject.create({
                user: req.user._id,
                brand: brandId,
                studioMode: 'ugc-pro',
                status: 'generating',
                script: prompt,
                backendPrompt: prompt,
                input: { images: imageUrls.map(url => ({ url, source: 'existing' })), productData: parsedProduct, avatarNames: customCharacterNames },
                generation: {
                    provider: 'atlascloud',
                    model: selectedModel,
                    language: parsedSettings.language || 'English',
                    bgmPreset: parsedSettings.bgmPreset || req.body.bgmPreset || 'cinematic',
                    duration,
                    aspectRatio,
                    resolution,
                    progress: 0,
                    status: 'GENERATING'
                }
            });

            const jobId = startStoryboardLongForm({
                projectId: project._id,
                userId: req.user._id,
                imageUrl: imageUrls[0] || null,
                firstFrameUrl: imageUrls[0] || null,
                videoPrompt: prompt,
                totalDuration: duration,
                format: aspectRatio,
                resolution,
                referenceImages: longFormRefs,
                model: selectedModel,
                qualityMode: quality === 'high' ? 'quality' : 'fast',
                voiceoverScript: '', // Will run UGC voiceover pipeline post-generation
                voiceoverLanguage: parsedSettings.language || 'English',
                bgmPreset: parsedSettings.bgmPreset || req.body.bgmPreset || 'cinematic',
                avatarNames: customCharacterNames,
            });

            // Update project with jobId
            project.generation.taskId = jobId;
            project.generation.requestId = jobId;
            project.generation.falRequestId = jobId;
            project.storyboard = {
                longFormJobId: jobId,
                status: 'animating',
                totalDuration: duration,
            };
            await project.save();

            return res.json({
                success: true,
                projectId: project._id,
                requestId: jobId,
                provider: 'atlascloud',
                model: selectedModel,
                prompt,
                imageCount: imageUrls.length,
                duration,
                aspectRatio,
            });
        }

        let genResult;
        let usedProvider;

        if (selectedModel === 'seedance-2.0' || selectedModel === 'seedance-2.0-fast' || selectedModel === 'seedance-2.0-mini' || selectedModel === 'veo-3.1-lite') {
            // Atlas Cloud R2V path — ALL images as references (avatar + product)
            const allRefImages = imageUrls.slice(0, 9);
            console.log(`[UGC Generate] Seedance R2V: ${allRefImages.length} reference images`);
            genResult = await submitAtlasCloudVideoGeneration({
                model: selectedModel,
                prompt,
                imageUrl: null,
                duration,
                aspectRatio,
                qualityMode: quality,
                generateAudio: true,
                referenceImages: allRefImages,
                customCharacterNames,
            });
            usedProvider = 'atlascloud';

        } else if (selectedModel === 'gemini-flash' || selectedModel === 'gemini-omni-flash') {
            // Gemini Omni Flash: pass ALL images as referenceImages (up to 7)
            // @image1 = avatar (first), @image2-7 = product angles
            // submitGeminiFlashVideoGeneration handles: imageUrl[0] → first, rest → refs
            const allRefImages = imageUrls.slice(0, 7);
            console.log(`[UGC Generate] Gemini Flash I2V: ${allRefImages.length} images (@image1=avatar, @image2+=product)`);
            const result = await submitVideoGeneration({
                model: selectedModel,
                prompt,
                imageUrl: allRefImages[0] || null,      // avatar as primary firstFrame
                duration: Math.min(duration, 10),        // Gemini Flash max = 10s per segment
                resolution,
                aspectRatio,
                generateAudio: false,                    // Gemini Flash: no native audio in developer tier
                referenceImages: allRefImages.slice(1),  // product images as additional refs
                customCharacterNames,
            });
            genResult = { taskId: result.requestId, _payload: result._atlasCloudPayload };
            usedProvider = result.provider || 'atlascloud';

        } else {
            // Kling / Veo / other models via falClient submitVideoGeneration
            const allRefImages = imageUrls.slice(0, 9);
            console.log(`[UGC Generate] R2V mode (${selectedModel}): ${allRefImages.length} reference images`);
            const result = await submitVideoGeneration({
                model: selectedModel,
                prompt,
                imageUrl: null,
                duration,
                resolution,
                aspectRatio,
                generateAudio: true,
                referenceImages: allRefImages,
                customCharacterNames,
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
                language: parsedSettings.language || 'English',
                bgmPreset: parsedSettings.bgmPreset || req.body.bgmPreset || 'cinematic',
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
// Poll Atlas Cloud status, mirror to S3, trigger voiceover pipeline
router.get('/ugc-pro/status/:requestId', protect, async (req, res) => {
    try {
        const { requestId } = req.params;

        // Guard against stale frontend state
        if (!requestId || requestId === 'undefined' || requestId === 'null') {
            return res.json({ success: true, status: 'FAILED', error: 'Invalid request ID' });
        }

        const project = await VideoProject.findOne({
            $or: [{ 'generation.falRequestId': requestId }, { 'generation.requestId': requestId }, { 'generation.taskId': requestId }]
        });

        if (requestId.startsWith('sb-lf-')) {
            const jobStatus = getStoryboardLongFormJobStatus(requestId);
            if (jobStatus) {
                if (jobStatus.status === 'FAILED') {
                    if (project) {
                        await VideoProject.findByIdAndUpdate(project._id, {
                            'generation.status': 'FAILED',
                            'generation.error': jobStatus.error || 'Long-form generation failed',
                            status: 'failed'
                        });
                    }
                    return res.json({
                        success: true,
                        status: 'FAILED',
                        error: jobStatus.error || 'Long-form generation failed',
                        progress: jobStatus.progress
                    });
                }
                if (jobStatus.status === 'COMPLETED') {
                    let finalVideoUrl = jobStatus.videoUrl;
                    try {
                        const s3VideoUrl = await ensureS3Url(finalVideoUrl, `ugc-pro/gen-video-${Date.now()}.mp4`);
                        if (s3VideoUrl) finalVideoUrl = s3VideoUrl;
                    } catch (mirrorErr) {
                        console.warn(`[UGC Pro Status] S3 mirror failed: ${mirrorErr.message}`);
                    }

                    const updatePayload = {
                        'generation.progress': 100,
                        'generation.status': 'COMPLETED',
                        'generation.videoUrl': finalVideoUrl,
                        status: 'done',
                        finalVideoUrl
                    };

                    const updatedProject = await VideoProject.findOneAndUpdate(
                        { _id: project._id },
                        { $set: updatePayload },
                        { returnDocument: 'after' }
                    );

                    // Trigger Voiceover pipeline if needed
                    if (updatedProject && updatedProject.generation?.language && !updatedProject.generation?.voiceoverStatus) {
                        console.log(`🎤 [TTS] Triggering UGC Pro voiceover pipeline for project ${updatedProject._id} (lang: ${updatedProject.generation.language})`);
                        addVoiceoverToProject(updatedProject).catch(e => console.error(`🎤 [TTS] UGC Pro voiceover failed: ${e.message}`));
                    }

                    return res.json({
                        success: true,
                        status: 'COMPLETED',
                        videoUrl: finalVideoUrl,
                        progress: 100
                    });
                }
                // Still in progress
                if (project) {
                    await VideoProject.findByIdAndUpdate(project._id, {
                        'generation.progress': jobStatus.progress || 10,
                        'generation.status': 'GENERATING'
                    });
                }
                return res.json({
                    success: true,
                    status: 'IN_PROGRESS',
                    progress: jobStatus.progress || 10,
                    phase: jobStatus.phase,
                    phaseLabel: jobStatus.phaseLabel,
                    detail: jobStatus.detail
                });
            } else {
                // Not in memory
                if (project && project.status === 'done' && project.finalVideoUrl) {
                    return res.json({
                        success: true,
                        status: 'COMPLETED',
                        videoUrl: project.finalVideoUrl,
                        progress: 100
                    });
                }
                if (project && project.status === 'failed') {
                    return res.json({
                        success: true,
                        status: 'FAILED',
                        error: project.generation?.error || 'Failed',
                        progress: project.generation?.progress || 0
                    });
                }
                return res.json({
                    success: true,
                    status: 'IN_PROGRESS',
                    progress: project?.generation?.progress || 10
                });
            }
        }

        const provider = project?.generation?.provider || 'atlascloud';

        const result = await getUnifiedGenerationStatus(provider, requestId, project?.generation?.statusUrl, project?.generation?.resultUrl);
        if (!result) return res.json({ success: true, status: 'IN_PROGRESS', progress: 10 });

        // Mirror completed videos to S3 (prevent provider URL expiry)
        if (result.status === 'COMPLETED' && result.videoUrl) {
            try {
                const s3VideoUrl = await ensureS3Url(result.videoUrl, `ugc-pro/gen-video-${Date.now()}.mp4`);
                if (s3VideoUrl) result.videoUrl = s3VideoUrl;
            } catch (mirrorErr) {
                console.warn(`[UGC Pro Status] S3 mirror failed: ${mirrorErr.message}`);
            }
        }

        // Update DB history
        const updatePayload = {
            'generation.progress': result.progress || 0,
            'generation.status': result.status === 'COMPLETED' ? 'COMPLETED' : (result.status === 'FAILED' ? 'FAILED' : 'GENERATING')
        };
        if (result.videoUrl) updatePayload['generation.videoUrl'] = result.videoUrl;
        if (result.error) updatePayload['generation.error'] = result.error;
        if (result.status === 'COMPLETED' || result.status === 'FAILED') {
            updatePayload.status = result.status === 'COMPLETED' ? 'done' : 'failed';
        }
        if (result.status === 'COMPLETED' && result.videoUrl) {
            updatePayload.finalVideoUrl = result.videoUrl;
        }

        const updatedProject = await VideoProject.findOneAndUpdate(
            { 'generation.requestId': requestId, user: req.user._id, studioMode: 'ugc-pro' },
            { $set: updatePayload },
            { returnDocument: 'after' }
        ).catch(e => { console.warn('[UGC Pro Status] DB update failed:', e.message); return null; });

        // 🎤 Trigger async voiceover pipeline for completed videos
        if (result.status === 'COMPLETED' && updatedProject) {
            console.log(`[UGC Pro Status] ✅ DB updated: project=${updatedProject._id}, status=${updatedProject.status}`);
            if (updatedProject.generation?.language &&
                !updatedProject.generation?.voiceoverStatus) {
                console.log(`🎤 [TTS] Triggering UGC Pro voiceover pipeline for project ${updatedProject._id} (lang: ${updatedProject.generation.language})`);
                addVoiceoverToProject(updatedProject).catch(e => console.error(`🎤 [TTS] UGC Pro voiceover failed: ${e.message}`));
            }
        }

        res.json({
            success: true,
            status: result.status,
            progress: result.progress,
            videoUrl: result.videoUrl || null,
            error: result.error || null,
        });
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

        // Retrieve cast names to pass down as custom character names for prompt sanitization
        let customCharacterNames = [];
        try {
            const query = req.user.role === 'superadmin' ? { brandId } : { brandId, userId: req.user._id };
            const brandCast = await Cast.find(query).lean();
            customCharacterNames = brandCast.map(c => c.name);
            console.log(`[Q-Ads Generate] Loaded ${customCharacterNames.length} cast names:`, customCharacterNames);
        } catch (castErr) {
            console.error('Failed to retrieve brand cast:', castErr.message);
        }

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

        const selectedModel = parsedSettings.model || 'seedance-2.0';

        const genResult = await submitAtlasCloudVideoGeneration({
            model: selectedModel,
            prompt,
            imageUrl: imageUrls[0] || null,
            duration, aspectRatio, qualityMode: quality, generateAudio: true,
            referenceImages: [...avatarFaceRefs, ...imageUrls.slice(1)],
            imageRole: resolvedImageRole,
            customCharacterNames,
        });

        // Persist as VideoProject
        const project = await VideoProject.create({
            user: req.user._id, brand: brandId, studioMode: 'q-ads', mode: 'image-to-video', status: 'generating',
            title: `Q-Ad: ${parsedProduct.productName || categoryId}`,
            backendPrompt: prompt,
            input: {
                brief: `Q-Ads [${categoryId}]: ${parsedProduct.productName || 'product'}`,
                images: imageUrls.map((u, i) => ({ url: u, source: 'upload', label: i === 0 ? 'avatar' : `product-${i}` })),
                avatarNames: customCharacterNames,
            },
            generation: {
                provider: 'atlascloud', model: selectedModel,
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
        const project = await VideoProject.findOne({
            $or: [{ 'generation.falRequestId': req.params.requestId }, { 'generation.requestId': req.params.requestId }, { 'generation.taskId': req.params.requestId }]
        });
        const provider = project?.generation?.provider || 'atlascloud';

        const result = await getUnifiedGenerationStatus(provider, req.params.requestId, project?.generation?.statusUrl, project?.generation?.resultUrl);

        // 🛡️ SAFE MODE PIVOT: If Seedance blocked due to real person face detection,
        // automatically resubmit without the avatar image (product-only mode)
        if (result && result.safetyTriggered && result.retryable) {
            const project = await VideoProject.findOne({
                'generation.requestId': req.params.requestId, user: req.user._id, studioMode: 'q-ads'
            });

            if (project && !project.generation?.safeModeRetried) {
                console.log(`🛡️ [Q-Ads Safe Mode] Safety triggered — stripping avatar and resubmitting product-only...`);

                // Retrieve cast names to pass down as custom character names for prompt sanitization during safe mode retry
                let customCharacterNames = [];
                if (project.brand) {
                    try {
                        const query = req.user.role === 'superadmin' ? { brandId: project.brand } : { brandId: project.brand, userId: req.user._id };
                        const brandCast = await Cast.find(query).lean();
                        customCharacterNames = brandCast.map(c => c.name);
                        console.log(`[Q-Ads Safe Mode] Loaded ${customCharacterNames.length} cast names for retry:`, customCharacterNames);
                    } catch (castErr) {
                        console.error('[Q-Ads Status] Failed to retrieve brand cast:', castErr.message);
                    }
                }

                // Get original images; drop the first one (avatar)
                const originalImages = (project.input?.images || []).map(i => i.url).filter(Boolean);
                const productOnlyImages = originalImages.length > 1 ? originalImages.slice(1) : [];

                try {
                    const retryResult = await submitAtlasCloudVideoGeneration({
                        model: project.generation?.model || 'seedance-2.0',
                        prompt: project.backendPrompt || project.script,
                        imageUrl: productOnlyImages[0] || null,
                        duration: project.generation?.duration || 5,
                        aspectRatio: project.generation?.aspectRatio || '9:16',
                        qualityMode: 'high',
                        generateAudio: true,
                        referenceImages: productOnlyImages.slice(1),
                        customCharacterNames,
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

// ═════════════════════════════════════════════════════════════════════════════
// Q-Ads V2 — Regional Language Voiceover Pipeline (TTS + FFmpeg Mux)
// ═════════════════════════════════════════════════════════════════════════════

// Language → TTS code mapping (Indian + Global)
const QADS_LANG_TO_CODE = {
    'Hindi': 'hi-IN', 'Tamil': 'ta-IN', 'Telugu': 'te-IN', 'Bengali': 'bn-IN',
    'Marathi': 'mr-IN', 'Gujarati': 'gu-IN', 'Kannada': 'kn-IN', 'Malayalam': 'ml-IN',
    'Punjabi': 'pa-IN', 'English': 'en-IN', 'Arabic': 'ar-SA', 'Urdu': 'ur-PK',
    'French': 'fr-FR', 'Spanish': 'es-ES', 'Portuguese': 'pt-BR', 'Japanese': 'ja-JP',
    'Korean': 'ko-KR', 'Chinese': 'zh-CN', 'German': 'de-DE', 'Italian': 'it-IT',
    'Turkish': 'tr-TR', 'Thai': 'th-TH',
};

const SARVAM_SUPPORTED = new Set(['hi-IN', 'ta-IN', 'te-IN', 'bn-IN', 'mr-IN', 'gu-IN', 'kn-IN', 'ml-IN', 'pa-IN', 'en-IN']);

// OpenAI TTS: auto-select best voice per language family for natural delivery
const OPENAI_VOICE_BY_LANG = {
    'ar-SA': 'coral',   // Coral — warm, rich timbre suits Arabic
    'ur-PK': 'coral',   // Coral — similar tonal quality for Urdu
    'fr-FR': 'sage',    // Sage — smooth, sophisticated for European
    'es-ES': 'nova',    // Nova — clear, expressive for Spanish
    'pt-BR': 'nova',    // Nova — energetic for Brazilian Portuguese
    'ja-JP': 'shimmer', // Shimmer — precise, clean for Japanese
    'ko-KR': 'shimmer', // Shimmer — crisp for Korean
    'zh-CN': 'alloy',   // Alloy — balanced for Mandarin
    'de-DE': 'onyx',    // Onyx — authoritative for German
    'it-IT': 'sage',    // Sage — warm, melodic for Italian
    'tr-TR': 'echo',    // Echo — natural for Turkish
    'th-TH': 'nova',    // Nova — versatile for Thai
    'en-IN': 'nova',    // Nova — fallback if Sarvam fails
};

// Auto-select best voice per language
const QADS_AUTO_VOICE = {
    'hi-IN': { speaker: 'anushka', name: 'Anushka' },
    'ta-IN': { speaker: 'meera',   name: 'Meera (Tamil)' },
    'te-IN': { speaker: 'meera',   name: 'Meera (Telugu)' },
    'bn-IN': { speaker: 'meera',   name: 'Meera (Bengali)' },
    'mr-IN': { speaker: 'meera',   name: 'Meera (Marathi)' },
    'gu-IN': { speaker: 'meera',   name: 'Meera (Gujarati)' },
    'kn-IN': { speaker: 'meera',   name: 'Meera (Kannada)' },
    'ml-IN': { speaker: 'meera',   name: 'Meera (Malayalam)' },
    'pa-IN': { speaker: 'meera',   name: 'Meera (Punjabi)' },
    'en-IN': { speaker: 'anushka', name: 'Anushka (English)' },
};

/**
 * Extract DIALOGUE lines from a Q-Ads / UGC prompt.
 * Supports: DIALOGUE [emotion]: "text" (new) and DIALOGUE: "text" (legacy)
 * Returns: [{ text: string, emotion: string }]
 */
function extractDialogueLines(promptText) {
    if (!promptText) return [];
    // Match DIALOGUE [emotion]: "text" (new) or DIALOGUE: "text" (legacy)
    const matches = [...promptText.matchAll(/DIALOGUE\s*(?:\[([^\]]+)\])?\s*:\s*["""\u201C\u201D]([^"""\u201C\u201D]+)["""\u201C\u201D]/gi)];
    const lines = matches.map(m => ({
        text: m[2].trim(),
        emotion: (m[1] || 'neutral').trim().split(',')[0].trim().toLowerCase(),
    })).filter(l => l.text.length > 3);
    if (lines.length > 0) {
        console.log(`🎤 [TTS] Extracted ${lines.length} dialogue line(s) with emotions: ${lines.map(l => l.emotion).join(', ')}`);
    }
    return lines;
}

/**
 * Generate TTS audio for dialogue lines via Sarvam (Indian) or OpenAI (global).
 * Now supports emotion-tagged dialogue for natural, emotional delivery.
 * Returns S3 URL of the audio file, or null on failure.
 */
async function generateQAdsTTS(dialogueLines, language) {
    if (!dialogueLines || dialogueLines.length === 0) return null;

    const langCode = QADS_LANG_TO_CODE[language] || 'en-IN';
    const isSarvamLang = SARVAM_SUPPORTED.has(langCode);

    // Normalize: support both new { text, emotion } and legacy string formats
    const normalizedLines = dialogueLines.map(l =>
        typeof l === 'string' ? { text: l, emotion: 'neutral' } : l
    );

    const fullScript = normalizedLines.map(l => l.text).join('. ');
    const dominantEmotion = normalizedLines[0]?.emotion || 'neutral';
    const provider = isSarvamLang ? 'Gemini' : 'OpenAI';

    console.log(`🎤 [TTS] Generating voiceover: lang=${language} (${langCode}), provider=${provider}, emotion=${dominantEmotion}, script=${fullScript.substring(0, 100)}...`);

    try {
        if (isSarvamLang) {
            return await generateGeminiTTSInternal(fullScript, language, langCode, dominantEmotion);
        } else {
            // All non-Indian languages → OpenAI gpt-4o-mini-tts with full emotional steering
            return await generateOpenAITTS(fullScript, dominantEmotion, language, langCode);
        }
    } catch (e) {
        console.error(`❌ [TTS] Voiceover generation failed (${provider}): ${e.message}`);
        // If Gemini fails, try OpenAI as fallback
        if (isSarvamLang) {
            try {
                console.log(`🔄 [TTS] Gemini failed, trying OpenAI fallback for ${language}...`);
                return await generateOpenAITTS(fullScript, dominantEmotion, language, langCode);
            } catch (fallbackErr) {
                console.error(`❌ [TTS] OpenAI fallback also failed: ${fallbackErr.message}`);
            }
        }
        return null;
    }
}

/**
 * OpenAI gpt-4o-mini-tts — Emotional, natural TTS for global languages.
 * Uses the `instructions` parameter for emotion-steerable voice delivery.
 * Voice is auto-selected per language family for optimal native quality.
 */
async function generateOpenAITTS(text, emotion, language, langCode) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) { console.warn('🎤 [TTS] OpenAI API key not configured — skipping'); return null; }

    // Emotion → voice instruction mapping (director-grade delivery notes)
    const EMOTION_INSTRUCTIONS = {
        excited:    'Speak with genuine excitement and high energy. Your voice rises naturally with enthusiasm. Fast-paced and infectious, like discovering something amazing you must share.',
        warm:       'Speak warmly and conversationally, like talking to a close friend. Gentle, intimate tone with natural pauses. A slight smile in your voice.',
        urgent:     'Speak with urgency and conviction. Direct, persuasive, slightly faster pace. Emphasize key action words. Create a sense of "you need this NOW."',
        calm:       'Speak calmly and authoritatively. Measured pace, confident tone, clear enunciation. Like a trusted expert explaining with quiet confidence.',
        playful:    'Speak playfully with a smile in your voice. Light, teasing energy with natural laughter undertones. Quick, bouncy delivery.',
        dramatic:   'Speak dramatically with emotional weight. Slow, deliberate pauses between phrases. Build tension and let words land with gravity.',
        curious:    'Speak with genuine curiosity and wonder. Rising intonation on key phrases. Draw the listener in with an inviting, questioning tone.',
        confident:  'Speak with strong confidence and authority. Steady, unwavering, commanding attention. No hesitation. Bold and direct.',
        mysterious: 'Speak in a low, intriguing tone. Slight whisper quality on key phrases. Draw the listener in with suspense.',
        empathetic: 'Speak with deep empathy and understanding. Soft, caring, emotionally connected. Like you truly understand their pain point.',
        neutral:    'Speak naturally and clearly with an engaging, professional tone. Warm but not overly emotional.',
    };

    const instruction = EMOTION_INSTRUCTIONS[emotion] || EMOTION_INSTRUCTIONS.neutral;
    const voice = OPENAI_VOICE_BY_LANG[langCode] || 'nova';
    const langNote = language !== 'English' ? ` Speak fluently in ${language} with an authentic native accent and natural rhythm.` : '';

    console.log(`🎤 [TTS] OpenAI: voice=${voice}, emotion=${emotion}, lang=${language}, text=${text.length} chars`);

    const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini-tts',
            voice,
            input: text.substring(0, 4000),
            instructions: `${instruction}${langNote} This is a voiceover for a cinematic video advertisement. Deliver with natural pacing and breath.`,
            response_format: 'mp3',
        }),
    });

    if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        throw new Error(`OpenAI TTS failed (${response.status}): ${errBody.substring(0, 200)}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const s3Key = `qads/voiceover/${Date.now()}-${Math.random().toString(36).substring(7)}.mp3`;
    const audioUrl = await uploadToS3(buffer, s3Key, 'audio/mpeg');
    console.log(`✅ [TTS] OpenAI audio uploaded: ${audioUrl.substring(0, 70)}`);
    return audioUrl;
}

/**
 * Internal Gemini TTS call for regional languages.
 * Emotion tags drive the vocal delivery characteristics for Indian languages.
 */
async function generateGeminiTTSInternal(text, language, langCode, emotion = 'neutral') {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) { console.warn('🎤 [TTS] Gemini API key not configured — skipping'); return null; }

    console.log(`🎤 [TTS] Gemini: voice=Aoede, lang=${language} (${langCode}), emotion=${emotion}, text=${text.length} chars`);

    const promptText = `Please speak the following text fluently in ${language} with a ${emotion} tone:\n\n${text.substring(0, 2000)}`;

    const ttsResp = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }],
            generationConfig: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } }
                }
            }
        }),
    });

    if (!ttsResp.ok) {
        const errBody = await ttsResp.text().catch(() => '');
        throw new Error(`Gemini TTS failed (${ttsResp.status}): ${errBody.substring(0, 200)}`);
    }

    const ttsData = await ttsResp.json();
    const audioPart = ttsData.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.mimeType?.startsWith('audio/'));
    
    if (!audioPart?.inlineData?.data) {
        throw new Error('No audio in Gemini TTS response');
    }

    const buffer = Buffer.from(audioPart.inlineData.data, 'base64');
    const mimeType = audioPart.inlineData.mimeType || 'audio/wav';
    const ext = mimeType.includes('mp3') ? 'mp3' : 'wav';
    const s3Key = `qads/voiceover/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
    const audioUrl = await uploadToS3(buffer, s3Key, mimeType);
    
    console.log(`✅ [TTS] Gemini audio uploaded: ${audioUrl.substring(0, 70)}`);
    return audioUrl;
}

/**
 * Mux video + audio using FFmpeg → single MP4 with embedded voiceover.
 * Downloads both files, runs FFmpeg, uploads result to S3.
 */
async function muxVideoWithAudio(videoUrl, audioUrl = null, bgmUrl = null) {
    const tmpDir = os.tmpdir();
    const id = Date.now() + '-' + Math.random().toString(36).substring(7);
    const videoPath = path.join(tmpDir, `qads-video-${id}.mp4`);
    const audioPath = audioUrl ? path.join(tmpDir, `qads-audio-${id}.wav`) : null;
    const bgmPath = bgmUrl ? path.join(tmpDir, `qads-bgm-${id}.mp3`) : null;
    const outputPath = path.join(tmpDir, `qads-muxed-${id}.mp4`);

    try {
        console.log(`🎬 [FFmpeg] Downloading video for muxing...`);
        const videoResp = await fetch(videoUrl);
        if (!videoResp.ok) throw new Error(`Failed to download video: ${videoResp.status}`);
        fs.writeFileSync(videoPath, Buffer.from(await videoResp.arrayBuffer()));

        if (audioUrl) {
            const audioResp = await fetch(audioUrl);
            if (audioResp.ok) fs.writeFileSync(audioPath, Buffer.from(await audioResp.arrayBuffer()));
            else console.warn(`⚠️ [FFmpeg] Failed to download voiceover.`);
        }

        if (bgmUrl) {
            console.log(`🎵 [FFmpeg] Downloading background music...`);
            const bgmResp = await fetch(bgmUrl);
            if (bgmResp.ok) fs.writeFileSync(bgmPath, Buffer.from(await bgmResp.arrayBuffer()));
            else console.warn(`⚠️ [FFmpeg] Failed to download BGM, proceeding without it.`);
        }

        // Probe for native audio stream
        let hasNativeAudio = false;
        try {
            const { stdout } = await execFileAsync('ffprobe', [
                '-v', 'quiet',
                '-select_streams', 'a',
                '-show_entries', 'stream=codec_type',
                '-of', 'csv=p=0',
                videoPath
            ]);
            hasNativeAudio = stdout.trim().includes('audio');
            console.log(`🎬 [FFmpeg] Probe result hasNativeAudio: ${hasNativeAudio}`);
        } catch (probeErr) {
            console.warn(`⚠️ [FFmpeg] ffprobe failed (assuming no native audio):`, probeErr.message);
        }

        const ffmpegArgs = ['-y', '-i', videoPath];

        if (hasNativeAudio) {
            // Video has native audio. Preserve it and mix with voiceover if available.
            if (audioUrl && fs.existsSync(audioPath)) {
                ffmpegArgs.push('-i', audioPath);
                ffmpegArgs.push('-filter_complex', '[0:a]volume=0.8[bg];[1:a]volume=1.5[vo];[bg][vo]amix=inputs=2:duration=longest[aout]');
                ffmpegArgs.push('-map', '0:v:0', '-map', '[aout]');
            } else {
                console.log(`🎬 [FFmpeg] Preserving native audio, no voiceover to mix.`);
                return videoUrl;
            }
        } else {
            // Video has no native audio (silent)
            if (audioUrl && fs.existsSync(audioPath) && bgmUrl && fs.existsSync(bgmPath)) {
                // Both Voiceover and BGM
                ffmpegArgs.push('-i', audioPath);
                ffmpegArgs.push('-stream_loop', '-1', '-i', bgmPath);
                ffmpegArgs.push('-filter_complex', '[1:a]volume=1.5[vo];[2:a]volume=0.15[bgm];[vo][bgm]amix=inputs=2:duration=longest[aout]');
                ffmpegArgs.push('-map', '0:v:0', '-map', '[aout]');
            } else if (audioUrl && fs.existsSync(audioPath)) {
                // Only Voiceover
                ffmpegArgs.push('-i', audioPath);
                ffmpegArgs.push('-map', '0:v:0', '-map', '1:a:0');
                ffmpegArgs.push('-filter:a', 'volume=1.5');
            } else if (bgmUrl && fs.existsSync(bgmPath)) {
                // Only BGM
                ffmpegArgs.push('-stream_loop', '-1', '-i', bgmPath);
                ffmpegArgs.push('-map', '0:v:0', '-map', '1:a:0');
                ffmpegArgs.push('-filter:a', 'volume=0.20');
            } else {
                // No audio to mux, just return the original video URL
                return videoUrl;
            }
        }

        ffmpegArgs.push('-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', outputPath);

        await execFileAsync('ffmpeg', ffmpegArgs, { timeout: 120000 });

        const muxedBuffer = fs.readFileSync(outputPath);
        const s3Key = `qads/muxed/${Date.now()}-${Math.random().toString(36).substring(7)}.mp4`;
        const muxedUrl = await uploadToS3(muxedBuffer, s3Key, 'video/mp4');
        console.log(`✅ [FFmpeg] Muxed video uploaded: ${muxedUrl.substring(0, 70)}`);
        return muxedUrl;
    } catch (e) {
        console.error(`❌ [FFmpeg] Mux failed: ${e.message}`);
        return null; // Caller will use the original video without voiceover
    } finally {
        // Clean up temp files
        [videoPath, audioPath, bgmPath, outputPath].forEach(f => { if (f) { try { fs.unlinkSync(f); } catch {} } });
    }
}

/**
 * Async voiceover pipeline — runs AFTER video generation completes.
 * 1. Extracts DIALOGUE lines from the prompt
 * 2. Generates TTS audio in the selected language
 * 3. Muxes audio into the video via FFmpeg
 * 4. Updates VideoProject with the final muxed URL
 */
async function addVoiceoverToProject(project) {
    try {
        const language = project.generation?.language || 'English';
        const prompt = project.backendPrompt || '';
        const videoUrl = project.generation?.videoUrl || project.finalVideoUrl;
        const bgmPreset = project.generation?.bgmPreset || project.advancedConfig?.bgmPreset || null;

        if (!videoUrl) { console.warn('🎤 [TTS] No video URL — skipping voiceover'); return; }

        // Placeholder royalty-free URLs for BGM presets
        const BGM_URLS = {
            upbeat: 'https://cdn.pixabay.com/audio/2022/01/18/audio_d0a13f69d2.mp3', // Corporate Upbeat
            cinematic: 'https://cdn.pixabay.com/audio/2022/02/07/audio_0319dd632e.mp3', // Epic Cinematic
            emotional: 'https://cdn.pixabay.com/audio/2022/10/25/audio_27ab966bc7.mp3', // Emotional Piano
            energetic: 'https://cdn.pixabay.com/audio/2023/04/27/audio_f5353ee5c0.mp3', // Energetic Pop
            minimal: 'https://cdn.pixabay.com/audio/2022/03/15/audio_0710609b5a.mp3', // Minimal Tech
        };

        const bgmUrl = bgmPreset ? BGM_URLS[bgmPreset] : null;

        const dialogueLines = extractDialogueLines(prompt);
        if (dialogueLines.length === 0 && !bgmUrl) {
            console.log(`🎤 [TTS] No DIALOGUE lines and no BGM preset — skipping audio mix`);
            return;
        }

        let audioUrl = project.generation?.voiceoverUrl || null;
        if (!audioUrl && dialogueLines.length > 0) {
            console.log(`🎤 [TTS] Starting voiceover pipeline: ${dialogueLines.length} lines in ${language}`);
            audioUrl = await generateQAdsTTS(dialogueLines, language);
            if (!audioUrl) {
                console.warn(`🎤 [TTS] TTS generation failed — continuing with BGM only (if any)`);
            }
        } else if (audioUrl) {
            console.log(`🎤 [TTS] Using pre-generated audio for lip-sync: ${audioUrl.substring(0, 50)}...`);
        }

        let muxedUrl = null;

        if (project.generation?.model === 'infinitetalk' || project.generation?.requiresInfiniteTalk) {
            console.log(`✅ [TTS] Video generated/lip-synced by InfiniteTalk — audio is natively synced. Bypassing FFmpeg muxing.`);
            muxedUrl = videoUrl; // Audio is already in the video
        } else {
            // Mux audio/BGM into video
            muxedUrl = await muxVideoWithAudio(videoUrl, audioUrl, bgmUrl);
        }
        
        if (muxedUrl) {
            // Update the project with the muxed video
            await VideoProject.findByIdAndUpdate(project._id, {
                $set: {
                    finalVideoUrl: muxedUrl,
                    'generation.videoUrl': muxedUrl,
                    ...(audioUrl ? { 'generation.voiceoverUrl': audioUrl, 'generation.voiceoverStatus': 'done' } : {}),
                },
            });
            console.log(`✅ [TTS] Audio mixed and project updated: ${project._id}`);
        } else {
            // FFmpeg failed — store audio URL separately as fallback
            if (audioUrl) {
                await VideoProject.findByIdAndUpdate(project._id, {
                    $set: {
                        'generation.voiceoverUrl': audioUrl,
                        'generation.voiceoverStatus': 'audio_only',
                    },
                });
                console.warn(`⚠️ [TTS] FFmpeg mux failed — audio stored separately: ${audioUrl.substring(0, 60)}`);
            }
        }
    } catch (e) {
        console.error(`❌ [TTS] Voiceover pipeline error: ${e.message}`);
        try {
            await VideoProject.findByIdAndUpdate(project._id, {
                $set: { 'generation.voiceoverStatus': 'failed' },
            });
        } catch {}
    }
}

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
        
        // Find the project first to see if it has Stage 2 lip-sync required
        let project = await VideoProject.findOne({
            $or: [{ 'generation.falRequestId': requestId }, { 'generation.requestId': requestId }, { 'generation.taskId': requestId }],
            user: req.user._id
        });

        if (!project) {
            console.warn(`[Q-Ads V2 Status] ⚠️ No matching VideoProject found for requestId=${requestId}`);
        }

        let activeTaskId = requestId;
        let isStage2 = false;

        // If we are in Stage 2 (InfiniteTalk), poll that task ID instead!
        if (project?.generation?.infiniteTalkTaskId) {
            activeTaskId = project.generation.infiniteTalkTaskId;
            isStage2 = true;
        }

        const provider = project?.generation?.provider || 'atlascloud';
        
        // Pass the activeTaskId to the unified status function. If stage 2, it's an InfiniteTalk AtlasCloud task.
        const result = await getUnifiedGenerationStatus(
            isStage2 ? 'atlascloud' : provider, 
            activeTaskId, 
            project?.generation?.statusUrl, 
            project?.generation?.resultUrl
        );

        if (!result) return res.json({ success: true, status: 'IN_PROGRESS', progress: isStage2 ? 60 : 10 });

        // Update VideoProject with latest status/videoUrl
        const updatePayload = { 'generation.progress': isStage2 ? Math.max(result.progress || 0, 50) : (result.progress || 0) };
        
        if (result.status === 'COMPLETED' && result.videoUrl) {
            console.log(`[Q-Ads V2] Mirroring video to S3: ${result.videoUrl.substring(0, 80)}...`);
            const s3VideoUrl = await ensureS3Url(result.videoUrl, `qads/gen-video-${Date.now()}.mp4`);
            if (s3VideoUrl) {
                result.videoUrl = s3VideoUrl;
            }
        }

        // --- STAGE 2 INTERCEPT (V2V Lip-Sync) ---
        // If Stage 1 (Cinematic) is completed, but we require InfiniteTalk and haven't started it yet...
        if (!isStage2 && result.status === 'COMPLETED' && project?.generation?.requiresInfiniteTalk) {
            console.log(`🗣️ [Q-Ads V2 Status] Stage 1 (Cinematic) complete. Submitting to InfiniteTalk for V2V lip-sync...`);
            const { submitInfiniteTalkVideoGeneration } = await import('../agents/videoStudio/atlasClient.js');
            
            try {
                const itResult = await submitInfiniteTalkVideoGeneration({
                    prompt: project.backendPrompt || '',
                    videoUrl: result.videoUrl,
                    refAudio: project.generation.voiceoverUrl,
                    duration: project.generation.duration || 5,
                    resolution: '720p',
                });
                
                console.log(`🗣️ [InfiniteTalk] Stage 2 Task queued: ${itResult.taskId}`);
                updatePayload['generation.infiniteTalkTaskId'] = itResult.taskId;
                
                // Override result to keep frontend polling
                result.status = 'IN_PROGRESS';
                result.progress = 50;
                result.videoUrl = null; // hide base video from frontend until lip-sync is done
                isStage2 = true;
            } catch (err) {
                console.error(`❌ [InfiniteTalk] Stage 2 submission failed: ${err.message}`);
                // Proceed with fallback (no lip-sync, FFmpeg audio mix)
                updatePayload['generation.requiresInfiniteTalk'] = false;
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
        const updatedProject = await VideoProject.findOneAndUpdate(
            { $or: [{ 'generation.falRequestId': requestId }, { 'generation.requestId': requestId }, { 'generation.taskId': requestId }], user: req.user._id },
            { $set: updatePayload },
            { returnDocument: 'after' }
        ).catch(e => { console.warn('[Q-Ads V2 Status] DB update failed:', e.message); return null; });
        
        if (result.status === 'COMPLETED' || result.status === 'FAILED') {
            if (updatedProject) {
                console.log(`[Q-Ads V2 Status] ✅ DB updated: project=${updatedProject._id}, status=${updatedProject.status}, videoUrl=${(updatedProject.generation?.videoUrl || '').substring(0, 60)}...`);
                
                // 🎤 Trigger async voiceover pipeline for completed videos
                // Fire-and-forget: the response returns immediately with the raw video.
                // The muxed video (with voiceover) replaces it once TTS+FFmpeg completes.
                if (result.status === 'COMPLETED' && updatedProject.generation?.language && !updatedProject.generation?.voiceoverStatus) {
                    console.log(`🎤 [TTS] Triggering async voiceover pipeline for project ${updatedProject._id} (lang: ${updatedProject.generation.language})`);
                    addVoiceoverToProject(updatedProject).catch(e => console.error(`🎤 [TTS] Background voiceover failed: ${e.message}`));
                }
            } else {
                console.warn(`[Q-Ads V2 Status] ⚠️ No matching VideoProject found for requestId=${requestId} — video will NOT persist in history!`);
            }
        }

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
        // Handle base64 data URIs directly (fallback when S3 upload failed on frontend)
        if (imageUrl.startsWith('data:image/')) {
            const match = imageUrl.match(/^data:(image\/\w+);base64,(.+)$/);
            if (!match) return null;
            return { inlineData: { mimeType: match[1], data: match[2] } };
        }
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

        // Retrieve cast names to pass down as custom character names for prompt sanitization
        let customCharacterNames = [];
        try {
            const query = req.user.role === 'superadmin' ? { brandId } : { brandId, userId: req.user._id };
            const brandCast = await Cast.find(query).lean();
            customCharacterNames = brandCast.map(c => c.name);
            console.log(`[Q-Ads V2 Generate] Loaded ${customCharacterNames.length} cast names:`, customCharacterNames);
        } catch (castErr) {
            console.error('Failed to retrieve brand cast:', castErr.message);
        }

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

        console.log(`[Q-Ads V2] Submitting variant ${variantId} — model=${selectedModel}, ${duration}s, res=${resolution}, lang=${parsedSettings.language || 'English'}, ${imageUrls.length} product images, ${avatarFaceRefs.length} face refs, total refs=${allReferenceImages.length}`);
        if (imageUrls.length === 0) {
            console.warn(`[Q-Ads V2] ⚠️ No product images provided — video model will rely on prompt text only for product appearance`);
        } else {
            imageUrls.forEach((u, i) => console.log(`[Q-Ads V2]   Product image ${i + 1}: ${u.substring(0, 80)}...`));
        }

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

        // ── SYNC TTS GENERATION FOR AUDIO-DRIVEN VIDEO ──
        // Generate TTS audio *before* video generation so we can pass it to the video model
        const dialogueLines = extractDialogueLines(finalPrompt);
        let audioUrl = null;
        if (dialogueLines.length > 0) {
            console.log(`🎤 [Q-Ads V2] Pre-generating TTS for audio-driven video...`);
            audioUrl = await generateQAdsTTS(dialogueLines, parsedSettings.language || 'English');
        }

        let genResult;
        let finalModel = selectedModel;
        
        // We will run InfiniteTalk as a Stage 2 lip-sync pass AFTER the cinematic video is generated.
        const requiresInfiniteTalk = avatarFaceRefs.length > 0 && audioUrl;

        genResult = await submitVideoGeneration({
            prompt:           finalPrompt,
            model:            selectedModel,
            duration,
            aspectRatio,
            resolution,
            qualityMode:      'high',
            generateAudio:    !audioUrl, // disable native audio if we generated TTS
            refAudio:         audioUrl,
            imageUrl:         null,                     // No starting frame, pure R2V
            referenceImages:  finalReferenceImages,     // Avatar + Product(s) → Asset Library
            imageRole:        resolvedV2ImageRole,
            customCharacterNames,
        });

        // Persist as VideoProject for polling
        // NOTE: VideoProject is already imported at top of file (line 21), no dynamic import needed
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
                    brief: req.body.brief || `Q-Ads V2 [${preset?.name || presetId}] ${variantId}`,
                    images: imageUrls.map((u, i) => ({ url: u, source: 'upload', label: `product-${i + 1}` })),
                    avatarUrl: avatarFaceRefs[0] || null, // Save avatarUrl for InfiniteTalk Stage 2
                    avatarNames: customCharacterNames,
                },
                generation: {
                    provider: genResult.provider || 'atlascloud',
                    model: finalModel, // Ensure the selected final model is saved
                    language: parsedSettings.language || 'English',
                    bgmPreset: parsedSettings.bgmPreset || req.body.bgmPreset || 'cinematic',
                    falRequestId: genResult.requestId || genResult.taskId || genResult.falRequestId,
                    taskId: genResult.requestId || genResult.taskId || genResult.falRequestId,
                    requestId: genResult.requestId || genResult.taskId || genResult.falRequestId,
                    duration,
                    aspectRatio,
                    progress: 0,
                    status: 'GENERATING',
                    // Save the pre-generated audio if available
                    voiceoverUrl: audioUrl || '',
                    voiceoverStatus: audioUrl ? 'done' : '',
                    requiresInfiniteTalk, // Flag to trigger Stage 2 Video-to-Video lip-sync
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
// MOTION GRAPHICS STUDIO — Seedance 2 powered logo & asset animation
// ══════════════════════════════════════════════════════════════════════════════

const MG_STYLE_PRESETS = {
    dynamic:   { label: 'Dynamic Motion',  emoji: '⚡', tempHint: 0.9, keywords: 'high-energy, kinetic motion, bold transforms, rapid acceleration, impact frames, chromatic trails, dynamic zoom bursts' },
    elegant:   { label: 'Elegant',         emoji: '✨', tempHint: 0.7, keywords: 'smooth graceful motion, golden particle drift, silky transitions, luxury slow-motion, soft lens flare, refined easing curves' },
    funky:     { label: 'Funky',           emoji: '🎸', tempHint: 1.0, keywords: 'retro glitch pops, saturated color bursts, rhythmic bounce, disco shimmer, organic wobbly deformation, syncopated rhythm' },
    intro:     { label: 'Intro Reveal',    emoji: '🎬', tempHint: 0.8, keywords: 'cinematic logo reveal from darkness, volumetric light build-up, dramatic shadow sweep, majestic emergence, orchestral crescendo feel' },
    outro:     { label: 'Outro / Sign-Off',emoji: '🎭', tempHint: 0.7, keywords: 'peaceful settling, particle dust dispersal, gentle fade to black, brand lockup hold, elegant dissolve, serene closing movement' },
    minimal:   { label: 'Minimal Clean',   emoji: '◻️', tempHint: 0.6, keywords: 'clean precise motion, breathing white space, geometric precision, subtle scale pulse, quiet confidence, restrained elegance' },
    cinematic: { label: 'Cinematic',       emoji: '🎥', tempHint: 0.8, keywords: 'filmic color grade, slow push-in, anamorphic lens flare, cinematic depth of field pull, dramatic lighting contrast, epic scale' },
    glitch:    { label: 'Glitch / Cyber',  emoji: '🌐', tempHint: 0.95,keywords: 'digital glitch distortion, RGB channel split, neon scan lines, cyber grid overlay, data corruption aesthetic, holographic flicker' },
    '3d':      { label: '3D Extrude',      emoji: '🎲', tempHint: 0.8, keywords: '3D extrusion reveal, volumetric depth, perspective rotation, ambient occlusion shadows, material sheen, studio three-point lighting' },
    custom:    { label: 'Custom Style',    emoji: '🎨', tempHint: 0.85, keywords: '' },
};

// ── GET /api/video-studio/motion-graphics/presets ──
router.get('/motion-graphics/presets', protect, async (req, res) => {
    const presets = Object.entries(MG_STYLE_PRESETS).map(([id, p]) => ({ id, ...p }));
    res.json({ success: true, presets });
});

// ── POST /api/video-studio/motion-graphics/analyze ──
// Gemini Vision: deep-read uploaded logo/slides for brand identity signals
router.post('/motion-graphics/analyze', protect, async (req, res) => {
    try {
        const { imageUrls, userBrief } = req.body;
        if (!imageUrls || imageUrls.length === 0) {
            return res.status(400).json({ success: false, error: 'At least one image is required' });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return res.status(500).json({ success: false, error: 'GEMINI_API_KEY not configured' });

        // Load image parts
        const parts = [];
        const labelsList = [];
        for (let i = 0; i < Math.min(imageUrls.length, 4); i++) {
            const part = await fetchImageAsInlineData(imageUrls[i]);
            if (part) {
                parts.push(part);
                labelsList.push(`IMAGE ${i + 1}`);
            }
        }
        if (parts.length === 0) {
            return res.status(400).json({ success: false, error: 'Could not load any of the provided images' });
        }

        const analysisPrompt = `You are a senior Motion Graphics Director with 20 years of experience at top studios.

Analyze the provided brand asset image(s) and return a precise JSON object that will be used to write a creative animation prompt.

${userBrief ? `USER DIRECTION: "${userBrief}"` : ''}
IMAGES PROVIDED: ${labelsList.join(', ')}

Analyze EVERY detail:
1. LOGO GEOMETRY — exact shapes, letterforms, icon elements, symmetry, negative space
2. COLOR PALETTE — exact colors (hex-like descriptions), dominant hue, accent colors, contrast ratio
3. BRAND PERSONALITY — premium/playful/corporate/bold/minimal — infer from visual language
4. TEXT ELEMENTS — fonts present, weight, tracking, style (serif/sans/display/script)
5. COMPOSITION — where is the focal point, visual balance, white space usage
6. ANIMATION POTENTIAL — which elements could move, natural motion direction, recommended entrance/exit

Return ONLY valid JSON in this exact shape:
{
  "logoGeometry": "...",
  "colorPalette": { "primary": "...", "secondary": "...", "accent": "...", "bg": "..." },
  "brandPersonality": "...",
  "textElements": "...",
  "composition": "...",
  "animatableElements": ["element1", "element2"],
  "naturalMotionDirection": "...",
  "recommendedStyle": "dynamic|elegant|funky|intro|outro|minimal|cinematic|glitch|3d",
  "moodKeywords": ["keyword1", "keyword2", "keyword3"],
  "technicalNotes": "..."
}`;

        parts.push({ text: analysisPrompt });

        const geminiResp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ role: 'user', parts }],
                    generationConfig: { temperature: 0.2, maxOutputTokens: 4096, responseMimeType: 'application/json' },
                }),
                signal: AbortSignal.timeout(40_000),
            }
        );

        const geminiData = await geminiResp.json();
        if (geminiData.error) throw new Error(geminiData.error.message);

        const rawText = geminiData.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '{}';
        let analysis = {};
        try { analysis = JSON.parse(rawText); } catch { analysis = { raw: rawText }; }

        console.log(`[Motion Graphics] Asset analysis complete: ${Object.keys(analysis).length} fields extracted`);
        res.json({ success: true, analysis });
    } catch (err) {
        console.error('[Motion Graphics] Analyze error:', err.message);
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

// ── POST /api/video-studio/motion-graphics/generate-prompt ──
// Claude claude-sonnet-4-6: Motion Graphic Designer writes the Seedance 2 animation prompt
router.post('/motion-graphics/generate-prompt', protect, async (req, res) => {
    try {
        const { analysis, styleId, customStyle, userBrief, duration = 8 } = req.body;
        if (!analysis) return res.status(400).json({ success: false, error: 'Asset analysis is required' });

        const anthropicKey = process.env.ANTHROPIC_API_KEY;
        if (!anthropicKey) return res.status(500).json({ success: false, error: 'ANTHROPIC_API_KEY not configured' });

        const preset = MG_STYLE_PRESETS[styleId] || MG_STYLE_PRESETS.dynamic;
        const styleKeywords = styleId === 'custom' ? (customStyle || 'creative motion') : preset.keywords;
        const styleName = styleId === 'custom' ? customStyle : preset.label;
        const temperature = preset.tempHint || 0.85;

        const systemPrompt = `You are the world's most creative Motion Graphics Director — a visionary who has crafted title sequences for major film studios, brand launches for Fortune 500 companies, and award-winning logo animations.

Your specialty: writing PRECISE, CINEMATIC, TECHNICALLY DETAILED animation prompts for AI video models (specifically Seedance 2) that produce jaw-dropping motion graphics.

RULES FOR YOUR PROMPTS:
1. Be SPECIFIC, not vague. "Logo scales up 20% with overshoot easing" not "logo animates in"
2. Describe EVERY motion beat — entrance, mid-hold, exit or loop
3. Include particle systems, light effects, environmental atmosphere
4. Specify camera behavior explicitly (static / slow push / orbit / zoom)
5. Describe timing: what happens at 0s, 1s, 2s, 3s, etc.
6. Include color treatment (warm/cool grade, saturation boost, contrast)
7. Describe sound-design-inspired motion (even though no audio) — "beat-driven", "staccato pops"
8. ALWAYS start with the visual opening state, not brand context
9. Write ONE continuous flowing paragraph — no bullet points, no headers
10. Max 400 words. Dense, specific, cinematic.`;

        const userMessage = `Create a Seedance 2 motion graphics animation prompt for this brand asset.

BRAND ASSET ANALYSIS:
- Logo Geometry: ${analysis.logoGeometry || 'N/A'}
- Color Palette: Primary: ${analysis.colorPalette?.primary || 'N/A'} | Secondary: ${analysis.colorPalette?.secondary || 'N/A'} | Accent: ${analysis.colorPalette?.accent || 'N/A'}
- Brand Personality: ${analysis.brandPersonality || 'N/A'}
- Text Elements: ${analysis.textElements || 'N/A'}
- Composition: ${analysis.composition || 'N/A'}
- Animatable Elements: ${(analysis.animatableElements || []).join(', ') || 'N/A'}
- Natural Motion Direction: ${analysis.naturalMotionDirection || 'N/A'}
- Mood Keywords: ${(analysis.moodKeywords || []).join(', ') || 'N/A'}
- Technical Notes: ${analysis.technicalNotes || 'N/A'}

ANIMATION STYLE: ${styleName}
STYLE DNA: ${styleKeywords}
${userBrief ? `USER'S CREATIVE DIRECTION: "${userBrief}"` : ''}
TARGET DURATION: ${duration} seconds
OUTPUT FORMAT: Seedance 2 video generation (text-to-video / image-to-video)

Write the animation prompt now. Be the motion graphics director the brand deserves.`;

        // Use Atlas Cloud (OpenAI-compatible) for Claude — cheaper + no ANTHROPIC_API_KEY dependency
        const atlasKey = process.env.ATLASCLOUD_API_KEY || anthropicKey;
        const atlasBase = process.env.ATLASCLOUD_BASE_URL || 'https://api.atlascloud.ai/v1';
        const isAtlas = !!process.env.ATLASCLOUD_API_KEY;

        const claudeResp = await fetch(
            isAtlas ? `${atlasBase}/chat/completions` : 'https://api.anthropic.com/v1/messages',
            {
                method: 'POST',
                headers: isAtlas
                    ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${atlasKey}` }
                    : { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
                body: JSON.stringify(isAtlas
                    ? {
                        model: 'anthropic/claude-sonnet-4.6',
                        max_tokens: 1024,
                        temperature,
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: userMessage },
                        ],
                    }
                    : {
                        model: 'claude-sonnet-4-6',
                        max_tokens: 1024,
                        temperature,
                        system: systemPrompt,
                        messages: [{ role: 'user', content: userMessage }],
                    }
                ),
                signal: AbortSignal.timeout(45_000),
            }
        );

        const claudeData = await claudeResp.json();
        if (claudeData.error) throw new Error(claudeData.error.message);

        const motionPrompt = (isAtlas
            ? claudeData.choices?.[0]?.message?.content
            : claudeData.content?.[0]?.text
        )?.trim() || '';
        if (!motionPrompt) throw new Error('Claude returned empty prompt');

        console.log(`[Motion Graphics] Claude prompt generated: ${motionPrompt.length} chars, style=${styleId}`);
        res.json({ success: true, motionPrompt, styleId, styleName });
    } catch (err) {
        console.error('[Motion Graphics] generate-prompt error:', err.message);
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

// ── POST /api/video-studio/motion-graphics/generate-video ──
// Submit to Seedance 2 via Atlas Cloud
router.post('/motion-graphics/generate-video', protect, requireCredits('qAdsGenerate'), async (req, res) => {
    try {
        const { brandId, prompt, imageUrls = [], styleId, duration = 8, aspectRatio = '16:9', resolution = '1080p', model = 'seedance-2.0' } = req.body;
        if (!prompt?.trim()) return res.status(400).json({ success: false, error: 'prompt is required' });

        const validImages = (Array.isArray(imageUrls) ? imageUrls : []).filter(u => u && u.startsWith('http'));
        console.log(`[Motion Graphics] Submitting: model=${model}, ${duration}s, ${aspectRatio}, ${resolution}, style=${styleId}, ${validImages.length} ref images`);

        const genResult = await submitVideoGeneration({
            prompt: prompt.trim(),
            model,
            duration: Math.min(parseInt(duration), 15),
            aspectRatio,
            resolution,
            qualityMode: 'high',
            generateAudio: false,
            imageUrl: validImages[0] || null,
            referenceImages: validImages.slice(1, 4),
            imageRole: 'product',
        });

        // Persist as VideoProject for history
        const project = await VideoProject.create({
            user: req.user._id,
            brand: brandId || undefined,
            studioMode: 'motion-graphics',
            mode: 'motion-graphics',
            status: 'generating',
            title: `Motion Graphics [${(MG_STYLE_PRESETS[styleId]?.label || styleId || 'Custom')}]`,
            backendPrompt: prompt.trim(),
            input: {
                brief: prompt.trim().substring(0, 200),
                images: validImages.map((u, i) => ({ url: u, source: 'upload', label: `asset-${i + 1}` })),
            },
            generation: {
                provider: genResult.provider || 'atlascloud',
                model,
                falRequestId: genResult.requestId || genResult.taskId,
                taskId: genResult.requestId || genResult.taskId,
                requestId: genResult.requestId || genResult.taskId,
                duration: Math.min(parseInt(duration), 15),
                aspectRatio,
                progress: 0,
                status: 'GENERATING',
            },
            advancedConfig: { styleId, aspectRatio, duration, resolution },
        }).catch(e => { console.warn('[Motion Graphics] VideoProject create failed:', e.message); return null; });

        res.json({
            success: true,
            projectId: project?._id || null,
            requestId: genResult.requestId || genResult.taskId,
            provider: 'atlascloud',
            prompt: prompt.trim(),
            duration: Math.min(parseInt(duration), 15),
            aspectRatio,
        });
    } catch (err) {
        console.error('[Motion Graphics] generate-video error:', err.message);
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

// ── GET /api/video-studio/motion-graphics/status/:requestId ──
// Poll Atlas Cloud for motion graphics video status
router.get('/motion-graphics/status/:requestId', protect, async (req, res) => {
    try {
        const { requestId } = req.params;
        if (!requestId || requestId === 'undefined') {
            return res.json({ success: true, status: 'FAILED', error: 'Invalid request ID' });
        }

        const project = await VideoProject.findOne({
            $or: [{ 'generation.requestId': requestId }, { 'generation.taskId': requestId }, { 'generation.falRequestId': requestId }], user: req.user._id, studioMode: 'motion-graphics'
        });
        const provider = project?.generation?.provider || 'atlascloud';

        const result = await getUnifiedGenerationStatus(provider, requestId, project?.generation?.statusUrl, project?.generation?.resultUrl);
        if (!result) return res.json({ success: true, status: 'IN_PROGRESS', progress: 10 });

        const updatePayload = { 'generation.progress': result.progress || 0 };

        if (result.status === 'COMPLETED' && result.videoUrl) {
            const s3VideoUrl = await ensureS3Url(result.videoUrl, `motion-graphics/video-${Date.now()}.mp4`);
            if (s3VideoUrl) result.videoUrl = s3VideoUrl;
        }

        if (result.videoUrl) updatePayload['generation.videoUrl'] = result.videoUrl;
        if (result.error)    updatePayload['generation.error']    = result.error;
        if (result.status === 'COMPLETED' || result.status === 'FAILED') {
            updatePayload.status = result.status === 'COMPLETED' ? 'done' : 'failed';
            updatePayload['generation.status'] = result.status;
        }
        if (result.status === 'COMPLETED' && result.videoUrl) {
            updatePayload.finalVideoUrl = result.videoUrl;
        }

        await VideoProject.findOneAndUpdate(
            { $or: [{ 'generation.requestId': requestId }, { 'generation.taskId': requestId }, { 'generation.falRequestId': requestId }], user: req.user._id, studioMode: 'motion-graphics' },
            { $set: updatePayload }
        ).catch(e => console.warn('[Motion Graphics Status] DB update failed:', e.message));

        res.json({
            success: true,
            status: result.status,
            progress: result.progress,
            videoUrl: result.videoUrl || null,
            error: result.error || null,
        });
    } catch (err) {
        console.error('[Motion Graphics Status] Error:', err.message);
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
router.post('/:id/generate', protect, requireCredits('videoGenerate'), aiGenerationLimiter, async (req, res) => {
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
        const rawRefImages = [];

        // 1. Prioritize avatar/character image
        const avatarUrl = project.input?.avatarUrl || null;
        if (avatarUrl && avatarUrl.startsWith('http') && !avatarUrl.includes('localhost')) {
            rawRefImages.push(avatarUrl);
        }

        // 2. Fetch brand and include logo
        let logoUrl = null;
        if (project.brand) {
            const brand = await Brand.findById(project.brand).lean();
            logoUrl = brand?.dna?.logo?.url || null;
            if (logoUrl && logoUrl.startsWith('http') && !logoUrl.includes('localhost')) {
                rawRefImages.push(logoUrl);
            }
        }

        // 3. Include user product images
        const userRefUrls = (project.input?.images || [])
            .map(img => img.url)
            .filter(url => url && url.startsWith('http') && !url.includes('localhost'));
        rawRefImages.push(...userRefUrls);

        // 4. Include other user uploaded and brand references
        const userUploadedUrls = (project.references?.userUploaded || [])
            .map(img => img.url)
            .filter(url => url && url.startsWith('http') && !url.includes('localhost'));
        rawRefImages.push(...userUploadedUrls);

        const brandRefUrls = (project.references?.brandImages || [])
            .map(img => img.url)
            .filter(url => url && url.startsWith('http') && !url.includes('localhost'));
        rawRefImages.push(...brandRefUrls);

        const allRefImages = [...new Set(rawRefImages)];

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
            avatarUrl: updatedProject.input?.avatarUrl || null,
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
                        console.log(`🛡️ Safe Mode Pivot: Bytedance rejected real-person image. Attempting fallbacks...`);
                        try {
                            let prompt = '';
                            let imageUrl = null;
                            let duration = 5;
                            let resolution = project.routing?.resolution || '1080p';
                            let aspectRatio = project.routing?.aspectRatio || '16:9';
                            let mode = project.routing?.mode || 'fast';
                            let referenceImages = [];
                            
                            if (project.mode === 'advanced') {
                                prompt = project.advancedConfig?.prompt || project.title;
                                imageUrl = project.advancedConfig?.firstImageUrl || null;
                                duration = project.advancedConfig?.duration || 5;
                                referenceImages = (project.advancedConfig?.referenceImages || []).filter(Boolean);
                            } else {
                                prompt = project.backendPrompt || project.title;
                                imageUrl = project.input?.images?.[0]?.url || null;
                                duration = project.script?.totalDuration || 5;
                            }
                            
                            // Strip @image tags for fallback models
                            prompt = prompt.replace(/@Image\d+/gi, '').replace(/\s{2,}/g, ' ').trim();
                            
                            let fallbackSucceeded = false;

                            // ── Fallback 1: Atlas Cloud Wan-2.7 (accepts real faces) ──
                            // Reuse the original Seedance _atlasCloudPayload (already has processed
                            // images, CDN uploads, and prompt). Just switch task_type to Wan-2.7.
                            const originalPayload = project.generation?._atlasCloudPayload || updated.generation?._atlasCloudPayload;
                            if (originalPayload) {
                                try {
                                    console.log(`🛡️ Safe Mode Fallback 1: Trying Atlas Cloud Wan-2.7 (accepts real faces)...`);
                                    const wan27Payload = JSON.parse(JSON.stringify(originalPayload));
                                    // Switch Seedance model to Wan-2.7 equivalent
                                    if (wan27Payload.task_type) {
                                        if (wan27Payload.task_type.includes('reference-to-video')) {
                                            wan27Payload.task_type = 'alibaba/wan-2.7/reference-to-video';
                                        } else if (wan27Payload.task_type.includes('image-to-video')) {
                                            wan27Payload.task_type = 'alibaba/wan-2.7/image-to-video';
                                        } else {
                                            wan27Payload.task_type = 'alibaba/wan-2.7/text-to-video';
                                        }
                                    }
                                    const { resubmitAtlasCloudTask } = await import('../agents/videoStudio/atlasClient.js');
                                    const wan27Result = await resubmitAtlasCloudTask(wan27Payload);
                                    
                                    console.log(`✅ Safe Mode: Wan-2.7 task submitted: ${wan27Result.taskId}`);
                                    updated.status = project.mode === 'advanced' ? 'advanced-generating' : 'generating';
                                    updated.generation = {
                                        falRequestId: wan27Result.taskId,
                                        falEndpoint: 'atlascloud-wan-2.7-safemode',
                                        falStatusUrl: null,
                                        falResultUrl: null,
                                        provider: 'atlascloud',
                                        _atlasCloudPayload: wan27Payload,
                                        videoUrl: '',
                                        progress: 5,
                                        startedAt: new Date(),
                                        error: '',
                                    };
                                    await VideoProject.findByIdAndUpdate(project._id, {
                                        status: updated.status,
                                        generation: updated.generation,
                                        'routing.selectedModel': 'wan-2.7'
                                    });
                                    fallbackSucceeded = true;
                                } catch (wan27Err) {
                                    console.error(`❌ Safe Mode Wan-2.7 fallback failed: ${wan27Err.message}`);
                                }
                            } else {
                                console.warn(`⚠️ Safe Mode: No stored _atlasCloudPayload — skipping Wan-2.7 fallback`);
                            }

                            // ── Fallback 2: Kling 3.0 via LaoZhang (if Wan-2.7 failed) ──
                            if (!fallbackSucceeded) {
                                try {
                                    console.log(`🛡️ Safe Mode Fallback 2: Trying Kling 3.0 via LaoZhang...`);
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
                                    if (isLaozhangSync) updated.finalVideoUrl = klingResult._laozhangVideoUrl;
                                    await VideoProject.findByIdAndUpdate(project._id, {
                                        status: updated.status,
                                        generation: updated.generation,
                                        ...(isLaozhangSync ? { finalVideoUrl: updated.finalVideoUrl } : {}),
                                        'routing.selectedModel': 'kling-3.0'
                                    });
                                    if (isLaozhangSync) {
                                        downloadAndUploadVideoToS3(project._id.toString(), klingResult._laozhangVideoUrl)
                                            .catch(err => console.error(`[SafeMode] LaoZhang async S3 upload failed for ${project._id}:`, err.message));
                                    }
                                    fallbackSucceeded = true;
                                } catch (klingErr) {
                                    console.error(`❌ Safe Mode Kling 3.0 fallback failed: ${klingErr.message}`);
                                }
                            }

                            // ── Fallback 3: Grok Imagine (if both Wan-2.7 and Kling failed) ──
                            if (!fallbackSucceeded) {
                                try {
                                    console.log(`🛡️ Safe Mode Fallback 3: Trying Grok Imagine...`);
                                    const grokResult = await submitVideoGeneration({
                                        model: 'grok-imagine',
                                        prompt,
                                        imageUrl,
                                        duration: Math.min(duration, 15),
                                        resolution,
                                        mode,
                                        generateAudio: true,
                                        aspectRatio,
                                        referenceImages: [],
                                    });
                                    
                                    console.log(`✅ Safe Mode: Grok Imagine task submitted: ${grokResult.requestId}`);
                                    updated.status = project.mode === 'advanced' ? 'advanced-generating' : 'generating';
                                    updated.generation = {
                                        falRequestId: grokResult.requestId,
                                        falEndpoint: grokResult.endpoint,
                                        falStatusUrl: grokResult.statusUrl,
                                        falResultUrl: grokResult.resultUrl,
                                        provider: grokResult.provider || 'grok',
                                        videoUrl: '',
                                        progress: 5,
                                        startedAt: new Date(),
                                        error: '',
                                    };
                                    await VideoProject.findByIdAndUpdate(project._id, {
                                        status: updated.status,
                                        generation: updated.generation,
                                        'routing.selectedModel': 'grok-imagine'
                                    });
                                    fallbackSucceeded = true;
                                } catch (grokErr) {
                                    console.error(`❌ Safe Mode Grok fallback failed: ${grokErr.message}`);
                                }
                            }

                            if (!fallbackSucceeded) {
                                throw new Error('All safe mode fallbacks exhausted (Wan-2.7, Kling 3.0, Grok)');
                            }
                            
                        } catch (fallbackErr) {
                            console.error(`❌ Safe Mode all fallbacks failed: ${fallbackErr.message}`);
                            // Fall through to standard refund if fallback fails
                            if (project.creditsUsed > 0) {
                                await refundCredits(project.user, project.creditsUsed, 'videoGenerateRefund', `Refund: Video Generation Async Failure (${updated.generation?.error || 'Unknown'} - All fallbacks failed)`, 'video', { projectId: project._id });
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

                    // 🎤 Trigger async voiceover pipeline for non-English completed videos (Advanced Mode)
                    if (finalVideoUrl && updated.generation?.language &&
                        updated.generation.language.toLowerCase() !== 'english' &&
                        !updated.generation?.voiceoverStatus &&
                        !project.voiceoverPreview?.audioUrl) {
                        console.log(`🎤 [TTS] Triggering Advanced Mode voiceover pipeline for project ${project._id} (lang: ${updated.generation.language})`);
                        const freshProject = await VideoProject.findById(project._id);
                        if (freshProject) {
                            addVoiceoverToProject(freshProject).catch(e => console.error(`🎤 [TTS] Advanced voiceover failed: ${e.message}`));
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
            // Always set user for superadmin too — ensures compound index is used for sort
            filter.user = req.user._id;
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
        const selectFields = 'title status mode studioMode input.videoType input.brief input.images advancedConfig routing.selectedModel routing.costPreview generation finalVideoUrl storyboard createdAt updatedAt';

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

        // NOTE: Do NOT use .hint() — the compound indexes may not exist on production MongoDB.
        // allowDiskUse: true (set above) is sufficient to prevent 32MB sort overflow.

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

        // ── STEP 0b: Long-form catch-up sync ──
        // If a long-form project is still 'generating' but the background pipeline
        // already completed (in-memory job has videoUrl), update the DB immediately.
        // This handles: user closed tab → backend pipeline finished → user reopened.
        try {
            const longFormStuck = projects.filter(p =>
                p.status === 'generating' && p.generation?.longFormJobId
            );
            for (const p of longFormStuck) {
                const jobStatus = getLongFormJobStatus(p.generation.longFormJobId);
                if (jobStatus?.status === 'COMPLETED' && jobStatus.videoUrl) {
                    console.log(`🔄 [Long-Form CatchUp] Syncing project ${p._id} → done (video found in memory)`);
                    p.status = 'done';
                    p.finalVideoUrl = jobStatus.videoUrl;
                    if (!p.generation) p.generation = {};
                    p.generation.videoUrl = jobStatus.videoUrl;
                    p.generation.progress = 100;
                    p.generation.status = 'COMPLETED';
                    VideoProject.findByIdAndUpdate(p._id, {
                        status: 'done',
                        finalVideoUrl: jobStatus.videoUrl,
                        'generation.videoUrl': jobStatus.videoUrl,
                        'generation.progress': 100,
                        'generation.status': 'COMPLETED',
                    }).exec().catch(e => console.warn(`⚠️ Long-form catch-up DB update failed for ${p._id}:`, e.message));
                } else if (jobStatus?.status === 'FAILED') {
                    p.status = 'failed';
                    if (!p.generation) p.generation = {};
                    p.generation.status = 'FAILED';
                    p.generation.error = jobStatus.error || 'Long-form generation failed';
                    VideoProject.findByIdAndUpdate(p._id, {
                        status: 'failed',
                        'generation.status': 'FAILED',
                        'generation.error': jobStatus.error || 'Long-form generation failed',
                    }).exec().catch(() => {});
                }
            }
        } catch (lfSyncErr) {
            console.warn('⚠️ Long-form catch-up sync failed (non-fatal):', lfSyncErr.message);
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
                            else if (model === 'seedance-2.0' || model === 'veo-3.1-lite') provider = 'atlascloud';
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
        let signedProjects = projects;
        try {
            signedProjects = await signVideoProjectAssets(projects);
        } catch (signErr) {
            console.warn('⚠️ URL signing phase failed (non-fatal):', signErr.message);
        }

        res.json({ success: true, projects: signedProjects, total });
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
            // ✅ FIX: S3 bucket uses "Bucket owner enforced" (ACLs disabled), so raw
            // S3 path-style URLs are NOT publicly accessible (403). Presign the URL
            // before returning it to the frontend for display. Also return the raw
            // permanent URL so the backend can use it for generation/storage.
            let displayUrl = hostedUrl;
            if (hostedUrl.includes('amazonaws.com')) {
                try {
                    displayUrl = await getSignedUrlIfNeeded(hostedUrl);
                } catch (signErr) {
                    console.warn('⚠️ Failed to presign uploaded image URL:', signErr.message);
                }
            }
            res.json({ success: true, url: displayUrl, permanentUrl: hostedUrl });
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

// ═══════════════════════════════════════════════════════════════════════════════
// LONG-FORM VIDEO GENERATION (30–120s)
// Scene-based parallel generation → crossfade stitch → TTS → BGM
// ═══════════════════════════════════════════════════════════════════════════════

// ── POST /api/video-studio/long-form/generate ────────────────────────────────
router.post('/long-form/generate', protect, async (req, res) => {
    try {
        const {
            targetDuration, model, prompt, referenceImages, imageRole,
            language, aspectRatio, settings, brandId, productData, bgmPreset,
        } = req.body;

        const dur = Math.min(Math.max(parseInt(targetDuration) || 30, 20), 120);

        // Credit check
        const costEst = estimateLongFormCost(model || 'seedance-2.0', dur, settings?.resolution || '1080p', settings?.quality || 'fast');
        const user = req.user;
        // Credit check — creditsRemaining is a Mongoose virtual; if user was fetched
        // with .lean() it won't exist. Compute inline as a defensive fallback.
        const remaining = user.creditsRemaining ?? (() => {
            if (user.role === 'superadmin' || user.plan === 'enterprise') return Infinity;
            const c = user.credits || {};
            const topUp = (c.topUp > 0 && c.topUpExpiry && new Date(c.topUpExpiry) > new Date()) ? c.topUp : 0;
            return Math.max(0, ((c.total || 0) + (c.bonus || 0) + topUp) - (c.used || 0));
        })();
        if (remaining < costEst.totalCredits) {
            return res.status(402).json({
                success: false,
                error: `Insufficient credits. Need ${costEst.totalCredits}, have ${remaining}.`,
                required: costEst.totalCredits,
                available: remaining,
            });
        }

        // Deduct credits upfront atomically (REL-014)
        const updatedUser = await User.findOneAndUpdate(
            {
                _id: user._id,
                $expr: {
                    $gte: [
                        { $add: [
                            { $ifNull: ['$credits.total', 0] },
                            { $ifNull: ['$credits.bonus', 0] },
                            { $cond: [
                                { $and: [
                                    { $gt: ['$credits.topUp', 0] },
                                    { $gt: ['$credits.topUpExpiry', new Date()] }
                                ]},
                                '$credits.topUp',
                                0
                            ]}
                        ] },
                        costEst.totalCredits
                    ]
                }
            },
            { $inc: { 'credits.used': costEst.totalCredits } },
            { returnDocument: 'after' }
        );

        if (!updatedUser) {
             return res.status(402).json({
                success: false,
                error: 'Insufficient credits (concurrent deduction occurred).',
            });
        }

        // Load brand context
        let brandContext = '';
        try {
            const bc = await loadBrandContext(brandId);
            brandContext = bc.brandContext || '';
        } catch {}

        console.log(`[Long-Form] Starting ${dur}s video — ${costEst.segments} segments, ${costEst.totalCredits} credits, model=${model || 'seedance-2.0'}`);

        const jobId = startLongFormGeneration({
            targetDuration: dur,
            model: model || 'seedance-2.0',
            prompt: prompt || '',
            referenceImages: Array.isArray(referenceImages) ? referenceImages : [],
            imageRole: imageRole || 'product',
            language: language || 'English',
            aspectRatio: aspectRatio || '9:16',
            settings: settings || {},
            userId: req.user._id,
            brandId,
            brandContext,
            productData: typeof productData === 'string' ? JSON.parse(productData) : (productData || {}),
            bgmPreset: bgmPreset || 'cinematic',
        });

        // Create VideoProject for history
        const project = await VideoProject.create({
            user: req.user._id,
            brand: brandId || null,
            studioMode: 'long-form',
            mode: 'advanced',
            status: 'generating',
            title: `Long-Form ${dur}s Video`,
            backendPrompt: prompt || '',
            input: {
                brief: prompt?.substring(0, 500) || `${dur}s video`,
                images: (referenceImages || []).map((u, i) => ({ url: u, source: 'upload', label: `ref-${i + 1}` })),
            },
            generation: {
                provider: 'fal',
                model: model || 'seedance-2.0',
                language: language || 'English',
                duration: dur,
                aspectRatio: aspectRatio || '9:16',
                longFormJobId: jobId,
                progress: 0,
                status: 'GENERATING',
            },
            advancedConfig: { duration: dur },
        }).catch(e => { console.warn('[Long-Form] VideoProject create failed:', e.message); return null; });

        res.json({
            success: true,
            jobId,
            projectId: project?._id,
            segments: costEst.segments,
            totalCredits: costEst.totalCredits,
            estimatedMinutes: costEst.estimatedTimeMinutes,
        });
    } catch (err) {
        console.error('[Long-Form] Generate error:', err.message);
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

// ── GET /api/video-studio/long-form/status/:jobId ────────────────────────────
router.get('/long-form/status/:jobId', protect, async (req, res) => {
    try {
        const status = getLongFormJobStatus(req.params.jobId);
        if (!status) {
            // Check if it's stored in a VideoProject
            const project = await VideoProject.findOne({ 'generation.longFormJobId': req.params.jobId }).lean();
            if (project?.generation?.videoUrl || project?.finalVideoUrl) {
                return res.json({
                    success: true,
                    status: 'COMPLETED',
                    progress: 100,
                    videoUrl: project.finalVideoUrl || project.generation.videoUrl,
                });
            }
            return res.status(404).json({ success: false, error: 'Job not found' });
        }

        // If completed, update VideoProject
        if (status.status === 'COMPLETED' && status.videoUrl) {
            const updatedProject = await VideoProject.findOneAndUpdate(
                { 'generation.longFormJobId': req.params.jobId },
                {
                    status: 'done',
                    'generation.videoUrl': status.videoUrl,
                    'generation.progress': 100,
                    'generation.status': 'COMPLETED',
                    'generation.voiceoverStatus': 'done',
                    finalVideoUrl: status.videoUrl,
                },
                { returnDocument: 'after' }
            ).catch(() => null);

            // 🎤 Trigger async voiceover pipeline for completed videos
            // 🛑 SKIP for long-form because it already has per-scene TTS & lip-sync baked in
            if (updatedProject && updatedProject.studioMode !== 'long-form' && updatedProject.generation?.language && !updatedProject.generation?.voiceoverStatus) {
                console.log(`🎤 [TTS] Triggering async voiceover pipeline for project ${updatedProject._id} (lang: ${updatedProject.generation.language})`);
                addVoiceoverToProject(updatedProject).catch(e => console.error(`🎤 [TTS] Background voiceover failed: ${e.message}`));
            }
        }

        res.json({
            success: true,
            status: status.status,
            progress: status.progress,
            phase: status.phase,
            phaseLabel: status.phaseLabel,
            detail: status.detail,
            videoUrl: status.videoUrl,
            error: status.error,
            scenes: status.sceneStatuses,
        });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

// ── POST /api/video-studio/long-form/cancel/:jobId ───────────────────────────
router.post('/long-form/cancel/:jobId', protect, async (req, res) => {
    const cancelled = cancelLongFormJob(req.params.jobId);
    if (cancelled) {
        await VideoProject.findOneAndUpdate(
            { 'generation.longFormJobId': req.params.jobId },
            { status: 'cancelled' }
        ).catch(() => {});
    }
    res.json({ success: true, cancelled });
});

// ── POST /api/video-studio/storyboard/cancel/:jobId ────────────────────────────────────────
// Cancels an active storyboard long-form job (sb-lf-* IDs).
// Calls cancelStoryboardLongFormJob() which sets job.cancelled = true on the
// in-memory job object. The pipeline checks this flag between each segment.
router.post('/storyboard/cancel/:jobId', protect, async (req, res) => {
    const { jobId } = req.params;
    const cancelled = cancelStoryboardLongFormJob(jobId);
    if (cancelled) {
        // Update MongoDB project status so the UI reflects cancellation after page refresh
        await VideoProject.findOneAndUpdate(
            { 'storyboard.longFormJobId': jobId },
            { status: 'storyboard-ready', 'storyboard.status': 'cancelled' }
        ).catch(() => {});
        console.log(`[Storyboard Cancel] ❌ Cancelled job: ${jobId}`);
    }
    res.json({ success: true, cancelled });
});

// ── GET /api/video-studio/long-form/estimate ─────────────────────────────────
router.get('/long-form/estimate', protect, (req, res) => {
    const { model, duration, resolution, mode } = req.query;
    const est = estimateLongFormCost(
        model || 'seedance-2.0',
        parseInt(duration) || 30,
        resolution || '1080p',
        mode || 'fast'
    );
    res.json({ success: true, ...est });
});



// ══════════════════════════════════════════════════════════════════════════════
// POST /api/video-studio/storyboard/analyze-brief-media
// Analyzes an uploaded image (brochure/flyer/photo) or audio file and returns
// a structured creative brief + full extracted text for the storyboard pipeline.
//
// KEY DESIGN DECISION: Brand DNA is NOT injected into the OCR system prompt.
// Injecting brandName/brandCategory causes GPT-4o to hallucinate brand-aligned
// content instead of faithfully reading the actual brochure. Brand name is only
// used as a fallback if OCR fails to identify a product name.
// ══════════════════════════════════════════════════════════════════════════════
const storyboardBriefUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max (high-quality audio)
}).single('file');

router.post('/storyboard/analyze-brief-media', protect, (req, res) => {
    storyboardBriefUpload(req, res, async (uploadErr) => {
        if (uploadErr) {
            return res.status(400).json({ success: false, error: uploadErr.message || 'File upload failed' });
        }
        try {
            const file = req.file;
            const brandId = req.body?.brandId || null;

            if (!file) return res.status(400).json({ success: false, error: 'No file uploaded' });

            const mime = file.mimetype || '';
            const isImage = mime.startsWith('image/');
            const isAudio = mime.startsWith('audio/') || /mpeg|mp4|m4a|ogg|wav|webm/.test(mime);

            if (!isImage && !isAudio) {
                return res.status(400).json({ success: false, error: 'Unsupported file type. Upload an image (JPG/PNG/WEBP) or audio (MP3/WAV/M4A).' });
            }

            console.log(`\n🎦 [analyze-brief-media] type=${mime} size=${(file.size / 1024).toFixed(0)}KB brand=${brandId}`);

            // Brand name used ONLY as fallback — never injected into OCR prompt
            const { loadBrandContext } = await import('../agents/shared/agentUtils.js');
            const { brand } = await loadBrandContext(brandId);
            const brandNameFallback = brand?.name || '';

            // ── Upload to S3 ──────────────────────────────────────────────────
            const { uploadToS3 } = await import('../utils/s3.js').catch(() => ({ uploadToS3: null }));
            let mediaUrl = '';
            if (uploadToS3) {
                try {
                    const ext = mime.split('/')[1]?.split(';')[0]?.replace('mpeg', 'mp3') || 'bin';
                    const s3Key = `storyboard/brief-media/${req.user._id}/${Date.now()}.${ext}`;
                    mediaUrl = await uploadToS3(file.buffer, s3Key, mime);
                    console.log(`📤 [analyze-brief-media] S3: ${mediaUrl?.substring(0, 60)}`);
                } catch (s3Err) {
                    console.warn('[analyze-brief-media] S3 upload failed:', s3Err.message);
                }
            }

            // ══════════════════════════════════════════════════════════════
            // IMAGE PATH — Document OCR + Creative Brief (via GPT-4o vision)
            // ══════════════════════════════════════════════════════════════
            if (isImage) {
                try {
                    console.log('[analyze-brief-media] 🖼️ Starting image OCR + brief generation...');
                    const sharp = (await import('sharp')).default;

                    // 1600px preserves text for dense brochures
                    const resized = await sharp(file.buffer)
                        .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
                        .jpeg({ quality: 88 })
                        .toBuffer();
                    const base64 = resized.toString('base64');

                    const { getRouter } = await import('../ai/router.js');
                    const router = getRouter();

                    const systemPrompt = `You are a highly accurate document OCR engine AND a creative advertising strategist.
Your PRIMARY JOB: Read and extract every single word, number, and symbol that is PRINTED OR WRITTEN on this image.

This image may be a real estate brochure, product flyer, marketing pamphlet, pitch deck slide, printed catalogue, or business card.

STEP 1 — FULL TEXT EXTRACTION (mandatory):
Read the ENTIRE image like a high-resolution scanner. Extract ALL visible text:
- Headlines and sub-headlines
- Body copy and descriptions
- Prices (₹1.2 Cr, $299, €599, etc.)
- Specifications (2 BHK, 1250 sq ft, 500mg, etc.)
- RERA numbers, license IDs, legal text
- Location details, landmark names, distances (e.g. "5 min from Metro")
- Amenities and feature bullet points
- Phone numbers, websites, emails
- Fine print, disclaimers, CTAs
- ANY other printed or handwritten text, even if small

STEP 2 — ADVERTISING BRIEF:
Based ONLY on what you READ in the image (no external knowledge), write a 4-6 sentence director-ready video advertising brief.

STEP 3 — JSON RESPONSE:
Return ONLY a valid JSON object:
{
  "brief": "4-6 sentence director-ready brief based ONLY on what is in the image",
  "productName": "Exact name as it ACTUALLY APPEARS in the image",
  "productFeatures": "Comma-separated features EXACTLY as written (prices, specs, amenities)",
  "suggestedDuration": 30,
  "suggestedFormat": "9:16",
  "extractedText": "COMPLETE verbatim text, every word in reading order, separated by | characters"
}

CRITICAL RULES:
- extractedText MUST contain EVERY word from the image — used for video voiceover scripting
- Do NOT hallucinate or invent facts not in the image
- Do NOT use external brand knowledge — only read what is written
- suggestedDuration: 15 (simple photo), 30 (single-page flyer), 60 (content-rich brochure), 90 (dense/multi-page)
- suggestedFormat: "9:16" portrait/brochure, "16:9" landscape/presentation, "1:1" square
- suggestedDuration MUST be one of: 15, 30, 60, 90
- suggestedFormat MUST be one of: "9:16", "16:9", "1:1"`;

                    // ═══════════════════════════════════════════════════════════════
                    // VISION: Use router.nativeGemini directly — exact same pattern
                    // as callMultimodalAgent() used in YouTube Studio, Creative Studio,
                    // and all other studios. nativeGemini = real GeminiProvider (direct
                    // Google API, NOT the Laozhang OpenAI-format proxy in providers.gemini).
                    //
                    // GeminiProvider.generateText accepts images[] as data: URIs or
                    // http URLs — it fetches/decodes them into inlineData automatically.
                    // ═══════════════════════════════════════════════════════════════
                    console.log(`[analyze-brief-media] 🔍 Calling Gemini vision directly via fetch (base64 length=${base64.length})...`);

                    const geminiApiKey = process.env.GEMINI_API_KEY;
                    if (!geminiApiKey) {
                        return res.status(503).json({
                            success: false,
                            error: 'Image analysis unavailable — GEMINI_API_KEY not configured. Please add it to .env or type your brief manually.',
                        });
                    }

                    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;
                    const parts = [
                        { text: systemPrompt },
                        { text: 'Read every word from this image. Extract ALL text verbatim and generate the advertising brief.' },
                        { inlineData: { mimeType: mime || 'image/jpeg', data: base64 } }
                    ];

                    const geminiResp = await fetch(geminiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{ role: 'user', parts }],
                            generationConfig: { temperature: 0.1, maxOutputTokens: 2500, responseMimeType: 'application/json' },
                        }),
                        signal: AbortSignal.timeout(40_000),
                    });

                    if (!geminiResp.ok) {
                        const errText = await geminiResp.text();
                        throw new Error(`Gemini API Error [${geminiResp.status}]: ${errText}`);
                    }

                    const geminiData = await geminiResp.json();
                    const raw = geminiData.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
                    const visionProviderUsed = 'gemini-2.5-flash-direct';

                    // ── Total failure: surface the error, don't hallucinate ────────────
                    if (!raw) {
                        console.error('[analyze-brief-media] ❌ All vision providers failed');
                        return res.status(503).json({
                            success: false,
                            error: 'Image analysis failed — all AI vision providers are currently unavailable (quota/503). Please try again in a few minutes or type your brief manually.',
                        });
                    }

                    console.log(`[analyze-brief-media] ✅ Vision by ${visionProviderUsed} — raw (first 300): ${raw.substring(0, 300)}`);

                    // Strip markdown fences if present
                    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

                    let parsed;
                    try {
                        // Some models wrap in extra text — extract the JSON object
                        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
                        parsed = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);
                    } catch {
                        // Regex key-by-key fallback if JSON is malformed
                        const m = (key) => cleaned.match(new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`))?.[1] || '';
                        parsed = {
                            brief: m('brief') || '',
                            productName: m('productName') || brandNameFallback || '',
                            productFeatures: m('productFeatures') || '',
                            suggestedDuration: 30,
                            suggestedFormat: '9:16',
                            extractedText: m('extractedText') || cleaned.substring(0, 2000),
                        };
                    }

                    console.log(`✅ [analyze-brief-media] provider=${visionProviderUsed} productName="${parsed.productName}" brief="${(parsed.brief || '').substring(0, 80)}"`);
                    console.log(`📄 [analyze-brief-media] extractedText length=${parsed.extractedText?.length || 0} preview: "${(parsed.extractedText || '').substring(0, 300)}"`);

                    return res.json({
                        success: true,
                        mediaType: 'image',
                        brief: parsed.brief || '',
                        productName: parsed.productName || brandNameFallback || '',
                        productFeatures: parsed.productFeatures || '',
                        suggestedDuration: [15, 30, 60, 90].includes(Number(parsed.suggestedDuration)) ? Number(parsed.suggestedDuration) : 30,
                        suggestedFormat: ['9:16', '16:9', '1:1'].includes(parsed.suggestedFormat) ? parsed.suggestedFormat : '9:16',
                        extractedText: parsed.extractedText || '',
                        productImageUrl: mediaUrl || null,
                        visionProvider: visionProviderUsed,
                    });

                } catch (visionErr) {
                    console.error('[analyze-brief-media] ❌ Vision analysis threw:', visionErr.message);
                    return res.status(503).json({
                        success: false,
                        error: `Image analysis failed: ${visionErr.message}. Please try again or type your brief manually.`,
                    });
                }
            }

            // ══════════════════════════════════════════════════════════════
            // AUDIO PATH — Gemini transcription → creative brief
            // ══════════════════════════════════════════════════════════════
            if (isAudio) {
                try {
                    console.log('[analyze-brief-media] 🎙️ Starting audio transcription + brief generation via Gemini...');
                    const base64 = file.buffer.toString('base64');
                    const dataUri = `data:${mime};base64,${base64}`;

                    // Write buffer to temp file to extract duration via FFmpeg
                    const os = (await import('os')).default;
                    const fs = (await import('fs')).default;
                    const path = (await import('path')).default;
                    const { execFile } = await import('child_process');
                    const { promisify } = await import('util');
                    const ffmpegPath = (await import('ffmpeg-static')).default;
                    const execFileAsync = promisify(execFile);

                    const tmpAudioPath = path.join(os.tmpdir(), `temp-brief-${Date.now()}.mp3`);
                    fs.writeFileSync(tmpAudioPath, file.buffer);

                    let audioDuration = 30;
                    try {
                        const { stderr } = await execFileAsync(ffmpegPath, ['-i', tmpAudioPath]);
                        const match = stderr.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2,3})/);
                        if (match) {
                            audioDuration = (parseInt(match[1], 10) * 3600) + (parseInt(match[2], 10) * 60) + parseFloat(match[3]);
                        }
                    } catch (err) {
                        const match = err.message.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2,3})/);
                        if (match) {
                            audioDuration = (parseInt(match[1], 10) * 3600) + (parseInt(match[2], 10) * 60) + parseFloat(match[3]);
                        }
                    } finally {
                        try { fs.unlinkSync(tmpAudioPath); } catch {}
                    }
                    console.log(`[analyze-brief-media] Measured audio duration: ${audioDuration} seconds`);

                    const geminiApiKey = process.env.GEMINI_API_KEY;
                    if (!geminiApiKey) {
                        return res.status(503).json({
                            success: false,
                            error: 'Audio analysis unavailable — GEMINI_API_KEY not configured. Please add it to .env or type your brief manually.',
                        });
                    }

                    console.log(`[analyze-brief-media] 🔍 Calling Gemini audio transcription directly via fetch (base64 length=${base64.length}, mime=${mime})...`);

                    const systemPrompt = `You are a highly accurate audio transcription engine AND a creative advertising strategist.
Your PRIMARY JOB: Listen to the audio and extract/transcribe every single word verbatim. Do not summarize, skip, or paraphrase the spoken words.

The total duration of the audio clip is exactly ${Math.round(audioDuration)} seconds.

STEP 1 — VERBATIM TRANSCRIPTION (mandatory):
Transcribe the entire audio content exactly as it is spoken. Keep all original words.

STEP 2 — SCENE BREAKDOWN (mandatory):
Decompose the verbatim transcript into distinct sequential cuts/scenes based on natural semantic boundaries.
For each cut:
- Provide a detailed visual scene description (what to show on screen). Must directly illustrate the verbatim words spoken.
- Provide the exact verbatim portion of the transcript (dialogue) spoken during this cut.
- Allocate a duration in seconds for this cut. The sum of all cut durations MUST equal exactly ${Math.round(audioDuration)} seconds. No cut should be less than 2 seconds or more than 15 seconds.

STEP 3 — JSON RESPONSE:
Return ONLY a valid JSON object:
{
  "brief": "A 4-6 sentence summary/ad brief based ONLY on the audio content",
  "productName": "Exact name of the product or brand mentioned in the audio (if any, otherwise empty string)",
  "productFeatures": "Comma-separated features, offerings, or specifications spoken in the audio",
  "suggestedDuration": ${Math.round(audioDuration)},
  "suggestedFormat": "9:16",
  "extractedText": "VERBATIM transcription of the entire audio clip",
  "preSeededCuts": [
    {
      "id": 1,
      "lens": "50mm prime",
      "duration": 5,
      "move": "STEADICAM",
      "shot": "MEDIUM",
      "scene": "Visual description of what to show on screen. Must directly illustrate the dialogue for this cut.",
      "framePrompt": "Detailed prompt for generating the image frame.",
      "dialogue": "The exact verbatim portion of the transcript spoken during this cut"
    }
  ]
}

CRITICAL RULES:
- extractedText MUST contain the COMPLETE verbatim transcript of the audio.
- The sum of all cut durations in preSeededCuts MUST equal exactly ${Math.round(audioDuration)} seconds.
- Do NOT use external brand knowledge.
- suggestedFormat MUST be one of: "9:16" portrait, "16:9" landscape, "1:1" square.
- Return ONLY JSON. Do not include any explanations or markdown wrappers outside the JSON object.`;

                    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;
                    const parts = [
                        { text: systemPrompt },
                        { text: 'Transcribe the audio verbatim and extract key details into the specified JSON format.' },
                        { inlineData: { mimeType: mime, data: base64 } }
                    ];

                    const geminiResp = await fetch(geminiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{ role: 'user', parts }],
                            generationConfig: { temperature: 0.1, maxOutputTokens: 6000, responseMimeType: 'application/json' },
                        }),
                        signal: AbortSignal.timeout(60_000),
                    });

                    if (!geminiResp.ok) {
                        const errText = await geminiResp.text();
                        throw new Error(`Gemini API Error [${geminiResp.status}]: ${errText}`);
                    }

                    const geminiData = await geminiResp.json();
                    const raw = geminiData.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
                    const audioProviderUsed = 'gemini-2.5-flash-direct';

                    if (!raw) {
                        throw new Error('Gemini returned an empty response for audio analysis');
                    }

                    console.log(`[analyze-brief-media] ✅ Audio processed by ${audioProviderUsed} — raw (first 300): ${raw.substring(0, 300)}`);

                    // Strip markdown fences if present
                    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

                    let parsed;
                    try {
                        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
                        parsed = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);
                    } catch {
                        const m = (key) => cleaned.match(new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`))?.[1] || '';
                        parsed = {
                            brief: m('brief') || '',
                            productName: m('productName') || brandNameFallback || '',
                            productFeatures: m('productFeatures') || '',
                            suggestedDuration: Math.round(audioDuration),
                            suggestedFormat: '9:16',
                            extractedText: m('extractedText') || cleaned.substring(0, 2000),
                            preSeededCuts: null,
                        };
                    }

                    console.log(`✅ [analyze-brief-media] provider=${audioProviderUsed} productName="${parsed.productName}" brief="${(parsed.brief || '').substring(0, 80)}"`);
                    console.log(`📄 [analyze-brief-media] extractedText length=${parsed.extractedText?.length || 0} preview: "${(parsed.extractedText || '').substring(0, 300)}"`);

                    return res.json({
                        success: true,
                        mediaType: 'audio',
                        brief: parsed.brief || '',
                        productName: parsed.productName || brandNameFallback || '',
                        productFeatures: parsed.productFeatures || '',
                        suggestedDuration: [15, 30, 60, 90, 120, 180, 240, 300].includes(Number(parsed.suggestedDuration)) ? Number(parsed.suggestedDuration) : Math.round(audioDuration),
                        suggestedFormat: ['9:16', '16:9', '1:1'].includes(parsed.suggestedFormat) ? parsed.suggestedFormat : '9:16',
                        extractedText: parsed.extractedText || '',
                        productImageUrl: null,
                        visionProvider: audioProviderUsed,
                        briefAudioUrl: mediaUrl || null,
                        audioDuration: audioDuration,
                        preSeededCuts: parsed.preSeededCuts || null,
                    });

                } catch (audioErr) {
                    console.error('[analyze-brief-media] ❌ Audio transcription/analysis failed:', audioErr.message);
                    return res.status(503).json({
                        success: false,
                        error: `Audio transcription failed: ${audioErr.message}. Please try again or type your brief manually.`,
                    });
                }
            }

            return res.status(400).json({ success: false, error: 'Could not process file type.' });

        } catch (err) {
            console.error('[analyze-brief-media] Unexpected error:', err.message);
            return res.status(500).json({ success: false, error: safeErrorMessage(err) });
        }
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// STORYBOARD STUDIO — AI Ad Film Director → Frame Generation → Animation
// ══════════════════════════════════════════════════════════════════════════════

const storyboardUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ── POST /api/video-studio/storyboard/create ─────────────────────────────────
// Step 1: Director Brain (Claude) generates shot plan + Gemini generates frames
// Returns full storyboard JSON with frameUrls
router.post('/storyboard/create', protect, requireCredits('storyboardCreate'), storyboardUpload.fields([
    { name: 'productImages', maxCount: 20 },
    { name: 'avatarImages', maxCount: 4 },    // multi-character support (replaces avatarImage)
    { name: 'avatarImage',  maxCount: 1 },    // legacy single-avatar compat
    { name: 'refImages',    maxCount: 3 },    // location/element/mood reference images
]), async (req, res) => {
    // Set headers to application/json and set CORS headers immediately to prevent gateway timeout
    res.setHeader('Content-Type', 'application/json');
    const origin = req.headers.origin;
    if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Vary', 'Origin');
    }
    
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const keepAliveInterval = setInterval(() => {
        console.log('[Storyboard Create] Sending keep-alive chunk to prevent gateway timeout...');
        res.write('\n');
    }, 15000);

    req.on('close', () => {
        clearInterval(keepAliveInterval);
    });

    try {
        const {
            brandId, brief, productName, productFeatures,
            style = 'hyperrealistic', duration = '30', format = '9:16',
            resolution = '2k',
            productImageUrls: bodyProductImgUrls,
            // Multi-avatar: accept avatarUrls[] array or legacy avatarUrl string
            avatarUrls: bodyAvatarUrls,
            avatarUrl: bodyAvatarUrl,
            avatarNames: bodyAvatarNames,
            // Location/element reference images
            refImageUrls: bodyRefImageUrls,
            // Visual branding toggle
            includeBranding: bodyIncludeBranding,
            directorModel = 'claude',
            imageModel = 'gpt-image-2',
            dialogueLanguage = 'English',
            // Brochure pipeline: full extracted text + flag from analyze-brief-media
            brochureExtractedText = '',
            isBrochure: bodyIsBrochure = 'false',
            briefAudioUrl = '',
            audioSync: bodyAudioSync,
        } = req.body;

        const isBrochure = bodyIsBrochure === 'true' || bodyIsBrochure === true;
        const audioSync = bodyAudioSync === 'false' || bodyAudioSync === false ? false : true;

        // Parse includeBranding (default true — branding ON by default)
        const includeBranding = bodyIncludeBranding === 'false' || bodyIncludeBranding === false ? false : true;

        // 🔍 DIAGNOSTIC: Log what brochure data was received
        console.log(`\n📌 [storyboard/create] isBrochure=${isBrochure} brochureExtractedText.length=${(brochureExtractedText || '').length}`);
        if (brochureExtractedText) {
            console.log(`📌 [storyboard/create] brochureExtractedText preview: "${brochureExtractedText.substring(0, 300)}"`);
        } else {
            console.log('⚠️  [storyboard/create] NO brochureExtractedText received — check frontend FormData');
        }

        // Parse avatar names array
        let avatarNames = [];
        if (bodyAvatarNames) {
            if (Array.isArray(bodyAvatarNames)) avatarNames = bodyAvatarNames;
            else if (typeof bodyAvatarNames === 'string') {
                try { avatarNames = JSON.parse(bodyAvatarNames); } catch { avatarNames = [bodyAvatarNames]; }
            }
        }

        // Map resolution string to NanoBanana imageSize token
        const RESOLUTION_TO_IMAGESIZE = { '480p': '1K', '720p': '1K', '1080p': '1K', '2k': '2K', '4k': '4K' };
        const imageSizeForModel = RESOLUTION_TO_IMAGESIZE[resolution] || '2K';

        const totalDuration = Math.max(5, Math.min(300, parseInt(duration) || 30));

        // ══════ DIAGNOSTIC LOGGING ══════
        console.log(`\n🔍 [Storyboard Create] ══ INCOMING REQUEST DUMP ══`);
        console.log(`  req.files keys: ${JSON.stringify(Object.keys(req.files || {}))}`);
        console.log(`  productImages files: ${req.files?.productImages?.length || 0}`);
        console.log(`  avatarImages files: ${(req.files?.avatarImages || req.files?.avatarImage)?.length || 0}`);
        console.log(`  refImages files: ${req.files?.refImages?.length || 0}`);
        console.log(`  body.productImageUrls: ${JSON.stringify(bodyProductImgUrls)?.substring(0, 200)}`);
        console.log(`  body.avatarUrls/avatarUrl: ${JSON.stringify(bodyAvatarUrls || bodyAvatarUrl)?.substring(0, 100)}`);
        console.log(`  body.avatarNames: ${JSON.stringify(avatarNames)}`);
        console.log(`  body.includeBranding: ${includeBranding}`);
        console.log(`  body.imageModel: ${imageModel}`);
        console.log(`  body.brief: ${brief?.substring(0, 80)}`);

        // Upload any new product images
        const productImageUrls = [];
        if (req.files?.productImages?.length) {
            for (const f of req.files.productImages) {
                const s3Key = `storyboard/products/${req.user._id}/${Date.now()}-${f.originalname}`;
                const url = await uploadToS3(f.buffer, s3Key, f.mimetype);
                console.log(`  ✅ Product image uploaded to S3: ${url}`);
                productImageUrls.push(url);
            }
        }
        // Also accept pre-existing S3 URLs from body
        if (bodyProductImgUrls) {
            let parsed = [];
            if (Array.isArray(bodyProductImgUrls)) {
                parsed = bodyProductImgUrls;
            } else if (typeof bodyProductImgUrls === 'string') {
                try {
                    parsed = JSON.parse(bodyProductImgUrls);
                } catch(e) {
                    parsed = [bodyProductImgUrls]; // Not JSON, assume raw URL
                }
            }
            productImageUrls.push(...(Array.isArray(parsed) ? parsed : [parsed]).filter(u => u?.startsWith('http')));
        }

        // ── Upload avatars (multi-character, up to 4) ──────────────────────────
        const avatarUrls = [];

        // New multi-avatar file field
        if (req.files?.avatarImages?.length) {
            for (const f of req.files.avatarImages) {
                const s3Key = `storyboard/avatars/${req.user._id}/${Date.now()}-${f.originalname}`;
                const url = await uploadToS3(f.buffer, s3Key, f.mimetype);
                console.log(`  ✅ Avatar image uploaded to S3: ${url}`);
                avatarUrls.push(url);
            }
        }
        // Legacy single avatarImage field
        if (req.files?.avatarImage?.[0]) {
            const f = req.files.avatarImage[0];
            const s3Key = `storyboard/avatars/${req.user._id}/${Date.now()}-${f.originalname}`;
            const url = await uploadToS3(f.buffer, s3Key, f.mimetype);
            console.log(`  ✅ Legacy avatar image uploaded to S3: ${url}`);
            if (!avatarUrls.includes(url)) avatarUrls.push(url);
        }
        // Pre-existing avatar URLs from body (avatarUrls[] or legacy avatarUrl string)
        if (bodyAvatarUrls) {
            let parsed = [];
            if (Array.isArray(bodyAvatarUrls)) parsed = bodyAvatarUrls;
            else if (typeof bodyAvatarUrls === 'string') {
                try { parsed = JSON.parse(bodyAvatarUrls); } catch { parsed = [bodyAvatarUrls]; }
            }
            avatarUrls.push(...parsed.filter(u => u?.startsWith('http') && !avatarUrls.includes(u)));
        }
        if (bodyAvatarUrl && bodyAvatarUrl.startsWith('http') && !avatarUrls.includes(bodyAvatarUrl)) {
            avatarUrls.push(bodyAvatarUrl);
        }

        // ── Upload location/element reference images (up to 3) ────────────────
        const refImageUrls = [];
        if (req.files?.refImages?.length) {
            for (const f of req.files.refImages) {
                const s3Key = `storyboard/refs/${req.user._id}/${Date.now()}-${f.originalname}`;
                const url = await uploadToS3(f.buffer, s3Key, f.mimetype);
                console.log(`  ✅ Ref image uploaded to S3: ${url}`);
                refImageUrls.push(url);
            }
        }
        if (bodyRefImageUrls) {
            let parsed = [];
            if (Array.isArray(bodyRefImageUrls)) parsed = bodyRefImageUrls;
            else if (typeof bodyRefImageUrls === 'string') {
                try { parsed = JSON.parse(bodyRefImageUrls); } catch { parsed = [bodyRefImageUrls]; }
            }
            refImageUrls.push(...parsed.filter(u => u?.startsWith('http') && !refImageUrls.includes(u)).slice(0, 3 - refImageUrls.length));
        }

        console.log(`  📸 FINAL productImageUrls (${productImageUrls.length}): ${JSON.stringify(productImageUrls).substring(0, 200)}`);
        console.log(`  🧑 FINAL avatarUrls (${avatarUrls.length}): ${JSON.stringify(avatarUrls).substring(0, 200)}`);
        console.log(`  📍 FINAL refImageUrls (${refImageUrls.length}): ${JSON.stringify(refImageUrls).substring(0, 200)}`);
        console.log(`[Storyboard Create] brand=${brandId}, duration=${totalDuration}s, style=${style}, imgs=${productImageUrls.length}, avatars=${avatarUrls.length}, refs=${refImageUrls.length}, branding=${includeBranding}`);
        console.log(`🔍 [Storyboard Create] ══ END DUMP ══\n`);

        // Step 1: Director Brain — generate shot plan via Claude (or use pre-seeded cuts if provided)
        let plan;
        if (req.body.preSeededCuts) {
            let parsedCuts = [];
            try {
                parsedCuts = typeof req.body.preSeededCuts === 'string'
                    ? JSON.parse(req.body.preSeededCuts)
                    : req.body.preSeededCuts;
            } catch (e) {
                console.warn('[Storyboard Create] Failed to parse preSeededCuts:', e.message);
            }

            if (parsedCuts && parsedCuts.length > 0) {
                console.log(`[Storyboard Create] 🎬 Using ${parsedCuts.length} pre-seeded cuts/scenes!`);
                const cuts = parsedCuts.map((c, i) => {
                    const vo = c.voiceover || c.dialogue || '';
                    return {
                        id: c.id || i + 1,
                        lens: c.lens || '50mm prime',
                        duration: Math.max(2, parseInt(c.duration) || 3),
                        move: c.move || 'STEADICAM',
                        shot: c.shot || 'MEDIUM',
                        scene: c.scene || '',
                        framePrompt: c.framePrompt || c.scene || '',
                        voiceover: vo,
                        dialogue: vo,
                    };
                });

                const totalCalculatedDuration = cuts.reduce((sum, c) => sum + c.duration, 0);

                // Load brand context colors and logo watermarks
                let brandColors = ['#1A1A1A', '#E1306C', '#FFFFFF'];
                let brandColorNames = ['Dark Studio', 'Reel Pink', 'Pure White'];
                let brandLogoUrl = null;
                let brandLogoDescription = '';
                let brandContext = '';

                if (brandId) {
                    const brand = await Brand.findById(brandId).lean();
                    if (brand) {
                        brandContext = brand.dna?.description || '';
                        if (brand.dna?.colors?.length > 0) {
                            brandColors = brand.dna.colors.slice(0, 3);
                            brandColorNames = brandColors.map((c, idx) => `Brand Color ${idx + 1}`);
                        }
                        if (brand.dna?.logo?.url) {
                            brandLogoUrl = brand.dna.logo.url;
                            brandLogoDescription = brand.dna.logo.metadata?.visionDescription || '';
                        }
                    }
                }

                // Construct structured plan
                plan = {
                    colorPalette: brandColors,
                    paletteNames: brandColorNames,
                    materialNotes: 'Clean studio lighting, brand colors, minimal layout',
                    environmentFingerprint: 'A high-end, clean creator studio set with soft background lighting',
                    cuts,
                    voiceoverScript: cuts.map(c => c.voiceover).filter(Boolean).join(' '),
                    audioSync,
                    moodKeywords: ['engaging', 'modern', 'clean', 'professional', 'bold'],
                    cinematographyRules: 'Soft key light, shallow depth of field, steady focus tracking.',
                    emotionalArc: 'hook → explain → solve → detail → CTA',
                    narrativeArc: brief || 'A D2C brand marketing video.',
                    hookStrategy: cuts[0]?.scene || 'Stop paying agencies ₹4 lakh for one ad',
                    requestedDuration: totalCalculatedDuration,
                    format,
                    defaultStyle: style,
                    productImageUrls,
                    avatarUrls,
                    avatarNames,
                    refImageUrls,
                    dialogueLanguage,
                    logoUrl: includeBranding ? brandLogoUrl : null,
                    includeBranding,
                };

                // Build imagePrompt automatically for the grid poster
                const panelCount = Math.min(Math.max(cuts.length, 5), 8);
                const visible = cuts.slice(0, 8);
                const panelBlock = visible.map((cut, i) => (
                    `  - Panel ${i + 1} (Cut ${cut.id || i + 1}): ${cut.scene || cut.framePrompt || `Shot ${i + 1}`} (max 12 words).`
                )).join('\n');
                
                const charRefBlock = avatarNames.length > 0
                    ? `- CHARACTER REFERENCE: ${avatarNames.length} panels — one per character: ${avatarNames.map(n => `"${n}" (front view + face close-up)`).join(', ')}. Label each panel with the character name.`
                    : `- CHARACTER REFERENCE: 6 panels showing the presenter/model from angles (front, side, back, face close-up, side close-up, wardrobe detail).`;

                plan.imagePrompt = `Create a highly detailed, professional pre-production storyboard pitch deck sheet in a structured billboard layout for a ${productName || 'product'} advertisement.
Beige/creme background canvas.
Top Meta Header: Display 'Cut Count: ${panelCount}', 'Color Palette: [${brandColors.join(', ')}]', 'Environment Fingerprint: A high-end, clean creator studio set with soft background lighting' in clean black typography.

Section 1 (CHARACTER & HERO PRODUCT REFERENCE):
- ${charRefBlock}
- HERO PRODUCT REFERENCE: 5 panels showing the product from angles (front view, three-quarter view, side view, macro detail, in-context lifestyle).
- Bottom row: Color palette circular swatches and text material notes.

Section 2 (ENVIRONMENT / SET DESIGN):
- Left side: A large 16:9 set design render of the environment (A high-end, clean creator studio set with soft background lighting).
- Right side: A top-down floor plan schematic diagram showing furniture layout and camera paths/arrows labeled with cut numbers.

Section 3 (STORYBOARD):
- A clean horizontal row of ${panelCount} storyboard panels showing:
${panelBlock}
- Below each panel, include clear black typography: 'Lens | Duration | Move | Shot Type'.

Section 4 (LIGHTING / MOOD / STYLE NOTES):
- 4 small lighting panels showing soft backlight, warm glow, rim light, and bokeh details with descriptions.
- On the right: 'MOOD KEYWORDS' list and bulleted 'CINEMATOGRAPHY NOTES'.

Format: ${format} | Style: ${style === '3d' ? 'Pixar/Unreal Engine 3D animated' : style === '2d' ? 'Clean 2D flat animated illustration' : 'Hyperrealistic cinematic live-action photography'} | ${totalCalculatedDuration}s total. Negative prompt: [cartoonish styles, low quality, distorted panels, text errors, smiling models, watermarks, talking head closeups, close-up heads]. Note: The product's original color shade, shape, and label must remain completely unchanged and must not be recolored with the brand colors. Panels showing presenters must depict a proper moving person explaining while doing something (e.g. typing on a laptop, gesturing at a screen, pointing, walking, demonstrating features, interacting with props/environments) and not just a talking head or moving head close-up.`;
            }
        }

        if (!plan) {
            plan = await runStoryboardDirector({
                brandId,
                brief,
                productName,
                productFeatures,
                productImageUrls,
                avatarUrls,
                avatarNames,
                refImageUrls,
                includeBranding,
                style,
                duration: totalDuration,
                format,
                userId: req.user._id,
                directorModel,
                dialogueLanguage,
                // Brochure pipeline
                brochureExtractedText,
                isBrochure,
            });
            plan.audioSync = audioSync;
        }

        // Step 2: Generate single storyboard poster via LaoZhang → GPT Image 2 / NanoBanana
        // Pass raw file buffers directly (bypasses S3 re-download which can silently fail)
        let rawProductBuffers = (req.files?.productImages || []).map(f => ({ buffer: f.buffer, mimeType: f.mimetype }));

        // Multi-avatar: collect raw buffers from avatarImages (new) and legacy avatarImage field
        let rawAvatarBuffers = [
            ...(req.files?.avatarImages || []).map(f => ({ buffer: f.buffer, mimeType: f.mimetype })),
            ...(req.files?.avatarImage || []).map(f => ({ buffer: f.buffer, mimeType: f.mimetype })),
        ];

        // Location/element ref buffers
        let rawRefBuffers = (req.files?.refImages || []).map(f => ({ buffer: f.buffer, mimeType: f.mimetype }));

        // Helper: download a URL to a buffer
        const dlBufCreate = async (url) => {
            try {
                const signedUrl = await getSignedUrlIfNeeded(url);
                const resp = await fetch(signedUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) });
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                return { buffer: Buffer.from(await resp.arrayBuffer()), mimeType: resp.headers.get('content-type') || 'image/jpeg' };
            } catch (e) {
                console.warn(`[Storyboard Create] Failed to download buffer from URL: ${e.message}`);
                return null;
            }
        };

        // Eagerly download avatar URLs to buffers if no file buffers available
        if (rawAvatarBuffers.length === 0 && avatarUrls.length > 0) {
            console.log(`[Storyboard Create] Downloading ${avatarUrls.length} avatar URL(s) to buffers...`);
            rawAvatarBuffers = (await Promise.all(avatarUrls.map(dlBufCreate))).filter(Boolean);
            console.log(`[Storyboard Create] Downloaded ${rawAvatarBuffers.length} avatar buffers`);
        }

        // Eagerly download ref image URLs to buffers if no file buffers available
        if (rawRefBuffers.length === 0 && refImageUrls.length > 0) {
            console.log(`[Storyboard Create] Downloading ${refImageUrls.length} ref image URL(s) to buffers...`);
            rawRefBuffers = (await Promise.all(refImageUrls.map(dlBufCreate))).filter(Boolean);
            console.log(`[Storyboard Create] Downloaded ${rawRefBuffers.length} ref image buffers`);
        }

        // ✅ KEY FIX: When product images arrive as URLs (scraped via URL, not file-uploaded),
        // rawProductBuffers will be empty and NanoBanana will hallucinate because it never
        // receives actual image pixels. We eagerly download the S3 URLs to buffers here.
        if (rawProductBuffers.length === 0 && productImageUrls.length > 0) {
            console.log(`[Storyboard Create] rawProductBuffers empty — downloading ${productImageUrls.length} URL images to buffers...`);
            const downloaded = await Promise.all(productImageUrls.map(dlBufCreate));
            rawProductBuffers = downloaded.filter(Boolean);
            console.log(`[Storyboard Create] Downloaded ${rawProductBuffers.length} product image buffers from URLs`);
        }

        console.log(`[Storyboard Create] Passing product=${rawProductBuffers.length} avatar=${rawAvatarBuffers.length} ref=${rawRefBuffers.length} buffers to poster generator`);

        // Download logo URL to buffer
        let rawLogoBuffer = null;
        const logoUrl = plan.logoUrl || null;
        if (logoUrl) {
            console.log(`[Storyboard Create] Downloading logo ref: ${logoUrl.substring(0, 80)}`);
            try {
                const signedLogoUrl = await getSignedUrlIfNeeded(logoUrl);
                const resp = await fetch(signedLogoUrl, { 
                    headers: { 'User-Agent': 'Mozilla/5.0' }, 
                    signal: AbortSignal.timeout(15000) 
                });
                if (resp.ok) {
                    rawLogoBuffer = {
                        buffer: Buffer.from(await resp.arrayBuffer()),
                        mimeType: resp.headers.get('content-type') || 'image/jpeg'
                    };
                }
            } catch (e) {
                console.warn(`[Storyboard Create] Failed to download logo buffer: ${e.message}`);
            }
        }

        const posterDataUrl = await generateStoryboardPoster(
            plan.imagePrompt,
            style,
            format,
            productImageUrls,      // S3 URLs (fallback if no raw buffers)
            null,                  // legacy single avatarUrl — not used (multi-avatar below)
            imageModel,
            rawProductBuffers,     // raw buffers — contains actual pixel data
            null,                  // legacy single rawAvatarBuffer — not used
            imageSizeForModel,     // NanoBanana resolution e.g. '2K'
            plan.logoUrl || null,  // brand logo URL (null if includeBranding=false)
            rawLogoBuffer,         // brand logo buffer (null if includeBranding=false)
            // ── New multi-character + ref image params ──
            avatarUrls,
            avatarNames,
            rawAvatarBuffers,
            refImageUrls,
            rawRefBuffers,
            Math.min(plan.cuts?.length || 5, 8),  // dynamic panel count
        );


        // Upload data URI → S3 so the frontend gets a real HTTP URL (not a giant base64 blob)
        let posterUrl = posterDataUrl;
        if (posterDataUrl && posterDataUrl.startsWith('data:')) {
            try {
                posterUrl = await ensureS3Url(posterDataUrl, `storyboard/posters/${req.user._id}`);
                console.log(`[Storyboard Create] Poster uploaded to S3: ${posterUrl?.substring(0, 80)}...`);
            } catch (s3Err) {
                console.warn(`[Storyboard Create] S3 upload failed, using data URI: ${s3Err.message}`);
                posterUrl = posterDataUrl;
            }
        }

        plan.imageUrl = posterUrl;

        // Persist as a storyboard VideoProject
        const project = await VideoProject.create({
            user: req.user._id,
            brand: brandId || null,
            studioMode: 'storyboard',
            status: 'storyboard-ready',
            refAudio: briefAudioUrl || '',
            title: `Storyboard — ${productName || brief?.substring(0, 40) || 'Ad Film'}`,
            input: {
                brief,
                productName: productName || '',
                productFeatures: productFeatures || '',
                // Multi-avatar: store all avatar URLs + names + legacy compat
                avatarUrl: avatarUrls[0] || '',
                avatarUrls: avatarUrls,
                avatarNames: avatarNames,
                // Location/element refs
                refImageUrls: refImageUrls,
                images: productImageUrls.map(url => ({ url, source: 'upload' })),
            },
            storyboard: {
                imagePrompt: plan.imagePrompt,
                videoPrompt: plan.videoPrompt,
                imageUrl: plan.imageUrl,
                taskId: null,
                status: 'pending',
                titleCard: plan.titleCard || null,
                narrativeArc: plan.narrativeArc || null,
                hookStrategy: plan.hookStrategy,
                totalDuration: plan.totalDuration,
                format,
                style,
                dialogueLanguage,
                includeBranding,
                audioSync,
                voiceoverScript: plan.voiceoverScript || '',
                // ── 4-section structured plan ──
                structuredPlan: {
                    colorPalette:           plan.colorPalette || [],
                    paletteNames:           plan.paletteNames || [],
                    materialNotes:          plan.materialNotes || '',
                    environmentFingerprint: plan.environmentFingerprint || '',
                    cuts:                   plan.cuts || [],
                    moodKeywords:           plan.moodKeywords || [],
                    cinematographyRules:    plan.cinematographyRules || '',
                    emotionalArc:           plan.emotionalArc || '',
                    hookStrategy:           plan.hookStrategy || '',
                    narrativeArc:           plan.narrativeArc || '',
                },
                // Character Reference Sheet URL — generated below and back-patched
                characterRefSheetUrl: null,
            },
        });

        // ── Generate Character Reference Sheet (if avatars present) ──────────────────
        // One consolidated image showing all characters, generated once and reused
        // as a stable face anchor in every video segment during animation.
        if (rawAvatarBuffers.length > 0) {
            try {
                const { generateCharacterReferenceSheet } = await import('../agents/videoStudio/storyboardFrames.js');
                const charSheetDataUrl = await generateCharacterReferenceSheet(rawAvatarBuffers, avatarNames, style);
                if (charSheetDataUrl) {
                    let charSheetUrl = charSheetDataUrl;
                    if (charSheetDataUrl.startsWith('data:')) {
                        charSheetUrl = await ensureS3Url(charSheetDataUrl, `storyboard/char-sheets/${req.user._id}`);
                    }
                    console.log(`[Storyboard Create] 🎭 Character ref sheet → S3: ${charSheetUrl?.substring(0, 80)}`);
                    // Back-patch onto the created project
                    await VideoProject.findByIdAndUpdate(project._id, {
                        $set: { 'storyboard.characterRefSheetUrl': charSheetUrl }
                    });
                    // Also expose in plan response so frontend can show it
                    plan.characterRefSheetUrl = charSheetUrl;
                }
            } catch (charSheetErr) {
                console.warn(`[Storyboard Create] ⚠️ Character ref sheet generation failed: ${charSheetErr.message} — will use raw avatar refs instead`);
            }
        }

        if (plan.imageUrl) plan.imageUrl = await getSignedUrlIfNeeded(plan.imageUrl);
        if (plan.avatarUrl) plan.avatarUrl = await getSignedUrlIfNeeded(plan.avatarUrl);
        if (plan.productImageUrls) {
            plan.productImageUrls = await Promise.all(plan.productImageUrls.map(url => getSignedUrlIfNeeded(url)));
        }

        clearInterval(keepAliveInterval);
        res.end(JSON.stringify({
            success: true,
            projectId: project._id,
            plan,
        }));
    } catch (err) {
        clearInterval(keepAliveInterval);
        console.error('[Storyboard Create] Error:', err.message);
        if (!res.headersSent) {
            res.status(500);
        }
        res.end(JSON.stringify({ success: false, error: safeErrorMessage(err) }));
    }
});

// ── POST /api/video-studio/storyboard/regen-poster ───────────────────────────
// Regenerate the main storyboard poster (after user edits prompt)
router.post('/storyboard/regen-poster', protect, async (req, res) => {
    // Set headers to application/json and set CORS headers immediately to prevent gateway timeout
    res.setHeader('Content-Type', 'application/json');
    const origin = req.headers.origin;
    if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Vary', 'Origin');
    }

    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const keepAliveInterval = setInterval(() => {
        console.log('[Storyboard Regen Poster] Sending keep-alive chunk to prevent gateway timeout...');
        res.write('\n');
    }, 15000);

    req.on('close', () => {
        clearInterval(keepAliveInterval);
    });

    try {
        const { projectId, imagePrompt, style = 'hyperrealistic', format = '9:16', imageModel = 'gpt-image-2', dialogueLanguage } = req.body;

        // ✅ FIX: Load the project's saved product images from DB so the regenerated poster
        // is grounded to the actual product — not hallucinated from scratch
        let productImageUrls = [];
        let avatarUrls = [];
        let avatarUrl = null;          // legacy compat (first avatar)
        let avatarNames = [];
        let refImageUrls = [];
        let panelCount = 5;
        let dialogueLanguageSelected = dialogueLanguage || 'English';
        let brief = '';
        let productName = '';
        let productFeatures = '';
        let duration = 30;
        let brandContext = '';
        let logoUrl = null;

        if (projectId) {
            const proj = await VideoProject.findById(projectId).select('input storyboard brand').lean();
            if (proj?.input?.images?.length > 0) {
                productImageUrls = proj.input.images.map(img => img.url).filter(Boolean);
            }
            // Multi-avatar
            if (proj?.input?.avatarUrls?.length > 0) {
                avatarUrls = proj.input.avatarUrls;
            } else if (proj?.input?.avatarUrl) {
                avatarUrls = [proj.input.avatarUrl];
            }
            avatarUrl = avatarUrls[0] || null; // legacy compat
            avatarNames = proj?.input?.avatarNames || [];
            refImageUrls = proj?.input?.refImageUrls || [];
            // Panel count from the stored structured plan
            panelCount = Math.min(proj?.storyboard?.structuredPlan?.cuts?.length || 5, 8);
            if (!dialogueLanguage) {
                dialogueLanguageSelected = proj?.storyboard?.dialogueLanguage || 'English';
            }
            brief = proj?.input?.brief || '';
            productName = proj?.input?.productName || '';
            
            if (proj?.brand) {
                try {
                    const { loadBrandContext } = await import('../agents/shared/agentUtils.js');
                    const brandData = await loadBrandContext(proj.brand);
                    brandContext = brandData?.brandContext || '';
                    logoUrl = brandData?.brand?.dna?.logo?.url || null;
                } catch (brandErr) {
                    console.warn(`[Storyboard Regen Poster] Could not load brand context: ${brandErr.message}`);
                }
            }
            duration = proj?.storyboard?.totalDuration || 30;
        }

        const dlBuf = async (url) => {
            try {
                const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) });
                if (!resp.ok) return null;
                return { buffer: Buffer.from(await resp.arrayBuffer()), mimeType: resp.headers.get('content-type') || 'image/jpeg' };
            } catch { return null; }
        };

        // Sign all product image URLs and download to buffers
        let rawProductBuffers = [];
        let signedProductUrls = [];
        if (productImageUrls.length > 0) {
            signedProductUrls = await Promise.all(productImageUrls.map(url => getSignedUrlIfNeeded(url)));
            rawProductBuffers = (await Promise.all(signedProductUrls.map(dlBuf))).filter(Boolean);
        }

        // Sign all avatar URLs and download to buffers (multi-avatar)
        let rawAvatarBuffers = [];
        let signedAvatarUrls = [];
        if (avatarUrls.length > 0) {
            signedAvatarUrls = await Promise.all(avatarUrls.map(url => getSignedUrlIfNeeded(url)));
            rawAvatarBuffers = (await Promise.all(signedAvatarUrls.map(dlBuf))).filter(Boolean);
        }
        // Legacy compat: single avatarUrl
        const signedAvatarUrl = signedAvatarUrls[0] || null;
        const rawAvatarBuffer = rawAvatarBuffers[0] || null;

        // Sign ref image URLs and download to buffers
        let rawRefBuffers = [];
        let signedRefUrls = [];
        if (refImageUrls.length > 0) {
            signedRefUrls = await Promise.all(refImageUrls.map(url => getSignedUrlIfNeeded(url)));
            rawRefBuffers = (await Promise.all(signedRefUrls.map(dlBuf))).filter(Boolean);
        }

        // Download logo URL to buffer
        let rawLogoBuffer = null;
        let signedLogoUrl = logoUrl;
        if (logoUrl) {
            signedLogoUrl = await getSignedUrlIfNeeded(logoUrl);
            rawLogoBuffer = await dlBuf(signedLogoUrl);
        }

        console.log(`[Storyboard Regen Poster] products=${rawProductBuffers.length}, avatars=${rawAvatarBuffers.length} (${avatarNames.join(', ') || 'unnamed'}), refs=${rawRefBuffers.length}, logo=${!!rawLogoBuffer}, panels=${panelCount}, model=${imageModel}`);

        // Import frame generator
        const { generateStoryboardPoster } = await import('../agents/videoStudio/storyboardFrames.js');

        const posterDataUrl = await generateStoryboardPoster(
            imagePrompt, style, format,
            signedProductUrls,     // signed S3 URL fallback
            signedAvatarUrl,       // legacy single avatar URL (first)
            imageModel,
            rawProductBuffers,     // actual product pixel data
            rawAvatarBuffer,       // legacy single avatar buffer (first)
            '2K',
            signedLogoUrl,
            rawLogoBuffer,
            // ── Multi-character + ref image params ──
            signedAvatarUrls,      // all avatar URLs
            avatarNames,           // character names
            rawAvatarBuffers,      // all avatar buffers
            signedRefUrls,         // ref image URLs
            rawRefBuffers,         // ref image buffers
            panelCount,            // dynamic panel count from saved plan
        );

        if (!posterDataUrl) throw new Error('Poster generation failed');

        // Upload data URI → S3
        let posterUrl = posterDataUrl;
        if (posterDataUrl.startsWith('data:')) {
            posterUrl = await ensureS3Url(posterDataUrl, `storyboard/posters/${req.user._id}`).catch(() => posterDataUrl);
        }

        // Video prompt is NOT recreated here — it will be generated fresh at animate-time
        // by generateAnimateVideoPrompt() with correct @imageN tags.

        // Update the storyboard in DB if projectId provided
        if (projectId) {
            await VideoProject.findByIdAndUpdate(projectId, {
                $set: {
                    'storyboard.imageUrl': posterUrl,
                    'storyboard.imagePrompt': imagePrompt,
                    'storyboard.dialogueLanguage': dialogueLanguageSelected,
                    'storyboard.videoPrompt': '',  // clear stale video prompt — regenerated fresh at animate-time
                }
            });
        }

        const signedImageUrl = await getSignedUrlIfNeeded(posterUrl);
        clearInterval(keepAliveInterval);
        res.end(JSON.stringify({ 
            success: true, 
            imageUrl: signedImageUrl,
            // videoPrompt not returned — it is generated fresh at animate-time
        }));
    } catch (err) {
        clearInterval(keepAliveInterval);
        console.error('[Storyboard Regen Poster] Error:', err.message);
        if (!res.headersSent) {
            res.status(500);
        }
        res.end(JSON.stringify({ success: false, error: safeErrorMessage(err) }));
    }
});


// ── generateAnimateVideoPrompt ────────────────────────────────────────────────
// Generates a video prompt AFTER storyboard approval, with correct @imageN tags
// mapping each reference image to its exact role in the video generation call.
//
// Reference image order passed to the video model:
//   Position 1 (imageUrl / I2V first frame): product image 1
//   Position 2 (ref[0]): storyboard poster  → @image2 (style reference)
//   Position 3 (ref[1]): product image 2+   → @image3 (extra product ref)
//   Position 4 (ref[2]): avatar/face        → @image4 (presenter)
//   Position 5 (ref[3]): logo               → @image5 (brand logo)
//
// The exact slot indices match what AtlasCloud/Seedance see when we pass
// imageUrl as the first frame + referenceImages as additional inputs.
//
async function generateAnimateVideoPrompt({
    brief,
    productName,
    productFeatures,
    storyboardPosterUrl,   // approved storyboard poster
    productImageUrls = [], // product images from DB
    avatarUrl = null,
    logoUrl = null,
    duration,
    format,
    style,
    dialogueLanguage = 'English',
    brandContext = '',
    existingVideoPrompt = '',
    firstFrameIsAvatar = false, // true when avatar is used as first frame (no product images)
    structuredPlan = null,     // 4-section storyboard plan from DB (new)
    includeBranding = true,    // when false: strip all brand CTA, logo, brand context
    model = 'seedance-2.0',    // default model
}) {
    // Enforce branding toggle
    if (!includeBranding) {
        brandContext = '';
        logoUrl = null;
    }

    // Build the precise @imageN tag mapping so Claude can write them correctly.
    // The video model sees: firstFrame then referenceImages in order.
    // @image1 = the I2V first frame (product image OR avatar if no product images).
    // @image2 = storyboard poster (always in slot 2 of combinedReferences).
    const tagMap = [];

    if (firstFrameIsAvatar) {
        tagMap.push(`@image1 = Avatar / Presenter image (first frame / I2V anchor) — the presenter's face and body. The video OPENS with this person in frame.`);
    } else {
        tagMap.push(`@image1 = Product image (first frame / I2V anchor) — "${productName || 'the product'}". This is the opening visual frame of the video.`);
    }
    tagMap.push(`@image2 = Storyboard poster (visual style reference) — Use this as the overall style guide for colour grading, mood, layout, and composition.`);

    let nextTag = 3;
    for (let i = 0; i < productImageUrls.length; i++) {
        tagMap.push(`@image${nextTag++} = Product reference image ${i + 1} — "${productName || 'product'}" appearance reference.`);
    }
    if (avatarUrl) {
        tagMap.push(`@image${nextTag++} = Avatar / Presenter reference — the human presenter's exact face and identity.`);
    }
    if (logoUrl) {
        tagMap.push(`@image${nextTag++} = Brand logo reference — show this exact logo during the closing shot or overlay.`);
    }

    // ── Build a rich structured context block from the 4-section plan ──────────
    // When structuredPlan is available, Claude gets the full cinematic blueprint:
    // materials, environment, timed cut list, emotional arc, lighting rules.
    // This produces a far more precise video prompt than a generic brief.
    let structuredContext = '';
    if (structuredPlan && Array.isArray(structuredPlan.cuts) && structuredPlan.cuts.length > 0) {
        console.log(`[generateAnimateVideoPrompt] Using structured plan — ${structuredPlan.cuts.length} cuts`);

        // Build timed cut list with attire/staging from framePrompt
        let elapsed = 0;
        // Pre-sanitize cut content before Claude sees it (RC#6/7)
        // structuredPlan is stored in MongoDB from the original storyboard which may
        // contain deity/religious terms that must not be echoed into the generated videoPrompt.
        let sanitizeRawTextFn = (t) => t;
        try {
            const { sanitizeRawText } = await import('../agents/videoStudio/promptSanitizer.js');
            sanitizeRawTextFn = sanitizeRawText;
        } catch (e) { /* graceful fallback */ }

        const cutLines = structuredPlan.cuts.map(cut => {
            const start = elapsed;
            const end = elapsed + cut.duration;
            elapsed = end;
            // Sanitize scene and framePrompt to remove deity/religious terms from LLM context
            const safeScene = sanitizeRawTextFn(cut.scene || '');
            const safeFramePrompt = sanitizeRawTextFn(cut.framePrompt || '');
            // Include framePrompt as attire/staging directive (truncated to avoid token bloat)
            const attireLine = safeFramePrompt && safeFramePrompt.trim().length > 10
                ? `\n      → Attire/Staging: ${safeFramePrompt.substring(0, 150)}`
                : '';
            return `  CUT ${cut.id} [${start}s–${end}s] ${cut.duration}s | ${cut.lens} | ${cut.shot} | ${cut.move}\n      Scene: ${safeScene}${attireLine}`;
        }).join('\n');


        const colorStr = structuredPlan.colorPalette?.length
            ? structuredPlan.colorPalette.map((hex, i) => `${hex} (${structuredPlan.paletteNames?.[i] || ''})`).join(', ')
            : '';

        // Build character identity lock block for the prompt
        const charLockBlock = avatarUrl
            ? `\nCHARACTER IDENTITY LOCK (mandatory for entire video):
The character reference image defines FACE, HAIR, SKIN TONE only.
Wardrobe/costume is defined per-cut in the CUT PLAN below — follow it EXACTLY for each cut.
Do NOT carry the reference image's outfit into any cut that specifies a different costume.\n`
            : '';

        structuredContext = `
═══════════════════════════════════════════════════════
STRUCTURED STORYBOARD PLAN (4-SECTION BRIEF)
═══════════════════════════════════════════════════════
${charLockBlock}
── SECTION 1: CHARACTER + PRODUCT DNA ──
Color Palette: ${colorStr || 'See storyboard poster'}
Materials in scene: ${structuredPlan.materialNotes || 'See storyboard poster'}

── SECTION 2: ENVIRONMENT (constant across ALL cuts) ──
Set: ${structuredPlan.environmentFingerprint || 'See storyboard poster'}
IMPORTANT: The background / environment NEVER changes between cuts.

── SECTION 3: CUT PLAN (MANDATORY TIMING — each cut duration is non-negotiable) ──
Total: ${duration}s across ${structuredPlan.cuts.length} cuts
${cutLines}

── SECTION 4: LIGHTING / MOOD / STYLE ──
Mood: ${structuredPlan.moodKeywords?.join(', ') || ''}
Cinematography rules: ${structuredPlan.cinematographyRules || ''}
Emotional arc: ${structuredPlan.emotionalArc || ''}
Narrative: ${structuredPlan.narrativeArc || ''}
═══════════════════════════════════════════════════════

YOUR PRIMARY TASK: Translate each CUT from the plan above into precise Seedance video generation instructions.
For EACH cut, you MUST specify:
  - Exact timing [Xs–Ys] (from the plan — do not change these)
  - Lens, shot type, camera movement as listed
  - What the subject does, how the product moves, the emotional beat
  - The exact costume/attire stated in the cut's Attire/Staging line
  - Any spoken dialogue or VO in ${dialogueLanguage}
The environment (${structuredPlan.environmentFingerprint}) must remain visually consistent throughout.`;
    } else {
        console.log(`[generateAnimateVideoPrompt] No structuredPlan — using generic prompt`);
    }

    const brandingRule = includeBranding
        ? '8. End with a cinematic brand CTA / closing shot — this must appear ONCE at the very end of the ENTIRE video, not repeated per segment.'
        : '8. NO brand logo, NO brand CTA, NO brand closing shot. End with a strong cinematic close. No branding elements whatsoever.';

    const openingInstruction = 'Use the attached storyboard image (@image2) as the VISUAL STYLE REFERENCE ONLY. Do NOT open the video with this storyboard grid — the video must open with @image1.';

    const isGeminiFlash = model === 'gemini-flash';

    const systemPrompt = isGeminiFlash
        ? `You are a world-class AI Film Director specializing in writing video generation prompts for Google Gemini Omni Flash Image-to-Video.

Your task: Write a single, continuous cinematic narrative prose prompt (NOT a shot list) that will animate an approved storyboard into a high-end commercial video.

CRITICAL PROMPT RULES:
1. MUST start with: "${openingInstruction}"
2. The video OPENS with @image1 (${firstFrameIsAvatar ? 'the presenter/avatar' : 'the product image'}) as the first frame.
3. Use @imageN tags precisely. The mapping is:
${tagMap.map(t => `   ${t}`).join('\n')}
4. Write ONE continuous cinematic narrative prose describing the scene-by-scene action. Use camera terms: slow push-in, handheld, overhead pan, rack-focus.
5. MANDATORY DIALOGUES: Write all spoken dialogues / voiceover in ${dialogueLanguage} script directly inside the prompt.
6. Specify timing for the cuts in the narrative prose.
7. Describe product interaction: how the product is handled, held, or shown.
${brandingRule}
9. 300–600 words. Extremely specific. Directly executable by Gemini Omni Flash.
10. Return ONLY the raw video prompt text. No JSON, no markdown, no explanation.
11. NO TEXT OR LOGO RENDERING (CRITICAL): Do not describe specific text, letters, slogans, or logos on the product, screen, or background. Describe packaging and labels generically (e.g. "a sleek amber glass bottle with a clean white label", NOT "says 'GLOW' on the front"). Video generation models fail at rendering written text and instead produce garbled, hallucinatory letter-like shapes. Keep all scenes, products, and backgrounds completely text-free and logo-free.
12. CRITICAL DESIGN AND COLOR FIDELITY: You must explicitly instruct the video AI model to preserve the original product design, shape, colors, branding, labels, and packaging details exactly as shown in the reference image. Under no circumstances should the product's colors, branding, or design elements be altered, simplified, or stylized. The brand colors must only be applied to the environment, background, or graphics, never to recolor or color-shift the product itself.`
        : `You are a world-class AI Film Director specializing in writing video generation prompts for Seedance / Atlas video AI models.

Your task: Write a single, richly detailed, cinematic VIDEO PROMPT that will animate an approved storyboard into a high-end commercial video.

CRITICAL PROMPT RULES:
1. MUST start with: "${openingInstruction}"
2. The video OPENS with @image1 (${firstFrameIsAvatar ? 'the presenter/avatar' : 'the product image'}) as the first frame.
3. Use @imageN tags precisely. The mapping is:
${tagMap.map(t => `   ${t}`).join('\n')}
4. Use professional cinematography terms: rack focus, dolly zoom, kinetic whip-pans, 3D tracking cameras, slow-motion.
5. MANDATORY DIALOGUES: Write all spoken dialogues / voiceover in ${dialogueLanguage} script directly inside the prompt.
6. Specify EXACT shot durations that sum to ${duration}s total — follow the cut plan if provided.
7. Describe product interaction: how the product moves, catches light, is handled.
${brandingRule}
9. 300–600 words. Extremely specific. Directly executable by Seedance.
10. Return ONLY the raw video prompt text. No JSON, no markdown, no explanation.
11. CRITICAL DESIGN AND COLOR FIDELITY: You must explicitly instruct the video AI model to preserve the original product design, shape, colors, branding, labels, and packaging details exactly as shown in the reference image. Under no circumstances should the product's colors, branding, or design elements be altered, simplified, or stylized. The brand colors must only be applied to the environment, background, or graphics, never to recolor or color-shift the product itself.`;

    const userPrompt = `APPROVED STORYBOARD STYLE (from @image2 poster):
IMPORTANT: @image2 is a STORYBOARD STYLE REFERENCE GRID — NOT the opening frame. The video must OPEN with @image1.

CREATIVE BRIEF: "${brief || 'Create a high-energy, cinematic ad film.'}"
PRODUCT: ${productName || 'See @image1'}
KEY FEATURES: ${productFeatures || 'Highlight from product images'}
VIDEO DURATION: ${duration}s | FORMAT: ${format} | STYLE: ${style}
DIALOGUE LANGUAGE: ${dialogueLanguage}
AVATAR PRESENT: ${avatarUrl ? `YES — presenter's face is in @image${nextTag - (logoUrl ? 2 : 1)}` : 'NO'}
BRAND LOGO: ${logoUrl ? `YES — logo appears in @image${nextTag - 1}` : 'NO'}
BRANDING ENABLED: ${includeBranding ? 'YES — end with brand CTA in final seconds only' : 'NO — absolutely no brand logo, no CTA, no closing brand shot'}
${structuredContext}
${existingVideoPrompt ? `\nREFERENCE VIDEO PROMPT (improve and correct @imageN tags):\n"${existingVideoPrompt.substring(0, 600)}"\n` : ''}
Write the final video prompt now. Follow the cut plan timings exactly. Ensure every @imageN tag matches the mapping above.`;

    const visionImages = [];
    if (storyboardPosterUrl?.startsWith('http')) visionImages.push(storyboardPosterUrl);
    for (const url of (productImageUrls || []).filter(u => u?.startsWith('http'))) {
        if (!visionImages.includes(url)) visionImages.push(url);
    }
    if (avatarUrl?.startsWith('http') && !visionImages.includes(avatarUrl)) {
        visionImages.push(avatarUrl);
    }
    if (logoUrl?.startsWith('http') && !visionImages.includes(logoUrl)) {
        visionImages.push(logoUrl);
    }

    const { callMultimodalAgent } = await import('../agents/shared/agentUtils.js');
    const rawPrompt = await callMultimodalAgent(
        systemPrompt,
        userPrompt,
        visionImages,
        { temperature: 0.72, maxTokens: 2500, returnRaw: true, provider: 'claude' }
    );

    if (!rawPrompt || typeof rawPrompt !== 'string' || rawPrompt.error) {
        throw new Error(rawPrompt?.error || 'Empty or invalid response from LLM');
    }

    let cleaned = (rawPrompt || '').trim()
        .replace(/^```(?:json)?[\s\S]*?```$/m, '')
        .replace(/^\{[\s\S]*?"videoPrompt"\s*:\s*"/, '')
        .replace(/"\s*\}$/, '')
        .replace(/^"+|"+$/g, '')
        .trim();

    if (!cleaned || cleaned.length < 50) {
        throw new Error('Video prompt generation returned empty result');
    }

    // RC#6/7 post-LLM sanitization: Claude may have paraphrased or echoed deity/religious
    // terms from the structuredPlan even after input sanitization. Run as final safety net.
    try {
        const { sanitizeRawText } = await import('../agents/videoStudio/promptSanitizer.js');
        const safeCleaned = sanitizeRawText(cleaned);
        if (safeCleaned !== cleaned) {
            console.log(`[generateAnimateVideoPrompt] ⚠️ RC#6/7 post-LLM sanitization removed trigger terms`);
            cleaned = safeCleaned;
        }
    } catch (sanitizeErr) {
        console.warn(`[generateAnimateVideoPrompt] sanitizeRawText import failed: ${sanitizeErr.message}`);
    }

    return cleaned;
}


// ── POST /api/video-studio/storyboard/animate ────────────────────────────────
// Step 3: Animate each storyboard frame via I2V (Seedance 2.0)
// After all shots done (>15s total), auto-stitch into final film
//
// CREDIT GATE STRATEGY:
//   ≤15s  → requireCredits('storyboardAnimate')        — applied inline
//   >15s  → requireCredits('storyboardAnimateLongForm')  — applied inline
// We cannot select the key at route-definition time because it depends on req.body.duration,
// so we use a wrapper handler that calls the correct middleware first, then runs the business logic.
router.post('/storyboard/animate', protect, async (req, res) => {
    try {
        const rawDuration  = parseInt(req.body.duration) || 10;
        const modelParam   = req.body.model || 'seedance-2.0-fast';
        const isLongForm   = (modelParam === 'gemini-flash' || modelParam === 'gemini-omni-flash') ? rawDuration > 10 : rawDuration > 15;
        const creditAction = isLongForm ? 'storyboardAnimateLongForm' : 'storyboardAnimate';

        await new Promise((resolve, reject) =>
            requireCredits(creditAction)(req, res, (err) => err ? reject(err) : resolve())
        );
        if (res.headersSent) return;

        const {
            projectId,
            imageUrl: _imageUrlFromClient,  // ← storyboard poster URL (approved by user)
            videoPrompt: clientVideoPrompt,
            duration,
            format = '9:16',
            resolution = '480p',
            productImageUrls = [],
            // Multi-avatar from frontend
            avatarUrls: bodyAvatarUrls,
            avatarUrl,
            model = 'seedance-2.0-fast',
            // Generation mode: 'automatic' (default) | 'manual'
            generateMode = 'automatic',
            audioSync,
            voiceoverScript,
        } = req.body;

        // Mutable — may be re-signed or overridden by DB copy below
        let imageUrl = _imageUrlFromClient;

        if (!imageUrl) return res.status(400).json({ success: false, error: 'No imageUrl provided' });

        // ── Load full context from DB ─────────────────────────────────────────
        let dbProductImgs = [];
        let dbAvatar = null;             // legacy compat (first avatar)
        let dbAvatarUrls = [];           // all avatar URLs (multi-character)
        let dbAvatarNames = [];          // character names
        let dbRefImageUrls = [];         // location/element ref images
        let dbBrief = '';
        let dbProductName = '';
        let dbProductFeatures = '';
        let dbFormat = format;
        let dbStyle = 'hyperrealistic';
        let dbDialogueLanguage = 'English';
        let dbBrandContext = '';
        let dbLogoUrl = null;
        let dbStructuredPlan = null;
        let dbIncludeBranding = true;    // branding flag — read from DB below
        let dbCharRefSheetUrl = null;    // pre-generated character reference sheet URL
        let dbRefAudio = '';
        let dbAudioSync = true;

        if (projectId) {
            const project = await VideoProject.findById(projectId)
                .populate('brand', 'name dna')
                .lean();
            if (project) {
                const rawProductImgs = (project.input?.images || []).map(img => img.url).filter(Boolean);
                // Multi-avatar: read avatarUrls[] with fallback to legacy avatarUrl
                const rawAvatarUrls  = project.input?.avatarUrls?.length > 0
                    ? project.input.avatarUrls
                    : (project.input?.avatarUrl ? [project.input.avatarUrl] : []);
                dbAvatarNames        = project.input?.avatarNames || [];
                dbRefImageUrls       = project.input?.refImageUrls || [];
                dbBrief              = project.input?.brief || '';
                dbProductName        = project.input?.productName || '';
                dbProductFeatures    = project.input?.productFeatures || '';
                dbRefAudio           = project.refAudio || '';
                dbFormat             = project.storyboard?.format || format;
                dbStyle              = project.storyboard?.style || 'hyperrealistic';
                dbDialogueLanguage   = project.storyboard?.dialogueLanguage || 'English';
                dbStructuredPlan     = project.storyboard?.structuredPlan || null;
                dbAudioSync          = project.storyboard?.audioSync !== false;
                // Read branding toggle from DB
                if (typeof project.storyboard?.includeBranding === 'boolean') {
                    dbIncludeBranding = project.storyboard.includeBranding;
                }
                // Read pre-generated character reference sheet
                dbCharRefSheetUrl = project.storyboard?.characterRefSheetUrl || null;

                // Sign all product image URLs
                dbProductImgs = await Promise.all(rawProductImgs.map(url => getSignedUrlIfNeeded(url)));
                // Sign all avatar URLs
                dbAvatarUrls  = await Promise.all(rawAvatarUrls.map(url => getSignedUrlIfNeeded(url)));
                dbAvatar      = dbAvatarUrls[0] || null; // legacy compat

                // Re-sign the storyboard poster URL
                const rawDbPosterUrl = project.storyboard?.imageUrl || null;
                const posterSource = rawDbPosterUrl || imageUrl;
                if (posterSource) {
                    try {
                        imageUrl = await getSignedUrlIfNeeded(posterSource);
                        console.log(`[Storyboard Animate] Poster URL re-signed from ${rawDbPosterUrl ? 'DB' : 'client'}: ${imageUrl.substring(0, 80)}...`);
                    } catch (signErr) {
                        console.warn(`[Storyboard Animate] Could not re-sign poster URL: ${signErr.message}`);
                    }
                }

                if (project.brand?.dna) {
                    const dna = project.brand.dna;
                    // Only load brand DNA if branding is ON
                    if (dbIncludeBranding) {
                        dbLogoUrl = dna.logo?.url || null;
                        const desc = dna.brandDescription || dna.companyOverview || '';
                        const tagline = dna.tagline || '';
                        const personality = dna.voice?.personality || '';
                        const voiceDesc = dna.voice?.description || '';
                        const usps = Array.isArray(dna.uniqueSellingPoints) ? dna.uniqueSellingPoints.join(', ') : '';
                        dbBrandContext = `Brand: ${project.brand.name || ''}\nTagline: ${tagline}\nDescription: ${desc}\nPersonality: ${personality} - ${voiceDesc}\nUSPs: ${usps}`;
                        if (dbLogoUrl) dbLogoUrl = await getSignedUrlIfNeeded(dbLogoUrl);
                    } else {
                        console.log(`[Storyboard Animate] includeBranding=false — skipping brand context and logo`);
                    }
                }
                console.log(`[Storyboard Animate] DB: ${dbProductImgs.length} product imgs, ${dbAvatarUrls.length} avatars, ${dbRefImageUrls.length} refs, logo=${!!dbLogoUrl}, branding=${dbIncludeBranding}, charSheet=${!!dbCharRefSheetUrl}`);
            }
        }

        // Fallback to body params
        if (dbProductImgs.length === 0 && productImageUrls) {
            const parsed = typeof productImageUrls === 'string' ? JSON.parse(productImageUrls) : (productImageUrls || []);
            dbProductImgs = parsed.filter(u => u?.startsWith('http'));
        }
        // Fallback avatars from body (frontend sends avatarUrls[])
        if (dbAvatarUrls.length === 0 && bodyAvatarUrls) {
            const parsed = Array.isArray(bodyAvatarUrls) ? bodyAvatarUrls : [bodyAvatarUrls];
            dbAvatarUrls = parsed.filter(u => u?.startsWith('http'));
            dbAvatar = dbAvatarUrls[0] || null;
        }
        if (dbAvatarUrls.length === 0 && avatarUrl) {
            dbAvatarUrls = [avatarUrl];
            dbAvatar = avatarUrl;
        }

        // ── Reference image routing ────────────────────────────────────────────
        //
        // NEW DESIGN:
        //   @image1  = product image 1      → I2V first frame (opening shot)
        //   @image2  = storyboard poster    → visual style reference (colour grade, mood, composition)
        //   @image3+ = extra product images → additional product angles
        //   @imageN  = avatar               → presenter identity
        //   @imageN+1= brand logo           → closing shot overlay
        //
        // The storyboard poster is NEVER used as a video first frame.
        // It is a style reference — it defines what the video should LOOK LIKE, not what it starts with.

        const firstFrameUrl = dbProductImgs[0] || dbAvatarUrls[0] || null;

        // Determine if first frame is a product or avatar (affects @image1 tag description)
        const firstFrameIsProduct = !!dbProductImgs[0];
        const firstFrameIsAvatar = !dbProductImgs[0] && dbAvatarUrls.length > 0;

        // ── Character reference sheet handling ─────────────────────────────────
        // If a consolidated character ref sheet was generated at storyboard creation time,
        // use it as the PRIMARY character reference (single stable @imageN slot).
        // Otherwise fall back to individual avatar URLs.
        let dbCharRefSheetUrlSigned = null;
        if (dbCharRefSheetUrl) {
            try { dbCharRefSheetUrlSigned = await getSignedUrlIfNeeded(dbCharRefSheetUrl); }
            catch { dbCharRefSheetUrlSigned = dbCharRefSheetUrl; }
        }

        // Multi-avatar: each avatar gets its own character_reference entry (fallback if no sheet)
        const avatarRefs = dbCharRefSheetUrlSigned
            ? [{ url: dbCharRefSheetUrlSigned, role: 'character_reference' }]
            : dbAvatarUrls.map((url, i) => ({
                url,
                role: 'character_reference',
                name: dbAvatarNames[i] || `Character ${i + 1}`,
              }));

        const combinedReferences = [
            { url: imageUrl, role: 'style_reference' },           // storyboard poster style guide
            ...dbProductImgs.map(url => ({ url, role: 'product' })),
            ...avatarRefs,                                         // char ref sheet OR individual avatars
            ...(dbLogoUrl ? [{ url: dbLogoUrl, role: 'logo' }] : []),
        ];

        // For long-form segments — same but without poster (storyboardLongForm.js adds it per-segment)
        const longFormRefs = [
            ...dbProductImgs.map(url => ({ url, role: 'product' })),
            ...avatarRefs,
            ...(dbLogoUrl ? [{ url: dbLogoUrl, role: 'logo' }] : []),
        ];

        // ── Fix: NEVER use storyboard poster as I2V first frame ─────────────────────
        // imageUrl is the storyboard poster — it is a STYLE REFERENCE only.
        // If no product/avatar image exists, pass null to Atlas → runs text-to-video.
        // This prevents the opening frame from being the storyboard grid sheet.

        console.log(`[Storyboard Animate] ── Reference Routing ──`);
        console.log(`  firstFrameUrl (I2V): ${firstFrameUrl ? firstFrameUrl.substring(0, 80) : 'null (T2V)'}`);
        console.log(`  poster (style ref): ${imageUrl?.substring(0, 80)}`);
        console.log(`  refs: ${combinedReferences.length} | duration=${rawDuration}s | model=${model}`);

        // ── Generate fresh video prompt at animate-time ───────────────────────
        // Generated HERE, after storyboard approval, so every @imageN tag correctly
        // matches the actual image attached to the video generation API call.
        let finalVideoPrompt = clientVideoPrompt || '';
        try {
            console.log(`[Storyboard Animate] Generating fresh video prompt...`);
            finalVideoPrompt = await generateAnimateVideoPrompt({
                brief: dbBrief,
                productName: dbProductName,
                productFeatures: dbProductFeatures,
                storyboardPosterUrl: imageUrl,
                productImageUrls: dbProductImgs,
                avatarUrl: dbAvatar,
                logoUrl: dbLogoUrl,
                duration: rawDuration,
                format: dbFormat,
                style: dbStyle,
                dialogueLanguage: dbDialogueLanguage,
                brandContext: dbBrandContext,
                existingVideoPrompt: clientVideoPrompt || '',
                firstFrameIsAvatar,
                structuredPlan: dbStructuredPlan,
                includeBranding: dbIncludeBranding,  // respect brand toggle
                model, // selected model
            });
            console.log(`[Storyboard Animate] Video prompt (first 120): ${finalVideoPrompt.substring(0, 120)}...`);
            if (projectId) {
                await VideoProject.findByIdAndUpdate(projectId, {
                    $set: { 'storyboard.videoPrompt': finalVideoPrompt }
                });
            }
        } catch (promptErr) {
            console.warn(`[Storyboard Animate] Prompt gen failed, using fallback: ${promptErr.message}`);
            finalVideoPrompt = clientVideoPrompt || 'Use the attached storyboard image (@image2) as the visual style reference. Open with the product shown in @image1. Animate with cinematic camera movements. Maintain exact product appearance throughout. Build to a compelling brand close.';
        }

        // ══════════════════════════════════════════════════════════════════════
        // LONG-FORM PATH (>15s) — fire and forget, return jobId for polling
        // ══════════════════════════════════════════════════════════════════════
        if (isLongForm) {
            const voiceoverScript   = req.body.voiceoverScript || '';
            const voiceoverLanguage = req.body.dialogueLanguage || req.body.voiceoverLanguage || dbDialogueLanguage;
            const bgmPreset         = req.body.bgmPreset || 'cinematic';
            const qualityMode       = model === 'seedance-2.0' ? 'quality' : 'fast';

            const jobId = startStoryboardLongForm({
                projectId: projectId || null,
                userId: req.user._id,
                imageUrl,           // storyboard poster → style ref injected per-segment in storyboardLongForm.js
                firstFrameUrl: firstFrameUrl || null,  // FIX: NEVER fall back to poster URL
                videoPrompt: finalVideoPrompt,
                totalDuration: rawDuration,
                format: dbFormat,
                resolution,
                referenceImages: longFormRefs,
                model,
                qualityMode,
                voiceoverScript,
                voiceoverLanguage,
                bgmPreset,
                // ── Multi-character support ──
                avatarUrls:  dbAvatarUrls,
                avatarNames: dbAvatarNames,
                refImageUrls: dbRefImageUrls,
                // ── Branding control ──
                includeBranding: dbIncludeBranding,
                // ── Character reference sheet ──
                characterRefSheetUrl: dbCharRefSheetUrlSigned || null,
                // ── Structured plan: director's cuts[] for exact per-segment timing ──
                structuredPlan: dbStructuredPlan || null,
                // ── Generation mode (automatic | manual) ──
                generateMode,
                // ── Uploaded audio brief ──
                refAudio: (audioSync !== false && audioSync !== 'false' && dbAudioSync !== false && dbRefAudio) ? dbRefAudio : '',
            });

            if (projectId) {
                const resolvedAudioSync = audioSync !== undefined ? (audioSync === true || audioSync === 'true') : dbAudioSync;
                await VideoProject.findByIdAndUpdate(projectId, {
                    $set: {
                        'storyboard.longFormJobId': jobId,
                        'storyboard.status': 'animating',
                        'storyboard.totalDuration': rawDuration,
                        'storyboard.voiceoverScript': voiceoverScript,
                        'storyboard.audioSync': resolvedAudioSync,
                        status: 'animating',
                    },
                });
            }

            const estimate = estimateStoryboardLongFormCredits(rawDuration);
            return res.json({
                success: true,
                projectId,
                jobId,
                longForm: true,
                segments: estimate.segments,
                creditsCharged: req.creditsDeducted || 0,
                totalDuration: rawDuration,
                videoPrompt: finalVideoPrompt,  // show to user so they can see what was generated
            });
        }

        // ══════════════════════════════════════════════════════════════════════
        // SINGLE-SHOT PATH (≤15s)
        // ══════════════════════════════════════════════════════════════════════
        let taskId = null;
        try {
            let genResult;
            if (model === 'gemini-flash') {
                genResult = await submitGeminiFlashVideoGeneration({
                    imageUrl: firstFrameUrl || null, // FIX: never use poster as first frame
                    prompt: finalVideoPrompt,
                    duration: duration || 10,
                    aspectRatio: dbFormat,
                    resolution,
                    referenceImages: combinedReferences,
                });
            } else {
                genResult = await submitAtlasCloudVideoGeneration({
                    model,
                    imageUrl: firstFrameUrl || null, // FIX: never use poster as first frame
                    prompt: finalVideoPrompt,
                    duration: duration || 10,
                    aspectRatio: dbFormat,
                    referenceImages: combinedReferences,
                    generateAudio: true,
                    qualityMode: model === 'seedance-2.0' ? 'quality' : 'fast',
                    resolution,
                    imageRole: 'mixed',
                });
            }
            taskId = genResult.taskId;
            if (projectId) {
                const resolvedAudioSync = audioSync !== undefined ? (audioSync === true || audioSync === 'true') : dbAudioSync;
                await VideoProject.findByIdAndUpdate(projectId, {
                    $set: {
                        'storyboard.taskId': taskId,
                        'storyboard.status': 'animating',
                        'storyboard.audioSync': resolvedAudioSync,
                        status: 'animating',
                    }
                });
            }
        } catch (err) {
            console.warn(`[Storyboard Animate] Submission failed: ${err.message}`);
            return res.status(500).json({ success: false, error: err.message });
        }

        res.json({ success: true, projectId, taskId, longForm: false, videoPrompt: finalVideoPrompt });

    } catch (err) {
        if (res.headersSent) return;
        console.error('[Storyboard Animate] Critical Error:', err);
        if (req.creditsDeducted > 0) {
            await refundCredits(req.user._id, req.creditsDeducted, 'storyboardAnimateRefund', `Storyboard animate failed: ${safeErrorMessage(err)}`, 'video');
        }
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});


// ── GET /api/video-studio/storyboard/status/:projectId ───────────────────────
// Poll animation status — handles both single-shot (taskId) and long-form (longFormJobId)
router.get('/storyboard/status/:projectId', protect, async (req, res) => {
    try {
        const project = await VideoProject.findOne({ _id: req.params.projectId, user: req.user._id });
        if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

        const storyboard = project.storyboard || {};

        // ── ALREADY DONE ─────────────────────────────────────────────────────
        if (storyboard.status === 'done' || storyboard.finalVideoUrl) {
            const rawUrl = storyboard.finalVideoUrl || project.finalVideoUrl;
            const signedUrl = await getSignedUrlIfNeeded(rawUrl);
            return res.json({
                success: true, projectId: project._id, allDone: true,
                finalVideoUrl: signedUrl, status: 'COMPLETED', overallProgress: 100,
            });
        }

        // ── FAILED ────────────────────────────────────────────────────────────
        if (storyboard.status === 'failed') {
            return res.json({
                success: true, projectId: project._id, allDone: false,
                anyFailed: true, error: storyboard.error, status: 'FAILED',
            });
        }

        // ══════════════════════════════════════════════════════════════════════
        // LONG-FORM PATH — poll the in-memory job tracker
        // ══════════════════════════════════════════════════════════════════════
        if (storyboard.longFormJobId) {
            const jobStatus = getStoryboardLongFormJobStatus(storyboard.longFormJobId);

            if (!jobStatus) {
                // Job not in memory — either server restarted or it completed
                // Fall through to legacy taskId path or return IN_PROGRESS
                if (!storyboard.taskId) {
                    return res.json({
                        success: true, projectId: project._id, status: 'IN_PROGRESS',
                        overallProgress: storyboard.progress || 10,
                        phaseLabel: 'Processing...', detail: '',
                        isLongForm: true,
                    });
                }
                // (fall through to taskId path)
            } else if (jobStatus.status === 'COMPLETED') {
                // Job completed — videoUrl should already be persisted by auto-persist in storyboardLongForm.js
                const finalUrl = storyboard.finalVideoUrl || jobStatus.videoUrl;
                const signed = finalUrl ? await getSignedUrlIfNeeded(finalUrl) : null;

                if (!storyboard.finalVideoUrl && finalUrl) {
                    // Catch-up persist in case auto-persist had a race condition
                    await VideoProject.findByIdAndUpdate(project._id, {
                        'storyboard.status': 'done',
                        'storyboard.finalVideoUrl': finalUrl,
                        status: 'done', finalVideoUrl: finalUrl,
                    });
                }

                return res.json({
                    success: true, projectId: project._id, allDone: true,
                    finalVideoUrl: signed, status: 'COMPLETED', overallProgress: 100,
                    isLongForm: true,
                });

            } else if (jobStatus.status === 'FAILED') {
                await VideoProject.findByIdAndUpdate(project._id, {
                    'storyboard.status': 'failed',
                    'storyboard.error': jobStatus.error || 'Long-form generation failed',
                });
                return res.json({
                    success: true, projectId: project._id, allDone: false, anyFailed: true,
                    error: jobStatus.error, status: 'FAILED', isLongForm: true,
                });

            } else {
                // IN_PROGRESS — return rich phase info for the frontend progress bar
                const segStatuses = jobStatus.segmentStatuses || [];
                const completedSegs = segStatuses.filter(s => s.status === 'completed').length;
                const totalSegs = segStatuses.length;

                // Build per-segment items with signed URLs for Manual mode gallery
                const items = await Promise.all(segStatuses.map(async (s, i) => ({
                    index:    i,
                    status:   s.status,
                    progress: s.progress || 0,
                    videoUrl: s.videoUrl ? await getSignedUrlIfNeeded(s.videoUrl) : null,
                    prompt:   s.prompt   || '',
                    duration: s.duration || null,
                    error:    s.error    || null,
                })));

                return res.json({
                    success: true, projectId: project._id, allDone: false,
                    status: 'IN_PROGRESS',
                    overallProgress: jobStatus.progress || 10,
                    phaseLabel: jobStatus.phaseLabel || 'Generating...',
                    detail: jobStatus.detail || '',
                    segments: { completed: completedSegs, total: totalSegs, items },
                    isLongForm: true,
                });
            }
        }

        // ══════════════════════════════════════════════════════════════════════
        // SINGLE-SHOT PATH — poll Atlas taskId (original behavior)
        // ══════════════════════════════════════════════════════════════════════
        const taskId = storyboard.taskId;
        if (!taskId) {
            return res.json({
                success: true,
                projectId: project._id,
                allDone: false,
                status: 'NOT_STARTED',
                overallProgress: 0,
                message: 'No active animation task found. Generate script first.'
            });
        }

        try {
            const result = await getUnifiedGenerationStatus('atlascloud', taskId, null, null);

            let updatedStatus = storyboard.status;
            let updatedProgress = storyboard.progress || 10;
            let finalVideoUrl = null;
            let error = null;

            if (result?.status === 'COMPLETED' && result.videoUrl) {
                finalVideoUrl = await ensureS3Url(result.videoUrl, `storyboard/final/${project._id}/final-film.mp4`) || result.videoUrl;
                updatedStatus = 'done';
                updatedProgress = 100;

                await VideoProject.findByIdAndUpdate(project._id, {
                    'storyboard.status': 'done',
                    'storyboard.progress': 100,
                    'storyboard.finalVideoUrl': finalVideoUrl,
                    status: 'done',
                    finalVideoUrl,
                });
            } else if (result?.status === 'FAILED') {
                updatedStatus = 'failed';
                error = result.error || 'Generation failed';
                await VideoProject.findByIdAndUpdate(project._id, {
                    'storyboard.status': 'failed',
                    'storyboard.error': error,
                });
            } else {
                updatedProgress = result?.progress || storyboard.progress || 10;
                await VideoProject.findByIdAndUpdate(project._id, {
                    'storyboard.progress': updatedProgress,
                });
            }

            res.json({
                success: true, projectId: project._id,
                allDone: updatedStatus === 'done',
                anyFailed: updatedStatus === 'failed',
                overallProgress: updatedProgress,
                finalVideoUrl: finalVideoUrl ? await getSignedUrlIfNeeded(finalVideoUrl) : null,
                status: updatedStatus === 'done' ? 'COMPLETED' : updatedStatus === 'failed' ? 'FAILED' : 'IN_PROGRESS',
                isLongForm: false,
            });

        } catch (pollErr) {
            console.warn(`[SB Status] Poll error: ${pollErr.message}`);
            res.json({
                success: true,
                projectId: project._id,
                allDone: false,
                status: 'IN_PROGRESS'
            });
        }
    } catch (err) {
        console.error('[Storyboard Status] Error:', err.message);
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

// ── GET /api/video-studio/storyboard/history ─────────────────────────────────
// Returns user's storyboard project history
router.get('/storyboard/history', protect, async (req, res) => {
    try {
        const projects = await VideoProject.find({
            user: req.user._id,
            studioMode: 'storyboard',
        }).sort({ createdAt: -1 }).limit(20).lean();
        const signedProjects = await signVideoProjectAssets(projects);
        res.json({ success: true, projects: signedProjects });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

// ── POST /api/video-studio/storyboard/regenerate-segment ──────────────────────
// Manual mode: re-generate one segment with an (optionally edited) prompt.
// ASYNC — responds immediately; background job persists result to MongoDB.
// Frontend polls /storyboard/status/:id to pick up the updated segmentUrls.
router.post('/storyboard/regenerate-segment', protect, async (req, res) => {
    try {
        await new Promise((resolve, reject) =>
            requireCredits('storyboardAnimate')(req, res, (err) => err ? reject(err) : resolve())
        );
        if (res.headersSent) return;

        const { projectId, segmentIndex, prompt: userPrompt } = req.body;
        if (!projectId) return res.status(400).json({ success: false, error: 'projectId required' });
        const segIdx = parseInt(segmentIndex);
        if (isNaN(segIdx) || segIdx < 0) return res.status(400).json({ success: false, error: 'Valid segmentIndex required' });

        // Load project
        const project = await VideoProject.findOne({ _id: projectId, user: req.user._id })
            .populate('brand', 'name dna').lean();
        if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

        const sb = project.storyboard || {};

        // Resolve the prompt to use
        const storedPrompts = sb.segmentPrompts || {};
        const storedScenes  = sb.scenes || [];
        const basePrompt = userPrompt
            || storedPrompts[String(segIdx)]
            || storedScenes[segIdx]?.visualPrompt
            || sb.videoPrompt
            || 'Continue the cinematic storyboard sequence.';

        // Determine first frame: for segment 0 use product/avatar, for N>0 use last frame of N-1
        const storedUrls = sb.segmentUrls || {};
        let firstFrameUrl = null;
        if (segIdx === 0) {
            const productImgs = (project.input?.images || []).map(img => img.url).filter(Boolean);
            const avatarUrls  = project.input?.avatarUrls || (project.input?.avatarUrl ? [project.input.avatarUrl] : []);
            firstFrameUrl = productImgs[0] || avatarUrls[0] || null;
            if (firstFrameUrl) firstFrameUrl = await getSignedUrlIfNeeded(firstFrameUrl);
        } else {
            const prevUrl = storedUrls[String(segIdx - 1)];
            if (prevUrl) {
                try {
                    const { extractLastFrameToS3 } = await import('../utils/ffmpegUtils.js');
                    firstFrameUrl = await extractLastFrameToS3(await getSignedUrlIfNeeded(prevUrl));
                } catch {
                    firstFrameUrl = null;
                }
            }
        }

        // Build references (poster + char ref sheet)
        const posterUrl = sb.imageUrl ? await getSignedUrlIfNeeded(sb.imageUrl) : null;
        const charRefUrl = sb.characterRefSheetUrl ? await getSignedUrlIfNeeded(sb.characterRefSheetUrl) : null;

        const characterRefs = [];
        if (charRefUrl) {
            characterRefs.push({ url: charRefUrl, role: 'character_reference' });
        } else {
            // Fall back to individual avatar URLs
            const avatarUrls = project.input?.avatarUrls || (project.input?.avatarUrl ? [project.input.avatarUrl] : []);
            const avatarNames = project.input?.avatarNames || [];
            for (let i = 0; i < avatarUrls.length; i++) {
                const url = avatarUrls[i];
                if (url) {
                    const signedUrl = await getSignedUrlIfNeeded(url);
                    characterRefs.push({
                        url: signedUrl,
                        role: 'character_reference',
                        name: avatarNames[i] || `Character ${i + 1}`
                    });
                }
            }
        }

        // Location/element refs
        const refImageUrls = project.input?.refImageUrls || [];
        const locationRefs = [];
        for (let i = 0; i < refImageUrls.length; i++) {
            const url = refImageUrls[i];
            if (url) {
                const signedUrl = await getSignedUrlIfNeeded(url);
                locationRefs.push({
                    url: signedUrl,
                    role: 'location_reference',
                    name: `ref_${i + 1}`
                });
            }
        }

        const references = [
            ...(posterUrl ? [{ url: posterUrl, role: 'style_reference' }] : []),
            ...characterRefs,
            ...locationRefs,
        ];

        const duration = storedScenes[segIdx]?.duration || 10;
        const format   = sb.format || '9:16';
        const resolution = project.routing?.resolution || '480p';
        const model = project.routing?.selectedModel || 'seedance-2.0-fast';
        const qualityMode = model === 'seedance-2.0' ? 'quality' : 'fast';

        console.log(`[SB RegenSeg] Project=${projectId} seg=${segIdx} dur=${duration}s — submitting async`);

        // Submit to Atlas — uses statically imported submitAtlasCloudVideoGeneration
        const genResult = await submitAtlasCloudVideoGeneration({
            model,
            prompt:          basePrompt,
            imageUrl:        firstFrameUrl || null,
            duration,
            aspectRatio:     format,
            generateAudio:   true,
            referenceImages: references.slice(0, 6),
            qualityMode,
            resolution,
            imageRole: 'mixed',
        });

        const taskId = genResult.taskId || genResult.requestId;

        // Mark segment as 'regenerating' in MongoDB immediately
        const longFormJobId = sb.longFormJobId;
        await VideoProject.findByIdAndUpdate(projectId, {
            [`storyboard.segmentUrls.${segIdx}`]:    null,
            [`storyboard.segmentPrompts.${segIdx}`]: basePrompt,
        });

        // Update in-memory job if still alive
        if (longFormJobId) {
            const jobStatus = getStoryboardLongFormJobStatus(longFormJobId);
            if (jobStatus?.segmentStatuses?.[segIdx]) {
                jobStatus.segmentStatuses[segIdx] = { status: 'generating', progress: 0, prompt: basePrompt, duration };
            }
        }

        // Respond immediately — client polls /storyboard/status/:id
        res.json({ success: true, segmentIndex: segIdx, taskId, status: 'regenerating', prompt: basePrompt });

        // Background: poll Atlas → persist → update in-memory
        ;(async () => {
            const maxMs = 12 * 60 * 1000;
            const start = Date.now();
            let newVideoUrl = null;
            try {
                while (Date.now() - start < maxMs) {
                    await new Promise(r => setTimeout(r, 6000));
                    const status = await pollAtlasCloudStatus(taskId);
                    if (status.status === 'COMPLETED' && status.videoUrl) { newVideoUrl = status.videoUrl; break; }
                    if (status.status === 'FAILED') throw new Error(status.error || 'unknown');
                }
                if (!newVideoUrl) throw new Error('timed out');
                await VideoProject.findByIdAndUpdate(projectId, {
                    [`storyboard.segmentUrls.${segIdx}`]: newVideoUrl,
                });
                if (longFormJobId) {
                    const jb = getStoryboardLongFormJobStatus(longFormJobId);
                    if (jb?.segmentStatuses?.[segIdx]) {
                        jb.segmentStatuses[segIdx] = { status: 'completed', progress: 100, videoUrl: newVideoUrl, prompt: basePrompt, duration };
                    }
                }
                console.log(`[SB RegenSeg] ✅ Seg ${segIdx + 1} done`);
            } catch (bgErr) {
                console.error(`[SB RegenSeg] ❌ Seg ${segIdx + 1} bg failed: ${bgErr.message}`);
                if (longFormJobId) {
                    const jb = getStoryboardLongFormJobStatus(longFormJobId);
                    if (jb?.segmentStatuses?.[segIdx]) jb.segmentStatuses[segIdx] = { status: 'failed', error: bgErr.message, prompt: basePrompt, duration };
                }
                refundCredits(req.user._id, req.creditsDeducted || 0, 'storyboardRegenRefund', `Regen seg ${segIdx + 1} failed: ${bgErr.message}`, 'video').catch(() => {});
            }
        })();

    } catch (err) {
        console.error('[SB RegenSeg] Error:', err.message);
        if (!res.headersSent) {
            if (req.creditsDeducted > 0) await refundCredits(req.user._id, req.creditsDeducted, 'storyboardRegenRefund', `Regen seg setup failed`, 'video').catch(() => {});
            res.status(500).json({ success: false, error: safeErrorMessage(err) });
        }
    }
});

// ── POST /api/video-studio/storyboard/compile ─────────────────────────────────
// Manual mode: stitch all ready segment URLs from MongoDB into a final MP4.
// Free of credits — segments are already paid for. Skips null/empty slots.
router.post('/storyboard/compile', protect, async (req, res) => {
    let tmpDir = null;
    try {
        const { projectId } = req.body;
        if (!projectId) return res.status(400).json({ success: false, error: 'projectId required' });

        const project = await VideoProject.findOne({ _id: projectId, user: req.user._id }).lean();
        if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

        const sb = project.storyboard || {};
        const segmentUrls = sb.segmentUrls || {};

        // Build ordered list of available segment URLs (skip null/empty slots)
        const indices = Object.keys(segmentUrls)
            .map(Number)
            .filter(i => !!segmentUrls[String(i)])
            .sort((a, b) => a - b);
        if (indices.length === 0) {
            return res.status(400).json({ success: false, error: 'No completed segments to compile' });
        }

        // Sign all segment URLs
        const orderedUrls = await Promise.all(
            indices.map(i => getSignedUrlIfNeeded(segmentUrls[String(i)]))
        );

        const format = sb.format || '9:16';
        console.log(`[SB Compile] Project=${projectId} | ${orderedUrls.length} segments | format=${format}`);

        // Download + stitch
        const { filePath, tmpDir: dir } = await stitchSegments(orderedUrls, format, String(projectId).slice(-6));
        tmpDir = dir;

        let finalPath = filePath;
        const refAudio = (sb.audioSync !== false) ? (project.refAudio || '') : '';
        if (refAudio) {
            try {
                console.log(`[SB Compile] Mixing brief audio ref: ${refAudio}`);
                const refAudioLocalPath = path.join(tmpDir, 'brief-audio-ref.mp3');
                const signedRefAudio = await getSignedUrlIfNeeded(refAudio);
                const audioResp = await fetch(signedRefAudio);
                if (audioResp.ok) {
                    fs.writeFileSync(refAudioLocalPath, Buffer.from(await audioResp.arrayBuffer()));
                    const { mixAudioAndMux } = await import('../../utils/ffmpegUtils.js');
                    finalPath = await mixAudioAndMux(filePath, refAudioLocalPath, null, tmpDir);
                    console.log(`[SB Compile] Audio mixed: ${finalPath}`);
                }
            } catch (mixErr) {
                console.warn(`[SB Compile] Failed to mix audio: ${mixErr.message}`);
            }
        }

        // Upload to S3 (statically imported at top of file)
        const finalBuffer = fs.readFileSync(finalPath);
        const s3Key = `storyboard/longform/${projectId}/manual-compile-${Date.now()}.mp4`;
        const finalVideoUrl = await uploadToS3(finalBuffer, s3Key, 'video/mp4');

        // Persist to DB
        await VideoProject.findByIdAndUpdate(projectId, {
            'storyboard.finalVideoUrl': finalVideoUrl,
            'storyboard.status': 'done',
            'storyboard.progress': 100,
            status: 'done',
            finalVideoUrl,
        });

        const signedFinal = await getSignedUrlIfNeeded(finalVideoUrl);
        console.log(`[SB Compile] ✅ Done — ${signedFinal.substring(0, 80)}`);

        res.json({
            success: true,
            projectId,
            finalVideoUrl: signedFinal,
            segmentsCompiled: orderedUrls.length,
        });

    } catch (err) {
        console.error('[SB Compile] Error:', err.message);
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    } finally {
        if (tmpDir) {
            try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
        }
    }
});


// ══════════════════════════════════════════════════════════════════════════════
//  CANVAS COPILOT — Graph API
//  Single-source-of-truth for the video workflow node canvas.
//  All mutations go through the Command Bus (commandBus.js) — never direct writes.
// ══════════════════════════════════════════════════════════════════════════════

// ── In-memory SSE client registry (sessionId → Set<res>) ────────────────────
const _sseClients = new Map();
function _getClients(sessionId) {
    if (!_sseClients.has(sessionId)) _sseClients.set(sessionId, new Set());
    return _sseClients.get(sessionId);
}
function _broadcast(sessionId, event) {
    for (const client of _getClients(sessionId)) {
        try { client.write(`data: ${JSON.stringify(event)}\n\n`); } catch {}
    }
}



// ── POST /api/video-studio/agent/v2/graph/init ───────────────────────────────
// Create or retrieve the graph for a session (idempotent).
router.post('/agent/v2/graph/init', protect, async (req, res) => {
    try {
        const { sessionId } = req.body;
        if (!sessionId) return res.status(400).json({ success: false, error: 'sessionId required' });

        const VideoGraph = (await import('../models/VideoGraph.js')).default;
        const VideoAgentSession = (await import('../models/VideoAgentSession.js')).default;

        let session = await VideoAgentSession.findOne({ sessionId, user: req.user._id }).lean();
        if (!session) {
            // Auto-provision a default session so the canvas works even if accessed directly with a custom sessionId or projectId
            session = await VideoAgentSession.create({
                sessionId,
                user: req.user._id,
                stage: 'plan', // default stage
                input: { brief: 'Canvas workspace session' }
            });
            session = session.toObject();
            console.log(`[CanvasGraph] Auto-provisioned VideoAgentSession for ${sessionId}`);
        }

        // Idempotent: return existing graph if already created
        let graph = await VideoGraph.findOne({ session: session._id, user: req.user._id });
        if (!graph) {
            const { v4: uuidv4 } = await import('uuid');
            graph = await VideoGraph.create({
                graphId: uuidv4(),
                session: session._id,
                user:    req.user._id,
                brand:   session.brand || null,
                version: 0,
                nodes:   [],
                edges:   [],
            });
            console.log(`[CanvasGraph] Created graph ${graph.graphId} for session ${sessionId}`);
        }

        res.json({ success: true, graph });
    } catch (err) {
        console.error('[CanvasGraph] init error:', err);
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

// ── GET /api/video-studio/agent/v2/graph/:sessionId ──────────────────────────
router.get('/agent/v2/graph/:sessionId', protect, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const VideoGraph = (await import('../models/VideoGraph.js')).default;
        const VideoAgentSession = (await import('../models/VideoAgentSession.js')).default;

        const session = await VideoAgentSession.findOne({ sessionId, user: req.user._id }).lean();
        if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

        const graph = await VideoGraph.findOne({ session: session._id, user: req.user._id });
        if (!graph) return res.status(404).json({ success: false, error: 'Graph not initialized — call /graph/init first' });

        res.json({ success: true, graph });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

// ── POST /api/video-studio/agent/v2/graph/:sessionId/command ─────────────────
// Execute one Command Bus command. Validates, applies, persists, broadcasts.
router.post('/agent/v2/graph/:sessionId/command', protect, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { command, baseVersion, commandId } = req.body;
        if (!command?.type) return res.status(400).json({ success: false, error: 'command.type required' });

        const VideoGraph = (await import('../models/VideoGraph.js')).default;
        const VideoAgentSession = (await import('../models/VideoAgentSession.js')).default;
        const { validateCommand, applyCommand, markDownstreamStale } = await import('../agents/videoStudio/commandBus.js');

        const session = await VideoAgentSession.findOne({ sessionId, user: req.user._id }).lean();
        if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

        const graph = await VideoGraph.findOne({ session: session._id, user: req.user._id });
        if (!graph) return res.status(404).json({ success: false, error: 'Graph not initialized' });

        // Stale base check (tolerated when fields untouched, strict for now)
        if (baseVersion !== undefined && graph.version > baseVersion + 5) {
            return res.json({
                success: false,
                code: 'STALE_BASE',
                message: `Graph is at version ${graph.version}, command was authored against ${baseVersion}. Please re-read the graph.`,
                currentVersion: graph.version,
            });
        }

        // Validate
        const validation = validateCommand(graph.toObject(), command);
        if (!validation.ok) {
            return res.json({ success: false, ...validation });
        }

        // Apply
        const author = command.author || 'user';
        const { newGraph, inverseDiff } = applyCommand(graph.toObject(), { ...command, author });

        // Mark downstream stale if params changed
        const finalGraph = ['update_params', 'set_input', 'connect', 'disconnect'].includes(command.type)
            ? markDownstreamStale(newGraph, command.payload?.nodeId || command.payload?.from?.node)
            : newGraph;

        // Persist (undo stack capped at 50)
        const undoEntry = { command, inverse: inverseDiff, version: graph.version, author, commandId, ts: Date.now() };
        await VideoGraph.updateOne(
            { _id: graph._id },
            {
                $set: {
                    nodes: finalGraph.nodes,
                    edges: finalGraph.edges,
                    version: finalGraph.version,
                    redoStack: [], // clear redo on new command
                },
                $push: { undoStack: { $each: [undoEntry], $slice: -50 } },
            }
        );

        const updatedGraph = await VideoGraph.findById(graph._id);

        // Broadcast diff to all SSE subscribers
        _broadcast(sessionId, {
            type: 'graph_diff',
            command,
            author,
            newVersion: finalGraph.version,
            nodes: finalGraph.nodes,
            edges: finalGraph.edges,
        });

        res.json({ success: true, version: finalGraph.version, graph: updatedGraph });
    } catch (err) {
        console.error('[CanvasGraph] command error:', err);
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

// ── POST /api/video-studio/agent/v2/graph/:sessionId/commands ────────────────
// Batch commands (transactional: all succeed or none apply).
router.post('/agent/v2/graph/:sessionId/commands', protect, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { commands = [], baseVersion, author = 'user' } = req.body;
        if (!commands.length) return res.status(400).json({ success: false, error: 'commands array required' });

        const VideoGraph = (await import('../models/VideoGraph.js')).default;
        const VideoAgentSession = (await import('../models/VideoAgentSession.js')).default;
        const { validateCommand, applyCommand, markDownstreamStale } = await import('../agents/videoStudio/commandBus.js');

        const session = await VideoAgentSession.findOne({ sessionId, user: req.user._id }).lean();
        if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

        const graph = await VideoGraph.findOne({ session: session._id, user: req.user._id });
        if (!graph) return res.status(404).json({ success: false, error: 'Graph not initialized' });

        // Validate all commands against a running graph state (no DB writes until all pass)
        let runningGraph = graph.toObject();
        const undoEntries = [];

        for (let i = 0; i < commands.length; i++) {
            const cmd = { ...commands[i], author };
            const validation = validateCommand(runningGraph, cmd);
            if (!validation.ok) {
                return res.json({
                    success: false,
                    failedAtIndex: i,
                    command: cmd,
                    ...validation,
                });
            }
            const { newGraph, inverseDiff } = applyCommand(runningGraph, cmd);
            const finalG = ['update_params', 'set_input', 'connect', 'disconnect'].includes(cmd.type)
                ? markDownstreamStale(newGraph, cmd.payload?.nodeId || cmd.payload?.from?.node)
                : newGraph;
            undoEntries.push({ command: cmd, inverse: inverseDiff, version: runningGraph.version, author, ts: Date.now() });
            runningGraph = finalG;
        }

        // All valid — persist
        await VideoGraph.updateOne(
            { _id: graph._id },
            {
                $set: { nodes: runningGraph.nodes, edges: runningGraph.edges, version: runningGraph.version, redoStack: [] },
                $push: { undoStack: { $each: undoEntries, $slice: -50 } },
            }
        );

        // Broadcast bulk update
        _broadcast(sessionId, {
            type: 'graph_bulk',
            commandCount: commands.length,
            author,
            newVersion: runningGraph.version,
            nodes: runningGraph.nodes,
            edges: runningGraph.edges,
        });

        res.json({ success: true, version: runningGraph.version, appliedCount: commands.length });
    } catch (err) {
        console.error('[CanvasGraph] batch commands error:', err);
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

// ── POST /api/video-studio/agent/v2/graph/:sessionId/undo ───────────────────
router.post('/agent/v2/graph/:sessionId/undo', protect, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const VideoGraph = (await import('../models/VideoGraph.js')).default;
        const VideoAgentSession = (await import('../models/VideoAgentSession.js')).default;
        const { validateCommand, applyCommand } = await import('../agents/videoStudio/commandBus.js');

        const session = await VideoAgentSession.findOne({ sessionId, user: req.user._id }).lean();
        const graph = await VideoGraph.findOne({ session: session?._id, user: req.user._id });
        if (!graph) return res.status(404).json({ success: false, error: 'Graph not found' });
        if (!graph.undoStack.length) return res.json({ success: false, error: 'Nothing to undo' });

        const last = graph.undoStack[graph.undoStack.length - 1];
        const validation = validateCommand(graph.toObject(), last.inverse);
        if (!validation.ok) return res.json({ success: false, error: `Cannot undo: ${validation.message}` });

        const { newGraph } = applyCommand(graph.toObject(), last.inverse);
        await VideoGraph.updateOne({ _id: graph._id }, {
            $set: { nodes: newGraph.nodes, edges: newGraph.edges, version: newGraph.version },
            $pop: { undoStack: 1 },
            $push: { redoStack: last },
        });

        _broadcast(sessionId, { type: 'graph_undo', newVersion: newGraph.version, nodes: newGraph.nodes, edges: newGraph.edges });
        res.json({ success: true, version: newGraph.version });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

// ── POST /api/video-studio/agent/v2/graph/:sessionId/redo ───────────────────
router.post('/agent/v2/graph/:sessionId/redo', protect, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const VideoGraph = (await import('../models/VideoGraph.js')).default;
        const VideoAgentSession = (await import('../models/VideoAgentSession.js')).default;
        const { validateCommand, applyCommand } = await import('../agents/videoStudio/commandBus.js');

        const session = await VideoAgentSession.findOne({ sessionId, user: req.user._id }).lean();
        const graph = await VideoGraph.findOne({ session: session?._id, user: req.user._id });
        if (!graph) return res.status(404).json({ success: false, error: 'Graph not found' });
        if (!graph.redoStack.length) return res.json({ success: false, error: 'Nothing to redo' });

        const next = graph.redoStack[graph.redoStack.length - 1];
        const validation = validateCommand(graph.toObject(), next.command);
        if (!validation.ok) return res.json({ success: false, error: `Cannot redo: ${validation.message}` });

        const { newGraph } = applyCommand(graph.toObject(), next.command);
        await VideoGraph.updateOne({ _id: graph._id }, {
            $set: { nodes: newGraph.nodes, edges: newGraph.edges, version: newGraph.version },
            $pop: { redoStack: 1 },
            $push: { undoStack: next },
        });

        _broadcast(sessionId, { type: 'graph_redo', newVersion: newGraph.version, nodes: newGraph.nodes, edges: newGraph.edges });
        res.json({ success: true, version: newGraph.version });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

// ── GET /api/video-studio/agent/v2/graph/:sessionId/stream ───────────────────
// SSE endpoint — client subscribes and receives real-time graph diffs.
router.get('/agent/v2/graph/:sessionId/stream', protect, (req, res) => {
    const { sessionId } = req.params;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Send heartbeat to keep alive
    const heartbeat = setInterval(() => {
        try { res.write(': heartbeat\n\n'); } catch {}
    }, 25000);

    // Register subscriber
    _getClients(sessionId).add(res);
    console.log(`[CanvasGraph SSE] Client connected for session ${sessionId} (${_getClients(sessionId).size} total)`);

    // Send current graph immediately
    (async () => {
        try {
            const VideoGraph = (await import('../models/VideoGraph.js')).default;
            const VideoAgentSession = (await import('../models/VideoAgentSession.js')).default;
            const session = await VideoAgentSession.findOne({ sessionId, user: req.user._id }).lean();
            if (session) {
                const graph = await VideoGraph.findOne({ session: session._id, user: req.user._id }).lean();
                if (graph) res.write(`data: ${JSON.stringify({ type: 'graph_init', graph })}\n\n`);
            }
        } catch {}
    })();

    req.on('close', () => {
        clearInterval(heartbeat);
        _getClients(sessionId).delete(res);
    });
});

async function _calculateGraphExecutionCost(nodesToRun, graphObj, isBilledNode, getCreditEstimate) {
    const fanOutFactors = {};
    const defaultItems = [
        { id: '1', label: 'Scene 1: Introduction shot', checked: true },
        { id: '2', label: 'Scene 2: Dynamic product transition', checked: true },
        { id: '3', label: 'Scene 3: Detail zoom close-up', checked: false },
    ];

    for (const node of graphObj.nodes) {
        fanOutFactors[node.id] = 1;
    }

    const { NODE_CATALOG } = await import('../agents/videoStudio/nodeCatalog.js');
    const { topologicalSort } = await import('../agents/videoStudio/commandBus.js');

    let nodeOrder = [];
    try {
        nodeOrder = topologicalSort(graphObj);
    } catch (e) {
        nodeOrder = nodesToRun;
    }

    for (const nodeId of nodeOrder) {
        const node = graphObj.nodes.find(n => n.id === nodeId);
        if (!node) continue;

        let upstreamFanOutFactor = 1;
        const catalog = NODE_CATALOG[node.type];
        if (catalog && catalog.ports && catalog.ports.inputs) {
            for (const port of catalog.ports.inputs) {
                if (port.type !== 'asset_list' && !port.multi) {
                    const edges = (graphObj.edges || []).filter(e => e.to.node === nodeId && e.to.port === port.id);
                    for (const edge of edges) {
                        const upstreamNodeId = edge.from.node;
                        const upstreamNode = graphObj.nodes.find(n => n.id === upstreamNodeId);
                        if (upstreamNode) {
                            let factor = 1;
                            if (upstreamNode.type === 'list') {
                                const listItems = upstreamNode.params?.items || defaultItems;
                                factor = listItems.filter(i => i.checked !== false).length;
                                if (factor === 0) factor = 1;
                            } else {
                                factor = fanOutFactors[upstreamNodeId] || 1;
                            }
                            if (factor > upstreamFanOutFactor) {
                                upstreamFanOutFactor = factor;
                            }
                        }
                    }
                }
            }
        }

        fanOutFactors[node.id] = upstreamFanOutFactor;
    }

    let totalCost = 0;
    const billedNodesDetails = [];
    for (const nodeId of nodesToRun) {
        const node = graphObj.nodes.find(n => n.id === nodeId);
        if (node && isBilledNode(node.type)) {
            const factor = fanOutFactors[node.id] || 1;
            const singleCost = getCreditEstimate(node.type);
            const cost = singleCost * factor;
            totalCost += cost;
            billedNodesDetails.push({
                nodeId,
                type: node.type,
                credits: cost,
                factor
            });
        }
    }

    return { totalCost, billedNodesDetails };
}

// ── POST /api/video-studio/agent/v2/graph/:sessionId/run ─────────────────────
// Trigger graph execution. Returns cost estimate if unconfirmed (spend gate).
router.post('/agent/v2/graph/:sessionId/run', protect, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { confirmed = false, fromNodeId = null } = req.body;

        const VideoGraph = (await import('../models/VideoGraph.js')).default;
        const VideoAgentSession = (await import('../models/VideoAgentSession.js')).default;
        const { NODE_CATALOG, isBilledNode, getCreditEstimate } = await import('../agents/videoStudio/nodeCatalog.js');
        const { topologicalSort } = await import('../agents/videoStudio/commandBus.js');

        const session = await VideoAgentSession.findOne({ sessionId, user: req.user._id }).lean();
        if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

        const graph = await VideoGraph.findOne({ session: session._id, user: req.user._id });
        if (!graph) return res.status(404).json({ success: false, error: 'Graph not initialized' });

        // Determine which nodes need to run
        const graphObj = graph.toObject();
        let nodeOrder;
        try {
            nodeOrder = topologicalSort(graphObj);
        } catch (cycleErr) {
            return res.json({ success: false, error: cycleErr.message });
        }

        // Filter to fromNodeId subgraph if specified
        const nodesToRun = fromNodeId
            ? _getSubgraphFrom(graphObj, fromNodeId, nodeOrder)
            : nodeOrder.filter(id => {
                const n = graphObj.nodes.find(x => x.id === id);
                return n && (n.state === 'idle' || n.state === 'stale');
              });

        // Pre-run validation: check required ports
        const warnings = [];
        for (const nodeId of nodesToRun) {
            const node = graphObj.nodes.find(n => n.id === nodeId);
            if (!node) continue;
            const catalog = NODE_CATALOG[node.type];
            for (const port of (catalog?.ports?.inputs || [])) {
                if (!port.required) continue;
                const hasEdge = graphObj.edges.some(e => e.to.node === nodeId && e.to.port === port.id);
                const hasParam = node.params?.[port.id];
                if (!hasEdge && !hasParam) {
                    warnings.push({ nodeId, portId: port.id, message: `Required input "${port.label}" is not connected.` });
                }
            }
        }

        // Cost estimate using fanned-out calculation
        const { totalCost: totalEstimate, billedNodesDetails } = await _calculateGraphExecutionCost(nodesToRun, graphObj, isBilledNode, getCreditEstimate);

        // Spend gate: if not confirmed, return estimate for user approval
        if (!confirmed && totalEstimate > 0) {
            return res.json({
                success: true,
                gated: true,
                message: `This run will use approximately ${totalEstimate} credits across fanned-out executions. Confirm to proceed.`,
                estimate: totalEstimate,
                billedNodes: billedNodesDetails,
                warnings,
            });
        }

        if (warnings.length > 0) {
            return res.json({
                success: false,
                error: 'Graph has validation errors that must be fixed before running.',
                warnings,
            });
        }

        // ── Start execution (async) ──────────────────────────────────────────
        const { v4: uuidv4 } = await import('uuid');
        const runId = `run_${uuidv4().replace(/-/g, '').substring(0, 10)}`;

        // Mark queued nodes
        await VideoGraph.updateOne({ _id: graph._id }, {
            $set: {
                'activeRun.runId': runId,
                'activeRun.startedAt': new Date(),
                'activeRun.status': 'running',
            }
        });
        for (const nodeId of nodesToRun) {
            await VideoGraph.updateOne({ _id: graph._id, 'nodes.id': nodeId }, {
                $set: { 'nodes.$.state': 'queued' }
            });
        }
        _broadcast(sessionId, { type: 'run_started', runId, nodesToRun, estimate: totalEstimate });

        // Execute asynchronously (non-blocking response)
        res.json({ success: true, runId, nodesToRun, estimate: totalEstimate });

        // Run execution in background
        _executeGraphAsync({ graphId: graph._id, graphObj, nodesToRun, sessionId, runId, userId: req.user._id }).catch(err => {
            console.error(`[CanvasGraph Run] Async execution failed for run ${runId}:`, err.message);
            _broadcast(sessionId, { type: 'run_error', runId, error: err.message });
        });

    } catch (err) {
        console.error('[CanvasGraph] run error:', err);
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

// ── Background graph executor ─────────────────────────────────────────────────
async function _executeGraphAsync({ graphId, graphObj, nodesToRun, sessionId, runId, userId }) {
    const { executeGraphAsync } = await import('../agents/videoStudio/graphExecutor.js');
    await executeGraphAsync({
        graphId,
        graphObj,
        nodesToRun,
        sessionId,
        runId,
        userId,
        broadcast: (event) => _broadcast(sessionId, event)
    });
}

function _getSubgraphFrom(graph, fromNodeId, topoOrder) {
    // Get all nodes that are downstream of (or equal to) fromNodeId
    const included = new Set([fromNodeId]);
    _collectDownstreamIds(graph, fromNodeId, included);
    return topoOrder.filter(id => included.has(id) && (() => {
        const n = graph.nodes.find(x => x.id === id);
        return n && (n.state === 'idle' || n.state === 'stale');
    })());
}

function _collectDownstreamIds(graph, startId, collected) {
    for (const edge of graph.edges.filter(e => e.from.node === startId)) {
        if (!collected.has(edge.to.node)) {
            collected.add(edge.to.node);
            _collectDownstreamIds(graph, edge.to.node, collected);
        }
    }
}

// ── DELETE /api/video-studio/agent/v2/graph/:sessionId/run/:runId ────────────
router.delete('/agent/v2/graph/:sessionId/run/:runId', protect, async (req, res) => {
    try {
        const { sessionId, runId } = req.params;
        const VideoGraph = (await import('../models/VideoGraph.js')).default;
        const VideoAgentSession = (await import('../models/VideoAgentSession.js')).default;

        const session = await VideoAgentSession.findOne({ sessionId, user: req.user._id }).lean();
        const graph = await VideoGraph.findOne({ session: session?._id, user: req.user._id });
        if (!graph) return res.status(404).json({ success: false, error: 'Graph not found' });
        if (graph.activeRun?.runId !== runId) return res.json({ success: false, error: 'Run not active' });

        await VideoGraph.updateOne({ _id: graph._id }, { $set: { 'activeRun.status': 'cancelled' } });

        // Reset queued nodes back to idle
        for (const node of graph.nodes.filter(n => n.state === 'queued' || n.state === 'running')) {
            await VideoGraph.updateOne({ _id: graph._id, 'nodes.id': node.id }, { $set: { 'nodes.$.state': 'idle' } });
        }

        _broadcast(sessionId, { type: 'run_cancelled', runId });
        res.json({ success: true, message: 'Run cancelled' });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

// ── GET /api/video-studio/agent/v2/graph/:sessionId/run/:runId/status ────────
router.get('/agent/v2/graph/:sessionId/run/:runId/status', protect, async (req, res) => {
    try {
        const { sessionId, runId } = req.params;
        const VideoGraph = (await import('../models/VideoGraph.js')).default;
        const VideoAgentSession = (await import('../models/VideoAgentSession.js')).default;

        const session = await VideoAgentSession.findOne({ sessionId, user: req.user._id }).lean();
        const graph = await VideoGraph.findOne({ session: session?._id, user: req.user._id }).lean();
        if (!graph) return res.status(404).json({ success: false, error: 'Graph not found' });

        const nodeStates = graph.nodes.map(n => ({ id: n.id, state: n.state, outputRef: n.outputRef, error: n.error }));
        res.json({ success: true, runId, activeRun: graph.activeRun, nodeStates });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});


// ── POST /api/video-studio/agent/v2/copilot ──────────────────────────────────
// The brain of the Canvas Copilot.
// Receives: natural language message + current graph state + conversation history
// Returns: { agentResponse, commands[] } — text narration + Command Bus commands
// The frontend applies commands via emitBatch (validated, reversible, attributed).
router.post('/agent/v2/copilot', protect, async (req, res) => {
    try {
        const {
            sessionId,
            message,
            graph,
            conversationHistory = [],
        } = req.body;

        if (!message?.trim()) return res.status(400).json({ success: false, error: 'No message' });

        const { callAgent } = await import('../agents/shared/agentUtils.js');
        const { NODE_CATALOG, getAllTypes } = await import('../agents/videoStudio/nodeCatalog.js');

        // Load session for brand/project context
        let sessionDoc = null, brandCtx = null;
        if (sessionId) {
            const VideoAgentSession = (await import('../models/VideoAgentSession.js')).default;
            sessionDoc = await VideoAgentSession.findOne({ sessionId, user: req.user._id }).lean();
            if (sessionDoc?.brand) {
                try { brandCtx = await loadBrandContext(sessionDoc.brand.toString()); } catch {}
            }
        }

        // Build a readable summary of the current canvas
        const nodeCount = graph?.nodes?.length || 0;
        const edgeCount = graph?.edges?.length || 0;
        const nodesSummary = (graph?.nodes || []).map(n =>
            `  - ${n.id} (${n.type}) state=${n.state}${n.params?.model ? ` model=${n.params.model}` : ''}${n.params?.duration ? ` dur=${n.params.duration}s` : ''}`
        ).join('\n');
        const edgesSummary = (graph?.edges || []).map(e =>
            `  - ${e.from.node}[${e.from.port}] → ${e.to.node}[${e.to.port}]`
        ).join('\n');

        const historyText = conversationHistory.slice(-10)
            .map(m => `${m.role === 'user' ? 'User' : 'Director'}: ${m.content}`)
            .join('\n');

        const catalogSummary = Object.entries(NODE_CATALOG).map(([type, def]) =>
            `  ${type}: ${def.description.slice(0, 80)} | cost=${def.costClass} | inputs=[${def.ports.inputs.map(p => `${p.id}:${p.type}`).join(',')}] | outputs=[${def.ports.outputs.map(p => `${p.id}:${p.type}`).join(',')}]`
        ).join('\n');

        const systemPrompt = `You are the Mantram Canvas Copilot — an AI video creative director that operates a node-based workflow canvas.

Your role: turn the user's natural language into a PLAN + CANVAS COMMANDS that build, modify, or explain their video workflow.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CURRENT CANVAS STATE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Nodes (${nodeCount}):
${nodesSummary || '  (empty canvas)'}

Edges (${edgeCount}):
${edgesSummary || '  (no connections)'}

Graph version: ${graph?.version || 0}
${brandCtx ? `\nBrand context: ${brandCtx.name || ''} — ${brandCtx.description || ''}` : ''}
${sessionDoc?.analysis?.summary ? `\nProject analysis: ${sessionDoc.analysis.summary}` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NODE CATALOG (what you can create):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${catalogSummary}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONVERSATION:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${historyText || '(start)'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RULES (non-negotiable):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Only use node types from the catalog above. Never invent types.
2. Port connections must be type-compatible: text→text, image→image, video→video, ref→ref, asset_list accepts image/video/audio.
3. Never connect a port type to an incompatible one.
4. For acyclical workflows: data flows LEFT→RIGHT (inputs → generators → transforms → output).
5. When a user says "make a video" or gives a brief → build a COMPLETE workflow: text_input → prompt_expand → video_generate → output.
6. Long-form (>30s) → use batch node pattern: text_input → batch → video_generate (loop per shot) → concat → output.
7. For character/style consistency across shots → add character_ref and/or style_ref nodes, wire refs to video_generate.
8. agentResponse must be 1-3 sentences. Short. Specific. Reference the actual nodes you're creating.
9. Position nodes logically: inputs at x=100, generators at x=400-600, transforms at x=700-900, output at x=1100.
10. Separate parallel branches vertically (y spacing: ~200px per branch).
11. If the user asks a question (no canvas action needed) → return empty commands array.
12. If the canvas already has a good structure → prefer the smallest change (add/modify) over rebuilding.

COMMANDS you can emit (these go through the Command Bus and are validated):
- { type: "add_node", payload: { type: "<catalog_type>", position: {x,y}, params: {...} } }
- { type: "connect",  payload: { from: {node:"<id>",port:"<portId>"}, to: {node:"<id>",port:"<portId>"} } }
- { type: "update_params", payload: { nodeId:"<id>", params:{...} } }
- { type: "delete_node", payload: { nodeId:"<id>" } }
- { type: "disconnect", payload: { edgeId:"<id>" } }
- { type: "enhance_prompt", payload: { nodeId: "<id>", presetId: "<presetId>" } } (Instructs the studio to enhance the node's prompt. presetId is optional and defaults to "auto".)

Node IDs for NEW nodes you create: use descriptive temp IDs like "n_text1", "n_expand1", "n_video1", "n_output1".
Node IDs for EXISTING nodes: use the exact IDs from the canvas state above.

Return ONLY valid JSON:
{
  "agentResponse": "...",
  "commands": [...]
}`;

        const userPrompt = `User: "${message}"

Based on the current canvas and catalog, what commands should I emit? Return the JSON.`;

        let result;
        try {
            result = await callAgent(systemPrompt, userPrompt, 0.6, 2000);
        } catch (err) {
            console.warn('[Copilot] LLM error:', err.message);
            result = { agentResponse: "I ran into a problem planning that. Could you try rephrasing?", commands: [] };
        }

        const agentResponse = result?.agentResponse || "Done!";
        const commands = Array.isArray(result?.commands) ? result.commands : [];

        // Intercept and expand enhance_prompt commands before validation
        const processedCommands = [];
        for (const cmd of commands) {
            if (cmd.type === 'enhance_prompt') {
                try {
                    const { nodeId, presetId = 'auto' } = cmd.payload || {};
                    const node = (graph?.nodes || []).find(n => n.id === nodeId);
                    const rawPrompt = node?.params?.rawPrompt || node?.params?.text || node?.params?.prompt || '';
                    if (rawPrompt) {
                        const enhanceResult = await _enhancePromptInternal(sessionId, req.user._id, nodeId, presetId, rawPrompt, graph);
                        if (enhanceResult.success) {
                            processedCommands.push({
                                type: 'update_params',
                                payload: {
                                    nodeId,
                                    params: {
                                        prompt: enhanceResult.enhancedPrompt,
                                        rawPrompt,
                                        enhancedPrompt: enhanceResult.enhancedPrompt,
                                        selectedPresetId: enhanceResult.presetId
                                    }
                                },
                                author: 'agent'
                            });
                        }
                    }
                } catch (err) {
                    console.error('[Copilot Tool enhance_prompt] failed to process:', err);
                }
            } else {
                processedCommands.push(cmd);
            }
        }

        // Validate commands before returning (reject structurally invalid ones)
        const { validateCommand } = await import('../agents/videoStudio/commandBus.js');
        let runningGraph = graph || { nodes: [], edges: [], version: 0 };
        const validCommands = [];

        for (const cmd of processedCommands) {
            const v = validateCommand(runningGraph, { ...cmd, author: 'agent' });
            if (v.ok) {
                validCommands.push({ ...cmd, author: 'agent' });
                // Simulate apply for subsequent validation
                const { applyCommand } = await import('../agents/videoStudio/commandBus.js');
                try {
                    const { newGraph } = applyCommand(runningGraph, { ...cmd, author: 'agent' });
                    runningGraph = newGraph;
                } catch {}
            } else {
                console.warn(`[Copilot] Command rejected: ${cmd.type} — ${v.message}`);
            }
        }

        console.log(`[Copilot] msg="${message.slice(0,50)}" → ${validCommands.length}/${commands.length} valid commands`);

        res.json({ success: true, agentResponse, commands: validCommands, intent: 'canvas_op' });

    } catch (error) {
        console.error('[Copilot] Error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


export default router;

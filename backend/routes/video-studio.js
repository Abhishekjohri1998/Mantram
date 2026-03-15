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
import VideoProject from '../models/VideoProject.js';
import Brand from '../models/Brand.js';
import { protect } from '../middleware/auth.js';
import { requireCredits } from '../middleware/credits.js';
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
} from '../agents/videoStudio/nodes.js';
import { estimateCost, getModelsInfo, MODEL_CAPABILITIES } from '../agents/videoStudio/falClient.js';
import { submitPiApiImageToVideo, submitPiApiVideoExtend } from '../agents/videoStudio/piApiClient.js';
import { saveLearnings, getStylePreferences } from '../agents/videoStudio/selfLearning.js';
import { getRouter as getAIRouter } from '../ai/router.js';
import { uploadToS3 } from '../utils/s3.js';
import { safeErrorMessage } from '../utils/safeError.js';

const router = Router();

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/video-studio/advanced/image-to-video — Seedance I2V (Advanced Mode)
// ══════════════════════════════════════════════════════════════════════════════
router.post('/advanced/image-to-video', protect, requireCredits('videoGenerate'), async (req, res) => {
    try {
        const { imageUrl, prompt, duration, aspectRatio, qualityMode, brandId, referenceImages } = req.body;

        if (!imageUrl) {
            return res.status(400).json({ success: false, error: 'An image is required for Image-to-Video' });
        }

        console.log(`🖼️→🎬 I2V request: quality=${qualityMode}, duration=${duration}`);

        // Create project
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
            },
            routing: {
                selectedModel: 'seedance-2.0',
                resolution: '1080p',
                mode: qualityMode || 'fast',
            },
        });

        // Submit to PiAPI
        const result = await submitPiApiImageToVideo({
            imageUrl,
            prompt: prompt || 'Animate this image with natural cinematic motion',
            duration: duration || 5,
            aspectRatio: aspectRatio || '16:9',
            qualityMode: qualityMode || 'fast',
            referenceImages: referenceImages || [],
        });

        // Update project with generation details
        await VideoProject.findByIdAndUpdate(project._id, {
            generation: {
                falRequestId: result.taskId,
                falEndpoint: 'piapi-seedance-2.0-i2v',
                provider: 'piapi',
                _piApiPayload: result._payload,
                videoUrl: '',
                progress: 5,
                startedAt: new Date(),
            },
            backendPrompt: prompt || '',
        });

        res.json({
            success: true,
            project: {
                _id: project._id,
                status: 'advanced-generating',
                mode: 'image-to-video',
                generation: {
                    falRequestId: result.taskId,
                    provider: 'piapi',
                    progress: 5,
                },
                costPreview: estimateCost('seedance-2.0', duration || 5, '1080p', qualityMode || 'fast'),
            },
        });
    } catch (error) {
        console.error('I2V generate error:', error);
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
        if (original.generation?.provider !== 'piapi') return res.status(400).json({ success: false, error: 'Video Extend is only available for Seedance 2.0 videos' });

        console.log(`🔗 Extend request: parent=${parentTaskId}, duration=${duration}, quality=${qualityMode}`);

        // Submit extension to PiAPI
        const result = await submitPiApiVideoExtend({
            parentTaskId,
            prompt: prompt || '',
            duration: duration || 5,
            qualityMode: qualityMode || 'fast',
        });

        // Create new project for the extended video
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
            generation: {
                falRequestId: result.taskId,
                falEndpoint: 'piapi-seedance-2.0-extend',
                provider: 'piapi',
                _piApiPayload: result._payload,
                videoUrl: '',
                progress: 5,
                startedAt: new Date(),
            },
            backendPrompt: prompt || '',
        });

        res.json({
            success: true,
            project: {
                _id: extended._id,
                status: 'advanced-generating',
                mode: 'extend',
                parentProjectId: projectId,
                generation: {
                    falRequestId: result.taskId,
                    provider: 'piapi',
                    progress: 5,
                },
                costPreview: estimateCost('seedance-2.0', duration || 5, '1080p', qualityMode || 'fast'),
            },
        });
    } catch (error) {
        console.error('Video extend error:', error);
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
            generateAudio, qualityMode, brandId,
        } = req.body;

        if (!prompt || !prompt.trim()) {
            return res.status(400).json({ success: false, error: 'Prompt is required' });
        }

        console.log(`📸 Advanced generate: ${(referenceImages || []).length} ref images, firstImage: ${firstImageUrl ? 'yes' : 'no'}, model: ${model}, quality: ${qualityMode}`);

        // Create project in advanced mode
        // Format referenceImages for schema: [{url, label}]
        // Skip base64 data URIs for storage (too large for MongoDB) — they're already embedded in the prompt via <img> tags
        const formattedRefImages = (referenceImages || [])
            .filter(r => typeof r === 'string' ? !r.startsWith('data:') : !r?.url?.startsWith('data:'))
            .map((r, i) => typeof r === 'string' ? { url: r, label: `@image${i + 1}` } : r);

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
                referenceImages: formattedRefImages,
                aspectRatio: aspectRatio || '16:9',
                duration: duration || 5,
                generateAudio: generateAudio !== false,
            },
            routing: {
                selectedModel: model || 'kling-3.0',
                resolution: resolution || '1080p',
                mode: qualityMode || 'fast',
            },
        });

        // Plan duration if needed
        const durationPlan = await durationPlannerNode({
            model: model || 'kling-3.0',
            duration: duration || 5,
        });

        // Run generation
        const state = await advancedGenerateNode({
            prompt: prompt.trim(),
            model: model || 'kling-3.0',
            duration: duration || 5,
            resolution: resolution || '1080p',
            qualityMode: qualityMode || 'fast',
            firstImageUrl: firstImageUrl || '',
            generateAudio: generateAudio !== false,
            aspectRatio: aspectRatio || '16:9',
            referenceImages: referenceImages || [],
        });

        // Update project with generation details
        await VideoProject.findByIdAndUpdate(project._id, {
            generation: state.generation,
            backendPrompt: prompt.trim(),
        });

        res.json({
            success: true,
            project: {
                _id: project._id,
                status: 'advanced-generating',
                mode: 'advanced',
                generation: state.generation,
                costPreview: state.costPreview,
                durationPlan: durationPlan.durationPlan,
            },
        });
    } catch (error) {
        console.error('Advanced generate error:', error);
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

        // Create project
        const project = await VideoProject.create({
            user: req.user._id,
            brand: brandId || null,
            title: 'Untitled Video',
            status: 'brainstorm',
            input: {
                brief: brief || '',
                inputType: brief && images?.length ? 'both' : images?.length ? 'image' : 'text',
                images: (images || []).map(img => ({
                    url: img.url,
                    source: img.source || 'upload',
                    label: img.label || '',
                })),
                videoType: videoType || 'ad-film',
            },
        });

        console.log(`🎬 Video Studio: Created project ${project._id}`);

        // Run brainstorm node
        const state = await runStep(project._id, 'brainstorm', brainstormNode, {
            userId: req.user._id.toString(),
            brandId: brandId || null,
            brief: brief || '',
            inputImages: images || [],
            videoType: videoType || 'ad-film',
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
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
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

        const state = await runStep(project._id, 'script', scriptDirectorNode, {
            userId: req.user._id.toString(),
            brandId: project.brand?.toString(),
            brief: project.input?.brief || '',
            inputImages: project.input?.images || [],
            videoType: project.input?.videoType || 'ad-film',
            concepts: project.concepts,
            selectedConceptIndex: conceptIndex,
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
        // Check if user provided a real, externally-accessible image
        // Exclude: base64 data URIs, localhost proxy URLs
        const hasRealImage = fullState.inputImages?.some(img => {
            if (!img.url) return false;
            if (img.url.startsWith('data:')) return false;
            if (img.url.includes('localhost') || img.url.includes('127.0.0.1')) return false;
            return img.url.startsWith('http');
        });

        console.log(`🖼️ First frame check: firstShot=${!!firstShot}, hasRealImage=${hasRealImage}, inputImages=${fullState.inputImages?.length || 0}`);

        // Generate first-frame image if no real image is already provided
        let firstFramePromise = Promise.resolve(null);
        if (firstShot && !hasRealImage) {
            console.log('🖼️ Auto-generating first frame image from first shot description...');
            firstFramePromise = (async () => {
                try {
                    const { geminiImageGenerate } = await import('../agents/videoStudio/firstFrame.js');
                    const brand = project.brand ? await Brand.findById(project.brand).lean() : null;
                    const shotDesc = firstShot.description || firstShot.visual || firstShot.prompt || 'cinematic opening shot';
                    const shotPrompt = `Generate a cinematic, photorealistic still frame for a video scene: ${shotDesc}.
Style: ${firstShot.style || script?.narrative || 'cinematic, professional'}.
${brand?.name ? `Brand: ${brand.name}` : ''}
This image will be used as the FIRST FRAME of a video — make it visually striking, well-composed, and suitable as an opening shot.
Output ONLY the image, no text or labels.`;
                    console.log('🖼️ First frame prompt:', shotPrompt.substring(0, 200) + '...');
                    const result = await geminiImageGenerate(shotPrompt, [], 0.5);
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
            console.log(`🖼️ Skipping first frame generation: ${!firstShot ? 'no first shot in script' : 'user already has a real image'}`);
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
// POST /api/video-studio/:id/generate — Confirm cost → trigger fal.ai
// ══════════════════════════════════════════════════════════════════════════════
router.post('/:id/generate', protect, requireCredits('videoGenerate'), async (req, res) => {
    try {
        const { resolution, model, mode, aspectRatio } = req.body; // Optional overrides
        const project = await VideoProject.findOne({ _id: req.params.id, user: req.user._id });
        if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
        if (project.status !== 'routing') return res.status(400).json({ success: false, error: 'Not in routing stage' });

        // Apply any user overrides
        if (resolution || model || mode || aspectRatio) {
            const routing = { ...project.routing.toObject() };
            if (resolution) routing.resolution = resolution;
            if (model) routing.selectedModel = model;
            if (mode) routing.mode = mode;
            if (aspectRatio) routing.aspectRatio = aspectRatio;
            routing.costPreview = estimateCost(
                routing.selectedModel,
                project.script?.totalDuration || 5,
                routing.resolution,
                routing.mode
            );
            await VideoProject.findByIdAndUpdate(project._id, { routing });
        }

        // Build state and run video generator
        const updatedProject = await VideoProject.findById(project._id).lean();
        const state = await runStep(project._id, 'generating', videoGeneratorNode, {
            userId: req.user._id.toString(),
            brandId: project.brand?.toString(),
            concepts: updatedProject.concepts,
            selectedConceptIndex: updatedProject.selectedConceptIndex,
            script: updatedProject.script,
            backendPrompt: updatedProject.backendPrompt,
            routing: updatedProject.routing,
            inputImages: updatedProject.input?.images || [],
            references: updatedProject.references,
        });

        res.json({
            success: true,
            project: {
                _id: project._id,
                status: 'generating',
                generation: state.generation,
                pipeline: getPipelineInfo('generating'),
            },
        });
    } catch (error) {
        console.error('Video Studio generate error:', error);
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

        if ((project.status === 'generating' || project.status === 'advanced-generating') && project.generation?.falRequestId) {
            // Poll fal.ai for progress
            const state = {
                generation: project.generation,
                routing: project.routing,
            };
            const updated = await pollGenerationStatus(state);

            // Update project if status changed
            if (updated.status !== 'generating') {
                await VideoProject.findByIdAndUpdate(project._id, {
                    status: updated.status,
                    generation: updated.generation,
                });

                // If completed, auto-upload video to S3 before CDN URL expires, then run critic
                if (updated.status === 'critique') {
                    // Fire-and-forget: upload video to S3
                    if (updated.generation?.videoUrl) {
                        downloadAndUploadVideoToS3(project._id.toString(), updated.generation.videoUrl)
                            .catch(e => console.warn('⚠️ Video S3 upload failed:', e.message));
                    }
                    const criticState = await runStep(project._id, 'critique', criticNode, {
                        userId: project.user.toString(),
                        brandId: project.brand?.toString(),
                        concepts: project.concepts,
                        selectedConceptIndex: project.selectedConceptIndex,
                        script: project.script,
                        backendPrompt: project.backendPrompt,
                        routing: project.routing,
                        generation: updated.generation,
                    });

                    return res.json({
                        success: true,
                        project: {
                            _id: project._id,
                            status: 'critique',
                            generation: updated.generation,
                            critique: criticState.critique,
                            pipeline: getPipelineInfo('critique'),
                        },
                    });
                }
            }

            return res.json({
                success: true,
                project: {
                    _id: project._id,
                    status: updated.status === 'generating' ? 'generating' : updated.status,
                    generation: updated.generation,
                    pipeline: getPipelineInfo(updated.status === 'generating' ? 'generating' : updated.status),
                },
            });
        }

        // Not in generating state — return full project
        res.json({
            success: true,
            project: {
                _id: project._id,
                status: project.status,
                generation: project.generation,
                critique: project.critique,
                pipeline: getPipelineInfo(project.status),
            },
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

        // Re-run generate
        const updatedProject = await VideoProject.findById(project._id).lean();
        const state = await runStep(project._id, 'generating', videoGeneratorNode, {
            userId: req.user._id.toString(),
            brandId: project.brand?.toString(),
            concepts: updatedProject.concepts,
            selectedConceptIndex: updatedProject.selectedConceptIndex,
            script: updatedProject.script,
            backendPrompt: editedPrompt,
            routing: updatedProject.routing,
            inputImages: updatedProject.input?.images || [],
            references: updatedProject.references,
        });

        res.json({
            success: true,
            project: {
                _id: project._id,
                status: 'generating',
                generation: state.generation,
                pipeline: getPipelineInfo('generating'),
            },
        });
    } catch (error) {
        console.error('Video Studio edit error:', error);
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

        // Mark as done
        await VideoProject.findByIdAndUpdate(project._id, {
            status: 'done',
            finalVideoUrl: project.generation?.videoUrl || '',
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
        const { brandId, status, limit = 50, page = 1 } = req.query;
        const filter = { user: req.user._id };
        if (brandId) filter.brand = brandId;
        if (status) filter.status = status;

        const skip = (Number(page) - 1) * Number(limit);
        const [projects, total] = await Promise.all([
            VideoProject.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit))
                .select('title status mode input.videoType input.brief input.images advancedConfig routing.selectedModel routing.costPreview generation createdAt updatedAt')
                .populate('brand', 'name dna.logo.url')
                .lean(),
            VideoProject.countDocuments(filter),
        ]);

        // ── Auto-sync stuck generating projects ──
        // If any projects are still "generating"/"advanced-generating", re-check their status
        // This catches cases where the user closed the tab before polling completed
        const stuckProjects = projects.filter(p =>
            (p.status === 'generating' || p.status === 'advanced-generating') && p.generation?.falRequestId
        );

        if (stuckProjects.length > 0) {
            console.log(`🔄 Auto-syncing ${stuckProjects.length} stuck generating project(s)...`);
            await Promise.allSettled(stuckProjects.map(async (p) => {
                try {
                    // Infer provider from model if not stored (older projects)
                    const model = p.routing?.selectedModel || '';
                    let provider = p.generation?.provider || '';
                    if (!provider) {
                        if (model === 'veo-3.1-fast') provider = 'kie';
                        else if (model === 'seedance-2.0') provider = 'piapi';
                        else if (model === 'grok-imagine') provider = 'grok';
                        else provider = 'fal';
                    }

                    console.log(`🔍 Syncing ${p._id}: model=${model}, provider=${provider}, reqId=${p.generation?.falRequestId?.substring(0, 20)}...`);

                    const state = {
                        generation: { ...p.generation, provider },
                        routing: { selectedModel: model },
                    };
                    const updated = await pollGenerationStatus(state);

                    if (updated.generation?.status === 'COMPLETED' || updated.generation?.status === 'FAILED') {
                        const newStatus = updated.generation.status === 'COMPLETED' ? 'critique' : 'failed';
                        await VideoProject.findByIdAndUpdate(p._id, {
                            status: newStatus,
                            generation: { ...updated.generation, provider },
                        });
                        // Update the in-memory project for the response
                        p.status = newStatus;
                        p.generation = { ...updated.generation, provider };
                        console.log(`✅ Synced project ${p._id}: ${newStatus} — videoUrl: ${updated.generation.videoUrl ? 'YES' : 'no'}`);
                    } else {
                        console.log(`⏳ Project ${p._id} still ${updated.generation?.status || 'unknown'}`);
                    }
                } catch (e) {
                    console.warn(`⚠️ Failed to sync project ${p._id}:`, e.message);
                }
            }));
        }

        res.json({ success: true, projects, total });
    } catch (error) {
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
            project: {
                ...project,
                pipeline: getPipelineInfo(project.status),
            },
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
router.get('/models/capabilities', protect, (req, res) => {
    res.json({ success: true, capabilities: MODEL_CAPABILITIES });
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

        // Upload to fal storage
        const { default: firstFrameModule } = await import('../agents/videoStudio/firstFrame.js');
        // Use the uploadToFalStorage function directly
        const falKey = process.env.FAL_KEY;
        if (!falKey) return res.status(500).json({ success: false, error: 'FAL_KEY not configured' });

        const buffer = Buffer.from(base64, 'base64');
        const ext = mimeType.includes('png') ? 'png' : 'jpg';
        const filename = `ref-image-${Date.now()}.${ext}`;

        // Try fal initiate upload
        let hostedUrl = null;
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

        if (hostedUrl) {
            console.log(`📤 Image uploaded: ${hostedUrl.substring(0, 80)}...`);
            res.json({ success: true, url: hostedUrl });
        } else {
            res.status(500).json({ success: false, error: 'Failed to upload image' });
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
        console.error('Generate first frame error:', err);
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/video-studio/enhance-prompt — AI-enhance a raw video prompt
// ══════════════════════════════════════════════════════════════════════════════
router.post('/enhance-prompt', protect, async (req, res) => {
    try {
        const { prompt, model, duration, aspectRatio, brandId, style } = req.body;
        if (!prompt || !prompt.trim()) {
            return res.status(400).json({ success: false, error: 'Prompt is required' });
        }

        // Load brand context for on-brand prompt enhancement
        let brandContext = '';
        if (brandId) {
            try {
                const brand = await Brand.findById(brandId).lean();
                if (brand) {
                    const parts = [];
                    if (brand.name) parts.push(`Brand: ${brand.name}`);
                    if (brand.tagline) parts.push(`Tagline: "${brand.tagline}"`);
                    if (brand.dna?.brandVoice) parts.push(`Brand Voice: ${brand.dna.brandVoice}`);
                    if (brand.dna?.visualStyle) parts.push(`Visual Style: ${brand.dna.visualStyle}`);
                    if (brand.dna?.targetAudience) parts.push(`Target Audience: ${brand.dna.targetAudience}`);
                    if (brand.dna?.colorPalette?.length) parts.push(`Colors: ${brand.dna.colorPalette.join(', ')}`);
                    if (brand.dna?.industry) parts.push(`Industry: ${brand.dna.industry}`);
                    if (brand.dna?.uniqueSellingPoints?.length) parts.push(`USPs: ${brand.dna.uniqueSellingPoints.join(', ')}`);
                    if (brand.dna?.emotionalTone) parts.push(`Emotional Tone: ${brand.dna.emotionalTone}`);
                    if (parts.length > 0) {
                        brandContext = `\n\nBRAND CONTEXT (IMPORTANT — the enhanced prompt MUST align with this brand):\n${parts.join('\n')}`;
                    }
                }
            } catch (e) {
                console.warn('Could not load brand context:', e.message);
            }
        }

        const aiRouter = getAIRouter();
        const isAdFilm = style === 'adfilm';

        const systemPrompt = isAdFilm
            ? `You are an expert AD FILM DIRECTOR and video prompt engineer. Transform the user's raw idea into a cinematic, production-ready video generation prompt structured like a professional ad film.

AD FILM STRUCTURE (adapt timing to ${duration || 6}s total):
- HOOK (0-${Math.max(1, Math.round((duration || 6) * 0.15))}s): Attention-grabbing opening — extreme close-up, dramatic reveal, or unexpected visual
- STORY (${Math.max(1, Math.round((duration || 6) * 0.15))}-${Math.round((duration || 6) * 0.7)}s): Build emotional connection — show the problem/desire, then the solution
- CALL TO ACTION (${Math.round((duration || 6) * 0.7)}-${duration || 6}s): Brand reveal, tagline, product hero shot with confident energy

CINEMATIC RULES:
- Specify camera movements: dolly in, tracking shot, crane up, rack focus, slow push
- Lighting direction: golden hour, rim lighting, volumetric haze, studio three-point
- Color grading: match brand palette if provided, use warm/cool contrast for emotion
- Vocal/Music direction: describe the voice-over tone (confident, aspirational, intimate), music mood (uplifting strings, electronic pulse, acoustic warmth)
- Pacing: match cuts to music beats, use slow-motion for hero moments
- End with brand logo/tagline reveal with premium feel

Duration: ${duration || 6}s | Aspect ratio: ${aspectRatio || '16:9'} | Model: ${model || 'seedance-2.0'}
${brandContext}
${brandContext ? '- CRITICAL: Weave the brand name, tagline, colors, and voice into the CTA. The ad must FEEL like this brand.' : ''}
- If the user mentions @image1, @image2 etc., keep those tags as-is in the prompt
- Output ONLY valid JSON: {"enhancedPrompt": "...", "changes": ["change1", "change2"]}`

            : `You are a cinematic AI video prompt enhancer. Take the user's raw prompt and rewrite it into a detailed, production-ready video generation prompt.

Rules:
- Add specific visual details: lighting, camera angle, movement, color palette
- Include cinematic language: depth of field, lens type, motion type
- Keep the core intent but make it vivid and specific
- Duration: ${duration || 5}s, Aspect ratio: ${aspectRatio || '16:9'}, Model: ${model || 'general'}
${brandContext}
${brandContext ? '- IMPORTANT: Align the visual style, colors, mood, and tone with the brand identity above' : ''}
- If the user mentions @image1, @image2 etc., keep those tags as-is in the prompt
- Output ONLY valid JSON: {"enhancedPrompt": "...", "changes": ["change1", "change2"]}`;

        const result = await aiRouter.generateText({
            systemPrompt,
            userPrompt: `Enhance this video prompt:\n\n"${prompt.trim()}"`,
            temperature: 0.5,
            maxTokens: 1024,
        }, { provider: 'anthropic' });

        let parsed;
        try {
            const jsonMatch = (result.text || '').match(/\{[\s\S]*\}/);
            parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { enhancedPrompt: result.text };
        } catch {
            parsed = { enhancedPrompt: result.text || prompt };
        }

        res.json({
            success: true,
            enhancedPrompt: parsed.enhancedPrompt || prompt,
            changes: parsed.changes || [],
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
 * Download a video from an ephemeral CDN URL and upload to S3.
 * Updates the project in DB with the permanent S3 URL.
 * Returns the S3 URL if successful, null otherwise.
 */
export async function downloadAndUploadVideoToS3(projectId, videoUrl) {
    if (!videoUrl || !videoUrl.startsWith('http')) return null;
    try {
        console.log(`📥 Downloading video for S3 upload: ${videoUrl.substring(0, 80)}...`);
        const resp = await fetch(videoUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            redirect: 'follow',
        });
        if (!resp.ok) {
            console.warn(`⚠️ Video download failed (${resp.status}): ${videoUrl.substring(0, 80)}`);
            return null;
        }
        const arrayBuf = await resp.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);
        if (buffer.length < 1000) {
            console.warn(`⚠️ Video download too small (${buffer.length} bytes), likely expired`);
            return null;
        }

        // Upload to S3
        const s3Key = `videos/${projectId}.mp4`;
        console.log(`☁️ Uploading video to S3: ${s3Key} (${Math.round(buffer.length / 1024)}KB)...`);
        const s3Url = await uploadToS3(buffer, s3Key, 'video/mp4');
        console.log(`✅ Video uploaded to S3: ${s3Url}`);

        // Update DB with permanent S3 URL
        await VideoProject.findByIdAndUpdate(projectId, {
            'generation.s3VideoUrl': s3Url,
        });

        return s3Url;
    } catch (e) {
        console.warn(`⚠️ Video S3 upload error:`, e.message);
        return null;
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/video-studio/:id/video — Serve video (S3 → CDN fallback)
// No auth required — <video> tags can't send Authorization headers
// ══════════════════════════════════════════════════════════════════════════════
router.get('/:id/video', async (req, res) => {
    try {
        const project = await VideoProject.findById(req.params.id)
            .select('generation.videoUrl generation.s3VideoUrl')
            .lean();
        if (!project?.generation?.videoUrl && !project?.generation?.s3VideoUrl) {
            return res.status(404).send('Video not found');
        }

        // If already on S3, redirect to the permanent S3 URL
        if (project.generation.s3VideoUrl) {
            return res.redirect(302, project.generation.s3VideoUrl);
        }

        // Not on S3 yet — try to download from CDN and upload to S3
        const videoUrl = project.generation.videoUrl;
        if (!videoUrl) return res.status(404).send('Video URL not available');

        const s3Url = await downloadAndUploadVideoToS3(req.params.id, videoUrl);
        if (s3Url) {
            return res.redirect(302, s3Url);
        }

        // CDN URL expired and can't download — return 410 Gone
        res.status(410).json({
            success: false,
            error: 'Video has expired from CDN and could not be saved. The original URL was ephemeral.'
        });
    } catch (error) {
        console.error('Video serve error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

export default router;

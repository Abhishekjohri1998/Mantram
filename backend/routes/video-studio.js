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
import { saveLearnings, getStylePreferences } from '../agents/videoStudio/selfLearning.js';
import { getRouter as getAIRouter } from '../ai/router.js';

const router = Router();

// Validate :id parameter — skip non-ObjectId values so named routes like /advanced/generate work
router.param('id', (req, res, next, id) => {
    if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({ success: false, error: `Invalid project ID: ${id}` });
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
        res.status(500).json({ success: false, error: error.message });
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
        res.status(500).json({ success: false, error: error.message });
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
        res.status(500).json({ success: false, error: error.message });
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
        res.status(500).json({ success: false, error: error.message });
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

                // If completed, auto-run critic
                if (updated.status === 'critique') {
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
        res.status(500).json({ success: false, error: error.message });
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
        res.status(500).json({ success: false, error: error.message });
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
        res.status(500).json({ success: false, error: error.message });
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
                .select('title status mode input.videoType routing.selectedModel routing.costPreview generation createdAt updatedAt')
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
        res.status(500).json({ success: false, error: error.message });
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
        res.status(500).json({ success: false, error: error.message });
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
// POST /api/video-studio/enhance-prompt — AI-enhance a raw video prompt
// ══════════════════════════════════════════════════════════════════════════════
router.post('/enhance-prompt', protect, async (req, res) => {
    try {
        const { prompt, model, duration, aspectRatio, brandId } = req.body;
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

        // Use Claude with brand context for reliable prompt enhancement
        const aiRouter = getAIRouter();

        const systemPrompt = `You are a cinematic AI video prompt enhancer. Take the user's raw prompt and rewrite it into a detailed, production-ready video generation prompt.

Rules:
- Add specific visual details: lighting, camera angle, movement, color palette
- Include cinematic language: depth of field, lens type, motion type
- Keep the core intent but make it vivid and specific
- Duration: ${duration || 5}s, Aspect ratio: ${aspectRatio || '16:9'}, Model: ${model || 'general'}
${brandContext}
${brandContext ? '- IMPORTANT: Align the visual style, colors, mood, and tone with the brand identity above' : ''}
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
        res.status(500).json({ success: false, error: error.message });
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

        // Create project in advanced mode
        const project = await VideoProject.create({
            user: req.user._id,
            brand: brandId || null,
            title: prompt.trim().substring(0, 60) + '...',
            status: 'advanced-generating',
            mode: 'advanced',
            advancedConfig: {
                prompt: prompt.trim(),
                firstImageUrl: firstImageUrl || '',
                lastImageUrl: lastImageUrl || '',
                referenceImages: referenceImages || [],
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
        res.status(500).json({ success: false, error: error.message });
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
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;

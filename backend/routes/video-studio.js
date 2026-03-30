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
import { s3Client } from '../utils/s3.js';
import VideoProject from '../models/VideoProject.js';
import ClonedVoice from '../models/ClonedVoice.js';
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
} from '../agents/videoStudio/nodes.js';
import { estimateCost, getModelsInfo, MODEL_CAPABILITIES } from '../agents/videoStudio/falClient.js';
import { submitPiApiImageToVideo, submitPiApiVideoExtend } from '../agents/videoStudio/piApiClient.js';
import { listAvatars, listVoices, generateUGCVideo, generatePhotoAvatarVideo, getHeyGenVideoStatus, generateVideoWithAudio, uploadAssetToHeyGen, createPhotoAvatar, getPhotoAvatarStatus, checkPhotoGenStatus, generateVideoAgent, generatePlacementPoses, generatePlacementVideo, registerWebhook, generateLooks, addMotion, listAvatarGroups, listAvatarLooks } from '../agents/videoStudio/heygenClient.js';
import { generateUGCScript, UGC_STYLES } from '../agents/videoStudio/ugcScriptGenerator.js';
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
            generateAudio, qualityMode, brandId,
        } = req.body;

        // 🔍 DIAGNOSTIC: Log start of handler
        console.log(`🎬 [ADVANCED] Start generate for User: ${req.user.email} | Model: ${model || 'kling-3.0'} | Duration: ${duration || 5}s`);

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
            creditsUsed: req.creditsDeducted || 0,
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
        // LaoZhang sync: state.status may be 'critique' (already completed)
        const projectStatus = state.status === 'critique' ? 'completed' : 'advanced-generating';
        const updatePayload = {
            status: projectStatus,
            generation: state.generation,
            backendPrompt: prompt.trim(),
        };
        if (state.generation?.videoUrl) {
            updatePayload.finalVideoUrl = state.generation.videoUrl;
        }
        await VideoProject.findByIdAndUpdate(project._id, updatePayload);

        // LaoZhang sync: video is already generated — upload to S3 before CDN expires
        // This normally happens in the polling loop, but LZ projects skip polling
        if (projectStatus === 'completed' && state.generation?.videoUrl) {
            downloadAndUploadVideoToS3(project._id.toString(), state.generation.videoUrl)
                .catch(e => console.warn('⚠️ LZ Video S3 upload failed:', e.message));
        }

        res.json({
            success: true,
            project: {
                _id: project._id,
                status: projectStatus,
                mode: 'advanced',
                generation: state.generation,
                costPreview: state.costPreview,
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

        res.json({ success: true, url: s3Url });
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
        const { brand, brandContext, products } = await (await import('../agents/shared/agentUtils.js')).loadBrandContext(brandId);

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
                }

                const framePrompt = `Generate a high-quality cinematic first frame for a video scene:\n${scene.visualPrompt}\n\nMood: ${scene.mood || 'professional'}. This should look like a movie still or the opening frame of a commercial. Photorealistic, high production value.`;

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
            } else if (session.allImages?.length > 0 && i === 0) {
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

                const state = await advancedGenerateNode({
                    prompt: scene.visualPrompt,
                    model,
                    duration: dur,
                    resolution: '1080p',
                    qualityMode,
                    firstImageUrl: firstImageUrl || '',
                    generateAudio: session.voiceover?.enabled !== true,
                    aspectRatio,
                    referenceImages: (session.referenceImages || []).filter(u => u && !u.startsWith('data:')),
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
                        const ttsResp = await fetch('https://queue.fal.run/fal-ai/minimax/speech/text-to-speech', {
                            method: 'POST',
                            headers: { 'Authorization': `Key ${falKey}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                text: storyboard.voiceoverScript,
                                voice_setting: { voice_id: session.voiceover.voiceId || 'moss_en_hd', speed: session.voiceover.speed || 1.0 },
                                model: 'speech-02-hd',
                            }),
                        });
                        if (ttsResp.ok) {
                            const ttsData = await ttsResp.json();
                            if (ttsData.request_id) voiceoverUrl = `fal-pending:${ttsData.request_id}`;
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

        // Submit to fal.ai queue
        const submitResp = await fetch(`${FAL_QUEUE_URL}/fal-ai/minimax/speech-02-hd`, {
            method: 'POST',
            headers: {
                'Authorization': `Key ${falKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(30000),
        });

        if (!submitResp.ok) {
            const errText = await submitResp.text();
            console.error(`❌ Minimax TTS submit error: ${submitResp.status}`, errText);
            return res.status(500).json({ success: false, error: `TTS failed: ${errText.substring(0, 200)}` });
        }

        const submitData = await submitResp.json();
        const requestId = submitData.request_id;
        console.log(`  → Queued: requestId=${requestId}`);

        // Poll for completion (up to 60s)
        let result = null;
        for (let i = 0; i < 20; i++) {
            await new Promise(r => setTimeout(r, 3000));
            const statusResp = await fetch(
                `${FAL_QUEUE_URL}/fal-ai/minimax/requests/${requestId}/status`,
                { headers: { 'Authorization': `Key ${falKey}` } }
            );
            if (!statusResp.ok) continue;
            const statusData = await statusResp.json();
            if (statusData.status === 'COMPLETED') {
                const resultResp = await fetch(
                    `${FAL_QUEUE_URL}/fal-ai/minimax/requests/${requestId}`,
                    { headers: { 'Authorization': `Key ${falKey}` } }
                );
                result = await resultResp.json();
                break;
            } else if (statusData.status === 'FAILED') {
                return res.status(500).json({ success: false, error: 'TTS generation failed' });
            }
        }

        if (!result?.audio?.url) {
            return res.status(500).json({ success: false, error: 'TTS timed out' });
        }

        // Download audio and upload to S3
        const audioResp = await fetch(result.audio.url);
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
                contents: [{
                    role: 'user',
                    parts: [
                        { inlineData: { mimeType: imgMime, data: imgBase64 } },
                        { text: `Edit this photo: ${prompt.trim()}. Keep the person's face and identity exactly the same. Only change the clothing, background, and lighting as described. Output a high quality professional portrait photo.` },
                    ],
                }],
                generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
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
                    speaker: speaker || 'anushka',
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
            // ── Minimax TTS (global voices + cloned voices) via fal.ai ──
            const falKey = process.env.FAL_API_KEY;
            if (!falKey) return res.status(500).json({ success: false, error: 'FAL_API_KEY not configured' });

            const payload = {
                text: fullScript.substring(0, 5000),
                voice_setting: {
                    voice_id: voiceId || 'moss_en_hd',
                    speed: speed || 1,
                },
                output_format: 'url',
                language_boost: 'auto',
            };
            if (emotion) payload.voice_setting.emotion = emotion;

            // Submit to fal.ai queue
            const submitResp = await fetch(`${FAL_QUEUE_URL}/fal-ai/minimax/speech-02-hd`, {
                method: 'POST',
                headers: {
                    'Authorization': `Key ${falKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(30000),
            });

            if (!submitResp.ok) {
                const errText = await submitResp.text();
                throw new Error(`TTS failed (${submitResp.status}): ${errText.substring(0, 200)}`);
            }

            const submitData = await submitResp.json();
            const requestId = submitData.request_id;

            // Poll for completion (up to 60s)
            let result = null;
            for (let i = 0; i < 20; i++) {
                await new Promise(r => setTimeout(r, 3000));
                const statusResp = await fetch(
                    `${FAL_QUEUE_URL}/fal-ai/minimax/requests/${requestId}/status`,
                    { headers: { 'Authorization': `Key ${falKey}` } }
                );
                if (!statusResp.ok) continue;
                const statusData = await statusResp.json();
                if (statusData.status === 'COMPLETED') {
                    const resultResp = await fetch(
                        `${FAL_QUEUE_URL}/fal-ai/minimax/requests/${requestId}`,
                        { headers: { 'Authorization': `Key ${falKey}` } }
                    );
                    result = await resultResp.json();
                    break;
                } else if (statusData.status === 'FAILED') {
                    throw new Error('TTS generation failed');
                }
            }

            if (!result?.audio?.url) throw new Error('TTS timed out — please try again');

            // Download audio and upload to S3
            const audioResp = await fetch(result.audio.url);
            const audioBuffer = Buffer.from(await audioResp.arrayBuffer());
            const s3Key = `voiceover-preview/${req.user._id}/${Date.now()}.mp3`;
            audioUrl = await uploadToS3(audioBuffer, s3Key, 'audio/mpeg');
            durationMs = result.duration_ms || 0;
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
            await VideoProject.findByIdAndUpdate(project._id, { routing, creditsUsed: req.creditsDeducted || 0 });
        } else {
            // Even if no routing updates, track deducted credits
            await VideoProject.findByIdAndUpdate(project._id, { creditsUsed: req.creditsDeducted || 0 });
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

        if ((project.status === 'generating' || project.status === 'advanced-generating') && project.generation?.falRequestId) {

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
                        project: {
                            _id: project._id,
                            status: 'completed',
                            generation: updatedGen,
                        },
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
                        project: {
                            _id: project._id,
                            status: 'failed',
                            generation: updatedGen,
                        },
                    });
                }

                // Still processing — return real-time progress from HeyGen
                return res.json({
                    success: true,
                    project: {
                        _id: project._id,
                        status: project.status,
                        generation: {
                            ...project.generation,
                            progress: heygenStatus.progress || project.generation.progress || 20,
                        },
                    },
                });
            }

            // ── fal.ai / other providers: existing poll logic ──
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

                if (updated.status === 'failed' && project.creditsUsed > 0) {
                    await refundCredits(project.user, project.creditsUsed, 'videoGenerateRefund', `Refund: Video Generation Async Failure (${updated.generation?.error || 'Unknown'})`, 'video', { projectId: project._id });
                    await VideoProject.findByIdAndUpdate(project._id, { creditsUsed: 0 });
                }

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
        const { brandId, status, mode, limit = 50, page = 1 } = req.query;
        const filter = { user: req.user._id };
        if (brandId) filter.brand = brandId;
        if (status) filter.status = status;
        if (mode) filter.mode = mode;

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
                        else if (model === 'sora-2') provider = 'laozhang';
                        else if (model.startsWith('heygen')) provider = 'heygen';
                        else provider = 'fal';
                    }

                    // HeyGen projects — poll HeyGen API directly
                    if (provider === 'heygen') {
                        const hStatus = await getHeyGenVideoStatus(p.generation.falRequestId);
                        if (hStatus.status === 'COMPLETED') {
                            await VideoProject.findByIdAndUpdate(p._id, {
                                status: 'completed',
                                generation: { ...p.generation, videoUrl: hStatus.videoUrl, thumbnailUrl: hStatus.thumbnailUrl || '', progress: 100, completedAt: new Date() },
                                finalVideoUrl: hStatus.videoUrl,
                            });
                            p.status = 'completed';
                            p.generation = { ...p.generation, videoUrl: hStatus.videoUrl, thumbnailUrl: hStatus.thumbnailUrl || '', progress: 100 };
                            if (hStatus.videoUrl) downloadAndUploadVideoToS3(p._id.toString(), hStatus.videoUrl).catch(() => {});
                            console.log(`✅ HeyGen synced ${p._id}: completed`);
                        } else if (hStatus.status === 'FAILED') {
                            await VideoProject.findByIdAndUpdate(p._id, { status: 'failed', 'generation.error': hStatus.error });
                            p.status = 'failed';
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
        console.error('Generate first frame error:', err);
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/video-studio/enhance-prompt — AI-enhance a raw video prompt
// ══════════════════════════════════════════════════════════════════════════════
router.post('/enhance-prompt', protect, requireCredits('promptEnhance'), async (req, res) => {
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
- Output ONLY the enhanced prompt text. Do NOT output JSON, code blocks, or any formatting. Just the enhanced cinematic prompt as plain text.`

            : `You are a cinematic AI video prompt enhancer. Take the user's raw prompt and rewrite it into a detailed, production-ready video generation prompt.

Rules:
- Add specific visual details: lighting, camera angle, movement, color palette
- Include cinematic language: depth of field, lens type, motion type
- Keep the core intent but make it vivid and specific
- Duration: ${duration || 5}s, Aspect ratio: ${aspectRatio || '16:9'}, Model: ${model || 'general'}
${brandContext}
${brandContext ? '- IMPORTANT: Align the visual style, colors, mood, and tone with the brand identity above' : ''}
- If the user mentions @image1, @image2 etc., keep those tags as-is in the prompt
- Output ONLY the enhanced prompt text. Do NOT output JSON, code blocks, or any formatting. Just the enhanced cinematic prompt as plain text.`;

        const result = await aiRouter.generateText({
            systemPrompt,
            userPrompt: `Enhance this video prompt:\n\n"${prompt.trim()}"`,
            temperature: 0.5,
            maxTokens: 4096, // Gemini 2.5 Flash uses ~1300 thinking tokens — needs large budget
        });

        // Clean up AI response — strip any accidental JSON/code block wrapping
        let enhanced = (result.text || prompt).trim();

        // Strip <think>...</think> reasoning tags (Gemini sometimes includes these)
        enhanced = enhanced.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

        // If AI returned JSON despite instructions, extract the prompt text from it
        // Check anywhere in the response, not just the start
        const jsonMatch = enhanced.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                const obj = JSON.parse(jsonMatch[0]);
                // Try common field names
                const extracted = obj.enhancedPrompt || obj.enhanced_prompt || obj.prompt ||
                    obj.text || obj.description || obj.content || obj.output;
                if (extracted && typeof extracted === 'string' && extracted.length > 30) {
                    enhanced = extracted;
                }
            } catch {
                // Not valid JSON — continue with stripping
            }
        }

        // Strip code fences (```json ... ``` or ``` ... ```)
        enhanced = enhanced.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim();

        // Strip any leading/trailing quotes the AI might add
        if ((enhanced.startsWith('"') && enhanced.endsWith('"')) ||
            (enhanced.startsWith("'") && enhanced.endsWith("'"))) {
            enhanced = enhanced.slice(1, -1);
        }

        // If we still have JSON-looking text, strip everything except the longest text value
        if (enhanced.startsWith('{') && enhanced.endsWith('}')) {
            try {
                const obj = JSON.parse(enhanced);
                const values = Object.values(obj).filter(v => typeof v === 'string');
                const longest = values.sort((a, b) => b.length - a.length)[0];
                if (longest && longest.length > 30) {
                    enhanced = longest;
                }
            } catch { /* not JSON, keep as-is */ }
        }

        res.json({
            success: true,
            enhancedPrompt: enhanced,
            changes: [],
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

        // Update DB with permanent S3 URL — overwrite the ephemeral one
        await VideoProject.findByIdAndUpdate(projectId, {
            'generation.videoUrl': s3Url,
            'generation.s3VideoUrl': s3Url,
            finalVideoUrl: s3Url
        });

        return s3Url;
    } catch (e) {
        console.warn(`⚠️ Video S3 upload error:`, e.message);
        // S3 failed — keep the original provider video URL (xAI/PiAPI CDN)
        console.log(`📎 Keeping original video URL: ${videoUrl.substring(0, 80)}...`);
        return videoUrl;
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

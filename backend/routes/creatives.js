import mongoose from 'mongoose';
import { randomUUID } from 'crypto';

import GenerationJob from '../models/GenerationJob.js';
import { Router } from 'express';
import Creative from '../models/Creative.js';
import Feedback from '../models/Feedback.js';
import Brand from '../models/Brand.js';
import Product from '../models/Product.js';
import { protect } from '../middleware/auth.js';
import { requireStudio } from '../middleware/studioAccess.js';
import { requireCredits, refundCredits } from '../middleware/credits.js';
// orchestrator import removed — no fallback routing
import { addWatermark } from '../utils/watermark.js';
import { getSetting } from '../models/SystemSettings.js';

import { uploadToS3 } from '../utils/s3.js';
import { overlayLogo, fetchImageBuffer } from '../utils/logoOverlay.js';
import { GoogleGenAI } from '@google/genai';
import { safeErrorMessage } from '../utils/safeError.js';
import { getRouter } from '../ai/router.js';
import { runCreativePipeline, postGenerationCriticNode } from '../agents/creativeStudio/nodes.js';
import { startProgress, addStep, getProgress, endProgress } from '../utils/progressStore.js';
import { laozhangImageGenerate, laozhangMultimodalImageGenerate, isLaozhangAvailable } from '../agents/videoStudio/laozhangClient.js';

const router = Router();

// In-memory job tracker for carousel async pipeline
// Allows polling to see real-time progress before DB write
const carouselJobs = new Map(); // carouselId → { status, panels, panoramicUrl, error, updatedAt }
setInterval(() => {
    const cutoff = Date.now() - 10 * 60 * 1000; // 10min TTL
    for (const [id, job] of carouselJobs) {
        if (job.updatedAt < cutoff) carouselJobs.delete(id);
    }
}, 2 * 60 * 1000);

async function internalGenerateCreative({ body, user, creditsDeducted, jobId, progressId }) {
    try {
        const { brandId, type, prompt, options } = body;
        
        let agenticMeta = { mcotEnabled: true }; 

        if (progressId) {
            await addStep(progressId, { agent: 'intel', message: 'Analyzing brand DNA...', status: 'working' });
        }

        const brand = await Brand.findById(brandId);
        if (!brand) throw new Error('Brand not found');

        let pipelineResult;
        try {
            pipelineResult = await runCreativePipeline({
                brandId,
                brief: prompt,
                type: type || 'instagram-post',
                options: options || {},
                emit: async (agent, message, status, detail) => {
                    if (progressId) {
                        await addStep(progressId, { agent, message, status, detail });
                    }
                }
            });
            agenticMeta = {
                ...agenticMeta,
                ...pipelineResult,
                pipelineRan: true
            };
        } catch (pipelineErr) {
            console.error('Agentic Pipeline failed, falling back to raw prompt:', pipelineErr.message);
            agenticMeta.pipelineError = pipelineErr.message;
        }

        const fullPrompt = agenticMeta.engineeredPrompt?.totalPrompt || prompt;
        const selectedImageModel = (options?.imageModel || 'nanobanana-2').toLowerCase();
        const aspectRatio = options?.aspectRatio || '1:1';
        const imageSize = options?.imageSize || '1K';
        const customSize = options?.customSize || null;

        if (progressId) {
            await addStep(progressId, { agent: 'generating', message: `Generating using ${selectedImageModel}...`, status: 'working' });
        }

        const result = await routedImageGenerate(
            fullPrompt,
            [], // imageParts
            0.4, // temperature
            aspectRatio,
            imageSize,
            selectedImageModel,
            [], // refImageUrls
            customSize
        );

        if (result.modelBusy) {
            throw new Error('AI model servers are busy. Please try again soon.');
        }

        const rawImageUrl = result.imageUrl || '';
        if (!rawImageUrl) {
            throw new Error('Image generation produced no image');
        }

        const creative = await Creative.create({
            user: user._id,
            brand: brandId,
            type: type || 'instagram-post',
            title: result.title || '',
            prompt,
            imageUrl: rawImageUrl,
            thumbnailUrl: result.thumbnailUrl || rawImageUrl,
            dimensions: result.dimensions || {},
            designData: result.designData || {},
            aiMeta: { ...result.aiMeta || {}, processingStatus: 'uploading' },
            ...(agenticMeta?.copy ? { copy: agenticMeta.copy } : {}),
        });

        if (jobId) {
            await GenerationJob.findOneAndUpdate(
                { jobId },
                { 
                    status: 'completed', 
                    completedAt: new Date(), 
                    creativeId: creative._id,
                    imageUrl: creative.imageUrl,
                    result: { creative, warnings: result.warnings || [] }
                }
            ).catch(() => {});
        }

        user.updateOne({ $inc: { 'usage.creativesGenerated': 1 } }).catch(() => {});

        if (progressId) {
            await addStep(progressId, { agent: 'generating', message: 'Image created successfully!', status: 'done' });
            await addStep(progressId, { agent: 'complete', message: 'Creative ready!', status: 'done' });
            endProgress(progressId);
        }

        // BACKGROUND POST-PROCESSING
        (async () => {
            try {
                let finalUrl = rawImageUrl;
                const ts = Date.now();

                if (finalUrl.startsWith('data:image/')) {
                    try {
                        finalUrl = await uploadToS3(finalUrl, `creatives/${brandId}/${ts}.png`);
                    } catch (s3Err) {
                        console.error('[BG-S3] Upload failed:', s3Err.message);
                    }
                }

                if (options?.addLogo && finalUrl) {
                    try {
                        const brandData = await Brand.findById(brandId).lean();
                        const logoUrl = brandData?.dna?.logo?.url;
                        if (logoUrl) {
                            const [imageBuffer, logoBuffer] = await Promise.all([
                                fetchImageBuffer(finalUrl),
                                fetchImageBuffer(logoUrl),
                            ]);
                            if (imageBuffer && logoBuffer) {
                                const compositedBuffer = await overlayLogo(
                                    imageBuffer, logoBuffer,
                                    options.logoPosition || 'bottom-right',
                                    options.logoSize || 'medium'
                                );
                                const compositedBase64 = `data:image/png;base64,${compositedBuffer.toString('base64')}`;
                                try {
                                    finalUrl = await uploadToS3(compositedBase64, `creatives/${brandId}/${ts}-logo.png`);
                                } catch (s3Err) {
                                    console.warn('[BG-LOGO] S3 re-upload failed:', s3Err.message);
                                }
                            }
                        }
                    } catch (logoErr) {
                        console.warn('[BG-LOGO] Overlay failed:', logoErr.message);
                    }
                }

                if (finalUrl !== rawImageUrl) {
                    await Creative.updateOne(
                        { _id: creative._id },
                        { $set: { imageUrl: finalUrl, thumbnailUrl: finalUrl, 'aiMeta.processingStatus': 'ready' } }
                    );
                } else {
                    await Creative.updateOne(
                        { _id: creative._id },
                        { $set: { 'aiMeta.processingStatus': 'ready' } }
                    );
                }
            } catch (bgErr) {
                console.error('[BG] error:', bgErr.message);
            }
        })();

        return { success: true, creative, warnings: result.warnings || [] };
    } catch (error) {
        console.error('❌ internalGenerateCreative Error:', error.message);
        throw error;
    }
}

// ══════════════════════════════════════════════════════════════════════════════

/**
 * runCreativeJobAsync — fires the creative pipeline detached from the HTTP request.
 * Makes an internal server-side fetch to the existing /generate endpoint so all
 * pipeline logic (agents, MCoT, logo overlay, S3, etc.) is fully reused.
 */
async function runCreativeJobAsync(jobId, userId, payload) {
    try {
        await GenerationJob.findOneAndUpdate(
            { jobId },
            { status: 'processing', startedAt: new Date() }
        );

        const { brandId, type, prompt, options, creditsDeducted } = payload;
        
        // Find the user object needed for internalGenerateCreative
        const user = await mongoose.model('User').findById(userId);
        if (!user) throw new Error('User not found for background job');

        // Call the internal generation logic directly (bypassing HTTP overhead)
        const data = await internalGenerateCreative({
            body: { brandId, type, prompt, options, jobId },
            user,
            creditsDeducted: creditsDeducted || 0,
            jobId
        });

        if (data?.success && data?.creative) {
            await GenerationJob.findOneAndUpdate(
                { jobId },
                {
                    status: 'completed',
                    completedAt: new Date(),
                    creativeId: data.creative._id,
                    imageUrl: data.creative.imageUrl || data.creative.thumbnailUrl,
                    result: {
                        creative: data.creative,
                        warnings: data.warnings || [],
                    },
                }
            );
            console.log(`✅ JOB ${jobId}: completed — creative ${data.creative._id}`);
        } else {
            const errMsg = data?.error || 'Pipeline returned no creative';
            await GenerationJob.findOneAndUpdate(
                { jobId },
                { status: 'failed', completedAt: new Date(), errorMessage: errMsg }
            );
            if (creditsDeducted > 0) {
                await refundCredits(userId, creditsDeducted, 'creative',
                    `Refund: Background Job ${jobId} Failed — ${errMsg}`, 'creative');
            }
            console.warn(`❌ JOB ${jobId}: failed — ${errMsg}`);
        }
    } catch (err) {
        console.error(`❌ JOB ${jobId}: exception — ${err.message}`);
        try {
            await GenerationJob.findOneAndUpdate(
                { jobId },
                { status: 'failed', completedAt: new Date(), errorMessage: err.message }
            );
            if (payload.creditsDeducted > 0) {
                await refundCredits(userId, payload.creditsDeducted, 'creative',
                    `Refund: Background Job ${jobId} Exception`, 'creative');
            }
        } catch (updateErr) {
            console.error(`Failed to update job ${jobId} on error:`, updateErr.message);
        }
    }
}

// ── POST /api/creatives/jobs — Create a background generation job ──────────────
// Returns jobId in ~50ms. Pipeline runs async. Frontend polls for result.
router.post('/jobs', protect, requireStudio('creativeStudio'), requireCredits('creative'), async (req, res) => {
    try {
        const { brandId, type, prompt, options } = req.body;
        if (!brandId || !prompt) {
            return res.status(400).json({ success: false, error: 'brandId and prompt are required' });
        }

        const jobId = randomUUID();

        await GenerationJob.create({
            jobId,
            user: req.user._id,
            brand: brandId,
            type: 'ai-create',
            status: 'pending',
            prompt,
            format: type,
            options,
            creditsDeducted: req.creditsDeducted || 0,
        });

        // Return immediately — pipeline fires in background
        res.json({ success: true, jobId, message: 'Generation queued. You can navigate freely.' });

        // Extract auth token from the original request to pass to the internal fetch
        const authToken = (req.headers.authorization || '').replace('Bearer ', '');

        // Fire and forget — completely detached from HTTP response
        runCreativeJobAsync(jobId, req.user._id, {
            brandId, type, prompt, options,
            creditsDeducted: req.creditsDeducted || 0,
        }, authToken).catch(err => console.error(`Background job ${jobId} unhandled error:`, err.message));

    } catch (error) {
        console.error('Create job error:', error.message);
        // Refund if job creation failed after credit deduction
        if (req.creditsDeducted > 0) {
            await refundCredits(req.user._id, req.creditsDeducted, 'creative', 'Refund: Job creation failed', 'creative');
        }
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ── GET /api/creatives/jobs — List recent jobs for the current user ────────────
// Used on page load to reconnect to any in-progress or completed jobs.
router.get('/jobs', protect, async (req, res) => {
    try {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // last 24h
        const jobs = await GenerationJob.find(
            { user: req.user._id, createdAt: { $gte: since } },
            { jobId: 1, status: 1, type: 1, format: 1, imageUrl: 1, errorMessage: 1,
              creativeId: 1, createdAt: 1, startedAt: 1, completedAt: 1, steps: { $slice: -5 } }
        )
            .sort({ createdAt: -1 })
            .limit(20)
            .allowDiskUse(true)
            .lean();
        res.json({ success: true, jobs });
    } catch (error) {
        console.error('❌ [API] GET /jobs error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ── GET /api/creatives/jobs/:jobId — Poll a specific job ──────────────────────
router.get('/jobs/:jobId', protect, async (req, res) => {
    try {
        const job = await GenerationJob.findOne(
            { jobId: req.params.jobId, user: req.user._id },
            { jobId: 1, status: 1, type: 1, prompt: 1, format: 1, imageUrl: 1, errorMessage: 1,
              creativeId: 1, result: 1, warnings: 1, createdAt: 1, startedAt: 1, completedAt: 1, steps: 1 }
        ).lean();
        if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
        res.json({ success: true, job });
    } catch (error) {
        console.error('❌ [API] GET /jobs/:id error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ── DELETE /api/creatives/jobs/:jobId — Cancel a pending/processing job ───────
router.delete('/jobs/:jobId', protect, async (req, res) => {
    try {
        const job = await GenerationJob.findOneAndUpdate(
            { jobId: req.params.jobId, user: req.user._id, status: { $in: ['pending', 'processing'] } },
            { status: 'cancelled', completedAt: new Date() }
        );
        if (!job) return res.status(404).json({ success: false, error: 'Job not found or already finished' });
        res.json({ success: true, message: 'Job marked as cancelled' });
    } catch (error) {
        console.error('❌ [API] DELETE /jobs/:id error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════

// GET /api/creatives/progress/:id — Poll real-time pipeline progress
// Lightweight endpoint — no auth required (progress IDs are UUIDs, unguessable)
// ══════════════════════════════════════════════════════════════════════════════
router.get('/progress/:id', (req, res) => {
    const progress = getProgress(req.params.id);
    if (!progress) return res.json({ steps: [] });
    res.json(progress);
});

// ── Build a natural-language brand description (NO labels, NO structured metadata)
// Image models render any label/noun as visible text, so this must be purely descriptive
function buildBrandDescription(brand) {
    const parts = [];
    const dna = brand.dna || {};
    if (dna.industry) parts.push(`${dna.industry}`);
    parts.push(`brand called ${brand.name}`);
    if (dna.voice?.personality) parts.push(`with a ${dna.voice.personality} feel`);
    if (dna.targetAudience) parts.push(`targeting ${dna.targetAudience}`);
    
    // Tagline — woven in naturally
    if (dna.tagline) parts.push(`— "${dna.tagline}"`);
    
    // Company overview / brand description — the elevator pitch
    const overview = dna.companyOverview || dna.brandDescription || '';
    if (overview) parts.push(`— ${overview.substring(0, 200)}`);
    
    // Services/products — described naturally, no bullet points
    const services = dna.servicesOffered || [];
    if (services.length > 0) {
        const serviceList = services.slice(0, 5).join(', ');
        parts.push(`offering ${serviceList}`);
    }
    
    // USPs — described as strengths, not labels
    const usps = dna.uniqueSellingPoints || [];
    if (usps.length > 0) {
        const uspList = usps.slice(0, 3).join(', ');
        parts.push(`known for ${uspList}`);
    }
    
    return parts.join(' ');
}

// ── Build rich visual context from brand DNA for image prompts ──
function buildVisualContext(brand) {
    const parts = [];
    const dna = brand.dna || {};
    if (dna.voice?.personality) parts.push(`Brand personality: ${dna.voice.personality}`);
    
    // NOTE: Typography metadata removed from prompts — Gemini renders font names,
    // weights, and style labels (e.g. "Work Sans 700 normal") as visible text cards
    // on the image. Typography is handled by the canvas editor, not image generation.
    
    // ── Photography & Image Style ──
    if (dna.photographyStyle) parts.push(`Photography direction: ${dna.photographyStyle}`);
    
    // ── Visual DNA — AI-extracted design intelligence ──
    const vdna = dna.visualDNA || {};
    if (vdna.designStyle) parts.push(`Design style: ${vdna.designStyle}`);
    if (vdna.layoutPreference) parts.push(`Layout: ${vdna.layoutPreference}`);
    if (vdna.textPlacement) parts.push(`Text placement: ${vdna.textPlacement}`);
    if (vdna.imageMood) parts.push(`Image mood: ${vdna.imageMood}`);
    if (vdna.textureStyle) parts.push(`Texture/surface: ${vdna.textureStyle}`);
    if (vdna.typographyStyle) parts.push(`Typography rendering: ${vdna.typographyStyle}`);
    if (vdna.decorativeElements) parts.push(`Decorative elements: ${vdna.decorativeElements}`);
    // NOTE: vdna.imageAnalysis removed — it often contains raw color descriptions\n    // and hex codes that Gemini renders as visible swatches on generated images
    
    // ── Design rules from visual DNA ──
    const designRules = vdna.designRules || [];
    const designAvoid = vdna.designAvoid || [];
    if (designRules.length > 0) parts.push(`DESIGN RULES — always follow: ${designRules.slice(0, 5).join('; ')}`);
    if (designAvoid.length > 0) parts.push(`DESIGN AVOIDS — never do: ${designAvoid.slice(0, 5).join('; ')}`);
    
    // ── Content style do's and don'ts ──
    if (dna.contentStyle?.dos?.length) {
        parts.push(`Content principles: ${dna.contentStyle.dos.slice(0, 3).join(', ')}`);
    }
    if (dna.contentStyle?.donts?.length) {
        parts.push(`Content avoids: ${dna.contentStyle.donts.slice(0, 3).join(', ')}`);
    }
    
    // ── Brand values & mission — gives AI deeper context for visual storytelling ──
    const values = dna.brandValues || [];
    if (values.length > 0) {
        parts.push(`Brand values: ${values.slice(0, 4).join(', ')}`);
    }
    if (dna.missionStatement) {
        parts.push(`Brand mission: ${dna.missionStatement.substring(0, 150)}`);
    }
    return parts.join('. ');
}

// Convert brand colors to a direct, enforceable color directive for the AI
// CRITICAL: Describe colors by appearance only — hex codes, labels, and names
// get rendered as visible text/swatches on the image by Gemini
function getColorPhrase(brand) {
    const colors = brand.dna?.colors || [];
    if (!colors.length) return '';
    // Describe colors by visual appearance — NEVER include hex codes, color names as labels,
    // or any technical metadata that the model might render as text on the image
    const colorDescs = colors.slice(0, 4).map(c => {
        const name = c.name || '';
        // Use descriptive color names only, never hex codes
        if (name && !/^#|rgb|color/i.test(name)) return name.toLowerCase();
        // Fallback: skip hex codes entirely — just say 'brand accent'
        return 'brand accent';
    }).filter((v, i, a) => a.indexOf(v) === i); // deduplicate
    return `Use these brand colors throughout the design: ${colorDescs.join(', ')}`;
}

// ── Helper: extract base64 from data URI ────────────────────────────────
function extractBase64(dataUri) {
    const commaIdx = dataUri.indexOf(',');
    const header = dataUri.substring(0, commaIdx);
    const mimeType = header.split(':')[1].split(';')[0];
    const data = dataUri.substring(commaIdx + 1);
    return { mimeType, data };
}

// ── Image Model Configuration ──────────────────────────────────────────
// User-selectable models — NO auto-fallback chain. Default: NanoBanana 2.
// Gemini-native models use Google Direct API; others route through fal.ai.
const IMAGE_MODEL_CONFIG = {
    'nanobanana-2': {
        provider: 'laozhang',
        modelId: 'gemini-3.1-flash-image-preview',
        name: 'NanoBanana 2',
        supportsRefImages: true,
    },
    'nanobanana-pro': {
        provider: 'laozhang',
        modelId: 'gemini-3.1-flash-image-preview',
        name: 'NanoBanana Pro',
        supportsRefImages: true,
    },
    'flux-pro-v1.1': {
        provider: 'laozhang',
        endpoint: 'fal-ai/flux-pro/v1.1',
        name: 'Flux Pro v1.1',
        supportsRefImages: false,
    },
    'flux-2-pro': {
        provider: 'laozhang',
        endpoint: 'fal-ai/flux-2-pro',
        name: 'Flux 2 Pro',
        supportsRefImages: false,
    },
    'seedream-5': {
        provider: 'laozhang',
        endpoint: 'fal-ai/bytedance/seedream/v5/lite/text-to-image',
        name: 'Seedream 5',
        supportsRefImages: false,
    },
    'ideogram': {
        provider: 'laozhang',
        endpoint: 'fal-ai/ideogram/v3',
        name: 'Ideogram v3',
        supportsRefImages: false,
    },
    'grok-imagen': {
        provider: 'grok',
        modelId: 'grok-imagine-image',
        name: 'Grok Imagen',
        supportsRefImages: false,
    },
};

// ── fal.ai Image Generation (queue-based async) ─────────────────────────
async function falImageGenerate(promptText, endpoint, aspectRatio = '1:1', customSize = null) {
    const falKey = process.env.FAL_API_KEY || process.env.FAL_KEY;  // FIXED: FAL_API_KEY is the actual env var
    if (!falKey) throw new Error('FAL_API_KEY not configured for image generation');

    // Map aspect ratio to fal.ai image_size
    const sizeMap = {
        '1:1': { width: 1024, height: 1024 },
        '16:9': { width: 1344, height: 768 },
        '9:16': { width: 768, height: 1344 },
        '4:5': { width: 896, height: 1120 },
        '2:3': { width: 832, height: 1248 },
        '3:4': { width: 896, height: 1184 },
        '3:2': { width: 1248, height: 832 },
        '4:3': { width: 1184, height: 896 },
    };
    // Use custom size if provided, otherwise fall back to ratio map
    // Custom sizes are clamped to 4MP max total pixels for fal.ai compatibility
    let imgSize;
    if (customSize && customSize.width && customSize.height) {
        let w = customSize.width, h = customSize.height;
        const totalPx = w * h;
        const MAX_PX = 4194304; // 4MP
        if (totalPx > MAX_PX) {
            const scale = Math.sqrt(MAX_PX / totalPx);
            w = Math.round(w * scale);
            h = Math.round(h * scale);
        }
        // Round to nearest 8px (required by most diffusion models)
        w = Math.round(w / 8) * 8;
        h = Math.round(h / 8) * 8;
        imgSize = { width: Math.max(256, w), height: Math.max(256, h) };
        console.log(`📐 Custom size: ${customSize.width}x${customSize.height} → clamped to ${imgSize.width}x${imgSize.height}`);
    } else {
        imgSize = sizeMap[aspectRatio] || sizeMap['1:1'];
    }

    console.log(`\n══════ FAL.AI IMAGE GENERATION ══════`);
    console.log(`🎨 Endpoint: ${endpoint}`);
    console.log(`📐 Size: ${imgSize.width}x${imgSize.height} (${aspectRatio})`);
    console.log(`📝 Prompt (first 200 chars): ${promptText.substring(0, 200)}...`);

    // Submit to fal.ai queue
    const submitResp = await fetch(`https://queue.fal.run/${endpoint}`, {
        method: 'POST',
        headers: {
            'Authorization': `Key ${falKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            prompt: promptText,
            image_size: imgSize,
            num_images: 1,
            sync_mode: true, // Wait for result (up to 60s)
        }),
        signal: AbortSignal.timeout(90000),
    });

    if (!submitResp.ok) {
        const errText = await submitResp.text();
        console.error(`❌ fal.ai image error (${submitResp.status}):`, errText);

        // Distinguish billing/quota errors from actual busy errors
        if (submitResp.status === 403 || submitResp.status === 402) {
            const isBalance = errText.toLowerCase().includes('balance') || errText.toLowerCase().includes('locked') || errText.toLowerCase().includes('billing');
            if (isBalance) {
                throw new Error(`QUOTA_EXHAUSTED: fal.ai account balance exhausted. Please top up at fal.ai/dashboard/billing.`);
            }
            throw new Error(`QUOTA_EXHAUSTED: fal.ai access denied (${submitResp.status}). Check your API key and billing.`);
        }
        if (submitResp.status === 404) {
            throw new Error(`MODEL_NOT_FOUND: fal.ai endpoint "${endpoint}" not found. The model may have been deprecated or the endpoint is incorrect.`);
        }
        if (submitResp.status === 429 || submitResp.status === 503) {
            throw new Error(`BUSY: fal.ai is at capacity (${submitResp.status}). Please try again in a moment.`);
        }
        throw new Error(`fal.ai image generation failed (${submitResp.status}): ${errText.substring(0, 200)}`);
    }

    const data = await submitResp.json();

    // fal.ai returns { images: [{ url, content_type }], ... } or { request_id } for async
    let imageUrl = '';
    if (data.images?.[0]?.url) {
        imageUrl = data.images[0].url;
    } else if (data.output?.images?.[0]?.url) {
        imageUrl = data.output.images[0].url;
    } else if (data.request_id) {
        // Async mode — poll for result
        console.log(`⏳ fal.ai queued: ${data.request_id}, polling...`);
        const resultUrl = `https://queue.fal.run/${endpoint}/requests/${data.request_id}`;
        for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 1000));
            try {
                const pollResp = await fetch(resultUrl, {
                    headers: { 'Authorization': `Key ${falKey}` },
                });
                if (pollResp.status === 200) {
                    const pollData = await pollResp.json();
                    if (pollData.images?.[0]?.url) {
                        imageUrl = pollData.images[0].url;
                        break;
                    }
                    if (pollData.output?.images?.[0]?.url) {
                        imageUrl = pollData.output.images[0].url;
                        break;
                    }
                }
            } catch { /* retry */ }
        }
    }

    if (!imageUrl) throw new Error('fal.ai returned no image');

    console.log(`✅ Image generated via fal.ai: ${imageUrl.substring(0, 100)}...`);
    console.log(`══════ END FAL.AI IMAGE GENERATION ══════\n`);

    return { imageUrl, model: endpoint, provider: 'fal', textResponse: '', warnings: [] };
}

// ── Grok Imagen generation via xAI API ──────────────────────────────────
// Uses the OpenAI-compatible xAI endpoint for image generation.
async function grokImageGenerate(promptText, aspectRatio = '1:1') {
    const grokKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
    if (!grokKey) throw new Error('GROK_API_KEY not configured for Grok Imagen');

    console.log(`\n══════ GROK IMAGEN GENERATION ══════`);
    console.log(`📐 Aspect Ratio: ${aspectRatio}`);
    console.log(`📝 Prompt (first 200 chars): ${promptText.substring(0, 200)}...`);

    const response = await fetch('https://api.x.ai/v1/images/generations', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${grokKey}`,
        },
        body: JSON.stringify({
            model: 'grok-imagine-image',
            prompt: promptText,
            response_format: 'b64_json',
            n: 1,
        }),
        signal: AbortSignal.timeout(90000),
    });

    if (!response.ok) {
        const errText = await response.text();
        console.error(`❌ Grok Imagen error (${response.status}):`, errText);
        if (response.status === 503 || response.status === 429) {
            throw new Error(`BUSY: Grok Imagen is currently at capacity`);
        }
        throw new Error(`Grok Imagen failed (${response.status}): ${errText.substring(0, 200)}`);
    }

    const data = await response.json();
    const imageData = data.data?.[0];

    if (!imageData) {
        throw new Error('Grok Imagen returned no image data');
    }

    // Handle both URL and base64 responses
    let imageUrl;
    if (imageData.b64_json) {
        imageUrl = `data:image/png;base64,${imageData.b64_json}`;
    } else if (imageData.url) {
        imageUrl = imageData.url;
    } else {
        throw new Error('Grok Imagen: no image URL or base64 in response');
    }

    console.log(`✅ Grok Imagen: Image generated successfully`);
    return {
        imageUrl,
        model: 'grok-imagine-image',
        textResponse: '',
        warnings: [],
    };
}

// ── Gemini image generation via REST API ────────────────────────────────
// Used for NanoBanana 2 and NanoBanana Pro. NO auto-fallback chain.
// If the model is busy (503), returns modelBusy flag so frontend can notify user.
async function geminiImageGenerate(promptText, imageParts = [], temperature = 0.4, aspectRatio = '1:1', imageSize = '1K', selectedModelId = 'gemini-3.1-flash-image-preview') {
    const imageKey = process.env.GEMINI_IMAGE_API_KEY || process.env.GEMINI_API_KEY;
    if (!imageKey) throw new Error('Gemini API key not configured');

    const baseUrl = 'https://generativelanguage.googleapis.com/v1beta';

    // Build content parts — images as inlineData, then text prompt last
    const parts = [];
    for (const ip of imageParts) {
        if (ip.inlineData) parts.push({ inlineData: ip.inlineData });
    }
    const finalPrompt = aspectRatio && aspectRatio !== '1:1' ? `${promptText}\n\n[ASPECT RATIO: ${aspectRatio}]` : promptText;
    parts.push({ text: finalPrompt });

    let imageUrl = null;
    let textResponse = '';
    let usedModel = '';

    const imageCount = parts.filter(p => p.inlineData).length;
    console.log(`\n══════ CREATIVE STUDIO IMAGE GENERATION (${selectedModelId}) ══════`);
    console.log(`🖼️  Reference images: ${imageCount}`);
    console.log(`📐 Aspect ratio: ${aspectRatio} | Resolution: ${imageSize}`);
    console.log(`📝 Prompt (first 200 chars): ${promptText.substring(0, 200)}...`);

    // Prepend aspect ratio instruction to prompt for correct dimensions
    const arInstruction = aspectRatio !== '1:1' ? `Generate this image in ${aspectRatio} aspect ratio (${aspectRatio === '9:16' ? 'portrait/vertical' : aspectRatio === '16:9' ? 'landscape/horizontal' : aspectRatio}). ` : '';
    // Update text prompt with aspect ratio
    const lastPartIdx = parts.length - 1;
    if (parts[lastPartIdx]?.text) {
        parts[lastPartIdx].text = arInstruction + parts[lastPartIdx].text;
    }

    const warnings = [];

    try {
        console.log(`🎨 Using: ${selectedModelId}...`);
        const url = `${baseUrl}/models/${selectedModelId}:generateContent?key=${imageKey}`;
        const fetchOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts }],
                generationConfig: {
                    responseModalities: ['TEXT', 'IMAGE'],
                    temperature,
                },
            }),
        };

        // Apply Keep-Alive dispatcher if using native Node 18+ undici fetch
        if (typeof global.fetch !== 'undefined' && keepAliveAgent) {
            fetchOptions.dispatcher = keepAliveAgent;
        }

        const resp = await fetch(url, fetchOptions);

        const data = await resp.json();
        if (data.error) {
            const lowerMsg = String(errMsg).toLowerCase();

            // Check for busy/overload — return modelBusy flag for frontend notification
            if (lowerMsg.includes('high demand') || lowerMsg.includes('busy') || resp.status === 503 || resp.status === 429) {
                console.log(`🔴 ${selectedModelId} is BUSY — returning modelBusy flag`);
                return { imageUrl: null, model: selectedModelId, textResponse: '', warnings: [], modelBusy: true };
            }
            throw new Error(`${selectedModelId}: ${errMsg}`);
        }

        const resParts = data.candidates?.[0]?.content?.parts || [];
        for (const part of resParts) {
            if (part.inlineData?.mimeType?.startsWith('image/')) {
                imageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
            if (part.text) textResponse += part.text;
        }

        if (imageUrl) {
            usedModel = selectedModelId;
            console.log(`✅ Image generated successfully with ${selectedModelId}`);
        } else {
            console.warn(`⚠️ ${selectedModelId}: no image in response`);
            warnings.push(`${selectedModelId} returned no image.`);
            throw new Error(`${selectedModelId} returned no image in response`);
        }
    } catch (e) {
        if (e.message?.includes('modelBusy')) throw e; // re-throw busy
        console.error(`❌ ${selectedModelId} error:`, e.message);
        throw e;
    }

    console.log(`══════ END IMAGE GENERATION ══════\n`);
    return { imageUrl, model: usedModel, textResponse, warnings };
}

// ── Unified Image Generate — routes to correct provider based on selected model ──
// refImageUrls: original S3/HTTP URLs of reference images (for LZ multimodal routing)
async function routedImageGenerate(promptText, imageParts = [], temperature = 0.4, aspectRatio = '1:1', imageSize = '1K', selectedModel = 'nanobanana-2', refImageUrls = [], customSize = null) {
    const modelConfig = IMAGE_MODEL_CONFIG[selectedModel] || IMAGE_MODEL_CONFIG['nanobanana-2'];
    const router = getRouter();

    console.log(`🎯 Image Model Router: ${selectedModel} → ${modelConfig.provider} (${modelConfig.name})`);
    if (customSize) console.log(`📐 Custom Size: ${customSize.width}x${customSize.height}`);

    // ── HARD TIMEOUT: 120 seconds max for any image generation ──
    const TIMEOUT_MS = 120_000;
    const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Image generation timed out after 120 seconds. Please try again.')), TIMEOUT_MS)
    );

    const generatePromise = (async () => {
        // ═══════════════════════════════════════════════════════════════
        // LAOZHANG-FIRST ROUTING — Cheapest image provider
        // Try LZ for NanoBanana 2/Pro, Flux, Seedream 5 (50-75% cheaper)
        // Falls through to direct provider on failure.
        // ═══════════════════════════════════════════════════════════════
        // LZ CONFIRMED WORKING MODELS (live-tested 2026-03-29):
        //   ✅ flux-kontext-pro     — returns URL, ~8s
        //   ✅ flux-kontext-max     — returns URL, ~12s
        //   ✅ gemini-3.1-flash-image-preview — returns b64, ~15-20s
        //   ✅ gemini-3-pro-image-preview     — returns b64, ~20-30s
        //   ❌ ideogram-*, seedream-*, black-forest-labs/* — 503 no channel on this account
        // Models without native LZ support → route to best available alternative
        const LZ_IMAGE_MAP = {
            'nanobanana-2':   'gemini-3.1-flash-image-preview',  // Gemini Flash via LZ ✅
            'nanobanana-pro': 'gemini-3.1-flash-image-preview',  // Gemini Pro via LZ ✅
            'flux-pro-v1.1':  'flux-kontext-pro',                // Flux Kontext Pro via LZ ✅
            'flux-2-pro':     'flux-kontext-max',                // Flux Kontext Max via LZ ✅ (premium)
            'seedream-5':     'flux-kontext-max',                // → Flux Max (seedream not on this LZ account)
            'ideogram':       'flux-kontext-pro',                // → Flux Pro (ideogram not on this LZ account)
        };
        const lzModel = LZ_IMAGE_MAP[selectedModel];
        const hasRefImages = imageParts && imageParts.length > 0;

        // ── CUSTOM SIZE BYPASS: LaoZhang doesn't support arbitrary pixel sizes ──
        // Route custom-size requests directly to fal.ai which accepts exact {width, height}
        if (customSize && customSize.width && customSize.height) {
            const isStandardSize = ['1024x1024', '1024x1792', '1792x1024', '1536x1024', '1024x1536'].includes(
                `${customSize.width}x${customSize.height}`
            );
            if (!isStandardSize) {
                try {
                    console.log(`📐 Custom size ${customSize.width}x${customSize.height} → bypassing LaoZhang, routing to fal.ai (Flux) for exact pixel support`);
                    const falEndpoint = modelConfig.endpoint || 'fal-ai/flux-pro/v1.1';
                    const falResult = await falImageGenerate(promptText, falEndpoint, aspectRatio, customSize);
                    return { ...falResult, provider: 'fal', model: selectedModel };
                } catch (falErr) {
                    console.warn(`⚠️ fal.ai custom-size failed (${falErr.message?.substring(0, 80)}), falling back to LaoZhang with nearest standard AR...`);
                    // Fall through to LaoZhang — will use the nearest standard AR from aspectRatio
                }
            }
        }

        // LaoZhang supports TWO image generation modes:
        //  1. Text-only: /v1/images/generations (all LZ models)
        //  2. Multimodal: /v1/chat/completions (Gemini models only — supports S3 ref images)
        // For non-multimodal models (Flux, Seedream, Ideogram): ALWAYS try LZ text-only first.
        // Brand context is already baked into the text prompt, ref images are a bonus not a requirement.
        const LZ_MULTIMODAL_MODELS = ['gemini-3.1-flash-image-preview'];
        const isMultimodalCapable = LZ_MULTIMODAL_MODELS.includes(lzModel);

        if (lzModel && isLaozhangAvailable()) {
            try {
                // Map aspect ratio to WxH
                const AR_SIZE_MAP = {
                    '1:1':  '1024x1024', '16:9': '1792x1024', '9:16': '1024x1792',
                    '4:5':  '1024x1280', '3:4':  '768x1024',  '4:3':  '1024x768',
                    '3:2':  '1536x1024', '2:3':  '1024x1536',
                };
                const lzSize = AR_SIZE_MAP[aspectRatio] || (imageSize === '2K' ? '2048x2048' : '1024x1024');
                // Use custom size for LaoZhang if provided
                const finalLzSize = customSize ? `${Math.min(customSize.width, 2048)}x${Math.min(customSize.height, 2048)}` : lzSize;

                let lzResult;
                const lzRefUrls = (refImageUrls || []).filter(u => u && u.startsWith('http'));

                if (hasRefImages && isMultimodalCapable && lzRefUrls.length > 0) {
                    // MULTIMODAL: Send S3 image URLs directly via chat/completions (Gemini only)
                    console.log(`🏷️ [LaoZhang-Multimodal] ${selectedModel} → ${lzModel} with ${lzRefUrls.length} S3 URLs (size=${finalLzSize})...`);
                    lzResult = await laozhangMultimodalImageGenerate(promptText, lzRefUrls, { model: lzModel, size: finalLzSize });
                } else {
                    // TEXT-ONLY: /v1/images/generations — works for ALL LZ models
                    // Ref images aren't sent but brand context is in the text prompt
                    if (hasRefImages && !isMultimodalCapable) {
                        console.log(`ℹ️ [LaoZhang] ${selectedModel}: ref images present but not multimodal-capable — using text-only (brand context is in prompt)`);
                    }
                    console.log(`🏷️ [LaoZhang-First] ${selectedModel} → ${lzModel} via LaoZhang (cheapest, size=${finalLzSize})...`);
                    lzResult = await laozhangImageGenerate(promptText, { model: lzModel, size: finalLzSize });
                }

                if (lzResult?.imageUrl) {
                    console.log(`✅ [LaoZhang] Image generated via ${lzModel}${hasRefImages && isMultimodalCapable ? ' (multimodal)' : ''}`);
                    return {
                        imageUrl: lzResult.imageUrl,
                        model: selectedModel,
                        provider: 'laozhang',
                        textResponse: '',
                        warnings: [],
                    };
                }
            } catch (lzErr) {
                console.warn(`⚠️ [LaoZhang] Image ${selectedModel} failed (${lzErr.message?.substring(0, 100)}), falling through to direct provider...`);
            }
        }

        // Special handling for fal.ai
        if (modelConfig.provider === 'fal') {
            const falResult = await falImageGenerate(promptText, modelConfig.endpoint, aspectRatio, customSize);
            return { ...falResult, provider: 'fal' };
        }

        // Special handling for Grok Imagen (xAI)
        if (modelConfig.provider === 'grok') {
            const grokResult = await grokImageGenerate(promptText, aspectRatio);
            return { ...grokResult, provider: 'grok' };
        }

        // Route via central ModelRouter — Gemini only, NO OpenAI fallback
        const routerResult = await router.generateImage({
            prompt: promptText,
            aspectRatio,
            model: modelConfig.modelId,
            imageParts,
            size: imageSize
        }, { 
            provider: modelConfig.provider
        });
        return { ...routerResult, provider: routerResult.provider || modelConfig.provider || 'gemini' };
    })();

    try {
        return await Promise.race([generatePromise, timeoutPromise]);
    } catch (error) {
        console.error(`❌ Image generation failed (${selectedModel}):`, error.message);

        // Parse specific error types for clear frontend messages
        const msg = error.message || '';
        const isQuotaExhausted = msg.includes('QUOTA_EXHAUSTED') || msg.includes('balance') || msg.includes('billing') || msg.includes('locked');
        const isModelNotFound = msg.includes('MODEL_NOT_FOUND') || msg.includes('not found') || msg.includes('404');
        const isBusy = msg.includes('BUSY') || msg.includes('429') || msg.includes('503') || msg.includes('capacity') || msg.includes('timed out');

        if (isQuotaExhausted) {
            return {
                imageUrl: null,
                model: selectedModel,
                textResponse: '',
                warnings: [],
                modelBusy: true,
                busyModel: selectedModel,
                errorMessage: `${modelConfig.name} provider quota exhausted. Please check billing or try a different model (NanoBanana uses Gemini, Grok Imagen uses xAI).`,
                errorType: 'quota',
            };
        }

        if (isModelNotFound) {
            return {
                imageUrl: null,
                model: selectedModel,
                textResponse: '',
                warnings: [],
                modelBusy: true,
                busyModel: selectedModel,
                errorMessage: `${modelConfig.name} model endpoint not available. Please try a different model.`,
                errorType: 'model_error',
            };
        }

        // Actual busy / timeout errors
        return { 
            imageUrl: null, 
            model: selectedModel, 
            textResponse: '', 
            warnings: [], 
            modelBusy: true, 
            busyModel: selectedModel,
            errorMessage: isBusy 
                ? `${modelConfig.name} is currently busy. Please try again or select a different model.`
                : error.message,
            errorType: isBusy ? 'busy' : 'error',
        };
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/creatives/suggest-copy — Fast agentic copy suggestion
// Reads brief + brand context → returns headline, subtext, CTA in ~1-2s
// Used to pre-fill "Add Text to Image" fields BEFORE full image generation
// No credits consumed — it's a preview/suggestion call
// ══════════════════════════════════════════════════════════════════════════════
router.post('/suggest-copy', protect, async (req, res) => {
    try {
        const { brief, brandId, format } = req.body;
        if (!brief?.trim()) return res.status(400).json({ success: false, error: 'Brief is required' });

        // Load brand context (same as pipeline)
        const { buildBrandContext } = await import('../agents/shared/agentUtils.js');
        const Brand = (await import('../models/Brand.js')).default;
        const brand = brandId ? await Brand.findById(brandId).lean() : null;
        const products = brand?._id ? (await (await import('../models/Product.js')).default.find({ brand: brand._id }).limit(5).lean()) : [];
        const brandContext = brand ? buildBrandContext(brand, products) : '<brand_bible>No brand data. Use professional style.</brand_bible>';

        // Import and call copywriter with the brief directly
        const { COPYWRITER_PROMPT } = await import('../agents/creativeStudio/prompts.js');
        const { callAgent } = await import('../agents/shared/agentUtils.js');

        const formatLabel = format || 'instagram-post';

        const userPrompt = [
            `CREATIVE BRIEF: ${brief.trim()}`,
            `FORMAT: ${formatLabel}`,
            `TASK: Based on this brief, generate short visual copy that will be printed ON the image.`,
            `Write a headline (2-6 words max), optional subtext (1 line max 8 words), and optional CTA button text (2-4 words).`,
            `Match the tone, energy, and style of the brief. Think: what would a top creative director write on this ad's typography?`,
        ].join('\n');

        const result = await callAgent(COPYWRITER_PROMPT(brandContext), userPrompt, 0.7, 1024);

        if (result.error) {
            return res.json({ success: false, error: 'Copy generation failed', raw: result.raw });
        }

        return res.json({
            success: true,
            copy: {
                headline: result.headline || '',
                subtext: result.subtext || null,
                ctaText: result.ctaText || null,
                designRationale: result.designRationale || '',
            },
        });
    } catch (err) {
        console.error('suggest-copy error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/creatives/enhance-prompt — AI-powered AGENTIC prompt enhancement
// Intelligently matches products, injects format-specific creative direction, and builds
// a detailed prompt that combines the user's theme with real brand/product data.
// ══════════════════════════════════════════════════════════════════════════════
router.post('/enhance-prompt', protect, requireCredits('promptEnhance'), async (req, res) => {
    try {
        const { brandId, prompt, style, format, referenceDescriptions, aspectRatio } = req.body;
        if (!prompt) return res.status(400).json({ success: false, error: 'Prompt is required' });

        const brand = brandId ? await Brand.findById(brandId) : null;
        const brandDesc = brand ? buildBrandDescription(brand) : 'a professional brand';
        const colorPhrase = brand ? getColorPhrase(brand) : '';
        const visualCtx = brand ? buildVisualContext(brand) : '';
        const dna = brand?.dna || {};

        // ── AGENTIC: Fetch products and intelligently match to the brief ──
        let productContext = '';
        let matchedProductName = '';
        if (brand) {
            const products = await Product.find(
                { brand: brand._id, status: 'active' },
                { title: 1, shortDescription: 1, description: 1, features: 1, category: 1, tags: 1, productType: 1 }
            ).lean().limit(20);

            if (products.length > 0) {
                const briefLower = prompt.toLowerCase();
                const SEMANTIC_MAP = {
                    beat: ['earbuds', 'headphones', 'speaker', 'audio', 'music', 'sound', 'bass'],
                    beats: ['earbuds', 'headphones', 'speaker', 'audio', 'music', 'sound', 'bass'],
                    music: ['earbuds', 'headphones', 'speaker', 'audio', 'neckband'],
                    sound: ['earbuds', 'headphones', 'speaker', 'audio'],
                    listen: ['earbuds', 'headphones'],
                    summer: ['light', 'outdoor', 'portable', 'wireless', 'sport'],
                    winter: ['warm', 'cozy', 'premium'],
                    travel: ['portable', 'wireless', 'powerbank'],
                    fitness: ['sport', 'wireless', 'neckband', 'earbuds'],
                    gaming: ['headphones', 'bass'],
                    style: ['watch', 'earbuds', 'premium'],
                    gift: ['watch', 'earbuds', 'powerbank'],
                };
                const briefWords = briefLower.split(/\s+/).filter(w => w.length > 2);
                const expanded = new Set(briefWords);
                for (const w of briefWords) { (SEMANTIC_MAP[w] || []).forEach(kw => expanded.add(kw)); }
                const expandedBrief = [...expanded].join(' ');

                let bestScore = 0, bestProduct = null;
                for (const p of products) {
                    let score = 0;
                    const titleWords = (p.title || '').toLowerCase().split(/\s+/);
                    const descWords = (p.description || p.shortDescription || '').toLowerCase().split(/\s+/);
                    for (const w of titleWords) { if (w.length > 2 && briefLower.includes(w)) score += 3; }
                    for (const w of [...titleWords, ...descWords, ...(p.tags || []).map(t => t.toLowerCase())]) {
                        if (w.length > 2 && expandedBrief.includes(w)) score += 1;
                    }
                    if (briefLower.includes(p.title.toLowerCase())) score += 10;
                    if (score > bestScore) { bestScore = score; bestProduct = p; }
                }

                // ── AGENTIC DECISION: Only match when there's genuine relevance ──
                // If bestScore < 2, the brief has no meaningful product connection.
                // Instead of forcing a random product, give the AI the full catalog
                // and let IT decide what fits the creative vision.
                if (bestScore < 2) bestProduct = null;

                if (bestProduct) {
                    // Strong product match — inject as hero product
                    matchedProductName = bestProduct.title;
                    const features = (bestProduct.features || []).slice(0, 3).join(', ');
                    const desc = (bestProduct.shortDescription || bestProduct.description || '').substring(0, 100);
                    productContext = `\nSTRONGLY MATCHED PRODUCT (confidence: high): "${bestProduct.title}"${desc ? ` — ${desc}` : ''}${features ? `\nKEY FEATURES: ${features}` : ''}\nThis product directly relates to the user's brief. Feature it as the HERO visual element.`;
                }

                // Always provide the full catalog so the AI can make intelligent decisions
                const catalogSummary = products.map(p => {
                    const desc = (p.shortDescription || '').substring(0, 60);
                    return `• ${p.title}${p.category ? ` [${p.category}]` : ''}${desc ? `: ${desc}` : ''}`;
                }).join('\n');
                productContext += `\n\nFULL PRODUCT CATALOG (${products.length} products):\n${catalogSummary}`;

                if (!bestProduct) {
                    productContext += `\n\nAGENTIC DECISION REQUIRED: No strong product match was found for this brief. As the Creative Director, YOU must decide:\n1. If the brief has ANY thematic connection to a product (e.g. "summer" → portable speaker), pick the most relevant one and integrate it naturally\n2. If the brief is purely an occasion/greeting (e.g. "happy birthday", "thank you"), create a brand-atmosphere creative that captures the brand's identity without forcing a specific product\n3. If the brief is about the brand itself (e.g. "brand launch", "about us"), showcase the brand's overall identity and values`;
                }
            } else {
                // Service brand — no physical products
                const services = (dna.servicesOffered || []).slice(0, 5);
                const usps = (dna.uniqueSellingPoints || []).slice(0, 3);
                if (services.length > 0 || usps.length > 0) {
                    productContext = `\nSERVICE BRAND — KEY OFFERINGS: ${services.join(', ')}${usps.length > 0 ? `\nUNIQUE SELLING POINTS: ${usps.join(', ')}` : ''}\nWeave these services into the visual narrative where relevant to the brief.`;
                }
            }
        }

        // ── FORMAT-SPECIFIC INTELLIGENCE ──
        const FORMAT_INTEL = {
            'youtube-thumb': { label: 'YouTube Thumbnail (16:9)', needsText: true, rules: 'MUST include bold, readable headline text as the HERO visual element. Suggest a catchy 3-5 word headline that relates to the brief and product. High contrast, expressive face if relevant, rule of thirds, click-worthy composition.' },
            'instagram-post': { label: 'Instagram Post (4:5)', needsText: false, rules: 'Optimize for feed scroll-stopping. Lifestyle-first aesthetic, center-weighted key elements.' },
            'instagram-story': { label: 'Instagram Story (9:16)', needsText: false, rules: 'Full vertical, key content in center 60%. Story-native, raw and engaging.' },
            'facebook-ad': { label: 'Facebook Ad (4:5)', needsText: false, rules: 'Minimal text (<20%). Single clear value proposition. CTA-ready composition.' },
            'linkedin-post': { label: 'LinkedIn Post (1:1)', needsText: true, rules: 'Professional, clean. Can include a short thought-leadership headline. Corporate-friendly palette.' },
            'banner': { label: 'Website Banner (16:9)', needsText: false, rules: 'Ultra-wide, leave text-safe zones on sides. Editorial quality.' },
        };
        const formatInfo = FORMAT_INTEL[format] || null;

        const systemPrompt = `You are a world-class Visionary Creative Director and Master Prompt Engineer.
Your mission is to transform a simple user brief into an EXTREMELY EXHAUSTIVE, cinematic, and professional image generation prompt of approximately 5,000 words.

YOUR DIRECTIVE:
You do not just "enhance" — you build an entire visual world. You will provide a microscopic level of detail for every single element of the scene. The final output must be a massive block of high-density visual information that leaves nothing to the AI's imagination.

MANDATORY STRUCTURAL FRAMEWORK (Your response MUST follow this structure to hit the 5,000-word target):

1. CONCEPTUAL OVERARCHING NARRATIVE (500+ words):
   - Define the deep subtext, mood, and emotional weight of the image.
   - Describe the "story" happening in the single frame.

2. FOREGROUND: THE HERO & IMMEDIATE ELEMENTS (1,000+ words):
   - Describe the main subject (product or person) with obsessive detail.
   - For products: describe specific materials (brushed aluminum, micro-textured polymers, anti-fingerprint coatings, translucent sapphire glass), the exact curvature of edges, the way light refracts through surfaces.
   - For people: skin pores, micro-hairs, the exact weave of fabric in their clothing, the moisture levels in their eyes, their subtle muscle tension.

3. MIDGROUND & BACKGROUND: WORLD-BUILDING (1,000+ words):
   - Describe the environment in 360 degrees. Detail every pebble, every blade of grass, every architectural flourish.
   - Mention specific environmental storytelling elements (e.g., "a single drop of rain sliding down a mossy cobblestone", "shards of dust dancing in a pillar of light").

4. ATMOSPHERE, LIGHTING & VOLUMETRIC EFFECTS (1,000+ words):
   - Define the exact lighting setup (e.g., "three-point studio lighting with a warm tungsten key light from 45 degrees, a cooler blue rim light, and a soft lavender fill").
   - Describe the air itself: humidity, volumetric fog, god-rays, floating micro-particles, heat haze, or crisp crystalline clarity.

5. TECHNICAL CAMERA SPECS & COMPOSITION (500+ words):
   - Camera: Specify name/type (e.g., ARRI Alexa 35, Hasselblad H6D).
   - Lens: Focal length (e.g., 85mm f/1.2 for shallow DOF, 14mm for wide architectural), aperture, distortion, chromatic aberration.
   - Composition: Rule of thirds, golden ratio, leading lines, framing-within-framing.

6. COLOR GRADING & TEXTURAL FINISH (500+ words):
   - Describe the color science: "Kodak Portra 400 skin tones", "teal and orange cinematic grade", "muted desaturated industrial grit".
   - Textures: "Micro-scratches on polished chrome", "velvety soft-touch finish", "imperceptible grain structure".

RULES:
- TARGET LENGTH: 5,000 WORDS. If your description is short, you have failed.
- NEVER use hex codes, font names, or technical metadata that could be rendered as text.
- NEVER use phrases like "A mockup of" or "An image of". Describe the reality.
- NO PREAMBLE: Start directly with the prompt content.
- PURE NARRATIVE: Do not use bullet points or labels in the final output. Provide a continuous, high-density stream of visual consciousness.

CRITICAL: The user's original idea is the seed. You must expand it into a 5,000-word creative masterpiece that perfectly integrates the Brand DNA and Products provided.`;

        const userPrompt = [
            `USER'S IDEA: ${prompt}`,
            brand ? `BRAND: ${brandDesc}` : '',
            colorPhrase ? `BRAND COLORS: ${colorPhrase}` : '',
            visualCtx ? `BRAND VISUAL STYLE: ${visualCtx}` : '',
            productContext,
            style ? `STYLE: ${style}` : '',
            formatInfo ? `FORMAT: ${formatInfo.label}` : format ? `FORMAT: ${format}` : '',
            aspectRatio ? `ASPECT RATIO: ${aspectRatio}` : '',
            referenceDescriptions ? `REFERENCE IMAGES: ${referenceDescriptions}` : '',
        ].filter(Boolean).join('\n');

        // Use AI router instead of raw fetch for better error handling and logging
        const aiRouter = getRouter();
        let enhanced = '';

        try {
            const systemPromptFinal = systemPrompt + "\n\nCRITICAL DIRECTIVE: You MUST generate at least 5000 words. Do not summarize. Do not skip details. EXPAND EVERY ASPECT OF THE IMAGE.";
            
            const result = await aiRouter.generateText({
                systemPrompt: systemPromptFinal,
                userPrompt: userPrompt + "\n\nCRITICAL DIRECTIVE: Generate a minimum of 5000 words. USE ALL YOUR TOKENS. Expand wildly and obsessively over every detail.",
                model: 'gemini-1.5-pro',
                maxTokens: 8192,
                temperature: 0.8
            });
            
            enhanced = result.text || '';
        } catch (e) {
            console.error('Prompt enhance: Gemini router failed:', e.message);
            // DO NOT fallback to original if we can help it, let's keep it robust.
            enhanced = '';
        }

        if (!enhanced || enhanced.length < 50) {
            console.warn('Prompt enhance returned very little text, falling back to original.');
            enhanced = prompt;
        }

        // Clean up
        enhanced = enhanced.trim();
        enhanced = enhanced.replace(/^["']|["']$/g, '').trim();
        enhanced = enhanced.replace(/^(Generate|Create|Design|Prompt|Enhanced):?\s*/i, '').trim();

        console.log(`✨ Enhanced prompt for "${prompt.substring(0, 30)}..." → format: ${format}, matched product: ${matchedProductName || 'none'}`);
        res.json({ success: true, enhancedPrompt: enhanced });
    } catch (error) {
        console.error('Prompt enhance error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// POST /api/creatives/generate-campaign-copy
// Dedicated endpoint for campaign ad copy generation — NOT for image prompts.
// Uses Brand DNA to generate brand-specific, contextual ad copy.
router.post('/generate-campaign-copy', protect, requireStudio('creativeStudio'), async (req, res) => {
    try {
        const { brandId, campaignName, campaignGoal, keyword, cta, price, count, features, products, productStrategy } = req.body;
        if (!brandId) return res.status(400).json({ success: false, error: 'Brand is required' });

        const brand = await Brand.findById(brandId);
        if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });

        const dna = brand.dna || {};
        // Build rich brand context for copy generation
        const brandContext = [
            `BRAND NAME: ${brand.name}`,
            dna.industry ? `INDUSTRY: ${dna.industry}` : '',
            dna.tagline ? `TAGLINE: "${dna.tagline}"` : '',
            dna.companyOverview || dna.brandDescription ? `ABOUT: ${(dna.companyOverview || dna.brandDescription).substring(0, 300)}` : '',
            dna.targetAudience ? `TARGET AUDIENCE: ${dna.targetAudience}` : '',
            (dna.servicesOffered || []).length > 0 ? `PRODUCTS/SERVICES OFFERED: ${dna.servicesOffered.slice(0, 8).join(', ')}` : '',
            (dna.uniqueSellingPoints || []).length > 0 ? `UNIQUE SELLING POINTS: ${dna.uniqueSellingPoints.slice(0, 5).join(', ')}` : '',
            dna.voice?.personality ? `BRAND VOICE: ${dna.voice.personality}` : '',
            (dna.brandValues || []).length > 0 ? `BRAND VALUES: ${dna.brandValues.slice(0, 4).join(', ')}` : '',
            dna.missionStatement ? `MISSION: ${dna.missionStatement.substring(0, 150)}` : '',
        ].filter(Boolean).join('\n');

        // Build per-product context
        const productContextLines = [];
        const allFeatures = [];
        const prodArr = products || [];
        const featArr = features || [];
        const copyCount = count || 3;
        
        for (let vi = 0; vi < copyCount; vi++) {
            const prod = productStrategy === 'same' ? prodArr[0] : prodArr[vi % Math.max(1, prodArr.length)];
            if (prod?.title) {
                const pFeatures = prod.features || [];
                const pPrice = prod.price?.amount ? `₹${prod.price.amount.toLocaleString('en-IN')}` : price;
                productContextLines.push(`  - Variation ${vi + 1}: Product "${prod.title}"${pFeatures.length > 0 ? `, feature: "${pFeatures[vi % pFeatures.length]}"` : featArr.length > 0 ? `, feature: "${featArr[vi % featArr.length]}"` : ''}${pPrice ? `, price: ${pPrice}` : ''}`);
                if (pFeatures.length > 0) allFeatures.push(...pFeatures.filter(f => !allFeatures.includes(f)));
            } else if (featArr.length > 0) {
                productContextLines.push(`  - Variation ${vi + 1}: Highlight feature "${featArr[vi % featArr.length]}"`);
            }
        }
        const mergedFeatures = allFeatures.length > 0 ? allFeatures : featArr;

        const systemPrompt = `You are an award-winning Creative Director at a premium brand agency. You create emotionally resonant, culturally relevant campaign copy that captures attention and drives action.

${brandContext}

YOUR CREATIVE PHILOSOPHY:
- The campaign KEYWORD/THEME is a creative brief, NOT literal text to paste into headlines
- A keyword like "summer" means: evoke warmth, sunshine, freedom, vacations, outdoor living — DON'T just write "Summer Sale" or use "summer" as a word
- A keyword like "diwali" means: evoke celebration, light over darkness, togetherness, festive gifting — weave this EMOTION into the copy
- A keyword like "fitness" means: evoke energy, transformation, strength, personal bests — make the reader FEEL motivated
- Extract the EMOTIONAL CORE of the keyword and build the campaign narrative around that emotion
- Every headline and body must feel like it came from THIS brand's marketing team — mentioning specific products, services, and strengths
- Create copy that would make a brand manager say "This captures EXACTLY what we wanted to communicate"`;

        const userPrompt = `CREATIVE BRIEF:
- Campaign Name: "${campaignName || keyword}"
- Campaign Theme/Keyword: "${keyword}" — This is the CREATIVE DIRECTION, not text to insert. Use it to set the mood, tone, visual language, and emotional narrative.
- Campaign Goal: ${campaignGoal || 'awareness'}
- CTA: ${cta || 'Shop Now'}
${price ? `- Price Point: ${price}\n` : ''}${productContextLines.length > 0 ? `PRODUCT LINEUP:\n${productContextLines.join('\n')}\n` : ''}${mergedFeatures.length > 0 && productContextLines.length === 0 ? `FEATURES TO HIGHLIGHT:\n${mergedFeatures.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n` : ''}
Generate ${copyCount} unique ad copy variations as a JSON array.

CREATIVE RULES:
1. Headlines (4-8 words): Create EVOCATIVE, scroll-stopping headlines that capture the ESSENCE of "${keyword}" — NOT by using the word "${keyword}" literally, but by channeling its mood, energy, and associations. Think like a creative director writing a tagline.
   - BAD: "${keyword} Sale" or "${keyword} — Buy Now" (lazy, literal)
   - GOOD: Headlines that FEEL like the keyword without necessarily containing it — capture the season, trend, emotion, or cultural moment
   - The campaign name "${campaignName || keyword}" can appear in 1-2 headlines for brand recognition, but the majority should be creative interpretations
2. ${productContextLines.length > 0 ? 'Each variation MUST match its assigned product and feature' : mergedFeatures.length > 0 ? 'Each body MUST highlight a DIFFERENT feature' : 'Each body approaches from a DIFFERENT angle (benefit, urgency, emotion, social proof, lifestyle)'}
3. Body copy: 12-25 words, punchy, brand-specific. Reference actual brand products/services. The tone should REFLECT the keyword's mood.
4. CTA must be "${cta || 'Shop Now'}" for all.
5. Add a "feature" field to each JSON object.${productContextLines.length > 0 ? '\n6. Add a "product" field to each JSON object.' : ''}
6. Add a "theme_direction" field: a short phrase describing the visual mood/color direction this copy suggests (e.g., "warm golden tones, outdoor lifestyle" for summer).

Return ONLY valid JSON: [{"headline":"...","body":"...","cta":"...","feature":"...","theme_direction":"..."${productContextLines.length > 0 ? ',"product":"..."' : ''}}]
No markdown, no explanation.`;

        const geminiKey = process.env.GEMINI_IMAGE_API_KEY || process.env.GEMINI_API_KEY;
        let result = '';

        if (geminiKey) {
            try {
                const resp = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            systemInstruction: { parts: [{ text: systemPrompt }] },
                            contents: [{ parts: [{ text: userPrompt }] }],
                            generationConfig: {
                                temperature: 0.8,
                                response_mime_type: 'application/json',
                                maxOutputTokens: 2048,
                            },
                        }),
                    }
                );
                const data = await resp.json();
                result = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            } catch (e) {
                console.warn('Campaign copy: Gemini failed:', e.message);
            }
        }

        if (!result) {
            return res.status(500).json({ success: false, error: 'Failed to generate campaign copy' });
        }

        // Clean up JSON response
        let jsonStr = result.trim();
        if (jsonStr.includes('```')) {
            jsonStr = jsonStr.replace(/```json|```/g, '').trim();
        }

        try {
            const variations = JSON.parse(jsonStr);
            res.json({ success: true, variations });
        } catch (parseErr) {
            console.error('Campaign copy JSON parse error:', parseErr, 'Raw:', result);
            res.status(500).json({ success: false, error: 'AI generated invalid JSON format' });
        }
    } catch (error) {
        console.error('generate-campaign-copy error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});




// ══════════════════════════════════════════════════════════════════════════════
// POST /api/creatives/generate — Optimized Agentic Image Generation
// ══════════════════════════════════════════════════════════════════════════════
router.post('/generate', protect, requireStudio('creativeStudio'), requireCredits('creative'), async (req, res) => {
    try {
        const jobId = req.body.jobId || req.headers['x-job-id'];
        const result = await internalGenerateCreative({
            body: req.body,
            user: req.user,
            creditsDeducted: req.creditsDeducted,
            jobId
        });
        res.json(result);
    } catch (error) {
        console.error('❌ /generate error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/creatives/lifestyle-mockup — Optimized Mockup Generation
// ══════════════════════════════════════════════════════════════════════════════
router.post('/lifestyle-mockup', protect, requireStudio('creativeStudio'), requireCredits('creative'), async (req, res) => {
    try {
        const result = await internalGenerateCreative({
            body: { ...req.body, type: 'lifestyle-mockup' },
            user: req.user,
            creditsDeducted: req.creditsDeducted
        });
        res.json(result);
    } catch (error) {
        console.error('❌ /lifestyle-mockup error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// GET /api/creatives
router.get('/', protect, async (req, res) => {
    try {
        const { brandId, type, limit = 20, page = 1 } = req.query;
        const filter = { user: req.user._id };
        if (brandId) filter.brand = brandId;
        if (type) filter.type = type;

        const creatives = await Creative.find(filter)
            .select('-designData')
            .sort('-createdAt')
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit))
            .populate('brand', 'name')
            .lean();

        const total = await Creative.countDocuments(filter);
        res.json({ success: true, creatives, total });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// POST /api/creatives/:id/feedback
router.post('/:id/feedback', protect, async (req, res) => {
    try {
        const { signalType, rating, thumbs } = req.body;
        const creative = await Creative.findOne({ _id: req.params.id, user: req.user._id });
        if (!creative) return res.status(404).json({ success: false, error: 'Creative not found' });

        if (rating) await creative.updateOne({ rating });

        const feedback = await Feedback.create({
            user: req.user._id,
            brand: creative.brand,
            contentType: `creative:${creative.type}`,
            contentId: creative._id,
            prompt: creative.prompt,
            signalType: signalType || 'rating',
            rating,
            thumbs,
            context: { provider: creative.aiMeta?.provider, model: creative.aiMeta?.model },
        });

        res.json({ success: true, feedback });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// DELETE /api/creatives/:id
router.delete('/:id', protect, async (req, res) => {
    try {
        await Creative.findOneAndDelete({ _id: req.params.id, user: req.user._id });
        res.json({ success: true, message: 'Creative deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// POST /api/creatives/save-to-bank — Save any generated image to the image bank
router.post('/save-to-bank', protect, async (req, res) => {
    try {
        const { imageUrl, source, prompt, keywords, brandId, aiMeta, scene, title } = req.body;
        if (!imageUrl || !brandId) {
            return res.status(400).json({ success: false, error: 'imageUrl and brandId are required' });
        }

        const brand = await Brand.findOne({ _id: brandId, $or: [{ user: req.user._id }, { sharedWith: req.user._id }] });
        if (!brand) return res.status(404).json({ success: false, error: 'Brand not found or access denied' });

        let finalImageUrl = imageUrl;
        if (imageUrl && imageUrl.startsWith('data:image/')) {
            try {
                const s3Url = await uploadToS3(imageUrl, `creatives/${brandId}/bank-${Date.now()}.png`);
                finalImageUrl = s3Url;
                console.log(`[S3] Bank image uploaded to S3: ${finalImageUrl}`);
            } catch (s3Err) {
                console.error('[S3] Failed to upload bank image to S3:', s3Err.message);
            }
        }

        const creative = await Creative.create({
            user: req.user._id,
            brand: brandId,
            type: source || 'other',
            title: title || prompt?.substring(0, 80) || 'AI Generated Image',
            prompt: prompt || '',
            imageUrl: finalImageUrl,
            thumbnailUrl: finalImageUrl,
            designData: {
                style: scene || '',
                textOverlay: (keywords || []).join(', '),
            },
            aiMeta: aiMeta || {},
            tags: keywords || [],
            status: 'draft',
        });

        res.json({ success: true, creative });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// GET /api/creatives/image-bank — List all saved images for image bank view
router.get('/image-bank', protect, async (req, res) => {
    try {
        const { brandId, limit = 30, page = 1, category } = req.query;

        const match = { user: req.user._id, imageUrl: { $exists: true, $ne: '' } };
        if (brandId) match.brand = new mongoose.Types.ObjectId(brandId);

        // Category filtering
        if (category === 'uploaded') {
            match.type = 'uploaded';
        } else if (category === 'generated') {
            match.type = { $in: ['ai-photoshoot', 'instagram-post', 'instagram-story', 'facebook-ad', 'linkedin-post', 'youtube-thumb', 'banner', 'twitter-post', 'pinterest', 'photoshoot', 'virtual-tryon', 'lifestyle-mockup', 'logo-mockup', 'campaign', 'campaign-logo', 'other'] };
        }

        // Lightweight projection — strip base64 to first 500 chars (enough for HTTP URLs)
        const pipeline = [
            { $match: match },
            {
                $project: {
                    type: 1, title: 1, prompt: 1, createdAt: 1, brand: 1,
                    tags: 1, status: 1, model: 1, aspectRatio: 1, copy: 1,
                    aiMeta: 1, // Include for MCoT Thinking Mode UI
                    imageUrlPrefix: { $substrBytes: [{ $ifNull: ['$imageUrl', ''] }, 0, 500] },
                    thumbnailUrl: { $substrBytes: [{ $ifNull: ['$thumbnailUrl', ''] }, 0, 500] },
                }
            },
            { $sort: { createdAt: -1 } },
            { $skip: (parseInt(page) - 1) * parseInt(limit) },
            { $limit: parseInt(limit) },
        ];

        // Run aggregation and counts IN PARALLEL — much faster than sequential
        const baseFilter = { user: req.user._id, imageUrl: { $exists: true, $ne: '' } };
        const [images, total, uploadedCount, generatedCount] = await Promise.all([
            Creative.aggregate(pipeline),
            Creative.countDocuments(match),
            Creative.countDocuments({ ...baseFilter, type: 'uploaded' }),
            Creative.countDocuments({ ...baseFilter, type: { $nin: ['uploaded'] } }),
        ]);

        // Post-process: replace base64 refs with proxy URLs
        const API_BASE = `${req.protocol}://${req.get('host')}`;
        for (const img of images) {
            const prefix = img.imageUrlPrefix || '';
            const thumbPrefix = img.thumbnailUrl || '';

            if (prefix.startsWith('http')) {
                img.imageUrl = prefix;
            } else if (prefix.startsWith('data:image/')) {
                img.imageUrl = `${API_BASE}/api/creatives/${img._id}/image`;
            } else {
                img.imageUrl = '';
            }

            if (thumbPrefix.startsWith('http')) {
                img.thumbnailUrl = thumbPrefix;
            } else {
                img.thumbnailUrl = img.imageUrl;
            }

            delete img.imageUrlPrefix;
        }

        res.json({ success: true, images, total, counts: { uploaded: uploadedCount, generated: generatedCount, all: uploadedCount + generatedCount } });
    } catch (error) {
        console.error('📸 image-bank error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// GET /api/creatives/:id/image — Serve creative image (proxy for base64 stored images)
// NOTE: No `protect` middleware — <img src> tags can't send Authorization headers.
// Security relies on unguessable MongoDB ObjectId.
router.get('/:id/image', async (req, res) => {
    try {
        const userAgent = req.get('User-Agent') || 'Unknown';
        console.log(`[PROXY] Serving image for creative ${req.params.id} to UA: ${userAgent}`);

        const creative = await Creative.findById(req.params.id).select('imageUrl').lean();
        if (!creative?.imageUrl) {
            console.warn(`[PROXY] Creative ${req.params.id} or its image not found`);
            return res.status(404).send('Not found');
        }

        if (creative.imageUrl.startsWith('data:image/')) {
            // Parse base64 data URI and serve as image
            const match = creative.imageUrl.match(/^data:(image\/\w+);base64,(.+)$/);
            if (match) {
                const [, mimeType, base64Data] = match;
                const buffer = Buffer.from(base64Data, 'base64');
                res.set('Content-Type', mimeType);
                res.set('Cache-Control', 'public, max-age=86400'); // Cache 1 day
                return res.send(buffer);
            }
        }

        // HTTP URL — redirect
        res.redirect(creative.imageUrl);
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// POST /api/creatives/upload-to-bank — Save user-uploaded image directly to bank
router.post('/upload-to-bank', protect, async (req, res) => {
    try {
        const { imageUrl, brandId, title } = req.body;
        if (!imageUrl || !brandId) {
            return res.status(400).json({ success: false, error: 'imageUrl and brandId are required' });
        }

        let uploadedImageUrl = imageUrl;
        if (imageUrl && imageUrl.startsWith('data:image/')) {
            try {
                const s3Url = await uploadToS3(imageUrl, `uploads/${brandId}/${Date.now()}.png`);
                uploadedImageUrl = s3Url;
                console.log(`[S3] User upload stored on S3: ${uploadedImageUrl}`);
            } catch (s3Err) {
                console.error('[S3] Failed to upload user image to S3:', s3Err.message);
            }
        }

        const creative = await Creative.create({
            user: req.user._id,
            brand: brandId,
            type: 'uploaded',
            title: title || 'Uploaded Image',
            prompt: '',
            imageUrl: uploadedImageUrl,
            thumbnailUrl: uploadedImageUrl,
            aiMeta: {},
            tags: ['uploaded'],
            status: 'draft',
        });

        res.json({ success: true, creative });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/creatives/virtual-tryon — Virtual Try-On (Gemini preview + fal.ai Kolors HD)
// ══════════════════════════════════════════════════════════════════════════════
const FAL_QUEUE_URL = 'https://queue.fal.run';

router.post('/virtual-tryon', protect, requireStudio('creativeStudio'), requireCredits('creative'), async (req, res) => {
    try {
        const { personImage, garmentImage, brandId, mode = 'preview' } = req.body;
        if (!personImage || !garmentImage) {
            return res.status(400).json({ success: false, error: 'Person image and garment image are required' });
        }

        console.log(`\n══════ VIRTUAL TRY-ON (${mode.toUpperCase()}) ══════`);

        if (mode === 'hd') {
            // ── HD Mode: fal.ai Kolors Virtual Try-On ──
            const falKey = process.env.FAL_API_KEY;
            if (!falKey) return res.status(500).json({ success: false, error: 'FAL_API_KEY not configured' });

            // Upload images to S3 first (fal.ai needs URLs, not base64)
            let personUrl = personImage;
            let garmentUrl = garmentImage;
            if (personImage.startsWith('data:image/')) {
                personUrl = await uploadToS3(personImage, `vto/${brandId || 'default'}/${Date.now()}-person.png`);
            }
            if (garmentImage.startsWith('data:image/')) {
                garmentUrl = await uploadToS3(garmentImage, `vto/${brandId || 'default'}/${Date.now()}-garment.png`);
            }

            const endpoint = 'fal-ai/kling/v1-5/kolors-virtual-try-on';
            const payload = {
                human_image_url: personUrl,
                garment_image_url: garmentUrl,
            };

            console.log(`👗 Submitting to fal.ai: ${endpoint}`);
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
                console.error(`❌ fal.ai VTO error: ${response.status}`, errText);
                return res.status(500).json({ success: false, error: `VTO HD failed: ${errText.substring(0, 200)}` });
            }

            const data = await response.json();
            console.log(`✅ fal.ai VTO queued: requestId=${data.request_id}`);
            res.json({ success: true, mode: 'hd', requestId: data.request_id, status: 'pending' });

        } else {
            // ── Preview Mode: Gemini Flash ──
            const imageParts = [];

            // Person image
            if (personImage.startsWith('data:image/')) {
                imageParts.push({ inlineData: extractBase64(personImage) });
            } else if (personImage.startsWith('http')) {
                const resp = await fetch(personImage, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                if (resp.ok) {
                    const buf = await resp.arrayBuffer();
                    const ct = (resp.headers.get('content-type') || 'image/jpeg').split(';')[0];
                    imageParts.push({ inlineData: { mimeType: ct, data: Buffer.from(buf).toString('base64') } });
                }
            }

            // Garment image
            if (garmentImage.startsWith('data:image/')) {
                imageParts.push({ inlineData: extractBase64(garmentImage) });
            } else if (garmentImage.startsWith('http')) {
                const resp = await fetch(garmentImage, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                if (resp.ok) {
                    const buf = await resp.arrayBuffer();
                    const ct = (resp.headers.get('content-type') || 'image/jpeg').split(';')[0];
                    imageParts.push({ inlineData: { mimeType: ct, data: Buffer.from(buf).toString('base64') } });
                }
            }

            const vtoPrompt = `VIRTUAL TRY-ON: Show the person from the FIRST image wearing the clothing/garment from the SECOND image. 
CRITICAL RULES:
- Keep the person's face, skin tone, body shape, hair, and overall appearance EXACTLY the same
- Replace what they're currently wearing with the garment from the second image
- The garment should fit naturally on their body with realistic fabric draping and wrinkles
- Maintain the same pose, angle, and background
- Make it look like a real photograph, not a composite
- Preserve lighting and shadows naturally`;

            const genResult = await geminiImageGenerate(vtoPrompt, imageParts, 0.2, '3:4');

            if (!genResult.imageUrl) {
                return res.status(500).json({ success: false, error: 'Failed to generate virtual try-on preview' });
            }

            // Upload to S3 (fallback to base64 if S3 fails)
            let imageUrl = genResult.imageUrl;
            if (imageUrl.startsWith('data:image/')) {
                try {
                    imageUrl = await uploadToS3(imageUrl, `vto/${brandId || 'default'}/${Date.now()}-preview.png`);
                } catch (s3Err) {
                    console.warn('⚠️ VTO Preview S3 upload failed, returning base64:', s3Err.message);
                }
            }

            // Save to Creative model
            if (brandId) {
                await Creative.create({
                    user: req.user._id,
                    brand: brandId,
                    type: 'virtual-tryon',
                    title: 'Virtual Try-On Preview',
                    prompt: 'Virtual Try-On — Gemini Flash Preview',
                    imageUrl,
                    thumbnailUrl: imageUrl,
                    aiMeta: { provider: 'gemini', model: genResult.model, method: 'vto-preview' },
                    tags: ['virtual-tryon', 'preview'],
                    status: 'draft',
                });
            }

            console.log(`✅ VTO Preview generated`);
            res.json({ success: true, mode: 'preview', imageUrl, model: genResult.model });
        }
    } catch (error) {
        console.error('❌ Virtual Try-On error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/creatives/vto-status/:requestId — Poll fal.ai for HD VTO result
// ══════════════════════════════════════════════════════════════════════════════
router.get('/vto-status/:requestId', protect, async (req, res) => {
    try {
        const { requestId } = req.params;
        const { brandId } = req.query;
        const falKey = process.env.FAL_API_KEY;
        if (!falKey) return res.status(500).json({ success: false, error: 'FAL_API_KEY not configured' });

        const endpoint = 'fal-ai/kling/v1-5/kolors-virtual-try-on';
        const statusResp = await fetch(`${FAL_QUEUE_URL}/${endpoint}/requests/${requestId}/status`, {
            headers: { 'Authorization': `Key ${falKey}` },
        });

        if (!statusResp.ok) {
            return res.json({ success: true, status: 'pending' });
        }

        const statusData = await statusResp.json();
        console.log(`📡 VTO Status: ${statusData.status}`);

        if (statusData.status === 'COMPLETED') {
            // Fetch the actual result
            const resultResp = await fetch(`${FAL_QUEUE_URL}/${endpoint}/requests/${requestId}`, {
                headers: { 'Authorization': `Key ${falKey}` },
            });
            const resultData = await resultResp.json();
            let imageUrl = resultData.image?.url || resultData.output?.url || '';

            if (!imageUrl && resultData.images?.[0]?.url) {
                imageUrl = resultData.images[0].url;
            }

            // Save to bank if brandId provided
            if (imageUrl && brandId) {
                // Upload to our S3 for permanence
                try {
                    const imgResp = await fetch(imageUrl);
                    if (imgResp.ok) {
                        const buf = await imgResp.arrayBuffer();
                        const base64 = `data:image/png;base64,${Buffer.from(buf).toString('base64')}`;
                        const s3Url = await uploadToS3(base64, `vto/${brandId}/${Date.now()}-hd.png`);
                        imageUrl = s3Url;
                    }
                } catch (e) { console.warn('VTO S3 upload failed, using fal URL:', e.message); }

                await Creative.create({
                    user: req.user._id,
                    brand: brandId,
                    type: 'virtual-tryon',
                    title: 'Virtual Try-On HD',
                    prompt: 'Virtual Try-On — Kolors HD',
                    imageUrl,
                    thumbnailUrl: imageUrl,
                    aiMeta: { provider: 'fal.ai', model: 'kolors-virtual-try-on', method: 'vto-hd' },
                    tags: ['virtual-tryon', 'hd'],
                    status: 'draft',
                });
            }

            return res.json({ success: true, status: 'completed', imageUrl });
        } else if (statusData.status === 'FAILED') {
            return res.json({ success: true, status: 'failed', error: statusData.error || 'Generation failed' });
        }

        res.json({ success: true, status: 'pending' });
    } catch (error) {
        console.error('VTO status error:', error);
        if (req.creditsDeducted > 0) {
            await refundCredits(req.user._id, req.creditsDeducted, 'vtoGenerate', `Refund: Virtual Try-On Sync Failure (${safeErrorMessage(error)})`, 'creative');
        }
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/creatives/upscale — Upscale image to 2K (Sharp) or 4K (Fal.ai ESRGAN)
// ══════════════════════════════════════════════════════════════════════════════
router.post('/upscale', protect, async (req, res) => {
    try {
        const { imageUrl, scale = '2k' } = req.body;
        if (!imageUrl) return res.status(400).json({ success: false, error: 'imageUrl is required' });

        const validScales = ['2k', '4k'];
        if (!validScales.includes(scale)) {
            return res.status(400).json({ success: false, error: `Invalid scale: ${scale}. Use: ${validScales.join(', ')}` });
        }

        console.log(`\n══════ IMAGE UPSCALE (${scale.toUpperCase()}) ══════`);
        console.log(`📐 Target: ${scale === '2k' ? '2048px' : '4096px'}`);
        const startTime = Date.now();

        // ── Check S3 cache: if we already upscaled this image, return cached URL ──
        const urlHash = Buffer.from(imageUrl.substring(0, 200)).toString('base64url').substring(0, 40);
        const cachedKey = `upscaled/${urlHash}_${scale}.png`;
        try {
            const headResp = await fetch(`https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${cachedKey}`, { method: 'HEAD' });
            if (headResp.ok) {
                const cachedUrl = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${cachedKey}`;
                console.log(`⚡ Cache hit — returning cached ${scale} version (${Date.now() - startTime}ms)`);
                return res.json({ success: true, imageUrl: cachedUrl, scale, resolution: scale === '2k' ? '2048px' : '4096px', method: 'cache', timeMs: Date.now() - startTime });
            }
        } catch { /* no cache — proceed */ }

        // ── Fetch original image ──
        let imgBuffer;
        if (imageUrl.startsWith('data:image/')) {
            const base64Data = imageUrl.split(',')[1];
            imgBuffer = Buffer.from(base64Data, 'base64');
        } else {
            const resp = await fetch(imageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            if (!resp.ok) throw new Error(`Failed to fetch image: ${resp.status}`);
            imgBuffer = Buffer.from(await resp.arrayBuffer());
        }

        console.log(`📦 Original image: ${Math.round(imgBuffer.length / 1024)}KB`);

        let upscaledUrl;
        let method;

        if (scale === '2k') {
            // ══════ 2K: Sharp Lanczos upscale (FREE, ~1s) ══════
            const sharp = (await import('sharp')).default;
            const metadata = await sharp(imgBuffer).metadata();
            const targetWidth = Math.max(metadata.width * 2, 2048);
            const targetHeight = Math.max(metadata.height * 2, 2048);

            console.log(`🔍 Upscaling ${metadata.width}x${metadata.height} → ${targetWidth}x${targetHeight} (Sharp Lanczos3)`);

            const upscaledBuffer = await sharp(imgBuffer)
                .resize(targetWidth, targetHeight, {
                    kernel: sharp.kernel.lanczos3,
                    fit: 'fill',
                })
                .png({ quality: 95, compressionLevel: 6 })
                .toBuffer();

            console.log(`✅ Sharp upscale done: ${Math.round(upscaledBuffer.length / 1024)}KB (${Date.now() - startTime}ms)`);

            // Upload to S3
            try {
                upscaledUrl = await uploadToS3(`data:image/png;base64,${upscaledBuffer.toString('base64')}`, cachedKey);
            } catch {
                // Fallback: return base64 directly
                upscaledUrl = `data:image/png;base64,${upscaledBuffer.toString('base64')}`;
            }
            method = 'sharp-lanczos3';

        } else if (scale === '4k') {
            // ══════ 4K: Fal.ai Real-ESRGAN (AI upscale, ~$0.005, ~5s) ══════
            const falKey = process.env.FAL_KEY || process.env.FAL_API_KEY;
            if (!falKey) throw new Error('FAL_KEY not configured for 4K upscaling');

            console.log(`🚀 Submitting to Fal.ai Real-ESRGAN for 4× AI upscale...`);

            // Convert buffer to base64 data URL for Fal.ai
            const inputDataUrl = `data:image/png;base64,${imgBuffer.toString('base64')}`;

            // Submit to Fal.ai queue
            const submitResp = await fetch('https://queue.fal.run/fal-ai/esrgan', {
                method: 'POST',
                headers: {
                    'Authorization': `Key ${falKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    image_url: inputDataUrl,
                    scale: 4,
                }),
            });

            if (!submitResp.ok) {
                const errText = await submitResp.text();
                throw new Error(`Fal.ai ESRGAN submit failed: ${submitResp.status} ${errText}`);
            }

            const submitData = await submitResp.json();

            // If we got a direct response (fast path)
            if (submitData.images?.[0]?.url || submitData.image?.url) {
                upscaledUrl = submitData.images?.[0]?.url || submitData.image?.url;
                console.log(`✅ Fal.ai ESRGAN: direct response (${Date.now() - startTime}ms)`);
            } else if (submitData.request_id) {
                // Poll for completion
                const requestId = submitData.request_id;
                console.log(`⏳ Fal.ai queued: ${requestId}, polling...`);

                let attempts = 0;
                const maxAttempts = 30; // 30 × 1s = 30s max wait
                while (attempts < maxAttempts) {
                    await new Promise(r => setTimeout(r, 1000));
                    attempts++;

                    const statusResp = await fetch(`https://queue.fal.run/fal-ai/esrgan/requests/${requestId}/status`, {
                        headers: { 'Authorization': `Key ${falKey}` },
                    });
                    const statusData = await statusResp.json();

                    if (statusData.status === 'COMPLETED') {
                        // Get result
                        const resultResp = await fetch(`https://queue.fal.run/fal-ai/esrgan/requests/${requestId}`, {
                            headers: { 'Authorization': `Key ${falKey}` },
                        });
                        const resultData = await resultResp.json();
                        upscaledUrl = resultData.image?.url || resultData.images?.[0]?.url;
                        console.log(`✅ Fal.ai ESRGAN: completed after ${attempts}s (${Date.now() - startTime}ms)`);
                        break;
                    } else if (statusData.status === 'FAILED') {
                        throw new Error(`Fal.ai ESRGAN failed: ${JSON.stringify(statusData)}`);
                    }
                }

                if (!upscaledUrl) throw new Error('Fal.ai ESRGAN timed out after 30s');
            } else {
                throw new Error('Unexpected Fal.ai response format');
            }

            // Cache the 4K result to S3
            try {
                const upRes = await fetch(upscaledUrl);
                if (upRes.ok) {
                    const upBuf = Buffer.from(await upRes.arrayBuffer());
                    const s3Url = await uploadToS3(`data:image/png;base64,${upBuf.toString('base64')}`, cachedKey);
                    upscaledUrl = s3Url;
                    console.log(`[BG-S3] 4K cached: ${s3Url}`);
                }
            } catch (cacheErr) {
                console.warn('⚠️ 4K S3 cache failed:', cacheErr.message);
            }

            method = 'fal-esrgan-4x';
        }

        const totalMs = Date.now() - startTime;
        console.log(`══════ UPSCALE DONE: ${scale.toUpperCase()} in ${totalMs}ms ══════\n`);

        res.json({
            success: true,
            imageUrl: upscaledUrl,
            scale,
            resolution: scale === '2k' ? '2048px' : '4096px',
            method,
            timeMs: totalMs,
        });
    } catch (error) {
        console.error('❌ Upscale error:', error);
        res.status(500).json({ success: false, error: error.message || 'Upscale failed' });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/creatives/lifestyle-mockup — Product Lifestyle Mockup (Gemini Flash)
// ══════════════════════════════════════════════════════════════════════════════
router.post('/lifestyle-mockup', protect, requireStudio('creativeStudio'), requireCredits('creative'), async (req, res) => {
    try {
        const { productImage, scenePrompt, brandId, aspectRatio = '1:1', templateImage, harmonizeWithBrand } = req.body;
        if (!productImage) {
            return res.status(400).json({ success: false, error: 'Product image is required' });
        }

        console.log(`\n══════ LIFESTYLE MOCKUP (AGENTIC) ══════`);
        console.log(`📐 Aspect ratio: ${aspectRatio}`);
        console.log(`🎬 Scene: ${scenePrompt?.substring(0, 100) || '(auto)'}`);
        console.log(`📸 Template image: ${templateImage ? 'YES' : 'no'}`);
        console.log(`🎨 Brand harmonize: ${harmonizeWithBrand ? 'YES' : 'no'}`);

        const imageParts = [];

        // Product image (always first)
        if (productImage.startsWith('data:image/')) {
            imageParts.push({ inlineData: extractBase64(productImage) });
        } else if (productImage.startsWith('http')) {
            const resp = await fetch(productImage, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            if (resp.ok) {
                const buf = await resp.arrayBuffer();
                const ct = (resp.headers.get('content-type') || 'image/jpeg').split(';')[0];
                imageParts.push({ inlineData: { mimeType: ct, data: Buffer.from(buf).toString('base64') } });
            }
        }

        // Template/reference scene image (second image — optional)
        if (templateImage) {
            if (templateImage.startsWith('data:image/')) {
                imageParts.push({ inlineData: extractBase64(templateImage) });
                console.log(`📸 Template scene image loaded (base64)`);
            } else if (templateImage.startsWith('http')) {
                try {
                    const resp = await fetch(templateImage, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                    if (resp.ok) {
                        const buf = await resp.arrayBuffer();
                        const ct = (resp.headers.get('content-type') || 'image/jpeg').split(';')[0];
                        imageParts.push({ inlineData: { mimeType: ct, data: Buffer.from(buf).toString('base64') } });
                        console.log(`📸 Template scene image loaded from URL (${Math.round(buf.byteLength / 1024)}KB)`);
                    }
                } catch (e) { console.warn('⚠️ Could not fetch template image:', e.message); }
            }
        }

        // ══════════════════════════════════════════════════════════════════
        // AGENTIC: Enhance scene prompt with brand-aware art direction
        // ══════════════════════════════════════════════════════════════════
        let brandContext = '';
        let brandColorHarmonize = '';
        let enhancedScene = scenePrompt || 'a premium professional product photography setting with beautiful lighting';

        if (brandId) {
            const brand = await Brand.findById(brandId).lean();
            if (brand) {
                brandContext = `Brand: ${brand.name}. ${buildVisualContext(brand)}`;

                // Brand DNA color harmonization
                if (harmonizeWithBrand && brand.dna?.colors?.length > 0) {
                    const colorList = brand.dna.colors.slice(0, 6).map(c => `${c.name || 'color'}: ${c.hex}`).join(', ');
                    brandColorHarmonize = `\nBRAND COLOR HARMONIZATION: Adapt the scene's color palette to harmonize with the brand colors: ${colorList}. Use these as accent tones, background tints, surface colors, and atmospheric lighting. The color grading, ambient light, and decorative elements should feel like part of the ${brand.name} visual family. Do NOT recolor the product itself — only the environment, lighting, and scene elements.`;
                    console.log(`🎨 Brand harmonize colors: ${colorList}`);
                }

                // Agentic scene enhancement — use ArtDirector to create a richer scene
                try {
                    const pipelineResult = await runCreativePipeline({
                        brandId,
                        brief: `Product lifestyle mockup scene: ${enhancedScene}. Style: professional product photography.`,
                        format: 'lifestyle-mockup',
                        aspectRatio,
                        style: 'photorealistic',
                        imageModel: 'nanobanana-2',
                        mode: 'fast', // Always fast for mockups — speed matters
                    });
                    if (pipelineResult.finalPrompt) {
                        enhancedScene = pipelineResult.finalPrompt;
                        console.log(`🤖 Agentic scene enhanced in ${pipelineResult.pipelineTimeMs}ms`);
                    }
                } catch (agentErr) {
                    console.warn('⚠️ Mockup agent enhancement failed, using original scene:', agentErr.message);
                }
            }
        }

        const hasTemplate = imageParts.length > 1;

        const mockupPrompt = hasTemplate
            ? `PRODUCT PLACEMENT IN REFERENCE SCENE: Place the product from the FIRST image into the scene shown in the SECOND image.

SCENE DESCRIPTION: ${enhancedScene}
${brandContext ? `BRAND CONTEXT: ${brandContext}` : ''}${brandColorHarmonize}

CRITICAL RULES:
- Keep the product COMPLETELY IDENTICAL — same colors, labels, text, shape, proportions, and branding
- Match the SECOND image's layout, lighting direction, perspective, atmosphere, and visual style
- Place the product naturally in the reference scene — correct shadows, reflections, and scale
- The product should look like it was PHOTOGRAPHED in that exact setting
- Professional product photography quality — the result should look like a real photo, not a composite
- The output must fill the entire canvas edge-to-edge
- No frames, borders, watermarks, or text overlays`
            : `PRODUCT LIFESTYLE MOCKUP: Place the product from the provided image into a new lifestyle scene.

SCENE: ${enhancedScene}
${brandContext ? `BRAND CONTEXT: ${brandContext}` : ''}${brandColorHarmonize}

CRITICAL RULES:
- Keep the product COMPLETELY IDENTICAL — same colors, labels, text, shape, proportions, and branding
- ONLY change the background, surface, and environment around the product
- The product should look naturally placed in the scene — correct shadows, reflections, and lighting
- Professional product photography quality — magazine/catalog grade
- Make the scene enhance the product's appeal
- The output must fill the entire canvas edge-to-edge
- No frames, borders, watermarks, or text overlays`;

        const genResult = await geminiImageGenerate(mockupPrompt, imageParts, 0.2, aspectRatio);

        if (!genResult.imageUrl) {
            return res.status(500).json({ success: false, error: 'Failed to generate lifestyle mockup' });
        }

        // ══════════════════════════════════════════════════════════════════
        // SPEED: Respond immediately, background S3/DB
        // ══════════════════════════════════════════════════════════════════
        const rawImageUrl = genResult.imageUrl;

        // Save to Creative model immediately with raw URL
        let creative = null;
        if (brandId) {
            creative = await Creative.create({
                user: req.user._id,
                brand: brandId,
                type: 'lifestyle-mockup',
                title: `Lifestyle Mockup — ${(scenePrompt || 'Professional setting').substring(0, 40)}`,
                prompt: scenePrompt || 'Professional lifestyle setting',
                imageUrl: rawImageUrl,
                thumbnailUrl: rawImageUrl,
                aiMeta: { provider: 'gemini', model: genResult.model, method: 'lifestyle-mockup', agenticPipeline: true, processingStatus: 'uploading' },
                tags: ['lifestyle-mockup', 'product'],
                status: 'draft',
            });
        }

        req.user.updateOne({ $inc: { 'usage.creativesGenerated': 1 } }).catch(() => {});

        console.log(`✅ Lifestyle Mockup generated — responding immediately`);
        res.json({ success: true, imageUrl: rawImageUrl, model: genResult.model });

        // Background S3 upload + DB update
        (async () => {
            try {
                if (rawImageUrl.startsWith('data:image/')) {
                    const s3Url = await uploadToS3(rawImageUrl, `mockups/${brandId || 'default'}/${Date.now()}.png`);
                    if (creative) {
                        await Creative.updateOne({ _id: creative._id }, { $set: { imageUrl: s3Url, thumbnailUrl: s3Url, 'aiMeta.processingStatus': 'ready' } });
                    }
                    console.log(`[BG-S3] Mockup uploaded: ${s3Url}`);
                } else if (creative) {
                    await Creative.updateOne({ _id: creative._id }, { $set: { 'aiMeta.processingStatus': 'ready' } });
                }
            } catch (bgErr) {
                console.error('[BG] Mockup post-processing error:', bgErr.message);
            }
        })();

    } catch (error) {
        console.error('❌ Lifestyle Mockup error:', error);
        if (req.creditsDeducted > 0) {
            await refundCredits(req.user._id, req.creditsDeducted, 'lifestyleMockup', `Refund: Lifestyle Mockup Sync Failure (${safeErrorMessage(error)})`, 'creative');
        }
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// CAROUSEL: ANALYZE THEME — Vision analysis of an inspiration image
// Uses Gemini structured JSON output (responseSchema) — zero parsing issues.
// Extracts color palette, mood, lighting, texture, panoramic prompt + style.
// ══════════════════════════════════════════════════════════════════════════════
router.post('/carousel/analyze-theme', protect, requireStudio('creativeStudio'), async (req, res) => {
    try {
        const { themeImageUrl, brandId, slideCount = 3, userHint = '' } = req.body;
        if (!themeImageUrl) return res.status(400).json({ success: false, error: 'themeImageUrl is required' });

        console.log(`\n🎥 CAROUSEL THEME ANALYSIS`);
        console.log(`📷 Image: ${themeImageUrl.substring(0, 80)}...`);

        // ── Extract image bytes from data URI or HTTP URL ──
        let imagePart = null;
        if (themeImageUrl.startsWith('data:')) {
            const match = themeImageUrl.match(/^data:([\/\w+]+);base64,(.+)$/);
            if (!match) return res.status(400).json({ success: false, error: 'Invalid image data URI format' });
            imagePart = { inlineData: { mimeType: match[1], data: match[2] } };
        } else if (themeImageUrl.startsWith('http')) {
            const r = await fetch(themeImageUrl, { signal: AbortSignal.timeout(15000) });
            const arr = await r.arrayBuffer();
            imagePart = { inlineData: { mimeType: r.headers.get('content-type') || 'image/jpeg', data: Buffer.from(arr).toString('base64') } };
        }
        if (!imagePart) return res.status(400).json({ success: false, error: 'Could not process theme image' });

        // ── Direct Gemini call with forced JSON schema ──
        // responseMimeType + responseSchema = model returns valid JSON every time, zero parsing
        const geminiKey = process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
        if (!geminiKey) return res.status(500).json({ success: false, error: 'Gemini API key not configured' });

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;

        const userPrompt = `You are analyzing an inspiration image for a ${slideCount}-slide premium social media carousel.${userHint ? ` User notes: ${userHint}.` : ''}

Analyze deeply and extract:
1. MOOD — the emotional tone (e.g. "cinematic drama", "romantic warmth", "thrilling tension", "playful energy")
2. GENRE — the creative genre that best matches this image's feel. Choose ONE from: drama, thriller, romance, comedy, horror, action, inspirational, luxury, nature, tech, modern
3. COLOR PALETTE — 5 dominant hex colors from the image
4. LIGHTING — describe the light (e.g. "dramatic side lighting", "soft golden bokeh", "harsh neon edge")
5. PANORAMIC PROMPT — write 2-3 vivid sentences describing a seamless ultra-wide BACKGROUND ENVIRONMENT that matches this image's aesthetic. No people, text, products, or logos — purely the environment.
6. SUGGESTED STYLE — pick one: modern, minimal, vibrant, luxury, nature, tech`;

        // ── ATTEMPT 1: Structured JSON schema ──
        let geminiResponse = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(30000),
            body: JSON.stringify({
                system_instruction: { parts: [{ text: 'You are a world-class creative director and visual analyst. Extract visual DNA from images to help create stunning carousel backgrounds.' }] },
                contents: [{ role: 'user', parts: [imagePart, { text: userPrompt }] }],
                generationConfig: {
                    temperature: 0.3,
                    maxOutputTokens: 1024,
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: 'OBJECT',
                        properties: {
                            mood:            { type: 'STRING' },
                            genre:           { type: 'STRING' },
                            colorPalette:    { type: 'ARRAY', items: { type: 'STRING' } },
                            dominantColor:   { type: 'STRING' },
                            lighting:        { type: 'STRING' },
                            texture:         { type: 'STRING' },
                            panoramicPrompt: { type: 'STRING' },
                            suggestedStyle:  { type: 'STRING' },
                        },
                        required: ['mood', 'genre', 'colorPalette', 'lighting', 'panoramicPrompt', 'suggestedStyle'],
                    },
                },
            }),
        });

        let analysis = null;

        if (geminiResponse.ok) {
            const schemaData = await geminiResponse.json().catch(() => null);
            if (schemaData && !schemaData.error) {
                const candidate = schemaData.candidates?.[0];
                const rawText = candidate?.content?.parts?.[0]?.text || '';
                console.log(`📊 Attempt 1 — finishReason=${candidate?.finishReason}, textLen=${rawText.length}`);
                if (rawText) {
                    try {
                        analysis = JSON.parse(rawText);
                        console.log(`✅ Parsed via responseSchema`);
                    } catch {
                        const stripped = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
                        const m = stripped.match(/\{[\s\S]*\}/);
                        if (m) { try { analysis = JSON.parse(m[0]); console.log(`✅ Parsed via schema+regex`); } catch { /* falls through */ } }
                    }
                }
            }
        } else {
            console.warn(`⚠️ Attempt 1 HTTP ${geminiResponse.status} — will retry`);
        }

        // ── ATTEMPT 2: Plain text, no schema ──
        if (!analysis) {
            console.warn(`⚠️ Attempting plain-text fallback...`);
            const fbRes = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(30000),
                body: JSON.stringify({
                    contents: [{
                        role: 'user',
                        parts: [
                            imagePart,
                            { text: `Analyze this image. Reply ONLY with a raw JSON object — no markdown, no fences, no explanation.\nRequired format:\n{"mood":"string","genre":"drama|thriller|romance|comedy|horror|action|inspirational|luxury|nature|tech|modern","colorPalette":["#hex","#hex","#hex","#hex","#hex"],"dominantColor":"#hex","lighting":"string","panoramicPrompt":"2-3 sentence wide background scene","suggestedStyle":"modern|minimal|vibrant|luxury|nature|tech"}` }
                        ]
                    }],
                    generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
                }),
            });
            if (fbRes.ok) {
                const fbData = await fbRes.json().catch(() => null);
                const rawFb = fbData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
                console.log(`📊 Attempt 2 raw (first 400): ${rawFb.substring(0, 400)}`);
                if (rawFb) {
                    const cleaned = rawFb.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
                    const m = cleaned.match(/\{[\s\S]*?\}/);
                    if (m) { try { analysis = JSON.parse(m[0]); console.log(`✅ Parsed via plain-text fallback`); } catch (e) { console.error('Fallback parse error:', e.message); } }
                }
            }
        }

        // ── ATTEMPT 3: Emergency defaults ──
        if (!analysis) {
            console.warn(`⚠️ All attempts failed — using emergency defaults`);
            analysis = {
                mood: 'cinematic luxury',
                genre: 'luxury',
                colorPalette: ['#1a1a2e', '#16213e', '#0f3460', '#533483', '#e94560'],
                dominantColor: '#1a1a2e',
                lighting: 'soft dramatic side lighting with rich depth',
                texture: 'smooth cinematic',
                panoramicPrompt: `A breathtaking ultra-wide cinematic environment with ${slideCount} seamlessly connected panels — deep atmospheric lighting, rich bokeh gradients fading into darkness, and a luxurious ambient glow creating visual flow from left to right.`,
                suggestedStyle: 'luxury',
            };
        }

        if (!analysis.panoramicPrompt) analysis.panoramicPrompt = `A seamless cinematic environment with elegant lighting across all ${slideCount} carousel panels.`;

        const VALID = ['modern', 'minimal', 'vibrant', 'luxury', 'nature', 'tech'];
        const VALID_GENRES = ['drama', 'thriller', 'romance', 'comedy', 'horror', 'action', 'inspirational', 'luxury', 'nature', 'tech', 'modern'];
        if (!VALID.includes(analysis.suggestedStyle?.toLowerCase())) analysis.suggestedStyle = 'modern';
        else analysis.suggestedStyle = analysis.suggestedStyle.toLowerCase();
        if (!VALID_GENRES.includes(analysis.genre?.toLowerCase())) analysis.genre = analysis.suggestedStyle || 'luxury';
        else analysis.genre = analysis.genre.toLowerCase();

        console.log(`✅ Theme analysis complete: mood=${analysis.mood}, genre=${analysis.genre}, style=${analysis.suggestedStyle}, colors=${analysis.colorPalette?.length}`);
        res.json({ success: true, theme: analysis });

    } catch (err) {
        console.error('❌ Theme analysis error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CAROUSEL GENERATION v3 — TRUE PANORAMIC PIPELINE
//
// Architecture: ONE wide panoramic background → pixel-perfect split into N panels
// This is the only way to achieve true visual continuity (like ZEE5, Netflix strips).
// N independent generations can never look like one image — this guarantees it.
//
// Flow:
//   1. Generate ONE wide landscape background (16:9 or widest supported ratio)
//   2. Sharp resizes + crops to exact total canvas (slideW × slideCount × slideH)
//   3. Split into N equal panels — pixel-perfect seams, zero continuity issues
//   4. Per-panel: Gemini composites product INTO scene; Sharp fallback if needed
//   5. Upload to S3 per-panel — live polling via carouselJobs Map
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/carousel', protect, requireStudio('creativeStudio'), requireCredits('creative'), async (req, res) => {
    const ts = Date.now();
    try {
        const {
            prompt,
            slideCount = 3,
            slideRatio = '1:1',
            brandId,
            selectedModel = 'nanobanana-2',
            productImages = [],
            brandLogo,
            style = 'modern',
            themeImageUrl = null,
            themeAnalysis = null,
        } = req.body;

        if (!prompt) return res.status(400).json({ success: false, error: 'Prompt is required' });
        if (slideCount < 2 || slideCount > 6) return res.status(400).json({ success: false, error: 'slideCount must be 2-6' });

        console.log(`\n══════ CAROUSEL v3 — TRUE PANORAMIC ══════`);
        console.log(`📐 ${slideCount}×${slideRatio} | Model: ${selectedModel} | Style: ${style}`);

        // Each panel's pixel dimensions
        const SLIDE_DIMS = { '1:1':[1080,1080], '4:5':[1080,1350], '9:16':[1080,1920], '16:9':[1920,1080], '3:4':[1080,1440], '2:3':[1080,1620] };
        const [slideW, slideH] = SLIDE_DIMS[slideRatio] || [1080, 1080];
        const totalW = slideW * slideCount;   // full panoramic canvas width
        const totalH = slideH;

        // Genre/treatment system
        const GENRE_TREATMENTS = {
            drama:        { lighting: 'dramatic chiaroscuro, deep shadows one side, warm golden rim light', palette: 'deep burgundy, charcoal, amber gold', atmosphere: 'intense, cinematic, emotionally charged depth-of-field' },
            thriller:     { lighting: 'cool desaturated, stark single-source key light, harsh edge lighting', palette: 'steel blue, near-black, cold silver', atmosphere: 'suspenseful, tense, sharp focus, ominous' },
            romance:      { lighting: 'soft golden hour backlight, warm bokeh, diffused fill', palette: 'blush rose, champagne, warm ivory, peach', atmosphere: 'dreamy, intimate, hazy warmth' },
            comedy:       { lighting: 'bright high-key even lighting, cheerful shadows', palette: 'vibrant coral, sunshine yellow, sky blue, lime', atmosphere: 'playful, lively, upbeat, energetic' },
            horror:       { lighting: 'single harsh upward key light, toxic green ambient, deep shadow pools', palette: 'near-black, toxic green, blood red', atmosphere: 'eerie, dread, unsettling fog' },
            action:       { lighting: 'explosive rim lighting, lens flares, harsh directional', palette: 'electric blue, fire orange, gunmetal grey', atmosphere: 'kinetic, high-energy, bold, epic' },
            inspirational:{ lighting: 'golden sunrise rays flooding scene, ethereal God-rays', palette: 'warm gold, sky blue, soft white, sunrise orange', atmosphere: 'uplifting, majestic, hopeful, vast' },
            luxury:       { lighting: 'soft silk-quality directional light, specular highlights on surfaces', palette: 'champagne gold, deep navy, pearl white', atmosphere: 'opulent, refined, timeless, premium' },
            nature:       { lighting: 'dappled natural sunlight, soft green ambient', palette: 'forest green, earthy brown, sky blue, muted gold', atmosphere: 'serene, organic, fresh, peaceful' },
            tech:         { lighting: 'cool blue LED rim light, gradient neon glow', palette: 'electric blue, deep violet, silver, cyan', atmosphere: 'futuristic, clean, minimal, sleek' },
            modern:       { lighting: 'clean studio soft box, even fill light', palette: 'crisp white, charcoal, accent color', atmosphere: 'clean, professional, contemporary' },
        };

        let genre = style || 'luxury';
        if (themeAnalysis?.genre) genre = themeAnalysis.genre.toLowerCase().replace(/[^a-z]/g, '');
        else if (themeAnalysis?.mood) {
            const moodMap = { cinematic:'drama', dark:'thriller', romantic:'romance', playful:'comedy', scary:'horror', bold:'action', inspiring:'inspirational', natural:'nature', futuristic:'tech' };
            for (const [k, v] of Object.entries(moodMap)) {
                if (themeAnalysis.mood.toLowerCase().includes(k)) { genre = v; break; }
            }
        }
        const treatment = GENRE_TREATMENTS[genre] || GENRE_TREATMENTS.luxury;
        console.log(`🎭 Genre: ${genre} | ${treatment.atmosphere}`);
        console.log(`🖼️  Panoramic canvas: ${totalW}×${totalH}px (${slideCount} panels × ${slideW}px each)`);

        // Upload theme image as reference if provided
        let themeRefUrls = [];
        if (themeImageUrl) {
            try {
                const s3Url = themeImageUrl.startsWith('data:')
                    ? await uploadToS3(themeImageUrl, `carousel-themes/${brandId||'default'}/${Date.now()}-theme.png`)
                    : themeImageUrl;
                themeRefUrls = [s3Url];
                console.log(`✅ Theme reference uploaded`);
            } catch(e) { console.warn(`⚠️ Theme upload failed: ${e.message}`); }
        }

        // ── Build the SINGLE panoramic background prompt ──
        // This generates ONE wide image that covers all panels as a unified scene
        const themeStr    = themeAnalysis?.panoramicPrompt ? `SCENE INSPIRATION: "${themeAnalysis.panoramicPrompt}" — use this as the visual blueprint. ` : '';
        const moodStr     = themeAnalysis?.mood ? `Mood: ${themeAnalysis.mood}. ` : '';
        const lightStr    = themeAnalysis?.lighting ? `Lighting: ${themeAnalysis.lighting}. ` : `Lighting: ${treatment.lighting}. `;
        const colorStr    = themeAnalysis?.colorPalette?.length
            ? `Colors from reference: ${themeAnalysis.colorPalette.slice(0,5).join(', ')}. `
            : `Color palette: ${treatment.palette}. `;

        const panoramicPrompt = `${themeStr}${moodStr}Ultra-wide seamless panoramic background environment for a ${slideCount}-panel marketing carousel. ${prompt}.

Genre & Visual Treatment — ${genre.toUpperCase()}:
${lightStr}
${colorStr}
Atmosphere: ${treatment.atmosphere}

PANORAMIC REQUIREMENTS:
- This is ONE continuous ultra-wide landscape scene that will be split into ${slideCount} equal panels
- The scene must flow naturally from left to right as one unified environment — NO obvious center point or focal element
- Camera is at eye level, looking straight ahead — consistent camera angle across the entire width
- Depth and perspective must extend across the FULL WIDTH: foreground elements on both far left and far right, mid-ground and background flowing continuously
- NO abrupt changes in color, lighting, or texture across the width — gradual environmental flow only
- The overall scene is wide open, like a film establishing shot — panoramic vistas, wide landscapes

STRICT RULES: No text, no people, no faces, no products, no logos, no watermarks. Pure background environment only.`;

        console.log(`\n🌅 Generating ONE panoramic background...`);

        // Generate the panoramic — use widest ratio available (16:9)
        // We'll scale and extend to total canvas size using sharp
        let panoramicResult;
        try {
            panoramicResult = await routedImageGenerate(panoramicPrompt, [], 0.3, '16:9', '1K', selectedModel, themeRefUrls, null);
        } catch(err) {
            if (req.creditsDeducted > 0) await refundCredits(req.user._id, req.creditsDeducted, 'carousel', 'Refund: Panoramic generation failed', 'creative');
            return res.status(500).json({ success: false, error: `Panoramic background failed: ${safeErrorMessage(err)}` });
        }
        if (!panoramicResult?.imageUrl) {
            if (req.creditsDeducted > 0) await refundCredits(req.user._id, req.creditsDeducted, 'carousel', 'Refund: No panoramic image', 'creative');
            return res.status(500).json({ success: false, error: 'No background image generated' });
        }
        console.log(`✅ Panoramic generated (${panoramicResult.provider})`);

        // Register job and respond immediately — background processing continues async
        const carouselId = randomUUID();
        carouselJobs.set(carouselId, { status: 'generating', panels: [], panoramicUrl: panoramicResult.imageUrl, error: null, updatedAt: Date.now() });
        res.json({ success: true, carouselId, status: 'processing', message: `Panoramic background ready. Splitting into ${slideCount} panels...`, panoramicUrl: panoramicResult.imageUrl, slideCount, provider: panoramicResult.provider });

        // ── Async: Split panoramic, composite products, upload ──
        (async () => {
            try {
                const sharp = (await import('sharp')).default;
                const geminiKey = process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

                // Utility: URL/dataURI → Buffer with retry
                const toBuffer = async (url, timeoutMs = 25000) => {
                    if (!url) return null;
                    if (url.startsWith('data:')) return Buffer.from(url.split(',')[1], 'base64');
                    const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
                    if (!r.ok) throw new Error(`HTTP ${r.status} fetching image`);
                    return Buffer.from(await r.arrayBuffer());
                };

                // ── STEP 1: Load panoramic, extend to exact total canvas ──
                let panoBuf;
                try {
                    panoBuf = await toBuffer(panoramicResult.imageUrl, 30000);
                } catch(fetchErr) {
                    console.warn(`   ⚠️ Panoramic fetch failed, retrying in 3s... (${fetchErr.message})`);
                    await new Promise(r => setTimeout(r, 1000));
                    panoBuf = await toBuffer(panoramicResult.imageUrl, 30000);
                }
                if (!panoBuf) throw new Error('Could not load panoramic buffer');

                const panoMeta = await sharp(panoBuf).metadata();
                console.log(`📐 Loaded panoramic: ${panoMeta.width}×${panoMeta.height}px`);

                // Scale panoramic to fill exact canvas (totalW × totalH)
                // 'cover' zooms to the larger dimension; 'fill' stretches — cover is better for environments
                const fullCanvasBuf = await sharp(panoBuf)
                    .resize(totalW, totalH, { fit: 'cover', position: 'centre' })
                    .png()
                    .toBuffer();
                console.log(`✅ Canvas scaled to ${totalW}×${totalH}px`);

                // ── STEP 2: Pixel-perfect split into N panels ──
                // Each panel is extracted by left-offset — guaranteed seamless seams
                const panelBufs = [];
                for (let i = 0; i < slideCount; i++) {
                    const panelBuf = await sharp(fullCanvasBuf)
                        .extract({ left: i * slideW, top: 0, width: slideW, height: slideH })
                        .png()
                        .toBuffer();
                    panelBufs.push(panelBuf);
                    console.log(`   ✂️  Panel ${i+1}/${slideCount} extracted at x=${i * slideW}`);
                }
                console.log(`✅ Split complete: ${panelBufs.length} panels at ${slideW}×${slideH}px each`);

                // ── STEP 3: Per-panel AI generation with product as visual reference ──
                // Architecture: Upload panel slice → S3 URL → routedImageGenerate(prompt, refUrls)
                // Gemini sees the background panel + product image as vision inputs and generates
                // a FRESH unified scene. This is the correct approach — no compositing, no SVG,
                // no gradients. Pure AI generation like all other images in the system.

                const GENRE_PRODUCT_PROMPT = {
                    drama:        'cinematic chiaroscuro lighting, warm golden rim light, emotionally charged atmosphere, deep shadows',
                    thriller:     'cool harsh key light, long sharp shadows, suspenseful and tense visual energy',
                    romance:      'soft golden hour backlight, warm bokeh, dreamy hazy warmth, intimate atmosphere',
                    comedy:       'bright cheerful high-key lighting, vibrant playful colors, energetic upbeat mood',
                    horror:       'toxic green ambient light, harsh upward shadows, eerie fog at ground level',
                    action:       'explosive rim lighting, lens flares, kinetic energy, high-impact bold visuals',
                    inspirational:'golden sunrise God-rays, uplifting majestic atmosphere, hopeful and vast',
                    luxury:       'silk-quality soft directional light, specular highlights, opulent premium atmosphere',
                    nature:       'dappled natural sunlight, organic serene atmosphere, fresh and peaceful',
                    tech:         'cool blue neon edge lighting, futuristic clean minimal aesthetic',
                    modern:       'clean soft-box studio light, contemporary professional atmosphere',
                };
                const genrePromptAddition = GENRE_PRODUCT_PROMPT[genre] || 'professional premium marketing lighting';

                const finalPanels = [];
                for (let i = 0; i < panelBufs.length; i++) {
                    let panelBuf = panelBufs[i];

                    if (productImages[i]) {
                        try {
                            console.log(`\n   🎨 Panel ${i+1}/${slideCount}: AI generation with product reference...`);

                            // Upload this panel's background slice to S3 so LaoZhang can see it
                            const panelSliceKey = `carousels/${brandId||'default'}/${carouselId}-slice-${i+1}.png`;
                            const panelSliceUrl = await uploadToS3(panelBuf, panelSliceKey, 'image/png');

                            // Resolve product image to S3 URL (may already be S3 or could be dataURL)
                            let productUrl = productImages[i];
                            if (productImages[i].startsWith('data:')) {
                                productUrl = await uploadToS3(
                                    productImages[i],
                                    `carousels/${brandId||'default'}/${carouselId}-product-${i+1}.png`
                                );
                            }

                            // Build the generation prompt — tells Gemini how to fuse the two images
                            const panelPrompt = `Create a single unified, immersive marketing carousel panel (panel ${i+1} of ${slideCount}).

REFERENCE IMAGE 1 (background environment): Use this as the background setting of the full image.
REFERENCE IMAGE 2 (subject/product): Naturally integrate this subject into the background environment from IMAGE 1.

REQUIREMENTS:
- The main subject from IMAGE 2 must appear NATURALLY INSIDE the world of IMAGE 1
- This must look like ONE unified photograph shot on location — not composited, not overlaid
- The subject's lighting matches the environment: ${genrePromptAddition}
- The subject has realistic ground shadow and surface interaction
- The background from IMAGE 1 flows naturally around and behind the subject
- Subject is prominent, centered, occupying 55-65% of frame height
- Maintain the exact aspect ratio and dimensions — output must be ${slideW}×${slideH}
- The scene tells a story — ${genre} genre treatment
- NO borders, NO frames, NO text, NO logos, NO picture-in-picture, NO vignette effects
- This is panel ${i+1} of a continuous ${slideCount}-panel carousel strip — the background environment extends beyond the edges left and right

${themeStr}${moodStr}`;

                            // Call the SAME pipeline as all other image generation
                            // refImageUrls = [panelSliceUrl, productUrl] → LaoZhang multimodal sends both to Gemini
                            console.log(`   📡 LaoZhang multimodal → Gemini with 2 visual refs (panel bg + product)`);
                            const panelResult = await routedImageGenerate(
                                panelPrompt,
                                [],         // imageParts (inline) — empty, refs go via refImageUrls
                                0.25,       // temperature — slightly creative but accurate
                                slideRatio, // output aspect ratio
                                '1K',
                                selectedModel,
                                [panelSliceUrl, productUrl],   // ← THE KEY: both images as multimodal refs
                                null
                            );

                            if (panelResult?.imageUrl) {
                                panelBuf = await toBuffer(panelResult.imageUrl, 30000);
                                if (!panelBuf) throw new Error('Panel result buffer was null');
                                // Ensure exact dimensions
                                panelBuf = await sharp(panelBuf)
                                    .resize(slideW, slideH, { fit: 'cover', position: 'centre' })
                                    .png()
                                    .toBuffer();
                                console.log(`   ✅ Panel ${i+1}: AI generated (${panelResult.provider})`);
                            } else {
                                console.warn(`   ⚠️ Panel ${i+1}: generation returned no image — using clean background`);
                            }
                        } catch(pErr) {
                            console.warn(`   ⚠️ Panel ${i+1}: AI generation failed (${pErr.message}) — using clean background`);
                        }
                    }

                    // Brand logo watermark (top-left, 6% height)
                    if (brandLogo) {
                        try {
                            const logoBuf = await toBuffer(brandLogo, 10000);
                            if (logoBuf) {
                                const logo = await sharp(logoBuf).resize({ height: Math.floor(slideH * 0.06), fit: 'inside' }).png().toBuffer();
                                panelBuf = await sharp(panelBuf).composite([{ input: logo, top: 24, left: 24, blend: 'over' }]).png().toBuffer();
                            }
                        } catch { /* optional */ }
                    }

                    finalPanels.push(panelBuf);
                }
                console.log(`✅ Step 3: ${finalPanels.length} panels generated`);


                // ── STEP 4: Upload to S3 — update job Map per-panel for live polling ──
                const panelUrls = [];
                const panoKey = `carousels/${brandId||'default'}/${carouselId}-pano.png`;
                const panoramicS3Url = await uploadToS3(finalPanels[0], panoKey, 'image/png');

                for (let i = 0; i < finalPanels.length; i++) {
                    const url = await uploadToS3(finalPanels[i], `carousels/${brandId||'default'}/${carouselId}-panel-${i+1}.png`, 'image/png');
                    panelUrls.push(url);
                    carouselJobs.set(carouselId, {
                        status: i === finalPanels.length - 1 ? 'ready' : 'uploading',
                        panels: [...panelUrls],
                        panoramicUrl: panoramicS3Url,
                        error: null,
                        updatedAt: Date.now(),
                    });
                    console.log(`   ☁️  Panel ${i+1}/${finalPanels.length} → S3`);
                }

                // Persist to MongoDB
                await Creative.create({
                    user: req.user._id,
                    brand: brandId || undefined,
                    prompt,
                    imageUrl: panelUrls[0],
                    type: 'carousel',
                    aiMeta: { model: selectedModel, provider: panoramicResult.provider, carouselId, slideCount, slideRatio, style, genre, panoramicUrl: panoramicS3Url, panels: panelUrls, processingStatus: 'ready' },
                });

                const elapsed = Math.round((Date.now() - ts) / 1000);
                console.log(`\n══════ CAROUSEL v3 DONE in ${elapsed}s ══════`);
                console.log(`🎭 ${genre} | ${slideCount} panels | ${slideW}×${slideH}px each`);
                console.log(`🖼️  Full panoramic: ${totalW}×${totalH}px`);
                console.log(`══════════════════════════════════════════\n`);

            } catch(pipeErr) {
                console.error('❌ Carousel pipeline error:', pipeErr.message);
                console.error('❌ Stack:', pipeErr.stack);
                carouselJobs.set(carouselId, { status: 'error', panels: [], panoramicUrl: panoramicResult?.imageUrl||'', error: pipeErr.message, updatedAt: Date.now() });
            }
        })();

    } catch (error) {
        console.error('❌ Carousel generation error:', error);
        if (req.creditsDeducted > 0) await refundCredits(req.user._id, req.creditsDeducted, 'carousel', `Refund: ${safeErrorMessage(error)}`, 'creative');
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

router.get('/carousel/:carouselId', protect, async (req, res) => {
    try {
        const { carouselId } = req.params;

        // Check in-memory Map first (real-time updates during processing)
        const liveJob = carouselJobs.get(carouselId);
        if (liveJob) {
            return res.json({
                success: true,
                status: liveJob.status,
                panels: liveJob.panels || [],
                panoramicUrl: liveJob.panoramicUrl || '',
                error: liveJob.error || null,
            });
        }

        // Fallback: check MongoDB for completed jobs from previous sessions
        const creative = await Creative.findOne({
            user: req.user._id,
            'aiMeta.carouselId': carouselId,
        }).lean();

        if (!creative) {
            return res.json({ success: true, status: 'processing', panels: [], panoramicUrl: '' });
        }

        res.json({
            success: true,
            status: creative.aiMeta?.processingStatus || 'ready',
            panels: creative.aiMeta?.panels || [],
            panoramicUrl: creative.aiMeta?.panoramicUrl || '',
            slideCount: creative.aiMeta?.slideCount || 0,
            creativeId: creative._id,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


export default router;

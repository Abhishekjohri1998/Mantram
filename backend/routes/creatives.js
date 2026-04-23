import mongoose from 'mongoose';
import { randomUUID } from 'crypto';
import express from 'express';
import multer from 'multer';
import FormData from 'form-data';

// ⚡ PERF: Lazy singleton for sharp — imported once on first use, cached thereafter.
// Avoids static import crash if native binary isn't compiled for the platform,
// while eliminating the ~200ms overhead of repeated dynamic imports.
let _sharp = null;
async function getSharp() {
    if (!_sharp) _sharp = (await import('sharp')).default;
    return _sharp;
}

import GenerationJob from '../models/GenerationJob.js';
import { Router } from 'express';
import Creative from '../models/Creative.js';
import Feedback from '../models/Feedback.js';
import Brand from '../models/Brand.js';
import Product from '../models/Product.js';
import { protect } from '../middleware/auth.js';
import { requireCredits as requireCredits, refundCredits } from '../middleware/credits.js';
import { requireStudio } from '../middleware/studioAccess.js';
// orchestrator import removed — no fallback routing
import { addWatermark } from '../utils/watermark.js';
import { getSetting } from '../models/SystemSettings.js';

import { uploadToS3, getSignedUrlIfNeeded, getSignedUrlForPath } from '../utils/s3.js';
import { getCachedImageBuffer, setCachedImageBuffer } from '../utils/imageCache.js';

/**
 * Fetch any URL, pre-signing private S3 URLs with backend AWS credentials first.
 * This is the ONLY way to reliably fetch images from our private S3 bucket server-side.
 */
async function presignedFetch(url, opts = {}) {
    if (!url) return null;
    let fetchUrl = url;
    const isOurS3 = url.includes('amazonaws.com') && (url.includes('mantram-assets') || url.includes('mantram-media'));
    // Only pre-sign if it's NOT already a signed URL (signed URLs contain X-Amz-Signature)
    if (isOurS3 && !url.includes('X-Amz-Signature')) {
        try {
            fetchUrl = await getSignedUrlForPath(url, 300); // 5-min presigned URL
        } catch (e) {
            console.warn(`⚠️ presignedFetch: Could not pre-sign S3 URL: ${e.message}`);
        }
    }
    return fetch(fetchUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Mantram AI Backend)' }, ...opts });
}
import { overlayLogo, fetchImageBuffer } from '../utils/logoOverlay.js';
import { GoogleGenAI } from '@google/genai';
import { safeErrorMessage } from '../utils/safeError.js';
import { getRouter } from '../ai/router.js';
import { runCreativePipeline, postGenerationCriticNode } from '../agents/creativeStudio/nodes.js';
import { startProgress, addStep, getProgress, endProgress } from '../utils/progressStore.js';
import { laozhangImageGenerate, laozhangMultimodalImageGenerate, isLaozhangAvailable } from '../agents/videoStudio/laozhangClient.js';
import { getActiveProvider } from '../ai/providerRouting.js';


const router = Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Generate a unique job ID with environment-agnostic fallback.
 */
function generateJobId() {
    try {
        return randomUUID();
    } catch {
        return Date.now().toString(36) + Math.random().toString(36).substring(2);
    }
}

/**
 * Core handler for creative job creation.
 * Moved above routes to ensure availability in all environments (hoisting).
 */
async function createCreativeJob(req, res) {
    try {
        const { brandId, type, prompt, options } = req.body;
        const jobId = generateJobId();

        // Sanitize brandId - ensure it's a valid ObjectId or null (Mongoose requirement for Schema)
        const sanitizedBrandId = (brandId && mongoose.Types.ObjectId.isValid(brandId)) ? brandId : null;

        console.log(`📦 [Job] Creating ${type} job ${jobId} for user ${req.user._id} (Brand: ${sanitizedBrandId || 'None'})`);

        // Create the job record early
        try {
            await GenerationJob.create({
                jobId,
                user: req.user._id,
                brand: sanitizedBrandId,
                status: 'pending',
                type: 'ai-create', // Strict job class from schema enum
                format: type || 'instagram-post', // Platform format
                prompt: prompt || '',
                creditsDeducted: Number(req.creditsDeducted) || 0,
                options: options || {}
            });
        } catch (dbErr) {
            console.error(`❌ [Job] Database creation failed for ${jobId}:`, dbErr.message);
            throw new Error(`Failed to initialize job record: ${dbErr.message}`);
        }

        // Return immediately to frontend
        res.json({ success: true, jobId, message: 'Generation queued. Processing will begin shortly.' });

        // ── DIRECT BACKGROUND EXECUTION ──────────────────────────────────────
        // We previously used Bull+Redis (Upstash) here, but Upstash is a serverless
        // REST-based Redis that does NOT support persistent TCP connections required
        // by Bull's BRPOP/SUBSCRIBE model. Jobs were enqueued but NEVER processed.
        //
        // Fix: run the generation directly in Node.js background via setImmediate.
        // This is non-blocking (response is already sent above), reliable, and doesn't
        // require Redis. It handles up to ~10 concurrent generations comfortably.
        // ─────────────────────────────────────────────────────────────────────
        setImmediate(async () => {
            try {
                console.log(`🚀 [Job] Starting direct background generation: ${jobId}`);

                // Mark as processing
                await GenerationJob.findOneAndUpdate(
                    { jobId },
                    { status: 'processing', startedAt: new Date() }
                );

                // Get user model
                const User = mongoose.model('User');
                const user = req.user; // Already authenticated — use req.user directly

                const data = await internalGenerateCreative({
                    body: { brandId: sanitizedBrandId, type, prompt, options, jobId },
                    user,
                    creditsDeducted: req.creditsDeducted || 0,
                    jobId,
                });

                if (data?.success) {
                    console.log(`✅ [Job] ${jobId} completed — Creative: ${data.creative?._id}`);
                } else {
                    throw new Error(data?.error || 'Pipeline returned no creative');
                }
            } catch (err) {
                console.error(`❌ [Job] Background generation failed (${jobId}):`, err.message);
                await GenerationJob.findOneAndUpdate(
                    { jobId },
                    { status: 'failed', completedAt: new Date(), errorMessage: err.message }
                ).catch(() => { });

                // Refund credits on failure
                if (req.creditsDeducted > 0) {
                    refundCredits(req.user._id, req.creditsDeducted, 'creative',
                        `Refund: Background Job ${jobId} Failed — ${err.message}`, 'creative'
                    ).catch(e => console.error(`❌ [Job] Refund failed for ${jobId}:`, e.message));
                }
            }
        });

    } catch (error) {
        console.error('❌ [Job] createCreativeJob top-level error:', error);

        // Refund if job creation failed after credit deduction
        if (req.creditsDeducted > 0) {
            try {
                await refundCredits(req.user._id, req.creditsDeducted, 'creative', `Refund: Job creation failed - ${error.message}`, 'creative');
                console.log(`💰 [Job] Credits (${req.creditsDeducted}) refunded for user ${req.user._id}`);
            } catch (refundErr) {
                console.warn('⚠️ [Job] Refund failed during 500 handler:', refundErr.message);
            }
        }

        // Enhanced error visibility for staging - pass through message if not Production
        const isProd = process.env.NODE_ENV === 'production';
        const errorMsg = isProd ? safeErrorMessage(error) : (error.message || 'Internal server error');

        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                error: errorMsg,
                details: isProd ? undefined : error.stack // Hide stack in Prod
            });
        }
    }
}

// In-memory job tracker for carousel async pipeline
// Allows polling to see real-time progress before DB write
const carouselJobs = new Map(); // carouselId → { status, panels, panoramicUrl, error, updatedAt }
setInterval(() => {
    const cutoff = Date.now() - 10 * 60 * 1000; // 10min TTL
    for (const [id, job] of carouselJobs) {
        if (job.updatedAt < cutoff) carouselJobs.delete(id);
    }
}, 2 * 60 * 1000);

export async function internalGenerateCreative({ body, user, creditsDeducted, jobId, progressId }) {
    try {
        const { brandId, type, prompt, options, refImageUrls } = body;

        let agenticMeta = { mcotEnabled: true };

        if (progressId) {
            await addStep(progressId, { agent: 'intel', message: 'Analyzing brand DNA...', status: 'working' });
        }

        // ⚡ PERF: Removed standalone Brand.findById — the pipeline's loadBrandContext
        // already loads the brand from Redis cache or DB. Validated post-pipeline instead.

        // ── Define skillRefUrls HERE — BEFORE the pipeline call so they reach visual grounding ──
        // Previously this was defined after the pipeline call, so pipeline always got an empty array.
        const skillRefUrls = (refImageUrls || []).filter(u => u && typeof u === 'string');

        let pipelineResult;
        try {
            // ── 45s timeout on agentic pipeline — falls back to raw prompt if slow ──
            const pipelineTimeout = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Pipeline timeout (45s) — using raw prompt')), 45_000)
            );
            pipelineResult = await Promise.race([
                runCreativePipeline({
                    brandId,
                    brief: prompt,
                    format: type || 'instagram-post',
                    mode: 'fast', // Enforce fast-path to bypass sequential LLM criticism delays
                    refImageUrls: skillRefUrls, // ✅ Now correctly defined before this call
                    generateCopy: !!(options?.generateCopy), // Only inject text when explicitly enabled
                    customCopy: options?.customCopy || null,
                    aspectRatio: options?.aspectRatio || '1:1',
                    imageModel: (options?.imageModel || 'nanobanana-2').toLowerCase(),
                    emit: async (agent, message, status, detail) => {
                        if (progressId) {
                            await addStep(progressId, { agent, message, status, detail });
                        }
                    }
                }),
                pipelineTimeout,
            ]);
            agenticMeta = {
                ...agenticMeta,
                ...pipelineResult,
                pipelineRan: true
            };
        } catch (pipelineErr) {
            console.error('Agentic Pipeline failed, falling back to raw prompt:', pipelineErr.message);
            agenticMeta.pipelineError = pipelineErr.message;
        }

        let fullPrompt = agenticMeta.finalPrompt || agenticMeta.engineeredPrompt?.totalPrompt || prompt;
        const selectedImageModel = (options?.imageModel || 'nanobanana-2').toLowerCase();
        const aspectRatio = options?.aspectRatio || '1:1';
        const imageSize = options?.imageSize || '1K';
        const customSize = options?.customSize || null;

        let ratioNum = 1;
        if (customSize && customSize.width && customSize.height) {
            ratioNum = customSize.width / customSize.height;
        } else if (aspectRatio && aspectRatio.includes(':')) {
            const [w, h] = aspectRatio.split(':').map(Number);
            if (w && h) ratioNum = w / h;
        }

        if (ratioNum >= 2.5 || ratioNum <= 1 / 2.5) {
            console.log(`📐 Extreme aspect ratio detected (ratio ${ratioNum.toFixed(2)}). Injecting anti-tiling prompt.`);
            fullPrompt += "\n\nCRITICAL COMPOSITION INSTRUCTION: Render this as a single, continuous, and seamless scene spanning the entire canvas. DO NOT tile the image. DO NOT repeat elements, borders, or patterns.";
        }

        if (progressId) {
            await addStep(progressId, { agent: 'generating', message: `Generating using ${selectedImageModel}...`, status: 'working' });
        }

        // skillRefUrls is already defined above (before the pipeline call) — reused here for templateRefUrls merging below.

        // ── Extract template reference images from options ──
        // Templates send product photos, character images, and reference images
        // via options.baseImage, options.productImageUrl, options.characters, etc.
        // These MUST be forwarded to the image model as reference images.
        // ⚡ PERF: All base64→S3 uploads now run in parallel via Promise.all
        const templateRefUrls = [];
        const templateUploadPromises = [];
        if (options) {
            // Product image (base64 → queue S3 upload, HTTP URL → use directly)
            if (options.baseImage && typeof options.baseImage === 'string') {
                if (options.baseImage.startsWith('data:image/')) {
                    templateUploadPromises.push(
                        uploadToS3(options.baseImage, `templates/${brandId}/${Date.now()}-product.png`)
                            .then(s3Url => { templateRefUrls.push(s3Url); console.log(`🖼️ [Template] Uploaded base64 product image to S3`); })
                            .catch(e => console.warn(`⚠️ [Template] Failed to upload baseImage to S3:`, e.message))
                    );
                } else if (options.baseImage.startsWith('http')) {
                    templateRefUrls.push(options.baseImage);
                }
            }
            // Product image URL (already an HTTP URL)
            if (options.productImageUrl && typeof options.productImageUrl === 'string' && options.productImageUrl.startsWith('http')) {
                templateRefUrls.push(options.productImageUrl);
            }
            // Character/model reference images (for face/appearance preservation)
            if (Array.isArray(options.characters)) {
                for (const char of options.characters) {
                    if (char.image && typeof char.image === 'string') {
                        if (char.image.startsWith('data:image/')) {
                            const charName = char.name || 'char';
                            templateUploadPromises.push(
                                uploadToS3(char.image, `templates/${brandId}/${Date.now()}-char-${charName}.png`)
                                    .then(s3Url => { templateRefUrls.push(s3Url); console.log(`🖼️ [Template] Uploaded character image "${charName}" to S3`); })
                                    .catch(e => console.warn(`⚠️ [Template] Failed to upload character image:`, e.message))
                            );
                        } else if (char.image.startsWith('http')) {
                            templateRefUrls.push(char.image);
                        }
                    }
                }
            }
            // Template reference image (for inpainting / style reference)
            if (options.templateRefImageUrl && typeof options.templateRefImageUrl === 'string' && options.templateRefImageUrl.startsWith('http')) {
                templateRefUrls.push(options.templateRefImageUrl);
            }
            // Generic reference images from template fields
            if (options.referenceImages) {
                for (const [key, val] of Object.entries(options.referenceImages)) {
                    if (val && typeof val === 'string') {
                        if (val.startsWith('data:image/')) {
                            templateUploadPromises.push(
                                uploadToS3(val, `templates/${brandId}/${Date.now()}-ref-${key}.png`)
                                    .then(s3Url => { templateRefUrls.push(s3Url); })
                                    .catch(e => console.warn(`⚠️ [Template] Failed to upload ref image ${key}:`, e.message))
                            );
                        } else if (val.startsWith('http')) {
                            templateRefUrls.push(val);
                        }
                    }
                }
            }
            // ⚡ Wait for all S3 uploads in parallel (was sequential before)
            if (templateUploadPromises.length > 0) {
                console.log(`⚡ [Template] Uploading ${templateUploadPromises.length} base64 images to S3 in parallel...`);
                await Promise.all(templateUploadPromises);
            }
        }

        // Merge skill refs + template refs (deduplicated)
        const allRefUrls = [...new Set([...skillRefUrls, ...templateRefUrls])];
        if (allRefUrls.length > 0) {
            console.log(`🖼️ [internalGenerate] Forwarding ${allRefUrls.length} reference image(s) to generation pipeline (skills: ${skillRefUrls.length}, templates: ${templateRefUrls.length})`);
        }

        // ── Build template inpainting prompt when a template reference image is provided ──
        // This tells Gemini EXACTLY which image is the design template vs. new content.
        const isTemplateMode = !!(options?.templateInpainting && options?.templateRefImageUrl);
        if (isTemplateMode) {
            const contentImageCount = allRefUrls.filter(u => u !== options.templateRefImageUrl).length;
            const templateUrl = options.templateRefImageUrl;
            // Put template ref FIRST so Gemini sees it as IMAGE 1
            const contentUrls = allRefUrls.filter(u => u !== templateUrl);
            allRefUrls.length = 0;
            allRefUrls.push(templateUrl, ...contentUrls);

            const contentDesc = contentImageCount > 0
                ? `I have also provided ${contentImageCount} new content image(s) — place them into the design positions marked in the template (e.g. product slot, model/person slot).`
                : '';

            const originalPrompt = fullPrompt;
            fullPrompt = `TEMPLATE INPAINTING — STRICT DESIGN REPLICATION:

IMAGE 1 (the template): This is the reference design template. You MUST preserve:
- The EXACT background, colors, gradients, and textures
- The EXACT layout, composition, and element positions 
- The EXACT typography style, font weight, and text placement
- All decorative elements, borders, shadows, and visual effects
- The same overall aesthetic and mood

${contentImageCount > 0 ? `IMAGE 2+: These are the new content images to INSERT into the template design.
- Replace the product/subject slot in the template with the provided new content image(s)
- Keep every other part of the design IDENTICAL to Image 1
- The new content should blend naturally into the existing template design
` : ''}
CONTENT TO GENERATE (fill into the template):
${originalPrompt}

ABSOLUTE RULES:
1. The output MUST look like Image 1 (the template) — same layout, same colors, same structure
2. Only the content (product/person/text) changes — NOT the design shell
3. Do NOT reimagine or reinterpret the design — replicate it precisely
4. ${contentImageCount > 0 ? 'The new content image(s) should appear in the same position as the original product/subject' : 'Generate fresh content in the same design shell'}

Generate the adapted creative now.`;

            console.log(`🎨 [Template Inpainting] Mode active — ${allRefUrls.length} images (1 template + ${contentImageCount} content)`);
        }

        const result = await routedImageGenerate(
            fullPrompt,
            [], // imageParts (populated from refUrls inside routedImageGenerate)
            0.4, // temperature
            aspectRatio,
            imageSize,
            selectedImageModel,
            allRefUrls, // refImageUrls — these get downloaded + converted to inlineData
            customSize
        );

        if (result.modelBusy) {
            throw new Error(result.errorMessage || 'AI model servers are busy. Please try again soon.');
        }

        let rawImageUrl = result.imageUrl || '';
        if (!rawImageUrl) {
            throw new Error('Image generation produced no image');
        }

        // --- ENFORCE EXACT CUSTOM SIZE WITH SHARP ---
        // Hardened pipeline: normalize input → resize with cover → fallback to fill
        // Fixes "offset out of range" errors caused by corrupt metadata or unusual
        // channel layouts in AI-generated images (libvips buffer miscalculation).
        if (customSize && customSize.width && customSize.height) {
            try {
                const targetW = parseInt(customSize.width, 10);
                const targetH = parseInt(customSize.height, 10);
                if (targetW > 0 && targetH > 0) {
                    console.log(`✂️ Enforcing exact custom size crop: ${targetW}x${targetH} from AI generated ratio.`);
                    const sharp = await getSharp();
                    // ⚡ PERF: Decode data: URIs directly instead of re-fetching via network
                    let imgBuffer;
                    if (rawImageUrl.startsWith('data:')) {
                        const commaIdx = rawImageUrl.indexOf(',');
                        if (commaIdx > -1) {
                            imgBuffer = Buffer.from(rawImageUrl.substring(commaIdx + 1), 'base64');
                        }
                    } else {
                        imgBuffer = await fetchImageBuffer(rawImageUrl);
                    }
                    if (imgBuffer) {
                        // Guard: convert webp to PNG if needed (Sharp on some EC2 builds lacks webp)
                        if (imgBuffer.length > 12 && imgBuffer.toString('ascii', 8, 12) === 'WEBP') {
                            try {
                                imgBuffer = await sharp(imgBuffer, { failOn: 'none' }).toFormat('png').toBuffer();
                            } catch (webpErr) {
                                console.warn(`⚠️ webp→png crop conversion failed: ${webpErr.message}`);
                                imgBuffer = null;
                            }
                        }
                    }
                    if (imgBuffer) {
                        // Step 1: Normalize — re-encode through PNG to strip corrupt metadata,
                        // fix channel mismatches, and guarantee a clean pixel buffer.
                        const normalizedBuffer = await sharp(imgBuffer, { limitInputPixels: false, failOn: 'none' })
                            .toColourspace('srgb')  // force consistent color space
                            .png()
                            .toBuffer();

                        // Step 2: Resize with cover fit (crop to fill)
                        let resizedBuffer;
                        try {
                            resizedBuffer = await sharp(normalizedBuffer, { limitInputPixels: false })
                                .resize({ width: targetW, height: targetH, fit: 'cover', position: 'centre' })
                                .png()
                                .toBuffer();
                        } catch (coverErr) {
                            // Fallback: if cover fit fails (buffer offset), use fill + flatten
                            console.warn(`⚠️ Cover resize failed (${coverErr.message}), falling back to fill+extract`);
                            const meta = await sharp(normalizedBuffer).metadata();
                            const scaled = await sharp(normalizedBuffer, { limitInputPixels: false })
                                .resize({
                                    width: Math.max(targetW, targetH),
                                    height: Math.max(targetW, targetH),
                                    fit: 'inside',
                                    withoutEnlargement: false,
                                })
                                .png()
                                .toBuffer();
                            const scaledMeta = await sharp(scaled).metadata();
                            const extractLeft = Math.max(0, Math.floor(((scaledMeta.width || targetW) - targetW) / 2));
                            const extractTop = Math.max(0, Math.floor(((scaledMeta.height || targetH) - targetH) / 2));
                            resizedBuffer = await sharp(scaled, { limitInputPixels: false })
                                .extract({
                                    left: extractLeft,
                                    top: extractTop,
                                    width: Math.min(targetW, scaledMeta.width || targetW),
                                    height: Math.min(targetH, scaledMeta.height || targetH),
                                })
                                .resize({ width: targetW, height: targetH, fit: 'fill' })
                                .png()
                                .toBuffer();
                        }

                        rawImageUrl = `data:image/png;base64,${resizedBuffer.toString('base64')}`;
                        console.log(`✅ Cropped to exact requested size: ${targetW}x${targetH}`);
                    }
                }
            } catch (resizeErr) {
                console.warn('⚠️ Failed to enforce exact custom size crop:', resizeErr.message);
                // Continue with the raw AI-generated image — user still gets output
            }
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
            // ── IMPORTANT: Never store raw base64 imageUrl in GenerationJob.result ──
            // Base64 images can be 1-3MB, which bloats MongoDB documents and may
            // silently fail the findOneAndUpdate (hitting the 16MB doc limit).
            // Instead, store a slim creative object with only safe HTTP URLs.
            // The background S3 upload will update Creative.imageUrl shortly after.
            const safeImageUrl = (creative.imageUrl || '').startsWith('data:')
                ? creative.thumbnailUrl  // prefer thumbnail URL if available
                : creative.imageUrl;
            const slimCreative = {
                _id: creative._id,
                type: creative.type,
                title: creative.title,
                prompt: creative.prompt,
                // Only store safe HTTP URLs — base64 data goes via background S3 upload
                imageUrl: safeImageUrl && !safeImageUrl.startsWith('data:') ? safeImageUrl : null,
                thumbnailUrl: creative.thumbnailUrl && !creative.thumbnailUrl.startsWith('data:') ? creative.thumbnailUrl : null,
                dimensions: creative.dimensions,
                aiMeta: creative.aiMeta ? { processingStatus: creative.aiMeta.processingStatus } : {},
                copy: creative.copy,
                createdAt: creative.createdAt,
            };
            await GenerationJob.findOneAndUpdate(
                { jobId },
                {
                    status: 'completed',
                    completedAt: new Date(),
                    creativeId: creative._id,
                    // Store safe external URL for quick display (may be null until S3 upload finishes)
                    imageUrl: slimCreative.imageUrl || slimCreative.thumbnailUrl || null,
                    result: { creative: slimCreative, warnings: result.warnings || [] }
                }
            ).catch(err => console.error('[GenerationJob] Failed to mark completed:', err.message));
        }

        user.updateOne({ $inc: { 'usage.creativesGenerated': 1 } }).catch(() => { });

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
                    // ── Also update the GenerationJob so the polling frontend gets the real URL ──
                    if (jobId) {
                        await GenerationJob.updateOne(
                            { jobId },
                            { $set: { imageUrl: finalUrl, 'result.creative.imageUrl': finalUrl, 'result.creative.thumbnailUrl': finalUrl } }
                        ).catch(() => { });
                    }
                } else {
                    await Creative.updateOne(
                        { _id: creative._id },
                        { $set: { 'aiMeta.processingStatus': 'ready' } }
                    );
                }

                // ── POST-GENERATION CRITIC (MCoT Stage 2) — async background ──
                // Analyze the final image after S3 upload (so we have a stable HTTP URL)
                // Saves quality verdict + score to aiMeta without blocking the user response
                if (finalUrl && finalUrl.startsWith('http') && agenticMeta?.finalPrompt) {
                    try {
                        // ⚡ PERF: Use the already-imported postGenerationCriticNode (line 45) — no dynamic re-import
                        const criticState = {
                            brief: prompt,
                            finalPrompt: agenticMeta.finalPrompt,
                            format: body.type || 'instagram-post',
                            brandIntel: agenticMeta.brandIntel || null,
                            matchedProduct: agenticMeta.matchedProduct || null,
                            visualGrounding: agenticMeta.visualGrounding || null,
                            generatedImageUrl: finalUrl,
                        };
                        const criticResult = await postGenerationCriticNode(criticState);
                        if (criticResult?.postGenCritique) {
                            const q = criticResult.postGenCritique;
                            await Creative.updateOne(
                                { _id: creative._id },
                                {
                                    $set: {
                                        'aiMeta.qualityScore': q.overallScore || null,
                                        'aiMeta.qualityVerdict': q.verdict || null,
                                        'aiMeta.qualityIssues': q.issues || [],
                                        'aiMeta.qualitySummary': q.critiqueNotes || null,
                                        'aiMeta.processingStatus': 'ready',
                                    }
                                }
                            );
                            console.log(`🔎 [PostGenCritic] ${creative._id}: score=${q.overallScore}, verdict=${q.verdict}`);
                        }
                    } catch (criticErr) {
                        console.warn(`🔎 [PostGenCritic] Non-blocking error: ${criticErr.message}`);
                    }
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

// GET /api/creatives/proxy-download - Proxies an image to bypass browser CORS on download
router.get('/proxy-download', protect, async (req, res) => {
    try {
        const { url, filename } = req.query;
        if (!url) return res.status(400).json({ error: 'URL is required' });

        const response = await fetch(decodeURIComponent(url));
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${(filename || 'download.png').replace(/[^a-zA-Z0-9_.-]/g, '_')}"`);

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        res.send(buffer);
    } catch (e) {
        console.error('Proxy download error:', e.message);
        res.status(500).json({ error: 'Failed to proxy download' });
    }
});

// POST /api/creatives/ — Create a new generation job (Queue-based)
router.post('/', protect, requireCredits('creative'), async (req, res) => {
    return createCreativeJob(req, res);
});

// POST /api/creatives/jobs — Explicit job creation endpoint
router.post('/jobs', protect, requireCredits('creative'), async (req, res) => {
    return createCreativeJob(req, res);
});

// ── GET /api/creatives/jobs — List recent jobs for the current user ────────────
// Used on page load to reconnect to any in-progress or completed jobs.
router.get('/jobs', protect, async (req, res) => {
    try {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // last 24h

        // Simplified query to ensure it hits the index { user: 1, createdAt: -1 } efficiently
        // removed $slice: -5 temporarily to rule out environment-specific projection errors
        const jobs = await GenerationJob.find(
            { user: req.user._id, createdAt: { $gte: since } },
            {
                jobId: 1, status: 1, type: 1, format: 1, imageUrl: 1, errorMessage: 1,
                creativeId: 1, createdAt: 1, startedAt: 1, completedAt: 1, steps: 1
            }
        )
            .sort({ createdAt: -1 })
            .limit(20)
            .lean();

        // Sign S3 URLs before returning to frontend
        const signedJobs = await Promise.all(jobs.map(async job => ({
            ...job,
            imageUrl: await getSignedUrlIfNeeded(job.imageUrl),
            thumbnailUrl: await getSignedUrlIfNeeded(job.thumbnailUrl)
        })));

        res.json({ success: true, jobs: signedJobs });
    } catch (error) {
        console.error('❌ [API] GET /api/creatives/jobs error:', error.message);
        console.error('❌ Stack:', error.stack);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ── GET /api/creatives/jobs/:jobId — Poll a specific job ──────────────────────
router.get('/jobs/:jobId', protect, async (req, res) => {
    try {
        const job = await GenerationJob.findOne(
            { jobId: req.params.jobId, user: req.user._id },
            {
                jobId: 1, status: 1, type: 1, prompt: 1, format: 1, imageUrl: 1, errorMessage: 1,
                creativeId: 1, result: 1, warnings: 1, createdAt: 1, startedAt: 1, completedAt: 1, steps: 1
            }
        ).lean();
        if (!job) return res.status(404).json({ success: false, error: 'Job not found' });

        // Sign S3 URLs before returning to frontend (do each URL once)
        job.imageUrl = await getSignedUrlIfNeeded(job.imageUrl);
        if (job.result?.creative) {
            job.result.creative.imageUrl = await getSignedUrlIfNeeded(job.result.creative.imageUrl);
            job.result.creative.thumbnailUrl = await getSignedUrlIfNeeded(job.result.creative.thumbnailUrl);
        }

        res.json({ success: true, job });
        console.log(`[JOBS] Returned polling status for job ${req.params.jobId}`);
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
    // GPT Image 1 — OpenAI (opt-in, no ref image support)
    'gpt-image-1': {
        provider: 'openai',
        modelId: 'gpt-image-1',
        name: 'GPT Image 1',
        supportsRefImages: false,
        supportsTransparent: false,
    },
    // GPT Image 2 — OpenAI's latest (April 2026). Near-perfect text rendering,
    // transparent backgrounds, 2K output. Opt-in only — no ref image support.
    'gpt-image-2': {
        provider: 'openai',
        modelId: 'gpt-image-2',
        name: 'GPT Image 2',
        supportsRefImages: false,
        supportsTransparent: true,
        supportsTextRendering: true,
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
    console.log(`📝 Prompt (first 200 chars): ${(promptText || '').toString().substring(0, 200)}...`);

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

// ── OpenAI GPT-image-1 / GPT-image-2 generation + editing ─────────────────────
// Routes through LaoZhang proxy for gpt-image-2 (direct OpenAI requires org verification).
// When reference images are provided, uses /images/edits (multipart/form-data).
// Otherwise uses /images/generations (JSON body).
async function openaiImageGenerate(promptText, aspectRatio = '1:1', quality = 'medium', modelId = 'gpt-image-2', outputFormat = 'webp', background = 'opaque', refImageUrls = []) {
    // ── Choose API endpoint ──
    const forceLaoZhang = modelId === 'gpt-image-2' && process.env.LAOZHANG_API_KEY;
    const useLaoZhang = forceLaoZhang || process.env.OPENAI_USE_LZ === 'true';
    const apiKey = useLaoZhang
        ? (process.env.LAOZHANG_API_KEY)
        : (process.env.OPENAI_API_KEY);
    const baseUrl = useLaoZhang
        ? (process.env.LAOZHANG_BASE_URL || 'https://api.laozhang.ai/v1')
        : 'https://api.openai.com/v1';

    if (!apiKey) throw new Error(`OpenAI API key not configured (${useLaoZhang ? 'LAOZHANG_API_KEY' : 'OPENAI_API_KEY'})`);

    // ── Map aspect ratio → supported OpenAI image sizes ──
    const sizeMap = {
        '1:1':  '1024x1024',
        '4:5':  '1024x1024',
        '2:3':  '1024x1536',
        '9:16': '1024x1536',
        '3:4':  '1024x1536',
        '3:2':  '1536x1024',
        '16:9': '1536x1024',
        '4:3':  '1536x1024',
    };
    const imageSize = sizeMap[aspectRatio] || '1024x1024';
    const finalFormat = background === 'transparent' ? 'png' : outputFormat;

    // ── Download reference images if provided ──
    const validRefUrls = (refImageUrls || []).filter(u => u && u.startsWith('http'));
    let refBuffers = []; // Array of { buffer: Buffer, mimeType: string }
    if (validRefUrls.length > 0) {
        console.log(`📥 Downloading ${validRefUrls.length} reference images for OpenAI edit...`);
        const downloads = validRefUrls.slice(0, 16).map(async (url) => { // max 16 images
            try {
                const resp = await presignedFetch(url, { signal: AbortSignal.timeout(15000) });
                if (resp && resp.ok) {
                    const buf = Buffer.from(await resp.arrayBuffer());
                    const ct = resp.headers.get('content-type') || 'image/png';
                    console.log(`  ✅ Ref image loaded (${Math.round(buf.length / 1024)}KB): ${url.substring(0, 80)}...`);
                    return { buffer: buf, mimeType: ct };
                }
                console.warn(`  ⚠️ Ref image HTTP ${resp?.status}: ${url.substring(0, 80)}`);
            } catch (e) {
                console.warn(`  ⚠️ Ref image download failed: ${e.message}`);
            }
            return null;
        });
        refBuffers = (await Promise.all(downloads)).filter(Boolean);
        console.log(`📦 ${refBuffers.length}/${validRefUrls.length} reference images ready`);
    }

    const useEditsEndpoint = refBuffers.length > 0;
    const endpoint = useEditsEndpoint ? 'images/edits' : 'images/generations';

    console.log(`\n══════ OPENAI IMAGE ${useEditsEndpoint ? 'EDIT' : 'GENERATION'} (${modelId}) ══════`);
    console.log(`🎨 Model: ${modelId} | Quality: ${quality} | Size: ${imageSize} | Format: ${finalFormat}`);
    console.log(`🌐 Endpoint: ${baseUrl}/${endpoint} (${useLaoZhang ? 'LaoZhang proxy' : 'Direct OpenAI'})`);
    if (useEditsEndpoint) console.log(`🖼️  Reference images: ${refBuffers.length}`);
    console.log(`📝 Prompt (first 200 chars): ${(promptText || '').substring(0, 200)}...`);

    let response;

    if (useEditsEndpoint) {
        // ── MULTIPART/FORM-DATA path: /images/edits ──
        // Uses the 'form-data' package (imported at top) for multipart encoding
        const formData = new FormData();

        // Attach each reference image FIRST (best practice for multipart ordering)
        for (let i = 0; i < refBuffers.length; i++) {
            const ref = refBuffers[i];
            const ext = ref.mimeType.includes('png') ? 'png' : ref.mimeType.includes('webp') ? 'webp' : 'jpg';
            formData.append('image[]', ref.buffer, {
                filename: `ref_${i}.${ext}`,
                contentType: ref.mimeType,
            });
        }

        formData.append('model', modelId);
        formData.append('prompt', promptText);
        formData.append('n', '1');
        formData.append('size', imageSize);
        formData.append('quality', quality);

        // form-data produces a Node stream — convert to Buffer for native fetch
        const formBuffer = formData.getBuffer();
        const formHeaders = formData.getHeaders();

        response = await fetch(`${baseUrl}/${endpoint}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                ...formHeaders,
            },
            body: formBuffer,
            signal: AbortSignal.timeout(240000), // 4 min for edits (heavier)
        });
    } else {
        // ── JSON path: /images/generations (no ref images) ──
        const body = {
            model: modelId,
            prompt: promptText,
            n: 1,
            size: imageSize,
            quality,
            output_format: finalFormat,
            background,
        };
        if (finalFormat === 'webp' || finalFormat === 'jpeg') {
            body.output_compression = 85;
        }

        response = await fetch(`${baseUrl}/${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(180000),
        });
    }

    if (!response.ok) {
        const errText = await response.text();
        console.error(`❌ OpenAI Image (${modelId}) error (${response.status}):`, errText);
        if (response.status === 429) throw new Error(`BUSY: OpenAI rate limit hit. Please try again in a moment.`);
        if (response.status === 403) {
            const parsed = (() => { try { return JSON.parse(errText); } catch { return {}; } })();
            const msg = parsed?.error?.message || '';
            if (msg.includes('verified')) {
                throw new Error(`QUOTA_EXHAUSTED: OpenAI organization not verified for ${modelId}. Please verify at https://platform.openai.com/settings/organization/general`);
            }
            throw new Error(`BUSY: OpenAI access denied for ${modelId}: ${msg || errText.substring(0, 200)}`);
        }
        if (response.status === 402) throw new Error(`QUOTA_EXHAUSTED: OpenAI billing issue. Please check your account.`);
        if (response.status === 400) {
            const parsed = (() => { try { return JSON.parse(errText); } catch { return {}; } })();
            throw new Error(`OpenAI rejected the request: ${parsed?.error?.message || errText.substring(0, 200)}`);
        }
        throw new Error(`OpenAI Image generation failed (${response.status}): ${errText.substring(0, 200)}`);
    }

    const data = await response.json();
    const imageData = data.data?.[0];
    if (!imageData) throw new Error('OpenAI Image API returned no image data');

    let imageUrl;
    if (imageData.b64_json) {
        // LaoZhang proxy returns b64_json as a full data URI ("data:image/webp;base64,...")
        // instead of raw base64. Strip the prefix before decoding.
        let b64 = imageData.b64_json;
        if (b64.startsWith('data:')) {
            const commaIdx = b64.indexOf(',');
            if (commaIdx > -1) {
                console.log(`🔄 Stripping data URI prefix from b64_json: ${b64.substring(0, commaIdx + 1).substring(0, 60)}...`);
                b64 = b64.substring(commaIdx + 1);
            }
        }

        const rawBuf = Buffer.from(b64, 'base64');
        let mimeType = 'image/png';
        let outputBuf = rawBuf;

        // Check magic bytes
        if (rawBuf[0] === 0x89 && rawBuf[1] === 0x50) {
            mimeType = 'image/png';
        } else if (rawBuf[0] === 0xFF && rawBuf[1] === 0xD8) {
            mimeType = 'image/jpeg';
        } else if (rawBuf.length > 12 && rawBuf.toString('ascii', 8, 12) === 'WEBP') {
            console.log(`🔄 Converting webp → png for Sharp/Gemini compatibility`);
            try {
                const sharp = await getSharp();
                outputBuf = await sharp(rawBuf).png().toBuffer();
                mimeType = 'image/png';
            } catch (convErr) {
                console.warn(`⚠️ webp→png conversion failed (${convErr.message}), using raw webp`);
                mimeType = 'image/webp';
            }
        }

        imageUrl = `data:${mimeType};base64,${outputBuf.toString('base64')}`;
    } else if (imageData.url) {
        imageUrl = imageData.url;
    } else {
        throw new Error('OpenAI Image API: no image in response');
    }

    const revisedPrompt = imageData.revised_prompt || '';
    if (revisedPrompt) console.log(`📝 OpenAI revised prompt: ${revisedPrompt.substring(0, 120)}...`);
    console.log(`✅ OpenAI Image ${useEditsEndpoint ? 'edited' : 'generated'} successfully via ${modelId}${refBuffers.length > 0 ? ` (${refBuffers.length} ref images)` : ''}`);
    console.log(`══════ END OPENAI IMAGE ${useEditsEndpoint ? 'EDIT' : 'GENERATION'} ══════\n`);

    return {
        imageUrl,
        model: modelId,
        provider: 'openai',
        textResponse: revisedPrompt,
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
        // Logic removed: keepAliveAgent was not defined in this scope.

        const resp = await fetch(url, fetchOptions);

        const data = await resp.json();
        if (data.error) {
            const errMsg = data.error?.message || JSON.stringify(data.error);
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

// ── Unified Image Generate — routes by selectedModel, NO auto-fallbacks ──
// NanoBanana 2 is the default. Other models are strictly opt-in.
// If any model is busy/unavailable, returns a clear error — no silent model switching.
async function routedImageGenerate(promptText, imageParts = [], temperature = 0.4, aspectRatio = '1:1', imageSize = '1K', selectedModel = 'nanobanana-2', refImageUrls = [], customSize = null) {
    const GEMINI_MODEL = 'gemini-3.1-flash-image-preview';
    const router = getRouter();
    const modelKey = selectedModel; // normalize: selectedModel IS the routing key
    console.log(`🎯 Image Generation: model=${modelKey}`);
    if (customSize) console.log(`📐 Custom Size: ${customSize.width}x${customSize.height}`);

    // ── Route: Grok Imagen (xAI direct) ─────────────────────────────────────
    if (modelKey === 'grok-imagen') {
        const TIMEOUT_MS = 120_000;
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Grok Imagen timed out. Please try again.')), TIMEOUT_MS)
        );
        try {
            const result = await Promise.race([
                grokImageGenerate(promptText, aspectRatio),
                timeoutPromise,
            ]);
            return { ...result, model: selectedModel };
        } catch (error) {
            console.error(`❌ Grok Imagen failed:`, error.message);
            return {
                imageUrl: null, model: selectedModel, textResponse: '', warnings: [],
                modelBusy: true, busyModel: 'grok-imagen',
                errorMessage: error.message || 'Grok Imagen is unavailable. Please try again.',
                errorType: error.message?.startsWith('BUSY') ? 'busy' : 'error',
            };
        }
    }

    // ── Route: OpenAI GPT-image-1 / GPT-image-2 ─────────────────────────────
    // Supports reference images via /images/edits (multipart/form-data).
    // Without ref images, uses /images/generations (JSON body).
    if (modelKey === 'gpt-image-1' || modelKey === 'gpt-image-2') {
        const TIMEOUT_MS = 300_000; // 5 minutes (LaoZhang proxy adds latency)
        const hasRefImages = (refImageUrls || []).filter(u => u && u.startsWith('http')).length > 0;
        if (hasRefImages) {
            console.log(`🖼️ [${modelKey}] ${refImageUrls.length} reference images detected — using /images/edits endpoint`);
        }
        const quality = modelKey === 'gpt-image-2' ? 'high' : 'medium';

        // Attempt with one retry on timeout
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error(`TIMEOUT`)), TIMEOUT_MS)
                );
                const result = await Promise.race([
                    openaiImageGenerate(promptText, aspectRatio, quality, modelKey, 'png', 'opaque', refImageUrls),
                    timeoutPromise,
                ]);
                return { ...result, model: selectedModel };
            } catch (error) {
                if (error.message === 'TIMEOUT' && attempt === 1) {
                    console.warn(`⏱️ ${modelKey} timed out (attempt 1/2) — retrying...`);
                    continue;
                }
                const errMsg = error.message === 'TIMEOUT'
                    ? `${modelKey} timed out after ${Math.round(TIMEOUT_MS/1000)}s. The image was too complex — try a simpler prompt or try again.`
                    : error.message;
                console.error(`❌ ${modelKey} failed (attempt ${attempt}):`, errMsg);
                return {
                    imageUrl: null, model: selectedModel, textResponse: '', warnings: [],
                    modelBusy: true, busyModel: modelKey,
                    errorMessage: errMsg,
                    errorType: error.message?.startsWith('BUSY') || error.message?.startsWith('QUOTA') ? 'busy' : 'error',
                };
            }
        }
    }

    // ── HARD TIMEOUT: 90 seconds max (reduced from 180s — if Gemini hasn't finished in 90s, it won't) ──
    const TIMEOUT_MS = 90_000;
    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Image generation timed out after 90 seconds. Please try again.')), TIMEOUT_MS)
    );

    const generatePromise = (async () => {
        // ── Determine aspect ratio for Gemini ──
        let nativeAspectRatio = aspectRatio;

        if (customSize && customSize.width && customSize.height) {
            const w = parseInt(customSize.width, 10);
            const h = parseInt(customSize.height, 10);
            const ratio = w / h;
            const nativeRatios = [
                { str: "1:1", val: 1 / 1 }, { str: "1:4", val: 1 / 4 }, { str: "1:8", val: 1 / 8 },
                { str: "2:3", val: 2 / 3 }, { str: "3:2", val: 3 / 2 }, { str: "3:4", val: 3 / 4 },
                { str: "4:1", val: 4 / 1 }, { str: "4:3", val: 4 / 3 }, { str: "4:5", val: 4 / 5 },
                { str: "5:4", val: 5 / 4 }, { str: "8:1", val: 8 / 1 }, { str: "9:16", val: 9 / 16 },
                { str: "16:9", val: 16 / 9 }, { str: "21:9", val: 21 / 9 }
            ];
            let closestRatio = nativeRatios[0];
            let minDiff = Math.abs(ratio - closestRatio.val);
            for (let i = 1; i < nativeRatios.length; i++) {
                const diff = Math.abs(ratio - nativeRatios[i].val);
                if (diff < minDiff) { minDiff = diff; closestRatio = nativeRatios[i]; }
            }
            nativeAspectRatio = closestRatio.str;
            console.log(`📐 Custom ${w}x${h} → Gemini native ratio '${nativeAspectRatio}'`);
        }

        // ── Download reference images as inline buffers for Gemini SDK ──
        let finalImageParts = imageParts || [];
        const lzRefUrls = (refImageUrls || []).filter(u => u && u.startsWith('http'));

        if (finalImageParts.length === 0 && lzRefUrls.length > 0) {
            // ⚡ PERF: Download ALL reference images in parallel (was sequential — saved 10-25s)
            console.log(`📥 Downloading ${lzRefUrls.length} reference images for Gemini in parallel...`);
            const refDownloads = lzRefUrls.map(async (url) => {
                try {
                    const cached = getCachedImageBuffer(url);
                    if (cached) {
                        console.log(`⚡ Cache HIT for image reference generation: ${url.substring(0, 80)}...`);
                        return { inlineData: { mimeType: cached.mimeType, data: cached.buffer } };
                    }
                    
                    const resp = await presignedFetch(url, { signal: AbortSignal.timeout(15000) }); // 15s timeout (was 35s)
                    if (resp && resp.ok) {
                        const buf = await resp.arrayBuffer();
                        const ct = resp.headers.get('content-type') || 'image/jpeg';
                        console.log(`✅ Loaded ref image (${Math.round(buf.byteLength / 1024)}KB)`);
                        
                        const b64Data = Buffer.from(buf).toString('base64');
                        setCachedImageBuffer(url, b64Data, ct);
                        
                        return { inlineData: { mimeType: ct, data: b64Data } };
                    } else {
                        console.warn(`⚠️ Ref image fetch returned HTTP ${resp?.status} — skipping`);
                    }
                } catch (e) {
                    console.warn(`⚠️ Could not load ref image: ${e.message}`);
                }
                return null;
            });
            const downloadedParts = (await Promise.all(refDownloads)).filter(Boolean);
            finalImageParts.push(...downloadedParts);
        }

        // ── Generate via native Gemini router ──
        console.log(`🚀 Generating image via native ${GEMINI_MODEL}...`);
        const routerResult = await router.generateImage({
            prompt: promptText,
            aspectRatio: nativeAspectRatio,
            model: GEMINI_MODEL,
            imageParts: finalImageParts,
            size: imageSize
        }, {
            provider: 'gemini'
        });

        return {
            imageUrl: routerResult.imageUrl,
            model: selectedModel,
            provider: 'gemini',
            textResponse: '',
            warnings: [],
        };
    })();

    try {
        return await Promise.race([generatePromise, timeoutPromise]);
    } catch (error) {
        console.error(`❌ Image generation failed (${GEMINI_MODEL}):`, error.message);

        // All failures → single clear message: Gemini is busy
        return {
            imageUrl: null,
            model: selectedModel,
            textResponse: '',
            warnings: [],
            modelBusy: true,
            busyModel: GEMINI_MODEL,
            errorMessage: 'Gemini is busy, please try again later.',
            errorType: 'busy',
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
        const { agentUtils } = await import('../agents/shared/agentUtils.js');
        const Brand = (await import('../models/Brand.js')).default;
        const brand = brandId ? await Brand.findById(brandId).lean() : null;
        const products = brand?._id ? (await (await import('../models/Product.js')).default.find({ brand: brand._id }).limit(5).lean()) : [];
        const brandContext = brand ? agentUtils.buildBrandContext(brand, products) : '<brand_bible>No brand data. Use professional style.</brand_bible>';

        // Import and call copywriter with the brief directly
        const { COPYWRITER_PROMPT } = await import('../agents/creativeStudio/prompts.js');
        // agentUtils imported above

        const formatLabel = format || 'instagram-post';

        const userPrompt = [
            `CREATIVE BRIEF: ${brief.trim()}`,
            `FORMAT: ${formatLabel}`,
            `TASK: Based on this brief, generate short visual copy that will be printed ON the image.`,
            `Write a headline (2-6 words max), optional subtext (1 line max 8 words), and optional CTA button text (2-4 words).`,
            `Match the tone, energy, and style of the brief. Think: what would a top creative director write on this ad's typography?`,
        ].join('\n');

        const result = await agentUtils.callAgent(COPYWRITER_PROMPT(brandContext), userPrompt, 0.7, 1024);

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
// POST /api/creatives/enhance-prompt — Full Agentic Prompt Enhancement
// Uses the SAME 6-agent pipeline as generation (fast mode):
//   brandIntelligenceNode → fastCreativeDirectorNode (with 2025 frameworks)
// Returns the fully engineered 100-180 word image prompt + art direction notes.
// This differentiates Mantram from competitors who do basic text expansion.
// ══════════════════════════════════════════════════════════════════════════════
router.post('/enhance-prompt', protect, requireCredits('promptEnhance'), async (req, res) => {
    try {
        const { brandId, prompt, style, format, referenceDescriptions, aspectRatio, imageModel } = req.body;
        if (!prompt) return res.status(400).json({ success: false, error: 'Prompt is required' });
        if (!brandId) return res.status(400).json({ success: false, error: 'Brand ID is required for enhancement' });

        console.log(`✨ [EnhancePrompt] Running full agentic pipeline for brief: "${prompt.substring(0, 60)}..." → format: ${format}, model: ${imageModel || 'nanobanana-2'}`);

        // Import the full agentic pipeline runner
        const { runCreativePipeline } = await import('../agents/creativeStudio/nodes.js');

        // Run pipeline in FAST mode — Brand Intel + Visual Grounding + Fast Creative Director
        // This is the same pipeline used during image generation, just without the image generation step
        const pipelineResult = await runCreativePipeline({
            brandId,
            brief: prompt.trim(),
            format: format || 'instagram-post',
            aspectRatio: aspectRatio || '1:1',
            style: style || '',
            imageModel: imageModel || 'nanobanana-2',
            mode: 'fast',        // uses fastCreativeDirectorNode (Art Director + Prompt Engineer in 1 call)
            generateCopy: false, // no copy during enhancement
        });

        const enhancedPrompt = pipelineResult.finalPrompt || pipelineResult.engineeredPrompt?.primaryPrompt || prompt;

        // Sanity check — if pipeline returned something too short or failed, fall back gracefully
        if (!enhancedPrompt || enhancedPrompt.length < 20) {
            console.warn(`✨ [EnhancePrompt] Pipeline returned short result (${enhancedPrompt?.length || 0} chars) — using raw brief`);
            return res.json({ success: true, enhancedPrompt: prompt, agenticEnhanced: false });
        }

        // Clean up any pipeline-injected metadata headers (VISUAL GROUNDING sections etc.) for display
        let cleanPrompt = enhancedPrompt;
        // Strip visual grounding injection block if it appears (it's for the model, not for display)
        const groundingIdx = cleanPrompt.indexOf('\nVISUAL GROUNDING (from real product/brand photos):');
        if (groundingIdx !== -1) {
            cleanPrompt = cleanPrompt.substring(0, groundingIdx).trim();
        }

        console.log(`✨ [EnhancePrompt] Done in ${pipelineResult.pipelineTimeMs}ms — enhanced from ${prompt.length} to ${cleanPrompt.length} chars`);
        console.log(`✨ [EnhancePrompt] Design trend: ${pipelineResult.artDirection?.designTrend || pipelineResult.engineeredPrompt?.engineeringNotes?.substring(0, 60) || 'N/A'}`);

        res.json({
            success: true,
            enhancedPrompt: cleanPrompt,
            agenticEnhanced: true,
            // Surface the creative intelligence to the UI
            designTrend: pipelineResult.artDirection?.designTrend || null,
            mood: pipelineResult.artDirection?.mood || null,
            productMatched: pipelineResult.matchedProduct?.title || null,
            engineeringNotes: pipelineResult.engineeredPrompt?.engineeringNotes || null,
            pipelineTimeMs: pipelineResult.pipelineTimeMs,
        });
    } catch (error) {
        console.error('✨ [EnhancePrompt] Error:', error);
        // Graceful degradation — if the full pipeline fails, return original prompt
        res.json({ success: true, enhancedPrompt: req.body.prompt, agenticEnhanced: false, error: error.message });
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
                    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
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

// GET /api/creatives
router.get('/', protect, async (req, res) => {
    try {
        const { brandId, type, limit = 20, page = 1 } = req.query;
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
                filter.brand = brandId;
            } else {
                filter.user = req.user._id;
            }
        }

        if (type) filter.type = type;

        const creatives = await Creative.find(filter)
            .select('-designData')
            .sort('-createdAt')
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit))
            .populate('brand', 'name')
            .lean();

        const total = await Creative.countDocuments(filter);

        // Sign S3 URLs before returning to frontend
        const signedCreatives = await Promise.all(creatives.map(async c => ({
            ...c,
            imageUrl: await getSignedUrlIfNeeded(c.imageUrl),
            thumbnailUrl: await getSignedUrlIfNeeded(c.thumbnailUrl)
        })));

        res.json({ success: true, creatives: signedCreatives, total });
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
            title: title || (prompt || '').toString().substring(0, 80) || 'AI Generated Image',
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

        // Sign S3 URLs before returning to frontend
        const signedImages = await Promise.all(images.map(async img => ({
            ...img,
            imageUrl: await getSignedUrlIfNeeded(img.imageUrl),
            thumbnailUrl: await getSignedUrlIfNeeded(img.thumbnailUrl)
        })));

        res.json({ success: true, images: signedImages, total, counts: { uploaded: uploadedCount, generated: generatedCount, all: uploadedCount + generatedCount } });
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

            console.log(`👗 Submitting to fal.ai: ${endpoint} with human_image: ${personUrl.substring(0, 60)}...`);
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
                    imageUrl = await getSignedUrlIfNeeded(imageUrl);
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
// POST /api/creatives/edit-image — AI Image Editing powered by Gemini Nano Banana 2
// Supports: style transfer, bg change, object add/remove, color grading, text edits
// Multi-turn: pass editHistory[] for iterative refinement with conversation context
// ══════════════════════════════════════════════════════════════════════════════
router.post('/edit-image', protect, requireCredits('creative'), async (req, res) => {
    try {
        const { imageUrl, editPrompt, editHistory = [], brandId, maskBase64, editMode } = req.body;
        if (!imageUrl) return res.status(400).json({ success: false, error: 'imageUrl is required' });
        if (!editPrompt) return res.status(400).json({ success: false, error: 'editPrompt is required' });

        const imageKey = process.env.GEMINI_IMAGE_API_KEY || process.env.GEMINI_API_KEY;
        if (!imageKey) return res.status(500).json({ success: false, error: 'GEMINI_API_KEY not configured' });

        console.log(`\n🎨 ════ IMAGE EDIT REQUEST ════`);
        console.log(`📝 Prompt: ${editPrompt}`);
        console.log(`🖼️ Source: ${imageUrl.substring(0, 80)}...`);
        console.log(`📜 History turns: ${editHistory.length}`);

        // ── Fetch the source image → base64 ──
        let sourceBase64, sourceMime;
        if (imageUrl.startsWith('data:')) {
            const match = imageUrl.match(/^data:([\w/+]+);base64,(.+)$/);
            if (match) { sourceMime = match[1]; sourceBase64 = match[2]; }
        } else {
            try {
                // 20s timeout on the source image fetch — signed S3 URLs can be slow
                const imgResp = await fetch(imageUrl, { signal: AbortSignal.timeout(20_000) });
                if (!imgResp.ok) throw new Error(`HTTP ${imgResp.status}`);
                const buf = await imgResp.arrayBuffer();
                sourceBase64 = Buffer.from(buf).toString('base64');
                sourceMime = imgResp.headers.get('content-type') || 'image/jpeg';
                console.log(`✅ Source image fetched: ${Math.round(buf.byteLength / 1024)}KB (${sourceMime})`);
            } catch (fetchErr) {
                console.error('❌ Failed to fetch source image:', fetchErr.message);
                return res.status(400).json({ success: false, error: 'Could not fetch the source image. It may have expired — try regenerating the image first.' });
            }
        }

        if (!sourceBase64) return res.status(400).json({ success: false, error: 'Could not process image data' });

        // ── Build Gemini multi-turn conversation ──
        const baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
        const modelId = 'gemini-3.1-flash-image-preview';
        const url = `${baseUrl}/models/${modelId}:generateContent?key=${imageKey}`;

        // Build contents array for multi-turn editing
        const contents = [];

        // If we have edit history, reconstruct the conversation
        if (editHistory.length > 0) {
            for (const turn of editHistory) {
                // User turn: image + prompt
                const userParts = [];
                if (turn.imageUrl) {
                    try {
                        let turnBase64, turnMime;
                        if (turn.imageUrl.startsWith('data:')) {
                            const m = turn.imageUrl.match(/^data:([\w/+]+);base64,(.+)$/);
                            if (m) { turnMime = m[1]; turnBase64 = m[2]; }
                        } else {
                            const r = await fetch(turn.imageUrl);
                            if (r.ok) {
                                const b = await r.arrayBuffer();
                                turnBase64 = Buffer.from(b).toString('base64');
                                turnMime = r.headers.get('content-type') || 'image/jpeg';
                            }
                        }
                        if (turnBase64) {
                            userParts.push({ inlineData: { mimeType: turnMime, data: turnBase64 } });
                        }
                    } catch (e) {
                        console.warn('⚠️ Skipping history image fetch:', e.message);
                    }
                }
                if (turn.prompt) userParts.push({ text: turn.prompt });
                if (userParts.length > 0) {
                    contents.push({ role: 'user', parts: userParts });
                }

                // Model turn: the result image (if available)
                if (turn.resultImageUrl) {
                    try {
                        let resMime, resBase64;
                        if (turn.resultImageUrl.startsWith('data:')) {
                            const m = turn.resultImageUrl.match(/^data:([\w/+]+);base64,(.+)$/);
                            if (m) { resMime = m[1]; resBase64 = m[2]; }
                        } else {
                            const r = await fetch(turn.resultImageUrl);
                            if (r.ok) {
                                const b = await r.arrayBuffer();
                                resBase64 = Buffer.from(b).toString('base64');
                                resMime = r.headers.get('content-type') || 'image/jpeg';
                            }
                        }
                        if (resBase64) {
                            contents.push({ role: 'model', parts: [{ inlineData: { mimeType: resMime, data: resBase64 } }] });
                        }
                    } catch (e) {
                        console.warn('⚠️ Skipping history result image fetch:', e.message);
                    }
                }
            }
        }

        // Current turn: source image + edit prompt
        const currentParts = [
            { inlineData: { mimeType: sourceMime, data: sourceBase64 } }
        ];

        let instructions = `You are an elite AI image editor. Edit this image precisely as instructed. CRITICAL RULES:\n1. Apply ONLY the requested change — do not alter any other aspect of the image\n2. Maintain the exact same resolution, lighting quality, and color temperature for unaffected areas\n3. Ensure the edit blends seamlessly with the rest of the image\n4. The result must look professionally retouched, not AI-generated\n\n`;

        if (maskBase64) {
            let pureMask = maskBase64;
            let maskMime = 'image/png';
            if (maskBase64.startsWith('data:')) {
                const match = maskBase64.match(/^data:([\w/+]+);base64,(.+)$/);
                if (match) { maskMime = match[1]; pureMask = match[2]; }
            }
            currentParts.push({ inlineData: { mimeType: maskMime, data: pureMask } });
            instructions += `[MASK PROVIDED] The second image provided is a black-and-white mask. Use this mask to strictly isolate the edit to the painted area (white) while leaving the rest of the image (black) completely untouched.\n`;
        }

        instructions += `EDIT INSTRUCTION: ${editPrompt}\n\nOutput the complete modified image.`;
        currentParts.push({ text: instructions });

        contents.push({ role: 'user', parts: currentParts });

        // ── Call Gemini — independent timeout NOT tied to HTTP request lifecycle ──
        // Using Promise.race instead of AbortController so that if the frontend
        // times out and closes the connection, the Gemini call keeps running
        // and completes. The response is then saved to S3 regardless.
        const editStart = Date.now();
        console.log(`🤖 Calling Gemini ${modelId} for image edit...`);

        const geminiCall = fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents,
                generationConfig: {
                    responseModalities: ['TEXT', 'IMAGE'],
                    temperature: 0.4,
                },
            }),
            // NO signal — this call is fire-and-forget relative to the HTTP request
        }).then(r => r.json());

        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Gemini image edit timed out after 170 seconds')), 170_000)
        );

        let data;
        try {
            data = await Promise.race([geminiCall, timeoutPromise]);
        } catch (geminiErr) {
            console.error('❌ Gemini call failed or timed out:', geminiErr.message);
            throw new Error(`Image editing failed: ${geminiErr.message}`);
        }
        console.log(`⏱️ Gemini edit completed in ${Date.now() - editStart}ms`);

        if (data.error) {
            console.error('❌ Gemini Edit Error:', data.error.message);
            throw new Error(`Image editing failed: ${data.error.message}`);
        }

        // Extract the edited image
        const resParts = data.candidates?.[0]?.content?.parts || [];
        let editedImageUrl = null;
        let editDescription = '';

        for (const part of resParts) {
            if (part.inlineData?.mimeType?.startsWith('image/') && !part.thought) {
                editedImageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
            if (part.text && !part.thought) {
                editDescription += part.text;
            }
        }

        if (!editedImageUrl) {
            console.error('❌ Gemini returned no image. Parts:', resParts.map(p => ({ hasImage: !!p.inlineData, hasText: !!p.text, thought: !!p.thought })));
            return res.status(500).json({ success: false, error: 'Image editing failed — the AI did not return an edited image. Try a different edit instruction.' });
        }

        // ── Upload to S3 ──
        let s3Url = null;
        try {
            const s3Key = `edits/${req.user._id}/${Date.now()}_edit.png`;
            s3Url = await uploadToS3(editedImageUrl, s3Key, 'image/png');
        } catch (e) {
            console.warn('⚠️ S3 upload failed for edit, returning base64:', e.message);
        }

        // Sign the S3 URL so the browser can actually load it (bucket has no public access)
        const finalUrl = s3Url ? await getSignedUrlIfNeeded(s3Url) : editedImageUrl;
        console.log(`✅ Image edit complete → ${s3Url ? 'S3 (signed)' : 'base64'} (${editPrompt.substring(0, 50)}...)`);

        res.json({
            success: true,
            imageUrl: finalUrl,
            editDescription: editDescription || editPrompt,
            model: 'Nano Banana 2',
            provider: 'gemini',
            source: s3Url ? 's3' : 'base64',
        });

    } catch (error) {
        console.error('❌ Image edit error:', error.message);
        if (req.creditsDeducted) {
            await refundCredits(req.user._id, req.creditsDeducted, 'creative', `Refund: Image edit failed (${safeErrorMessage(error)})`, 'creative');
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
            const sharp = await getSharp();
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
            imageUrl: await getSignedUrlIfNeeded(upscaledUrl),
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
// POST /api/creatives/campaign-shot — 1-Click Cinematic Campaign Poster
// Premium product poster generator with art direction + copywriting AI
// Formula: Cinematic moody [category] ad + mood_preset + brand typography
// ══════════════════════════════════════════════════════════════════════════════
router.post('/campaign-shot', protect, requireStudio('creativeStudio'), requireCredits('creative'), async (req, res) => {
    try {
        const {
            brandId,
            productImage,     // Uploaded product image (required)
            refImage,         // Optional style reference image
            characterImage,   // Optional character/model image
            productName,      // Optional override for product name
            brief,            // Optional user brief / custom direction
            moodPreset,       // dark-botanical | aqua-mist | charcoal-industrial | warm-glow | luxury-noir | custom
            aspectRatio = '1:1',
            imageModel = 'nanobanana-2',
            primaryTagline,   // Optional override tagline 1
            secondaryTagline, // Optional override tagline 2
            generateCopy = false, // When true: generate cinematic ad copy alongside the image
            variationIndex = 0,   // 0=Hero Shot | 1=Lifestyle | 2=Detail — drives distinct creative direction
        } = req.body;

        if (!productImage) {
            return res.status(400).json({ success: false, error: 'Product image is required' });
        }

        console.log(`\n██████ CAMPAIGN SHOT ██████`);
        console.log(`   Brand: ${brandId || 'none'} | Model: ${imageModel} | Mood: ${moodPreset || 'auto'}`);
        console.log(`   Product: ${productName || '(auto-detect)'} | Brief: ${(brief || '').substring(0, 60)}`);

        // ── Step 1: Load Brand DNA ──
        let brand = null;
        let brandName = 'Brand';
        let brandCategory = 'product';
        let brandColors = [];
        let brandFont = 'modern sans-serif';
        let brandTagline = '';
        let brandDescription = '';

        if (brandId) {
            brand = await Brand.findById(brandId).lean();
            if (brand) {
                brandName = brand.name || 'Brand';
                brandCategory = brand.dna?.industry || 'FMCG';
                brandColors = (brand.dna?.colors || []).slice(0, 4);
                brandFont = brand.dna?.fonts?.heading?.family || brand.dna?.fonts?.body?.family || 'modern sans-serif';
                brandTagline = brand.dna?.tagline || brand.dna?.voice?.sampleQuote || '';
                brandDescription = brand.dna?.brandDescription || '';
            }
        }

        // ── Step 2: AI Art Director — Build the campaign shot prompt ──
        // This is the "Creative Director" brain that uses the formula
        const MOOD_PRESETS = {
            'dark-botanical': {
                env: 'dark botanical setting, deep green leaves fading into shadow, subtle mist, rich foliage',
                lighting: 'low-key cinematic, soft top light with green rim highlights, deep shadows',
                surface: 'dark wet stone with subtle reflections',
                palette: 'deep green, black, emerald',
            },
            'aqua-mist': {
                env: 'dark aqua atmosphere, floating water droplets, light mist, deep underwater mood',
                lighting: 'cold cinematic, blue rim highlights, deep contrast, iceberg tones',
                surface: 'reflective wet base, glossy dark blue',
                palette: 'deep blue, cyan, black, aqua',
            },
            'charcoal-industrial': {
                env: 'deep black charcoal setting, minimal industrial haze, raw texture background',
                lighting: 'sharp directional light, strong highlights on product edges, deep dramatic shadows',
                surface: 'matte black with subtle brushed metal reflection',
                palette: 'black, dark grey, deep charcoal blue',
            },
            'warm-glow': {
                env: 'dark backdrop with soft warm amber/orange glow diffusion, bokeh light orbs',
                lighting: 'soft warm cinematic highlights, candle-warm tones, gentle rim light',
                surface: 'glossy dark base with warm golden reflection',
                palette: 'black, warm orange, gold, cream white',
            },
            'luxury-noir': {
                env: 'deep noir atmosphere, soft studio smoke, ultra-dark background with controlled light spill',
                lighting: 'high-fashion editorial: single hard key light + soft fill, strong shadows with detail',
                surface: 'black marble or lacquered obsidian surface, mirror reflection',
                palette: 'black, silver, deep navy, platinum',
            },
            'custom': {
                env: brief || 'premium product setting, cinematic atmosphere',
                lighting: 'cinematic, professional studio',
                surface: 'premium dark surface',
                palette: brandColors.map(c => c.name || c.hex || 'brand color').join(', ') || 'brand palette',
            },
        };

        const mood = MOOD_PRESETS[moodPreset] || MOOD_PRESETS['dark-botanical'];

        // Auto-detect color palette from brand if not custom
        const paletteStr = moodPreset !== 'custom' && brandColors.length > 0
            ? `${mood.palette}, accented by ${brandColors.slice(0, 2).map(c => c.name || c.hex).join(', ')}`
            : mood.palette;

        // ── AI Agent: Extract product identity + generate taglines ──
        let detectedProductName = productName || '';
        let tagline1 = primaryTagline || '';
        let tagline2 = secondaryTagline || '';
        let detectedCategory = brandCategory;

        try {
            const aiRouter = getRouter();
            const agentPrompt = `You are a world-class Creative Director and Copywriter for premium brand advertising.

Brand: ${brandName}
Industry/Category: ${brandCategory}
Brand Description: ${brandDescription}
Brand Tagline: ${brandTagline}
Product Name (if known): ${detectedProductName || 'detect from context'}
User Brief: ${brief || 'cinematic product poster, brand campaign'}

Your task: Generate the PERFECT art direction elements for a cinematic product advertisement poster.

Return ONLY valid JSON:
{
  "productName": "detected or refined product name (e.g. 'Neem Face Wash')",
  "category": "product category in CAPS (e.g. 'FMCG', 'SKINCARE', 'BEVERAGE', 'ELECTRONICS')",
  "tagline1": "primary brand tagline (4-6 words max, powerful, e.g. 'PURE HERBAL CARE')",
  "tagline2": "secondary descriptive line (3-5 words, e.g. 'Neem Powered Clean')",
  "perspectiveTypo": "single brand word for large perspective typography (usually brand name in CAPS)",
  "productDescription": "one sentence description of the product for prompt context (for the AI image model)",
  "arrangementNote": "how to arrange the products: upright + open/angled for maximum visual impact"
}`;

            const aiResult = await aiRouter.generateText({
                systemPrompt: 'You are a creative director. Output valid JSON only. No markdown, no explanation.',
                userPrompt: agentPrompt,
                temperature: 0.5,
                maxTokens: 512,
            });

            const aiText = (aiResult.text || '').replace(/```json|```/gi, '').trim();
            const jsonMatch = aiText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                detectedProductName = parsed.productName || detectedProductName || brandName;
                tagline1 = primaryTagline || parsed.tagline1 || brandTagline || 'PREMIUM QUALITY';
                tagline2 = secondaryTagline || parsed.tagline2 || '';
                detectedCategory = parsed.category || brandCategory;
                console.log(`   🎯 AI Art Director: ${detectedProductName} | ${tagline1} | ${tagline2}`);
            }
        } catch (agentErr) {
            console.warn('⚠️ Campaign Shot AI agent failed, using fallbacks:', agentErr.message);
            detectedProductName = productName || brandName;
            tagline1 = primaryTagline || brandTagline || 'PREMIUM QUALITY';
            tagline2 = secondaryTagline || 'Crafted for Excellence';
        }

        // ── Variation Profiles: each index produces a distinct creative direction ──
        const VARIATION_PROFILES = [
            {
                label: 'Hero Shot',
                arrangementOverride: `HERO SHOT: single product upright, centred, occupying 60-70% of frame. Bold, iconic composition — pure product confidence. No clutter. Strong rim light sculpting every edge.`,
                compositionNote: `Composition: centred, monumental, symmetrical. Think Chanel No.5 campaign.`,
                tempOverride: 0.25, // Lower = more faithful/crisp
                copyVoice: 'Bold. Declarative. One strong statement.',
            },
            {
                label: 'Lifestyle',
                arrangementOverride: `LIFESTYLE COMPOSITION: product placed slightly off-centre, integrated into its environment — surrounded by botanical/atmospheric scene elements that reinforce the mood. Feel lived-in and aspirational, not sterile.`,
                compositionNote: `Composition: rule-of-thirds, environmental context, storytelling. Think Aesop or Diptyque editorial.`,
                tempOverride: 0.45,
                copyVoice: 'Evocative. Poetic. Sensory language. Short lines.',
            },
            {
                label: 'Detail Close-up',
                arrangementOverride: `DETAIL CLOSE-UP: extreme macro focus on the product's most distinctive feature — texture, label typography, cap/nozzle, ingredients visible, material quality. Fill the frame. Make the craft impossible to ignore.`,
                compositionNote: `Composition: tight crop, shallow DOF blur, cinematic vignette. Think luxury fragrance macro editorial.`,
                tempOverride: 0.35,
                copyVoice: 'Precise. Ingredient-led. Craftsmanship language.',
            },
        ];
        const variation = VARIATION_PROFILES[variationIndex] || VARIATION_PROFILES[0];
        console.log(`   🎨 Variation ${variationIndex}: ${variation.label}`);


        const canvasSize = aspectRatio === '1:1' ? '1:1 square format'
            : aspectRatio === '9:16' ? '9:16 portrait, story format'
            : aspectRatio === '16:9' ? '16:9 cinematic widescreen'
            : aspectRatio === '4:5' ? '4:5 social portrait'
            : aspectRatio === '2:3' ? '2:3 portrait poster'
            : `${aspectRatio} format`;

        const hasCharacter = !!characterImage;
        const hasRef = !!refImage;

        const masterPrompt = `Cinematic moody ${detectedCategory} advertisement — ${brandName} ${detectedProductName}

PRODUCT ARRANGEMENT: ${hasCharacter ? `Premium product displayed alongside a person/model. Keep the character authentic and aspirational.` : variation.arrangementOverride} Show all products clearly with their labels and branding fully visible.

${variation.compositionNote}

BRANDING (top center): ${brandName} logo area, product name "${detectedProductName}" in clean brand typography${brandFont !== 'modern sans-serif' ? `, using ${brandFont} font family` : ''}

ENVIRONMENT: ${mood.env}

LIGHTING: ${mood.lighting}

PERSPECTIVE TYPOGRAPHY (PRIMARY): large semi-transparent "${brandName.toUpperCase()}" text extending deep into the background, softly diffused and interacting with the environment, creating dimensional depth

SECONDARY TYPOGRAPHY (clean brand font):
"${tagline1}"
"${tagline2}"

SURFACE: ${mood.surface}

COLOR PALETTE: ${paletteStr}

TECHNICAL: ultra-realistic, premium commercial advertising finish, razor-sharp product detail, ${canvasSize}
STYLE: magazine-grade product photography, Cannes Lions advertising quality, cinematic color grade
OUTPUT: full bleed, edge-to-edge composition, no borders, no watermarks, no frames

${brief ? `CREATIVE BRIEF: ${brief}` : ''}
${hasRef ? 'STYLE REFERENCE: Match the mood, color palette, and cinematic feel of the provided reference image while keeping the product as the hero.' : ''}`;

        console.log(`   📝 Campaign prompt [${variation.label}]: ${masterPrompt.substring(0, 120)}...`);

        // ── Step 4: Prepare image parts ──
        const imageParts = [];

        // Helper to fetch URL → base64 imagePart
        async function urlToImagePart(url) {
            if (!url) return null;
            try {
                if (url.startsWith('data:image/')) {
                    return { inlineData: extractBase64(url) };
                }
                const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(10000) });
                if (!resp.ok) return null;
                const buf = await resp.arrayBuffer();
                const ct = (resp.headers.get('content-type') || 'image/jpeg').split(';')[0];
                return { inlineData: { mimeType: ct, data: Buffer.from(buf).toString('base64') } };
            } catch (e) {
                console.warn(`⚠️ Could not fetch image: ${e.message}`);
                return null;
            }
        }

        // Product image — always first
        const productPart = await urlToImagePart(productImage);
        if (productPart) {
            imageParts.push(productPart);
            console.log(`   ✅ Product image loaded (${productPart.inlineData?.mimeType || 'unknown'})`);
        } else {
            console.error(`   ❌ Product image could not be decoded — URL type: ${productImage?.substring(0, 30)}`);
        }

        // Character image — second (if provided)
        if (hasCharacter) {
            const charPart = await urlToImagePart(characterImage);
            if (charPart) imageParts.push(charPart);
        }

        // Style reference — last (if provided)
        if (hasRef) {
            const refPart = await urlToImagePart(refImage);
            if (refPart) imageParts.push(refPart);
        }

        if (imageParts.length === 0) {
            return res.status(400).json({ success: false, error: 'Could not load the product image — it may have expired. Please re-upload and try again.' });
        }

        // ── Step 5: Save Initial State to DB & Return Job ID ──
        let creative = null;
        let jobRecord = null;
        const genJobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        if (brandId) {
            creative = await Creative.create({
                user: req.user._id,
                brand: brandId,
                type: 'campaign-shot',
                title: `Campaign Shot — ${detectedProductName}`,
                prompt: masterPrompt,
                imageUrl: '',
                thumbnailUrl: '',
                aiMeta: {
                    provider: imageModel.startsWith('gpt') ? 'openai' : 'gemini',
                    model: imageModel,
                    method: 'campaign-shot',
                    moodPreset,
                    productName: detectedProductName,
                    taglines: [tagline1, tagline2].filter(Boolean),
                    processingStatus: 'processing',
                },
                tags: ['campaign-shot', 'cinematic', 'product', moodPreset || 'dark-botanical'],
                status: 'draft',
            });
            const GenerationJob = (await import('../models/GenerationJob.js')).default;
            jobRecord = await GenerationJob.create({
                jobId: genJobId,
                user: req.user._id,
                brand: brandId,
                type: 'campaign-shot',
                prompt: masterPrompt,
                format: 'campaign-shot',
                status: 'processing'
            });
        }

        res.json({ success: true, jobId: jobRecord ? genJobId : null, status: 'processing' });

        // ── Step 6: Background Process ──
        (async () => {
            let generatedImageUrl = null;
            let usedModel = imageModel;
            let genError = null;

            console.log(`   🖼️ internalGenerateCreative: model=${imageModel} | variation=${variation.label}`);

        try {
            // Build refImageUrls — productImage first, then character + style ref
            const refImageUrls = [productImage, characterImage, refImage].filter(Boolean);

            const genResult = await internalGenerateCreative({
                body: {
                    brandId,
                    prompt: masterPrompt,
                    type: 'campaign-shot',
                    refImageUrls,
                    options: {
                        imageModel,
                        aspectRatio,
                        imageSize: '1K',
                        temperature: variation.tempOverride ?? 0.3,
                        generateCopy: generateCopy, // ✅ Pass through user's toggle
                    },
                },
                user: req.user,
                creditsDeducted: req.creditsDeducted,
            });
            if (genResult?.creative?.imageUrl) {
                generatedImageUrl = genResult.creative.imageUrl;
                usedModel = genResult.creative.aiMeta?.model || imageModel;
                console.log(`   ✅ Campaign Shot generated with ${usedModel}`);
            } else {
                genError = genResult?.errorMessage || 'No image returned';
                console.warn(`   ⚠️ internalGenerateCreative returned no image: ${genError}`);
            }
        } catch (e) {
            genError = e.message;
            console.error(`   ❌ internalGenerateCreative error:`, e.message);
        }

            if (!generatedImageUrl) {
                const errorMsg = genError || 'Image generation failed — model may be busy, please try again';
                console.error(`   ❌ Campaign Shot failed: ${errorMsg}`);
                if (creative) {
                    await Creative.updateOne({ _id: creative._id }, {
                        $set: { 'aiMeta.processingStatus': 'failed', errorMessage: errorMsg, status: 'failed' }
                    });
                }
                if (jobRecord) {
                    const GenerationJob = (await import('../models/GenerationJob.js')).default;
                    await GenerationJob.updateOne({ jobId: genJobId }, { status: 'failed', errorMessage: errorMsg });
                }
                if (req.creditsDeducted > 0) {
                    await refundCredits(req.user._id, req.creditsDeducted, 'campaignShot', `Refund: Campaign Shot Failure (${errorMsg})`, 'creative').catch(() => {});
                }
                return; // Background process ends
            }

            req.user.updateOne({ $inc: { 'usage.creativesGenerated': 1 } }).catch(() => {});

            console.log(`✅ Campaign Shot generated`);
            const finalSignedUrl = await getSignedUrlIfNeeded(generatedImageUrl);

            // ── Optional: Generate Cinematic Ad Copy (if toggle enabled) ──
            let adCopy = null;
            if (generateCopy) {
                try {
                    const copyRouter = getRouter();
                    const copyResult = await copyRouter.generateText({
                        systemPrompt: 'You are a world-class advertising copywriter. Write only the ad copy — no explanations, no JSON, no markdown. Pure cinematic poster copy.',
                        userPrompt: `Write cinematic, emotionally compelling ad copy for this campaign poster:

Brand: ${brandName}
Product: ${detectedProductName}
Variation Style: ${variation.label} — ${variation.copyVoice}
Mood: ${moodPreset || 'dark-botanical'} — ${mood.env}
Primary Tagline: ${tagline1}
Secondary Tagline: ${tagline2}
Brief: ${brief || 'premium brand campaign'}

Write a short cinematic ad copy block (3-5 lines) — in the style of a luxury brand campaign. Think Cannes Lions. Use the taglines as anchors. The copy should feel like it belongs on a billboard or a magazine spread. Bold. Minimal. Evocative.`,
                        temperature: 0.8,
                        maxTokens: 300,
                    });
                    adCopy = (copyResult.text || '').trim();
                    console.log(`   ✎️ Ad Copy generated (${adCopy.length} chars)`);
                } catch (copyErr) {
                    console.warn('⚠️ Ad copy generation failed:', copyErr.message);
                }
            }

            // Update DB with generated image immediately (if base64) or wait for S3
            try {
                if (generatedImageUrl.startsWith('data:image/')) {
                    const s3Url = await uploadToS3(generatedImageUrl, `campaign-shots/${brandId || 'default'}/${Date.now()}.png`);
                    if (creative) {
                        await Creative.updateOne({ _id: creative._id }, {
                            $set: { imageUrl: s3Url, thumbnailUrl: s3Url, 'aiMeta.processingStatus': 'ready', status: 'ready', prompt: masterPrompt, 'copy.headline': adCopy || null }
                        });
                        creative.imageUrl = s3Url;
                        creative.thumbnailUrl = s3Url;
                        if (adCopy) creative.copy = { headline: adCopy }; // ✅ Keep in-memory doc in sync
                    }
                    console.log(`[BG-S3] Campaign Shot uploaded: ${s3Url}`);
                } else if (creative) {
                    await Creative.updateOne({ _id: creative._id }, { $set: { imageUrl: finalSignedUrl, thumbnailUrl: finalSignedUrl, 'aiMeta.processingStatus': 'ready', status: 'ready', prompt: masterPrompt, 'copy.headline': adCopy || null } });
                    creative.imageUrl = finalSignedUrl;
                    creative.thumbnailUrl = finalSignedUrl;
                    if (adCopy) creative.copy = { headline: adCopy }; // ✅ Keep in-memory doc in sync
                }
                if (jobRecord && creative) {
                    const GenerationJob = (await import('../models/GenerationJob.js')).default;
                    await GenerationJob.updateOne({ jobId: genJobId }, {
                        status: 'completed',
                        creativeId: creative._id,
                        imageUrl: creative.thumbnailUrl || creative.imageUrl,
                        result: { creative }
                    });
                }
            } catch (bgErr) {
                console.error('[BG] Campaign Shot post-processing error:', bgErr.message);
                if (creative) await Creative.updateOne({ _id: creative._id }, { $set: { 'aiMeta.processingStatus': 'failed', status: 'failed', errorMessage: bgErr.message } });
                if (jobRecord) {
                    const GenerationJob = (await import('../models/GenerationJob.js')).default;
                    await GenerationJob.updateOne({ jobId: genJobId }, { status: 'failed', errorMessage: bgErr.message });
                }
            }
        })().catch(async error => {
            console.error('❌ Campaign Shot FATAL error:', error?.message);
            if (creative) await Creative.updateOne({ _id: creative._id }, { $set: { 'aiMeta.processingStatus': 'failed', status: 'failed', errorMessage: error?.message } });
            if (jobRecord) {
                const GenerationJob = (await import('../models/GenerationJob.js')).default;
                await GenerationJob.updateOne({ jobId: genJobId }, { status: 'failed', errorMessage: error?.message });
            }
            if (req.creditsDeducted > 0) {
                await refundCredits(req.user._id, req.creditsDeducted, 'campaignShot', `Refund: Campaign Shot Failure (${safeErrorMessage(error)})`, 'creative').catch(() => {});
            }
        });

    } catch (error) {
        console.error('❌ Campaign Shot Setup FATAL error:', error?.message);
        if (req.creditsDeducted > 0) {
            await refundCredits(req.user._id, req.creditsDeducted, 'campaignShot', `Refund: Campaign Shot Setup Failure (${safeErrorMessage(error)})`, 'creative').catch(() => {});
        }
        const errorMsg = error?.message || safeErrorMessage(error);
        res.status(500).json({ success: false, error: errorMsg });
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

        req.user.updateOne({ $inc: { 'usage.creativesGenerated': 1 } }).catch(() => { });

        console.log(`✅ Lifestyle Mockup generated — responding immediately`);
        const finalSignedUrl = await getSignedUrlIfNeeded(rawImageUrl);
        res.json({ success: true, imageUrl: finalSignedUrl, model: genResult.model });

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
                            mood: { type: 'STRING' },
                            genre: { type: 'STRING' },
                            colorPalette: { type: 'ARRAY', items: { type: 'STRING' } },
                            dominantColor: { type: 'STRING' },
                            lighting: { type: 'STRING' },
                            texture: { type: 'STRING' },
                            panoramicPrompt: { type: 'STRING' },
                            suggestedStyle: { type: 'STRING' },
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
        const SLIDE_DIMS = { '1:1': [1080, 1080], '4:5': [1080, 1350], '9:16': [1080, 1920], '16:9': [1920, 1080], '3:4': [1080, 1440], '2:3': [1080, 1620] };
        const [slideW, slideH] = SLIDE_DIMS[slideRatio] || [1080, 1080];
        const totalW = slideW * slideCount;   // full panoramic canvas width
        const totalH = slideH;

        // Genre/treatment system
        const GENRE_TREATMENTS = {
            drama: { lighting: 'dramatic chiaroscuro, deep shadows one side, warm golden rim light', palette: 'deep burgundy, charcoal, amber gold', atmosphere: 'intense, cinematic, emotionally charged depth-of-field' },
            thriller: { lighting: 'cool desaturated, stark single-source key light, harsh edge lighting', palette: 'steel blue, near-black, cold silver', atmosphere: 'suspenseful, tense, sharp focus, ominous' },
            romance: { lighting: 'soft golden hour backlight, warm bokeh, diffused fill', palette: 'blush rose, champagne, warm ivory, peach', atmosphere: 'dreamy, intimate, hazy warmth' },
            comedy: { lighting: 'bright high-key even lighting, cheerful shadows', palette: 'vibrant coral, sunshine yellow, sky blue, lime', atmosphere: 'playful, lively, upbeat, energetic' },
            horror: { lighting: 'single harsh upward key light, toxic green ambient, deep shadow pools', palette: 'near-black, toxic green, blood red', atmosphere: 'eerie, dread, unsettling fog' },
            action: { lighting: 'explosive rim lighting, lens flares, harsh directional', palette: 'electric blue, fire orange, gunmetal grey', atmosphere: 'kinetic, high-energy, bold, epic' },
            inspirational: { lighting: 'golden sunrise rays flooding scene, ethereal God-rays', palette: 'warm gold, sky blue, soft white, sunrise orange', atmosphere: 'uplifting, majestic, hopeful, vast' },
            luxury: { lighting: 'soft silk-quality directional light, specular highlights on surfaces', palette: 'champagne gold, deep navy, pearl white', atmosphere: 'opulent, refined, timeless, premium' },
            nature: { lighting: 'dappled natural sunlight, soft green ambient', palette: 'forest green, earthy brown, sky blue, muted gold', atmosphere: 'serene, organic, fresh, peaceful' },
            tech: { lighting: 'cool blue LED rim light, gradient neon glow', palette: 'electric blue, deep violet, silver, cyan', atmosphere: 'futuristic, clean, minimal, sleek' },
            modern: { lighting: 'clean studio soft box, even fill light', palette: 'crisp white, charcoal, accent color', atmosphere: 'clean, professional, contemporary' },
        };

        let genre = style || 'luxury';
        if (themeAnalysis?.genre) genre = themeAnalysis.genre.toLowerCase().replace(/[^a-z]/g, '');
        else if (themeAnalysis?.mood) {
            const moodMap = { cinematic: 'drama', dark: 'thriller', romantic: 'romance', playful: 'comedy', scary: 'horror', bold: 'action', inspiring: 'inspirational', natural: 'nature', futuristic: 'tech' };
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
                    ? await uploadToS3(themeImageUrl, `carousel-themes/${brandId || 'default'}/${Date.now()}-theme.png`)
                    : themeImageUrl;
                themeRefUrls = [s3Url];
                console.log(`✅ Theme reference uploaded`);
            } catch (e) { console.warn(`⚠️ Theme upload failed: ${e.message}`); }
        }

        // ── Build the SINGLE panoramic background prompt ──
        // This generates ONE wide image that covers all panels as a unified scene
        const themeStr = themeAnalysis?.panoramicPrompt ? `SCENE INSPIRATION: "${themeAnalysis.panoramicPrompt}" — use this as the visual blueprint. ` : '';
        const moodStr = themeAnalysis?.mood ? `Mood: ${themeAnalysis.mood}. ` : '';
        const lightStr = themeAnalysis?.lighting ? `Lighting: ${themeAnalysis.lighting}. ` : `Lighting: ${treatment.lighting}. `;
        const colorStr = themeAnalysis?.colorPalette?.length
            ? `Colors from reference: ${themeAnalysis.colorPalette.slice(0, 5).join(', ')}. `
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

        // Generate the panoramic natively matching the width/height of the carousel panels
        // We pass the exact customSize to NanoBanana 2, avoiding '16:9' fallback stretching
        let panoramicResult;
        try {
            const customSize = { width: totalW, height: totalH };
            panoramicResult = await routedImageGenerate(panoramicPrompt, [], 0.3, '16:9', '1K', selectedModel, themeRefUrls, customSize);
        } catch (err) {
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
        const finalSignedPano = await getSignedUrlIfNeeded(panoramicResult.imageUrl);
        res.json({ success: true, carouselId, status: 'processing', message: `Panoramic background ready. Splitting into ${slideCount} panels...`, panoramicUrl: finalSignedPano, slideCount, provider: panoramicResult.provider });

        // ── Async: Split panoramic, composite products, upload ──
        (async () => {
            try {
                const sharp = await getSharp();
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
                } catch (fetchErr) {
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
                    console.log(`   ✂️  Panel ${i + 1}/${slideCount} extracted at x=${i * slideW}`);
                }
                console.log(`✅ Split complete: ${panelBufs.length} panels at ${slideW}×${slideH}px each`);

                const finalPanels = [];
                for (let i = 0; i < panelBufs.length; i++) {
                    let panelBuf = panelBufs[i];

                    if (productImages[i]) {
                        try {
                            console.log(`\n   🎨 Panel ${i + 1}/${slideCount}: Compositing product using exact background pixels...`);

                            // ── EXPERIMENTAL ZERO-HALLUCINATION COMPOSITING ──
                            // Utility: Background Removal via fal.ai 
                            const removeBackground = async (url) => {
                                const falKey = process.env.FAL_API_KEY || process.env.FAL_KEY;
                                if (!falKey) { console.warn('Missing FAL_API_KEY for auto-transparent cutouts'); return url; }
                                const r = await fetch('https://queue.fal.run/fal-ai/bria/rmbg-1.4', {
                                    method: 'POST',
                                    headers: { 'Authorization': `Key ${falKey}`, 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ image_url: url })
                                });
                                if (!r.ok) { console.warn(`Fal RMBG Failed: ${r.status}`); return url; }
                                const d = await r.json();
                                return d.image?.url || url;
                            };

                            let productUrl = productImages[i];
                            // Ensure url is an authenticated S3 link if it was base64 to allow fal.ai to download it
                            if (productUrl.startsWith('data:')) {
                                productUrl = await uploadToS3(
                                    productUrl,
                                    `carousels/${brandId || 'default'}/${carouselId}-rawproduct-${i + 1}.png`
                                );
                            }

                            // Fetch transparent cutout
                            const transparentProductUrl = await removeBackground(productUrl);
                            const transparentProdBuf = await toBuffer(transparentProductUrl, 30000);
                            if (!transparentProdBuf) throw new Error('Transparent cutout download failed');

                            // Scale product cleanly to occupy roughly 60% of the slide frame while retaining its native proportion
                            const targetW = Math.round(slideW * 0.60);
                            const scaledProdBuf = await sharp(transparentProdBuf)
                                .resize({ width: targetW, fit: 'inside' })
                                .png()
                                .toBuffer();

                            // Direct compositing: exact pixel preservation of the background slice!
                            panelBuf = await sharp(panelBuf)
                                .composite([{ input: scaledProdBuf, gravity: 'center' }])
                                .png()
                                .toBuffer();

                            console.log(`   ✅ Panel ${i + 1}: Product perfectly composited with zero background shift.`);
                        } catch (pErr) {
                            console.warn(`   ⚠️ Panel ${i + 1}: Exact compositing failed (${pErr.message}) — using clean background`);
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
                const panoKey = `carousels/${brandId || 'default'}/${carouselId}-pano.png`;
                const panoramicS3Url = await uploadToS3(finalPanels[0], panoKey, 'image/png');

                for (let i = 0; i < finalPanels.length; i++) {
                    const url = await uploadToS3(finalPanels[i], `carousels/${brandId || 'default'}/${carouselId}-panel-${i + 1}.png`, 'image/png');
                    panelUrls.push(url);
                    carouselJobs.set(carouselId, {
                        status: i === finalPanels.length - 1 ? 'ready' : 'uploading',
                        panels: [...panelUrls],
                        panoramicUrl: panoramicS3Url,
                        error: null,
                        updatedAt: Date.now(),
                    });
                    console.log(`   ☁️  Panel ${i + 1}/${finalPanels.length} → S3`);
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

            } catch (pipeErr) {
                console.error('❌ Carousel pipeline error:', pipeErr.message);
                console.error('❌ Stack:', pipeErr.stack);
                carouselJobs.set(carouselId, { status: 'error', panels: [], panoramicUrl: panoramicResult?.imageUrl || '', error: pipeErr.message, updatedAt: Date.now() });
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
            const signedPanels = await Promise.all((liveJob.panels || []).map(p => getSignedUrlIfNeeded(p)));
            const signedPano = await getSignedUrlIfNeeded(liveJob.panoramicUrl || '');

            return res.json({
                success: true,
                status: liveJob.status,
                panels: signedPanels,
                panoramicUrl: signedPano,
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

        const signedPanels = await Promise.all((creative.aiMeta?.panels || []).map(p => getSignedUrlIfNeeded(p)));
        const signedPano = await getSignedUrlIfNeeded(creative.aiMeta?.panoramicUrl || '');

        res.json({
            success: true,
            status: creative.aiMeta?.processingStatus || 'ready',
            panels: signedPanels,
            panoramicUrl: signedPano,
            slideCount: creative.aiMeta?.slideCount || 0,
            creativeId: creative._id,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


export default router;

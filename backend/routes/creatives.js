import mongoose from 'mongoose';
import { randomUUID, createHash } from 'crypto';
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
import { registerJob, unregisterJob } from '../utils/jobRegistry.js';
import { Router } from 'express';
import Creative from '../models/Creative.js';
import Feedback from '../models/Feedback.js';
import Brand from '../models/Brand.js';
import Product from '../models/Product.js';
import { protect } from '../middleware/auth.js';
import { requireCredits as requireCredits, refundCredits } from '../middleware/credits.js';
import { aiGenerationLimiter } from '../middleware/rateLimiter.js';
import { generationLimiter } from '../utils/concurrencyLimiter.js';
import { requireStudio } from '../middleware/studioAccess.js';
import { creativeQueue } from '../utils/creativeQueue.js';
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
import { createNotification } from '../utils/createNotification.js';
import { recordGeneration, extractFingerprintFromPipelineResult } from '../agents/creativeStudio/generationFingerprint.js';


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

        // ── QUEUE EXECUTION ──────────────────────────────────────
        // Push generation payload to Redis-backed Bull queue.
        // If queue fails (Redis down), fall back to direct inline processing.
        const queuePayload = {
            jobId,
            userId: req.user._id,
            payload: {
                brandId: sanitizedBrandId,
                type,
                prompt,
                options,
                creditsDeducted: req.creditsDeducted || 0
            }
        };

        try {
            const queueJob = await Promise.race([
                creativeQueue.add(queuePayload),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Queue add timeout (5s) — Redis may be down')), 5000))
            ]);
            console.log(`📤 [Job] Queued ${jobId} → Bull Job #${queueJob.id}`);
        } catch (queueErr) {
            console.warn(`⚠️ [Job] Queue failed for ${jobId}: ${queueErr.message}. Processing inline...`);
            // Direct inline processing as fallback (no Redis needed)
            (async () => {
                try {
                    const User = (await import('mongoose')).default.model('User');
                    const user = await User.findById(req.user._id);
                    if (!user) throw new Error('User not found');

                    await GenerationJob.findOneAndUpdate({ jobId }, { status: 'processing', startedAt: new Date() });

                    const data = await internalGenerateCreative({
                        body: { brandId: sanitizedBrandId, type, prompt, options, jobId },
                        user,
                        creditsDeducted: req.creditsDeducted || 0,
                        jobId,
                    });

                    if (data?.success && data?.creative) {
                        console.log(`✅ [Inline] JOB ${jobId} completed — Creative: ${data.creative._id}`);
                    } else {
                        throw new Error(data?.error || 'Pipeline returned no creative');
                    }
                } catch (inlineErr) {
                    console.error(`❌ [Inline] JOB ${jobId} failed:`, inlineErr.message);
                    await GenerationJob.findOneAndUpdate(
                        { jobId },
                        { status: 'failed', completedAt: new Date(), errorMessage: inlineErr.message }
                    );
                }
            })();
        }


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

        // ── Define skillRefUrls HERE — BEFORE the pipeline call so they reach visual grounding ──
        const skillRefUrls = (refImageUrls || []).filter(u => u && typeof u === 'string');
        
        // Merge skill refs + template refs (deduplicated) BEFORE the pipeline
        const allRefUrls = [...new Set([...skillRefUrls, ...templateRefUrls])];
        if (allRefUrls.length > 0) {
            console.log(`🖼️ [internalGenerate] Forwarding ${allRefUrls.length} reference image(s) to generation pipeline (skills: ${skillRefUrls.length}, templates: ${templateRefUrls.length})`);
        }

        let pipelineResult;
        // ⚡ OPT 3: Skip pipeline entirely if prompt was already enhanced by the user
        // (the "Enhance" button runs the full pipeline — running it again is redundant)
        if (options?.alreadyEnhanced || options?.skipPipeline) {
            console.log('⚡ Pipeline skipped — prompt already enhanced by user');
            agenticMeta = { pipelineRan: false, pipelineSkipped: 'already-enhanced' };
        } else if (options?.templateInpainting) {
            console.log('⚡ Pipeline skipped — template inpainting mode (prompt is pre-built)');
            agenticMeta = { pipelineRan: false, pipelineSkipped: 'template-inpainting' };

        // ══════════════════════════════════════════════════════════════════════
        // ── LOGO FAST PATH: Campaign Logo uses specialist 2026 Art Director ──
        // Bypasses the generic creative pipeline entirely. Instead:
        //   1. Load brand context (Redis cached — near-zero latency)
        //   2. Run LOGO_ART_DIRECTOR_PROMPT to build a style-specific logo prompt
        //   3. Pass the enhanced prompt directly to routedImageGenerate
        // This ensures logos get 2026 design intelligence (India New Luxe,
        // Glassmorphism 2.0, Anti-AI-Slop, etc.) on EVERY generation.
        // ══════════════════════════════════════════════════════════════════════
        } else if (type === 'campaign-logo') {
            console.log('\n══════ LOGO ART DIRECTOR (2026 Design Intelligence) ══════');
            try {
                const { LOGO_ART_DIRECTOR_PROMPT } = await import('../agents/creativeStudio/prompts.js');
                const { agentUtils } = await import('../agents/shared/agentUtils.js');
                const aiRouter = getRouter();

                // Load brand context (Redis cached — ~0ms on hit)
                const { brandContext } = await agentUtils.loadBrandContext(brandId);

                // ── Extract all logo-specific fields from options ──
                const logoText = options?.logoText
                    || (prompt.match(/TEXT:\s*"([^"]+)"/)?.[1])
                    || prompt.split('\n')[0]
                    || prompt;

                const clgStyle   = options?.style   || 'auto';
                const clgOccasion= options?.occasion || '';
                const clgIcon    = options?.iconElements || '';
                const clgBg      = options?.bgTreatment  || 'auto';
                const clgShape   = options?.shape    || '';
                const clgEnhance = options?.enhance  || '';
                const clgColors  = options?.brandColors || '';

                console.log(`🎨 [LogoAD] Text: "${logoText}" | Style: ${clgStyle} | Mood: ${clgEnhance || 'auto'} | Occasion: ${clgOccasion || 'none'}`);

                // ══════════════════════════════════════════════════════════════
                // STYLE MANDATE SYSTEM
                // When the user explicitly selects a visual style, these are
                // NON-NEGOTIABLE image generation directives that the Art
                // Director receives as LOCKED constraints — it cannot override them.
                // ══════════════════════════════════════════════════════════════
                const STYLE_MANDATES = {
                    '3d-render':    'MANDATORY 3D RENDER STYLE: The logo MUST be fully three-dimensional — volumetric, dimensional type with physical depth, subsurface scattering on surfaces, realistic cast shadows, specular highlights. NOT flat. NOT 2D. Render quality: cinema-grade 3D. Think Cinema 4D / Blender render output.',
                    '2d-flat':      'MANDATORY 2D FLAT STYLE: Pure flat vector illustration aesthetic. No gradients unless linear. No shadows. No depth. Solid fills only. SVG-clean output. Think Figma-exported vector art.',
                    'isometric':    'MANDATORY ISOMETRIC STYLE: Strict 120° isometric projection. All elements rendered on isometric grid. 3D-feeling but geometrically precise and flat-shaded. No perspective distortion.',
                    'hand-drawn':   'MANDATORY HAND-DRAWN STYLE: Looks genuinely hand-crafted — brush strokes visible, ink texture, slight imperfections in line weight, sketch-like quality. Anti-AI-slop signal. Zine / risograph aesthetic.',
                    'neon':         'MANDATORY NEON GLOW STYLE: Dark (near-black or deep navy) background. Type and elements rendered as glowing neon tube lights. Electric colour bloom around each element. Chromatic aberration at edges. The glow is the texture.',
                    'metallic':     'MANDATORY METALLIC STYLE: Every element has iridescent metallic surface — liquid metal, foil-stamped, or embossed. Gold, platinum, rose gold, or copper tones depending on brand palette. Micro-reflections visible. Premium badge feel.',
                    'gradient':     'MANDATORY GRADIENT KINETIC STYLE: Bold, vibrant gradient is the HERO — not just a background. Gradient creates visual movement and energy. Type is white or light-toned over the gradient. Gradient tells a story (dark → bright).',
                    'pixel':        'MANDATORY PIXEL ART STYLE: Retro pixel / 8-bit aesthetic. Coarse pixel grid visible. Limited colour palette (max 8 colours). CRT scan-line texture possible. Nostalgic + precision combined.',
                    'auto':         '', // Art Director decides freely
                };

                // ══════════════════════════════════════════════════════════════
                // MOOD-TO-COLOR INTELLIGENCE
                // Translates feel/mood keywords into specific colour science.
                // This runs even when Art Director would otherwise default to
                // brand's dark/bold palette.
                // ══════════════════════════════════════════════════════════════
                const MOOD_COLOR_MAP = {
                    elegant:    'Muted, sophisticated palette — soft champagne, ivory, blush, warm taupe, aged gold. Never harsh or saturated. Delicate.',
                    caring:     'Warm, nurturing palette — soft rose, peach, cream, warm coral, sage green. Gentle, approachable, never cold or dark.',
                    playful:    'Bright, energetic palette — sunny yellow, coral, sky blue, lime green. High energy, dopamine-rich.',
                    luxury:     'Deep, prestigious palette — near-black navy or forest, champagne gold accent, ivory pop. Restraint is the signal.',
                    bold:       'High contrast palette — deep background, electric accent, white type. Punchy and confident.',
                    minimalist: 'Near-monochrome — one colour at very low saturation, generous white space, nothing competes.',
                    retro:      'Muted vintage palette — ochre, burnt sienna, teal, cream. Faded Kodak Portra colour science.',
                    futuristic: 'Cold technology palette — deep space black, electric cyan or violet, white type. No warm tones.',
                    vibrant:    'Maximum saturation — hot pink, electric orange, lime, cyan. Dopamine colour overload intentional.',
                    festive:    'Rich celebration palette — crimson, gold, deep jewel tones. Warm and celebratory.',
                    warm:       'Amber, terracotta, burnt gold, cream. Comfortable and inviting. No cool tones.',
                    cool:       'Blues, teals, silvers, whites. Crisp, modern, clinical if needed.',
                    natural:    'Forest green, earth brown, sky blue, warm beige. Organic and grounded.',
                    soft:       'Very light, low-contrast palette. Pastels — lavender, mint, peach, cloud white.',
                    dark:       'Deep backgrounds — near-black, charcoal, dark navy. High contrast type.',
                    light:      'White or very light backgrounds. Airy, open, spacious.',
                };

                // Resolve mood color directive from clgEnhance keywords
                const moodKeywords = (clgEnhance || '').toLowerCase().split(/[\s,]+/).filter(Boolean);
                const moodColorDirectives = moodKeywords
                    .map(kw => MOOD_COLOR_MAP[kw])
                    .filter(Boolean);

                // Build the mandate block that the Art Director receives as hard constraints
                const styleMandateBlock = STYLE_MANDATES[clgStyle] || '';
                const moodMandateBlock = moodColorDirectives.length > 0
                    ? `MANDATORY COLOUR & FEEL DIRECTION (user-specified): ${moodColorDirectives.join(' ')} These colour choices OVERRIDE any conflicting defaults. The mood "${clgEnhance}" must be immediately obvious in the first 0.5 seconds.`
                    : clgColors
                        ? `COLOUR PALETTE (locked): Use these specific colours as the foundation — ${clgColors}. Do not substitute with brand defaults if these are specified.`
                        : '';

                const userMandates = [
                    styleMandateBlock,
                    moodMandateBlock,
                    clgShape && clgShape !== 'freeform'
                        ? `MANDATORY BADGE SHAPE: The logo MUST be contained within a ${clgShape} shape. This is non-negotiable.` : '',
                    clgIcon && clgIcon !== 'none'
                        ? `MANDATORY ICON ELEMENT: Include a ${clgIcon} icon/symbol element. It must be present and visible.` : '',
                    clgBg === 'transparent'
                        ? 'MANDATORY: Fully transparent background (alpha channel). Logo elements only — no background fill.'
                        : clgBg && clgBg !== 'auto'
                            ? `MANDATORY BACKGROUND: ${clgBg} background — solid colour fill as specified.` : '',
                    clgEnhance && !moodColorDirectives.length
                        ? `MANDATORY STYLE KEYWORDS: "${clgEnhance}" — ensure these qualities are obvious in the visual output.` : '',
                ].filter(Boolean);

                // Build the full Art Director prompt with mandates injected as locked constraints
                const logoADPrompt = LOGO_ART_DIRECTOR_PROMPT(brandContext, logoText, clgStyle, clgOccasion)
                    + (userMandates.length > 0
                        ? `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nUSER-LOCKED MANDATES (CANNOT BE OVERRIDDEN BY YOUR CREATIVE DECISIONS)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nThe following are absolute user requirements. Your engineeredPrompt MUST faithfully execute ALL of them. Do not substitute, soften, or ignore any:\n\n${userMandates.map((m, i) => `${i + 1}. ${m}`).join('\n\n')}`
                        : '');

                // Call the Logo Art Director (Claude for precision reasoning)
                const adResult = await aiRouter.generateText({
                    model: 'claude-sonnet-4-6',
                    max_tokens: 800,
                    messages: [{ role: 'user', content: logoADPrompt }]
                });
                const adRaw = adResult?.content?.[0]?.text || adResult?.text || '';

                // Extract the engineered image prompt from the Art Director's JSON response
                let enhancedLogoPrompt = prompt; // fallback to full raw prompt
                try {
                    const jsonMatch = adRaw.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        const adJson = JSON.parse(jsonMatch[0]);
                        enhancedLogoPrompt = adJson.engineeredPrompt || adJson.imagePrompt || adJson.finalPrompt || adJson.primaryPrompt || prompt;
                        console.log(`✅ [LogoAD] Style chosen: ${adJson.chosenStyle || clgStyle}`);
                        console.log(`✅ [LogoAD] Colors: ${adJson.colorStrategy || 'N/A'}`);
                        console.log(`✅ [LogoAD] Type: ${adJson.typographyTreatment || 'N/A'}`);
                    } else if (adRaw.length > 20) {
                        enhancedLogoPrompt = adRaw;
                    }
                } catch {
                    if (adRaw.length > 20) enhancedLogoPrompt = adRaw;
                }

                // Append safety guardrails that must survive any prompt truncation
                const guardrails = [
                    `The text "${logoText}" MUST be the largest, clearest, most readable element — always.`,
                    'No placeholder text. No watermarks. No additional brand wordmark.',
                    styleMandateBlock ? styleMandateBlock.split(':')[0] + ': confirmed.' : '',
                ].filter(Boolean).join(' ');

                enhancedLogoPrompt += `\n\n${guardrails}`;

                console.log(`📝 [LogoAD] Final prompt (${enhancedLogoPrompt.length} chars): ${enhancedLogoPrompt.substring(0, 200)}...`);
                agenticMeta = {
                    pipelineRan: false,
                    pipelineSkipped: 'logo-fast-path',
                    finalPrompt: enhancedLogoPrompt,
                    engineeredPrompt: { primaryPrompt: enhancedLogoPrompt },
                };
            } catch (logoErr) {
                console.warn('⚠️ [LogoAD] Art Director failed, using raw prompt:', logoErr.message);
                agenticMeta = { pipelineRan: false, pipelineSkipped: 'logo-ad-fallback', finalPrompt: prompt };
            }

        } else {
        try {
            // ── ⚡ OPT 4: Pipeline timeout 45s → 20s — if stuck, raw prompt works fine ──
            const pipelineTimeout = new Promise((_, reject) =>
                // 65s: Claude Sonnet unified call takes 22-28s + VG (5-8s) + Brand Intel (2-5s) = ~35-40s.
                // 65s gives a comfortable margin before we fall back to raw prompt.
                setTimeout(() => reject(new Error('Pipeline timeout (65s) — using raw prompt')), 65_000)
            );
            pipelineResult = await Promise.race([
                runCreativePipeline({
                    brandId,
                    brief: prompt,
                    format: type || 'instagram-post',
                    mode: 'fast', // Enforce fast-path to bypass sequential LLM criticism delays
                    refImageUrls: allRefUrls, // ✅ Pass combined reference images to pipeline
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
        }

        let fullPrompt = agenticMeta.finalPrompt || agenticMeta.engineeredPrompt?.totalPrompt || prompt;
        const selectedImageModel = (options?.imageModel || 'nanobanana-2').toLowerCase();
        const aspectRatio = options?.aspectRatio || '1:1';
        // ⚡ PERF: 1K default (was 2K). 2K adds ~3–8s per gen with negligible quality
        // benefit for typical social/ad creatives. Users can opt into 2K explicitly.
        const imageSize = options?.imageSize || '1K';
        const customSize = options?.customSize || null;

        let ratioNum = 1;
        if (customSize && customSize.width && customSize.height) {
            ratioNum = customSize.width / customSize.height;
        } else if (aspectRatio && aspectRatio.includes(':')) {
            const [w, h] = aspectRatio.split(':').map(Number);
            if (w && h) ratioNum = w / h;
        }

        // ── ASPECT-RATIO REINFORCEMENT ──
        // Even though Gemini receives imageConfig.aspectRatio, preview models drift toward
        // 1:1 unless the prompt itself reinforces the orientation. Append a composition
        // hint matching the chosen format. This was the root cause users reported:
        // "I select 4:5 / 9:16 but output looks square."
        const orientationHint =
            ratioNum > 2.5  ? `ULTRA-WIDE HORIZONTAL BANNER ${aspectRatio}` :
            ratioNum > 1.3  ? `WIDESCREEN HORIZONTAL ${aspectRatio}` :
            ratioNum < 0.4  ? `ULTRA-TALL VERTICAL STRIP ${aspectRatio}` :
            ratioNum < 0.85 ? `VERTICAL PORTRAIT ${aspectRatio}` :
                              `SQUARE ${aspectRatio}`;
                              
        const composeFor =
            ratioNum > 2.5  ? 'ultra-wide panoramic banner — the camera MUST be pulled back (zoomed out) to leave generous headroom above the subject. Subjects must be fully visible and NOT cropped by the top or bottom edges. Use strong negative space.' :
            ratioNum > 1.3  ? 'horizontal cinematic frame — subject occupies the left or right two-thirds, with environmental depth extending across the wide canvas. Use rule-of-thirds horizontal balance.' :
            ratioNum < 0.4  ? 'ultra-tall vertical banner — the camera MUST be pulled back (zoomed out) to leave generous breathing room on the left and right sides. Subjects must not be cropped by the side edges.' :
            ratioNum < 0.85 ? 'vertical reel/story frame — subject is composed top-to-bottom, eyeline upper third, breathing room above the head, brand atmosphere fills the lower third. NEVER center on a square crop.' :
                              'centered square composition with strong middle-frame focal point and balanced negative space.';
        fullPrompt += `\n\nCANVAS FORMAT: ${orientationHint}. Compose for a ${composeFor}\nThe final image MUST be rendered in ${aspectRatio} aspect ratio — do NOT default to 1:1 if the requested ratio differs.`;

        if (ratioNum >= 2.5 || ratioNum <= 1 / 2.5) {
            console.log(`📐 Extreme aspect ratio detected (ratio ${ratioNum.toFixed(2)}). Injecting anti-tiling prompt.`);
            fullPrompt += "\n\nCRITICAL COMPOSITION INSTRUCTION: Render this as a single, continuous, and seamless scene spanning the entire canvas. DO NOT tile the image. DO NOT repeat elements, borders, or patterns.";
        }

        if (progressId) {
            await addStep(progressId, { agent: 'generating', message: `Generating using ${selectedImageModel}...`, status: 'working' });
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
            fullPrompt = `TEMPLATE INPAINTING — PIXEL-PERFECT DESIGN REPLICATION:

You are a professional graphic designer tasked with adapting an existing design template for a new product/brand. Your job is to REPLICATE the template design exactly, swapping ONLY the product and its associated text.

IMAGE 1 is the DESIGN TEMPLATE. You MUST preserve EVERYTHING about it:
- The EXACT same background scene, colors, gradients, textures, and lighting
- The EXACT same layout grid, composition, and spatial arrangement of ALL elements
- The EXACT same decorative elements: badges, banners, ribbons, icons, borders, frames, swooshes, splashes
- The EXACT same typography hierarchy: heading size/weight/position, subheading, body text, CTA button style and position
- The EXACT same visual effects: shadows, glows, reflections, depth-of-field, bokeh
- The EXACT same footer/header bar structure and social media icon placement

${contentImageCount > 0 ? `IMAGE 2+: These are the NEW PRODUCT image(s) to INSERT into the template.
- Place the new product in the EXACT same position, angle, and scale as the original product in Image 1
- The new product must blend seamlessly with the template's lighting, shadows, and color grading
- Preserve the product's original branding, labels, and packaging design faithfully
` : ''}
USER'S CONTENT INSTRUCTIONS:
${originalPrompt}

CRITICAL ANTI-WATERMARK RULES:
- Do NOT render any brand name, company name, or text as a large translucent/faded watermark in the background
- Do NOT repeat any text as a decorative background pattern (e.g. "STARBUCKS STARBUCKS" fading behind the product)
- Background text watermarks are STRICTLY FORBIDDEN — the background must be clean scene elements only
- If the original template has decorative background text, replace it with abstract design elements (gradients, bokeh, light streaks) instead

ABSOLUTE RULES:
1. The output MUST be a near-identical twin of Image 1 — same layout, same colors, same structure, same mood
2. ONLY the product/subject and its directly associated text labels change — the entire design shell stays identical
3. Do NOT reimagine, reinterpret, or "improve" the template design — REPLICATE it with surgical precision
4. ${contentImageCount > 0 ? 'The new product image must appear in the EXACT same position, size, and angle as the original product in the template' : 'Generate fresh content fitting naturally into the exact same design shell'}
5. Match the template's exact aspect ratio and framing — do not crop differently
6. All text in the output must be sharp, readable, and properly spelled — never blurry or garbled

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

                        // Get metadata to determine generated aspect ratio
                        const metadata = await sharp(normalizedBuffer).metadata();
                        const genW = metadata.width || targetW;
                        const genH = metadata.height || targetH;
                        const genRatio = genW / genH;
                        const targetRatio = targetW / targetH;
                        
                        // If generated ratio differs significantly from target ratio (> 5%),
                        // we use fit: 'contain' to avoid cutting off text or main elements.
                        const ratioDiff = Math.abs(genRatio - targetRatio);
                        const fitMethod = ratioDiff > 0.05 ? 'contain' : 'cover';
                        
                        console.log(`📐 Image crop strategy: gen=${genW}x${genH} (ratio ${genRatio.toFixed(2)}), target=${targetW}x${targetH} (ratio ${targetRatio.toFixed(2)}), diff=${ratioDiff.toFixed(2)} -> fit: ${fitMethod}`);

                        // Step 2: Resize
                        let resizedBuffer;
                        try {
                            resizedBuffer = await sharp(normalizedBuffer, { limitInputPixels: false })
                                .resize({ 
                                    width: targetW, 
                                    height: targetH, 
                                    fit: fitMethod, 
                                    position: 'centre',
                                    background: { r: 0, g: 0, b: 0, alpha: 0 } // transparent background for contain
                                })
                                .png()
                                .toBuffer();
                        } catch (coverErr) {
                            // Fallback: if primary resize fails, just try one more direct fill using the original libvips method
                            console.warn(`⚠️ Primary resize failed (${coverErr.message}), falling back to direct fill`);
                            resizedBuffer = await sharp(normalizedBuffer, { limitInputPixels: false })
                                .resize({ width: targetW, height: targetH, fit: 'fill', fastShrinkOnLoad: false })
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

        // For campaign-logo, derive a clean title from the logo text (not the raw prompt blob)
        const savedTitle = type === 'campaign-logo' && options?.logoText
            ? `Campaign Logo — ${options.logoText}`
            : result.title || '';

        const creative = await Creative.create({
            user: user._id,
            brand: brandId,
            type: type || 'instagram-post',
            title: savedTitle,
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

            // Notify user via bell (creative/image generation complete)
            const jobDoc = await GenerationJob.findOne({ jobId }, 'user brand meta type').lean().catch(() => null);
            if (jobDoc) {
                const notifType = jobDoc.type === 'video' ? 'video' : 'creative';
                const title = notifType === 'video' ? '🎬 Video Ready' : '🎨 Creative Ready';
                await createNotification({
                    userId: jobDoc.user,
                    brandId: jobDoc.brand,
                    type: notifType,
                    title,
                    body: jobDoc.meta?.label || 'Your visual has been generated.',
                    link: '/creative-studio',
                    jobId,
                });
            }
        }

        user.updateOne({ $inc: { 'usage.creativesGenerated': 1 } }).catch(() => { });

        if (progressId) {
            await addStep(progressId, { agent: 'generating', message: 'Image created successfully!', status: 'done' });
            await addStep(progressId, { agent: 'complete', message: 'Creative ready!', status: 'done' });
            endProgress(progressId);
        }

        // POST-PROCESSING: Upload to S3, add Logo, and run Critic
        const runPostProcessing = async () => {
            let finalUrl = rawImageUrl;
            try {
                const ts = Date.now();

                // ⚡ PERF: when addLogo=true, skip the first S3 upload entirely.
                // We can decode the data URI directly to a Buffer, composite the logo,
                // and upload ONCE. Saves the ~1–2s S3 upload + ~500–1500ms re-fetch.
                const willOverlayLogo = !!(options?.addLogo);
                let inMemoryImageBuffer = null;

                if (finalUrl.startsWith('data:image/')) {
                    if (willOverlayLogo) {
                        // Defer first S3 upload — we'll do composite + single upload below.
                        try {
                            inMemoryImageBuffer = await fetchImageBuffer(finalUrl);
                        } catch (decodeErr) {
                            console.warn('[BG-LOGO] Direct decode failed, falling back to S3 round-trip:', decodeErr.message);
                        }
                    }
                    if (!inMemoryImageBuffer) {
                        try {
                            finalUrl = await uploadToS3(finalUrl, `creatives/${brandId}/${ts}.png`);
                        } catch (s3Err) {
                            console.error('[BG-S3] Upload failed:', s3Err.message);
                        }
                    }
                }

                if (willOverlayLogo && (inMemoryImageBuffer || finalUrl)) {
                    try {
                        const brandData = await Brand.findById(brandId).lean();
                        const logoUrl = brandData?.dna?.logo?.url;
                        if (logoUrl) {
                            // Image buffer: from in-memory (fast path) or S3 (fallback path).
                            // Logo buffer: from in-memory cache (LOGO_CACHE in logoOverlay.js)
                            // when warm — saves ~200–500ms per repeat generation.
                            const [imageBuffer, logoBuffer] = await Promise.all([
                                inMemoryImageBuffer ? Promise.resolve(inMemoryImageBuffer) : fetchImageBuffer(finalUrl),
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
                                    // Single S3 upload of the final composited image.
                                    finalUrl = await uploadToS3(compositedBase64, `creatives/${brandId}/${ts}-logo.png`);
                                } catch (s3Err) {
                                    console.warn('[BG-LOGO] S3 upload failed:', s3Err.message);
                                    // If S3 fails and we have no fallback URL, keep the raw data URI as last resort
                                    if (!finalUrl || finalUrl.startsWith('data:')) {
                                        finalUrl = compositedBase64;
                                    }
                                }
                            }
                        }
                    } catch (logoErr) {
                        console.warn('[BG-LOGO] Overlay failed:', logoErr.message);
                    }
                }

                // ── BUG-FIX: Catch-all S3 Upload ──
                if (finalUrl && finalUrl.startsWith('data:image/')) {
                    try {
                        finalUrl = await uploadToS3(finalUrl, `creatives/${brandId}/${ts}-final.png`);
                        console.log(`✅ [BG-S3] Uploaded final image to S3: ${finalUrl}`);
                    } catch (s3Err) {
                        console.error('[BG-S3] Final fallback upload failed:', s3Err.message);
                    }
                }

                if (finalUrl !== rawImageUrl) {
                    await Creative.updateOne(
                        { _id: creative._id },
                        { $set: { imageUrl: finalUrl, thumbnailUrl: finalUrl, 'aiMeta.processingStatus': 'ready' } }
                    );
                    // Also update the GenerationJob so the polling frontend gets the real URL
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

                // ── POST-GENERATION CRITIC (MCoT Stage 2) ──
                if (finalUrl && finalUrl.startsWith('http') && agenticMeta?.finalPrompt) {
                    try {
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
                                        'aiMeta.mcotScore': q.overallScore || null,
                                        'aiMeta.mcotCritique': q || null,
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

                // ── GENERATION FINGERPRINT RECORDING (Phase 4A) ──
                if (brandId && agenticMeta) {
                    const fp = extractFingerprintFromPipelineResult(agenticMeta);
                    recordGeneration(brandId, fp); // Background fire-and-forget
                }
            } catch (bgErr) {
                console.error('[BG] error:', bgErr.message);
            }
            return finalUrl;
        };

        if (options?.syncUpload) {
            const finalUrl = await runPostProcessing();
            creative.imageUrl = finalUrl;
            creative.thumbnailUrl = finalUrl;
        } else {
            runPostProcessing().catch(e => console.error(e));
        }

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
        const job = await GenerationJob.findOne({ jobId: req.params.jobId, user: req.user._id })
            .select('jobId status type prompt format imageUrl errorMessage creativeId result warnings createdAt startedAt completedAt steps')
            .lean();
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

// ── GET /api/creatives/jobs/:jobId/stream — Server-Sent Events (SSE) ─────────
router.get('/jobs/:jobId/stream', protect, async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    // Important for flush immediately
    res.flushHeaders();

    const jobId = req.params.jobId;
    const userId = req.user._id;

    // Send initial ping to establish connection
    res.write(': ping\n\n');

    let isClosed = false;

    // Clean up on disconnect
    req.on('close', () => {
        isClosed = true;
    });

    const pollInterval = setInterval(async () => {
        if (isClosed) {
            clearInterval(pollInterval);
            return;
        }
        try {
            const job = await GenerationJob.findOne({ jobId, user: userId })
                .select('jobId status type progress errorMessage creativeId result warnings completedAt steps')
                .lean();

            if (!job) {
                res.write(`data: ${JSON.stringify({ error: 'Job not found' })}\n\n`);
                clearInterval(pollInterval);
                res.end();
                return;
            }

            if (job.result?.creative) {
                job.result.creative.imageUrl = await getSignedUrlIfNeeded(job.result.creative.imageUrl);
                job.result.creative.thumbnailUrl = await getSignedUrlIfNeeded(job.result.creative.thumbnailUrl);
            }

            res.write(`data: ${JSON.stringify(job)}\n\n`);

            if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
                clearInterval(pollInterval);
                res.end();
            }
        } catch (err) {
            console.error(`❌ [SSE] Error polling job ${jobId}:`, err.message);
        }
    }, 2000); // 2-second heartbeat
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
export async function openaiImageGenerate(promptText, aspectRatio = '1:1', quality = 'medium', modelId = 'gpt-image-2', outputFormat = 'webp', background = 'opaque', refImageUrls = [], customSize = null) {
    // ── Choose API endpoint ──
    // Auto-prefer LaoZhang for gpt-image-1/2 when key is available.
    // Direct OpenAI does not remap modelId now.
    const isGptImageModel = modelId === 'gpt-image-1' || modelId === 'gpt-image-2';
    const lzKeyAvailable = !!process.env.LAOZHANG_API_KEY;
    const atlasKeyAvailable = !!process.env.ATLASCLOUD_API_KEY;
    const useLaoZhang = process.env.OPENAI_USE_LZ === 'true' || (process.env.OPENAI_USE_LZ !== 'false' && isGptImageModel && lzKeyAvailable);
    const useAtlas = !useLaoZhang && isGptImageModel && atlasKeyAvailable;

    const apiKey = useLaoZhang
        ? (process.env.LAOZHANG_API_KEY)
        : useAtlas
        ? (process.env.ATLASCLOUD_API_KEY)
        : (process.env.OPENAI_API_KEY);
    const baseUrl = useLaoZhang
        ? (process.env.LAOZHANG_BASE_URL || 'https://api.laozhang.ai/v1')
        : useAtlas
        ? (process.env.ATLASCLOUD_BASE_URL || 'https://api.atlascloud.ai/v1')
        : 'https://api.openai.com/v1';

    if (!apiKey) throw new Error(`OpenAI API key not configured (${useLaoZhang ? 'LAOZHANG_API_KEY' : useAtlas ? 'ATLASCLOUD_API_KEY' : 'OPENAI_API_KEY'})`);

    // ── Map aspect ratio → nearest supported image size ──
    // We map portrait and landscape ratios to their native equivalents to prevent text cropping downstream.
    const sizeMap = {
        '1:1':  '1024x1024',
        '4:5':  '1024x1024',   // 0.8 — closest to square
        '5:4':  '1792x1024',   // 1.25 — landscape
        '2:3':  '1024x1792',   // 0.67 — portrait
        '9:16': '1024x1792',   // native portrait
        '3:4':  '1024x1792',   // 0.75 — portrait
        '3:2':  '1792x1024',   // native landscape
        '16:9': '1792x1024',   // native landscape
        '4:3':  '1792x1024',   // 1.33 — landscape
        '21:9': '1792x1024',   // ultra-wide → use landscape
        '2:1':  '1792x1024',   // wide
        '1:2':  '1024x1792',   // tall
    };
    // For any unlisted ratio, pick nearest valid size by actual ratio value
    function nearestOpenAISize(ratio) {
        const [wStr, hStr] = ratio.split(':');
        const w = parseFloat(wStr), h = parseFloat(hStr);
        if (!w || !h) return '1024x1024';
        const r = w / h;
        if (r > 1.2) return '1792x1024'; // landscape
        if (r < 0.8) return '1024x1792'; // portrait
        return '1024x1024'; // square-ish
    }
    const imageSize = sizeMap[aspectRatio] || nearestOpenAISize(aspectRatio);
    const finalFormat = background === 'transparent' ? 'png' : outputFormat;

    // ── Download reference images if provided ──
    const validRefUrls = (refImageUrls || []).filter(u => u && u.startsWith('http'));
    let refBuffers = []; // Array of { buffer: Buffer, mimeType: string }

    // ── Decode base64 data URI reference images directly (no download needed) ──
    const dataUriRefsOai = (refImageUrls || []).filter(u => u && u.startsWith('data:image/'));
    for (const dataUri of dataUriRefsOai) {
        try {
            const commaIdx = dataUri.indexOf(',');
            if (commaIdx > -1) {
                const mimeMatch = dataUri.match(/^data:(image\/[^;]+)/);
                const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
                const b64Data = dataUri.substring(commaIdx + 1);
                const buf = Buffer.from(b64Data, 'base64');
                refBuffers.push({ buffer: buf, mimeType });
                console.log(`  📎 Decoded base64 ref image (${Math.round(buf.length / 1024)}KB, ${mimeType})`);
            }
        } catch (e) {
            console.warn(`  ⚠️ Failed to decode base64 ref image: ${e.message}`);
        }
    }

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
        const httpBuffers = (await Promise.all(downloads)).filter(Boolean);
        refBuffers.push(...httpBuffers);
        console.log(`📦 ${refBuffers.length} total reference images ready (${dataUriRefsOai.length} base64 + ${httpBuffers.length} HTTP)`);
    } else if (refBuffers.length > 0) {
        console.log(`📦 ${refBuffers.length} base64 reference images ready (no HTTP URLs)`);
    }

    let useEditsEndpoint = refBuffers.length > 0;

    if (!useLaoZhang && useEditsEndpoint) {
        console.log(`⚠️ Direct OpenAI no longer supports /images/edits (dall-e-2 is dead). Ignoring ref images.`);
        useEditsEndpoint = false;
    }

    const endpoint = useEditsEndpoint ? 'images/edits' : 'images/generations';

    let mappedModelId = modelId;

    let finalImageSize = imageSize;
    let customDimensions = null;

    // ── GPT Image 2 / GPT Image 1 is fully flexible ──
    // Rules: max 3:1 ratio, multiples of 16, pixels between 655k and 8.29M
    if (mappedModelId === 'gpt-image-2' || mappedModelId === 'gpt-image-1') {
        let ratio = 1;
        if (customSize && customSize.width && customSize.height) {
            ratio = parseFloat(customSize.width) / parseFloat(customSize.height);
        } else {
            const [wStr, hStr] = (aspectRatio || '1:1').split(':');
            let wRatio = parseFloat(wStr) || 1;
            let hRatio = parseFloat(hStr) || 1;
            ratio = wRatio / hRatio;
        }
        const targetPixels = 1500000; // ~1.5 Megapixels
        
        let h = Math.sqrt(targetPixels / ratio);
        let w = h * ratio;
        
        // Snap to multiples of 16
        w = Math.round(w / 16) * 16;
        h = Math.round(h / 16) * 16;
        
        // Enforce max edge 3840
        if (w > 3840) { w = 3840; h = Math.round((w / ratio) / 16) * 16; }
        if (h > 3840) { h = 3840; w = Math.round((h * ratio) / 16) * 16; }
        
        customDimensions = { width: w, height: h };
    }

    let finalQuality = quality;

    console.log(`\n══════ OPENAI IMAGE ${useEditsEndpoint ? 'EDIT' : 'GENERATION'} (${modelId} -> ${mappedModelId}) ══════`);
    console.log(`🎨 Model: ${mappedModelId} | Quality: ${finalQuality} | Size: ${finalImageSize} | Format: ${finalFormat}`);
    console.log(`🌐 Endpoint: ${baseUrl}/${endpoint} (${useLaoZhang ? 'LaoZhang proxy' : 'Direct OpenAI'})`);
    if (useEditsEndpoint) console.log(`🖼️  Reference images: ${refBuffers.length}`);
    console.log(`📝 Prompt (first 200 chars): ${(promptText || '').substring(0, 200)}...`);

    let response;

    // ── Truncate prompt for OpenAI limits (max 4000 chars) ──
    // The API has a ~4000 char limit (LaoZhang even stricter at ~3500).
    let finalPrompt = promptText;
    if (finalPrompt.length > 3500) {
        // Strip verbose REFERENCE IMAGE blocks
        finalPrompt = finalPrompt
            .replace(/REFERENCE IMAGE \d+ \([^)]*\):[^\n]*(?:\n(?!\n|[A-Z]{2,}).*?)*/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
        // If still too long, hard truncate
        if (finalPrompt.length > 3500) {
            const typoMatch = finalPrompt.match(/═══ CRITICAL TEXT RENDERING INSTRUCTIONS ═══[\s\S]*$/);
            const typoBlock = typoMatch ? typoMatch[0] : '';
            
            // ── Preserve Creative Brief ──
            const briefMatch = finalPrompt.match(/CREATIVE BRIEF[\s\S]*$/i);
            const briefBlock = briefMatch ? briefMatch[0] : '';
            
            let preserveBlock = '';
            if (briefBlock) preserveBlock += '\n\n' + briefBlock.trim();
            if (typoBlock && !preserveBlock.includes(typoBlock)) preserveBlock += '\n\n' + typoBlock.trim();
            
            if (preserveBlock && preserveBlock.length < 2500) {
                 finalPrompt = finalPrompt.substring(0, 3450 - preserveBlock.length) + '\n\n[...condensed]\n' + preserveBlock;
            } else if (typoBlock && typoBlock.length < 1500) {
                 finalPrompt = finalPrompt.substring(0, 3450 - typoBlock.length) + '\n\n[...condensed]\n\n' + typoBlock;
            } else {
                 finalPrompt = finalPrompt.substring(0, 3450) + '\n\n[...condensed for model compatibility]';
            }
        }
        console.log(`📏 Prompt condensed for OpenAI API: ${promptText.length} → ${finalPrompt.length} chars`);
    }

    if (useEditsEndpoint && (mappedModelId === 'gpt-image-1' || mappedModelId === 'gpt-image-2')) {
        finalPrompt += `\n\nCRITICAL PRODUCT FIDELITY RULE: You have been provided with reference images. Do NOT change, simplify, stylize, or modify the product's design, shapes, logos, labels, packaging, or branding from the reference image(s). The product design, physical attributes, color values, and shades must look EXACTLY as original. The brand colors/color palette must ONLY be used for the background, set environment, or UI elements, and must NEVER be applied to recolor or color-shift the product itself.`;
    }

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

        formData.append('model', mappedModelId);
        formData.append('prompt', finalPrompt);
        formData.append('n', '1');
        if (customDimensions) {
            formData.append('size', `${customDimensions.width}x${customDimensions.height}`);
        } else {
            formData.append('size', finalImageSize);
        }
        if (finalQuality && finalQuality !== 'standard') {
            formData.append('quality', finalQuality);
        }

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
            model: mappedModelId,
            prompt: finalPrompt,
            n: 1,
        };
        
        if (customDimensions) {
            body.size = `${customDimensions.width}x${customDimensions.height}`;
        } else {
            body.size = finalImageSize;
        }

        if (useLaoZhang) {
            body.output_format = finalFormat;
            body.background = background;
            if (finalFormat === 'webp' || finalFormat === 'jpeg') {
                body.output_compression = 85;
            }
        }

        if (finalQuality && finalQuality !== 'standard') {
            body.quality = finalQuality;
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

// ── Gemini image generation via Vertex AI ────────────────────────────────
// Used for NanoBanana 2 and NanoBanana Pro. NO auto-fallback chain.
// If the model is busy (503), returns modelBusy flag so frontend can notify user.
async function geminiImageGenerate(promptText, imageParts = [], temperature = 0.4, aspectRatio = '1:1', imageSize = '1K', selectedModelId = 'gemini-3.1-flash-image-preview') {
    const { generateImageWithVertex } = await import('../services/vertexImage.js');

    // Build content parts — images as inlineData, then text prompt last
    const parts = [];
    for (const ip of imageParts) {
        if (ip.inlineData) parts.push({ inlineData: ip.inlineData });
    }
    
    let finalPrompt = aspectRatio && aspectRatio !== '1:1' ? `${promptText}\n\n[ASPECT RATIO: ${aspectRatio}]` : promptText;

    parts.push({ text: finalPrompt });

    let imageUrl = null;
    let textResponse = '';
    let usedModel = selectedModelId;

    const imageCount = parts.filter(p => p.inlineData).length;
    console.log(`\n══════ CREATIVE STUDIO IMAGE GENERATION (${selectedModelId} via Vertex AI) ══════`);
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
        console.log(`🎨 Using: ${selectedModelId} (Vertex AI)...`);
        
        // NATIVE fallback config (when Atlas Cloud fails)
        const NATIVE_GEMINI_IMAGE_MODEL = 'gemini-2.5-flash'; // Valid on direct Gemini API
        const data = await generateImageWithVertex(parts, selectedModelId, temperature, { aspectRatio, imageSize });

        const resParts = data.candidates?.[0]?.content?.parts || [];
        for (const part of resParts) {
            if (part.inlineData?.mimeType?.startsWith('image/')) {
                imageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
            if (part.text) textResponse += part.text;
        }

        if (imageUrl) {
            console.log(`✅ Image generated successfully with ${selectedModelId}`);
        } else {
            console.warn(`⚠️ ${selectedModelId}: no image in response`);
            warnings.push(`${selectedModelId} returned no image.`);
            throw new Error(`${selectedModelId} returned no image in response`);
        }
    } catch (e) {
        if (e.message?.includes('modelBusy')) throw e; // re-throw busy
        const lowerMsg = String(e.message).toLowerCase();
        
        // Check for busy/overload — return modelBusy flag for frontend notification
        if (lowerMsg.includes('high demand') || lowerMsg.includes('busy') || lowerMsg.includes('quota') || lowerMsg.includes('503') || lowerMsg.includes('429')) {
            console.log(`🔴 ${selectedModelId} is BUSY — returning modelBusy flag`);
            return { imageUrl: null, model: selectedModelId, textResponse: '', warnings: [], modelBusy: true };
        }
        console.error(`❌ ${selectedModelId} error:`, e.message);
        throw e;
    }

    // ── Upload directly to S3 from buffer instead of passing huge base64 around ──
    const { uploadToS3 } = await import('../utils/s3.js');
    const s3Url = await uploadToS3(imageUrl, `creatives/gemini/${Date.now()}-${Math.random().toString(36).substring(7)}.png`);
    console.log(`✅ [${usedModel}] Image generated: ${s3Url.substring(0, 80)}...`);

    console.log(`══════ END IMAGE GENERATION ══════\n`);
    return { imageUrl: s3Url, model: usedModel, textResponse, warnings };
}

// ── Unified Image Generate — routes by selectedModel, NO auto-fallbacks ──
// NanoBanana 2 is the default. Other models are strictly opt-in.
// If any model is busy/unavailable, returns a clear error — no silent model switching.
async function routedImageGenerate(promptText, imageParts = [], temperature = 0.4, aspectRatio = '1:1', imageSize = '1K', selectedModel = 'nanobanana-2', refImageUrls = [], customSize = null, timeoutMs = null) {
    // NanoBanana 2 = gemini-3.1-flash-image-preview via LaoZhang proxy.
    // NOTE: 'gemini-3.1-flash-image-preview' does NOT exist on the direct Gemini API
    // (generativelanguage.googleapis.com). It ONLY works via the LaoZhang proxy.
    // Using router.generateImage() would route it to nativeGemini → 404 → misclassified as busy.
    const LZ_IMAGE_MODEL = 'gemini-3.1-flash-image-preview'; // LaoZhang alias for NanoBanana 2
    const NATIVE_GEMINI_IMAGE_MODEL = 'gemini-2.5-flash-preview-05-20'; // Valid on direct Gemini API
    const router = getRouter();
    const modelKey = selectedModel; // normalize: selectedModel IS the routing key
    console.log(`🎯 Image Generation: model=${modelKey}`);
    if (customSize) console.log(`📐 Custom Size: ${customSize.width}x${customSize.height}`);

    // ── Route: Recraft v4 (via LaoZhang proxy) ────────────────────────────────
    // Recraft v4 specialises in vector-grade logos, iconography, and typographic design.
    // Routed through the same LaoZhang proxy as GPT-image-2 for unified key management.
    if (modelKey === 'recraft-v4') {
        const lzKey = process.env.LAOZHANG_API_KEY;
        if (!lzKey) {
            console.warn('⚠️ [Recraft v4] LAOZHANG_API_KEY missing — falling back to gpt-image-2');
            return routedImageGenerate(promptText, imageParts, temperature, aspectRatio, imageSize, 'gpt-image-2', refImageUrls, customSize, timeoutMs);
        }
        const lzBase = process.env.LAOZHANG_BASE_URL || 'https://api.laozhang.ai/v1';
        const recraftSizeMap = {
            '1:1':  '1024x1024', '4:5':  '1024x1024',
            '9:16': '1024x1820', '16:9': '1820x1024',
            '4:3':  '1365x1024', '3:4':  '1024x1365',
            '3:2':  '1820x1024', '2:3':  '1024x1365',
        };
        function nearestRecraftSize(ar) {
            if (!ar || !ar.includes(':')) return '1024x1024';
            const [w, h] = ar.split(':').map(Number);
            if (!w || !h) return '1024x1024';
            const r = w / h;
            if (r > 1.4) return '1820x1024';
            if (r < 0.7) return '1024x1820';
            if (r > 1.1) return '1365x1024';
            if (r < 0.9) return '1024x1365';
            return '1024x1024';
        }
        const recraftSize = recraftSizeMap[aspectRatio] || nearestRecraftSize(aspectRatio);
        const TIMEOUT_MS = 150_000;
        console.log(`\n══════ RECRAFT V4 GENERATION (via LaoZhang) ══════`);
        console.log(`📐 Aspect Ratio: ${aspectRatio} → ${recraftSize}`);
        console.log(`📝 Prompt (first 200): ${promptText.substring(0, 200)}...`);
        try {
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Recraft v4 timed out after 150s. Please try again.')), TIMEOUT_MS)
            );
            const generatePromise = (async () => {
                const response = await fetch(`${lzBase}/images/generations`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${lzKey}` },
                    body: JSON.stringify({ model: 'recraftai/recraftv4', prompt: promptText, n: 1, size: recraftSize, response_format: 'url' }),
                    signal: AbortSignal.timeout(TIMEOUT_MS),
                });
                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`Recraft v4 failed (${response.status}): ${errText.substring(0, 200)}`);
                }
                const data = await response.json();
                const imgData = data.data?.[0];
                const imageUrl = imgData?.url || '';
                const b64 = imgData?.b64_json || '';
                if (!imageUrl && !b64) throw new Error('Recraft v4 returned empty image response');
                const rawUrl = imageUrl || `data:image/png;base64,${b64}`;
                const { ensureS3Url } = await import('../utils/s3.js');
                const finalUrl = await ensureS3Url(rawUrl, 'studio/recraft');
                console.log(`✅ [Recraft v4] Image generated (${recraftSize}): ${finalUrl.substring(0, 80)}...`);
                return { imageUrl: finalUrl, model: 'recraft-v4', textResponse: '', warnings: [] };
            })();
            return await Promise.race([generatePromise, timeoutPromise]);
        } catch (error) {
            console.error(`❌ Recraft v4 failed:`, error.message);
            return {
                imageUrl: null, model: selectedModel, textResponse: '', warnings: [],
                modelBusy: true, busyModel: 'recraft-v4',
                errorMessage: error.message || 'Recraft v4 is unavailable. Please try again.',
                errorType: 'error',
            };
        }
    }

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
                    openaiImageGenerate(promptText, aspectRatio, quality, modelKey, 'png', 'opaque', refImageUrls, customSize),
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

    // ── HARD TIMEOUT: 200s default — 2K output + ref images + long prompts need more headroom ──
    // Inner provider has 90s/attempt × 2 attempts = ~181s max. Outer must exceed that.
    const TIMEOUT_MS = timeoutMs || (refImageUrls?.length > 1 ? 220_000 : 200_000);

    // ── Build generation function (callable for retry) ──
    const buildGeneratePromise = () => (async () => {
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
            // Height Crop Penalty: If a native ratio is numerically smaller than the requested ratio,
            // fitting it into the target box via 'cover' will force a vertical crop (slicing off heads).
            // We apply a 2.5x penalty to these ratios to strongly bias the system toward picking
            // a wider native ratio, which results in horizontal side-cropping (much safer for subjects).
            const getDiff = (nativeVal, targetRatio) => {
                const rawDiff = Math.abs(targetRatio - nativeVal);
                return nativeVal < targetRatio ? rawDiff * 2.5 : rawDiff;
            };
            
            let minDiff = getDiff(closestRatio.val, ratio);
            for (let i = 1; i < nativeRatios.length; i++) {
                const diff = getDiff(nativeRatios[i].val, ratio);
                if (diff < minDiff) { 
                    minDiff = diff; 
                    closestRatio = nativeRatios[i]; 
                }
            }
            nativeAspectRatio = closestRatio.str;
            console.log(`📐 Custom ${w}x${h} (ratio ${ratio.toFixed(2)}) → Gemini native ratio '${nativeAspectRatio}' (Height crop penalty applied)`);
        }

        // ── Download reference images as inline buffers for Gemini SDK ──
        let finalImageParts = imageParts || [];
        const lzRefUrls = (refImageUrls || []).filter(u => u && u.startsWith('http'));

        // ── Decode base64 data URI reference images directly (no download needed) ──
        const dataUriRefs = (refImageUrls || []).filter(u => u && u.startsWith('data:image/'));
        if (dataUriRefs.length > 0) {
            for (const dataUri of dataUriRefs) {
                try {
                    const commaIdx = dataUri.indexOf(',');
                    if (commaIdx > -1) {
                        const mimeMatch = dataUri.match(/^data:(image\/[^;]+)/);
                        const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
                        const b64Data = dataUri.substring(commaIdx + 1);
                        finalImageParts.push({ inlineData: { mimeType, data: b64Data } });
                    }
                } catch (e) {
                    console.warn(`⚠️ Failed to decode base64 ref image: ${e.message}`);
                }
            }
            console.log(`📎 Decoded ${dataUriRefs.length} base64 data URI(s) as inline image parts for Gemini`);
        }

        if (lzRefUrls.length > 0) {
            // ⚡ PERF: Download ALL reference images in parallel (was sequential — saved 10-25s)
            console.log(`📥 Downloading ${lzRefUrls.length} reference images for Gemini in parallel...`);
            const sharp = await getSharp();
            const refDownloads = lzRefUrls.map(async (url) => {
                try {
                    const cached = getCachedImageBuffer(url);
                    if (cached) {
                        console.log(`⚡ Cache HIT for ref image: ${url.substring(0, 60)}...`);
                        return { inlineData: { mimeType: cached.mimeType, data: cached.buffer } };
                    }

                    // ⚡ OPT 5: HEAD-check before full download — skip 404s instantly (saves 5-15s)
                    try {
                        const headResp = await presignedFetch(url, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
                        // S3 presigned URLs are signed for GET. A HEAD request will return 403 SignatureDoesNotMatch.
                        if (headResp && !headResp.ok && headResp.status !== 403 && headResp.status !== 405) {
                            console.warn(`⚡ Skipping dead ref URL (HTTP ${headResp.status}): ${url.substring(0, 60)}`);
                            return null;
                        }
                    } catch (_) { /* HEAD failed — try full download anyway */ }
                    
                    // ⚡ OPT 7: Reduced timeout 15s → 8s — broken CDNs fail faster
                    const resp = await presignedFetch(url, { signal: AbortSignal.timeout(8000) });
                    if (resp && resp.ok) {
                        const buf = await resp.arrayBuffer();
                        const ct = resp.headers.get('content-type') || 'image/jpeg';
                        const origKB = Math.round(buf.byteLength / 1024);

                        // Resize to 1024px max — preserves product labels, textures, and fine details
                        // that 512px destroyed. 85% JPEG retains color accuracy for brand fidelity.
                        let finalBuf = Buffer.from(buf);
                        let finalMime = ct;
                        try {
                            finalBuf = await sharp(finalBuf)
                                .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
                                .jpeg({ quality: 85 })
                                .toBuffer();
                            finalMime = 'image/jpeg';
                        } catch (_) { /* compression failed — use original */ }
                        
                        const b64Data = finalBuf.toString('base64');
                        const compKB = Math.round(finalBuf.byteLength / 1024);
                        console.log(`✅ Ref image: ${origKB}KB → ${compKB}KB (${url.substring(0, 50)}...)`);
                        setCachedImageBuffer(url, b64Data, finalMime);
                        
                        return { inlineData: { mimeType: finalMime, data: b64Data } };
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

        // ⚡ SPEED/QUALITY: Truncate overly long prompts — prompts >2000 chars drastically increase Gemini latency
        // BUT if we have reference images, we MUST preserve the Visual Grounding, otherwise the model hallucinates the product.
        let optimizedPrompt = promptText;
        const isTemplatePrompt = promptText.includes('TEMPLATE INPAINTING');
        if (optimizedPrompt.length > 2000 && !isTemplatePrompt) {
            const origLen = optimizedPrompt.length;
            const hasRefs = finalImageParts && finalImageParts.length > 0;
            
            if (hasRefs) {
                // Keep VISUAL GROUNDING and REFERENCE IMAGES because they are critical for fidelity
                optimizedPrompt = optimizedPrompt
                    .replace(/ENGINEERING NOTES:[\s\S]*?(?=\n[A-Z]|\n\n[A-Z]|$)/i, '')
                    .replace(/\n{3,}/g, '\n\n')
                    .trim();
                // If STILL over 3500, then we do a harder cap but keep the start and end
                if (optimizedPrompt.length > 3500) {
                    const typoMatch = optimizedPrompt.match(/═══ CRITICAL TEXT RENDERING INSTRUCTIONS ═══[\s\S]*$/);
                    const typoBlock = typoMatch ? typoMatch[0] : '';
                    if (typoBlock) {
                         optimizedPrompt = optimizedPrompt.substring(0, 3450 - typoBlock.length) + '\n\n[...condensed]\n\n' + typoBlock;
                    } else {
                         optimizedPrompt = optimizedPrompt.substring(0, 3450) + '\n\n[...condensed]';
                    }
                }
            } else {
                // Strip verbose sections that add latency without quality improvement when no refs are used
                optimizedPrompt = optimizedPrompt
                    .replace(/VISUAL GROUNDING \(from real product\/brand photos\):[\s\S]*?(?=\n[A-Z]|\n\n[A-Z]|$)/i, '')
                    .replace(/ENGINEERING NOTES:[\s\S]*?(?=\n[A-Z]|\n\n[A-Z]|$)/i, '')
                    .replace(/REFERENCE IMAGE \d+ \([^)]*\):[^\n]*(?:\n(?!\n|[A-Z]{2,}).*?)*/g, '')
                    .replace(/\n{3,}/g, '\n\n')
                    .trim();
                // ⚡ PERF: Increased from 1500 -> 3500 because the copywriter text is appended at the very end.
                // Truncating at 1500 causes the image model to silently lose all text typography instructions.
                if (optimizedPrompt.length > 3500) {
                    const typoMatch = optimizedPrompt.match(/═══ CRITICAL TEXT RENDERING INSTRUCTIONS ═══[\s\S]*$/);
                    const typoBlock = typoMatch ? typoMatch[0] : '';
                    if (typoBlock) {
                         optimizedPrompt = optimizedPrompt.substring(0, 3450 - typoBlock.length) + '\n\n[...condensed]\n\n' + typoBlock;
                    } else {
                         optimizedPrompt = optimizedPrompt.substring(0, 3450) + '\n\n[...condensed for speed]';
                    }
                }
            }
            console.log(`⚡ Prompt optimized: ${origLen} → ${optimizedPrompt.length} chars (refs: ${hasRefs})`);
        }

        // ── Inject explicit image role labels when template refs are present ──
        // Without this, Gemini treats reference images as vague style inspiration
        // instead of mandatory visual references to faithfully reproduce.
        const refCount = finalImageParts.length;
        let finalPromptForModel = optimizedPrompt;
        const isTemplateInpainting = optimizedPrompt.includes('TEMPLATE INPAINTING');
        if (refCount > 0 && !isTemplateInpainting) {
            const imageRolePreamble = [
                `\nREFERENCE IMAGES PROVIDED (${refCount} image${refCount > 1 ? 's' : ''}):`,
            ];
            // Label each image by its position
            for (let i = 0; i < refCount; i++) {
                if (i === 0) {
                    imageRolePreamble.push(`- IMAGE ${i + 1}: PRODUCT REFERENCE — Your output MUST feature this EXACT product. Reproduce its shape, colors, labels, textures, and proportions with maximum fidelity. Do NOT substitute or hallucinate a different product.`);
                } else {
                    imageRolePreamble.push(`- IMAGE ${i + 1}: ADDITIONAL REFERENCE — Use this for face/avatar preservation or style guidance. Maintain the person's likeness, skin tone, and features accurately.`);
                }
            }
            imageRolePreamble.push(`CRITICAL: The reference images are the GROUND TRUTH. Your generated image must be visually consistent with them.\n`);
            finalPromptForModel = imageRolePreamble.join('\n') + '\n' + optimizedPrompt;
            console.log(`📌 [RefLabels] Injected ${refCount} image role label(s) into prompt preamble`);
        }

        // ── Generate via Atlas Cloud (NanoBanana 2) or native Gemini fallback ──
        // Atlas Cloud is the primary proxy. laozhangImageGenerate internally routes through Atlas Cloud.
        const { laozhangImageGenerate: imageGen, laozhangMultimodalImageGenerate: multimodalGen } = await import('../agents/videoStudio/laozhangClient.js');
        const pixelSize = (() => {
            // Map aspectRatio to a pixel size string for the proxy
            const sizeMap = { '1:1': '1024x1024', '16:9': '1344x768', '9:16': '768x1344', '4:5': '896x1120', '3:4': '896x1184', '4:3': '1184x896', '3:2': '1248x832', '2:3': '832x1248' };
            return sizeMap[nativeAspectRatio] || '1024x1024';
        })();

        console.log(`🚀 Generating image via Atlas Cloud (${LZ_IMAGE_MODEL})... (prompt: ${finalPromptForModel.length} chars, refs: ${refCount})`);

        let routerResult;
        try {
            // Atlas Cloud path — supports gemini-3.1-flash-image-preview (NanoBanana 2)
            const genResult = refCount > 0
                ? await multimodalGen(finalPromptForModel, finalImageParts.map(p => p.inlineData ? `data:${p.inlineData.mimeType};base64,${p.inlineData.data}` : null).filter(Boolean), { model: LZ_IMAGE_MODEL, size: pixelSize })
                : await imageGen(finalPromptForModel, { model: LZ_IMAGE_MODEL, size: pixelSize });
            routerResult = { imageUrl: genResult.imageUrl };
        } catch (atlasErr) {
            console.warn(`⚠️ Atlas Cloud image generation failed, falling back to Native Gemini: ${atlasErr.message}`);
            // Native Gemini fallback — use valid model ID (NOT gemini-3.1-flash-image-preview)
            const result = await router.generateImage({
                prompt: finalPromptForModel,
                aspectRatio: nativeAspectRatio,
                model: NATIVE_GEMINI_IMAGE_MODEL,
                imageParts: finalImageParts,
                size: imageSize
            }, { provider: 'gemini' });
            routerResult = result;
        }

        return {
            imageUrl: routerResult.imageUrl,
            model: selectedModel,
            provider: 'gemini',
            textResponse: '',
            warnings: [],
        };
    })();

    // ── Outer retry loop: retry once on timeout (inner provider may have been mid-generation) ──
    for (let outerAttempt = 1; outerAttempt <= 2; outerAttempt++) {
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Image generation timed out after ${Math.round(TIMEOUT_MS / 1000)} seconds. Please try again.`)), TIMEOUT_MS)
        );

        try {
            const genPromise = outerAttempt === 1 ? buildGeneratePromise() : buildGeneratePromise();
            return await Promise.race([genPromise, timeoutPromise]);
        } catch (error) {
            const isTimeout = error.message?.includes('timed out');

            if (isTimeout && outerAttempt === 1) {
                console.warn(`⏱️ Image generation timed out (outer attempt 1/2) — retrying with fresh connection...`);
                continue;
            }

            console.error(`❌ Image generation failed (${NATIVE_GEMINI_IMAGE_MODEL}):`, error.message);

            return {
                imageUrl: null,
                model: selectedModel,
                textResponse: '',
                warnings: [],
                modelBusy: true,
                busyModel: NATIVE_GEMINI_IMAGE_MODEL,
                errorMessage: isTimeout
                    ? `Image generation timed out (${Math.round(TIMEOUT_MS / 1000)}s). Google servers may be slow — please try again.`
                    : (error.message?.includes('BUSY') ? 'Gemini is busy, please try again later.' : error.message || 'Image generation failed. Please try again.'),
                errorType: isTimeout ? 'timeout' : 'busy',
            };
        }
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

const promptCache = new Map(); // hash → { enhanced, ts }
const PROMPT_CACHE_TTL = 3600_000; // 1 hour
router.post('/enhance-prompt', protect, requireCredits('promptEnhance'), async (req, res) => {
    try {
        const { brandId, prompt, style, format, referenceDescriptions, aspectRatio, imageModel } = req.body;
        if (!prompt) return res.status(400).json({ success: false, error: 'Prompt is required' });
        if (!brandId) return res.status(400).json({ success: false, error: 'Brand ID is required for enhancement' });
        if (!brandId) return res.status(400).json({ success: false, error: 'Brand ID is required for enhancement' });

        const hash = createHash('md5').update(prompt + brandId + (style || '') + (format || '') + (imageModel || '')).digest('hex');
        const cached = promptCache.get(hash);
        if (cached && Date.now() - cached.ts < PROMPT_CACHE_TTL) {
            console.log(`✨ [EnhancePrompt] Cache hit for brief: "${prompt.substring(0, 60)}..."`);
            return res.json({ success: true, enhancedPrompt: cached.enhanced, cached: true, agenticEnhanced: true });
        }

        console.log(`✨ [EnhancePrompt] Running full agentic pipeline for brief: "${prompt.substring(0, 60)}..." → format: ${format}, model: ${imageModel || 'nanobanana-2'}`);

        // Import the full agentic pipeline runner
        const { runCreativePipeline } = await import('../agents/creativeStudio/nodes.js');

        // Run pipeline in FAST mode — Brand Intel + Visual Grounding + Unified Creative Engine (Claude Sonnet)
        // This is the same pipeline used during image generation, just without the image generation step
        const pipelineResult = await runCreativePipeline({
            brandId,
            brief: prompt.trim(),
            format: format || 'instagram-post',
            aspectRatio: aspectRatio || '1:1',
            style: style || '',
            imageModel: imageModel || 'nanobanana-2',
            mode: 'fast',        // uses unifiedCreativeEngineNode (Art Director + PE + Copywriter + Typographer in 1 Claude call)
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
        // The grounding block is now front-loaded with this header:
        const groundingIdx = cleanPrompt.indexOf('VISUAL GROUND TRUTH (from real product/brand photos');
        if (groundingIdx !== -1) {
            // Find where the actual image prompt starts (after the grounding block)
            const promptStartIdx = cleanPrompt.indexOf('\n\n', groundingIdx);
            if (promptStartIdx !== -1) {
                cleanPrompt = cleanPrompt.substring(promptStartIdx).trim();
            } else {
                // Robust line-by-line fallback if double-newline is somehow missing
                const lines = cleanPrompt.split('\n');
                const nonGroundingLines = lines.filter(line => {
                    const l = line.trim();
                    return !l.startsWith('VISUAL GROUND TRUTH') &&
                           !l.startsWith('Product appearance:') &&
                           !l.startsWith('Accurate product colours:') &&
                           !l.startsWith('Material / finish:') &&
                           !l.startsWith('CRITICAL:') &&
                           !l.startsWith('DO NOT SHOW:');
                });
                cleanPrompt = nonGroundingLines.join('\n').trim();
            }
        }

        console.log(`✨ [EnhancePrompt] Done in ${pipelineResult.pipelineTimeMs}ms — enhanced from ${prompt.length} to ${cleanPrompt.length} chars`);
        console.log(`✨ [EnhancePrompt] Design trend: ${pipelineResult.artDirection?.designTrend || pipelineResult.engineeredPrompt?.engineeringNotes?.substring(0, 60) || 'N/A'}`);

        const responsePayload = {
            success: true,
            enhancedPrompt: cleanPrompt,
            agenticEnhanced: true,
            // Surface the creative intelligence to the UI
            designTrend: pipelineResult.artDirection?.designTrend || null,
            mood: pipelineResult.artDirection?.mood || null,
            productMatched: pipelineResult.matchedProduct?.title || null,
            engineeringNotes: pipelineResult.engineeredPrompt?.engineeringNotes || null,
            pipelineTimeMs: pipelineResult.pipelineTimeMs,
        };

        promptCache.set(hash, { enhanced: cleanPrompt, ts: Date.now() });

        res.json(responsePayload);
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
router.post('/generate', protect, requireStudio('creativeStudio'), requireCredits('creative'), aiGenerationLimiter, async (req, res) => {
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

        const creativeObj = creative.toObject();
        creativeObj.imageUrl = await getSignedUrlIfNeeded(creativeObj.imageUrl);
        creativeObj.thumbnailUrl = await getSignedUrlIfNeeded(creativeObj.thumbnailUrl);

        res.json({ success: true, creative: creativeObj });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// GET /api/creatives/image-bank — List all saved images for image bank view
router.get('/image-bank', protect, async (req, res) => {
    try {
        const { brandId, limit = 30, page = 1, category, source } = req.query;

        const match = { user: req.user._id, imageUrl: { $exists: true, $ne: '' } };
        if (brandId) match.brand = new mongoose.Types.ObjectId(brandId);

        // Source/type filtering — used by logo history loader
        if (source) {
            match.type = source; // e.g. 'campaign-logo'
        } else if (category === 'uploaded') {
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

        // HTTP URL — redirect (pre-sign if it's our S3 URL to avoid private bucket 403 blocks)
        const signedUrl = await getSignedUrlIfNeeded(creative.imageUrl);
        res.redirect(signedUrl);
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

        const creativeObj = creative.toObject();
        creativeObj.imageUrl = await getSignedUrlIfNeeded(creativeObj.imageUrl);
        creativeObj.thumbnailUrl = await getSignedUrlIfNeeded(creativeObj.thumbnailUrl);

        res.json({ success: true, creative: creativeObj });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/creatives/virtual-tryon — Virtual Try-On (Gemini preview + fal.ai Kolors HD)
// ══════════════════════════════════════════════════════════════════════════════
const FAL_QUEUE_URL = 'https://queue.fal.run';

router.post('/virtual-tryon', protect, requireStudio('creativeStudio'), requireCredits('creative'), aiGenerationLimiter, async (req, res) => {
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

            const signedUrl = await getSignedUrlIfNeeded(imageUrl);
            return res.json({ success: true, status: 'completed', imageUrl: signedUrl });
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
                    responseModalities: ['IMAGE', 'TEXT'],
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

        // ── Debug: log response structure ──
        const candidate = data.candidates?.[0];
        const finishReason = candidate?.finishReason || 'UNKNOWN';
        const safetyRatings = candidate?.safetyRatings || [];
        const promptFeedback = data.promptFeedback;

        console.log(`📋 Gemini edit response: finishReason=${finishReason}, candidates=${data.candidates?.length || 0}`);
        if (promptFeedback?.blockReason) {
            console.error(`🚫 Gemini BLOCKED edit: blockReason=${promptFeedback.blockReason}`);
            return res.status(400).json({
                success: false,
                error: `Image editing was blocked by the AI safety filter (${promptFeedback.blockReason}). Try a different edit instruction.`
            });
        }
        if (finishReason === 'SAFETY') {
            const blockedCategories = safetyRatings
                .filter(r => r.probability === 'HIGH' || r.blocked)
                .map(r => r.category?.replace('HARM_CATEGORY_', ''))
                .join(', ');
            console.error(`🚫 Gemini edit blocked by safety: ${blockedCategories}`);
            return res.status(400).json({
                success: false,
                error: `Image editing was blocked by AI safety filters${blockedCategories ? ` (${blockedCategories})` : ''}. Try rephrasing your edit instruction.`
            });
        }

        // Extract the edited image — check ALL candidates, not just the first
        const allParts = [];
        for (const cand of (data.candidates || [])) {
            for (const part of (cand?.content?.parts || [])) {
                allParts.push(part);
            }
        }

        let editedImageUrl = null;
        let editDescription = '';

        for (const part of allParts) {
            if (part.inlineData?.mimeType?.startsWith('image/') && !part.thought) {
                editedImageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
            if (part.text && !part.thought) {
                editDescription += part.text;
            }
        }

        // ── Retry once with a more explicit prompt if no image returned ──
        if (!editedImageUrl && finishReason !== 'SAFETY') {
            console.warn('⚠️ Gemini returned no image on first attempt. Retrying with explicit instruction...');
            console.log('   Parts received:', allParts.map(p => ({
                hasImage: !!p.inlineData,
                hasText: !!p.text,
                thought: !!p.thought,
                mime: p.inlineData?.mimeType
            })));

            // Retry with a stronger instruction that demands image output
            const retryContents = [
                { role: 'user', parts: [
                    { inlineData: { mimeType: sourceMime, data: sourceBase64 } },
                    { text: `Edit this image: ${editPrompt}\n\nYou MUST output the complete modified image. Do not respond with text only — generate and return the edited image.` }
                ]}
            ];

            try {
                const retryResp = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: retryContents,
                        generationConfig: {
                            responseModalities: ['IMAGE', 'TEXT'],
                            temperature: 0.4,
                        },
                    }),
                });
                const retryData = await retryResp.json();

                if (!retryData.error) {
                    for (const cand of (retryData.candidates || [])) {
                        for (const part of (cand?.content?.parts || [])) {
                            if (part.inlineData?.mimeType?.startsWith('image/') && !part.thought && !editedImageUrl) {
                                editedImageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                                console.log('✅ Retry succeeded — got edited image');
                            }
                            if (part.text && !part.thought) editDescription += part.text;
                        }
                    }
                }
            } catch (retryErr) {
                console.warn('⚠️ Retry also failed:', retryErr.message);
            }
        }

        if (!editedImageUrl) {
            console.error('❌ Gemini returned no image after retry. finishReason:', finishReason,
                'Parts:', allParts.map(p => ({ hasImage: !!p.inlineData, hasText: !!p.text, thought: !!p.thought })));
            const textResponse = editDescription.trim();
            return res.status(500).json({
                success: false,
                error: textResponse
                    ? `Image editing failed — the AI responded with text instead of an image: "${textResponse.substring(0, 200)}"`
                    : 'Image editing failed — the AI did not return an edited image. Try a different edit instruction.'
            });
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

        // ── Step 2: AI Art Director — Generates UNIQUE creative direction each time ──
        // No hardcoded mood presets. The AI generates a fresh, contextual mood for every
        // generation based on brand DNA, product type, user brief, and variation profile.
        // This ensures genuinely diverse creative output — no two shots look the same.

        // ── AI Agent: Extract product identity + generate taglines + generate mood ──
        // Detect whether the brief is a detailed composition analysis from the Smart Direction feature
        const briefIsComposition = brief && (brief.length > 100 || /layout|typolog|composition|typography|positioned|placed/i.test(brief));
        
        let detectedProductName = productName || '';
        let tagline1 = primaryTagline || '';
        let tagline2 = secondaryTagline || '';
        let detectedCategory = brandCategory;
        // AI-generated mood (unique every time)
        let aiMood = {
            env: 'premium cinematic product setting, atmospheric depth, volumetric light',
            lighting: 'cinematic studio lighting with dramatic contrast and rim highlights',
            surface: 'premium reflective surface with subtle material texture',
            palette: brandColors.length > 0
                ? brandColors.slice(0, 3).map(c => c.name || c.hex).join(', ')
                : 'premium dark tones with selective highlights',
        };

        try {
            const aiRouter = getRouter();
            const agentPrompt = `You are a world-class Creative Director, Cinematographer, and Copywriter for premium brand advertising.

Brand: ${brandName}
Industry/Category: ${brandCategory}
Brand Description: ${brandDescription}
Brand Tagline: ${brandTagline}
Brand Colors: ${brandColors.length > 0 ? brandColors.map(c => c.name || c.hex).join(', ') : 'not specified'}
Product Name (if known): ${detectedProductName || 'detect from context'}
User Brief: ${brief || 'cinematic product poster, brand campaign'}
${briefIsComposition ? `
IMPORTANT: The user brief above is a DETAILED COMPOSITION ANALYSIS from a reference template. Your mood, lighting, environment, and surface MUST align with and SUPPORT the described composition. Extract the visual tone from the brief — do NOT invent a contradictory mood. If the brief describes "bold typography over a model", your env should support that (e.g. clean studio backdrop). If it describes "minimalist layout with white space", do NOT generate a dark moody environment.
` : ''}
Your task: Generate the PERFECT art direction elements for a cinematic product advertisement poster.
${briefIsComposition ? 'Your mood MUST complement and reinforce the composition described in the brief above.' : 'Be ORIGINAL and UNIQUE — do NOT default to generic dark botanical/noir/moody looks every time.'}
Draw inspiration from the brand's actual industry, the product's personality, and the user's brief.
Think like a Cannes Lions art director — surprise, delight, innovate.

Return ONLY valid JSON:
{
  "productName": "detected or refined product name",
  "category": "product category in CAPS (e.g. 'SKINCARE', 'BEVERAGE', 'ELECTRONICS')",
  "tagline1": "primary brand tagline (4-6 words max, powerful)",
  "tagline2": "secondary descriptive line (3-5 words)",
  "perspectiveTypo": "single brand word for large perspective typography",
  "productDescription": "one sentence description of the product for prompt context",
  "arrangementNote": "how to arrange the products for maximum visual impact",
  "mood": {
    "env": "a SPECIFIC, VIVID, UNIQUE environment/scene description (15-30 words). ${briefIsComposition ? 'MUST align with the composition analysis provided in the brief.' : 'Be creative — don\'t always default to \'dark moody\'. Consider: sunlit terrazzo, golden hour desert, rain-soaked neon streets, frosted glass atelier, volcanic obsidian cave, tropical sunrise, etc.'}",
    "lighting": "specific lighting setup description (10-20 words). ${briefIsComposition ? 'Match the lighting described or implied by the composition analysis.' : 'Vary between: butterfly lighting, Rembrandt, split light, golden hour backlight, neon cross-light, overhead softbox, natural window light, etc.'}",
    "surface": "the surface/base the product sits on (8-15 words). Be inventive — wet marble, cracked earth, silk drape, terrazzo, raw concrete, frosted glass, etc.",
    "palette": "3-5 specific color names that suit THIS brand and THIS mood (not always dark). Use the brand's actual colors when relevant."
  }
}`;

            const aiResult = await aiRouter.generateText({
                systemPrompt: 'You are a creative director. Output valid JSON only. No markdown, no explanation. ' + 
                    (briefIsComposition 
                        ? 'The user has provided a detailed composition brief. Your mood, lighting, and environment MUST align with and support this brief. Do NOT contradict the composition structure described.'
                        : 'Be CREATIVE and VARIED — never repeat the same mood twice.'),
                userPrompt: agentPrompt,
                temperature: briefIsComposition ? 0.4 : 0.85,
                maxTokens: 700,
            });

            const aiText = (aiResult.text || '').replace(/```json|```/gi, '').trim();
            const jsonMatch = aiText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                detectedProductName = parsed.productName || detectedProductName || brandName;
                tagline1 = primaryTagline || parsed.tagline1 || brandTagline || 'PREMIUM QUALITY';
                tagline2 = secondaryTagline || parsed.tagline2 || '';
                detectedCategory = parsed.category || brandCategory;
                // Extract AI-generated mood
                if (parsed.mood) {
                    aiMood = {
                        env: parsed.mood.env || aiMood.env,
                        lighting: parsed.mood.lighting || aiMood.lighting,
                        surface: parsed.mood.surface || aiMood.surface,
                        palette: parsed.mood.palette || aiMood.palette,
                    };
                }
                console.log(`   🎯 AI Art Director: ${detectedProductName} | ${tagline1} | ${tagline2}`);
                console.log(`   🎨 AI Mood: env="${aiMood.env.substring(0, 60)}..." | palette="${aiMood.palette}"`);
            }
        } catch (agentErr) {
            console.warn('⚠️ Campaign Shot AI agent failed, using fallbacks:', agentErr.message);
            detectedProductName = productName || brandName;
            tagline1 = primaryTagline || brandTagline || 'PREMIUM QUALITY';
            tagline2 = secondaryTagline || 'Crafted for Excellence';
        }

        // If user provided a custom brief, weave it into the AI mood
        if (brief && brief.trim()) {
            aiMood.env = `${brief.trim()} — ${aiMood.env}`;
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

        // ── Build explicit image reference instructions for the prompt ──
        // AI models need explicit per-image labels to understand what each reference is for.
        // IMAGE 1 is always the product. IMAGE 2+ are character or style refs.
        let imageRefBlock = '';
        let imgIdx = 1;
        // Product image (always provided — it's required)
        imageRefBlock += `\nREFERENCE IMAGE ${imgIdx} (PRODUCT): This is the hero product — "${detectedProductName}". Place this EXACT product (same bottle/packaging shape, same label, same colors) as the centrepiece of the advertisement. Reproduce its design faithfully.\n`;
        imgIdx++;

        if (hasCharacter) {
            imageRefBlock += `\nREFERENCE IMAGE ${imgIdx} (CHARACTER/MODEL — CRITICAL): This is the person/model to feature in the advertisement. You MUST replicate this person's EXACT face, skin tone, hair color, hair style, facial features, body type, clothing style, and overall appearance. Preserve their POSE, STYLING, and BODY LANGUAGE from this reference — if they are sitting, show them sitting; if they are leaning, show them leaning; if they wear a specific outfit, replicate that outfit style. Do NOT generate a different person or change their posture. The model in the output must be clearly recognisable as the same individual in the same style and pose.\n`;
            imgIdx++;
        }

        if (hasRef) {
            imageRefBlock += `\nREFERENCE IMAGE ${imgIdx} (TEMPLATE — LAYOUT BLUEPRINT): This is the DESIGN TEMPLATE to replicate. You must match its EXACT layout structure: where text is positioned, how large the typography is, where the photo/model is placed, how elements overlap, the background color blocking, and the overall visual composition. This is NOT just a mood reference — it is the LAYOUT you must follow. Replace the template's placeholder content with ${brandName}'s brand content while keeping the same design structure.\n`;
            imgIdx++;
        }

        // ── Style transfer block — injected only when a style ref is provided ──
        // When a template/reference image is given, it must be treated as the LAYOUT BIBLE.
        // The AI must replicate the exact composition, typography placement, color blocking,
        // and visual structure — not just the mood/color grading.
        const styleRefBlock = hasRef ? `
═══ TEMPLATE REPLICATION DIRECTIVE (ABSOLUTE HIGHEST PRIORITY) ═══
A TEMPLATE/STYLE REFERENCE image has been provided (see REFERENCE IMAGE ${hasCharacter ? 3 : 2} above).
You MUST treat this reference as a LAYOUT BLUEPRINT — replicate its EXACT visual structure:

  LAYOUT STRUCTURE (CRITICAL):
  • Replicate the EXACT position and size of text elements — if the reference has giant text in the center, YOUR output must have giant text in the center
  • Replicate the EXACT position of the photo/model — if cropped to one side, do the same; if full-bleed behind text, do the same
  • Replicate the EXACT placement of brand name, date, location elements — if in corners, put them in corners
  • Replicate the EXACT text-to-image relationship — if text overlaps the photo, overlap it; if text is beside the photo, keep it beside

  TYPOGRAPHY STYLE (CRITICAL):
  • Match the EXACT typography weight, size ratio, and casing from the reference
  • If the reference has BOLD CONDENSED UPPERCASE filling most of the card, do the same
  • If text is opaque and dominant, make it opaque and dominant — do NOT make it semi-transparent unless the reference does
  • Match letter spacing, line height, and text color from the reference

  VISUAL DESIGN:
  • COLOR BLOCKING — replicate the exact background color treatment (solid color fill, gradient, photo-only, etc.)
  • COLOR GRADING — replicate the exact tonal range, saturation, and colour temperature
  • PHOTO TREATMENT — replicate how the photo blends with the background (blend modes, overlay, hard crop, etc.)
  • COMPOSITION RATIOS — replicate the proportional space allocated to text vs. image vs. background

  WHAT TO CHANGE (replace with brand content):
  • Replace placeholder text (e.g. "X BRAND", "STEP IN") with ${brandName} and the taglines provided below
  • Replace placeholder imagery with the PRODUCT from REFERENCE IMAGE 1
  • Apply ${brandName}'s brand colors where the reference uses its brand colors

  WHAT NOT TO CHANGE:
  • Do NOT rearrange the layout — keep the same visual hierarchy and element positions
  • Do NOT change the typography style — if the reference uses bold condensed caps, use bold condensed caps
  • Do NOT add elements that aren't in the reference (no extra perspective text, no extra floating elements)
  • Do NOT default to a generic "cinematic product shot" — commit fully to the reference's design language

THE OUTPUT MUST LOOK LIKE A DIRECT ADAPTATION OF THE REFERENCE IMAGE — same layout, same style, different brand content.
═════════════════════════════════════════════════════════════` : '';

        const masterPrompt = hasRef
            // ── TEMPLATE MODE: Reference image drives the entire layout ──
            ? `${detectedCategory} advertisement — ${brandName} ${detectedProductName}

${imageRefBlock}
${styleRefBlock}

BRAND CONTENT TO INSERT (replace template placeholders):
  • Brand name: ${brandName}
  • Product name: ${detectedProductName}
  • Primary headline: "${tagline1}"
  • Secondary line: "${tagline2}"
  • Font family: ${brandFont}

${hasCharacter ? `CHARACTER/MODEL: Use the provided character reference image. The person MUST match the reference — same face, same features. Position them in the same way the template positions its model/person.` : `PRODUCT: Place the product from REFERENCE IMAGE 1 where the template positions its hero element. Match the product's scale and placement to the template's composition.`}

TECHNICAL: ultra-realistic, premium commercial advertising finish, razor-sharp detail, ${canvasSize}
OUTPUT: full bleed, edge-to-edge composition, no borders, no watermarks, no frames

${brief ? `CREATIVE BRIEF: ${brief}` : ''}`

            // ── ORIGINAL MODE: AI Art Director drives the creative ──
            // When brief contains a detailed composition analysis (from Smart Direction),
            // elevate it as the PRIMARY prompt directive instead of generic variation profiles.
            : briefIsComposition
                ? `${detectedCategory} advertisement — ${brandName} ${detectedProductName}

${imageRefBlock}

═══ COMPOSITION DIRECTIVE (PRIMARY — from AI visual analysis) ═══
${brief}
═════════════════════════════════════════════════════════════

You MUST follow the composition structure described above. This is the AUTHORITATIVE layout specification.

BRAND CONTENT:
  • Brand name: ${brandName}
  • Product name: ${detectedProductName}
  • Primary headline: "${tagline1}"
  • Secondary line: "${tagline2}"
  • Font family: ${brandFont}

${hasCharacter ? `CHARACTER/MODEL: Use the provided character reference image. The person MUST match the reference — same face, same features, same pose, same styling, same clothing. Preserve their body language exactly as shown.` : `PRODUCT: Place the product from REFERENCE IMAGE 1 as the hero element. Match scale and placement to the described composition.`}

ENVIRONMENT: ${aiMood.env}
LIGHTING: ${aiMood.lighting}
COLOR PALETTE: ${aiMood.palette}

TECHNICAL: ultra-realistic, premium commercial advertising finish, razor-sharp detail, ${canvasSize}
STYLE: magazine-grade product photography, Cannes Lions advertising quality
OUTPUT: full bleed, edge-to-edge composition, no borders, no watermarks, no frames`

                : `Cinematic ${detectedCategory} advertisement — ${brandName} ${detectedProductName}

${imageRefBlock}
PRODUCT ARRANGEMENT: ${hasCharacter ? `Premium product displayed alongside the provided character/model (see CHARACTER reference image above). The person MUST match the reference — same face, same features, same pose, same styling. Position them elegantly with the product.` : variation.arrangementOverride} Show all products clearly with their labels and branding fully visible.

${variation.compositionNote}

BRANDING (top center): ${brandName} logo area, product name "${detectedProductName}" in clean brand typography${brandFont !== 'modern sans-serif' ? `, using ${brandFont} font family` : ''}

ENVIRONMENT: ${aiMood.env}

LIGHTING: ${aiMood.lighting}

${(brief && (brief.length > 50 || brief.toLowerCase().includes('watermark'))) ? '' : `PERSPECTIVE TYPOGRAPHY (PRIMARY): large semi-transparent "${brandName.toUpperCase()}" text extending deep into the background, softly diffused and interacting with the environment, creating dimensional depth\n`}
SECONDARY TYPOGRAPHY (clean brand font):
"${tagline1}"
"${tagline2}"

SURFACE: ${aiMood.surface}

COLOR PALETTE: ${aiMood.palette}

TECHNICAL: ultra-realistic, premium commercial advertising finish, razor-sharp product detail, ${canvasSize}
STYLE: magazine-grade product photography, Cannes Lions advertising quality, cinematic color grade
OUTPUT: full bleed, edge-to-edge composition, no borders, no watermarks, no frames

${brief ? `CREATIVE BRIEF: ${brief}` : ''}`;

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
        // Campaign-shot calls routedImageGenerate DIRECTLY (not via internalGenerateCreative).
        // Reason: internalGenerateCreative runs an agentic pipeline that overwrites the
        // carefully art-directed masterPrompt, stripping out per-image reference labels
        // (character face preservation, product matching, style reference instructions).
        // Campaign-shot already handles its own Creative/Job records, so the pipeline is redundant.
        (async () => {
            let generatedImageUrl = null;
            let usedModel = imageModel;
            let genError = null;

            console.log(`   🖼️ Campaign Shot DIRECT generation: model=${imageModel} | variation=${variation.label}`);

        try {
            // ── Upload base64 data URIs to S3 so routedImageGenerate can download them ──
            const rawRefImages = [productImage, characterImage, refImage].filter(Boolean);
            const refImageUrls = await Promise.all(rawRefImages.map(async (img, idx) => {
                if (img.startsWith('data:image/')) {
                    try {
                        const label = idx === 0 ? 'product' : idx === 1 ? 'character' : 'styleref';
                        const s3Key = `campaign-shot/${brandId || 'unknown'}/${Date.now()}-${label}-${Math.random().toString(36).slice(2, 6)}.png`;
                        const s3Url = await uploadToS3(img, s3Key);
                        console.log(`   ✅ Uploaded ${label} base64 → S3: ${s3Url.substring(0, 80)}...`);
                        return s3Url;
                    } catch (s3Err) {
                        console.warn(`   ⚠️ S3 upload failed for campaign-shot ref (falling back to base64): ${s3Err.message}`);
                        return img; // fallback — routedImageGenerate handles data URIs too
                    }
                }
                return img; // already an HTTP URL
            }));
            console.log(`   🖼️ Campaign Shot ref images: ${refImageUrls.length} total | prompt length: ${masterPrompt.length} chars`);

            // ── Handle non-standard aspect ratios (21:9 etc.) — compute custom crop size ──
            const [arW, arH] = aspectRatio.split(':').map(Number);
            const standardRatios = ['1:1','4:5','9:16','16:9','2:3','3:4','4:3','3:2','5:4','2:1','1:2'];
            const isStandardRatio = standardRatios.includes(aspectRatio);
            const customSizeForCrop = (!isStandardRatio && arW && arH)
                ? { width: arW * 80, height: arH * 80 }   // e.g. 21:9 → 1680x720
                : null;

            // ── Call routedImageGenerate with retry + model fallback ──
            // Campaign shots are heavy (multi-image + long prompt), so:
            //   1. Use a generous 180s timeout (vs default 90s)
            //   2. If the primary model fails, skip retry and go directly to fallback
            const CAMPAIGN_TIMEOUT = 180_000; // 3 minutes for multi-image generation
            const fallbackModel = (imageModel === 'gpt-image-2' || imageModel === 'gpt-image-1')
                ? 'nanobanana-2'   // GPT → fall back to Gemini
                : 'gpt-image-2';  // Gemini → fall back to GPT-image-2

            const modelsToTry = [
                { model: imageModel, label: 'primary' },
                { model: fallbackModel, label: 'fallback' },
            ];

            for (const { model, label } of modelsToTry) {
                if (generatedImageUrl) break; // Already succeeded
                try {
                    console.log(`   🔄 Campaign Shot [${label}] model=${model}`);
                    const result = await routedImageGenerate(
                        masterPrompt,
                        [],     // imageParts — downloaded from refImageUrls inside
                        variation.tempOverride ?? 0.3,
                        aspectRatio,
                        '1K',
                        model,
                        refImageUrls,
                        customSizeForCrop,  // triggers Sharp crop for non-standard ratios (21:9 etc.)
                        CAMPAIGN_TIMEOUT
                    );

                    if (result.imageUrl) {
                        generatedImageUrl = result.imageUrl;
                        usedModel = result.model || model;
                        console.log(`   ✅ Campaign Shot generated with ${usedModel} [${label}]`);
                    } else if (result.modelBusy) {
                        console.warn(`   ⚠️ Campaign Shot [${label}] ${model} busy/error: ${result.errorMessage}`);
                        genError = result.errorMessage;
                        // Continue to fallback model
                    } else {
                        console.warn(`   ⚠️ Campaign Shot [${label}] ${model} returned no image`);
                        genError = 'No image returned from generation model';
                    }
                } catch (attemptErr) {
                    console.warn(`   ⚠️ Campaign Shot [${label}] ${model} error: ${attemptErr.message}`);
                    genError = attemptErr.message;
                }
            }
        } catch (e) {
            genError = e.message;
            console.error(`   ❌ Campaign Shot generation error:`, e.message);
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
Mood: ${aiMood.env}
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
// POST /api/creatives/analyse-logo-for-animation
// Step 1: Vision-analyses the logo image with Claude multimodal.
// Step 2: Feeds description to LOGO_ANIMATION_DIRECTOR_PROMPT → Seedance 2 brief.
// Returns: { seedancePrompt, motionConcept, logoDescription, animationData }
// ══════════════════════════════════════════════════════════════════════════════
router.post('/analyse-logo-for-animation', protect, requireStudio('creativeStudio'), async (req, res) => {
    try {
        const { imageUrl, logoText = '' } = req.body;
        if (!imageUrl) return res.status(400).json({ success: false, error: 'imageUrl is required' });

        const { LOGO_ANIMATION_DIRECTOR_PROMPT } = await import('../agents/creativeStudio/prompts.js');
        const aiRouter = getRouter();

        console.log(`\n══════ LOGO ANIMATION DIRECTOR ══════`);
        console.log(`🖼️  Logo: ${imageUrl.substring(0, 80)}...`);
        console.log(`📝 LogoText: "${logoText}"`);

        // ── Step 1: Vision analysis ──
        let logoDescription = `A campaign logo/badge design${logoText ? ` with the text "${logoText}"` : ''}.`;
        try {
            const imgResp = await presignedFetch(imageUrl, { signal: AbortSignal.timeout(15000) });
            if (imgResp && imgResp.ok) {
                const imgBuf = Buffer.from(await imgResp.arrayBuffer());
                const mime = imgResp.headers.get('content-type') || 'image/png';
                const visionResult = await aiRouter.generateText({
                    model: 'claude-sonnet-4-6',
                    max_tokens: 300,
                    messages: [{
                        role: 'user',
                        content: [
                            { type: 'image', source: { type: 'base64', media_type: mime, data: imgBuf.toString('base64') } },
                            { type: 'text', text: 'Describe this logo/badge design in 2-3 sentences. Include: typography style, colors, symbolic elements/icons, background treatment, and overall design mood. Be specific — this description feeds an Animation Director.' }
                        ]
                    }]
                });
                const raw = visionResult?.content?.[0]?.text || visionResult?.text || '';
                if (raw.length > 10) logoDescription = raw;
            }
        } catch (e) {
            console.warn('⚠️ [AnimDir] Vision failed, using fallback description:', e.message);
        }

        // ── Step 2: Animation Director ──
        const animInput = LOGO_ANIMATION_DIRECTOR_PROMPT(logoDescription, logoText, '1:1');
        const animResult = await aiRouter.generateText({
            model: 'claude-sonnet-4-6',
            max_tokens: 600,
            messages: [{ role: 'user', content: animInput }]
        });
        const rawAnim = animResult?.content?.[0]?.text || animResult?.text || '';
        let animData = {};
        try {
            const match = rawAnim.match(/\{[\s\S]*\}/);
            if (match) animData = JSON.parse(match[0]);
        } catch { /* keep empty */ }

        const fallbackPrompt = `The ${logoText || 'campaign logo'} badge pulses with golden energy as fine particles drift upward, the icon gently orbits and settles, the bold text materialises with a crisp metallic sheen. Camera locked off with subtle ambient shimmer. Smooth loop, clean edges, high fidelity, no motion blur on text.`;
        console.log(`✅ [AnimDir] Prompt ready (${(animData.seedancePrompt || '').length} chars)`);

        return res.json({
            success: true,
            logoDescription,
            motionConcept: animData.motionConcept || '',
            seedancePrompt: animData.seedancePrompt || fallbackPrompt,
            animationData: animData,
        });
    } catch (err) {
        console.error('❌ [AnimDir] Error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
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

                // Agentic scene enhancement — use Unified Creative Engine to build a richer scene
                // Wrapped with 45s timeout (Claude Sonnet now drives this path)
                try {
                    const mockupPipelineTimeout = new Promise((_, rej) =>
                        setTimeout(() => rej(new Error('Mockup pipeline timeout (45s)')), 45_000)
                    );
                    const pipelineResult = await Promise.race([
                        runCreativePipeline({
                            brandId,
                            brief: `Product lifestyle mockup scene: ${enhancedScene}. Style: professional product photography.`,
                            format: 'lifestyle-mockup',
                            aspectRatio,
                            style: 'photorealistic',
                            imageModel: 'nanobanana-2',
                            mode: 'fast', // Always fast for mockups — speed matters
                        }),
                        mockupPipelineTimeout,
                    ]);
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


router.get('/model-status', protect, async (req, res) => {
    try {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        
        // Find jobs in the last hour (both images and videos)
        const jobs = await GenerationJob.aggregate([
            { $match: { type: { $in: ['ai-create', 'video', 'video-generate'] }, createdAt: { $gte: oneHourAgo } } },
            { 
                $group: { 
                    _id: { $ifNull: ["$options.imageModel", { $ifNull: ["$options.model", "$options.videoModel"] }] },
                    total: { $sum: 1 },
                    failed: { $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] } },
                    completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
                    totalTimeMs: { 
                        $sum: { 
                            $cond: [
                                { $and: [{ $eq: ["$status", "completed"] }, { $ne: [{ $type: "$completedAt" }, "missing"] }, { $ne: [{ $type: "$startedAt" }, "missing"] }] },
                                { $subtract: ["$completedAt", "$startedAt"] },
                                0
                            ] 
                        } 
                    }
                }
            }
        ]);

        const statuses = {};
        
        jobs.forEach(job => {
            const modelId = job._id || 'nanobanana-2'; // default fallback if null
            const completed = job.completed;
            const failed = job.failed;
            const total = job.total;
            const avgTimeMs = completed > 0 ? job.totalTimeMs / completed : 0;
            const avgTimeSec = Math.round(avgTimeMs / 1000);
            const failRate = total > 0 ? failed / total : 0;
            
            let status = 'healthy';
            let message = '';
            
            // Define thresholds
            if (avgTimeSec > 120 || failRate > 0.5) {
                status = 'overloaded';
                message = `Experiencing heavy load (~${Math.max(avgTimeSec, 120)}s)`;
            } else if (avgTimeSec > 45 || failRate > 0.2) {
                status = 'busy';
                message = `High traffic (~${Math.max(avgTimeSec, 45)}s)`;
            }

            statuses[modelId] = {
                status,
                avgTimeSeconds: avgTimeSec,
                failureRate: failRate,
                message
            };
        });

        // Add defaults for models without recent data
        const defaultModels = [
            'nanobanana-2', 'nanobanana-pro', 'flux-pro-v1.1', 'flux-2-pro', 'gpt-image-2', 'grok-imagen', 'seedream-5', 'ideogram', 'gpt-image-1', 'recraft-v4',
            'seedance-2.0', 'seedance-2.0-mini', 'kling-v2-master', 'wan-2.1', 'luma-ray-2', 'happyhorse-1.0', 'happyhorse-1.1', 'gemini-image', 'kling-3.0', 'veo-3.1', 'gemini-flash'
        ];
        defaultModels.forEach(m => {
            if (!statuses[m]) {
                statuses[m] = { status: 'healthy', avgTimeSeconds: 15, failureRate: 0, message: '' };
            }
        });

        res.json({ success: true, statuses });
    } catch (error) {
        console.error('❌ Error fetching model status:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

export default router;

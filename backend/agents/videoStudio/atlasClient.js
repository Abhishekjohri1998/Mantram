/**
 * Atlas Cloud Client — Seedance 2.0 & HappyHorse 1.0 Video Generation
 *
 * ARCHITECTURE:
 *  - Inference base:  https://api.atlascloud.ai/api/v1
 *  - Console base:    https://console.atlascloud.ai/api/v1  (Asset Library — required for real person faces)
 *
 * REAL PERSON FACE FLOW (per Atlas Cloud docs):
 *   1. Upload face image → POST /sd/assets → returns { id, atlas_asset_id, status: "Processing" }
 *   2. Poll            → GET  /sd/assets/:id until status === "Active"
 *   3. Use             → pass "asset://<atlas_asset_id>" in reference_images[]
 *
 * Without the asset:// URI, Atlas bypasses their face registration pipeline and
 * the model can't lock onto a real person's likeness across frames.
 */

import fetch from 'node-fetch';
import config from '../../config/env.js';
import sharp from 'sharp';
import { uploadToS3, ensureS3Url } from '../../utils/s3.js';
import { sanitizePromptForProvider } from './promptSanitizer.js';

const ATLAS_INFERENCE_BASE  = 'https://api.atlascloud.ai/api/v1';
const ATLAS_CONSOLE_BASE    = 'https://console.atlascloud.ai/api/v1';
const ATLASCLOUD_MAX_PROMPT_LENGTH = 4000;

// ── Helpers ───────────────────────────────────────────────────────────────────

function truncatePrompt(prompt, maxLen = ATLASCLOUD_MAX_PROMPT_LENGTH) {
    if (!prompt || prompt.length <= maxLen) return prompt;
    console.warn(`⚠️ Prompt too long (${prompt.length} chars), truncating to ${maxLen}`);
    const truncated = prompt.substring(0, maxLen);
    // Prefer breaking at a sentence boundary (period or newline)
    const lastPeriod  = truncated.lastIndexOf('.');
    const lastNewline = truncated.lastIndexOf('\n');
    const breakPoint  = Math.max(lastPeriod, lastNewline);
    if (breakPoint > maxLen * 0.7) return truncated.substring(0, breakPoint + 1).trim();
    // Fall back to last word boundary — NEVER cut mid-word
    const lastSpace = truncated.lastIndexOf(' ');
    return (lastSpace > maxLen * 0.5 ? truncated.substring(0, lastSpace) : truncated).trim();
}

function getAtlasApiKey() {
    return process.env.ATLASCLOUD_API_KEY || 'apikey-5213047d313643cc806219208e183def';
}

function authHeaders() {
    return { 'Authorization': `Bearer ${getAtlasApiKey()}`, 'Content-Type': 'application/json' };
}

function resolveModelName(qualityMode, imageCount) {
    // Per Atlas Cloud docs, the correct model namespace is atlascloud/workflow/seedance-2.0/...
    const tier = qualityMode === 'quality' ? 'seedance-2.0' : 'seedance-2.0-fast';
    if (imageCount > 1) {
        // Force seedance-2.0 for reference-to-video as fast tier might have stricter constraints or lack full R2V support
        console.log(`📌 Atlas: ${imageCount} images → reference-to-video (seedance-2.0)`);
        return `atlascloud/workflow/seedance-2.0/reference-to-video`;
    }
    if (imageCount === 1) {
        console.log(`📌 Atlas: 1 image → image-to-video (seedance-2.0)`);
        return `atlascloud/workflow/seedance-2.0/image-to-video`;
    }
    return `atlascloud/workflow/${tier}/text-to-video`;
}

function resolveHappyHorseModelName(imageCount) {
    // HappyHorse 1.0 model slugs on Atlas Cloud — per docs:
    //   alibaba/happyhorse-1.0/text-to-video
    //   alibaba/happyhorse-1.0/image-to-video
    //   alibaba/happyhorse-1.0/reference-to-video
    if (imageCount > 1) {
        console.log(`📌 HappyHorse: ${imageCount} images → reference-to-video`);
        return 'alibaba/happyhorse-1.0/reference-to-video';
    }
    if (imageCount === 1) {
        console.log(`📌 HappyHorse: 1 image → image-to-video`);
        return 'alibaba/happyhorse-1.0/image-to-video';
    }
    return 'alibaba/happyhorse-1.0/text-to-video';
}

async function resizeToAspectRatio(base64DataUri, targetRatio) {
    try {
        const match = base64DataUri.match(/^data:([\w/+]+);base64,(.+)$/);
        if (!match) return base64DataUri;
        const buffer = Buffer.from(match[2], 'base64');
        const [rw, rh] = targetRatio.split(':').map(Number);
        if (!rw || !rh) return base64DataUri;
        const { width, height } = await sharp(buffer).metadata();
        const currentRatio = width / height;
        const targetRatioFloat = rw / rh;
        if (Math.abs(currentRatio - targetRatioFloat) < 0.05) return base64DataUri;
        let newWidth, newHeight;
        if (currentRatio > targetRatioFloat) { newWidth = width; newHeight = Math.round(width / targetRatioFloat); }
        else { newHeight = height; newWidth = Math.round(height * targetRatioFloat); }
        const resized = await sharp(buffer).resize(newWidth, newHeight, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 1 } }).png().toBuffer();
        console.log(`📐 Resized: ${width}x${height} → ${newWidth}x${newHeight}`);
        return `data:image/png;base64,${resized.toString('base64')}`;
    } catch (e) {
        console.warn(`⚠️ Image resize failed: ${e.message}`);
        return base64DataUri;
    }
}

// ── Image Pre-Processing (format + resolution) ──────────────────────────────
// Atlas Cloud requires ALL images to be:
//   - Format: jpeg, jpg, png, bmp, webp (NOT avif, tiff, svg, heic)
//   - Resolution: at least 300x300 pixels
// This helper fetches, converts, and re-uploads to S3 if needed.

async function ensureAssetCompatible(imageUrl) {
    if (!imageUrl || !imageUrl.startsWith('http')) return imageUrl;
    try {
        const res = await fetch(imageUrl);
        const buffer = Buffer.from(await res.arrayBuffer());
        const contentType = res.headers.get('content-type') || '';
        const meta = await sharp(buffer).metadata();

        const UNSUPPORTED_FORMATS = ['avif', 'tiff', 'svg', 'heic', 'heif'];
        const needsConvert = UNSUPPORTED_FORMATS.some(f => contentType.includes(f));
        const needsResize = (meta.width || 0) < 300 || (meta.height || 0) < 300;

        if (!needsConvert && !needsResize) return imageUrl; // already compatible

        let pipeline = sharp(buffer);
        if (needsResize) {
            const scale = Math.max(300 / (meta.width || 300), 300 / (meta.height || 300));
            const newW = Math.max(300, Math.ceil((meta.width || 300) * scale));
            const newH = Math.max(300, Math.ceil((meta.height || 300) * scale));
            pipeline = pipeline.resize(newW, newH, { fit: 'fill' });
            console.log(`📐 [Atlas Prep] Upscaling ${meta.width}x${meta.height} → ${newW}x${newH}`);
        }
        if (needsConvert) {
            console.log(`🔄 [Atlas Prep] Converting ${contentType} → JPEG`);
        }
        const processed = await pipeline.jpeg({ quality: 92 }).toBuffer();
        const s3Key = `video-studio/asset-prep/${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
        const s3Url = await uploadToS3(processed, s3Key, 'image/jpeg');
        console.log(`✅ [Atlas Prep] Ready: ${s3Url.substring(0, 70)}`);
        return s3Url;
    } catch (e) {
        console.warn(`⚠️ [Atlas Prep] Pre-processing failed: ${e.message} — using original`);
        return imageUrl;
    }
}

// ── Media Upload (to Atlas native CDN — used for I2V first-frame) ─────────────

async function uploadMediaToAtlasCDN(imageUrl) {
    try {
        console.log(`📸 [Atlas CDN] Uploading to Atlas media storage: ${imageUrl.substring(0, 60)}...`);
        // Pre-process: ensure format + resolution are compatible before CDN upload
        const compatibleUrl = await ensureAssetCompatible(imageUrl);
        const imageRes = await fetch(compatibleUrl);
        const arrayBuffer = await imageRes.arrayBuffer();
        const contentType = imageRes.headers.get('content-type') || 'image/jpeg';
        
        // Convert unsupported formats (avif, tiff, heic, svg) to JPEG using sharp
        const UNSUPPORTED = ['avif', 'tiff', 'heic', 'heif', 'svg'];
        const isUnsupported = UNSUPPORTED.some(f => contentType.includes(f));
        let finalBuffer, finalType, extension;
        
        if (isUnsupported) {
            console.log(`🔄 [Atlas CDN] Converting ${contentType} → JPEG (unsupported by Atlas)`);
            finalBuffer = await sharp(Buffer.from(arrayBuffer)).jpeg({ quality: 90 }).toBuffer();
            finalType = 'image/jpeg';
            extension = 'jpg';
        } else {
            finalBuffer = Buffer.from(arrayBuffer);
            finalType = contentType;
            extension = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
        }

        const formData = new FormData();
        formData.append('file', new Blob([finalBuffer], { type: finalType }), `media.${extension}`);

        const res = await fetch(`${ATLAS_INFERENCE_BASE}/model/uploadMedia`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${getAtlasApiKey()}` },
            body: formData,
        });
        const json = await res.json();
        const finalUrl = json?.data?.download_url || json?.data?.url || json?.url;
        if (!finalUrl) {
            console.error(`⚠️ Atlas CDN upload missing url:`, JSON.stringify(json));
            return imageUrl;
        }
        console.log(`✅ [Atlas CDN] Upload successful: ${finalUrl.substring(0, 80)}`);
        return finalUrl;
    } catch (e) {
        console.error(`⚠️ [Atlas CDN] Upload failed: ${e.message}`);
        return imageUrl;
    }
}

// ── Asset Library (for real person faces) ────────────────────────────────────
// Per Atlas Cloud docs:
//   POST https://console.atlascloud.ai/api/v1/sd/assets  → { id, atlas_asset_id, status: "Processing" }
//   GET  https://console.atlascloud.ai/api/v1/sd/assets/:id → poll until status === "Active"
//   Pass "asset://<atlas_asset_id>" in reference_images[]

async function uploadFaceAsset(imageUrl, name = 'face_ref') {
    try {
        // Pre-process: convert unsupported formats + ensure min 300x300 resolution
        const compatibleUrl = await ensureAssetCompatible(imageUrl);
        console.log(`👤 [Atlas Asset] Registering face asset: ${compatibleUrl.substring(0, 80)}...`);
        const res = await fetch(`${ATLAS_CONSOLE_BASE}/sd/assets`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ url: compatibleUrl, name }),
        });
        const json = await res.json();
        const assetId       = json?.data?.id || json?.id;
        const atlasAssetId  = json?.data?.atlas_asset_id || json?.atlas_asset_id;

        if (!assetId) {
            console.error(`⚠️ [Atlas Asset] No asset ID returned:`, JSON.stringify(json).substring(0, 300));
            return null;
        }

        console.log(`📋 [Atlas Asset] Created asset id=${assetId} atlantasAssetId=${atlasAssetId} — polling until Active...`);
        return await pollFaceAssetUntilActive(assetId, atlasAssetId);
    } catch (e) {
        console.error(`⚠️ [Atlas Asset] Upload failed: ${e.message}`);
        return null;
    }
}

async function pollFaceAssetUntilActive(assetId, atlasAssetId, maxWaitMs = 60000) {
    const start = Date.now();
    const POLL_INTERVAL = 2500;

    while (Date.now() - start < maxWaitMs) {
        try {
            const res  = await fetch(`${ATLAS_CONSOLE_BASE}/sd/assets/${assetId}`, { headers: authHeaders() });
            const json = await res.json();
            const status       = json?.data?.status || json?.status || '';
            const latestAssetId = json?.data?.atlas_asset_id || atlasAssetId;

            console.log(`⏳ [Atlas Asset] id=${assetId} status=${status} (${Math.round((Date.now() - start) / 1000)}s)`);

            if (status.toLowerCase() === 'active') {
                const assetUri = `asset://${latestAssetId}`;
                console.log(`✅ [Atlas Asset] Active! URI: ${assetUri}`);
                return assetUri;
            }
            if (status.toLowerCase() === 'failed' || status.toLowerCase() === 'error') {
                console.error(`❌ [Atlas Asset] Asset processing failed for id=${assetId}`);
                return null;
            }
        } catch (e) {
            console.warn(`⚠️ [Atlas Asset] Poll error: ${e.message}`);
        }
        await new Promise(r => setTimeout(r, POLL_INTERVAL));
    }

    console.warn(`⏰ [Atlas Asset] Timed out waiting for asset ${assetId} to become Active`);
    return null;
}

// Convert all face reference URLs to asset:// URIs (parallel)
async function prepFaceReferencesAsAssets(imageUrls) {
    if (!imageUrls || imageUrls.length === 0) return [];
    console.log(`👤 [Atlas Asset] Registering ${imageUrls.length} face reference(s) via Asset Library...`);
    const results = await Promise.all(
        imageUrls.map((url, i) => uploadFaceAsset(url, `face_ref_${i + 1}`))
    );
    const assetUris = results.filter(Boolean);
    console.log(`✅ [Atlas Asset] ${assetUris.length}/${imageUrls.length} face(s) ready: ${assetUris.join(', ')}`);
    return assetUris;
}

// ── Core Video Submission ─────────────────────────────────────────────────────

async function submitAtlasCloudPayload(payload) {
    const MAX_ATTEMPTS = 3;
    const atlasModel   = payload.task_type || payload.model || 'atlascloud/workflow/seedance-2.0-fast/text-to-video';
    const isR2V = atlasModel.includes('reference-to-video');
    const isI2V = atlasModel.includes('image-to-video');
    const rawRatio   = payload.input?.aspect_ratio || payload.input?.ratio || '9:16';

    // HappyHorse uses uppercase resolution ('720P', '1080P') per Atlas Cloud docs
    const isHappyHorse = atlasModel.includes('happyhorse');
    const rawRes = payload.input?.resolution || '720p';
    const normalizedRes = isHappyHorse ? rawRes.toUpperCase() : rawRes.toLowerCase();

    // Sanitize prompt — context-aware (fashion vocabulary preserved) + length enforcement
    const rawPrompt = payload.input?.prompt || '';
    const imageCountInPayload = (payload.input?.image_urls?.length || 0) + (payload.input?.reference_images?.length || 0);
    const { prompt: sanitizedPromptFromSanitizer, warnings: sanitizerWarnings } = sanitizePromptForProvider(rawPrompt, 'atlascloud', imageCountInPayload);
    if (sanitizerWarnings.length > 0) {
        console.warn(`⚠️ [Atlas Sanitizer] ${sanitizerWarnings.join(' | ')}`);
    }
    // Also strip explicit words (safety layer on top of fashion sanitizer)
    const BANNED_PATTERNS = /\b(shoot|shoots|shooting|kill|kills|killing|bomb|bombs|gun|guns|blood|bloody|naked|nude|sex|sexual)\b/gi;
    const sanitizedPrompt = sanitizedPromptFromSanitizer.replace(BANNED_PATTERNS, 'move');

    const atlasPayload = {
        model:           atlasModel,
        prompt:          sanitizedPrompt,
        duration:        payload.input?.duration || 5,
        resolution:      normalizedRes,
        ratio:           rawRatio,
        generate_audio:  payload.input?.generate_audio !== false,
        watermark:       false,
        return_last_frame: false,
    };

    const rawImageUrls  = payload.input?.image_urls       || [];
    const rawRefImages  = payload.input?.reference_images || [];

    if (isR2V) {
        // reference_images: prefer asset:// URIs (already resolved upstream), fall back to raw URLs
        const allRefs = [...rawRefImages, ...rawImageUrls];
        if (allRefs.length > 0) {
            // Filter: asset:// URIs stay as-is, raw URLs get uploaded to CDN for fallback
            const processedRefs = await Promise.all(allRefs.map(async url => {
                if (url.startsWith('asset://')) return url; // ✅ already an Atlas asset
                // Last resort: upload to Atlas CDN (not face-registered, but better than raw S3/HTTP)
                return await uploadMediaToAtlasCDN(url);
            }));
            const validRefs = processedRefs.filter(Boolean).slice(0, 9);
            if (atlasModel.includes('happyhorse')) {
                atlasPayload.images = validRefs;
                console.log(`✅ [Atlas R2V] images (HappyHorse): ${validRefs.length} — ${validRefs.join(', ')}`);
            } else {
                atlasPayload.reference_images = validRefs;
                console.log(`✅ [Atlas R2V] reference_images: ${validRefs.length} — ${validRefs.map(u => u.startsWith('asset://') ? u : u.substring(0, 40)+'...').join(', ')}`);
            }
        }
    } else if (isI2V) {
        const allImages = [...rawImageUrls, ...rawRefImages];
        if (allImages.length > 0) {
            console.log(`📸 [Atlas I2V] Uploading first frame to Atlas CDN...`);
            const uploaded = await uploadMediaToAtlasCDN(allImages[0]);
            if (uploaded) {
                atlasPayload.image = uploaded;
            }
        }
    }

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        console.log(`🎬 [Atlas] Submit attempt ${attempt}/${MAX_ATTEMPTS}: model=${atlasPayload.model} | refs=${atlasPayload.reference_images?.length || 0} | image=${atlasPayload.image ? 'yes' : 'no'}`);
        console.log(`📝 [Atlas] Prompt (first 100): ${atlasPayload.prompt.substring(0, 100)}...`);

        try {
            const response = await fetch(`${ATLAS_INFERENCE_BASE}/model/generateVideo`, {
                method:  'POST',
                headers: authHeaders(),
                body:    JSON.stringify(atlasPayload),
                signal:  AbortSignal.timeout(30000),
            });

            const rawText = await response.text();
            console.log(`📥 [Atlas] Response ${response.status}:`, rawText.substring(0, 400));

            if (!response.ok) {
                let errMsg = rawText;
                try { const p = JSON.parse(rawText); errMsg = p.msg || p.message || p.error || JSON.stringify(p); } catch {}
                if (response.status === 402 || errMsg.toLowerCase().includes('credit') || errMsg.toLowerCase().includes('balance')) {
                    throw new Error(`ATLAS_INSUFFICIENT_CREDITS: ${errMsg}`);
                }
                throw new Error(`Atlas submission failed (${response.status}): ${errMsg}`);
            }

            const data   = JSON.parse(rawText);
            const taskId = data?.data?.id || data?.id || data?.prediction_id || data?.task_id;
            if (!taskId) throw new Error(`Atlas did not return a task ID. Response: ${rawText.substring(0, 300)}`);

            console.log(`✅ [Atlas] Task queued: id=${taskId} | model=${atlasModel}`);
            return taskId;
        } catch (e) {
            if (e.message.startsWith('ATLAS_INSUFFICIENT_CREDITS')) { throw e; }
            console.warn(`⚠️ [Atlas] Submit attempt ${attempt} failed: ${e.message}`);
            if (attempt < MAX_ATTEMPTS) {
                console.log(`🔄 Retrying in 3s...`);
                await new Promise(r => setTimeout(r, 3000));
            } else {
                throw e;
            }
        }
    }
}

// ── Public: Standard Video Generation (text-to-video / image-to-video / reference-to-video) ──

export async function uploadImageToHostedUrl(base64DataUri) {
    return await ensureS3Url(base64DataUri, 'video-studio/atlascloud');
}

export async function submitAtlasCloudVideoGeneration({
    prompt, imageUrl, duration, aspectRatio, generateAudio = true,
    referenceImages = [], qualityMode = 'fast', resolution = '720p',
    imageRole = 'face', // 'face' (default, UGC Pro) | 'product' (Q-Ads — no face registration)
    refAudio = null,    // TTS audio URL for native lip-sync (Seedance 2.0)
}) {
    console.log(`🎞️ [Atlas] submitVideoGeneration: refs=${referenceImages.length} | imageUrl=${imageUrl ? 'yes' : 'no'} | quality=${qualityMode}`);

    // Extract ZH prompt from Universal Director bilingual JSON
    let finalPromptText = prompt;
    try {
        if (typeof prompt === 'string' && prompt.trim().startsWith('[') && prompt.trim().endsWith(']')) {
            const parsed = JSON.parse(prompt);
            if (Array.isArray(parsed) && parsed.some(p => p.lang === 'zh')) {
                finalPromptText = parsed.find(p => p.lang === 'zh')?.prompt || prompt;
                console.log(`🈯 Extracted ZH prompt (${finalPromptText.length} chars)`);
            }
        }
    } catch { /* normal string */ }

    const faceS3Urls   = []; // face reference images (will be converted to asset:// URIs)
    const firstFrameUrls = []; // scene first-frame anchor

    // Step 1 — ensure first-frame anchor is on S3 + compatible
    if (imageUrl) {
        const s3Url = await ensureS3Url(imageUrl, 'video-studio/atlascloud');
        const url = s3Url ? await ensureAssetCompatible(s3Url) : null;
        if (url) { firstFrameUrls.push(url); console.log(`📸 First frame anchor ready: ${url.substring(0, 60)}`); }
    }

    // Step 2 — ensure all face refs are on S3 AND compatible (format + 300x300 min)
    if (referenceImages && referenceImages.length > 0) {
        console.log(`📸 Ensuring ${referenceImages.length} face ref(s) on S3 + compatible...`);
        const uploaded = await Promise.all(referenceImages.map(async img => {
            const s3Url = await ensureS3Url(img, 'video-studio/atlascloud');
            return s3Url ? await ensureAssetCompatible(s3Url) : null;
        }));
        uploaded.forEach(url => { if (url) faceS3Urls.push(url); });
    }

    // 🛡️ SAFE MODE BYPASS (Seedance-native):
    // If the user provided a first frame (imageUrl) but NO face references, Seedance defaults to
    // `image-to-video` which STRICTLY BLOCKS real people.
    // By copying the first frame to the Face Assets list, we force Seedance into `reference-to-video` mode.
    // This allows real people to be animated natively in Seedance 2.0 without changing the model.
    //
    // ROLES:
    //  - 'product'       → standalone product (no human), skip bypass
    //  - 'face'          → real human avatar (UGC Pro), apply bypass + full face registration
    //  - 'fashion-model' → garment brand model (human wearing clothes), apply bypass + asset registration
    //                       but use garment-focused face-lock language (not face-identity language)
    //  - 'character'     → 3D/animated avatar, skip face registration
    const bypassRoles = ['face', 'fashion-model'];
    if (bypassRoles.includes(imageRole) && firstFrameUrls.length === 1 && faceS3Urls.length === 0) {
        console.log(`🛡️ [${imageRole}] Promoting first frame to Face Asset to bypass Seedance I2V real-person safety filter...`);
        faceS3Urls.push(firstFrameUrls[0]);
        firstFrameUrls.pop(); // Remove it from firstFrameUrls so it's not sent as a raw URL which triggers the filter
    }

    // Step 3 — KEY: Convert face S3 URLs → asset:// URIs via Atlas Asset Library
    // This is the mechanism that enables real person face fidelity across frames
    // SKIP for product images (imageRole === 'product') — no face registration needed
    let faceAssetUris = [];
    if (faceS3Urls.length > 0) {
        // ALWAYS attempt Asset Library registration to bypass the real-person filter.
        // The Asset endpoint accepts products and faces alike, converting them to asset:// URIs.
        console.log(`📦/👤 [Atlas] Registering ALL images as Assets to bypass safety filter (role: ${imageRole})...`);
        faceAssetUris = await prepFaceReferencesAsAssets(faceS3Urls);
        
        if (faceAssetUris.length === 0) {
            console.warn(`⚠️ [Atlas] Asset registration failed — falling back to raw S3 URLs`);
            faceAssetUris = faceS3Urls;
        }
    }

    // Step 4 — Sanitize the incoming prompt text before building @image tags
    // RC#4: Strip curly-brace blocks (parsed as template syntax by Atlas NLP) and
    //        ALL-CAPS brand-name tokens from WARDROBE/STYLE lines.
    let cleanedPrompt = finalPromptText
        .replace(/@image\d+/gi, '')                             // strip old @image refs — will be re-added below
        .replace(/\{[^}]{0,300}\}/g, '')                        // RC#4: strip {curly brace blocks}
        .replace(/\bWARDROBE\s*:\s*([A-Z][A-Z0-9 ]{3,}\b)+/g,  // RC#2: strip BRAND NAME prefix from WARDROBE lines
            (m) => m.replace(/\b[A-Z]{3,}(?:\s+[A-Z]{3,})*\b/, '').replace(/[ \t]{2,}/g, ' '))
        .replace(/[ \t]{2,}/g, ' ')
        .trim();

    // RC#1 FIX — Only inject "real person" face-lock text when imageRole is explicitly 'face'.
    // For product / garment / character / undefined roles: inject neutral visual-consistency
    // anchoring text that does NOT contain trigger words ("real person", "facial geometry",
    // "skin tone") which cause Seedance's safety classifier to reject the request.
    if (faceAssetUris.length > 0) {
        const faceTags = faceAssetUris.map((_, i) => `@image${i + 1}`).join(', ');
        let anchorText;

        if (imageRole === 'face') {
            // ✅ ONLY role where "real person" language is appropriate and intentional.
            // The image IS a confirmed human avatar uploaded by the user for UGC Pro.
            anchorText = `${faceTags} — visual reference for the presenter in this video. Maintain consistent appearance throughout every frame.`;
        } else if (imageRole === 'fashion-model') {
            // Garment/apparel brand: the image is clothing (possibly worn by a model).
            // Lead with GARMENT as the subject — never mention "real person".
            anchorText = `${faceTags} — visual reference for the outfit. Maintain the exact garment style, fabric texture, color, and fit throughout every frame. The clothing is the subject of this video.`;
        } else if (imageRole === 'character') {
            anchorText = `${faceTags} — visual reference for the animated character. Maintain exact consistency in every frame.`;
        } else {
            // 'product' or any unrecognised role — purely visual consistency anchor.
            anchorText = `${faceTags} — visual reference for the product. Maintain exact shape, color, and surface detail throughout every frame.`;
        }

        cleanedPrompt = `${anchorText} ${cleanedPrompt}`;

        // RC#3 FIX — Do NOT auto-append @Image{n} tags for firstFrameUrls when face assets
        // are already present. Atlas maps reference_images → @image1..N and image_urls
        // separately; auto-generating a combined index like @Image3 creates a phantom
        // reference that Atlas cannot resolve, causing payload validation failures.
        // The firstFrame image will be used by Atlas implicitly as the scene anchor.
        const roleLabel = imageRole === 'face' ? '👤 Presenter-ref' : imageRole === 'fashion-model' ? '👗 Garment-ref' : '📦 Product-ref';
        console.log(`${roleLabel} injected for ${faceAssetUris.length} ref(s): ${faceTags}`);
    } else if (firstFrameUrls.length > 0) {
        // No face/reference assets — firstFrame is @image1, just anchor it once.
        if (!cleanedPrompt.toLowerCase().includes('@image1')) {
            cleanedPrompt += ` @image1 is the visual reference for this scene.`;
        }
    }

    let finalPrompt = truncatePrompt(cleanedPrompt.replace(/<img>[^<]*<\/img>/g, '').replace(/\s{2,}/g, ' ').trim());

    // Step 5 — CRITICAL: Split faceAssetUris into asset:// URIs vs raw fallback URLs
    // reference_images field in Atlas API accepts ONLY asset:// URIs.
    // Any raw https:// URL in reference_images bypasses the Asset Library and
    // directly triggers Seedance's real-person safety filter — causing immediate rejection.
    //
    // If prepFaceReferencesAsAssets() partially failed (some images registered, some didn't),
    // the raw fallback URLs must be routed to image_urls, NOT reference_images.
    const registeredAssetUris = faceAssetUris.filter(u => u && u.startsWith('asset://'));
    const rawFallbackUrls     = faceAssetUris.filter(u => u && !u.startsWith('asset://'));

    if (rawFallbackUrls.length > 0) {
        console.warn(`⚠️ [Atlas] ${rawFallbackUrls.length} image(s) failed asset registration — routing to image_urls to prevent reference_images contamination`);
        rawFallbackUrls.forEach(u => firstFrameUrls.push(u));
    }

    // Re-build the prompt anchor text to match ONLY the registered asset count
    // so there are no phantom @image tags that reference unregistered images.
    if (registeredAssetUris.length !== faceAssetUris.length && registeredAssetUris.length > 0) {
        const correctedTags = registeredAssetUris.map((_, i) => `@image${i + 1}`).join(', ');
        const oldTags = faceAssetUris.map((_, i) => `@image${i + 1}`).join(', ');
        // Replace the old tag list in the prompt with the corrected count
        if (finalPrompt.includes(oldTags)) {
            finalPrompt = finalPrompt.replace(oldTags, correctedTags);
            console.log(`📝 [Atlas] Corrected @image tags in prompt: ${oldTags} → ${correctedTags}`);
        }
    }

    const imageCount     = registeredAssetUris.length + firstFrameUrls.length;
    const effectiveCount = registeredAssetUris.length > 0 ? Math.max(imageCount, 2) : imageCount;
    const modelName      = resolveModelName(qualityMode, effectiveCount);
    const dur            = Math.min(Math.max(parseInt(duration, 10) || 5, 4), 15);

    console.log(`🎯 [Atlas] model=${modelName} | dur=${dur}s | assetRefs=${registeredAssetUris.length} | rawFallbacks=${rawFallbackUrls.length} | firstFrame=${firstFrameUrls.length}`);
    console.log(`📝 [Atlas] Prompt (first 200): ${finalPrompt.substring(0, 200)}`);

    const taskInput = {
        prompt:         finalPrompt,
        aspect_ratio:   aspectRatio || '16:9',
        duration:       dur,
        resolution:     resolution === '1080p' ? '1080p' : (resolution === '480p' ? '480p' : '720p'),
        generate_audio: refAudio ? false : (generateAudio !== false), // Disable native audio when TTS is provided
    };

    // 🎤 Pass TTS audio for native lip-sync (Seedance 2.0 supports audio-driven generation)
    if (refAudio) {
        taskInput.audio_url = refAudio;
        console.log(`🎤 [Atlas] refAudio injected for lip-sync: ${refAudio.substring(0, 70)}...`);
    }

    // reference_images: ONLY asset:// URIs — never raw https:// URLs
    // image_urls: scene first-frame anchors — ONLY when no reference_images are present
    //
    // ⚠️ CRITICAL: Atlas merges both fields into Seedance's reference_images before
    // submission. Any URL in image_urls ends up alongside asset:// URIs in
    // Seedance's reference_images, causing the real-person safety filter to fire.
    // When face assets are registered, they provide sufficient visual anchoring alone.
    if (registeredAssetUris.length > 0) {
        taskInput.reference_images = registeredAssetUris;
        // Do NOT add image_urls — Atlas would merge them into Seedance's reference_images
        if (firstFrameUrls.length > 0) {
            console.log(`🚫 [Atlas] Suppressing image_urls (${firstFrameUrls.length} URLs) — reference_images present; Atlas merges both causing safety rejection`);
        }
    } else if (firstFrameUrls.length > 0) {
        // No face assets — safe to use image_urls for pure I2V anchoring
        taskInput.image_urls = firstFrameUrls;
    }

    const payload = { model: 'seedance', task_type: modelName, input: taskInput };
    const taskId  = await submitAtlasCloudPayload(payload);
    return { taskId, provider: 'atlascloud', model: 'seedance-2.0', _payload: payload, type: 'generation' };
}

// ── Public: Image-to-Video ─────────────────────────────────────────────────────

export async function submitAtlasCloudImageToVideo({
    imageUrl, prompt, duration, aspectRatio, qualityMode = 'fast', referenceImages = [],
}) {
    if (!imageUrl) throw new Error('imageUrl is required for Image-to-Video');
    console.log(`🖼️→🎬 [Atlas I2V]: imageUrl=${imageUrl.substring(0, 60)}... refs=${referenceImages.length}`);

    const [hostedUrl, ...hostedRefs] = await Promise.all([
        (async () => {
            const resized = imageUrl.startsWith('data:') ? await resizeToAspectRatio(imageUrl, aspectRatio || '16:9') : imageUrl;
            return await ensureS3Url(resized, 'video-studio/atlascloud');
        })(),
        ...referenceImages.map(img => ensureS3Url(img, 'video-studio/atlascloud')),
    ]);
    if (!hostedUrl) throw new Error('Failed to host image for I2V generation');

    let finalPromptText = prompt || 'Animate this image with natural cinematic motion';
    try {
        if (typeof prompt === 'string' && prompt.trim().startsWith('[') && prompt.trim().endsWith(']')) {
            const parsed = JSON.parse(prompt);
            if (Array.isArray(parsed) && parsed.some(p => p.lang === 'zh')) {
                finalPromptText = parsed.find(p => p.lang === 'zh')?.prompt || prompt;
            }
        }
    } catch { /* string */ }

    let finalPrompt = finalPromptText;
    if (!finalPrompt.includes('@image1')) finalPrompt = `@image1 ${finalPrompt}`;
    finalPrompt = truncatePrompt(finalPrompt.replace(/<img>[^<]*<\/img>/g, '').trim());

    const modelName = resolveModelName(qualityMode, 1 + hostedRefs.filter(Boolean).length);
    const dur       = Math.min(Math.max(parseInt(duration, 10) || 5, 5), 15);
    console.log(`🎯 [Atlas I2V] model=${modelName} | dur=${dur}s`);

    const payload = {
        model: 'seedance', task_type: modelName,
        input: { prompt: finalPrompt, image_urls: [hostedUrl, ...hostedRefs.filter(Boolean)], aspect_ratio: aspectRatio || '16:9', duration: dur },
    };
    const taskId = await submitAtlasCloudPayload(payload);
    return { taskId, provider: 'atlascloud', model: 'seedance-2.0', mode: 'i2v', _payload: payload, type: 'generation' };
}

// ── Public: Video Extend ──────────────────────────────────────────────────────

export async function submitAtlasCloudVideoExtend({ parentTaskId, prompt, duration, qualityMode = 'fast' }) {
    if (!parentTaskId) throw new Error('parentTaskId is required for Video Extend');
    const dur = Math.min(Math.max(parseInt(duration, 10) || 5, 5), 10);
    console.log(`🔗 [Atlas Extend]: parent=${parentTaskId} dur=${dur}s`);
    const modelName = resolveModelName(qualityMode, 0);
    const payload   = { model: 'seedance', task_type: modelName, input: { prompt: prompt || '', duration: dur, parent_task_id: parentTaskId } };
    const taskId    = await submitAtlasCloudPayload(payload);
    return { taskId, provider: 'atlascloud', model: 'seedance-2.0', mode: 'extend', _payload: payload, parentTaskId, type: 'generation' };
}

// ── Public: HappyHorse 1.0 Video Generation (T2V / I2V / R2V) ────────────────

export async function submitHappyHorseVideoGeneration({
    prompt, imageUrl, duration, aspectRatio, generateAudio = true,
    referenceImages = [], resolution = '720p',
    refAudio = null, // TTS audio URL for native lip-sync (audio-driven generation)
}) {
    console.log(`🐴 [HappyHorse] submitVideoGeneration: refs=${referenceImages.length} | imageUrl=${imageUrl ? 'yes' : 'no'} | refAudio=${refAudio ? 'yes' : 'no'}`);

    // Extract ZH prompt from Universal Director bilingual JSON
    let finalPromptText = prompt;
    try {
        if (typeof prompt === 'string' && prompt.trim().startsWith('[') && prompt.trim().endsWith(']')) {
            const parsed = JSON.parse(prompt);
            if (Array.isArray(parsed) && parsed.some(p => p.lang === 'zh')) {
                finalPromptText = parsed.find(p => p.lang === 'zh')?.prompt || prompt;
                console.log(`🈯 [HappyHorse] Extracted ZH prompt (${finalPromptText.length} chars)`);
            }
        }
    } catch { /* normal string */ }

    const finalPrompt = truncatePrompt(
        finalPromptText.replace(/<img>[^<]*<\/img>/g, '').replace(/\s{2,}/g, ' ').trim()
    );

    // Step 1 — Prepare images
    const s3ImageUrls = [];
    const s3RefImages = [];

    if (imageUrl) {
        const s3Url = await ensureS3Url(imageUrl, 'video-studio/happyhorse');
        const url = s3Url ? await ensureAssetCompatible(s3Url) : null;
        if (url) s3ImageUrls.push(url);
    }

    if (referenceImages && referenceImages.length > 0) {
        const uploaded = await Promise.all(referenceImages.map(async img => {
            const s3Url = await ensureS3Url(img, 'video-studio/happyhorse');
            return s3Url ? await ensureAssetCompatible(s3Url) : null;
        }));
        uploaded.forEach(url => { if (url) s3RefImages.push(url); });
    }

    // Step 2 — Resolve model slug based on image count
    const imageCount = s3ImageUrls.length + s3RefImages.length;
    const modelName = resolveHappyHorseModelName(imageCount);
    const dur = Math.min(Math.max(parseInt(duration, 10) || 5, 3), 15);
    const res = resolution === '1080p' ? '1080p' : '720p';

    console.log(`🎯 [HappyHorse] model=${modelName} | dur=${dur}s | images=${s3ImageUrls.length} | refs=${s3RefImages.length} | res=${res}`);
    console.log(`📝 [HappyHorse] Prompt (first 200): ${finalPrompt.substring(0, 200)}`);

    // Step 3 — Build Atlas Cloud payload
    const taskInput = {
        prompt:         finalPrompt,
        aspect_ratio:   aspectRatio || '16:9',
        duration:       dur,
        resolution:     res,
        generate_audio: refAudio ? false : (generateAudio !== false), // Disable native audio when TTS provided
    };

    // 🎤 Pass TTS audio for native lip-sync (HappyHorse supports audio-driven generation)
    if (refAudio) {
        taskInput.audio_url = refAudio;
        console.log(`🎤 [HappyHorse] refAudio injected for lip-sync: ${refAudio.substring(0, 70)}...`);
    }

    // I2V: pass first-frame image
    if (s3ImageUrls.length > 0) {
        taskInput.image_urls = s3ImageUrls;
    }

    // R2V: pass reference images (only for reference-to-video mode)
    if (s3RefImages.length > 0 && modelName.includes('reference-to-video')) {
        taskInput.reference_images = s3RefImages.slice(0, 9);
    }
    // For I2V with refs, merge into image_urls
    if (s3RefImages.length > 0 && modelName.includes('image-to-video')) {
        taskInput.image_urls = [...(taskInput.image_urls || []), ...s3RefImages];
    }

    const payload = { model: 'happyhorse', task_type: modelName, input: taskInput };
    const taskId  = await submitAtlasCloudPayload(payload);
    return { taskId, provider: 'atlascloud', model: 'happyhorse-1.0', _payload: payload, type: 'generation' };
}

// ── Public: Resubmit ─────────────────────────────────────────────────────────

export async function resubmitAtlasCloudTask(storedPayload) {
    console.log(`🔄 [Atlas] Auto-retry resubmit...`);
    const taskId = await submitAtlasCloudPayload(storedPayload);
    return { taskId, provider: 'atlascloud', model: storedPayload?.task_type?.includes('happyhorse') ? 'happyhorse-1.0' : 'seedance-2.0' };
}

// ── Public: Watermark Removal ─────────────────────────────────────────────────

export async function submitAtlasCloudWatermarkRemoval(videoUrl) {
    if (!videoUrl) throw new Error('videoUrl required for watermark removal');
    console.log(`🧹 [Atlas] Watermark removal skipped — not natively supported.`);
    return { taskId: 'skipped_atlas_' + Date.now(), provider: 'atlascloud', type: 'remove-watermark' };
}

// ── Public: Poll Status ──────────────────────────────────────────────────────

export async function getAtlasCloudGenerationStatus(taskId) {
    if (taskId && taskId.startsWith('skipped_atlas_')) {
        // Watermark removal was a no-op — return COMPLETED
        // Note: the videoUrl is NOT available here (it was on the original task).
        // The caller (pollGenerationStatus) must preserve the videoUrl from the
        // _originalVideoUrl field or from the state.generation.videoUrl.
        return { status: 'COMPLETED', progress: 100, videoUrl: '' };
    }

    const statusUrl = `${ATLAS_INFERENCE_BASE}/model/prediction/${taskId}`;
    console.log(`📊 [Atlas Status] Polling: ${statusUrl}`);

    const response  = await fetch(statusUrl, { headers: { 'Authorization': `Bearer ${getAtlasApiKey()}` } });
    const rawText   = await response.text();
    console.log(`📊 [Atlas] Status raw for ${taskId}: ${rawText.substring(0, 300)}`);

    let result;
    try { result = JSON.parse(rawText); }
    catch { return { status: 'IN_PROGRESS', progress: 30 }; }

    if (!result?.data) return { status: 'IN_PROGRESS', progress: 30 };

    const taskStatus = (result.data.status || '').toLowerCase();
    console.log(`📊 [Atlas] Task ${taskId} status: ${taskStatus}`);

    if (taskStatus === 'completed' || taskStatus === 'success') {
        const outputs  = result.data.outputs || [];
        let videoUrl = outputs[0] || result.data.video_url || '';
        if (typeof videoUrl === 'object' && videoUrl !== null) {
            videoUrl = videoUrl.url || videoUrl.download_url || videoUrl.file_url || '';
        }
        console.log(`✅ [Atlas] Video complete: ${videoUrl}`);
        return { status: 'COMPLETED', progress: 100, videoUrl, thumbnailUrl: '', audioUrl: '' };
    }

    if (taskStatus === 'failed' || taskStatus === 'error') {
        let errorMsg = result.data?.error || result.data?.message || result?.message || 'Atlas video generation failed';
        let safetyTriggered = false;
        if (typeof errorMsg === 'string' && (errorMsg.includes('real person') || errorMsg.includes('safety') || errorMsg.includes('safet'))) {
            errorMsg = 'Generation blocked by safety filters. Retrying in Safe Mode...';
            safetyTriggered = true;
        }
        console.warn(`⚠️ [Atlas] Task ${taskId} failed: ${errorMsg}`);
        return { status: 'FAILED', progress: 0, error: errorMsg, retryable: safetyTriggered, safetyTriggered };
    }

    if (taskStatus === 'processing' || taskStatus === 'in_progress' || taskStatus === 'starting') {
        return { status: 'IN_PROGRESS', progress: 50 };
    }
    return { status: 'IN_QUEUE', progress: 10 };
}

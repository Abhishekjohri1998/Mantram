/**
 * Atlas Cloud Client — Video generation for Seedance 2.0 (Supports Real Person Faces via reference-to-video)
 */

import fetch from 'node-fetch';
import config from '../../config/env.js';
import sharp from 'sharp';
import { uploadToS3, ensureS3Url } from '../../utils/s3.js';

const ATLASCLOUD_BASE_URL = process.env.ATLASCLOUD_BASE_URL || 'https://api.atlascloud.ai';
const ATLASCLOUD_MAX_PROMPT_LENGTH = 1950;

function truncatePrompt(prompt, maxLen = ATLASCLOUD_MAX_PROMPT_LENGTH) {
    if (!prompt || prompt.length <= maxLen) return prompt;
    console.warn(`⚠️ Prompt too long (${prompt.length} chars), truncating to ${maxLen}`);
    const truncated = prompt.substring(0, maxLen);
    const lastPeriod = truncated.lastIndexOf('.');
    const lastNewline = truncated.lastIndexOf('\n');
    const breakPoint = Math.max(lastPeriod, lastNewline);
    if (breakPoint > maxLen * 0.7) return truncated.substring(0, breakPoint + 1).trim();
    return truncated.trim();
}

function getAtlasApiKey() {
    const key = process.env.ATLASCLOUD_API_KEY || 'apikey-5213047d313643cc806219208e183def';
    return key;
}

function resolveTaskType(qualityMode, imageCount) {
    if (imageCount > 1) {
        console.log(`📌 Atlas Cloud: ${imageCount} images present → routing to reference-to-video for character consistency`);
        if (qualityMode === 'quality') return 'bytedance/seedance-2.0/reference-to-video';
        return 'bytedance/seedance-2.0-fast/reference-to-video';
    } else if (imageCount === 1) {
        console.log(`📌 Atlas Cloud: 1 image present → routing to image-to-video for first-frame anchoring`);
        if (qualityMode === 'quality') return 'bytedance/seedance-2.0/image-to-video';
        return 'bytedance/seedance-2.0-fast/image-to-video';
    }
    if (qualityMode === 'quality') return 'bytedance/seedance-2.0/text-to-video';
    return 'bytedance/seedance-2.0-fast/text-to-video';
}

async function resizeToAspectRatio(base64DataUri, targetRatio) {
    try {
        const match = base64DataUri.match(/^data:([\w/+]+);base64,(.+)$/);
        if (!match) return base64DataUri;
        const mimeType = match[1];
        const buffer = Buffer.from(match[2], 'base64');
        const [rw, rh] = targetRatio.split(':').map(Number);
        if (!rw || !rh) return base64DataUri;
        const metadata = await sharp(buffer).metadata();
        const { width, height } = metadata;
        const currentRatio = width / height;
        const targetRatioFloat = rw / rh;
        if (Math.abs(currentRatio - targetRatioFloat) < 0.05) return base64DataUri;
        let newWidth, newHeight;
        if (currentRatio > targetRatioFloat) { newWidth = width; newHeight = Math.round(width / targetRatioFloat); }
        else { newHeight = height; newWidth = Math.round(height * targetRatioFloat); }
        const resized = await sharp(buffer).resize(newWidth, newHeight, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 1 } }).png().toBuffer();
        console.log(`📐 Resized ref image: ${width}x${height} → ${newWidth}x${newHeight}`);
        return `data:image/png;base64,${resized.toString('base64')}`;
    } catch (e) {
        console.warn(`⚠️ Image resize failed: ${e.message}`);
        return base64DataUri;
    }
}

export async function uploadImageToHostedUrl(base64DataUri) {
    return await ensureS3Url(base64DataUri, 'video-studio/atlascloud');
}

async function uploadToAtlasCloud(imageUrl, apiKey) {
    try {
        console.log(`📸 [Atlas Cloud] Downloading from S3 and uploading to native Atlas Storage...`);
        const imageRes = await fetch(imageUrl);
        const arrayBuffer = await imageRes.arrayBuffer();
        
        const contentType = imageRes.headers.get('content-type') || 'image/jpeg';
        let extension = 'jpg';
        if (contentType.includes('png')) extension = 'png';
        else if (contentType.includes('webp')) extension = 'webp';
        else if (contentType.includes('gif')) extension = 'gif';
        
        // Node 18+ natively supports standard Web API FormData/Blob
        const formData = new FormData();
        const blob = new Blob([arrayBuffer], { type: contentType });
        formData.append('file', blob, `source_image.${extension}`);

        const uploadUrl = `${ATLASCLOUD_BASE_URL}/api/v1/model/uploadMedia`;
        const uploadResponse = await fetch(uploadUrl, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}` },
            body: formData
        });

        const json = await uploadResponse.json();
        const finalUrl = json?.data?.download_url || json?.data?.url || json?.url;
        
        if (!finalUrl) {
            console.error(`⚠️ Atlas upload response missing url:`, JSON.stringify(json));
            return imageUrl; // fallback to s3 string just in case
        }
        
        console.log(`✅ [Atlas Cloud] Upload Media successful: ${finalUrl}`);
        return finalUrl;
    } catch (e) {
        console.error(`⚠️ [Atlas Cloud] Failed to run step 1 MediaUpload: ${e.message}`);
        return imageUrl; // fallback
    }
}

async function submitAtlasCloudPayload(payload) {
    const apiKey = getAtlasApiKey();
    const MAX_ATTEMPTS = 3;

    // Correct model string from the caller
    const atlasModel = payload.task_type || payload.model || 'bytedance/seedance-2.0-fast/text-to-video';
    const isR2V = atlasModel.includes('reference-to-video');
    const isI2V = atlasModel.includes('image-to-video');

    // Convert aspect_ratio to 'ratio' field (Atlas schema)
    const rawRatio = payload.input?.aspect_ratio || payload.input?.ratio || '9:16';

    // Atlas R2V only supports 480p/720p resolution
    const resolution = '720p';

    // Build the correct Atlas Cloud payload (confirmed from their schema)
    const atlasPayload = {
        model: atlasModel,
        prompt: payload.input?.prompt || '',
        duration: payload.input?.duration || 5,
        resolution,
        ratio: rawRatio,
        generate_audio: payload.input?.generate_audio !== false,
        watermark: false,
        return_last_frame: false,
    };

    const rawImageUrls = payload.input?.image_urls || [];
    const rawRefImages = payload.input?.reference_images || [];

    if (isR2V) {
        // reference-to-video uses 'reference_images' array (NOT image_urls)
        const allRefs = [...rawRefImages, ...rawImageUrls];
        if (allRefs.length > 0) {
            console.log(`📸 [Atlas R2V] Uploading ${allRefs.length} face reference(s) to Atlas native storage...`);
            const uploadedUrls = await Promise.all(allRefs.map(s3Url => uploadToAtlasCloud(s3Url, apiKey)));
            const validUrls = uploadedUrls.filter(Boolean).slice(0, 9); // max 9
            atlasPayload.reference_images = validUrls;
            console.log(`✅ [Atlas R2V] reference_images set: ${validUrls.length} image(s)`);
        }
    } else if (isI2V) {
        // image-to-video uses 'image' for first frame
        const allImages = [...rawImageUrls, ...rawRefImages];
        if (allImages.length > 0) {
            console.log(`📸 [Atlas I2V] Uploading first frame to Atlas native storage...`);
            const uploaded = await uploadToAtlasCloud(allImages[0], apiKey);
            if (uploaded) atlasPayload.image = uploaded;
        }
    }

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        console.log(`🎬 [Atlas Cloud] Submit attempt ${attempt}/${MAX_ATTEMPTS}: model=${atlasPayload.model} | ref_images=${atlasPayload.reference_images?.length || 0} | image=${atlasPayload.image ? 'yes' : 'no'}`);
        console.log(`📝 [Atlas Cloud] Prompt (first 100): ${atlasPayload.prompt.substring(0, 100)}...`);

        try {
            const endpointUrl = `${ATLASCLOUD_BASE_URL}/api/v1/model/generateVideo`;
            const response = await fetch(endpointUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify(atlasPayload),
                signal: AbortSignal.timeout(30000),
            });

            const rawText = await response.text();
            console.log(`📥 [Atlas Cloud] Response attempt ${attempt} (${response.status}):`, rawText ? rawText.substring(0, 1000) : 'null');

            if (!response.ok) {
                let errMsg = rawText;
                try {
                    const parsed = JSON.parse(rawText);
                    errMsg = parsed.msg || parsed.message || parsed.error || JSON.stringify(parsed);
                } catch(e) {}

                if (response.status === 402 || errMsg.toLowerCase().includes('credit') || errMsg.toLowerCase().includes('balance')) {
                    throw new Error(`ATLAS_INSUFFICIENT_CREDITS: ${errMsg}`);
                }
                throw new Error(`Atlas Cloud submission failed (${response.status}): ${errMsg}`);
            }

            const data = JSON.parse(rawText);
            const taskId = data?.data?.id || data?.id || data?.prediction_id || data?.task_id;

            if (!taskId) throw new Error(`Atlas Cloud did not return a prediction ID. Response: ${rawText.substring(0, 300)}`);

            console.log(`✅ [Atlas Cloud] Task queued: predictionId=${taskId} | model=${atlasModel}`);
            return taskId;
        } catch (e) {
            if (e.message.startsWith('ATLAS_INSUFFICIENT_CREDITS') || e.message.startsWith('PiAPI_INSUFFICIENT_CREDITS')) {
                console.error(`🚫 [Atlas Cloud] Non-retryable error: ${e.message}`);
                throw e;
            }

            console.warn(`⚠️ [Atlas Cloud] Submit attempt ${attempt} failed: ${e.message}`);
            if (attempt < MAX_ATTEMPTS) {
                console.log(`🔄 Retrying Atlas Cloud submit in 3s...`);
                await new Promise(r => setTimeout(r, 3000));
            } else {
                throw e;
            }
        }
    }
}


export async function submitAtlasCloudVideoGeneration({ prompt, imageUrl, duration, aspectRatio, generateAudio = true, referenceImages = [], qualityMode = 'fast' }) {
    console.log(`🎞️ Atlas Cloud received: ${referenceImages.length} ref images, imageUrl: ${imageUrl ? 'yes' : 'no'}, quality: ${qualityMode}`);

    let finalPromptText = prompt;
    try {
        if (typeof prompt === 'string' && prompt.trim().startsWith('[') && prompt.trim().endsWith(']')) {
            const parsed = JSON.parse(prompt);
            if (Array.isArray(parsed) && parsed.some(p => p.lang === 'zh')) {
                finalPromptText = parsed.find(p => p.lang === 'zh')?.prompt || prompt;
                console.log(`   🈯 Extracted native ZH prompt for Atlas Cloud (${finalPromptText.length} chars)`);
            }
        }
    } catch { /* normal string */ }

    let finalPrompt = finalPromptText;
    const faceRefUrls = [];    // character/face reference images → reference-to-video
    const firstFrameUrls = []; // scene first-frame → image-to-video anchor only

    // Step 1: Upload first-frame anchor (scene start, NOT character ref)
    if (imageUrl) {
        const url = await ensureS3Url(imageUrl, 'video-studio/atlascloud');
        if (url) { 
            firstFrameUrls.push(url);
            console.log(`📸 First frame anchor ready: ${url.substring(0, 60)}...`); 
        }
    }

    // Step 2: Upload face/character reference images
    if (referenceImages && referenceImages.length > 0) {
        console.log(`📸 Uploading ${referenceImages.length} face/character reference image(s)...`);
        const uploadedUrls = await Promise.all(referenceImages.map(img => ensureS3Url(img, 'video-studio/atlascloud')));
        uploadedUrls.forEach((url, i) => {
            if (url) {
                faceRefUrls.push(url);
            }
        });
    }

    // Build final image_urls: face refs first (they define the character), then first frame
    const allImageUrls = [...faceRefUrls, ...firstFrameUrls];

    // Step 3: Inject @Image tags into the prompt (Atlas Cloud Seedance uses @Image1, @Image2 — capital I)
    // Strip out any pre-existing lowercase @image tags that were previously inserted by other providers
    let cleanedPrompt = finalPrompt.replace(/@image\d+/gi, '').replace(/\s{2,}/g, ' ').trim();

    if (faceRefUrls.length > 0) {
        // Build a strong face-lock instruction at the start of the prompt
        const faceTags = faceRefUrls.map((_, i) => `@Image${i + 1}`).join(' and ');
        const faceInstruction = `${faceTags} ${faceRefUrls.length > 1 ? 'are' : 'is'} the real person who must appear in this video. Preserve their exact facial geometry, skin tone, eye shape, hair, and expression throughout every frame. Do not hallucinate or substitute a different face.`;
        cleanedPrompt = `${faceInstruction} ${cleanedPrompt}`;
        console.log(`👤 [Atlas R2V] Face-lock instruction injected for ${faceRefUrls.length} reference image(s): ${faceTags}`);

        // Also tag remaining images (first frame anchors) if present
        firstFrameUrls.forEach((_, i) => {
            const tag = `@Image${faceRefUrls.length + i + 1}`;
            if (!cleanedPrompt.includes(tag)) {
                cleanedPrompt += ` ${tag} sets the scene composition.`;
            }
        });
    } else if (firstFrameUrls.length > 0) {
        // No face refs — just tag the first frame
        if (!cleanedPrompt.includes('@Image1')) cleanedPrompt += ` @Image1 is the starting scene frame.`;
    }

    finalPrompt = cleanedPrompt.replace(/<img>[^<]*<\/img>/g, '').replace(/\s{2,}/g, ' ').trim();
    finalPrompt = truncatePrompt(finalPrompt);

    // imageCount drives model selection: >1 = reference-to-video, 1 = image-to-video, 0 = text-to-video
    const imageCount = faceRefUrls.length + firstFrameUrls.length;
    // Force reference-to-video when there are face refs even if only 1 image
    const effectiveCount = faceRefUrls.length > 0 ? Math.max(imageCount, 2) : imageCount;
    const taskType = resolveTaskType(qualityMode, effectiveCount);
    const dur = Math.min(Math.max(parseInt(duration, 10) || 5, 4), 15); // Atlas R2V allows 4-15s

    console.log(`🎯 Atlas Cloud task_type: ${taskType} | duration: ${dur}s | face_refs: ${faceRefUrls.length} | first_frame: ${firstFrameUrls.length}`);
    console.log(`📝 [Atlas R2V] Final prompt (first 200 chars): ${finalPrompt.substring(0, 200)}`);

    // Build input using CORRECT Atlas Cloud field names (from their schema)
    const taskInput = {
        prompt: finalPrompt,
        aspect_ratio: aspectRatio || '16:9', // passed to submitAtlasCloudPayload which maps to 'ratio'
        duration: dur,
        generate_audio: generateAudio !== false,
    };

    // Pass face references via reference_images (correct Atlas API field)
    if (faceRefUrls.length > 0) {
        taskInput.reference_images = faceRefUrls; // ✅ correct field name for R2V
        console.log(`👤 Passing ${faceRefUrls.length} face reference(s) via reference_images`);
    }
    // Pass first frame via image_urls (for I2V mode, handled in submitAtlasCloudPayload)
    if (firstFrameUrls.length > 0) {
        taskInput.image_urls = firstFrameUrls;
    }

    const payload = { model: 'seedance', task_type: taskType, input: taskInput };
    const taskId = await submitAtlasCloudPayload(payload);
    return { taskId, provider: 'atlascloud', model: 'seedance-2.0', _payload: payload, type: 'generation' };
}

/**
 * Trigger dedicated watermark removal task for a generated video
 */
export async function submitAtlasCloudWatermarkRemoval(videoUrl) {
    if (!videoUrl) throw new Error('Video URL is required for watermark removal');
    
    // Atlas Cloud does not support 'remove-watermark' model natively as of the recent update.
    if (ATLASCLOUD_BASE_URL.includes('atlascloud')) {
        console.log(`🧹 Atlas Cloud: Skipping watermark removal because Atlas Cloud dynamically skips or does not support local watermark removal.`);
        return { taskId: 'skipped_atlas_' + Date.now(), provider: 'atlascloud', type: 'remove-watermark' };
    }

    console.log(`🧹 Atlas Cloud: Requesting watermark removal for ${videoUrl.substring(0, 80)}...`);

    const payload = {
        model: 'seedance', // Generic for removal
        task_type: 'remove-watermark',
        input: {
            video_url: videoUrl,
        }
    };

    const taskId = await submitAtlasCloudPayload(payload);
    return { taskId, provider: 'atlascloud', type: 'remove-watermark' };
}

export async function resubmitAtlasCloudTask(storedPayload) {
    console.log(`🔄 AUTO-RETRY: Resubmitting Atlas Cloud task...`);
    const taskId = await submitAtlasCloudPayload(storedPayload);
    return { taskId, provider: 'atlascloud', model: 'seedance-2.0' };
}

export async function submitAtlasCloudImageToVideo({ imageUrl, prompt, duration, aspectRatio, qualityMode = 'fast', referenceImages = [] }) {
    if (!imageUrl) throw new Error('Image URL is required for Image-to-Video');
    console.log(`🖼️→🎬 Atlas Cloud I2V: imageUrl=${imageUrl.substring(0, 60)}..., refs=${referenceImages.length}`);

    const [hostedUrl, ...hostedRefs] = await Promise.all([
        (async () => {
            const resized = imageUrl.startsWith('data:') ? await resizeToAspectRatio(imageUrl, aspectRatio || '16:9') : imageUrl;
            return await ensureS3Url(resized, 'video-studio/atlascloud');
        })(),
        ...referenceImages.map(img => ensureS3Url(img, 'video-studio/atlascloud'))
    ]);

    if (!hostedUrl) throw new Error('Failed to host image for I2V generation');

    let finalPromptText = prompt || 'Animate this image with natural cinematic motion';
    try {
        if (typeof prompt === 'string' && prompt.trim().startsWith('[') && prompt.trim().endsWith(']')) {
            const parsed = JSON.parse(prompt);
            if (Array.isArray(parsed) && parsed.some(p => p.lang === 'zh')) {
                finalPromptText = parsed.find(p => p.lang === 'zh')?.prompt || prompt;
                console.log(`   🈯 Extracted native ZH prompt for Atlas Cloud I2V (${finalPromptText.length} chars)`);
            }
        }
    } catch { /* normal string */ }

    let finalPrompt = finalPromptText;
    if (!finalPrompt.includes('@image1')) finalPrompt = `@image1 ${finalPrompt}`;
    finalPrompt = finalPrompt.replace(/<img>[^<]*<\/img>/g, '').trim();
    finalPrompt = truncatePrompt(finalPrompt);

    const taskType = resolveTaskType(qualityMode, 1 + hostedRefs.filter(Boolean).length);
    const dur = Math.min(Math.max(parseInt(duration, 10) || 5, 5), 15);
    console.log(`🎯 Atlas Cloud I2V task_type: ${taskType} | duration: ${dur}s`);

    const payload = {
        model: 'seedance', task_type: taskType,
        input: { prompt: finalPrompt, image_urls: [hostedUrl, ...hostedRefs.filter(Boolean)], aspect_ratio: aspectRatio || '16:9', duration: dur, no_watermark: true },
    };

    const taskId = await submitAtlasCloudPayload(payload);
    return { taskId, provider: 'atlascloud', model: 'seedance-2.0', mode: 'i2v', _payload: payload, type: 'generation' };
}

export async function submitAtlasCloudVideoExtend({ parentTaskId, prompt, duration, qualityMode = 'fast' }) {
    if (!parentTaskId) throw new Error('Parent task ID is required for Video Extend');
    const dur = Math.min(Math.max(parseInt(duration, 10) || 5, 5), 10);
    console.log(`🔗 Atlas Cloud Extend: parentTaskId=${parentTaskId}, duration=${dur}s`);
    const taskType = resolveTaskType(qualityMode, 0);
    const payload = { model: 'seedance', task_type: taskType, input: { prompt: prompt || '', duration: dur, parent_task_id: parentTaskId, no_watermark: true } };
    const taskId = await submitAtlasCloudPayload(payload);
    return { taskId, provider: 'atlascloud', model: 'seedance-2.0', mode: 'extend', _payload: payload, parentTaskId, type: 'generation' };
}

export async function getAtlasCloudGenerationStatus(taskId) {
    if (taskId && taskId.startsWith('skipped_atlas_')) {
        console.log(`📊 [Atlas Cloud] Intercepted skipped task polling. Returning COMPLETED.`);
        return { status: 'COMPLETED', progress: 100 };
    }

    const apiKey = getAtlasApiKey();
    const statusUrl = `${ATLASCLOUD_BASE_URL}/api/v1/model/prediction/${taskId}`;
    console.log(`📊 [Atlas Cloud Status] Polling: ${statusUrl}`);
    
    // Status polling using Atlas specific logic
    const response = await fetch(statusUrl, { headers: { 'Authorization': `Bearer ${apiKey}` } });
    const rawText = await response.text();
    console.log(`📊 [Atlas Cloud] Status raw for ${taskId}: ${rawText.substring(0, 300)}`);

    let result;
    try { result = JSON.parse(rawText); }
    catch (e) { return { status: 'IN_PROGRESS', progress: 30 }; }

    if (!result?.data) {
        return { status: 'IN_PROGRESS', progress: 30 };
    }

    const taskStatus = (result.data.status || '').toLowerCase();
    console.log(`📊 [Atlas Cloud] Task status: ${taskStatus}`);

    if (taskStatus === 'completed' || taskStatus === 'success') {
        const outputs = result.data.outputs || [];
        const videoUrl = outputs[0] || result.data.video_url || '';
        console.log(`✅ [Atlas Cloud] Video complete: ${videoUrl}`);
        return { status: 'COMPLETED', progress: 100, videoUrl, thumbnailUrl: '', audioUrl: '' };
    }

    if (taskStatus === 'failed' || taskStatus === 'error') {
        let errorMsg = result.data?.error || result.data?.message || result?.message || 'Atlas Cloud video generation failed';
        let safetyTriggered = false;

        if (typeof errorMsg === 'string' && errorMsg.includes('real person')) {
            errorMsg = "Seedance AI blocked the generation because it detected a photo-realistic face. Auto-retrying by gracefully falling back to Safe Mode...";
            safetyTriggered = true;
        } else if (typeof errorMsg === 'string' && errorMsg.includes('safet')) {
            errorMsg = "Generation blocked by AI safety filters. Auto-retrying in Safe Mode...";
            safetyTriggered = true;
        }

        console.warn(`⚠️ [Atlas Cloud] Task ${taskId} failed: ${errorMsg}`);
        
        // Return retryable=true for safety triggers to empower nodes.js to automatically strip images and retry
        return { 
            status: 'FAILED', 
            progress: 0, 
            error: errorMsg, 
            retryable: safetyTriggered ? true : false,
            safetyTriggered: safetyTriggered 
        };
    }

    if (taskStatus === 'processing' || taskStatus === 'in_progress' || taskStatus === 'starting') return { status: 'IN_PROGRESS', progress: 50 };
    return { status: 'IN_QUEUE', progress: 10 };
}

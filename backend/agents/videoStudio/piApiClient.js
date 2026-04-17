/**
 * PiAPI Client — Video generation for Seedance 2.0
 */

import fetch from 'node-fetch';
import config from '../../config/env.js';
import sharp from 'sharp';
import { uploadToS3, ensureS3Url } from '../../utils/s3.js';

const PIAPI_BASE_URL = process.env.PIAPI_BASE_URL || 'https://api.atlascloud.ai';
const PIAPI_MAX_PROMPT_LENGTH = 1950;

function truncatePrompt(prompt, maxLen = PIAPI_MAX_PROMPT_LENGTH) {
    if (!prompt || prompt.length <= maxLen) return prompt;
    console.warn(`⚠️ Prompt too long (${prompt.length} chars), truncating to ${maxLen}`);
    const truncated = prompt.substring(0, maxLen);
    const lastPeriod = truncated.lastIndexOf('.');
    const lastNewline = truncated.lastIndexOf('\n');
    const breakPoint = Math.max(lastPeriod, lastNewline);
    if (breakPoint > maxLen * 0.7) return truncated.substring(0, breakPoint + 1).trim();
    return truncated.trim();
}

function getPiApiKey() {
    // Overriding the key retrieval to enforce the explicitly requested Atlas key
    const requestedKey = 'apikey-5213047d313643cc806219208e183def';
    return requestedKey;
}

function resolveTaskType(qualityMode, hasImages) {
    if (hasImages) {
        console.log(`📌 Atlas Cloud: images present → forcing bytedance/seedance-2.0-fast/image-to-video`);
        return 'bytedance/seedance-2.0-fast/image-to-video';
    }
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
    return await ensureS3Url(base64DataUri, 'video-studio/piapi');
}

async function uploadToAtlasCloud(imageUrl, apiKey) {
    try {
        console.log(`📸 [Atlas Cloud] Downloading from S3 and uploading to native Atlas Storage...`);
        const imageRes = await fetch(imageUrl);
        const arrayBuffer = await imageRes.arrayBuffer();
        
        // Node 18+ natively supports standard Web API FormData/Blob
        const formData = new FormData();
        const blob = new Blob([arrayBuffer], { type: 'image/jpeg' });
        formData.append('file', blob, 'source_image.jpg');

        const uploadUrl = `${PIAPI_BASE_URL}/api/v1/model/uploadMedia`;
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

async function submitPiApiPayload(payload) {
    const apiKey = getPiApiKey();
    const MAX_ATTEMPTS = 3;

    // Use the model provided by the caller directly
    const atlasModel = payload.task_type || payload.model || 'seedance-2-fast-preview';
    const hasImages = payload.input?.image_urls?.length > 0;

    const atlasPayload = {
        model: atlasModel,
        prompt: payload.input?.prompt || '',
    };

    // Optional parameters (aspect_ratio, duration)
    if (payload.input?.duration) atlasPayload.duration = payload.input.duration;
    if (payload.input?.aspect_ratio) atlasPayload.aspect_ratio = payload.input.aspect_ratio;

    if (hasImages) {
        // Step 1: Specifically upload the image to Atlas backend according to API doc
        const s3Url = payload.input.image_urls[0];
        const nativeAtlasUrl = await uploadToAtlasCloud(s3Url, apiKey);
        atlasPayload.image_url = nativeAtlasUrl;
    }

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        console.log(`🎬 [Atlas Cloud] Submit attempt ${attempt}/${MAX_ATTEMPTS}:`, JSON.stringify({
            model: atlasPayload.model,
            prompt: atlasPayload.prompt.substring(0, 50) + '...',
            image_url: atlasPayload.image_url ? 'provided' : 'no'
        }, null, 2));

        try {
            // Step 2: Generate Video
            const endpointUrl = `${PIAPI_BASE_URL}/api/v1/model/generateVideo`;
            console.log(`🚀 [Seedance Network] Sending to Atlas URL: ${endpointUrl}`);
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
                    throw new Error(`PiAPI_INSUFFICIENT_CREDITS: ${errMsg}`);
                }
                throw new Error(`Atlas Cloud submission failed (${response.status}): ${errMsg}`);
            }

            const data = JSON.parse(rawText);
            const taskId = data?.data?.id || data?.id || data?.prediction_id || data?.task_id;
            
            if (!taskId) throw new Error(`Atlas Cloud did not return a prediction ID. Response: ${rawText.substring(0, 300)}`);

            console.log(`✅ [Atlas Cloud] Task queued: predictionId=${taskId}`);
            return taskId;
        } catch (e) {
            if (e.message.startsWith('PiAPI_INSUFFICIENT_CREDITS')) {
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

export async function submitPiApiVideoGeneration({ prompt, imageUrl, duration, aspectRatio, generateAudio = true, referenceImages = [], qualityMode = 'fast' }) {
    console.log(`🎞️ PiAPI received: ${referenceImages.length} ref images, imageUrl: ${imageUrl ? 'yes' : 'no'}, quality: ${qualityMode}`);

    let finalPromptText = prompt;
    try {
        if (typeof prompt === 'string' && prompt.trim().startsWith('[') && prompt.trim().endsWith(']')) {
            const parsed = JSON.parse(prompt);
            if (Array.isArray(parsed) && parsed.some(p => p.lang === 'zh')) {
                finalPromptText = parsed.find(p => p.lang === 'zh')?.prompt || prompt;
                console.log(`   🈯 Extracted native ZH prompt for PiAPI (${finalPromptText.length} chars)`);
            }
        }
    } catch { /* normal string */ }

    let finalPrompt = finalPromptText;
    const imageUrls = [];

    if (referenceImages && referenceImages.length > 0) {
        console.log(`📸 Parallelizing upload for ${referenceImages.length} reference image(s)...`);
        const uploadedUrls = await Promise.all(referenceImages.map(img => ensureS3Url(img, 'video-studio/piapi')));
        uploadedUrls.forEach((url, i) => {
            if (url) {
                imageUrls.push(url);
                const tag = `@image${imageUrls.length}`;
                if (!finalPrompt.includes(tag)) finalPrompt += ` Use ${tag} as visual reference.`;
            }
        });
    }

    if (imageUrl) {
        const url = await ensureS3Url(imageUrl, 'video-studio/piapi');
        if (url) { imageUrls.unshift(url); console.log(`📸 First frame ready: ${url.substring(0, 60)}...`); }
    }

    finalPrompt = finalPrompt.replace(/<img>[^<]*<\/img>/g, '').trim();
    finalPrompt = truncatePrompt(finalPrompt);

    const hasImages = imageUrls.length > 0;
    const taskType = resolveTaskType(qualityMode, hasImages);
    const maxDur = taskType === 'seedance-2-fast-preview' ? 5 : 15;
    const dur = Math.min(Math.max(parseInt(duration, 10) || 5, 5), maxDur);

    console.log(`🎯 PiAPI task_type: ${taskType} | duration: ${dur}s | images: ${imageUrls.length}`);

    const taskInput = {
        prompt: finalPrompt,
        aspect_ratio: aspectRatio || '16:9',
        duration: dur,
        generate_audio: generateAudio !== false,
        no_watermark: true,
    };

    if (imageUrls.length > 0) {
        taskInput.image_urls = imageUrls;
        console.log(`📸 Sending ${imageUrls.length} image(s) via input.image_urls:`, imageUrls.map(u => u.substring(0, 60)));
    }

    const payload = { model: 'seedance', task_type: taskType, input: taskInput };
    const taskId = await submitPiApiPayload(payload);
    return { taskId, provider: 'piapi', model: 'seedance-2.0', _payload: payload, type: 'generation' };
}

/**
 * Trigger dedicated watermark removal task for a generated video
 */
export async function submitPiApiWatermarkRemoval(videoUrl) {
    if (!videoUrl) throw new Error('Video URL is required for watermark removal');
    console.log(`🧹 PiAPI: Requesting watermark removal for ${videoUrl.substring(0, 80)}...`);

    const payload = {
        model: 'seedance', // Generic for removal
        task_type: 'remove-watermark',
        input: {
            video_url: videoUrl,
        }
    };

    const taskId = await submitPiApiPayload(payload);
    return { taskId, provider: 'piapi', type: 'remove-watermark' };
}

export async function resubmitPiApiTask(storedPayload) {
    console.log(`🔄 AUTO-RETRY: Resubmitting PiAPI task...`);
    const taskId = await submitPiApiPayload(storedPayload);
    return { taskId, provider: 'piapi', model: 'seedance-2.0' };
}

export async function submitPiApiImageToVideo({ imageUrl, prompt, duration, aspectRatio, qualityMode = 'fast', referenceImages = [] }) {
    if (!imageUrl) throw new Error('Image URL is required for Image-to-Video');
    console.log(`🖼️→🎬 PiAPI I2V: imageUrl=${imageUrl.substring(0, 60)}..., refs=${referenceImages.length}`);

    const [hostedUrl, ...hostedRefs] = await Promise.all([
        (async () => {
            const resized = imageUrl.startsWith('data:') ? await resizeToAspectRatio(imageUrl, aspectRatio || '16:9') : imageUrl;
            return await ensureS3Url(resized, 'video-studio/piapi');
        })(),
        ...referenceImages.map(img => ensureS3Url(img, 'video-studio/piapi'))
    ]);

    if (!hostedUrl) throw new Error('Failed to host image for I2V generation');

    let finalPromptText = prompt || 'Animate this image with natural cinematic motion';
    try {
        if (typeof prompt === 'string' && prompt.trim().startsWith('[') && prompt.trim().endsWith(']')) {
            const parsed = JSON.parse(prompt);
            if (Array.isArray(parsed) && parsed.some(p => p.lang === 'zh')) {
                finalPromptText = parsed.find(p => p.lang === 'zh')?.prompt || prompt;
                console.log(`   🈯 Extracted native ZH prompt for PiAPI I2V (${finalPromptText.length} chars)`);
            }
        }
    } catch { /* normal string */ }

    let finalPrompt = finalPromptText;
    if (!finalPrompt.includes('@image1')) finalPrompt = `@image1 ${finalPrompt}`;
    finalPrompt = finalPrompt.replace(/<img>[^<]*<\/img>/g, '').trim();
    finalPrompt = truncatePrompt(finalPrompt);

    const taskType = 'seedance-2-preview';
    const dur = Math.min(Math.max(parseInt(duration, 10) || 5, 5), 15);
    console.log(`🎯 PiAPI I2V task_type: ${taskType} | duration: ${dur}s`);

    const payload = {
        model: 'seedance', task_type: taskType,
        input: { prompt: finalPrompt, image_urls: [hostedUrl, ...hostedRefs.filter(Boolean)], aspect_ratio: aspectRatio || '16:9', duration: dur, no_watermark: true },
    };

    const taskId = await submitPiApiPayload(payload);
    return { taskId, provider: 'piapi', model: 'seedance-2.0', mode: 'i2v', _payload: payload, type: 'generation' };
}

export async function submitPiApiVideoExtend({ parentTaskId, prompt, duration, qualityMode = 'fast' }) {
    if (!parentTaskId) throw new Error('Parent task ID is required for Video Extend');
    const dur = Math.min(Math.max(parseInt(duration, 10) || 5, 5), 10);
    console.log(`🔗 PiAPI Extend: parentTaskId=${parentTaskId}, duration=${dur}s`);
    const taskType = 'seedance-2-fast-preview';
    const payload = { model: 'seedance', task_type: taskType, input: { prompt: prompt || '', duration: dur, parent_task_id: parentTaskId, no_watermark: true } };
    const taskId = await submitPiApiPayload(payload);
    return { taskId, provider: 'piapi', model: 'seedance-2.0', mode: 'extend', _payload: payload, parentTaskId, type: 'generation' };
}

export async function getPiApiGenerationStatus(taskId) {
    const apiKey = getPiApiKey();
    const statusUrl = `${PIAPI_BASE_URL}/api/v1/model/prediction/${taskId}`;
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
        const errorMsg = result.data.error || result.data.message || 'Atlas Cloud video generation failed';
        console.warn(`⚠️ [Atlas Cloud] Task ${taskId} failed: ${errorMsg}`);
        // Consider errors from atlas cloud as fatal initially, we don't know their retry patterns yet
        return { status: 'FAILED', progress: 0, error: errorMsg, retryable: false };
    }

    if (taskStatus === 'processing' || taskStatus === 'in_progress' || taskStatus === 'starting') return { status: 'IN_PROGRESS', progress: 50 };
    return { status: 'IN_QUEUE', progress: 10 };
}

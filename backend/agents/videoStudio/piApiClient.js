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
    const key = config.piapi?.apiKey || process.env.PIAPI_API_KEY || 'apikey-5213047d313643cc806219208e183def';
    if (!key) throw new Error('PIAPI_API_KEY not configured. Add it to .env');
    return key;
}

function resolveTaskType(qualityMode, hasImages) {
    if (hasImages) {
        console.log(`📌 PiAPI: images present → forcing seedance-2-preview`);
        return 'seedance-2-preview';
    }
    return 'seedance-2-fast-preview';
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

async function submitPiApiPayload(payload) {
    const apiKey = getPiApiKey();
    const MAX_ATTEMPTS = 3;

    // Transform PiAPI-format payload into Atlas Cloud format
    const hasImages = payload.input?.image_urls?.length > 0;
    const atlasModel = hasImages
        ? 'bytedance/seedance-v1-pro-i2v-480p'
        : 'bytedance/seedance-v1-pro-t2v-480p';

    const atlasPayload = {
        model: atlasModel,
        prompt: payload.input?.prompt || '',
        duration: payload.input?.duration || 5,
        aspect_ratio: payload.input?.aspect_ratio || '16:9',
        seed: -1,
    };

    // For I2V, pass the first image as the primary image
    if (hasImages) {
        atlasPayload.image = payload.input.image_urls[0];
        // Pass additional reference images if available
        if (payload.input.image_urls.length > 1) {
            atlasPayload.image_urls = payload.input.image_urls;
        }
    }

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        console.log(`🎬 [Atlas Cloud] Submit attempt ${attempt}/${MAX_ATTEMPTS}:`, JSON.stringify({
            model: atlasPayload.model,
            prompt: atlasPayload.prompt.substring(0, 100) + '...',
            duration: atlasPayload.duration,
            aspect_ratio: atlasPayload.aspect_ratio,
            hasImage: !!atlasPayload.image,
        }, null, 2));

        try {
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
            console.log(`📥 [Atlas Cloud] Response attempt ${attempt} (${response.status}):`, rawText ? rawText.substring(0, 1000) : 'EMPTY');

            if (!rawText || rawText === 'null') {
                throw new Error(`Atlas Cloud returned empty response (${response.status})`);
            }

            let data;
            try { data = JSON.parse(rawText); }
            catch (e) { throw new Error(`Atlas Cloud returned non-JSON (${response.status}): ${rawText.substring(0, 200)}`); }

            // Handle Atlas Cloud error responses
            if (!response.ok) {
                const errMsg = data?.message || data?.error || data?.detail || JSON.stringify(data).substring(0, 300);

                // Insufficient credits — non-retryable
                if (response.status === 402 || 
                    (typeof errMsg === 'string' && (errMsg.includes('insufficient') || errMsg.includes('credits') || errMsg.includes('quota') || errMsg.includes('balance')))) {
                    throw new Error(`PiAPI_INSUFFICIENT_CREDITS: ${errMsg}`);
                }

                // Auth errors — non-retryable
                if (response.status === 401 || response.status === 403) {
                    throw new Error(`PiAPI_AUTH_ERROR (${response.status}): ${errMsg}`);
                }

                throw new Error(`Atlas Cloud submission failed (${response.status}): ${errMsg}`);
            }

            // Extract prediction ID from Atlas Cloud response
            const taskId = data.prediction_id || data.predictionId || data.id || data.task_id || data.data?.task_id;
            if (!taskId) throw new Error(`Atlas Cloud did not return a prediction ID. Response: ${JSON.stringify(data).substring(0, 300)}`);

            console.log(`✅ [Atlas Cloud] Task queued: predictionId=${taskId}`);
            return taskId;
        } catch (e) {
            // Non-retryable errors — throw immediately
            if (e.message.startsWith('PiAPI_INSUFFICIENT_CREDITS') || e.message.startsWith('PiAPI_AUTH_ERROR')) {
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
    console.log(`📊 [Atlas Cloud] Polling status: ${statusUrl}`);
    const response = await fetch(statusUrl, { 
        headers: { 'Authorization': `Bearer ${apiKey}` } 
    });
    const rawText = await response.text();
    console.log(`📊 [Atlas Cloud] Status for ${taskId}: ${rawText ? rawText.substring(0, 500) : 'EMPTY'}`);

    if (!rawText || rawText === 'null') {
        return { status: 'IN_PROGRESS', progress: 30 };
    }

    let data;
    try { data = JSON.parse(rawText); }
    catch (e) { return { status: 'IN_PROGRESS', progress: 30 }; }

    const task = data.data || data;
    const status = (task.status || task.state || '').toLowerCase();
    console.log(`📊 [Atlas Cloud] Task status: ${status}`);

    if (status === 'completed' || status === 'success' || status === 'succeeded') {
        const output = task.output || task.result || {};
        const videoUrl = output.video || output.video_url || output.url
            || (Array.isArray(output.videos) ? output.videos[0]?.url : null)
            || (Array.isArray(output.result_urls) ? output.result_urls[0] : null)
            || task.video_url || task.output_url || task.result_url || '';
        console.log(`✅ [Atlas Cloud] Video complete: ${videoUrl ? videoUrl.substring(0, 100) : 'No URL found'}`);
        return { status: 'COMPLETED', progress: 100, videoUrl, thumbnailUrl: output.thumbnail_url || '', audioUrl: output.audio_url || '' };
    }

    if (status === 'failed' || status === 'error' || status === 'canceled') {
        const errorInfo = task.error || {};
        const errorMsg = typeof errorInfo === 'string' ? errorInfo : (errorInfo.message || errorInfo.raw_message || task.message || 'Atlas Cloud video generation failed');
        const isRetryable = status !== 'canceled';
        if (isRetryable) console.warn(`⚠️ [Atlas Cloud] Task ${taskId} retryable error: ${errorMsg}`);
        return { status: 'FAILED', progress: 0, error: errorMsg, retryable: isRetryable };
    }

    if (status === 'processing' || status === 'in_progress' || status === 'running') return { status: 'IN_PROGRESS', progress: 50 };
    return { status: 'IN_QUEUE', progress: 10 };
}

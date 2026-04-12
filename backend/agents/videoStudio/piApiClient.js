/**
 * PiAPI Client — Video generation for Seedance 2.0
 */

import fetch from 'node-fetch';
import config from '../../config/env.js';
import sharp from 'sharp';
import { uploadToS3, ensureS3Url } from '../../utils/s3.js';

const PIAPI_BASE_URL = 'https://api.piapi.ai';
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
    const key = config.piapi?.apiKey || process.env.PIAPI_API_KEY;
    if (!key) throw new Error('PIAPI_API_KEY not configured. Add it to .env');
    return key;
}

function resolveTaskType(qualityMode, hasImages) {
    if (hasImages) {
        console.log(`📌 PiAPI: images present → forcing seedance-2-preview`);
        return 'seedance-2-preview';
    }
    return qualityMode === 'quality' ? 'seedance-2-preview' : 'seedance-2-fast-preview';
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

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        console.log(`🎬 PiAPI submit attempt ${attempt}/${MAX_ATTEMPTS}:`, JSON.stringify({
            model: payload.model,
            task_type: payload.task_type,
            input: {
                ...payload.input,
                prompt: payload.input.prompt.substring(0, 100) + '...',
                image_urls: payload.input.image_urls ? `${payload.input.image_urls.length} images` : undefined,
                duration: payload.input.duration,
            }
        }, null, 2));

        try {
            const response = await fetch(`${PIAPI_BASE_URL}/api/v1/task`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(20000),
            });

            const rawText = await response.text();
            console.log(`📥 PiAPI raw response attempt ${attempt} (${response.status}):`, rawText.substring(0, 1000));

            let data;
            try { data = JSON.parse(rawText); }
            catch (e) { throw new Error(`PiAPI returned non-JSON (${response.status}): ${rawText.substring(0, 200)}`); }

            // ⚠️ CRITICAL: Detect non-retryable errors immediately — don't waste retry cycles
            if (data.code && data.code !== 200) {
                const errMsg = data.message || data.data?.error?.message || JSON.stringify(data).substring(0, 300);
                const errCode = data.data?.error?.code || 0;

                // Insufficient credits — retrying will never fix this
                if (errCode === 10002 || errMsg.includes('insufficient credits') || errMsg.includes('insufficient_user_quota')) {
                    throw new Error(`PiAPI_INSUFFICIENT_CREDITS: ${errMsg}`);
                }

                // Account/auth errors — also non-retryable
                if (errCode === 10001 || errCode === 10003) {
                    throw new Error(`PiAPI_AUTH_ERROR (${errCode}): ${errMsg}`);
                }

                throw new Error(`PiAPI submission failed (code ${data.code}): ${errMsg}`);
            }

            if (!response.ok && !data.data) {
                throw new Error(`PiAPI submission failed (${response.status}): ${data.message || data.error || rawText.substring(0, 200)}`);
            }

            const taskId = data.data?.task_id || data.task_id;
            if (!taskId) throw new Error(`PiAPI did not return a taskId. Response: ${JSON.stringify(data).substring(0, 300)}`);

            console.log(`✅ PiAPI queued: taskId=${taskId}`);
            return taskId;
        } catch (e) {
            // Non-retryable errors — throw immediately
            if (e.message.startsWith('PiAPI_INSUFFICIENT_CREDITS') || e.message.startsWith('PiAPI_AUTH_ERROR')) {
                console.error(`🚫 PiAPI non-retryable error: ${e.message}`);
                throw e;
            }

            console.warn(`⚠️ PiAPI submit attempt ${attempt} failed: ${e.message}`);
            if (attempt < MAX_ATTEMPTS) {
                console.log(`🔄 Retrying PiAPI submit in 3s...`);
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
    return { taskId, provider: 'piapi', model: 'seedance-2.0', _payload: payload };
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
    return { taskId, provider: 'piapi', model: 'seedance-2.0', mode: 'i2v', _payload: payload };
}

export async function submitPiApiVideoExtend({ parentTaskId, prompt, duration, qualityMode = 'fast' }) {
    if (!parentTaskId) throw new Error('Parent task ID is required for Video Extend');
    const dur = Math.min(Math.max(parseInt(duration, 10) || 5, 5), 10);
    console.log(`🔗 PiAPI Extend: parentTaskId=${parentTaskId}, duration=${dur}s`);
    const taskType = qualityMode === 'quality' ? 'seedance-2-preview' : 'seedance-2-fast-preview';
    const payload = { model: 'seedance', task_type: taskType, input: { prompt: prompt || '', duration: dur, parent_task_id: parentTaskId, no_watermark: true } };
    const taskId = await submitPiApiPayload(payload);
    return { taskId, provider: 'piapi', model: 'seedance-2.0', mode: 'extend', _payload: payload, parentTaskId };
}

export async function getPiApiGenerationStatus(taskId) {
    const apiKey = getPiApiKey();
    const response = await fetch(`${PIAPI_BASE_URL}/api/v1/task/${taskId}`, { headers: { 'x-api-key': apiKey } });
    const rawText = await response.text();
    console.log(`📊 PiAPI status for ${taskId}: ${rawText.substring(0, 500)}`);

    let data;
    try { data = JSON.parse(rawText); }
    catch (e) { return { status: 'IN_PROGRESS', progress: 30 }; }

    const task = data.data || data;
    const status = task.status || task.state || '';
    console.log(`📊 PiAPI task status: ${status}`);

    if (status === 'completed' || status === 'success') {
        const output = task.output || {};
        const videoUrl = output.video || output.video_url || output.url
            || (Array.isArray(output.videos) ? output.videos[0]?.url : null)
            || (Array.isArray(output.result_urls) ? output.result_urls[0] : null)
            || task.video_url || task.output_url || '';
        console.log(`✅ PiAPI video complete: ${videoUrl ? videoUrl.substring(0, 100) : 'No URL found'}`);
        return { status: 'COMPLETED', progress: 100, videoUrl, thumbnailUrl: output.thumbnail_url || '', audioUrl: output.audio_url || '' };
    }

    if (status === 'failed' || status === 'error') {
        const errorInfo = task.error || {};
        const errorMsg = errorInfo.message || errorInfo.raw_message || task.message || 'PiAPI video generation failed';
        const errorCode = errorInfo.code || 0;
        const isRetryable = errorCode === 10000 || errorMsg.includes('failed to process task');
        if (isRetryable) console.warn(`⚠️ PiAPI task ${taskId} retryable error (${errorCode}): ${errorMsg}`);
        return { status: 'FAILED', progress: 0, error: errorMsg, retryable: isRetryable };
    }

    if (status === 'processing' || status === 'in_progress') return { status: 'IN_PROGRESS', progress: 50 };
    return { status: 'IN_QUEUE', progress: 10 };
}

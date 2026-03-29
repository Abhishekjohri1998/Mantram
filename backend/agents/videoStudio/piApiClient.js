/**
 * PiAPI Client — Video generation for Seedance 2.0
 * 
 * Based on official PiAPI docs: https://piapi.ai/docs/seedance-api/seedance-2-preview
 * 
 * PiAPI unified API:
 *   - Generate: POST https://api.piapi.ai/api/v1/task
 *   - Status:   GET  https://api.piapi.ai/api/v1/task/{taskId}
 *   - Auth:     x-api-key header
 * 
 * Request format (from docs):
 *   {
 *     "model": "seedance",
 *     "task_type": "seedance-2-preview",
 *     "input": {
 *       "prompt": "...",
 *       "duration": 5,
 *       "aspect_ratio": "16:9",
 *       "no_watermark": true        // removes watermark on paid plans
 *     }
 *   }
 * 
 * Response format:
 *   { "code": 200, "data": { "task_id": "...", "status": "pending" } }
 * 
 * Get task response (completed):
 *   { "data": { "status": "completed", "output": { "video": "https://..." } } }
 *   NOTE: output.video (NOT output.video_url)
 */

import config from '../../config/env.js';
import sharp from 'sharp';
import { uploadToS3, ensureS3Url } from '../../utils/s3.js';

const PIAPI_BASE_URL = 'https://api.piapi.ai';
const PIAPI_MAX_PROMPT_LENGTH = 1950; // PiAPI enforces 2000 char limit; leave buffer

/**
 * Truncate a prompt to fit PiAPI's character limit.
 * Tries to break at sentence boundaries for cleaner output.
 */
function truncatePrompt(prompt, maxLen = PIAPI_MAX_PROMPT_LENGTH) {
    if (!prompt || prompt.length <= maxLen) return prompt;
    console.warn(`⚠️ Prompt too long (${prompt.length} chars), truncating to ${maxLen}`);
    const truncated = prompt.substring(0, maxLen);
    const lastPeriod = truncated.lastIndexOf('.');
    const lastNewline = truncated.lastIndexOf('\n');
    const breakPoint = Math.max(lastPeriod, lastNewline);
    if (breakPoint > maxLen * 0.7) {
        return truncated.substring(0, breakPoint + 1).trim();
    }
    return truncated.trim();
}

/**
 * Get the PiAPI API key
 */
function getPiApiKey() {
    const key = config.piapi?.apiKey || process.env.PIAPI_API_KEY;
    if (!key) throw new Error('PIAPI_API_KEY not configured. Add it to .env');
    return key;
}

/**
 * Resize/pad a base64 image to match the target aspect ratio.
 * PiAPI Seedance 2 has a known bug where reference image aspect ratio
 * overrides the requested aspect_ratio. This function is the workaround.
 * Returns a new base64 data URI with the correct aspect ratio.
 */
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
        if (currentRatio > targetRatioFloat) {
            newWidth = width;
            newHeight = Math.round(width / targetRatioFloat);
        } else {
            newHeight = height;
            newWidth = Math.round(height * targetRatioFloat);
        }

        const resized = await sharp(buffer)
            .resize(newWidth, newHeight, {
                fit: 'contain',
                background: { r: 0, g: 0, b: 0, alpha: 1 },
            })
            .png()
            .toBuffer();

        console.log(`📐 Resized ref image: ${width}x${height} → ${newWidth}x${newHeight} (target ${targetRatio})`);
        return `data:image/png;base64,${resized.toString('base64')}`;
    } catch (e) {
        console.warn(`⚠️ Image resize failed: ${e.message}`);
        return base64DataUri;
    }
}

/**
 * Verify that a hosted URL is actually fetchable (returns image content).
 */
async function verifyHostedUrl(url) {
    try {
        const resp = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
        const ct = resp.headers.get('content-type') || '';
        if (resp.ok && ct.startsWith('image/')) return true;
        console.warn(`⚠️ URL verification failed: ${resp.status}, content-type: ${ct}`);
        return false;
    } catch (e) {
        console.warn(`⚠️ URL verification error: ${e.message}`);
        return false;
    }
}

/**
 * Upload a base64 image to a free file hosting service to get a public URL.
 * Uses catbox.moe (primary) and tmpfiles.org / 0x0.st (fallbacks).
 * Returns hosted URL or null.
 */
export async function uploadImageToHostedUrl(base64DataUri) {
    // This helper now uses the central ensureS3Url utility
    return await ensureS3Url(base64DataUri, 'video-studio/piapi');
}


/**
 * Submit a raw PiAPI payload and return the taskId.
 * Includes retry logic: up to 3 attempts with 3s delay for transient failures.
 */
async function submitPiApiPayload(payload) {
    const apiKey = getPiApiKey();
    const MAX_ATTEMPTS = 3;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        console.log(`🎬 PiAPI submit attempt ${attempt}/${MAX_ATTEMPTS}:`, JSON.stringify({
            ...payload,
            input: {
                ...payload.input,
                prompt: payload.input.prompt.substring(0, 200) + '...',
                image_urls: payload.input.image_urls?.map(u => u.substring(0, 60) + '...'),
            }
        }, null, 2));

        try {
            const response = await fetch(`${PIAPI_BASE_URL}/api/v1/task`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(20000),
            });

            const rawText = await response.text();
            console.log(`📥 PiAPI raw response attempt ${attempt} (${response.status}):`, rawText.substring(0, 1000));

            let data;
            try {
                data = JSON.parse(rawText);
            } catch (e) {
                throw new Error(`PiAPI returned non-JSON (${response.status}): ${rawText.substring(0, 200)}`);
            }

            if (data.code && data.code !== 200) {
                throw new Error(`PiAPI submission failed (code ${data.code}): ${data.message || JSON.stringify(data).substring(0, 300)}`);
            }

            if (!response.ok && !data.data) {
                throw new Error(`PiAPI submission failed (${response.status}): ${data.message || data.error || rawText.substring(0, 200)}`);
            }

            const taskId = data.data?.task_id || data.task_id;
            if (!taskId) {
                throw new Error(`PiAPI did not return a taskId. Response: ${JSON.stringify(data).substring(0, 300)}`);
            }

            console.log(`✅ PiAPI queued: taskId=${taskId}`);
            return taskId;
        } catch (e) {
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

/**
 * Submit video generation to PiAPI (Seedance 2.0)
 * Returns { taskId, provider: 'piapi', _payload }
 */
export async function submitPiApiVideoGeneration({ prompt, imageUrl, duration, aspectRatio, generateAudio = true, referenceImages = [], qualityMode = 'fast' }) {
    const dur = Math.min(Math.max(parseInt(duration, 10) || 5, 5), 15);

    console.log(`🎞️ PiAPI received: ${referenceImages.length} ref images, imageUrl: ${imageUrl ? 'yes' : 'no'}, quality: ${qualityMode}`);

    let finalPrompt = prompt;
    const imageUrls = [];

    // Upload reference images to S3 in parallel
    if (referenceImages && referenceImages.length > 0) {
        console.log(`📸 Parallelizing upload for ${referenceImages.length} reference image(s)...`);
        const uploadedUrls = await Promise.all(
            referenceImages.map((img, i) => ensureS3Url(img, 'video-studio/piapi'))
        );

        uploadedUrls.forEach((url, i) => {
            if (url) {
                imageUrls.push(url);
                const tag = `@image${imageUrls.length}`; // use 1-based index in the final array
                if (!finalPrompt.includes(tag)) {
                    finalPrompt += ` Use ${tag} as visual reference.`;
                }
            }
        });
    }

    // Handle first frame image (ensuring it's at the front)
    if (imageUrl) {
        const url = await ensureS3Url(imageUrl, 'video-studio/piapi');
        if (url) {
            imageUrls.unshift(url);
            console.log(`📸 First frame ready: ${url.substring(0, 60)}...`);
        }
    }

    // Clean any remaining <img> tags from prompt (legacy)
    finalPrompt = finalPrompt.replace(/<img>[^<]*<\/img>/g, '').trim();
    finalPrompt = truncatePrompt(finalPrompt);

    // Build task input
    const taskInput = {
        prompt: finalPrompt,
        aspect_ratio: aspectRatio || '16:9',
        duration: dur,
        generate_audio: generateAudio !== false,
        no_watermark: true, // Remove watermark on paid PiAPI plans
    };

    if (imageUrls.length > 0) {
        taskInput.image_urls = imageUrls;
        console.log(`📸 Sending ${imageUrls.length} image(s) via input.image_urls:`, imageUrls.map(u => u.substring(0, 60)));
    }

    const taskType = qualityMode === 'quality' ? 'seedance-2-preview' : 'seedance-2-fast-preview';
    console.log(`🎯 PiAPI task_type: ${taskType} (quality mode: ${qualityMode})`);

    const payload = {
        model: 'seedance',
        task_type: taskType,
        input: taskInput,
    };

    const taskId = await submitPiApiPayload(payload);

    return {
        taskId,
        provider: 'piapi',
        model: 'seedance-2.0',
        _payload: payload,
    };
}

/**
 * Resubmit a PiAPI task using the stored payload.
 * Called automatically when the status poller detects "failed to process task".
 */
export async function resubmitPiApiTask(storedPayload) {
    console.log(`🔄 AUTO-RETRY: Resubmitting PiAPI task after 'failed to process task'...`);
    const taskId = await submitPiApiPayload(storedPayload);
    return { taskId, provider: 'piapi', model: 'seedance-2.0' };
}


/**
 * Submit Image-to-Video generation to PiAPI (Seedance 2.0)
 */
export async function submitPiApiImageToVideo({ imageUrl, prompt, duration, aspectRatio, qualityMode = 'fast', referenceImages = [] }) {
    if (!imageUrl) throw new Error('Image URL is required for Image-to-Video');

    const dur = Math.min(Math.max(parseInt(duration, 10) || 5, 5), 15);

    console.log(`🖼️→🎬 PiAPI I2V: imageUrl=${imageUrl.substring(0, 60)}..., refs=${referenceImages.length}, quality=${qualityMode}`);

    // Upload main image and any additional references in parallel
    console.log(`🖼️→🎬 Parallelizing I2V upload and references...`);
    const [hostedUrl, ...hostedRefs] = await Promise.all([
        (async () => {
            const resized = imageUrl.startsWith('data:') 
                ? await resizeToAspectRatio(imageUrl, aspectRatio || '16:9') 
                : imageUrl;
            return await ensureS3Url(resized, 'video-studio/piapi');
        })(),
        ...referenceImages.map(img => ensureS3Url(img, 'video-studio/piapi'))
    ]);

    if (!hostedUrl) throw new Error('Failed to host image for I2V generation');

    let finalPrompt = prompt || 'Animate this image with natural cinematic motion';
    if (!finalPrompt.includes('@image1')) {
        finalPrompt = `@image1 ${finalPrompt}`;
    }

    finalPrompt = finalPrompt.replace(/<img>[^<]*<\/img>/g, '').trim();
    finalPrompt = truncatePrompt(finalPrompt);

    const taskType = qualityMode === 'quality' ? 'seedance-2-preview' : 'seedance-2-fast-preview';
    console.log(`🎯 PiAPI I2V task_type: ${taskType}`);

    const payload = {
        model: 'seedance',
        task_type: taskType,
        input: {
            prompt: finalPrompt,
            image_urls: [hostedUrl, ...hostedRefs.filter(Boolean)],
            aspect_ratio: aspectRatio || '16:9',
            duration: dur,
            no_watermark: true, // Remove watermark on paid PiAPI plans
        },
    };

    const taskId = await submitPiApiPayload(payload);

    return {
        taskId,
        provider: 'piapi',
        model: 'seedance-2.0',
        mode: 'i2v',
        _payload: payload,
    };
}


/**
 * Submit Video Extension to PiAPI (Seedance 2.0)
 */
export async function submitPiApiVideoExtend({ parentTaskId, prompt, duration, qualityMode = 'fast' }) {
    if (!parentTaskId) throw new Error('Parent task ID is required for Video Extend');

    const dur = Math.min(Math.max(parseInt(duration, 10) || 5, 5), 10);

    console.log(`🔗 PiAPI Extend: parentTaskId=${parentTaskId}, duration=${dur}s, quality=${qualityMode}`);

    const taskType = qualityMode === 'quality' ? 'seedance-2-preview' : 'seedance-2-fast-preview';

    const payload = {
        model: 'seedance',
        task_type: taskType,
        input: {
            prompt: prompt || '',
            duration: dur,
            parent_task_id: parentTaskId,
            no_watermark: true, // Remove watermark on paid PiAPI plans
        },
    };

    const taskId = await submitPiApiPayload(payload);

    return {
        taskId,
        provider: 'piapi',
        model: 'seedance-2.0',
        mode: 'extend',
        _payload: payload,
        parentTaskId,
    };
}

/**
 * Poll PiAPI video generation status
 * Returns { status, progress, videoUrl }
 */
export async function getPiApiGenerationStatus(taskId) {
    const apiKey = getPiApiKey();

    const response = await fetch(`${PIAPI_BASE_URL}/api/v1/task/${taskId}`, {
        headers: {
            'x-api-key': apiKey,
        },
    });

    const rawText = await response.text();
    console.log(`📊 PiAPI status for ${taskId}: ${rawText.substring(0, 500)}`);

    let data;
    try {
        data = JSON.parse(rawText);
    } catch (e) {
        console.warn(`⚠️ PiAPI status non-JSON, returning IN_PROGRESS`);
        return { status: 'IN_PROGRESS', progress: 30 };
    }

    const task = data.data || data;
    const status = task.status || task.state || '';

    console.log(`📊 PiAPI task status: ${status}`);

    if (status === 'completed' || status === 'success') {
        const output = task.output || {};

        const videoUrl =
            output.video
            || output.video_url
            || output.url
            || (Array.isArray(output.videos) ? output.videos[0]?.url : null)
            || (Array.isArray(output.result_urls) ? output.result_urls[0] : null)
            || task.video_url
            || task.output_url
            || '';

        console.log(`✅ PiAPI video complete: ${videoUrl ? videoUrl.substring(0, 100) : 'No URL found'}`);

        return {
            status: 'COMPLETED',
            progress: 100,
            videoUrl,
            thumbnailUrl: output.thumbnail_url || output.thumbnail?.url || '',
            audioUrl: output.audio_url || output.audio?.url || '',
        };
    }

    if (status === 'failed' || status === 'error') {
        const errorInfo = task.error || {};
        const errorMsg = errorInfo.message || errorInfo.raw_message || task.message || 'PiAPI video generation failed';
        const errorCode = errorInfo.code || 0;

        const isRetryable = errorCode === 10000 || errorMsg.includes('failed to process task');
        if (isRetryable) {
            console.warn(`⚠️ PiAPI task ${taskId} failed with retryable error (code ${errorCode}): ${errorMsg}`);
        }

        return {
            status: 'FAILED',
            progress: 0,
            error: errorMsg,
            retryable: isRetryable,
        };
    }

    if (status === 'processing' || status === 'in_progress') {
        return { status: 'IN_PROGRESS', progress: 50 };
    }

    return { status: 'IN_QUEUE', progress: 10 };
}

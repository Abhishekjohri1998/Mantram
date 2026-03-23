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
 *     "model": "seedance",                    // NOT "seedance-2-0"
 *     "task_type": "seedance-2-preview",       // NOT "video_generation" or "image_to_video"
 *     "input": {
 *       "prompt": "...",                       // For image refs, embed URL in prompt text
 *       "duration": 5,                         // INTEGER, not string
 *       "aspect_ratio": "16:9"
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
    // Try to break at last sentence boundary
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

        // Parse target ratio
        const [rw, rh] = targetRatio.split(':').map(Number);
        if (!rw || !rh) return base64DataUri;

        const metadata = await sharp(buffer).metadata();
        const { width, height } = metadata;
        const currentRatio = width / height;
        const targetRatioFloat = rw / rh;

        // If already close enough, skip
        if (Math.abs(currentRatio - targetRatioFloat) < 0.05) return base64DataUri;

        let newWidth, newHeight;
        if (currentRatio > targetRatioFloat) {
            // Image is wider than target — pad top/bottom
            newWidth = width;
            newHeight = Math.round(width / targetRatioFloat);
        } else {
            // Image is taller than target — pad left/right
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
 * PiAPI needs to be able to GET the image — this catches redirect pages, 403s, etc.
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
 * Uses catbox.moe (primary, proven reliable with PiAPI) and tmpfiles.org (fallback).
 * Includes retry logic and URL verification to ensure external APIs can actually fetch the image.
 * Returns hosted URL or null.
 */
export async function uploadImageToHostedUrl(base64DataUri) {
    // Extract base64 and mime type
    const match = base64DataUri.match(/^data:([\w/+]+);base64,(.+)$/);
    if (!match) {
        console.warn('⚠️ Invalid base64 data URI');
        return null;
    }

    const mimeType = match[1];
    const base64Data = match[2];
    const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
    const fileName = `ref-${Date.now()}.${ext}`;
    const buffer = Buffer.from(base64Data, 'base64');

    console.log(`📤 Uploading ref image (${fileName}, ${Math.round(buffer.length / 1024)}KB)...`);

    // Method 1: catbox.moe — PRIMARY (proven reliable with PiAPI, direct file URLs)
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            const { Blob } = await import('buffer');
            const formData = new FormData();
            formData.append('reqtype', 'fileupload');
            const blob = new Blob([buffer], { type: mimeType });
            formData.append('fileToUpload', blob, fileName);

            const resp = await fetch('https://catbox.moe/user/api.php', {
                method: 'POST',
                body: formData,
                signal: AbortSignal.timeout(15000),
            });
            const text = await resp.text();
            console.log(`📥 catbox response attempt ${attempt} (${resp.status}): ${text.trim().substring(0, 200)}`);
            if (resp.ok && text.trim().startsWith('http')) {
                const url = text.trim();
                // Verify the URL is actually fetchable
                const ok = await verifyHostedUrl(url);
                if (ok) {
                    console.log(`✅ Image hosted at: ${url} (verified)`);
                    return url;
                }
                console.warn(`⚠️ catbox URL not fetchable, trying next method`);
                break; // URL exists but isn't fetchable, skip retries
            }
            console.warn(`⚠️ catbox upload failed attempt ${attempt} (${resp.status}): ${text.trim().substring(0, 200)}`);
        } catch (e) {
            console.warn(`⚠️ catbox upload error attempt ${attempt}: ${e.message}`);
        }
        if (attempt < 2) {
            console.log(`🔄 Retrying catbox in 1s...`);
            await new Promise(r => setTimeout(r, 1000));
        }
    }

    // Method 2: tmpfiles.org — fallback
    try {
        const { Blob } = await import('buffer');
        const formData = new FormData();
        const blob = new Blob([buffer], { type: mimeType });
        formData.append('file', blob, fileName);

        const resp = await fetch('https://tmpfiles.org/api/v1/upload', {
            method: 'POST',
            body: formData,
            signal: AbortSignal.timeout(15000),
        });
        const json = await resp.json();
        console.log(`📥 tmpfiles.org response (${resp.status}):`, JSON.stringify(json).substring(0, 200));
        if (json.status === 'success' && json.data?.url) {
            // tmpfiles.org URLs need /dl/ inserted for direct download
            const directUrl = json.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/').replace('http://', 'https://');
            const ok = await verifyHostedUrl(directUrl);
            if (ok) {
                console.log(`✅ Image hosted at: ${directUrl} (verified)`);
                return directUrl;
            }
            console.warn(`⚠️ tmpfiles.org URL not fetchable: ${directUrl}`);
        }
        console.warn(`⚠️ tmpfiles.org upload failed:`, JSON.stringify(json).substring(0, 200));
    } catch (e) {
        console.warn(`⚠️ tmpfiles.org upload error: ${e.message}`);
    }

    // Method 3: 0x0.st — last resort fallback
    try {
        const { Blob } = await import('buffer');
        const formData = new FormData();
        const blob = new Blob([buffer], { type: mimeType });
        formData.append('file', blob, fileName);

        const resp = await fetch('https://0x0.st', {
            method: 'POST',
            body: formData,
            signal: AbortSignal.timeout(15000),
        });
        const text = await resp.text();
        console.log(`📥 0x0.st response (${resp.status}): ${text.trim().substring(0, 200)}`);
        if (resp.ok && text.trim().startsWith('http')) {
            const url = text.trim();
            const ok = await verifyHostedUrl(url);
            if (ok) {
                console.log(`✅ Image hosted at: ${url} (verified)`);
                return url;
            }
        }
        console.warn(`⚠️ 0x0.st upload failed (${resp.status})`);
    } catch (e) {
        console.warn(`⚠️ 0x0.st upload error: ${e.message}`);
    }

    console.warn('❌ All image upload services failed');
    return null;
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
 * 
 * The _payload is stored so that auto-retry can resubmit on
 * PiAPI's intermittent "failed to process task" errors.
 */
export async function submitPiApiVideoGeneration({ prompt, imageUrl, duration, aspectRatio, generateAudio = true, referenceImages = [], qualityMode = 'fast' }) {
    const dur = Math.min(Math.max(duration || 5, 4), 15);

    console.log(`🎞️ PiAPI received: ${referenceImages.length} ref images, imageUrl: ${imageUrl ? 'yes' : 'no'}, quality: ${qualityMode}`);

    let finalPrompt = prompt;
    const imageUrls = [];

    // Upload reference images to catbox and embed URLs in prompt
    if (referenceImages && referenceImages.length > 0) {
        for (let i = 0; i < referenceImages.length; i++) {
            let url = referenceImages[i];
            if (!url) continue;

            if (url.startsWith('data:')) {
                const hostedUrl = await uploadImageToHostedUrl(url);
                if (hostedUrl) {
                    url = hostedUrl;
                } else {
                    console.warn(`⚠️ Could not upload ref image ${i + 1}, skipping`);
                    continue;
                }
            }

            console.log(`📸 Ref image ${i + 1} hosted: ${url.substring(0, 60)}...`);
            imageUrls.push(url);

            const tag = `@image${i + 1}`;
            if (!finalPrompt.includes(tag)) {
                finalPrompt += ` Use ${tag} as visual reference.`;
                console.log(`📸 Appended ${tag} reference to prompt`);
            }
        }
    }

    // Handle first frame image
    if (imageUrl) {
        let url = imageUrl;
        if (url.startsWith('data:')) {
            const hostedUrl = await uploadImageToHostedUrl(url);
            if (hostedUrl) url = hostedUrl;
            else url = null;
        }
        if (url) {
            imageUrls.unshift(url);
            console.log(`📸 First frame ready: ${url.substring(0, 60)}...`);
        }
    }

    // Clean any remaining <img> tags from prompt (legacy)
    finalPrompt = finalPrompt.replace(/<img>[^<]*<\/img>/g, '').trim();

    // Truncate to PiAPI's max prompt length (2000 chars)
    finalPrompt = truncatePrompt(finalPrompt);

    // Build task input
    const taskInput = {
        prompt: finalPrompt,
        aspect_ratio: aspectRatio || '16:9',
        duration: dur,
        generate_audio: generateAudio !== false,
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
        _payload: payload, // Store for auto-retry on "failed to process task"
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
 * Animates a still image into a video.
 * 
 * The key difference from regular generation:
 *   - image_urls contains the SOURCE image (not just a reference)
 *   - Prompt describes the MOTION, not the scene
 *   - @image1 tag tells Seedance to use it as the starting frame
 * 
 * Returns { taskId, provider: 'piapi', model: 'seedance-2.0', mode: 'i2v', _payload }
 */
export async function submitPiApiImageToVideo({ imageUrl, prompt, duration, aspectRatio, qualityMode = 'fast', referenceImages = [] }) {
    if (!imageUrl) throw new Error('Image URL is required for Image-to-Video');

    const dur = Math.min(Math.max(duration || 5, 4), 15);

    console.log(`🖼️→🎬 PiAPI I2V: imageUrl=${imageUrl.substring(0, 60)}..., refs=${referenceImages.length}, quality=${qualityMode}`);

    // Upload to catbox if base64
    let hostedUrl = imageUrl;
    if (imageUrl.startsWith('data:')) {
        // Resize to match target aspect ratio (PiAPI bug workaround)
        const resized = await resizeToAspectRatio(imageUrl, aspectRatio || '16:9');
        hostedUrl = await uploadImageToHostedUrl(resized);
        if (!hostedUrl) throw new Error('Failed to host image for I2V generation');
    }

    // Build prompt with @image1 as the primary frame source
    let finalPrompt = prompt || 'Animate this image with natural cinematic motion';
    if (!finalPrompt.includes('@image1')) {
        finalPrompt = `@image1 ${finalPrompt}`;
    }

    // Clean residual HTML tags
    finalPrompt = finalPrompt.replace(/<img>[^<]*<\/img>/g, '').trim();

    // Truncate to PiAPI's max prompt length (2000 chars)
    finalPrompt = truncatePrompt(finalPrompt);

    const taskType = qualityMode === 'quality' ? 'seedance-2-preview' : 'seedance-2-fast-preview';
    console.log(`🎯 PiAPI I2V task_type: ${taskType}`);

    const payload = {
        model: 'seedance',
        task_type: taskType,
        input: {
            prompt: finalPrompt,
            image_urls: [hostedUrl, ...referenceImages.filter(Boolean)],
            aspect_ratio: aspectRatio || '16:9',
            duration: dur,
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
 * Continues a previously generated video seamlessly.
 * 
 * Uses `parent_task_id` to reference the original PiAPI task,
 * allowing Seedance to extend the video while preserving style,
 * motion, characters, and audio consistency.
 * 
 * Returns { taskId, provider: 'piapi', model: 'seedance-2.0', mode: 'extend', _payload }
 */
export async function submitPiApiVideoExtend({ parentTaskId, prompt, duration, qualityMode = 'fast' }) {
    if (!parentTaskId) throw new Error('Parent task ID is required for Video Extend');

    const dur = Math.min(Math.max(duration || 5, 4), 10);

    console.log(`🔗 PiAPI Extend: parentTaskId=${parentTaskId}, duration=${dur}s, quality=${qualityMode}`);

    const taskType = qualityMode === 'quality' ? 'seedance-2-preview' : 'seedance-2-fast-preview';

    const payload = {
        model: 'seedance',
        task_type: taskType,
        input: {
            prompt: prompt || '',
            duration: dur,
            parent_task_id: parentTaskId,
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
 * 
 * Per PiAPI docs, the get-task response:
 *   - status: "pending", "processing", "completed", "failed"
 *   - output.video: the video URL (NOT output.video_url!)
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

    // Completed — per docs: output.video is the video URL
    if (status === 'completed' || status === 'success') {
        const output = task.output || {};

        // Per PiAPI docs: the video URL is at output.video (NOT output.video_url)
        const videoUrl =
            output.video            // ← Primary per docs
            || output.video_url     // Fallback
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

    // Failed — check if retryable
    if (status === 'failed' || status === 'error') {
        const errorInfo = task.error || {};
        const errorMsg = errorInfo.message || errorInfo.raw_message || task.message || 'PiAPI video generation failed';
        const errorCode = errorInfo.code || 0;

        // PiAPI error code 10000 "failed to process task" is intermittent
        // and usually succeeds on retry — signal auto-retry
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

    // Processing
    if (status === 'processing' || status === 'in_progress') {
        return { status: 'IN_PROGRESS', progress: 50 };
    }

    // Pending / queued
    return { status: 'IN_QUEUE', progress: 10 };
}

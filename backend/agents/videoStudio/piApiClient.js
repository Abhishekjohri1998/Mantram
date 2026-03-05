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
 * Upload a base64 image to a free file hosting service to get a public URL.
 * Uses 0x0.st (primary) and catbox.moe (fallback) — both free, no auth needed.
 * Returns hosted URL or null.
 */
async function uploadImageToHostedUrl(base64DataUri) {
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

    console.log(`📤 Uploading ref image to catbox.moe (${fileName}, ${Math.round(buffer.length / 1024)}KB)...`);

    // catbox.moe — free, no auth, tested and working
    try {
        const { Blob } = await import('buffer');
        const formData = new FormData();
        formData.append('reqtype', 'fileupload');
        const blob = new Blob([buffer], { type: mimeType });
        formData.append('fileToUpload', blob, fileName);

        const resp = await fetch('https://catbox.moe/user/api.php', {
            method: 'POST',
            body: formData,
        });
        const text = await resp.text();
        console.log(`📥 catbox response (${resp.status}): ${text.trim().substring(0, 200)}`);
        if (resp.ok && text.trim().startsWith('http')) {
            console.log(`✅ Image hosted at: ${text.trim()}`);
            return text.trim();
        }
        console.warn(`⚠️ catbox upload failed (${resp.status}): ${text.trim().substring(0, 200)}`);
    } catch (e) {
        console.warn(`⚠️ catbox upload error: ${e.message}`);
    }

    console.warn('⚠️ Image upload failed');
    return null;
}

/**
 * Submit video generation to PiAPI (Seedance 2.0)
 * Returns { taskId, provider: 'piapi' }
 * 
 * Per PiAPI docs (piapi.ai/docs/seedance-api/seedance-2-preview):
 *   - model: "seedance"
 *   - task_type: "seedance-2-preview" or "seedance-2-fast-preview"
 *   - input: { prompt, duration (int), aspect_ratio }
 *   - Images are embedded IN the prompt as <img>URL</img> tags
 *   - NO separate image_urls field
 *   - Base64 images must be uploaded to PiAPI ephemeral storage first
 */
export async function submitPiApiVideoGeneration({ prompt, imageUrl, duration, aspectRatio, generateAudio = true, referenceImages = [], qualityMode = 'fast' }) {
    const apiKey = getPiApiKey();

    const dur = Math.min(Math.max(duration || 5, 4), 15);

    console.log(`🎞️ PiAPI received: ${referenceImages.length} ref images, imageUrl: ${imageUrl ? 'yes' : 'no'}, quality: ${qualityMode}`);

    let finalPrompt = prompt;
    const imageUrls = []; // Only for first-frame images

    // Upload reference images to catbox and embed URLs in prompt
    // IMPORTANT: ref images go ONLY in the prompt (not in image_urls)
    // Putting them in image_urls makes Seedance treat them as first frames,
    // which overrides the user's selected aspect ratio (confirmed PiAPI bug)
    if (referenceImages && referenceImages.length > 0) {
        for (let i = 0; i < referenceImages.length; i++) {
            let url = referenceImages[i];
            if (!url) continue;

            // If base64, upload to get hosted URL
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

            // Add to image_urls for PiAPI's @imageN referencing
            imageUrls.push(url);

            // Ensure @imageN tag exists in prompt
            const tag = `@image${i + 1}`;
            if (!finalPrompt.includes(tag)) {
                finalPrompt += ` Use ${tag} as visual reference.`;
                console.log(`📸 Appended ${tag} reference to prompt`);
            }
        }
    }

    // Handle first frame image — this one IS supposed to control aspect ratio
    if (imageUrl) {
        let url = imageUrl;
        if (url.startsWith('data:')) {
            const hostedUrl = await uploadImageToHostedUrl(url);
            if (hostedUrl) url = hostedUrl;
            else url = null;
        }
        if (url) {
            imageUrls.unshift(url); // First frame goes first in image_urls
            console.log(`📸 First frame ready: ${url.substring(0, 60)}...`);
        }
    }

    // Clean any remaining <img> tags from prompt (legacy)
    finalPrompt = finalPrompt.replace(/<img>[^<]*<\/img>/g, '').trim();

    // Build task input
    const taskInput = {
        prompt: finalPrompt,
        aspect_ratio: aspectRatio || '16:9',
        duration: dur,
    };

    // Add image_urls (contains first frame + ref images for @imageN referencing)
    if (imageUrls.length > 0) {
        taskInput.image_urls = imageUrls;
        console.log(`📸 Sending ${imageUrls.length} image(s) via input.image_urls:`, imageUrls.map(u => u.substring(0, 60)));
    }

    // Use fast or quality task_type based on user selection
    const taskType = qualityMode === 'quality' ? 'seedance-2-preview' : 'seedance-2-fast-preview';
    console.log(`🎯 PiAPI task_type: ${taskType} (quality mode: ${qualityMode})`);

    const payload = {
        model: 'seedance',                  // Per docs: "seedance"
        task_type: taskType,
        input: taskInput,
    };

    console.log(`🎬 Submitting to PiAPI (Seedance 2.0):`, JSON.stringify({
        ...payload,
        input: {
            ...payload.input,
            prompt: payload.input.prompt.substring(0, 200) + '...',
            image_urls: payload.input.image_urls?.map(u => u.substring(0, 60) + '...'),
        }
    }, null, 2));

    const response = await fetch(`${PIAPI_BASE_URL}/api/v1/task`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,                // Per docs: x-api-key header
        },
        body: JSON.stringify(payload),
    });

    const rawText = await response.text();
    console.log(`📥 PiAPI raw response (${response.status}):`, rawText.substring(0, 1000));

    let data;
    try {
        data = JSON.parse(rawText);
    } catch (e) {
        throw new Error(`PiAPI returned non-JSON (${response.status}): ${rawText.substring(0, 200)}`);
    }

    // Check for errors
    if (data.code && data.code !== 200) {
        throw new Error(`PiAPI submission failed (code ${data.code}): ${data.message || JSON.stringify(data).substring(0, 300)}`);
    }

    if (!response.ok && !data.data) {
        throw new Error(`PiAPI submission failed (${response.status}): ${data.message || data.error || rawText.substring(0, 200)}`);
    }

    // Extract taskId — per docs: data.task_id
    const taskId = data.data?.task_id || data.task_id;

    if (!taskId) {
        console.error('❌ PiAPI response missing taskId. Full response:', JSON.stringify(data).substring(0, 1000));
        throw new Error(`PiAPI did not return a taskId. Response: ${JSON.stringify(data).substring(0, 300)}`);
    }

    console.log(`✅ PiAPI queued: taskId=${taskId}`);

    return {
        taskId,
        provider: 'piapi',
        model: 'seedance-2.0',
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

    // Failed
    if (status === 'failed' || status === 'error') {
        const errorInfo = task.error || {};
        return {
            status: 'FAILED',
            progress: 0,
            error: errorInfo.message || errorInfo.raw_message || task.message || 'PiAPI video generation failed',
        };
    }

    // Processing
    if (status === 'processing' || status === 'in_progress') {
        return { status: 'IN_PROGRESS', progress: 50 };
    }

    // Pending / queued
    return { status: 'IN_QUEUE', progress: 10 };
}

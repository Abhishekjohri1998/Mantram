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
 * Submit video generation to PiAPI (Seedance 2.0)
 * Returns { taskId, provider: 'piapi' }
 * 
 * Per PiAPI docs:
 *   - model MUST be "seedance"
 *   - task_type MUST be "seedance-2-preview"
 *   - duration is an integer (not string)
 *   - Images are embedded in the prompt text, NOT as a separate image_url field
 *     Syntax: <img>IMAGE_URL</img> Description of what's in the image
 */
export async function submitPiApiVideoGeneration({ prompt, imageUrl, duration, aspectRatio, generateAudio = true }) {
    const apiKey = getPiApiKey();

    const dur = Math.min(Math.max(duration || 5, 4), 15);

    // Per PiAPI docs: images are referenced IN the prompt text, not as a separate field
    // Syntax: <img>IMAGE_URL</img> prompt text describing the scene
    let finalPrompt = prompt;
    if (imageUrl && imageUrl.startsWith('http')) {
        // Embed image reference in prompt per PiAPI Seedance 2.0 docs
        finalPrompt = `<img>${imageUrl}</img> ${prompt}`;
        console.log(`📸 Embedded image reference in prompt: ${imageUrl.substring(0, 80)}...`);
    }

    // Build task input per official docs
    const taskInput = {
        prompt: finalPrompt,
        aspect_ratio: aspectRatio || '16:9',
        duration: dur,          // INTEGER per docs, not String(dur)
    };

    const payload = {
        model: 'seedance',                  // Per docs: "seedance", NOT "seedance-2-0"
        task_type: 'seedance-2-preview',    // Per docs: always "seedance-2-preview"
        input: taskInput,
    };

    console.log(`🎬 Submitting to PiAPI (Seedance 2.0):`, JSON.stringify(payload, null, 2).substring(0, 500));

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

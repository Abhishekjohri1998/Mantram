/**
 * kie.ai Client — Video generation for Veo 3.1 Fast & Seedance 2.0 Pro
 * 
 * kie.ai API (confirmed by live testing):
 *   - Generate: POST /api/v1/veo/generate
 *   - Auth: Bearer token via Authorization header
 *   - Base URL: https://api.kie.ai
 *   - Response: { code, msg, data: { taskId, generation_id, ... } }
 * 
 * Valid model names (confirmed):
 *   - "veo3"       → Veo 3.1 Quality
 *   - "veo3_fast"  → Veo 3.1 Fast
 *   - Seedance     → uses same endpoint pattern (TBD - may need separate endpoint)
 * 
 * Status polling:
 *   - Uses callback_url or polling endpoint (format TBD)
 *   - successFlag: 0=generating, 1=success, 2=failed, 3=gen-failed
 */

import config from '../../config/env.js';

const KIE_BASE_URL = 'https://api.kie.ai';

// ── kie.ai model → config map ──
const KIE_MODELS = {
    'veo-3.1-fast': {
        generateUrl: '/api/v1/veo/generate',
        statusUrl: '/api/v1/veo/query',
        modelParam: 'veo3_fast',
    },
    'seedance-2.0': {
        generateUrl: '/api/v1/veo/generate',  // Uses same unified endpoint
        statusUrl: '/api/v1/veo/query',
        modelParam: 'seedance2.0',            // Will try multiple patterns
    },
};

/**
 * Get the kie.ai API key
 */
function getKieApiKey() {
    const key = config.kie?.apiKey || process.env.KIE_API_KEY;
    return key || null;
}

/**
 * Submit video generation to kie.ai
 * Returns { taskId, provider: 'kie' }
 */
export async function submitKieVideoGeneration({ model, prompt, imageUrl, duration, aspectRatio }) {
    const apiKey = getKieApiKey();
    if (!apiKey) throw new Error('KIE_API_KEY not configured. Please add it to .env to use Veo 3.1 Fast.');
    
    const modelConfig = KIE_MODELS[model];
    if (!modelConfig) throw new Error(`Unknown kie.ai model: ${model}`);

    const dur = Math.min(Math.max(duration || 5, 4), 15);

    // Build payload
    const payload = {
        prompt,
        model: modelConfig.modelParam,
        aspect_ratio: aspectRatio || '16:9',
    };

    // Add duration for seedance
    if (model === 'seedance-2.0') {
        payload.duration = String(dur);
        payload.generate_audio = true;
    }

    // Add image for image-to-video
    if (imageUrl) {
        payload.image_url = imageUrl;
    }

    console.log(`🎬 Submitting to kie.ai: ${model} → ${modelConfig.generateUrl}`);
    console.log(`   Model param: "${modelConfig.modelParam}"`);
    console.log(`   Payload:`, JSON.stringify(payload, null, 2).substring(0, 500));

    const response = await fetch(`${KIE_BASE_URL}${modelConfig.generateUrl}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
    });

    const rawText = await response.text();
    console.log(`📥 kie.ai raw response (${response.status}):`, rawText.substring(0, 1000));

    let data;
    try {
        data = JSON.parse(rawText);
    } catch (e) {
        throw new Error(`kie.ai returned non-JSON (${response.status}): ${rawText.substring(0, 200)}`);
    }

    // Handle API errors
    if (data.code && data.code >= 400) {
        throw new Error(`kie.ai error (${data.code}): ${data.msg || rawText.substring(0, 200)}`);
    }

    if (!response.ok && !data.data) {
        throw new Error(`kie.ai submission failed (${response.status}): ${data.msg || rawText.substring(0, 200)}`);
    }

    // Extract taskId from response — kie.ai nests data in various formats
    const result = data.data || data;
    const taskId = result.taskId
        || result.task_id
        || result.generation_id
        || result.generationId
        || result.id
        || result.requestId
        || result.request_id;

    if (!taskId) {
        console.error('❌ kie.ai response missing taskId. Full response:', JSON.stringify(data).substring(0, 1000));
        throw new Error(`kie.ai did not return a taskId. Response: ${JSON.stringify(data).substring(0, 300)}`);
    }

    console.log(`✅ kie.ai queued: taskId=${taskId}`);

    return {
        taskId,
        provider: 'kie',
        model,
    };
}

/**
 * Poll kie.ai video generation status
 * Returns { status, progress, videoUrl }
 * 
 * kie.ai successFlag mapping:
 *   0 = Generating (in progress)
 *   1 = Success (completed)
 *   2 = Failed
 *   3 = Generation Failed (task created but gen failed)
 */
export async function getKieGenerationStatus(taskId, model) {
    const apiKey = getKieApiKey();

    // Try multiple status endpoint patterns
    const modelConfig = KIE_MODELS[model] || KIE_MODELS['veo-3.1-fast'];
    const statusEndpoints = [
        `${modelConfig.statusUrl}?taskId=${taskId}`,
        `/api/v1/veo/status?taskId=${taskId}`,
        `/api/v1/task/query?taskId=${taskId}`,
    ];

    let data = null;
    let lastError = '';

    for (const endpoint of statusEndpoints) {
        try {
            const response = await fetch(`${KIE_BASE_URL}${endpoint}`, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                },
            });

            if (response.status === 404) continue; // Try next endpoint

            const rawText = await response.text();
            console.log(`📊 kie.ai status (${endpoint}): ${rawText.substring(0, 300)}`);

            data = JSON.parse(rawText);

            // If we got a valid response (not 404), break
            if (data && (data.code !== 404 && data.status !== 404)) break;
            data = null; // Reset and try next
        } catch (e) {
            lastError = e.message;
            continue;
        }
    }

    if (!data) {
        console.warn(`⚠️ kie.ai status polling: all endpoints returned 404 for taskId=${taskId}`);
        // Return IN_PROGRESS — the task may still be processing, endpoints just aren't available yet
        return { status: 'IN_PROGRESS', progress: 30 };
    }

    const result = data.data || data;
    const flag = result.successFlag ?? result.success_flag ?? result.status ?? data.code;

    console.log(`📊 kie.ai status for ${taskId}: flag=${flag}`);

    // successFlag === 1 → Success
    if (flag === 1 || flag === '1' || flag === 'completed' || flag === 'success') {
        const videoUrl = (result.resultUrls || result.result_urls || [])[0]
            || result.videoUrl
            || result.video_url
            || result.url
            || '';

        console.log(`✅ kie.ai video complete: ${videoUrl ? 'URL received' : 'No URL found'}`);

        return {
            status: 'COMPLETED',
            progress: 100,
            videoUrl,
            thumbnailUrl: '',
            audioUrl: '',
        };
    }

    // successFlag === 2 or 3 → Failed
    if (flag === 2 || flag === '2' || flag === 3 || flag === '3' || flag === 'failed' || flag === 'error') {
        return {
            status: 'FAILED',
            progress: 0,
            error: result.errorMessage || result.error_message || result.msg || 'kie.ai video generation failed. Try again.',
        };
    }

    // Everything else → Generating
    return {
        status: 'IN_PROGRESS',
        progress: 40,
    };
}

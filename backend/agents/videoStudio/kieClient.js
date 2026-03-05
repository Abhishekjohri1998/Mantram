/**
 * kie.ai Client — Video generation for Veo 3.1 Fast & Seedance 2.0 Pro
 * 
 * kie.ai API pattern:
 *   1. Submit → POST to generate endpoint → returns { taskId }
 *   2. Poll   → GET with taskId query param → returns { successFlag, resultUrls }
 *      successFlag: 0=generating, 1=success, 2=failed, 3=gen-failed
 * 
 * Auth: Bearer token via Authorization header
 * Base URL: https://api.kie.ai
 */

import config from '../../config/env.js';

const KIE_BASE_URL = 'https://api.kie.ai';

// ── kie.ai model → endpoint map ──
const KIE_MODELS = {
    'veo-3.1-fast': {
        generateUrl: '/api/v1/veo3/generate',
        statusUrl: '/api/v1/veo3/status',
        modelParam: 'Veo 3.1 Fast',
    },
    'seedance-2.0': {
        generateUrl: '/api/v1/jobs/createTask',
        statusUrl: '/api/v1/jobs/status',
        modelParam: 'seedance-2.0',
    },
};

/**
 * Get the kie.ai API key
 */
function getKieApiKey() {
    const key = config.kie?.apiKey || process.env.KIE_API_KEY;
    if (!key) throw new Error('KIE_API_KEY not configured. Add it to .env');
    return key;
}

/**
 * Submit video generation to kie.ai
 * Returns { taskId, provider: 'kie' }
 */
export async function submitKieVideoGeneration({ model, prompt, imageUrl, duration, aspectRatio }) {
    const apiKey = getKieApiKey();
    const modelConfig = KIE_MODELS[model];
    if (!modelConfig) throw new Error(`Unknown kie.ai model: ${model}`);

    const dur = Math.min(Math.max(duration || 5, 4), 15);

    // Build payload based on model type
    let payload;

    if (model === 'veo-3.1-fast') {
        payload = {
            prompt,
            model: modelConfig.modelParam,
            aspect_ratio: aspectRatio || '16:9',
        };
        if (imageUrl) {
            payload.imageUrl = imageUrl;
        }
    } else if (model === 'seedance-2.0') {
        payload = {
            prompt,
            model: modelConfig.modelParam,
            duration: dur,
            aspect_ratio: aspectRatio || '16:9',
            generate_audio: true,
        };
        if (imageUrl) {
            payload.input_urls = [imageUrl];
        }
    }

    console.log(`🎬 Submitting to kie.ai: ${model} (${modelConfig.generateUrl})`);
    console.log(`   Payload:`, JSON.stringify(payload, null, 2).substring(0, 500));

    const response = await fetch(`${KIE_BASE_URL}${modelConfig.generateUrl}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const errText = await response.text();
        console.error(`❌ kie.ai error (${response.status}):`, errText);
        throw new Error(`kie.ai submission failed (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const taskId = data.taskId || data.task_id || data.id;

    if (!taskId) {
        console.error('❌ kie.ai response missing taskId:', JSON.stringify(data).substring(0, 500));
        throw new Error('kie.ai did not return a taskId');
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

    // Determine the correct status endpoint
    const modelConfig = KIE_MODELS[model] || KIE_MODELS['veo-3.1-fast'];
    const statusEndpoint = modelConfig.statusUrl;

    const response = await fetch(`${KIE_BASE_URL}${statusEndpoint}?taskId=${taskId}`, {
        headers: {
            'Authorization': `Bearer ${apiKey}`,
        },
    });

    if (!response.ok) {
        console.error(`❌ kie.ai status check failed: ${response.status}`);
        return { status: 'FAILED', progress: 0, error: `Status check failed: ${response.status}` };
    }

    const data = await response.json();
    const flag = data.successFlag ?? data.success_flag ?? data.status;

    console.log(`📊 kie.ai status for ${taskId}: successFlag=${flag}`);

    // successFlag === 1 → Success
    if (flag === 1 || flag === '1') {
        // Extract video URL from resultUrls array
        const videoUrl = (data.resultUrls || data.result_urls || [])[0]
            || data.videoUrl
            || data.video_url
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
    if (flag === 2 || flag === '2' || flag === 3 || flag === '3') {
        return {
            status: 'FAILED',
            progress: 0,
            error: data.errorMessage || data.error_message || 'kie.ai video generation failed. Try again.',
        };
    }

    // successFlag === 0 → Generating
    return {
        status: 'IN_PROGRESS',
        progress: 40,
    };
}

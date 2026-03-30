/**
 * Video Generation Client — Multi-provider SDK wrapper + cost calculator
 * 
 * Supported models (verified endpoints as of March 2026):
 *   - Kling 3.0 (v3) — 3-15s, multi-prompt, native audio, voice IDs       [fal.ai]
 *   - Google Veo 3 / 3.1 — 5-8s, extend-video, native audio              [fal.ai / LaoZhang]
 *   - Google Veo 3.1 Fast — 5-8s, faster + cheaper variant                [kie.ai / LaoZhang]
 *   - Seedance 1.0 Lite — 5-10s, fast & affordable                        [fal.ai]
 *   - Seedance 2.0 Pro — 5-15s, native audio, camera control, cinematic   [PiAPI / LaoZhang]
 *   - Sora 2 — 10-15s, OpenAI video gen                                   [LaoZhang only]
 * 
 * Provider routing (priority order):
 *   - LaoZhang: PRIMARY for Veo 3.1, Veo 3.1 Fast, Seedance 2.0, Sora 2 (cheapest)
 *   - fal.ai:   FALLBACK for Kling 3.0, Veo 3.1, Seedance 1.0 (queue-based async)
 *   - kie.ai:   FALLBACK for Veo 3.1 Fast (taskId-based async)
 *   - PiAPI:    FALLBACK for Seedance 2.0 (task-based async)
 *   - xAI:     Grok Imagine (native REST, no LZ equivalent)
 */

import config from '../../config/env.js';
import { submitKieVideoGeneration } from './kieClient.js';
import { submitPiApiVideoGeneration } from './piApiClient.js';
import { ensureS3Url } from '../../utils/s3.js';
import { isLaozhangAvailable, submitLaozhangVideoGeneration } from './laozhangClient.js';


const FAL_BASE_URL = 'https://queue.fal.run';
const GROK_BASE_URL = 'https://api.x.ai/v1';

// ── Model Endpoint Map (verified from fal.ai docs) ──
const MODEL_ENDPOINTS = {
    // Kling 3.0 — Standard tier
    'kling-3.0': {
        textToVideo: 'fal-ai/kling-video/v3/standard/text-to-video',
        imageToVideo: 'fal-ai/kling-video/v3/standard/image-to-video',
    },
    // Google Veo 3 / 3.1
    'veo-3.1': {
        textToVideo: 'fal-ai/veo3',
        imageToVideo: 'fal-ai/veo3/image-to-video',
        extendVideo: 'fal-ai/veo3.1/extend-video',
    },
    // Google Veo 3.1 Fast — cheaper, faster variant
    'veo-3.1-fast': {
        textToVideo: 'fal-ai/veo3/fast',
        imageToVideo: 'fal-ai/veo3/fast/image-to-video',
        extendVideo: 'fal-ai/veo3.1/fast/extend-video',
    },
    // Seedance 1.0 Lite
    'seedance-1.0': {
        textToVideo: 'fal-ai/bytedance/seedance/v1/lite/text-to-video',
        imageToVideo: 'fal-ai/bytedance/seedance/v1/lite/image-to-video',
    },
    // Seedance 2.0 Pro — native audio, camera control, cinematic
    'seedance-2.0': {
        textToVideo: 'fal-ai/bytedance/seedance/v2/pro/text-to-video',
        imageToVideo: 'fal-ai/bytedance/seedance/v2/pro/image-to-video',
    },
    // HunyuanVideo 1.5 — Tencent, cheapest draft tier
    'hunyuan': {
        textToVideo: 'fal-ai/hunyuan-video/video-to-video',
        imageToVideo: 'fal-ai/hunyuan-video/image-to-video',
    },
};

// ── Model availability ──
const MODEL_AVAILABLE = {
    'kling-3.0': true,
    'veo-3.1': true,
    'veo-3.1-fast': true,
    'seedance-1.0': true,
    'seedance-2.0': true,
    'grok-imagine': true,
    'hunyuan': true,
    'sora-2': true,  // LaoZhang only
};

// ── Cost table (USD per second of video) ──
export const COST_PER_SECOND = {
    'kling-3.0': { fast: 0.07, quality: 0.12 },
    'veo-3.1': { fast: 0.10, quality: 0.25 },
    'veo-3.1-fast': { fast: 0.06, quality: 0.10 },
    'seedance-1.0': { fast: 0.05, quality: 0.08 },
    'seedance-2.0': { fast: 0.05, quality: 0.10 },
    'grok-imagine': { fast: 0.08, quality: 0.08 },
    'hunyuan': { fast: 0.03, quality: 0.05 },
    'sora-2': { fast: 0.10, quality: 0.15 },
};

// ── Duration limits per model ──
const DURATION_LIMITS = {
    'kling-3.0': { min: 3, max: 15, supported: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] },
    'veo-3.1': { min: 5, max: 8, supported: [5, 6, 7, 8] },
    'veo-3.1-fast': { min: 5, max: 8, supported: [5, 6, 7, 8] },
    'seedance-1.0': { min: 5, max: 10, supported: [5, 10] },
    'seedance-2.0': { min: 5, max: 15, supported: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] },
    'grok-imagine': { min: 1, max: 15, supported: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] },
    'hunyuan': { min: 3, max: 10, supported: [3, 4, 5, 6, 7, 8, 9, 10] },
    'sora-2': { min: 5, max: 15, supported: [5, 10, 15] },
};

// ── Resolution config ──
const RESOLUTION_MAP = {
    '720p': { width: 1280, height: 720 },
    '1080p': { width: 1920, height: 1080 },
};

// ── Full Model Capabilities Matrix (exported for frontend) ──
export const MODEL_CAPABILITIES = {
    'kling-3.0': {
        id: 'kling-3.0', name: 'Kling 3.0', icon: '🎥', provider: 'laozhang',
        description: 'Best motion & physics — multi-shot, native audio, voice IDs',
        bestFor: 'Product demos, action shots, storyboard videos',
        duration: { min: 3, max: 15, native: 15, step: 1 },
        resolutions: ['720p', '1080p', '4k'],
        aspectRatios: ['16:9', '9:16', '1:1'],
        features: {
            firstFrame: true, lastFrame: true, referenceImages: false,
            extendVideo: false, multiShot: true, nativeAudio: true,
            voiceIds: true, cameraControl: false,
        },
        maxReferenceImages: 0,
        costPerSecond: COST_PER_SECOND['kling-3.0'],
        recommended: true,
    },
    'veo-3.1': {
        id: 'veo-3.1', name: 'Google Veo 3.1', icon: '🎬', provider: 'fal',
        description: 'Cinematic quality with native audio + extend-video',
        bestFor: 'Premium brand films, cinematic ads',
        duration: { min: 4, max: 8, native: 8, step: 2, extendChunk: 7, maxExtended: 148 },
        resolutions: ['720p', '1080p', '4k'],
        aspectRatios: ['16:9', '9:16'],
        features: {
            firstFrame: true, lastFrame: true, referenceImages: true,
            extendVideo: true, multiShot: false, nativeAudio: true,
            voiceIds: false, cameraControl: false,
        },
        maxReferenceImages: 3,
        costPerSecond: COST_PER_SECOND['veo-3.1'],
        recommended: false,
    },
    'veo-3.1-fast': {
        id: 'veo-3.1-fast', name: 'Veo 3.1 Fast', icon: '⚡', provider: 'kie',
        description: 'Faster & cheaper Veo 3.1 — great for prototyping',
        bestFor: 'Quick iterations, content series, social video',
        duration: { min: 4, max: 8, native: 8, step: 2, extendChunk: 7, maxExtended: 60 },
        resolutions: ['720p', '1080p'],
        aspectRatios: ['16:9', '9:16'],
        features: {
            firstFrame: true, lastFrame: false, referenceImages: true,
            extendVideo: true, multiShot: false, nativeAudio: true,
            voiceIds: false, cameraControl: false,
        },
        maxReferenceImages: 3,
        costPerSecond: COST_PER_SECOND['veo-3.1-fast'],
        recommended: false,
    },
    'seedance-2.0': {
        id: 'seedance-2.0', name: 'Seedance 2.0 Pro', icon: '🎞️', provider: 'piapi',
        description: 'Cinematic video with native audio, camera control & physics',
        bestFor: 'Premium ads, product showcases, brand films',
        duration: { min: 4, max: 15, native: 15, step: 1 },
        resolutions: ['720p', '1080p'],
        aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
        features: {
            firstFrame: true, lastFrame: false, referenceImages: true,
            extendVideo: true, multiShot: true, nativeAudio: true,
            voiceIds: false, cameraControl: true,
        },
        maxReferenceImages: 3,
        costPerSecond: COST_PER_SECOND['seedance-2.0'],
        recommended: false,
    },
    'grok-imagine': {
        id: 'grok-imagine', name: 'Grok Imagine', icon: '🤖', provider: 'grok',
        description: 'xAI native video — fast, affordable, 1-15s, image-to-video',
        bestFor: 'Social reels, creative experiments, quick turnaround',
        duration: { min: 1, max: 15, native: 15, step: 1 },
        resolutions: ['480p', '720p'],
        aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'],
        features: {
            firstFrame: true, lastFrame: false, referenceImages: false,
            extendVideo: false, multiShot: false, nativeAudio: true,
            voiceIds: false, cameraControl: false,
        },
        maxReferenceImages: 0,
        costPerSecond: COST_PER_SECOND['grok-imagine'],
        recommended: false,
    },
    'hunyuan': {
        id: 'hunyuan', name: 'HunyuanVideo', icon: '🎨', provider: 'fal',
        description: 'Tencent draft-tier — cheapest model, great for fast iterations',
        bestFor: 'Quick drafts, prototyping, budget-friendly iterations',
        duration: { min: 3, max: 10, native: 10, step: 1 },
        resolutions: ['480p', '720p', '1080p'],
        aspectRatios: ['16:9', '9:16', '1:1'],
        features: {
            firstFrame: true, lastFrame: false, referenceImages: false,
            extendVideo: false, multiShot: false, nativeAudio: false,
            voiceIds: false, cameraControl: false,
        },
        maxReferenceImages: 0,
        costPerSecond: COST_PER_SECOND['hunyuan'],
        recommended: false,
    },
    'sora-2': {
        id: 'sora-2', name: 'Sora 2', icon: '🎞️', provider: 'laozhang',
        description: 'OpenAI Sora 2 — cinematic storytelling, world-model understanding',
        bestFor: 'Cinematic ads, narrative storytelling, creative experiments',
        duration: { min: 5, max: 15, native: 15, step: 5 },
        resolutions: ['720p', '1080p'],
        aspectRatios: ['16:9', '9:16', '1:1'],
        features: {
            firstFrame: false, lastFrame: false, referenceImages: false,
            extendVideo: false, multiShot: false, nativeAudio: true,
            voiceIds: false, cameraControl: false,
        },
        maxReferenceImages: 0,
        costPerSecond: COST_PER_SECOND['sora-2'],
        recommended: false,
    },
};

/**
 * Estimate cost before generation
 */
export function estimateCost(model = 'kling-3.0', durationSeconds = 5, resolution = '1080p', mode = 'fast') {
    const costPerSec = COST_PER_SECOND[model]?.[mode] || 0.07;
    const resMult = resolution === '720p' ? 0.7 : 1.0;
    const usd = Number((costPerSec * durationSeconds * resMult).toFixed(2));
    const inr = Number((usd * 85).toFixed(0));
    const credits = Math.max(Math.ceil(usd * 70), 5);

    return {
        usd, inr, credits,
        model, resolution, mode, durationSeconds,
        maxDuration: DURATION_LIMITS[model]?.max || 15,
    };
}

/**
 * Get the fal.ai API key
 */
function getApiKey() {
    const key = config.fal?.apiKey || process.env.FAL_API_KEY;
    if (!key) throw new Error('FAL_API_KEY not configured. Add it to .env');
    return key;
}

/**
 * Build model-specific payload
 */
function buildPayload(model, { prompt, imageUrl, duration, resolution, mode, shots, generateAudio }) {
    const dur = Math.min(
        Math.max(duration || 5, DURATION_LIMITS[model]?.min || 3),
        DURATION_LIMITS[model]?.max || 15
    );

    if (model === 'kling-3.0') {
        const payload = {
            aspect_ratio: '16:9',
            negative_prompt: 'blur, distort, and low quality',
            cfg_scale: 0.5,
            generate_audio: generateAudio !== false,
        };

        if (shots && shots.length > 1) {
            payload.multi_prompt = shots.map(shot => ({
                prompt: shot.visual || shot.prompt || prompt,
                duration: String(Math.min(Math.max(shot.duration || 5, 3), 15)),
            }));
            payload.shot_type = 'customize';
        } else {
            payload.prompt = prompt;
            payload.duration = String(dur);
        }

        return payload;
    }

    if (model === 'veo-3.1' || model === 'veo-3.1-fast') {
        return {
            prompt,
            aspect_ratio: '16:9',
            resolution: resolution === '720p' ? '720p' : '1080p',
            generate_audio: generateAudio !== false,
            auto_fix: true,
        };
    }

    if (model === 'seedance-1.0') {
        const seedDur = dur >= 8 ? '10' : '5';
        return {
            prompt,
            duration: seedDur,
            aspect_ratio: '16:9',
            seed: Math.floor(Math.random() * 999999),
        };
    }

    if (model === 'seedance-2.0') {
        return {
            prompt,
            duration: String(dur),
            aspect_ratio: '16:9',
            generate_audio: generateAudio !== false,
            seed: Math.floor(Math.random() * 999999),
        };
    }

    if (model === 'hunyuan') {
        return {
            prompt,
            video_length: dur,
            seed: Math.floor(Math.random() * 999999),
            resolution: resolution === '1080p' ? '1080p' : '720p',
        };
    }

    throw new Error(`Unknown fal.ai model: ${model}`);
}

// ── Grok API key helper ──
function getGrokApiKey() {
    const key = config.grok?.apiKey || process.env.GROK_API_KEY || process.env.XAI_API_KEY;
    if (!key) throw new Error('GROK_API_KEY not configured. Add it to .env');
    return key;
}

/**
 * Submit video generation to Grok Imagine API
 */
async function submitGrokVideoGeneration({ prompt, imageUrl, duration, resolution, aspectRatio }) {
    const apiKey = getGrokApiKey();
    const dur = Math.min(Math.max(duration || 5, 1), 15);
    const res = resolution === '480p' ? '480p' : '720p';

    const payload = {
        model: 'grok-imagine-video',
        prompt,
        duration: dur,
        aspect_ratio: aspectRatio || '16:9',
        resolution: res,
    };

    if (imageUrl) {
        payload.image = { url: imageUrl };
    }

    console.log(`🎬 Submitting to Grok Imagine: grok-imagine-video (${dur}s, ${res}, ratio: ${aspectRatio || '16:9'})`);

    const response = await fetch(`${GROK_BASE_URL}/videos/generations`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Grok video submission failed (${response.status}): ${errText}`);
    }

    const data = await response.json();
    return { requestId: data.request_id, provider: 'grok' };
}

/**
 * Poll Grok Imagine video generation status
 */
export async function getGrokGenerationStatus(requestId) {
    const apiKey = getGrokApiKey();

    const response = await fetch(`${GROK_BASE_URL}/videos/${requestId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    if (!response.ok) {
        return { status: 'FAILED', progress: 0, error: `Status check failed: ${response.status}` };
    }

    const data = await response.json();

    if (data.status === 'done') {
        return {
            status: 'COMPLETED',
            progress: 100,
            videoUrl: data.video?.url || '',
            thumbnailUrl: '',
            audioUrl: '',
            duration: data.video?.duration || 0,
        };
    }

    if (data.status === 'expired') {
        return { status: 'FAILED', progress: 0, error: 'Grok video generation request expired. Try again.' };
    }

    return { status: 'IN_PROGRESS', progress: 40 };
}

/**
 * Submit video generation — routes to the correct provider
 */
export async function submitVideoGeneration({ model, prompt, imageUrl, duration, resolution, mode, shots, generateAudio, aspectRatio, referenceImages }) {
    if (!MODEL_AVAILABLE[model]) {
        throw new Error(`Model '${model}' is not available. Use kling-3.0, veo-3.1, veo-3.1-fast, seedance-1.0, seedance-2.0, sora-2, or grok-imagine.`);
    }

    const [s3ImageUrl, ...s3ReferenceImages] = await Promise.all([
        ensureS3Url(imageUrl, 'video-studio/generations'),
        ...(referenceImages || []).map(img => ensureS3Url(img, 'video-studio/references'))
    ]);

    // ── LaoZhang-First Routing ──
    const LZ_VIDEO_MODELS = ['sora-2', 'veo-3.1', 'veo-3.1-fast', 'kling-3.0', 'seedance-2.0'];
    const lzAvailable = isLaozhangAvailable();

    if (LZ_VIDEO_MODELS.includes(model)) {
        if (lzAvailable) {
            try {
                console.log(`🏷️ [LaoZhang-First] Attempting ${model} via LaoZhang (cheapest)...`);
                const lzResult = await submitLaozhangVideoGeneration({
                    model,
                    prompt,
                    imageUrl: s3ImageUrl,
                    duration: duration || 5,
                    aspectRatio: aspectRatio || '16:9',
                    generateAudio: generateAudio !== false,
                });

                if (lzResult?.videoUrl) {
                    console.log(`✅ [LaoZhang] ${model} video generated successfully (sync).`);
                    return {
                        requestId: `lz-${Date.now()}`,
                        endpoint: `laozhang-${model}`,
                        statusUrl: null,
                        resultUrl: null,
                        provider: 'laozhang',
                        _laozhangVideoUrl: lzResult.videoUrl,
                    };
                }
            } catch (lzErr) {
                if (model === 'sora-2') {
                    throw new Error(`Sora 2 generation failed: ${lzErr.message}`);
                }
                console.warn(`⚠️ [LaoZhang] ${model} failed (${lzErr.message?.substring(0, 150)}), falling through to direct provider...`);
            }
        } else {
            console.warn(`⚠️ [LaoZhang] ${model} requested but LaoZhang is not configured. Falling through...`);
        }
    }

    // ── Grok Imagine ──
    if (model === 'grok-imagine') {
        const result = await submitGrokVideoGeneration({ prompt, imageUrl: s3ImageUrl, duration, resolution, aspectRatio });
        return {
            requestId: result.requestId,
            endpoint: 'grok-imagine-video',
            statusUrl: null,
            resultUrl: null,
            provider: 'grok',
        };
    }

    // ── Veo 3.1 Fast: kie.ai ──
    if (model === 'veo-3.1-fast') {
        console.log(`🎬 [Veo 3.1 Fast] Using kie.ai...`);
        const result = await submitKieVideoGeneration({ model, prompt, imageUrl: s3ImageUrl, duration, aspectRatio: aspectRatio || '16:9' });
        return {
            requestId: result.taskId,
            endpoint: `kie-${model}`,
            statusUrl: null,
            resultUrl: null,
            provider: 'kie',
        };
    }

    // ── Seedance 2.0: PiAPI ──
    if (model === 'seedance-2.0') {
        const piApiKey = process.env.PIAPI_API_KEY;
        if (!piApiKey) {
            throw new Error('Seedance 2.0 requires PIAPI_API_KEY to be configured.');
        }

        console.log(`🎬 [Seedance 2.0] Using PiAPI...`);
        const result = await submitPiApiVideoGeneration({ prompt, imageUrl: s3ImageUrl, duration, aspectRatio: aspectRatio || '16:9', generateAudio, referenceImages: s3ReferenceImages, qualityMode: mode || 'fast' });
        return {
            requestId: result.taskId,
            endpoint: `piapi-seedance-2.0`,
            statusUrl: null,
            resultUrl: null,
            provider: 'piapi',
            _piApiPayload: result._payload,
        };
    }

    // ── fal.ai models (Kling, Veo 3.1 standard, Seedance 1.0, HunyuanVideo) ──
    const apiKey = getApiKey();
    const endpoints = MODEL_ENDPOINTS[model];
    if (!endpoints) throw new Error(`Unknown video model: ${model}`);

    const endpoint = s3ImageUrl ? endpoints.imageToVideo : endpoints.textToVideo;
    const payload = buildPayload(model, { prompt, imageUrl: s3ImageUrl, duration, resolution, mode, shots, generateAudio });

    if (s3ImageUrl) {
        payload.image_url = s3ImageUrl;
    }

    console.log(`🎬 Submitting to fal.ai: ${endpoint} (model: ${model})`);

    let response;
    try {
        response = await fetch(`${FAL_BASE_URL}/${endpoint}`, {
            method: 'POST',
            headers: {
                'Authorization': `Key ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(35000)
        });
    } catch (fetchError) {
        if (fetchError.name === 'TimeoutError' || fetchError.name === 'AbortError') {
            throw new Error(`fal.ai (${model}) generation timed out after 35 seconds.`);
        }
        throw fetchError;
    }

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`fal.ai submission failed (${response.status}): ${errText}`);
    }

    const data = await response.json();
    console.log(`✅ fal.ai queued: requestId=${data.request_id}`);

    return {
        requestId: data.request_id,
        endpoint,
        statusUrl: data.status_url,
        resultUrl: data.response_url,
    };
}

/**
 * Extend a video (Veo 3.1 only)
 */
export async function extendVideo({ videoUrl, prompt, duration = 7 }) {
    const apiKey = getApiKey();
    const endpoint = MODEL_ENDPOINTS['veo-3.1'].extendVideo;

    const response = await fetch(`${FAL_BASE_URL}/${endpoint}`, {
        method: 'POST',
        headers: {
            'Authorization': `Key ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            video_url: videoUrl,
            prompt,
            duration: String(duration),
            generate_audio: true,
            auto_fix: true,
        }),
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`fal.ai extend-video failed (${response.status}): ${errText}`);
    }

    const data = await response.json();
    return { requestId: data.request_id, endpoint };
}

/**
 * Check generation status
 */
export async function getGenerationStatus(requestId, statusUrl, resultUrl) {
    const apiKey = getApiKey();

    if (!statusUrl) {
        statusUrl = `${FAL_BASE_URL}/fal-ai/kling-video/requests/${requestId}/status`;
    }
    if (!resultUrl) {
        resultUrl = statusUrl.replace('/status', '');
    }

    const response = await fetch(statusUrl, {
        headers: { 'Authorization': `Key ${apiKey}` },
    });

    if (!response.ok) {
        return { status: 'IN_PROGRESS', progress: 30 };
    }

    const data = await response.json();

    if (data.status === 'COMPLETED') {
        return await fetchFalResult(apiKey, resultUrl);
    }

    if (data.status === 'FAILED') {
        try {
            const tryResult = await fetchFalResult(apiKey, resultUrl);
            if (tryResult.videoUrl) return tryResult;
        } catch (e) { /* ignore */ }

        let errorMsg = 'Video generation failed on fal.ai';
        try {
            const resultRes = await fetch(resultUrl, { headers: { 'Authorization': `Key ${apiKey}` } });
            const result = await resultRes.json();
            errorMsg = result.error || result.detail || result.message || errorMsg;
        } catch (e) { /* ignore */ }

        return { status: 'FAILED', progress: 0, error: errorMsg };
    }

    return {
        status: data.status || 'IN_PROGRESS',
        progress: data.status === 'IN_QUEUE' ? 10 : 50,
    };
}

/**
 * Fetch fal.ai result and extract video URL
 */
async function fetchFalResult(apiKey, resultUrl) {
    const resultRes = await fetch(resultUrl, {
        headers: { 'Authorization': `Key ${apiKey}` },
    });
    const result = await resultRes.json();

    const videoUrl =
        result.video?.url
        || result.video?.file_url
        || result.video_url
        || result.data?.video_url
        || result.data?.video?.url
        || result.output?.url
        || result.output?.video_url
        || result.output?.video?.url
        || result.videos?.[0]?.url
        || result.videos?.[0]?.file_url
        || result.result?.[0]?.url
        || result.result?.url
        || result.result?.video_url
        || result.url
        || '';

    const thumbnailUrl = result.thumbnail?.url || result.thumbnailUrl || result.thumbnail_url || '';
    const audioUrl = result.audio?.url || result.audioUrl || result.audio_url || '';

    return {
        status: 'COMPLETED',
        progress: 100,
        videoUrl,
        thumbnailUrl,
        audioUrl,
    };
}

/**
 * Get supported models info (for frontend)
 */
export function getModelsInfo() {
    return [
        {
            id: 'kling-3.0', name: 'Kling 3.0',
            description: 'Best motion & physics — multi-shot, native audio, voice IDs',
            bestFor: 'Product demos, action shots, storyboard videos',
            costPerSecond: COST_PER_SECOND['kling-3.0'],
            duration: DURATION_LIMITS['kling-3.0'],
            features: ['multi-shot', 'native-audio', 'voice-ids', 'image-to-video', '3-15s'],
            available: true, recommended: true,
        },
        {
            id: 'grok-imagine', name: 'Grok Imagine',
            description: 'xAI native video — fast, affordable, 1-15s, text & image-to-video',
            bestFor: 'Social reels, creative experiments, quick turnaround',
            costPerSecond: COST_PER_SECOND['grok-imagine'],
            duration: DURATION_LIMITS['grok-imagine'],
            features: ['text-to-video', 'image-to-video', 'native-audio', '1-15s', 'fast'],
            available: !!(config.grok?.apiKey || process.env.GROK_API_KEY || process.env.XAI_API_KEY),
            recommended: false,
        },
        {
            id: 'veo-3.1', name: 'Google Veo 3.1',
            description: 'Cinematic quality with native audio + extend-video',
            bestFor: 'Premium brand films, cinematic ads',
            costPerSecond: COST_PER_SECOND['veo-3.1'],
            duration: DURATION_LIMITS['veo-3.1'],
            features: ['native-audio', 'cinematic', 'extend-video', '5-8s'],
            available: true, recommended: false,
        },
        {
            id: 'veo-3.1-fast', name: 'Google Veo 3.1 Fast',
            description: 'Faster & cheaper Veo 3.1 — great for prototyping',
            bestFor: 'Quick iterations, content series, social video',
            costPerSecond: COST_PER_SECOND['veo-3.1-fast'],
            duration: DURATION_LIMITS['veo-3.1-fast'],
            features: ['native-audio', 'fast', '5-8s', 'cost-efficient'],
            available: !!(config.kie?.apiKey || process.env.KIE_API_KEY),
            recommended: false,
        },
        {
            id: 'seedance-1.0', name: 'Seedance 1.0 Lite',
            description: 'Fast & affordable video generation',
            bestFor: 'Quick prototypes, social content, UGC',
            costPerSecond: COST_PER_SECOND['seedance-1.0'],
            duration: DURATION_LIMITS['seedance-1.0'],
            features: ['fast', 'affordable', 'image-to-video', '5-10s'],
            available: true, recommended: false,
        },
        {
            id: 'seedance-2.0', name: 'Seedance 2.0 Pro',
            description: 'Cinematic video with native audio, camera control & real-world physics',
            bestFor: 'Premium ads, product showcases, brand films',
            costPerSecond: COST_PER_SECOND['seedance-2.0'],
            duration: DURATION_LIMITS['seedance-2.0'],
            features: ['native-audio', 'camera-control', 'cinematic', 'image-to-video', '4-15s'],
            available: !!(config.piapi?.apiKey || process.env.PIAPI_API_KEY),
            recommended: false,
        },
        {
            id: 'hunyuan', name: 'HunyuanVideo',
            description: 'Tencent draft-tier — cheapest model for fast iterations',
            bestFor: 'Quick drafts, prototyping, budget-friendly iterations',
            costPerSecond: COST_PER_SECOND['hunyuan'],
            duration: DURATION_LIMITS['hunyuan'],
            features: ['text-to-video', 'image-to-video', '3-10s', 'cheapest', 'draft'],
            available: true, recommended: false,
        },
        {
            id: 'sora-2', name: 'Sora 2',
            description: 'OpenAI Sora 2 — cinematic storytelling with world-model understanding',
            bestFor: 'Cinematic ads, narrative storytelling, creative experiments',
            costPerSecond: COST_PER_SECOND['sora-2'],
            duration: DURATION_LIMITS['sora-2'],
            features: ['text-to-video', 'native-audio', '5-15s', 'cinematic', 'storytelling'],
            available: isLaozhangAvailable(),
            recommended: false,
        },
    ];
}

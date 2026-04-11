/**
 * Video Generation Client — Multi-provider SDK wrapper + cost calculator
 */

import config from '../../config/env.js';
import { submitKieVideoGeneration } from './kieClient.js';
import { submitPiApiVideoGeneration, submitPiApiVideoExtend } from './piApiClient.js';
import { submitMuApiVideoGeneration } from './muapiClient.js';
import { ensureS3Url } from '../../utils/s3.js';
import { isLaozhangAvailable, submitLaozhangVideoGeneration } from './laozhangClient.js';
import { getSetting } from '../../models/SystemSettings.js';
import { getActiveProvider } from '../../ai/providerRouting.js';

const FAL_BASE_URL = 'https://queue.fal.run';
const GROK_BASE_URL = 'https://api.x.ai/v1';

const MODEL_ENDPOINTS = {
    'kling-3.0-o': { textToVideo: 'fal-ai/kling-video/v3/omni/text-to-video', imageToVideo: 'fal-ai/kling-video/v3/omni/image-to-video' },
    'kling-3.0': { textToVideo: 'fal-ai/kling-video/v3/standard/text-to-video', imageToVideo: 'fal-ai/kling-video/v3/standard/image-to-video' },
    'veo-3.1': { textToVideo: 'fal-ai/veo3', imageToVideo: 'fal-ai/veo3/image-to-video', extendVideo: 'fal-ai/veo3.1/extend-video' },
    'veo-3.1-fast': { textToVideo: 'fal-ai/veo3/fast', imageToVideo: 'fal-ai/veo3/fast/image-to-video', extendVideo: 'fal-ai/veo3.1/fast/extend-video' },
    'seedance-1.0': { textToVideo: 'fal-ai/bytedance/seedance/v1/lite/text-to-video', imageToVideo: 'fal-ai/bytedance/seedance/v1/lite/image-to-video' },
    'seedance-2.0': { textToVideo: 'fal-ai/bytedance/seedance/v2/pro/text-to-video', imageToVideo: 'fal-ai/bytedance/seedance/v2/pro/image-to-video' },
    'hunyuan': { textToVideo: 'fal-ai/hunyuan-video/video-to-video', imageToVideo: 'fal-ai/hunyuan-video/image-to-video' },
    'grok-imagine': { textToVideo: 'xai/grok-imagine-video/text-to-video', imageToVideo: 'xai/grok-imagine-video/image-to-video' },
};

export const MODEL_AVAILABLE = {
    'kling-3.0-o': true, 'kling-3.0': true, 'veo-3.1': true, 'veo-3.1-fast': true,
    'seedance-1.0': true, 'seedance-2.0': true, 'grok-imagine': true,
    'hunyuan': true, 'sora-2': true,
};

export function getModelsInfo() {
    return Object.values(MODEL_CAPABILITIES);
}


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

const DURATION_LIMITS = {
    'kling-3.0': { min: 3, max: 15 },
    'veo-3.1': { min: 5, max: 8 },
    'veo-3.1-fast': { min: 5, max: 8 },
    'seedance-1.0': { min: 5, max: 10 },
    'seedance-2.0': { min: 5, max: 15 },
    'grok-imagine': { min: 1, max: 15 },
    'hunyuan': { min: 3, max: 10 },
    'sora-2': { min: 5, max: 15 },
};

export const MODEL_CAPABILITIES = {
    'kling-3.0': {
        id: 'kling-3.0', name: 'Kling 3.0', icon: '🎥', provider: 'laozhang',
        description: 'Best motion & physics — multi-shot, native audio, voice IDs',
        bestFor: 'Product demos, action shots, storyboard videos',
        duration: { min: 3, max: 15, native: 15, step: 1 },
        resolutions: ['720p', '1080p', '4k'], aspectRatios: ['16:9', '9:16', '1:1'],
        features: { firstFrame: true, lastFrame: true, referenceImages: false, extendVideo: false, multiShot: true, nativeAudio: true, voiceIds: true, cameraControl: false },
        maxReferenceImages: 0, costPerSecond: COST_PER_SECOND['kling-3.0'], recommended: true,
        maxPromptLength: 200000, // Kling 3.0 supports approx 2k-3k chars
    },
    'veo-3.1': {
        id: 'veo-3.1', name: 'Google Veo 3.1', icon: '🎬', provider: 'fal',
        description: 'Cinematic quality with native audio + extend-video',
        bestFor: 'Premium brand films, cinematic ads',
        duration: { min: 4, max: 8, native: 8, step: 2, extendChunk: 7, maxExtended: 148 },
        resolutions: ['720p', '1080p', '4k'], aspectRatios: ['16:9', '9:16'],
        features: { firstFrame: true, lastFrame: true, referenceImages: true, extendVideo: true, multiShot: false, nativeAudio: true, voiceIds: false, cameraControl: false },
        maxReferenceImages: 3, costPerSecond: COST_PER_SECOND['veo-3.1'], recommended: false,
        maxPromptLength: 200000, // Veo usually limited to ~2k
    },
    'veo-3.1-fast': {
        id: 'veo-3.1-fast', name: 'Veo 3.1 Fast', icon: '⚡', provider: 'kie',
        description: 'Faster & cheaper Veo 3.1 — great for prototyping',
        bestFor: 'Quick iterations, content series, social video',
        duration: { min: 4, max: 8, native: 8, step: 2, extendChunk: 7, maxExtended: 60 },
        resolutions: ['720p', '1080p'], aspectRatios: ['16:9', '9:16'],
        features: { firstFrame: true, lastFrame: false, referenceImages: true, extendVideo: true, multiShot: false, nativeAudio: true, voiceIds: false, cameraControl: false },
        maxReferenceImages: 3, costPerSecond: COST_PER_SECOND['veo-3.1-fast'], recommended: false,
    },
    'seedance-2.0': {
        id: 'seedance-2.0', name: 'Seedance 2.0 Pro', icon: '🎞️', provider: 'dynamic',
        description: 'Cinematic video with native audio, camera control & physics',
        bestFor: 'Premium ads, product showcases, brand films',
        duration: { min: 4, max: 15, native: 15, step: 1 },
        resolutions: ['720p', '1080p'], aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
        features: { firstFrame: true, lastFrame: false, referenceImages: true, extendVideo: true, multiShot: true, nativeAudio: true, voiceIds: false, cameraControl: true },
        maxReferenceImages: 3, costPerSecond: COST_PER_SECOND['seedance-2.0'], recommended: false,
        maxPromptLength: 200000, // HARD LIMIT from MuAPI/Seedance
    },
    'grok-imagine': {
        id: 'grok-imagine', name: 'Grok Imagine', icon: '🤖', provider: 'grok',
        description: 'xAI native video — fast, affordable, 1-15s, image-to-video',
        bestFor: 'Social reels, creative experiments, quick turnaround',
        duration: { min: 1, max: 15, native: 15, step: 1 },
        resolutions: ['480p', '720p'], aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'],
        features: { firstFrame: true, lastFrame: false, referenceImages: false, extendVideo: false, multiShot: false, nativeAudio: true, voiceIds: false, cameraControl: false },
        maxReferenceImages: 0, costPerSecond: COST_PER_SECOND['grok-imagine'], recommended: false,
    },
    'hunyuan': {
        id: 'hunyuan', name: 'HunyuanVideo', icon: '🎨', provider: 'fal',
        description: 'Tencent draft-tier — cheapest model, great for fast iterations',
        bestFor: 'Quick drafts, prototyping, budget-friendly iterations',
        duration: { min: 3, max: 10, native: 10, step: 1 },
        resolutions: ['480p', '720p', '1080p'], aspectRatios: ['16:9', '9:16', '1:1'],
        features: { firstFrame: true, lastFrame: false, referenceImages: false, extendVideo: false, multiShot: false, nativeAudio: false, voiceIds: false, cameraControl: false },
        maxReferenceImages: 0, costPerSecond: COST_PER_SECOND['hunyuan'], recommended: false,
        maxPromptLength: 200000, // Hunyuan is very sensitive to length
    },
    'sora-2': {
        id: 'sora-2', name: 'Sora 2', icon: '🎞️', provider: 'laozhang',
        description: 'OpenAI Sora 2 — cinematic storytelling, world-model understanding',
        bestFor: 'Cinematic ads, narrative storytelling, creative experiments',
        duration: { min: 5, max: 15, native: 15, step: 5 },
        resolutions: ['720p', '1080p'], aspectRatios: ['16:9', '9:16', '1:1'],
        features: { firstFrame: false, lastFrame: false, referenceImages: false, extendVideo: false, multiShot: false, nativeAudio: true, voiceIds: false, cameraControl: false },
        maxReferenceImages: 0, costPerSecond: COST_PER_SECOND['sora-2'], recommended: false,
    },
};

let LIVE_COST_PER_SECOND = {};

/**
 * Periodically pulls live pricing baselines from DB so estimateCost() remains synchronous
 */
export async function syncLiveVideoPricing() {
    const baselines = await getSetting('pricing_baselines', null);
    if (!baselines) return;

    for (const [key, model] of Object.entries(baselines)) {
        if (model.type === 'video' || model.type === 'image') {
            const id = model.modelId;
            LIVE_COST_PER_SECOND[id] = {
                fast: model.costPerSecFast || model.costPerSecond || 0.08,
                quality: model.costPerSecQuality || model.costPerSecond || 0.15
            };
        }
    }
}

// Ensure it attempts to load once on boot
syncLiveVideoPricing().catch(() => { });

export function estimateCost(model = 'kling-3.0', durationSeconds = 5, resolution = '1080p', mode = 'fast') {
    const liveCost = LIVE_COST_PER_SECOND[model]?.[mode];
    const costPerSec = liveCost || (COST_PER_SECOND[model]?.[mode]) || 0.07;
    const resMult = resolution === '720p' ? 0.7 : 1.0;
    const usd = Number((costPerSec * durationSeconds * resMult).toFixed(2));
    const inr = Number((usd * 93.21).toFixed(0));
    const credits = Math.max(Math.ceil(usd * 70), 5);
    return { usd, inr, credits, model, resolution, mode, durationSeconds, maxDuration: DURATION_LIMITS[model]?.max || 15 };
}

/**
 * Intelligent Truncation: Keeps the most important parts of the prompt
 * while ensuring it fits within the provider's limit.
 */
function truncatePrompt(prompt, modelId) {
    if (!prompt) return '';
    const model = MODEL_CAPABILITIES[modelId];
    const limit = model?.maxPromptLength || 2000;

    if (prompt.length <= limit) return prompt;

    console.log(`⚠️ Truncating prompt for ${modelId} from ${prompt.length} to ${limit} characters...`);

    // We keep the first (limit) characters.
    // Try to end at a sentence/period for a cleaner cut.
    let truncated = prompt.substring(0, limit);
    const lastPeriod = truncated.lastIndexOf('.');
    if (lastPeriod > limit * 0.8) {
        truncated = truncated.substring(0, lastPeriod + 1);
    }

    return truncated;
}

function getApiKey() {
    const key = config.fal?.apiKey || process.env.FAL_API_KEY;
    if (!key) throw new Error('FAL_API_KEY not configured.');
    return key;
}

function getGrokApiKey() {
    const key = config.grok?.apiKey || process.env.GROK_API_KEY || process.env.XAI_API_KEY;
    if (!key) throw new Error('GROK_API_KEY not configured.');
    return key;
}

function buildPayload(model, { prompt, imageUrl, duration, resolution, mode, shots, generateAudio, refAudio, refVideo }) {
    const dur = Math.min(Math.max(duration || 5, DURATION_LIMITS[model]?.min || 3), DURATION_LIMITS[model]?.max || 15);
    
    if (model === 'kling-3.0' || model === 'kling-3.0-o') {
        const payload = { 
            aspect_ratio: '16:9', 
            negative_prompt: 'blur, distort, and low quality', 
            cfg_scale: 0.5, 
            generate_audio: generateAudio !== false 
        };
        
        if (refAudio) payload.audio_url = refAudio;
        if (refVideo) payload.video_url = refVideo;
        
        if (shots && shots.length > 1) {
            payload.multi_prompt = shots.map(s => ({ 
                prompt: s.visual || s.prompt || prompt, 
                duration: String(Math.min(Math.max(s.duration || 5, 3), 15)) 
            }));
            payload.shot_type = 'customize';
        } else { 
            payload.prompt = prompt; 
            payload.duration = String(dur); 
        }
        return payload;
    }
    
    if (model === 'veo-3.1' || model === 'veo-3.1-fast') return { prompt, aspect_ratio: '16:9', resolution: resolution === '720p' ? '720p' : '1080p', generate_audio: generateAudio !== false, auto_fix: true };
    if (model === 'seedance-1.0') return { prompt, duration: dur >= 8 ? '10' : '5', aspect_ratio: '16:9', seed: Math.floor(Math.random() * 999999) };
    if (model === 'seedance-2.0') return { prompt, duration: String(dur), aspect_ratio: '16:9', generate_audio: generateAudio !== false, seed: Math.floor(Math.random() * 999999) };
    if (model === 'hunyuan') return { prompt, video_length: dur, seed: Math.floor(Math.random() * 999999), resolution: resolution === '1080p' ? '1080p' : '720p' };
    if (model === 'grok-imagine') return { prompt };
    throw new Error(`Unknown fal.ai model: ${model}`);
}

/**
 * Robust cascading poll for seedance-2.0
 */
async function trySeedanceCascade({ prompt, imageUrl, duration, aspectRatio, generateAudio, mode, referenceImages, refAudio, refVideo }) {
    if (isLaozhangAvailable()) {
        try {
            const r = await submitLaozhangVideoGeneration({
                model: 'seedance-2.0', prompt, imageUrl,
                duration: duration || 5, aspectRatio: aspectRatio || '16:9',
                generateAudio: generateAudio !== false,
                referenceImages: referenceImages || [],
                refAudio, refVideo,
            });
            if (r?.videoUrl) {
                console.log('✅ [Cascade] Step 1 done: LaoZhang seedance-2.0');
                return { videoUrl: r.videoUrl, provider: 'laozhang' };
            }
        } catch (e) {
            console.warn(`⚠️ [Cascade] Step 1 LZ seedance-2.0 failed: ${e.message?.substring(0, 100)}`);
        }
        try {
            const r = await submitLaozhangVideoGeneration({
                model: 'veo-3.1-fast', prompt, imageUrl: null,
                duration: Math.min(duration || 5, 8), aspectRatio: aspectRatio || '16:9',
                generateAudio: generateAudio !== false,
                referenceImages: referenceImages || [],
            });
            if (r?.videoUrl) {
                console.log('✅ [Cascade] Step 2 done: LaoZhang veo-3.1-fast');
                return { videoUrl: r.videoUrl, provider: 'laozhang' };
            }
        } catch (e) {
            console.warn(`⚠️ [Cascade] Step 2 LZ veo-3.1-fast failed: ${e.message?.substring(0, 100)}`);
        }
    }
    try {
        const kieResult = await submitKieVideoGeneration({
            model: 'seedance-2.0', prompt,
            imageUrl: imageUrl || null,
            duration: duration || 5,
            aspectRatio: aspectRatio || '16:9',
            refAudio, refVideo,
        });
        if (kieResult?.taskId) {
            console.log('✅ [Cascade] Step 3 done: kie.ai');
            return { taskId: kieResult.taskId, provider: 'kie', async: true };
        }
    } catch (e) {
        console.warn(`⚠️ [Cascade] Step 3 kie.ai failed: ${e.message?.substring(0, 100)}`);
    }
    try {
        const piResult = await submitPiApiVideoGeneration({
            prompt, imageUrl: null, duration,
            aspectRatio: aspectRatio || '16:9',
            generateAudio, referenceImages: referenceImages || [], qualityMode: mode || 'fast',
            refAudio, refVideo,
        });
        if (piResult?.taskId) {
            console.log('✅ [Cascade] Step 4 done: PiAPI');
            return { taskId: piResult.taskId, provider: 'piapi', async: true, _piApiPayload: piResult._payload };
        }
    } catch (piErr) {
        if (piErr.message.includes('PiAPI_INSUFFICIENT_CREDITS')) {
            throw new Error('All video providers exhausted: The primary provider (MuAPI) and all fallbacks (LaoZhang, Kie.ai, PiAPI) are currently unavailable or out of credits. Please try again in 30 minutes.');
        }
        throw piErr;
    }
    throw new Error('All video providers exhausted.');
}

export async function submitVideoGeneration({ model, prompt, imageUrl, duration, resolution, mode, shots, generateAudio, aspectRatio, referenceImages, refAudio, refVideo }) {
    if (!MODEL_AVAILABLE[model]) throw new Error(`Model '${model}' is not available.`);

    // Enforce provider-specific prompt length limits
    const safePrompt = truncatePrompt(prompt, model);

    const [s3ImageUrl, s3RefAudio, s3RefVideo, ...s3ReferenceImages] = await Promise.all([
        ensureS3Url(imageUrl, 'video-studio/generations'),
        ensureS3Url(refAudio, 'video-studio/references'),
        ensureS3Url(refVideo, 'video-studio/references'),
        ...(referenceImages || []).map(img => ensureS3Url(img, 'video-studio/references'))
    ]);
    let activeProvider = null;
    try {
        activeProvider = await getActiveProvider('video', model);
    } catch (e) {
        console.warn('⚠️ Could not read video_provider from cache:', e.message);
    }
    if (model === 'seedance-2.0') {
        const provider = activeProvider || 'muapi';
        console.log(`🎬 [Seedance 2.0] Active Provider: ${provider}`);
        try {
            if (provider === 'muapi') {
                const result = await submitMuApiVideoGeneration({
                    prompt: safePrompt, imageUrl: s3ImageUrl, duration,
                    aspectRatio: aspectRatio || '16:9', qualityMode: mode || 'fast',
                    generateAudio, referenceImages: s3ReferenceImages,
                    refAudio: s3RefAudio, refVideo: s3RefVideo,
                });
                return {
                    requestId: result.taskId, endpoint: 'muapi-seedance-2.0',
                    statusUrl: null, resultUrl: null, provider: 'muapi',
                    _muApiPayload: result._muApiPayload,
                };
            } else if (provider === 'piapi') {
                const result = await submitPiApiVideoGeneration({
                    prompt: safePrompt, imageUrl: s3ImageUrl, duration,
                    aspectRatio: aspectRatio || '16:9', generateAudio,
                    referenceImages: s3ReferenceImages, qualityMode: mode || 'fast',
                    refAudio: s3RefAudio, refVideo: s3RefVideo,
                });
                return {
                    requestId: result.taskId, endpoint: 'piapi-seedance-2.0',
                    statusUrl: null, resultUrl: null, provider: 'piapi',
                    _piApiPayload: result._payload,
                };
            } else if (provider === 'laozhang' && isLaozhangAvailable()) {
                const lzResult = await submitLaozhangVideoGeneration({
                    model: 'seedance-2.0', prompt: safePrompt, imageUrl: s3ImageUrl,
                    duration: duration || 5, aspectRatio: aspectRatio || '16:9',
                    generateAudio: generateAudio !== false,
                    referenceImages: s3ReferenceImages,
                });
                if (lzResult?.videoUrl) {
                    return {
                        requestId: `lz-${Date.now()}`, endpoint: 'laozhang-sedance-2.0',
                        statusUrl: null, resultUrl: null, provider: 'laozhang',
                        _laozhangVideoUrl: lzResult.videoUrl,
                    };
                }
            }
            throw new Error(`Provider ${provider} unconfigured or failed.`);
        } catch (err) {
            console.error(`🛑 Primary provider (${provider}) failed:`, err.message);
            const cascade = await trySeedanceCascade({
                prompt: safePrompt, imageUrl: s3ImageUrl, duration,
                aspectRatio: aspectRatio || '16:9', generateAudio, mode,
                referenceImages: s3ReferenceImages, 
                refAudio: s3RefAudio, refVideo: s3RefVideo,
            });
            return {
                requestId: cascade.taskId || `lz-${Date.now()}`,
                endpoint: `${cascade.provider}-cascade`,
                statusUrl: null, resultUrl: null, provider: cascade.provider,
                _piApiPayload: cascade._piApiPayload,
                _laozhangVideoUrl: cascade.videoUrl,
            };
        }
    }

    if (model === 'grok-imagine') {
        const provider = activeProvider || 'grok';
        if (provider === 'grok') {
            const result = await submitGrokVideoGeneration({
                prompt: safePrompt,
                imageUrl: s3ImageUrl,
                duration,
                resolution,
                aspectRatio: aspectRatio || '16:9'
            });
            return {
                requestId: result.requestId,
                endpoint: 'grok-imagine-video',
                statusUrl: null,
                resultUrl: null,
                provider: 'grok'
            };
        }
        // If provider !== 'grok', it will fall through to fal.ai routing below.
    }

    const apiKey = getApiKey();
    const endpoints = MODEL_ENDPOINTS[model];
    if (!endpoints) throw new Error(`Unknown video model: ${model}`);
    const endpoint = s3ImageUrl ? endpoints.imageToVideo : endpoints.textToVideo;
    const payload = buildPayload(model, { 
        prompt: safePrompt, imageUrl: s3ImageUrl, duration, resolution, 
        mode, shots, generateAudio, refAudio: s3RefAudio, refVideo: s3RefVideo 
    });

    // Pass primary image for I2V
    if (s3ImageUrl) payload.image_url = s3ImageUrl;

    // Pass reference images for multi-ref models (e.g. Kling, Veo)
    // Ensures @image1, @image2, etc. in prompt work as expected
    if (s3ReferenceImages?.length > 0) {
        payload.images = s3ReferenceImages;
    }

    const response = await fetch(`${FAL_BASE_URL}/${endpoint}`, {
        method: 'POST',
        headers: { 'Authorization': `Key ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(35000)
    });
    if (!response.ok) throw new Error(`fal.ai failed (${response.status})`);
    const data = await response.json();
    return { requestId: data.request_id, endpoint, statusUrl: data.status_url, resultUrl: data.response_url, provider: 'fal' };
}

export async function extendVideo({ videoUrl, prompt, duration = 7 }) {
    const apiKey = getApiKey();
    const safePrompt = truncatePrompt(prompt, 'veo-3.1'); // Extend is usually Veo
    const response = await fetch(`${FAL_BASE_URL}/${MODEL_ENDPOINTS['veo-3.1'].extendVideo}`, { method: 'POST', headers: { 'Authorization': `Key ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ video_url: videoUrl, prompt: safePrompt, duration: String(duration), generate_audio: true, auto_fix: true }) });
    if (!response.ok) throw new Error('fal.ai extend failed');
    const data = await response.json();
    return { requestId: data.request_id, provider: 'fal' };
}

export async function extendVideoGeneration({ model, parentTaskId, prompt, duration = 5, qualityMode = 'fast', aspectRatio = '16:9' }) {
    const activeProvider = await getActiveProvider('video', model);
    if (activeProvider === 'piapi' || !activeProvider) {
        try {
            const result = await submitPiApiVideoExtend({ parentTaskId, prompt, duration, qualityMode });
            return { requestId: result.taskId, provider: 'piapi', _piApiPayload: result._payload };
        } catch (err) {
            console.warn('[Extend] PiAPI failed, falling back to I2V-last-frame...');
            return await submitVideoGeneration({ model, prompt, duration, resolution: '1080p', mode: qualityMode, aspectRatio });
        }
    }
    return await submitVideoGeneration({ model, prompt, duration, resolution: '1080p', mode: qualityMode, aspectRatio });
}

export async function getGenerationStatus(requestId, statusUrl, resultUrl) {
    const apiKey = getApiKey();
    if (!statusUrl) statusUrl = `${FAL_BASE_URL}/fal-ai/kling-video/requests/${requestId}/status`;
    if (!resultUrl) resultUrl = statusUrl.replace('/status', '');
    const response = await fetch(statusUrl, { headers: { 'Authorization': `Key ${apiKey}` } });
    if (!response.ok) return { status: 'IN_PROGRESS', progress: 30 };
    const data = await response.json();
    if (data.status === 'COMPLETED') return await fetchFalResult(apiKey, resultUrl);
    return { status: data.status || 'IN_PROGRESS', progress: 50 };
}

async function fetchFalResult(apiKey, resultUrl) {
    const res = await fetch(resultUrl, { headers: { 'Authorization': `Key ${apiKey}` } });
    const data = await res.json();
    const videoUrl = data.video?.url || data.output?.url || data.video_url || data.url || data.images?.[0]?.url || data.data?.[0]?.url || '';
    if (!videoUrl) {
        console.warn(`⚠️ [FalResult] extracted empty videoUrl from:`, JSON.stringify(data).substring(0, 300));
    }
    return { status: 'COMPLETED', progress: 100, videoUrl };
}

/**
 * xAI Grok Imagine — Video Generation
 */
export async function submitGrokVideoGeneration({ prompt, imageUrl, duration = 5, resolution = '720p', aspectRatio = '16:9' }) {
    const apiKey = getGrokApiKey();
    const payload = {
        model: 'grok-imagine-video',
        messages: [{
            role: 'user',
            content: [
                { type: 'text', text: truncatePrompt(prompt, 'grok-imagine') },
                ...(imageUrl ? [{ type: 'image_url', image_url: { url: imageUrl } }] : [])
            ]
        }]
    };
    console.log('🎬 [Grok] Submitting request...');
    const response = await fetch(`${GROK_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`xAI failed: ${await response.text()}`);
    const data = await response.json();
    return { requestId: data.id, provider: 'grok' };
}

/**
 * xAI Grok Imagine — Status Polling
 */
export async function getGrokGenerationStatus(requestId) {
    return { status: 'COMPLETED', progress: 100, videoUrl: '', provider: 'grok' };
}

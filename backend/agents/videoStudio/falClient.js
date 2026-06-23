/**
 * Video Generation Client — Multi-provider SDK wrapper + cost calculator
 */

import config from '../../config/env.js';
import { submitKieVideoGeneration, getKieGenerationStatus } from './kieClient.js';
import { submitAtlasCloudVideoGeneration, submitAtlasCloudVideoExtend, submitHappyHorseVideoGeneration, getAtlasCloudGenerationStatus, submitGeminiFlashVideoGeneration } from './atlasClient.js';
import { submitMuApiVideoGeneration, getMuApiGenerationStatus } from './muapiClient.js';
import { ensureS3Url } from '../../utils/s3.js';
import { isLaozhangAvailable, submitLaozhangVideoGeneration, getLaozhangVideoStatus } from './laozhangClient.js';
import { getSetting } from '../../models/SystemSettings.js';
import { getActiveProvider } from '../../ai/providerRouting.js';
import { fetchOptions } from '../../utils/network.js';

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
    'seedance-1.0': true, 'seedance-2.0': true, 'seedance-2.0-fast': true, 'grok-imagine': true,
    'hunyuan': true, 'sora-2': true, 'happyhorse-1.0': true, 'happyhorse-1.1': true, 'gemini-flash': true,
    'gemini-omni-flash': true,
};

export function getModelsInfo() {
    return Object.values(MODEL_CAPABILITIES);
}


export const COST_PER_SECOND = {
    'kling-3.0': { fast: 0.07, quality: 0.12 },
    'veo-3.1': { fast: 0.10, quality: 0.25 },
    'veo-3.1-fast': { fast: 0.06, quality: 0.10 },
    'seedance-1.0': { fast: 0.08, quality: 0.12 },
    // Atlas Cloud actual billing based on 1080p baseline:
    // Seedance 2.0 Fast: 480p is $0.768/10s = $0.0768/sec.
    // Assuming 1080p is the baseline (mult=1.0), 480p is mult=0.5, so 1080p base rate is $0.1536/sec.
    // Seedance 2.0 Pro: typically ~1.5x fast.
    'seedance-2.0': { fast: 0.23, quality: 0.35 },
    'seedance-2.0-fast': { fast: 0.1536, quality: 0.1536 },
    'grok-imagine': { fast: 0.08, quality: 0.08 },
    'hunyuan': { fast: 0.03, quality: 0.05 },
    'sora-2': { fast: 0.10, quality: 0.15 },
    // HappyHorse and Gemini Flash (Atlas Cloud)
    'happyhorse-1.0': { fast: 0.15, quality: 0.20 },
    'happyhorse-1.1': { fast: 0.15, quality: 0.20 },
    'gemini-flash': { fast: 0.15, quality: 0.15 },
    'gemini-omni-flash': { fast: 0.15, quality: 0.15 },
};

const DURATION_LIMITS = {
    'kling-3.0': { min: 3, max: 15 },
    'kling-3.0-o': { min: 5, max: 15 },
    'veo-3.1': { min: 5, max: 8 },
    'veo-3.1-fast': { min: 5, max: 8 },
    'seedance-1.0': { min: 5, max: 10 },
    'seedance-2.0': { min: 5, max: 15 },
    'seedance-2.0-fast': { min: 5, max: 15 },
    'grok-imagine': { min: 1, max: 15 },
    'hunyuan': { min: 3, max: 10 },
    'sora-2': { min: 5, max: 15 },
    'happyhorse-1.0': { min: 3, max: 15 },
    'happyhorse-1.1': { min: 3, max: 15 },
    'gemini-flash': { min: 4, max: 10 },
    'gemini-omni-flash': { min: 4, max: 10 },
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
        maxPromptLength: 200000,
    },
    'kling-3.0-o': {
        id: 'kling-3.0-o', name: 'Kling 3.0 Omni', icon: '✨', provider: 'fal',
        description: 'Kling Omni — enhanced detail, multi-reference, premium quality',
        bestFor: 'Fashion, luxury products, high-fidelity garment & character videos',
        duration: { min: 5, max: 15, native: 10, step: 1 },
        resolutions: ['720p', '1080p', '4k'], aspectRatios: ['16:9', '9:16', '1:1'],
        features: { firstFrame: true, lastFrame: false, referenceImages: true, extendVideo: false, multiShot: false, nativeAudio: true, voiceIds: false, cameraControl: false },
        maxReferenceImages: 3, costPerSecond: COST_PER_SECOND['kling-3.0'], recommended: false,
        maxPromptLength: 200000,
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
        resolutions: ['720p', '1080p', '4k'], aspectRatios: ['16:9', '9:16'],
        features: { firstFrame: true, lastFrame: false, referenceImages: true, extendVideo: true, multiShot: false, nativeAudio: true, voiceIds: false, cameraControl: false },
        maxReferenceImages: 3, costPerSecond: COST_PER_SECOND['veo-3.1-fast'], recommended: false,
    },
    'seedance-2.0': {
        id: 'seedance-2.0', name: 'Seedance 2.0 Pro', icon: '🎞️', provider: 'dynamic',
        description: 'Cinematic video with native audio, camera control & physics',
        bestFor: 'Premium ads, product showcases, brand films',
        duration: { min: 4, max: 15, native: 15, step: 1 },
        resolutions: ['720p', '1080p', '4k'], aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
        features: { firstFrame: true, lastFrame: false, referenceImages: true, extendVideo: true, multiShot: true, nativeAudio: true, voiceIds: false, cameraControl: true },
        maxReferenceImages: 3, costPerSecond: COST_PER_SECOND['seedance-2.0'], recommended: false,
        maxPromptLength: 200000, // HARD LIMIT from MuAPI/Seedance
    },
    'seedance-2.0-fast': {
        id: 'seedance-2.0-fast', name: 'Seedance 2.0 Fast', icon: '⚡', provider: 'dynamic',
        description: 'Faster Seedance 2.0 generation',
        bestFor: 'Prototyping, quick iterations',
        duration: { min: 4, max: 15, native: 15, step: 1 },
        resolutions: ['720p', '1080p', '4k'], aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
        features: { firstFrame: true, lastFrame: false, referenceImages: true, extendVideo: true, multiShot: true, nativeAudio: true, voiceIds: false, cameraControl: true },
        maxReferenceImages: 3, costPerSecond: COST_PER_SECOND['seedance-2.0-fast'], recommended: false,
        maxPromptLength: 200000,
    },
    'grok-imagine': {
        id: 'grok-imagine', name: 'Grok Imagine', icon: '🤖', provider: 'grok',
        description: 'xAI native video — fast, 1-15s, reference images, extend, I2V',
        bestFor: 'Social reels, product placement, character-consistent storytelling',
        duration: { min: 1, max: 15, native: 15, step: 1, extendChunk: 10, maxExtended: 25 },
        resolutions: ['480p', '720p', '1080p', '4k'], aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'],
        features: { firstFrame: true, lastFrame: false, referenceImages: true, extendVideo: true, multiShot: false, nativeAudio: true, voiceIds: false, cameraControl: false },
        maxReferenceImages: 7, costPerSecond: COST_PER_SECOND['grok-imagine'], recommended: true,
    },
    'hunyuan': {
        id: 'hunyuan', name: 'HunyuanVideo', icon: '🎨', provider: 'fal',
        description: 'Tencent draft-tier — cheapest model, great for fast iterations',
        bestFor: 'Quick drafts, prototyping, budget-friendly iterations',
        duration: { min: 3, max: 10, native: 10, step: 1 },
        resolutions: ['480p', '720p', '1080p', '4k'], aspectRatios: ['16:9', '9:16', '1:1'],
        features: { firstFrame: true, lastFrame: false, referenceImages: false, extendVideo: false, multiShot: false, nativeAudio: false, voiceIds: false, cameraControl: false },
        maxReferenceImages: 0, costPerSecond: COST_PER_SECOND['hunyuan'], recommended: false,
        maxPromptLength: 200000, // Hunyuan is very sensitive to length
    },
    'sora-2': {
        id: 'sora-2', name: 'Sora 2', icon: '🎞️', provider: 'laozhang',
        description: 'OpenAI Sora 2 — cinematic storytelling, world-model understanding',
        bestFor: 'Cinematic ads, narrative storytelling, creative experiments',
        duration: { min: 5, max: 15, native: 15, step: 5 },
        resolutions: ['720p', '1080p', '4k'], aspectRatios: ['16:9', '9:16', '1:1'],
        features: { firstFrame: false, lastFrame: false, referenceImages: false, extendVideo: false, multiShot: false, nativeAudio: true, voiceIds: false, cameraControl: false },
        maxReferenceImages: 0, costPerSecond: COST_PER_SECOND['sora-2'], recommended: false,
    },
    'happyhorse-1.0': {
        id: 'happyhorse-1.0', name: 'HappyHorse 1.0', icon: '🐴', provider: 'atlascloud',
        description: 'Alibaba HappyHorse 1.0 — cinematic motion, native audio, ref images, 1080p',
        bestFor: 'Product demos, cinematic ads, brand films, animated content',
        duration: { min: 3, max: 15, native: 15, step: 1 },
        resolutions: ['720p', '1080p', '4k'], aspectRatios: ['16:9', '9:16', '1:1'],
        features: { firstFrame: true, lastFrame: false, referenceImages: true, extendVideo: false, multiShot: false, nativeAudio: true, voiceIds: false, cameraControl: false },
        maxReferenceImages: 9, costPerSecond: COST_PER_SECOND['happyhorse-1.0'], recommended: false,
        maxPromptLength: 200000,
    },
    'happyhorse-1.1': {
        id: 'happyhorse-1.1', name: 'HappyHorse 1.1', icon: '🐴', provider: 'atlascloud',
        description: 'Alibaba HappyHorse 1.1 — advanced cinematic motion, native audio, ref images, 1080p',
        bestFor: 'Product demos, cinematic ads, brand films, animated content',
        duration: { min: 3, max: 15, native: 15, step: 1 },
        resolutions: ['720p', '1080p', '4k'], aspectRatios: ['16:9', '9:16', '1:1'],
        features: { firstFrame: true, lastFrame: false, referenceImages: true, extendVideo: false, multiShot: false, nativeAudio: true, voiceIds: false, cameraControl: false },
        maxReferenceImages: 9, costPerSecond: COST_PER_SECOND['happyhorse-1.1'], recommended: false,
        maxPromptLength: 200000,
    },
    'gemini-flash': {
        id: 'gemini-flash', name: 'Gemini Omni Flash', icon: '⚡', provider: 'atlascloud',
        description: 'Google Gemini Omni Flash — up to 7 reference images, 20K prompt, cinematic subject-consistent video',
        bestFor: 'UGC, product showcases, character-consistent storytelling, subject-anchored video',
        // Durations: 4, 6, 8, 10s per generation (enum — not continuous). For long-form, chain segments.
        duration: { min: 4, max: 10, native: 10, step: 2 },
        resolutions: ['720p', '1080p', '4k'], aspectRatios: ['16:9', '9:16'],
        // referenceImages: true — supports 1–7 reference images via `images[]` field
        features: { firstFrame: true, lastFrame: false, referenceImages: true, extendVideo: false, multiShot: false, nativeAudio: false, voiceIds: false, cameraControl: false },
        maxReferenceImages: 7, costPerSecond: COST_PER_SECOND['gemini-flash'], recommended: false,
        maxPromptLength: 20000, // Atlas Cloud docs: up to 20,000 characters
    },
    'gemini-omni-flash': {
        id: 'gemini-omni-flash', name: 'Gemini Omni Flash', icon: '⚡', provider: 'atlascloud',
        description: 'Google Gemini Omni Flash — up to 7 reference images, 20K prompt, cinematic subject-consistent video',
        bestFor: 'UGC, product showcases, character-consistent storytelling, subject-anchored video',
        // Durations: 4, 6, 8, 10s per generation (enum — not continuous). For long-form, chain segments.
        duration: { min: 4, max: 10, native: 10, step: 2 },
        resolutions: ['720p', '1080p', '4k'], aspectRatios: ['16:9', '9:16'],
        // referenceImages: true — supports 1–7 reference images via `images[]` field
        features: { firstFrame: true, lastFrame: false, referenceImages: true, extendVideo: false, multiShot: false, nativeAudio: false, voiceIds: false, cameraControl: false },
        maxReferenceImages: 7, costPerSecond: COST_PER_SECOND['gemini-flash'], recommended: false,
        maxPromptLength: 20000, // Atlas Cloud docs: up to 20,000 characters
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
    let resMult = 1.0;
    
    // Atlas Cloud models have specific resolution multipliers based on observed billing
    const ATLAS_MODELS = ['seedance-2.0', 'seedance-2.0-fast', 'happyhorse-1.0', 'happyhorse-1.1', 'gemini-flash', 'gemini-omni-flash'];
    if (ATLAS_MODELS.includes(model)) {
        // e.g. 10s seedance-2.0-fast 480p is $0.768. If base is $0.1536/s -> $1.536 for 10s.
        // So 480p multiplier is exactly 0.5.
        // Assuming 720p is somewhere in between, say 0.6.
        if (resolution === '480p') resMult = 0.5;
        else if (resolution === '720p') resMult = 0.6;
        else if (resolution === '1080p') resMult = 1.0;
        else if (resolution === '4k') resMult = 2.0;
    } else {
        if (resolution === '480p') resMult = 0.5;
        else if (resolution === '720p') resMult = 0.7;
        else if (resolution === '4k') resMult = 2.0;
    }
    
    const usd = Number((costPerSec * durationSeconds * resMult).toFixed(2));
    const inr = Number((usd * 93.21).toFixed(0));
    
    // Cost-to-cost pricing:
    // $1 USD = ~₹83 INR.
    // 1 credit = ₹5 INR.
    // $1 USD = 83 / 5 = 16.6 credits. Let's use 20 for a tiny buffer against exchange rates/fees.
    // ceil(USD * 20) = cost-to-cost.
    const credits = Math.max(Math.ceil(usd * 20), 5);
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
    
    if (model === 'veo-3.1' || model === 'veo-3.1-fast') return { prompt, aspect_ratio: '16:9', resolution: resolution === '480p' || resolution === '720p' ? '720p' : resolution === '4k' ? '4k' : '1080p', generate_audio: generateAudio !== false, auto_fix: true };
    if (model === 'seedance-1.0') return { prompt, duration: dur >= 8 ? '10' : '5', aspect_ratio: '16:9', seed: Math.floor(Math.random() * 999999) };
    if (model === 'seedance-2.0') return { prompt, duration: String(dur), aspect_ratio: '16:9', generate_audio: generateAudio !== false, seed: Math.floor(Math.random() * 999999) };
    if (model === 'hunyuan') return { prompt, video_length: dur, seed: Math.floor(Math.random() * 999999), resolution: resolution === '480p' ? '480p' : resolution === '1080p' ? '1080p' : '720p' };
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
    }
    // Step 2: Try Atlas Cloud (supports image_url for I2V) BEFORE switching models
    try {
        const atlasResult = await submitAtlasCloudVideoGeneration({
            prompt, imageUrl: imageUrl || null, duration,
            aspectRatio: aspectRatio || '16:9',
            generateAudio, referenceImages: referenceImages || [], qualityMode: mode || 'fast',
            refAudio, refVideo,
        });
        if (atlasResult?.taskId) {
            console.log('✅ [Cascade] Step 2 done: Atlas Cloud (seedance)');
            return { taskId: atlasResult.taskId, provider: 'atlascloud', async: true, _atlasCloudPayload: atlasResult._payload };
        }
    } catch (atlasErr) {
        if (atlasErr.message.includes('INSUFFICIENT_CREDITS')) {
            console.warn(`⚠️ [Cascade] Step 2 Atlas Cloud exhausted: ${atlasErr.message?.substring(0, 100)}`);
        } else {
            console.warn(`⚠️ [Cascade] Step 2 Atlas Cloud failed: ${atlasErr.message?.substring(0, 100)}`);
        }
    }
    // Step 3: Try KIE (supports imageUrl for I2V)
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
    // Step 4: Last resort — LaoZhang veo-3.1-fast (pass imageUrl + refs for multimodal I2V)
    if (isLaozhangAvailable()) {
        try {
            const r = await submitLaozhangVideoGeneration({
                model: 'veo-3.1-fast', prompt, imageUrl: imageUrl || null,
                duration: Math.min(duration || 5, 8), aspectRatio: aspectRatio || '16:9',
                generateAudio: generateAudio !== false,
                referenceImages: referenceImages || [],
            });
            if (r?.videoUrl) {
                console.log('✅ [Cascade] Step 4 done: LaoZhang veo-3.1-fast');
                return { videoUrl: r.videoUrl, provider: 'laozhang' };
            }
        } catch (e) {
            console.warn(`⚠️ [Cascade] Step 4 LZ veo-3.1-fast failed: ${e.message?.substring(0, 100)}`);
        }
    }
    throw new Error('All video providers exhausted: MuAPI, Atlas Cloud, Kie.ai, and LaoZhang are all unavailable or out of credits. Please try again in 30 minutes.');
}

export async function submitVideoGeneration({ model, prompt, imageUrl, duration, resolution, mode, shots, generateAudio, aspectRatio, referenceImages, refAudio, refVideo, imageRole }) {
    if (!MODEL_AVAILABLE[model]) throw new Error(`Model '${model}' is not available.`);

    // Enforce provider-specific prompt length limits
    let safePrompt = truncatePrompt(prompt, model);

    // NOTE: Watermark avoidance for Atlas Cloud is handled via the payload `watermark: false` field.
    // Appending "(no watermark, clean background, high quality, 4k)" to the prompt is NOT needed
    // for Atlas and causes Atlas NLP to parse it as template syntax, contributing to rejections.

    const [s3ImageUrl, s3RefAudio, s3RefVideo, ...s3ReferenceImages] = await Promise.all([
        ensureS3Url(imageUrl, 'video-studio/generations'),
        ensureS3Url(refAudio, 'video-studio/references'),
        ensureS3Url(refVideo, 'video-studio/references'),
        ...(referenceImages || []).map(img => ensureS3Url(img, 'video-studio/references'))
    ]);

    // 🛡️ UNIVERSAL @IMAGE TAG SANITIZER
    // Count total images that will actually be sent (firstFrame + refs)
    const totalImageCount = (s3ImageUrl ? 1 : 0) + s3ReferenceImages.filter(Boolean).length;
    if (totalImageCount > 0) {
        safePrompt = safePrompt.replace(/@image(\d+)/gi, (match, p1) => {
            const idx = parseInt(p1, 10);
            if (idx > totalImageCount) {
                console.warn(`🛡️ [Universal] Stripping phantom ${match} from prompt (only ${totalImageCount} images available)`);
                return '';
            }
            return match;
        }).replace(/\s{2,}/g, ' ').trim();
    } else {
        // No images at all — strip ALL @image tags
        const hadTags = /@image\d+/i.test(safePrompt);
        safePrompt = safePrompt.replace(/@image\d+/gi, '').replace(/\(\s*Visual reference:\s*\)/g, '').replace(/\s{2,}/g, ' ').trim();
        if (hadTags) console.warn(`🛡️ [Universal] Stripped all @image tags from T2V prompt (0 images provided)`);
    }

    let activeProvider = null;
    try {
        activeProvider = await getActiveProvider('video', model);
    } catch (e) {
        console.warn('⚠️ Could not read video_provider from cache:', e.message);
    }
    if (model === 'seedance-2.0' || model === 'seedance-2.0-fast') {
        const seedanceMode = model === 'seedance-2.0-fast' ? 'fast' : (mode || 'quality');
        const hasRealFaceRefs = s3ReferenceImages.filter(Boolean).length > 0;
        
        // 👤 REAL FACE REFERENCE-TO-VIDEO: Bypass MuAPI/LaoZhang entirely
        // Only Atlas Cloud supports the reference-to-video model that locks real facial identity
        if (hasRealFaceRefs) {
            console.log(`👤 [Seedance 2.0] ${s3ReferenceImages.length} reference image(s) detected → forcing Atlas Cloud reference-to-video`);
            try {
                const result = await submitAtlasCloudVideoGeneration({
                    prompt: safePrompt, imageUrl: s3ImageUrl, duration, resolution,
                    aspectRatio: aspectRatio || '16:9', generateAudio,
                    referenceImages: s3ReferenceImages.filter(Boolean), qualityMode: seedanceMode,
                    refAudio: s3RefAudio, refVideo: s3RefVideo, imageRole,
                });
                return {
                    requestId: result.taskId, endpoint: 'atlascloud-r2v',
                    statusUrl: null, resultUrl: null, provider: 'atlascloud',
                    _atlasCloudPayload: result._payload,
                };
            } catch (r2vErr) {
                console.error(`❌ [Atlas R2V] Atlas Cloud reference-to-video failed: ${r2vErr.message}`);
                throw new Error(`Atlas Cloud reference-to-video failed: ${r2vErr.message}. Real-person face generation requires Atlas Cloud to be available.`);
            }
        }
        
        // Standard routing (no face refs) — use active provider or cascade
        const provider = 'atlascloud'; // Forced per user request (no muapi credits)
        console.log(`🎬 [Seedance 2.0] Active Provider: ${provider}`);
        try {
            if (provider === 'muapi') {
                const result = await submitMuApiVideoGeneration({
                    prompt: safePrompt, imageUrl: s3ImageUrl, duration, resolution,
                    aspectRatio: aspectRatio || '16:9', qualityMode: seedanceMode,
                    generateAudio, referenceImages: s3ReferenceImages,
                    refAudio: s3RefAudio, refVideo: s3RefVideo,
                });
                return {
                    requestId: result.taskId, endpoint: 'muapi-seedance-2.0',
                    statusUrl: null, resultUrl: null, provider: 'muapi',
                    _muApiPayload: result._muApiPayload,
                };
            } else if (provider === 'atlascloud' || provider === 'piapi') {
                const result = await submitAtlasCloudVideoGeneration({
                    prompt: safePrompt, imageUrl: s3ImageUrl, duration, resolution,
                    aspectRatio: aspectRatio || '16:9', generateAudio,
                    referenceImages: s3ReferenceImages, qualityMode: seedanceMode,
                    refAudio: s3RefAudio, refVideo: s3RefVideo, imageRole,
                });
                return {
                    requestId: result.taskId, endpoint: 'atlascloud-seedance-2.0',
                    statusUrl: null, resultUrl: null, provider: 'atlascloud',
                    _atlasCloudPayload: result._payload,
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
                aspectRatio: aspectRatio || '16:9', generateAudio, mode: seedanceMode,
                referenceImages: s3ReferenceImages, 
                refAudio: s3RefAudio, refVideo: s3RefVideo,
            });
            return {
                requestId: cascade.taskId || `lz-${Date.now()}`,
                endpoint: `${cascade.provider}-cascade`,
                statusUrl: null, resultUrl: null, provider: cascade.provider,
                _atlasCloudPayload: cascade._atlasCloudPayload,
                _laozhangVideoUrl: cascade.videoUrl,
            };
        }
    }

    if (model === 'grok-imagine') {
        // Always use native Grok API when GROK_API_KEY is set — never fall through to fal.ai
        const grokApiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
        if (grokApiKey) {
            const result = await submitGrokVideoGeneration({
                prompt: safePrompt,
                imageUrl: s3ImageUrl,
                duration,
                resolution,
                aspectRatio: aspectRatio || '16:9',
                referenceImages: s3ReferenceImages.filter(Boolean),
            });
            return {
                requestId: result.requestId,
                endpoint: 'grok-imagine-video',
                statusUrl: null,
                resultUrl: null,
                provider: 'grok'
            };
        }
        console.warn(`⚠️ [Grok] GROK_API_KEY not set — falling through to fal.ai (may fail)`);
    }

    // Kling models — route directly to LaoZhang
    if (model === 'kling-3.0' || model === 'kling-3.0-o') {
        console.log(`🎬 [Kling] Routing to LaoZhang instead of fal.ai...`);
        if (!isLaozhangAvailable()) {
            throw new Error(`Kling generation requires LaoZhang API key, but it is not configured.`);
        }
        try {
            const lzResult = await submitLaozhangVideoGeneration({
                model, 
                prompt: safePrompt, 
                imageUrl: s3ImageUrl,
                duration, 
                aspectRatio: aspectRatio || '16:9',
                generateAudio: generateAudio !== false,
                referenceImages: s3ReferenceImages.filter(Boolean)
            });
            if (lzResult?.videoUrl) {
                return {
                    requestId: `lz-${Date.now()}`, 
                    endpoint: `laozhang-${model}`,
                    statusUrl: null, 
                    resultUrl: null, 
                    provider: 'laozhang',
                    _laozhangVideoUrl: lzResult.videoUrl,
                };
            }
            throw new Error(`LaoZhang returned an empty video URL`);
        } catch (err) {
            console.error(`❌ [Kling] LaoZhang submission failed: ${err.message}`);
            throw new Error(`Kling generation via LaoZhang failed: ${err.message}`);
        }
    }

    // HappyHorse 1.x — routes directly to Atlas Cloud
    if (model === 'happyhorse-1.0' || model === 'happyhorse-1.1') {
        console.log(`🐴 [${model.toUpperCase()}] Routing to Atlas Cloud...`);
        try {
            const result = await submitHappyHorseVideoGeneration({
                prompt: safePrompt,
                imageUrl: s3ImageUrl,
                duration,
                aspectRatio: aspectRatio || '16:9',
                generateAudio: generateAudio !== false,
                referenceImages: s3ReferenceImages.filter(Boolean),
                resolution: resolution || '720p',
                refAudio: s3RefAudio || null, // Pass TTS audio for lip-sync
                model: model,
            });
            return {
                requestId: result.taskId,
                endpoint: `atlascloud-${model}`,
                statusUrl: null,
                resultUrl: null,
                provider: 'atlascloud',
                _atlasCloudPayload: result._payload,
            };
        } catch (err) {
            console.error(`❌ [${model.toUpperCase()}] Atlas Cloud submission failed: ${err.message}`);
            throw new Error(`${model.toUpperCase()} generation failed: ${err.message}`);
        }
    }

    // Gemini Flash Video — routes directly to Atlas Cloud
    if (model === 'gemini-flash' || model === 'gemini-omni-flash') {
        console.log(`⚡ [Gemini Flash Video] Routing to Atlas Cloud...`);
        try {
            const result = await submitGeminiFlashVideoGeneration({
                prompt: safePrompt,
                imageUrl: s3ImageUrl,
                duration,
                aspectRatio: aspectRatio || '16:9',
                resolution: resolution || '720p',
                referenceImages: s3ReferenceImages.filter(Boolean),
            });
            return {
                requestId: result.taskId,
                endpoint: 'atlascloud-gemini-flash',
                statusUrl: null,
                resultUrl: null,
                provider: 'atlascloud',
                _atlasCloudPayload: result._payload,
            };
        } catch (err) {
            console.error(`❌ [Gemini Flash] Atlas Cloud submission failed: ${err.message}`);
            throw new Error(`Gemini Flash Video generation failed: ${err.message}`);
        }
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

    const response = await fetch(`${FAL_BASE_URL}/${endpoint}`, fetchOptions({
        method: 'POST',
        headers: { 'Authorization': `Key ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(35000)
    }));
    if (!response.ok) throw new Error(`fal.ai failed (${response.status})`);
    const data = await response.json();
    return { requestId: data.request_id, endpoint, statusUrl: data.status_url, resultUrl: data.response_url, provider: 'fal' };
}

export async function extendVideo({ videoUrl, prompt, duration = 7 }) {
    const apiKey = getApiKey();
    const safePrompt = truncatePrompt(prompt, 'veo-3.1'); // Extend is usually Veo
    const response = await fetch(`${FAL_BASE_URL}/${MODEL_ENDPOINTS['veo-3.1'].extendVideo}`, fetchOptions({ method: 'POST', headers: { 'Authorization': `Key ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ video_url: videoUrl, prompt: safePrompt, duration: String(duration), generate_audio: true, auto_fix: true }) }));
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

export async function getUnifiedGenerationStatus(provider, requestId, statusUrl, resultUrl) {
    if (provider === 'muapi') {
        return await getMuApiGenerationStatus(requestId);
    } else if (provider === 'atlascloud') {
        return await getAtlasCloudGenerationStatus(requestId);
    } else if (provider === 'laozhang') {
        return await getLaozhangVideoStatus(requestId);
    } else if (provider === 'kie') {
        return await getKieGenerationStatus(requestId);
    } else if (provider === 'grok') {
        return await getGrokGenerationStatus(requestId);
    } else {
        return await getGenerationStatus(requestId, statusUrl, resultUrl);
    }
}

export async function getGenerationStatus(requestId, statusUrl, resultUrl) {
    const apiKey = getApiKey();
    if (!statusUrl) statusUrl = `${FAL_BASE_URL}/fal-ai/kling-video/requests/${requestId}/status`;
    if (!resultUrl) resultUrl = statusUrl.replace('/status', '');
    const response = await fetch(statusUrl, fetchOptions({ headers: { 'Authorization': `Key ${apiKey}` } }));
    if (!response.ok) return { status: 'IN_PROGRESS', progress: 30 };
    const data = await response.json();
    if (data.status === 'COMPLETED') return await fetchFalResult(apiKey, resultUrl);
    return { status: data.status || 'IN_PROGRESS', progress: 50 };
}

async function fetchFalResult(apiKey, resultUrl) {
    const res = await fetch(resultUrl, fetchOptions({ headers: { 'Authorization': `Key ${apiKey}` } }));
    const data = await res.json();
    const videoUrl = data.video?.url || data.output?.url || data.video_url || data.url || data.images?.[0]?.url || data.data?.[0]?.url || '';
    if (!videoUrl) {
        console.warn(`⚠️ [FalResult] extracted empty videoUrl from:`, JSON.stringify(data).substring(0, 300));
    }
    return { status: 'COMPLETED', progress: 100, videoUrl };
}

/**
 * xAI Grok Imagine — Video Generation (correct REST API)
 * Docs: https://docs.x.ai/docs/guides/video-generation
 * Submit: POST /v1/videos/generations
 * Poll:   GET  /v1/videos/{request_id}   → status: pending | done | expired | failed
 * Result: data.video.url
 */
export async function submitGrokVideoGeneration({ prompt, imageUrl, duration = 5, resolution = '720p', aspectRatio = '16:9', referenceImages = [] }) {
    const apiKey = getGrokApiKey();
    const payload = {
        model: 'grok-imagine-video',
        prompt: truncatePrompt(prompt, 'grok-imagine'),
        duration: Math.min(Math.max(duration || 5, 1), 15),
        aspect_ratio: aspectRatio || '16:9',
        resolution: resolution === '1080p' ? '1080p' : resolution === '480p' ? '480p' : '720p',
    };

    // Image-to-Video: pass source image
    if (imageUrl) {
        payload.image = { url: imageUrl };
        console.log(`📸 [Grok] Image-to-Video: ${imageUrl.substring(0, 80)}...`);
    }

    // Reference images (up to 7, max 10s duration)
    if (referenceImages?.length > 0) {
        payload.reference_images = referenceImages.slice(0, 7).map(url => ({ url }));
        payload.duration = Math.min(payload.duration, 10); // xAI caps at 10s with ref images
        console.log(`🖼️ [Grok] ${payload.reference_images.length} reference images attached`);
    }

    console.log(`🎬 [Grok] Submitting to /v1/videos/generations (duration=${payload.duration}s, ratio=${payload.aspect_ratio}, res=${payload.resolution})...`);
    const response = await fetch(`${GROK_BASE_URL}/videos/generations`, fetchOptions({
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(60000),
    }));
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`xAI video generation failed (${response.status}): ${errText.substring(0, 300)}`);
    }
    const data = await response.json();
    console.log(`✅ [Grok] Request submitted: requestId=${data.request_id}`);
    return { requestId: data.request_id, provider: 'grok' };
}

/**
 * xAI Grok Imagine — Status Polling
 * GET /v1/videos/{request_id}
 * Returns: { status: 'pending'|'done'|'expired'|'failed', video?: { url, duration } }
 */
export async function getGrokGenerationStatus(requestId) {
    const apiKey = getGrokApiKey();
    try {
        const response = await fetch(`${GROK_BASE_URL}/videos/${requestId}`, fetchOptions({
            headers: { 'Authorization': `Bearer ${apiKey}` },
            signal: AbortSignal.timeout(15000),
        }));
        if (!response.ok) {
            console.warn(`⚠️ [Grok] Poll failed: ${response.status}`);
            return { status: 'IN_PROGRESS', progress: 30, provider: 'grok' };
        }
        const data = await response.json();
        if (data.status === 'done') {
            const videoUrl = data.video?.url || '';
            console.log(`✅ [Grok] Video done: ${videoUrl.substring(0, 80)}...`);
            return { status: 'COMPLETED', progress: 100, videoUrl, provider: 'grok' };
        } else if (data.status === 'expired') {
            return { status: 'FAILED', progress: 0, error: 'Grok video generation request expired.', provider: 'grok' };
        } else if (data.status === 'failed') {
            return { status: 'FAILED', progress: 0, error: data.error || 'Grok video generation failed.', provider: 'grok' };
        }
        // Still pending
        return { status: 'IN_PROGRESS', progress: 40, provider: 'grok' };
    } catch (err) {
        console.warn(`⚠️ [Grok] Poll error: ${err.message}`);
        return { status: 'IN_PROGRESS', progress: 30, provider: 'grok' };
    }
}

/**
 * xAI Grok Imagine — Extend Video
 * POST /v1/videos/extensions
 */
export async function extendGrokVideo({ videoUrl, prompt, duration = 6 }) {
    const apiKey = getGrokApiKey();
    const payload = {
        model: 'grok-imagine-video',
        prompt: truncatePrompt(prompt, 'grok-imagine'),
        duration: Math.min(Math.max(duration, 2), 10),
        video: { url: videoUrl },
    };
    console.log(`🎬 [Grok] Extending video (duration=${payload.duration}s)...`);
    const response = await fetch(`${GROK_BASE_URL}/videos/extensions`, fetchOptions({
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(60000),
    }));
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`xAI video extend failed (${response.status}): ${errText.substring(0, 300)}`);
    }
    const data = await response.json();
    return { requestId: data.request_id, provider: 'grok' };
}

// ── Lip-Sync Post-Processing ─────────────────────────────────────────────────
// For models that don't support refAudio, we generate the scene video first,
// then run it through a lip-sync model to make the character's lips move
// in sync with the TTS dialogue audio.

const LIP_SYNC_ENDPOINT = 'fal-ai/sync-lipsync/v2';

/**
 * Submit a lip-sync job to fal.ai Sync Lipsync v2.
 * Takes a scene video + TTS audio → returns video with lip-synced character.
 *
 * @param {string} videoUrl - S3/HTTP URL of the scene video
 * @param {string} audioUrl - S3/HTTP URL of the TTS audio (mp3/wav)
 * @returns {Promise<object>} - { requestId, statusUrl, resultUrl }
 */
export async function submitLipSync(videoUrl, audioUrl) {
    const apiKey = getApiKey();

    console.log(`👄 [LipSync] Submitting to ${LIP_SYNC_ENDPOINT}...`);
    console.log(`   video: ${videoUrl.substring(0, 80)}...`);
    console.log(`   audio: ${audioUrl.substring(0, 80)}...`);

    const response = await fetch(`${FAL_BASE_URL}/${LIP_SYNC_ENDPOINT}`, {
        method: 'POST',
        headers: { 'Authorization': `Key ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            video_url: videoUrl,
            audio_url: audioUrl,
            sync_mode: 'cut_off',
        }),
        signal: AbortSignal.timeout(35000),
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`fal.ai lip-sync failed (${response.status}): ${errText.substring(0, 200)}`);
    }

    const data = await response.json();
    console.log(`✅ [LipSync] Job queued: requestId=${data.request_id}`);

    return {
        requestId: data.request_id,
        statusUrl: data.status_url,
        resultUrl: data.response_url,
        provider: 'fal',
    };
}

/**
 * Poll a lip-sync job until it completes.
 * Returns the URL of the lip-synced video.
 *
 * @param {object} lipSyncResult - Output from submitLipSync
 * @param {number} maxWaitMs - Maximum time to wait (default 3 min)
 * @returns {Promise<string>} - URL of the lip-synced video
 */
export async function pollLipSyncResult(lipSyncResult, maxWaitMs = 180000) {
    const apiKey = getApiKey();
    const { statusUrl, resultUrl } = lipSyncResult;
    const startTime = Date.now();
    const pollInterval = 3000;

    while (Date.now() - startTime < maxWaitMs) {
        await new Promise(r => setTimeout(r, pollInterval));

        try {
            const statusResp = await fetch(statusUrl, {
                headers: { 'Authorization': `Key ${apiKey}` },
                signal: AbortSignal.timeout(10000),
            });

            if (!statusResp.ok) {
                console.warn(`👄 [LipSync] Poll status ${statusResp.status}, retrying...`);
                continue;
            }

            const statusData = await statusResp.json();

            if (statusData.status === 'COMPLETED') {
                const resultResp = await fetch(resultUrl, {
                    headers: { 'Authorization': `Key ${apiKey}` },
                    signal: AbortSignal.timeout(10000),
                });
                const resultData = await resultResp.json();
                const videoUrl = resultData.video?.url || resultData.output?.url || resultData.video_url || '';
                if (!videoUrl) throw new Error('Lip-sync completed but no video URL in response');
                console.log(`✅ [LipSync] Complete: ${videoUrl.substring(0, 80)}...`);
                return videoUrl;
            } else if (statusData.status === 'FAILED') {
                throw new Error(`Lip-sync failed: ${statusData.error || 'Unknown error'}`);
            }

            const elapsed = Math.round((Date.now() - startTime) / 1000);
            console.log(`👄 [LipSync] Processing... (${elapsed}s elapsed)`);
        } catch (err) {
            if (err.message.includes('Lip-sync failed')) throw err;
            console.warn(`👄 [LipSync] Poll error: ${err.message}`);
        }
    }

    throw new Error(`Lip-sync timed out after ${maxWaitMs / 1000}s`);
}

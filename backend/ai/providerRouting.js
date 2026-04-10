import { getSetting } from '../models/SystemSettings.js';
import mongoose from 'mongoose';

// Fallback statics if cache is cold and DB is unreachable
const DEFAULT_LLM_PROVIDER = 'grok';
const DEFAULT_VIDEO_PROVIDER = 'grok';
const DEFAULT_IMAGE_PROVIDER = 'fal';

// In-Memory map cache for ultra-low latency fallback
let memoryCache = {
    llm: {},
    video: {},
    image: {},
    lastUpdated: 0
};

const CACHE_TTL_MS = 60 * 1000; // 1 min sync window

/**
 * Ensures system is highly concurrent and cost-effective by caching the router endpoints
 */
async function syncCache() {
    if (Date.now() - memoryCache.lastUpdated < CACHE_TTL_MS) return; // Still fresh

    try {
        const [llmRoutes, videoRoutes, imageRoutes] = await Promise.all([
            getSetting('llm_provider_routes', {}),
            getSetting('video_provider_routes', {}),
            getSetting('image_provider_routes', {})
        ]);

        memoryCache = {
            llm: llmRoutes || {},
            video: videoRoutes || {},
            image: imageRoutes || {},
            lastUpdated: Date.now()
        };
    } catch (e) {
        console.warn('⚠️ [providerRouting] Failed to sync cache from DB. Using stale routing.', e.message);
    }
}

/**
 * Ultra-fast lookup for the active provider of any model.
 * Type must be 'llm', 'video', or 'image'.
 */
export async function getActiveProvider(type, modelId) {
    if (!type || !modelId) return null;

    // Fast memory sweep
    await syncCache();

    let config = memoryCache[type]?.[modelId];

    if (!config || !config.active) {
        // Fallbacks if not explicitly configured in DB
        if (type === 'llm') return DEFAULT_LLM_PROVIDER;
        if (type === 'video') return DEFAULT_VIDEO_PROVIDER;
        if (type === 'image') return DEFAULT_IMAGE_PROVIDER;
    }

    return config.active;
}

/**
 * Returns metadata wrapper explicitly for the frontend badging system.
 */
export async function getProviderBadge(type, modelId) {
    const providerId = await getActiveProvider(type, modelId);
    if (!providerId) return null;

    // We can pull the full name from the DB if needed, but for ultra speed, we parse it visually
    const knownNames = {
        'fal': 'fal.ai',
        'laozhang': 'LaoZhang',
        'kie': 'kie.ai',
        'grok': 'xAI',
        'openai': 'OpenAI',
        'anthropic': 'Anthropic',
        'gemini': 'Google',
        'sarvam': 'Sarvam AI'
    };

    return {
        id: providerId,
        label: knownNames[providerId] || providerId.toUpperCase()
    };
}

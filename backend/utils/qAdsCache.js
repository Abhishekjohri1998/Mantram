import redis from './redisClient.js';
import QAdsPreset from '../models/QAdsPreset.js';
import QAdsCategory from '../models/QAdsCategory.js';
import { Q_ADS_PRESETS } from '../agents/videoStudio/qAdsPresets.js';

const CACHE_KEY = 'qads_presets_all';
const CACHE_TTL = 300; // 5 minutes

export async function getPresetsFromCache() {
    try {
        const data = await redis.get(CACHE_KEY);
        if (data) {
            return JSON.parse(data);
        }
        return null;
    } catch (err) {
        console.warn(`⚠️ Redis cache get failed: ${err.message}`);
        return null;
    }
}

export async function setPresetsInCache(data) {
    try {
        await redis.setex(CACHE_KEY, CACHE_TTL, JSON.stringify(data));
    } catch (err) {
        console.warn(`⚠️ Redis cache set failed: ${err.message}`);
    }
}

export async function invalidatePresetsCache() {
    try {
        await redis.del(CACHE_KEY);
    } catch (err) {
        console.warn(`⚠️ Redis cache invalidate failed: ${err.message}`);
    }
}

export async function getPresetsFromDB() {
    const categories = await QAdsCategory.find({ isActive: true }).sort({ sortOrder: 1 }).lean();
    const presets = await QAdsPreset.find({ isActive: true, isPublished: true }).sort({ sortOrder: 1 }).lean();
    
    const formattedPresets = [];
    
    for (const cat of categories) {
        // Find presets for this category, already sorted by preset.sortOrder
        const catPresets = presets.filter(p => p.categoryId.toString() === cat._id.toString());
        
        for (const p of catPresets) {
            const fallback = Q_ADS_PRESETS.find(old => old.id === p.presetCode) || {};
            formattedPresets.push({
                id: p.presetCode,
                presetCode: p.presetCode,
                name: p.name,
                tagline: p.tagline,
                description: p.description,
                previewMediaUrl: p.previewMediaUrl,
                previewMediaType: p.previewMediaType,
                isMantramExclusive: p.isMantramExclusive,
                isActive: p.isActive,
                isPublished: p.isPublished,
                showOnHomeScreen: p.showOnHomeScreen,
                group: cat.name,
                color: cat.color,
                
                // Fallbacks from old hardcoded config for fields not yet in DB schema
                msIcon: fallback.msIcon || 'movie', 
                threeWordCamera: fallback.threeWordCamera || 'Cinematic · Engaging · Premium',
                cuts: fallback.cuts || 'Standard pacing and narrative cuts.',
                forbiddenElements: fallback.forbiddenElements || [],
                directorBrief: fallback.directorBrief || 'Focus on clear product benefits and aesthetic presentation.',
                noAvatar: fallback.noAvatar || false,
                recommendedDuration: fallback.recommendedDuration || 8,
                recommendedFormat: fallback.recommendedFormat || '9:16',
                
                promptRules: p.promptRules
            });
        }
    }
    
    return { presets: formattedPresets, categories: categories.map(c => ({
        id: c._id,
        name: c.name,
        slug: c.slug,
        color: c.color,
        previewMediaUrl: c.previewMediaUrl,
        previewMediaType: c.previewMediaType
    })) };
}

export async function getPresets() {
    const cached = await getPresetsFromCache();
    if (cached) return cached;
    
    const dbData = await getPresetsFromDB();
    await setPresetsInCache(dbData);
    
    return dbData;
}

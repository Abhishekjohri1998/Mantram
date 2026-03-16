/**
 * HeyGen Client — Avatar Video Generation for UGC Content
 * 
 * Based on HeyGen API v2 documentation:
 *   - Generate Video:   POST https://api.heygen.com/v2/video/generate
 *   - Get Video Status: GET  https://api.heygen.com/v1/video_status.get?video_id={id}
 *   - List Avatars:     GET  https://api.heygen.com/v2/avatars
 *   - List Voices:      GET  https://api.heygen.com/v2/voices
 *   - Auth:             x-api-key header
 *
 * Pricing (Scale API): ~$0.50/credit, 1 credit = 1 min standard avatar video
 */

import config from '../../config/env.js';

const HEYGEN_BASE_URL = 'https://api.heygen.com';

/**
 * Get the HeyGen API key
 */
function getHeyGenKey() {
    const key = config.heygen?.apiKey || process.env.HEYGEN_API_KEY;
    if (!key) throw new Error('HEYGEN_API_KEY not configured. Add it to .env');
    return key;
}

/**
 * Make authenticated request to HeyGen API
 */
async function heygenFetch(path, opts = {}) {
    const apiKey = getHeyGenKey();
    const url = `${HEYGEN_BASE_URL}${path}`;

    console.log(`🎭 HeyGen API: ${opts.method || 'GET'} ${path}`);

    const response = await fetch(url, {
        ...opts,
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'Accept': 'application/json',
            ...opts.headers,
        },
        signal: opts.signal || AbortSignal.timeout(30000),
    });

    const rawText = await response.text();

    let data;
    try {
        data = JSON.parse(rawText);
    } catch (e) {
        throw new Error(`HeyGen returned non-JSON (${response.status}): ${rawText.substring(0, 300)}`);
    }

    if (!response.ok) {
        const errMsg = data?.error?.message || data?.message || data?.error || rawText.substring(0, 300);
        throw new Error(`HeyGen API error (${response.status}): ${errMsg}`);
    }

    return data;
}

/**
 * List available HeyGen avatars
 * Returns array of avatars with id, name, preview_image_url, etc.
 */
export async function listAvatars() {
    const data = await heygenFetch('/v2/avatars');
    const avatars = data.data?.avatars || data.avatars || [];

    // Categorize and return useful subset
    return avatars.map(a => ({
        avatar_id: a.avatar_id,
        avatar_name: a.avatar_name || a.name || '',
        preview_image_url: a.preview_image_url || a.preview_url || '',
        gender: a.gender || '',
        tags: a.tags || [],
        type: a.type || 'talking_photo', // talking_photo, avatar
    }));
}

/**
 * List available HeyGen voices
 * Returns array of voices with id, name, language, gender, preview_audio
 */
export async function listVoices() {
    const data = await heygenFetch('/v2/voices');
    const voices = data.data?.voices || data.voices || [];

    return voices.map(v => ({
        voice_id: v.voice_id,
        name: v.name || v.display_name || '',
        language: v.language || '',
        locale: v.locale || v.language_code || '',
        gender: v.gender || '',
        preview_audio: v.preview_audio || '',
        support_pause: v.support_pause || false,
        emotion_support: v.emotion_support || false,
    }));
}

/**
 * Generate a UGC avatar video via HeyGen Avatar IV API
 * Uses the new /v2/videos endpoint for better quality + motion_prompt support
 */
export async function generateUGCVideo({
    script,
    avatarId,
    voiceId,
    backgroundUrl,
    backgroundColor,
    aspectRatio = '9:16',
    caption = true,
    speed = 1.0,
    title = '',
    motionPrompt = '',
    expressiveness = 'medium',
    voicePitch = 0,
}) {
    if (!script?.trim()) throw new Error('Script text is required');
    if (!avatarId) throw new Error('Avatar ID is required');
    if (!voiceId) throw new Error('Voice ID is required');

    // Use new Avatar IV /v2/videos endpoint
    const payload = {
        avatar_id: avatarId,
        script: script.trim(),
        voice_id: voiceId,
        aspect_ratio: aspectRatio,
        title: title || 'Mantram AI UGC Video',
        voice_settings: {
            speed: Math.max(0.5, Math.min(1.5, speed)),
            pitch: Math.max(-50, Math.min(50, voicePitch || 0)),
        },
    };

    // Add expressiveness for photo avatars
    if (expressiveness && ['low', 'medium', 'high'].includes(expressiveness)) {
        payload.expressiveness = expressiveness;
    }

    // Add motion prompt for photo avatars
    if (motionPrompt?.trim()) {
        payload.motion_prompt = motionPrompt.trim();
    }

    // Background config
    if (backgroundUrl) {
        payload.background = { type: 'image', url: backgroundUrl };
    } else if (backgroundColor) {
        payload.background = { type: 'color', value: backgroundColor };
    }

    console.log(`🎬 HeyGen Avatar IV: avatar=${avatarId}, voice=${voiceId}, expr=${expressiveness}, script=${script.substring(0, 60)}...`);

    const data = await heygenFetch('/v2/videos', {
        method: 'POST',
        body: JSON.stringify(payload),
    });

    const videoId = data.data?.video_id || data.video_id;
    if (!videoId) {
        throw new Error(`HeyGen did not return a video_id. Response: ${JSON.stringify(data).substring(0, 300)}`);
    }

    console.log(`✅ HeyGen Avatar IV queued: videoId=${videoId}`);

    return {
        videoId,
        provider: 'heygen',
        model: 'heygen-avatar-iv',
    };
}

/**
 * Upload an asset (image/audio) to HeyGen
 * Returns the asset_id for use in video generation
 *
 * Uses the multipart form upload: POST /v1/asset
 */
export async function uploadAssetToHeyGen(buffer, filename = 'avatar.png', contentType = 'image/png') {
    const apiKey = getHeyGenKey();
    
    // HeyGen asset upload uses multipart form data
    const formData = new FormData();
    const blob = new Blob([buffer], { type: contentType });
    formData.append('file', blob, filename);

    console.log(`📤 HeyGen asset upload: ${filename} (${buffer.length} bytes)`);

    const response = await fetch(`${HEYGEN_BASE_URL}/v1/asset`, {
        method: 'POST',
        headers: {
            'x-api-key': apiKey,
        },
        body: formData,
        signal: AbortSignal.timeout(60000), // 60s for uploads
    });

    const rawText = await response.text();
    let data;
    try { data = JSON.parse(rawText); } catch {
        throw new Error(`HeyGen asset upload returned non-JSON (${response.status}): ${rawText.substring(0, 300)}`);
    }

    if (!response.ok) {
        const errMsg = data?.error?.message || data?.message || rawText.substring(0, 300);
        throw new Error(`HeyGen asset upload error (${response.status}): ${errMsg}`);
    }

    const assetId = data.data?.id || data.data?.asset_id || data.id;
    const assetUrl = data.data?.url || '';
    console.log(`✅ HeyGen asset uploaded: id=${assetId}, url=${assetUrl?.substring(0, 80)}`);

    return { assetId, assetUrl };
}

/**
 * Create an AI Photo Avatar from a text prompt
 * Uses POST /v2/photo_avatar/photo/generate
 * Returns a generation_id that you poll with getPhotoAvatarStatus()
 */
export async function createPhotoAvatar({
    name,
    age = 'Young Adult',
    gender = 'Unspecified',
    ethnicity = 'Unspecified',
    orientation = 'vertical',
    pose = 'half_body',
    style = 'Realistic',
    appearance = '',
}) {
    if (!name?.trim()) throw new Error('Avatar name is required');
    if (!appearance?.trim()) throw new Error('Appearance description is required');

    const payload = {
        name: name.trim(),
        age,
        gender,
        ethnicity,
        orientation,
        pose,
        style,
        appearance: appearance.trim().substring(0, 1000),
    };

    console.log(`🧑‍🎨 HeyGen create photo avatar: name=${name}, gender=${gender}, pose=${pose}, appearance=${appearance.substring(0, 50)}...`);

    const data = await heygenFetch('/v2/photo_avatar/photo/generate', {
        method: 'POST',
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(60000),
    });

    const generationId = data.data?.generation_id || data.generation_id;
    if (!generationId) {
        throw new Error(`HeyGen did not return generation_id. Response: ${JSON.stringify(data).substring(0, 300)}`);
    }

    console.log(`✅ HeyGen photo avatar creation started: generationId=${generationId}`);

    return { generationId };
}

/**
 * Check the status of a Photo Avatar generation
 * Uses GET /v1/photo_avatar/{generation_id}
 */
export async function getPhotoAvatarStatus(generationId) {
    if (!generationId) throw new Error('Generation ID is required');

    const data = await heygenFetch(`/v1/photo_avatar/${generationId}`);

    const avatarData = data.data || data;
    const status = avatarData.status || '';

    return {
        status, // 'pending', 'processing', 'completed', 'failed'
        avatarId: avatarData.avatar_id || avatarData.id || '',
        imageUrl: avatarData.image_url || avatarData.preview_image_url || avatarData.url || '',
        name: avatarData.name || '',
        error: avatarData.error?.message || avatarData.error || '',
    };
}

/**
 * Generate a video using HeyGen Video Agent (one-shot prompt + product assets)
 * Uses POST /v1/video_agent/generate
 * Good for product placement — AI decides how to integrate product into video
 */
export async function generateVideoAgent({
    prompt,
    avatarId,
    durationSec = 30,
    orientation = 'portrait',
    fileAssetIds = [],
}) {
    if (!prompt?.trim()) throw new Error('Prompt is required');

    const payload = {
        prompt: prompt.trim(),
        config: {},
    };

    if (avatarId) payload.config.avatar_id = avatarId;
    if (durationSec) payload.config.duration_sec = Math.max(5, durationSec);
    if (orientation) payload.config.orientation = orientation;

    // Attach product images/files as assets
    if (fileAssetIds.length > 0) {
        payload.files = fileAssetIds.map(id => ({ asset_id: id }));
    }

    console.log(`🤖 HeyGen Video Agent: avatar=${avatarId || 'auto'}, duration=${durationSec}s, files=${fileAssetIds.length}, prompt=${prompt.substring(0, 60)}...`);

    const data = await heygenFetch('/v1/video_agent/generate', {
        method: 'POST',
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(60000),
    });

    const videoId = data.data?.video_id || data.video_id;
    if (!videoId) {
        throw new Error(`HeyGen Video Agent did not return video_id. Response: ${JSON.stringify(data).substring(0, 300)}`);
    }

    console.log(`✅ HeyGen Video Agent queued: videoId=${videoId}`);

    return {
        videoId,
        provider: 'heygen',
        model: 'heygen-video-agent',
    };
}

/**
 * Generate a UGC video from a photo using HeyGen's new /v2/videos API
 * Uses `image_url` directly — no need to pre-register the photo.
 * API: POST /v2/videos (flat payload structure)
 * Docs: https://docs.heygen.com/reference/create-video-1.md
 */
export async function generatePhotoAvatarVideo({
    script,
    photoUrl,
    voiceId,
    audioUrl,
    aspectRatio = '9:16',
    caption = true,
    speed = 1.0,
    title = '',
}) {
    if (!script?.trim() && !audioUrl) throw new Error('Script text or audio URL is required');
    if (!photoUrl) throw new Error('Photo URL is required');
    if (!voiceId && !audioUrl) throw new Error('Voice ID or audio URL is required');

    // Build payload using the new flat /v2/videos format
    const payload = {
        image_url: photoUrl,
        title: title || 'Mantram AI Photo Avatar Video',
        aspect_ratio: aspectRatio,
    };

    // Script + voice OR pre-generated audio (mutually exclusive)
    if (audioUrl) {
        payload.audio_url = audioUrl;
    } else {
        payload.script = script.trim();
        payload.voice_id = voiceId;
        payload.voice_settings = {
            speed: Math.max(0.5, Math.min(1.5, speed)),
        };
    }

    console.log(`📸 HeyGen photo avatar (v2/videos): image_url=${photoUrl.substring(0, 60)}..., voice=${audioUrl ? 'audio' : voiceId}`);

    const data = await heygenFetch('/v2/videos', {
        method: 'POST',
        body: JSON.stringify(payload),
    });

    const videoId = data.data?.video_id || data.video_id;
    if (!videoId) {
        throw new Error(`HeyGen did not return a video_id. Response: ${JSON.stringify(data).substring(0, 300)}`);
    }

    console.log(`✅ HeyGen photo avatar queued: videoId=${videoId}`);

    return {
        videoId,
        provider: 'heygen',
        model: 'heygen-photo-avatar',
    };
}

/**
 * Generate a UGC video using pre-generated audio (e.g. from Sarvam TTS)
 * Useful for Indian/regional voices that HeyGen doesn't natively support
 */
export async function generateVideoWithAudio({
    avatarId,
    audioUrl,
    backgroundUrl,
    backgroundColor,
    aspectRatio = '9:16',
    caption = true,
    title = '',
}) {
    if (!avatarId) throw new Error('Avatar ID is required');
    if (!audioUrl) throw new Error('Audio URL is required');

    let background = { type: 'color', value: backgroundColor || '#f0f0f0' };
    if (backgroundUrl) background = { type: 'image', url: backgroundUrl };

    const dimension = aspectRatio === '9:16'
        ? { width: 1080, height: 1920 }
        : { width: 1920, height: 1080 };

    const payload = {
        video_inputs: [{
            character: {
                type: 'avatar',
                avatar_id: avatarId,
                avatar_style: 'normal',
            },
            voice: {
                type: 'audio',
                audio_url: audioUrl,
            },
            background,
        }],
        dimension,
        aspect_ratio: null,
        caption,
        title: title || 'Mantram AI UGC Video',
    };

    console.log(`🎵 HeyGen generate with audio: avatar=${avatarId}, audio=${audioUrl.substring(0, 60)}...`);

    const data = await heygenFetch('/v2/video/generate', {
        method: 'POST',
        body: JSON.stringify(payload),
    });

    const videoId = data.data?.video_id || data.video_id;
    if (!videoId) {
        throw new Error(`HeyGen did not return a video_id. Response: ${JSON.stringify(data).substring(0, 300)}`);
    }

    console.log(`✅ HeyGen audio video queued: videoId=${videoId}`);

    return {
        videoId,
        provider: 'heygen',
        model: 'heygen-audio-avatar',
    };
}

/**
 * Poll HeyGen video generation status
 * Returns { status, progress, videoUrl, thumbnailUrl, duration }
 *
 * HeyGen Status values: 'pending', 'processing', 'completed', 'failed'
 */
export async function getHeyGenVideoStatus(videoId) {
    const data = await heygenFetch(`/v1/video_status.get?video_id=${videoId}`);

    const videoData = data.data || data;
    const status = videoData.status || '';

    if (status === 'completed') {
        return {
            status: 'COMPLETED',
            progress: 100,
            videoUrl: videoData.video_url || '',
            thumbnailUrl: videoData.thumbnail_url || '',
            duration: videoData.duration || 0,
        };
    }

    if (status === 'failed') {
        return {
            status: 'FAILED',
            progress: 0,
            error: videoData.error?.message || videoData.error || 'HeyGen video generation failed',
        };
    }

    if (status === 'processing') {
        return { status: 'IN_PROGRESS', progress: 50 };
    }

    // pending / queued
    return { status: 'IN_QUEUE', progress: 10 };
}

// ══════════════════════════════════════════════════════════════════════════════
// Product Placement API
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Generate product placement keyframe poses (4 variations)
 * User picks one before rendering the final video.
 * POST /v2/product_placement/generate_images
 */
export async function generatePlacementPoses({ productImageUrl, avatarId }) {
    if (!productImageUrl) throw new Error('Product image URL is required');
    if (!avatarId) throw new Error('Avatar ID is required');

    console.log(`🛍️ Generating placement poses: avatar=${avatarId}, product=${productImageUrl.substring(0, 60)}`);

    const data = await heygenFetch('/v2/product_placement/generate_images', {
        method: 'POST',
        body: JSON.stringify({
            product_image_url: productImageUrl,
            avatar_id: avatarId,
        }),
    });

    const images = data.data?.images || data.images || [];
    const taskId = data.data?.task_id || data.task_id || '';

    console.log(`✅ Placement poses generated: ${images.length} variations, taskId=${taskId}`);

    return { images, taskId };
}

/**
 * Render product placement video with the selected pose
 * POST /v2/product_placement/generate_video
 * Uses motion_model: veo_3_1 for natural avatar-product interaction
 */
export async function generatePlacementVideo({
    selectedPoseUrl,
    avatarId,
    script,
    voiceId,
    audioUrl,
    aspectRatio = '9:16',
    motionModel = 'veo_3_1',
    caption = true,
    title = '',
}) {
    if (!selectedPoseUrl) throw new Error('Selected pose image URL is required');
    if (!avatarId) throw new Error('Avatar ID is required');
    if (!script?.trim() && !audioUrl) throw new Error('Script or audio is required');

    const dimension = aspectRatio === '9:16'
        ? { width: 1080, height: 1920 }
        : aspectRatio === '1:1'
            ? { width: 1080, height: 1080 }
            : { width: 1920, height: 1080 };

    const voice = audioUrl
        ? { type: 'audio', audio_url: audioUrl }
        : { type: 'text', input_text: script.trim(), voice_id: voiceId };

    const payload = {
        video_inputs: [{
            character: {
                type: 'avatar',
                avatar_id: avatarId,
                avatar_style: 'normal',
            },
            voice,
            product_placement: {
                image_url: selectedPoseUrl,
                intensity: 'high',
            },
        }],
        dimension,
        motion_model: motionModel,
        caption,
        title: title || 'Mantram AI Product Placement Video',
    };

    console.log(`🛍️ Rendering placement video: avatar=${avatarId}, motion=${motionModel}, pose=${selectedPoseUrl.substring(0, 60)}`);

    const data = await heygenFetch('/v2/video/generate', {
        method: 'POST',
        body: JSON.stringify(payload),
    });

    const videoId = data.data?.video_id || data.video_id;
    if (!videoId) {
        throw new Error(`HeyGen product placement video failed. Response: ${JSON.stringify(data).substring(0, 300)}`);
    }

    console.log(`✅ Placement video queued: videoId=${videoId}`);

    return { videoId, provider: 'heygen', model: 'heygen-product-placement' };
}

// ══════════════════════════════════════════════════════════════════════════════
// Webhook Registration
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Register a webhook endpoint with HeyGen for async video completion notifications.
 * POST /v1/webhook/endpoint.add
 */
export async function registerWebhook(callbackUrl) {
    if (!callbackUrl) throw new Error('Callback URL is required');

    console.log(`🔔 Registering HeyGen webhook: ${callbackUrl}`);

    const data = await heygenFetch('/v1/webhook/endpoint.add', {
        method: 'POST',
        body: JSON.stringify({
            url: callbackUrl,
            events: ['video.completed', 'video.failed', 'avatar.completed', 'avatar.failed'],
        }),
    });

    console.log(`✅ Webhook registered:`, JSON.stringify(data).substring(0, 200));
    return data;
}

// ══════════════════════════════════════════════════════════════════════════════
// Generate Looks API — Create outfit/scene variations for an avatar
// POST /v2/photo_avatar/look/generate
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Generate a new "Look" (outfit/scene variation) for an existing avatar group.
 * Uses the Generate Looks quota (e.g. 0/40).
 * Requires a trained avatar_group_id.
 */
export async function generateLooks({
    avatarGroupId,
    prompt,
    orientation = 'square',
    pose = 'half_body',
    style = 'Realistic',
}) {
    if (!avatarGroupId) throw new Error('Avatar group ID is required');
    if (!prompt) throw new Error('Look description prompt is required');

    console.log(`👔 Generating look for group=${avatarGroupId}: ${prompt.substring(0, 60)}...`);

    const data = await heygenFetch('/v2/photo_avatar/look/generate', {
        method: 'POST',
        body: JSON.stringify({
            avatar_group_id: avatarGroupId,
            prompt,
            orientation,
            pose,
            style,
        }),
    });

    const generationId = data.data?.generation_id || data.generation_id;
    if (!generationId) {
        throw new Error(`HeyGen look generation failed. Response: ${JSON.stringify(data).substring(0, 300)}`);
    }

    console.log(`✅ Look generation started: id=${generationId}`);
    return { generationId };
}

// ══════════════════════════════════════════════════════════════════════════════
// Add Motion API — Add natural animation to a photo avatar/look
// POST /v2/photo_avatar/add_motion
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Add motion/animation to an existing avatar or look.
 * Uses the Add Motion quota (e.g. 0/3).
 * Takes the avatar/look ID and a motion prompt.
 */
export async function addMotion({
    id,
    prompt = '',
    motionType = 'default',
}) {
    if (!id) throw new Error('Avatar or look ID is required');

    console.log(`🏃 Adding motion to ${id}: type=${motionType}, prompt=${prompt.substring(0, 60)}`);

    const data = await heygenFetch('/v2/photo_avatar/add_motion', {
        method: 'POST',
        body: JSON.stringify({ id, prompt, motion_type: motionType }),
    });

    const generationId = data.data?.generation_id || data.generation_id || data.data?.id;
    console.log(`✅ Motion training started:`, JSON.stringify(data.data || data).substring(0, 200));
    return { generationId: generationId || 'pending', data: data.data || data };
}

// ══════════════════════════════════════════════════════════════════════════════
// Avatar Groups API — List and manage avatar groups
// GET /v2/avatar_group.list
// ══════════════════════════════════════════════════════════════════════════════

/**
 * List all avatar groups (both user-created and public).
 * Returns groups with their IDs, names, num_looks, preview images.
 */
export async function listAvatarGroups({ includePublic = false } = {}) {
    console.log(`📋 Listing avatar groups (includePublic=${includePublic})`);

    const data = await heygenFetch(`/v2/avatar_group.list?include_public=${includePublic}`);
    const groups = data.data?.avatar_group_list || [];
    console.log(`✅ Found ${groups.length} avatar groups`);
    return { groups, total: data.data?.total_count || groups.length };
}

/**
 * List all looks (avatars) within a specific avatar group.
 * Each look has a unique `id` used as `talking_photo_id` for video generation.
 */
export async function listAvatarLooks(groupId) {
    if (!groupId) throw new Error('Group ID is required');

    console.log(`📋 Listing looks for avatar group: ${groupId}`);

    const data = await heygenFetch(`/v2/avatar_group/${groupId}`);
    const looks = data.data?.avatar_list || data.data?.looks || [];
    console.log(`✅ Found ${looks.length} looks in group ${groupId}`);
    return { looks, group: data.data };
}

// ══════════════════════════════════════════════════════════════════════════════
// Photo/Look Generation Status
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Check the status of a photo avatar or look generation.
 * Poll this until status is 'completed' or 'failed'.
 */
export async function checkPhotoGenStatus(generationId) {
    if (!generationId) throw new Error('Generation ID is required');

    const data = await heygenFetch(`/v2/photo_avatar/generation_status?generation_id=${generationId}`);
    const result = data.data || data;

    return {
        status: result.status || 'unknown',
        generationId,
        avatarGroupId: result.avatar_group_id || null,
        imageUrl: result.image_url || null,
        avatarId: result.avatar_id || result.id || null,
        error: result.error || null,
        raw: result,
    };
}

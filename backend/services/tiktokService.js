import fetch from 'node-fetch';
import config from '../config/env.js';

/**
 * Service to handle TikTok Login Kit and Creator APIs
 */

export function getAuthorizationUrl(redirectUri, state) {
    const baseUrl = 'https://www.tiktok.com/v2/auth/authorize/';
    const params = new URLSearchParams({
        client_key: config.tiktok.clientKey,
        response_type: 'code',
        scope: 'user.info.basic,video.upload,video.publish',
        redirect_uri: redirectUri,
        state: state
    });
    return `${baseUrl}?${params.toString()}`;
}

export async function getAccessToken(code, redirectUri) {
    const url = 'https://open.tiktokapis.com/v2/oauth/token/';
    const params = new URLSearchParams({
        client_key: config.tiktok.clientKey,
        client_secret: config.tiktok.clientSecret,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri
    });

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
    });

    const data = await response.json();
    if (data.error) {
        throw new Error(`TikTok OAuth Error: ${data.error_description || data.error}`);
    }

    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
        openId: data.open_id,
        creatorId: data.creator_id // If provided
    };
}

export async function refreshAccessToken(refreshToken) {
    const url = 'https://open.tiktokapis.com/v2/oauth/token/';
    const params = new URLSearchParams({
        client_key: config.tiktok.clientKey,
        client_secret: config.tiktok.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken
    });

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
    });

    const data = await response.json();
    if (data.error) {
        throw new Error(`TikTok Token Refresh Error: ${data.error_description || data.error}`);
    }

    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
        openId: data.open_id
    };
}

export async function publishVideoToTikTok(accessToken, videoUrl, title) {
    // FILE_UPLOAD method — avoids TikTok's URL ownership verification requirement.
    // We download the video server-side, then upload directly to TikTok.

    // Step 1: Download video to get its size
    console.log(`[TIKTOK] Downloading video for upload: ${videoUrl.substring(0, 80)}...`);
    const videoResponse = await fetch(videoUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'video/*' },
        redirect: 'follow',
    });
    if (!videoResponse.ok) {
        throw new Error(`TikTok: Failed to download video (${videoResponse.status})`);
    }
    const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
    const videoSize = videoBuffer.length;
    console.log(`[TIKTOK] Video downloaded: ${(videoSize / (1024 * 1024)).toFixed(1)}MB`);

    if (videoSize < 1024) {
        throw new Error('TikTok: Video file is too small — may be corrupt or empty');
    }

    const chunkSize = videoSize; // Single chunk (works for videos up to 64MB)

    // Function to try Direct Post init
    async function tryDirectInit(privacyLevel) {
        const initUrl = 'https://open.tiktokapis.com/v2/post/publish/video/init/';
        const initPayload = {
            post_info: {
                title: title || 'Created with Mantram AI',
                privacy_level: privacyLevel,
                disable_duet: false,
                disable_comment: false,
                disable_stitch: false
            },
            source_info: {
                source: 'FILE_UPLOAD',
                video_size: videoSize,
                chunk_size: chunkSize,
                total_chunk_count: 1
            }
        };

        const response = await fetch(initUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json; charset=UTF-8'
            },
            body: JSON.stringify(initPayload)
        });

        const data = await response.json();
        if (data.error && data.error.code !== 'ok') {
            throw new Error(data.error.message || JSON.stringify(data.error));
        }
        return data;
    }

    // Function to try Inbox Draft init (failsafe for sandbox)
    async function tryInboxInit() {
        const initUrl = 'https://open.tiktokapis.com/v2/post/publish/inbox/video/init/';
        const initPayload = {
            source_info: {
                source: 'FILE_UPLOAD',
                video_size: videoSize,
                chunk_size: chunkSize,
                total_chunk_count: 1
            }
        };

        const response = await fetch(initUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json; charset=UTF-8'
            },
            body: JSON.stringify(initPayload)
        });

        const data = await response.json();
        if (data.error && data.error.code !== 'ok') {
            throw new Error(data.error.message || JSON.stringify(data.error));
        }
        return data;
    }

    let initData;
    try {
        console.log(`[TIKTOK] Attempting Direct Post with PUBLIC_TO_EVERYONE...`);
        initData = await tryDirectInit('PUBLIC_TO_EVERYONE');
    } catch (err1) {
        const msg = err1.message.toLowerCase();
        if (msg.includes('guideline') || msg.includes('integration') || msg.includes('scope') || msg.includes('permission')) {
            try {
                console.warn(`[TIKTOK] Direct Public Post blocked. Retrying Direct Post with SELF_ONLY...`);
                initData = await tryDirectInit('SELF_ONLY');
            } catch (err2) {
                const msg2 = err2.message.toLowerCase();
                if (msg2.includes('guideline') || msg2.includes('integration') || msg2.includes('scope') || msg2.includes('permission')) {
                    console.warn(`[TIKTOK] Direct Post completely blocked for unaudited app. Falling back to Inbox Draft...`);
                    try {
                        initData = await tryInboxInit();
                    } catch (err3) {
                        throw new Error(`TikTok Publish Failed (all methods rejected): ${err3.message}`);
                    }
                } else {
                    throw err2;
                }
            }
        } else {
            throw err1;
        }
    }

    const uploadUrl = initData.data?.upload_url;
    const publishId = initData.data?.publish_id;
    if (!uploadUrl) {
        throw new Error('TikTok did not return an upload URL');
    }

    // Step 3: Upload video bytes directly to TikTok
    console.log(`[TIKTOK] Uploading video to TikTok (${(videoSize / (1024 * 1024)).toFixed(1)}MB)...`);
    const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
            'Content-Range': `bytes 0-${videoSize - 1}/${videoSize}`,
            'Content-Type': 'video/mp4',
            'Content-Length': String(videoSize)
        },
        body: videoBuffer
    });

    if (!uploadResponse.ok) {
        const errText = await uploadResponse.text().catch(() => '');
        throw new Error(`TikTok Upload Error: ${uploadResponse.status} ${uploadResponse.statusText} — ${errText.substring(0, 200)}`);
    }

    console.log(`[TIKTOK] ✅ Video upload complete — publish_id: ${publishId}`);
    return publishId;
}

export async function publishPhotosToTikTok(accessToken, imageUrls, title) {
    // FILE_UPLOAD method for photos — avoids URL ownership verification.

    // Step 1: Download all images
    console.log(`[TIKTOK] Downloading ${imageUrls.length} photo(s) for upload...`);
    const imageBuffers = [];
    for (const imgUrl of imageUrls) {
        const imgResponse = await fetch(imgUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'image/*' },
            redirect: 'follow',
        });
        if (!imgResponse.ok) {
            throw new Error(`TikTok: Failed to download image (${imgResponse.status}): ${imgUrl.substring(0, 80)}`);
        }
        const buf = Buffer.from(await imgResponse.arrayBuffer());
        imageBuffers.push(buf);
        console.log(`[TIKTOK] Photo ${imageBuffers.length}/${imageUrls.length} downloaded: ${(buf.length / 1024).toFixed(0)}KB`);
    }

    // Function to try Photo Post init
    async function tryPhotoInit(postMode, privacyLevel) {
        const initUrl = 'https://open.tiktokapis.com/v2/post/publish/content/init/';
        const initPayload = {
            post_mode: postMode,
            media_type: 'PHOTO',
            post_info: {
                title: title || 'Created with Mantram AI',
                disable_comment: false
            },
            source_info: {
                source: 'FILE_UPLOAD',
                photo_cover_index: 0,
                photo_images: imageUrls.map((_, i) => `image_${i}`)
            }
        };

        if (postMode === 'DIRECT_POST') {
            initPayload.post_info.privacy_level = privacyLevel;
        }

        const response = await fetch(initUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json; charset=UTF-8'
            },
            body: JSON.stringify(initPayload)
        });

        const data = await response.json();
        if (data.error && data.error.code !== 'ok') {
            throw new Error(data.error.message || JSON.stringify(data.error));
        }
        return data;
    }

    let initData;
    try {
        console.log(`[TIKTOK] Attempting Photo Direct Post with PUBLIC_TO_EVERYONE...`);
        initData = await tryPhotoInit('DIRECT_POST', 'PUBLIC_TO_EVERYONE');
    } catch (err1) {
        const msg = err1.message.toLowerCase();
        if (msg.includes('guideline') || msg.includes('integration') || msg.includes('scope') || msg.includes('permission')) {
            try {
                console.warn(`[TIKTOK] Photo Direct Public Post blocked. Retrying with SELF_ONLY...`);
                initData = await tryPhotoInit('DIRECT_POST', 'SELF_ONLY');
            } catch (err2) {
                const msg2 = err2.message.toLowerCase();
                if (msg2.includes('guideline') || msg2.includes('integration') || msg2.includes('scope') || msg2.includes('permission')) {
                    console.warn(`[TIKTOK] Photo Direct Post completely blocked. Falling back to MEDIA_UPLOAD (Inbox Draft)...`);
                    try {
                        initData = await tryPhotoInit('MEDIA_UPLOAD', null);
                    } catch (err3) {
                        throw new Error(`TikTok Photo Publish Failed (all methods rejected): ${err3.message}`);
                    }
                } else {
                    throw err2;
                }
            }
        } else {
            throw err1;
        }
    }

    const publishId = initData.data?.publish_id;
    const uploadUrls = initData.data?.upload_urls || [];

    if (uploadUrls.length === 0) {
        throw new Error('TikTok did not return photo upload URLs');
    }

    // Step 3: Upload each photo to its respective upload URL
    for (let i = 0; i < Math.min(uploadUrls.length, imageBuffers.length); i++) {
        console.log(`[TIKTOK] Uploading photo ${i + 1}/${uploadUrls.length}...`);
        const uploadResponse = await fetch(uploadUrls[i], {
            method: 'PUT',
            headers: {
                'Content-Type': 'image/jpeg',
                'Content-Length': String(imageBuffers[i].length)
            },
            body: imageBuffers[i]
        });

        if (!uploadResponse.ok) {
            const errText = await uploadResponse.text().catch(() => '');
            throw new Error(`TikTok Photo Upload Error (${i + 1}): ${uploadResponse.status} — ${errText.substring(0, 200)}`);
        }
    }

    console.log(`[TIKTOK] ✅ Photo upload complete — publish_id: ${publishId}`);
    return publishId;
}




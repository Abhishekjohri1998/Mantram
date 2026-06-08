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
    // 1. Post to Inbox (Draft) or Direct Post
    // For automated tools, Direct Post requires brand/creator accounts.
    // We will use Inbox Video publish as default for broad compatibility,
    // or Direct Post if the scope allows.
    
    // Using TikTok Content API v2 Direct Post (requires video.publish scope)
    // Actually, Direct Post requires posting to /v2/post/publish/video/init/
    // Since videoUrl is an S3 URL, we need to instruct TikTok to pull it.
    
    const url = 'https://open.tiktokapis.com/v2/post/publish/video/init/';
    const payload = {
        post_info: {
            title: title || 'Created with Mantram AI',
            privacy_level: 'PUBLIC',
            disable_duet: false,
            disable_comment: false,
            disable_stitch: false
        },
        source_info: {
            source: 'PULL_FROM_URL',
            video_url: videoUrl
        }
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=UTF-8'
        },
        body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (data.error && data.error.code !== 'ok') {
        throw new Error(`TikTok Publish Error: ${data.error.message || JSON.stringify(data.error)}`);
    }

    // The video is now queued for posting. We return the publish_id.
    return data.data?.publish_id;
}

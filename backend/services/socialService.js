import axios from 'axios';
import https from 'https';
import config from '../config/env.js';

// LinkedIn API sometimes drops IPv6 traffic from AWS EC2, causing ETIMEDOUT.
// We force IPv4 resolution for LinkedIn requests to prevent this.
const ipv4Agent = new https.Agent({ family: 4 });

const FB_API_URL = 'https://graph.facebook.com/v22.0';

export const getMetaAuthUrl = (stateId, platform = 'facebook') => {
    // We always use the Facebook App ID even for Instagram, 
    // because Instagram Business Accounts are linked to Facebook Pages.
    // The isolated Instagram OAuth is only for consumer accounts or specific Basic Display apps.
    const appId = config.facebook.appId;

    // Since we authorize both Facebook Pages and linked Instagram accounts simultaneously,
    // we must request the superset of all necessary permissions.
    // Base scopes needed for Facebook Pages
    const fbScopes = [
        'pages_show_list',
        'pages_read_engagement',
        'pages_manage_posts',
        'pages_manage_engagement',
        'pages_read_user_content',
        'pages_manage_metadata',   // Required for webhook subscriptions via subscribed_apps
        'business_management',
        'public_profile'
    ];

    // Instagram scopes — always included because Meta's unified OAuth
    // covers both platforms simultaneously. Users expect comment automation
    // to work regardless of which platform they selected during connect.
    const igScopes = [
        'instagram_basic',
        'instagram_content_publish',
        'instagram_manage_insights',
        'instagram_manage_comments'  // Required for comment auto-reply
    ];

    // Always request the full set of permissions
    const requestedScopes = [...fbScopes, ...igScopes];

    const scopes = requestedScopes.join(',');

    // Always use Facebook Dialog for Business Accounts
    const baseUrl = 'https://www.facebook.com/v22.0/dialog/oauth';

    // auth_type=rerequest forces Meta to re-prompt the user for any missing permissions
    // if the scopes have changed since they last connected.
    return `${baseUrl}?client_id=${appId}&redirect_uri=${config.facebook.redirectUri}&state=${stateId}&scope=${scopes}&response_type=code&auth_type=rerequest`;
};

export const exchangeCodeForToken = async (code, platform = 'facebook') => {
    // Always use Facebook credentials for exchanging the code, as we used the FB dialog
    const appId = config.facebook.appId;
    const appSecret = config.facebook.appSecret;

    // Always exchange the code at the Facebook Graph API endpoint
    const url = `${FB_API_URL}/oauth/access_token`;

    const params = {
        client_id: appId,
        client_secret: appSecret,
        grant_type: 'authorization_code',
        redirect_uri: config.facebook.redirectUri,
        code: code,
    };

    const response = await axios.post(url, new URLSearchParams(params), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    return response.data.access_token || response.data.access_token;
};

export const fetchUserPagesAndIgAccounts = async (userAccessToken) => {
    // 1. Fetch all Pages the user manages (Try multiple routes for robustness)
    let pages = [];
    try {
        const pagesResponse = await axios.get(`${FB_API_URL}/me/accounts`, {
            params: {
                access_token: userAccessToken,
                fields: 'id,name,access_token,category,tasks'
            }
        });
        pages = pagesResponse.data.data || [];
        console.log(`[SOCIAL] Found ${pages.length} pages via /me/accounts`);
    } catch (e) {
        console.error('[SOCIAL] /me/accounts failed:', e.message);
    }

    // Fallback: If no pages, try me?fields=accounts (Works better for some app types)
    if (pages.length === 0) {
        try {
            const meAccResponse = await axios.get(`${FB_API_URL}/me?fields=accounts{id,name,access_token,category}`, {
                params: { access_token: userAccessToken }
            });
            pages = meAccResponse.data.accounts?.data || [];
            if (pages.length > 0) console.log(`[SOCIAL] Found ${pages.length} pages via me?fields=accounts fallback`);
        } catch (e) {
            console.warn('[SOCIAL] me?fields=accounts fallback failed:', e.message);
        }
    }

    // Final Identity Check: Crawl Businesses for hidden Pages
    if (pages.length === 0) {
        try {
            const bizRes = await axios.get(`${FB_API_URL}/me/businesses`, {
                params: { access_token: userAccessToken, fields: 'id,name' }
            });
            const businesses = bizRes.data.data || [];

            for (const biz of businesses) {
                console.log(`[SOCIAL] Deep searching Business Portfolio: ${biz.name} (${biz.id})`);

                // 1. Try fetching pages via business_assets (Modern approach)
                try {
                    const assetsRes = await axios.get(`${FB_API_URL}/${biz.id}/business_assets`, {
                        params: {
                            access_token: userAccessToken,
                            asset_endpoint_getter: 'PAGE',
                            fields: 'id,name,access_token,category'
                        }
                    });
                    const assetPages = assetsRes.data.data || [];
                    if (assetPages.length > 0) {
                        console.log(`[SOCIAL] Found ${assetPages.length} pages via business_assets in ${biz.name}`);
                        pages.push(...assetPages);
                    }
                } catch (e) { /* silent fail for assets */ }

                // 2. Try fetching IG accounts directly assigned to the Business
                try {
                    const bizIgRes = await axios.get(`${FB_API_URL}/${biz.id}/instagram_business_accounts`, {
                        params: { access_token: userAccessToken, fields: 'id,username,profile_picture_url' }
                    });
                    const bizIgs = bizIgRes.data.data || [];
                    for (const ig of bizIgs) {
                        console.log(`[SOCIAL] Found IG Account via Business ID ${biz.name}: ${ig.username}`);
                        accounts.push({
                            platform: 'instagram',
                            accountId: ig.id,
                            accountName: ig.username,
                            avatar: ig.profile_picture_url,
                            accessToken: userAccessToken,
                            metadata: { connectedBizId: biz.id }
                        });
                    }
                } catch (e) { /* silent fail for biz ig */ }

                // 3. Fallbacks: owned_pages and client_pages
                try {
                    const [ownedRes, clientRes] = await Promise.allSettled([
                        axios.get(`${FB_API_URL}/${biz.id}/owned_pages`, { params: { access_token: userAccessToken, fields: 'id,name,access_token,category' } }),
                        axios.get(`${FB_API_URL}/${biz.id}/client_pages`, { params: { access_token: userAccessToken, fields: 'id,name,access_token,category' } })
                    ]);
                    if (ownedRes.status === 'fulfilled') pages.push(...(ownedRes.value.data.data || []));
                    if (clientRes.status === 'fulfilled') pages.push(...(clientRes.value.data.data || []));
                } catch (e) { }
            }
        } catch (e) {
            console.warn('[SOCIAL] Business deep search failed:', e.response?.data || e.message);
        }
    }

    const uniquePages = Array.from(new Map(pages.map(p => [p.id, p])).values());
    const accounts = [];

    for (const page of uniquePages) {
        accounts.push({
            platform: 'facebook',
            accountId: page.id,
            accountName: page.name,
            accessToken: page.access_token || userAccessToken,
            metadata: { category: page.category }
        });

        try {
            const igResponse = await axios.get(`${FB_API_URL}/${page.id}`, {
                params: {
                    fields: 'instagram_business_account{id,username,profile_picture_url}',
                    access_token: page.access_token || userAccessToken
                }
            });

            if (igResponse.data.instagram_business_account) {
                const igAccount = igResponse.data.instagram_business_account;
                accounts.push({
                    platform: 'instagram',
                    accountId: igAccount.id,
                    accountName: igAccount.username,
                    avatar: igAccount.profile_picture_url,
                    accessToken: page.access_token || userAccessToken,
                    metadata: { connectedPageId: page.id }
                });
            }
        } catch (error) {
            // Standard page might not have a linked IG, ignore
        }

        // ── Subscribe this page to webhook events (comments, feed) ──
        // Without this, Meta will never send comment/post webhooks to our server.
        try {
            const pageToken = page.access_token || userAccessToken;
            // Subscribe to feed (includes comments on FB) AND messages (DMs)
            // Without this subscription, Meta will never deliver comment/post/DM webhooks.
            await axios.post(`${FB_API_URL}/${page.id}/subscribed_apps`, {
                subscribed_fields: 'feed,messages',
                access_token: pageToken,
            });
            console.log(`[SOCIAL] ✅ Page ${page.name} (${page.id}) subscribed to webhook fields: feed, messages`);
        } catch (subErr) {
            const errMsg = subErr.response?.data?.error?.message || subErr.message;
            console.warn(`[SOCIAL] ⚠️ Failed to subscribe page ${page.id} to webhooks:`, errMsg);
            // Log the full error for debugging permission issues
            if (subErr.response?.data?.error) {
                console.warn(`[SOCIAL]   Error code: ${subErr.response.data.error.code}, type: ${subErr.response.data.error.type}`);
            }
        }
    }

    // Direct Discovery Fallback
    if (!accounts.some(a => a.platform === 'instagram')) {
        try {
            const directIgResponse = await axios.get(`${FB_API_URL}/me/instagram_business_accounts`, {
                params: { fields: 'id,username,profile_picture_url', access_token: userAccessToken }
            });
            const directIgs = directIgResponse.data.data || [];
            for (const ig of directIgs) {
                accounts.push({
                    platform: 'instagram',
                    accountId: ig.id,
                    accountName: ig.username,
                    avatar: ig.profile_picture_url,
                    accessToken: userAccessToken,
                    metadata: { discovery: 'direct' }
                });
            }
        } catch (e) { }
    }

    return accounts;
};

export const publishToFacebook = async (pageId, accessToken, text, imageUrl, videoUrl) => {
    try {
        if (videoUrl) {
            // Post video with description
            const url = `${FB_API_URL}/${pageId}/videos`;
            const response = await axios.post(url, {
                description: text,
                file_url: videoUrl,
                access_token: accessToken
            });
            return response.data.id;
        } else if (imageUrl) {
            // Post photo with caption
            const url = `${FB_API_URL}/${pageId}/photos`;
            const response = await axios.post(url, {
                caption: text,
                url: imageUrl,
                access_token: accessToken,
                published: true
            });
            return response.data.id;
        } else {
            // Post text only to feed
            const url = `${FB_API_URL}/${pageId}/feed`;
            const response = await axios.post(url, {
                message: text,
                access_token: accessToken
            });
            return response.data.id;
        }
    } catch (error) {
        if (error.response?.data) {
            console.error('[SOCIAL] Facebook API Error Details:', JSON.stringify(error.response.data));
        }
        console.error('Facebook Publish Error:', error.response?.data || error.message);
        const fbError = error.response?.data?.error;
        const msg = fbError?.error_user_msg || fbError?.message || error.message;
        throw new Error(msg);
    }
};

export const publishToInstagram = async (igAccountId, accessToken, text, imageUrl, videoUrl) => {
    try {
        if (!imageUrl && !videoUrl) {
            throw new Error("Instagram requires an image or video to publish.");
        }

        // Step 1: Create media container
        const containerUrl = `${FB_API_URL}/${igAccountId}/media`;
        const containerPayload = {
            caption: text,
            access_token: accessToken
        };
        
        if (videoUrl) {
            containerPayload.video_url = videoUrl;
            containerPayload.media_type = 'REELS'; // Use REELS for video to maximize reach
            containerPayload.share_to_feed = true; // Also share to the main profile grid
        } else {
            containerPayload.image_url = imageUrl;
        }

        const containerResponse = await axios.post(containerUrl, containerPayload);

        const creationId = containerResponse.data.id;
        console.log(`[SOCIAL] Created Instagram media container: ${creationId}. Waiting for it to be ready...`);

        // Step 2: Poll for container readiness
        // Meta can take several seconds to process images, and up to 5 minutes for videos (Reels).
        let isReady = false;
        let attempts = 0;
        const maxAttempts = videoUrl ? 100 : 15; // 100 * 3s = 300 seconds (5 mins)

        let containerError = null;
        while (!isReady && attempts < maxAttempts) {
            attempts++;
            // Wait 3 seconds before each check
            await new Promise(resolve => setTimeout(resolve, 3000));

            try {
                const statusResponse = await axios.get(`${FB_API_URL}/${creationId}`, {
                    params: {
                        fields: 'status_code,status',
                        access_token: accessToken
                    }
                });

                const status = statusResponse.data.status_code;
                console.log(`[SOCIAL] Container ${creationId} status: ${status} (Attempt ${attempts}/${maxAttempts})`);

                if (status === 'FINISHED') {
                    isReady = true;
                } else if (status === 'ERROR') {
                    containerError = 'Instagram media processing failed. The video format or size might be unsupported.';
                    break; // Exit loop immediately, no recovery possible
                }
            } catch (err) {
                console.warn(`[SOCIAL] Error checking container status: ${err.message}`);
                // Only break on hard HTTP 4xx/5xx errors if we want, but usually it's best to retry network errors
            }
        }

        if (containerError) {
            throw new Error(containerError);
        }

        if (!isReady) {
            throw new Error("Instagram media processing timed out after 5 minutes. Meta is currently experiencing high load.");
        }

        // Step 3: Publish the media container
        const publishUrl = `${FB_API_URL}/${igAccountId}/media_publish`;
        const publishResponse = await axios.post(publishUrl, {
            creation_id: creationId,
            access_token: accessToken
        });

        console.log(`[SOCIAL] Successfully published to Instagram! Post ID: ${publishResponse.data.id}`);
        return publishResponse.data.id;
    } catch (error) {
        console.error('Instagram Publish Error:', error.response?.data || error.message);
        const fbError = error.response?.data?.error;
        const msg = fbError?.error_user_msg || fbError?.message || error.message;
        throw new Error(msg);
    }
};

/**
 * Publish a CAROUSEL post to Instagram (2-10 images)
 * Flow: create child containers → poll each → create carousel container → publish
 */
export const publishCarouselToInstagram = async (igAccountId, accessToken, text, imageUrls) => {
    try {
        if (!imageUrls || imageUrls.length < 2) {
            throw new Error("Instagram carousel requires at least 2 images.");
        }
        if (imageUrls.length > 10) {
            imageUrls = imageUrls.slice(0, 10); // Instagram max 10 carousel items
        }

        // Step 1: Create child containers (no caption on children)
        console.log(`[SOCIAL] Creating ${imageUrls.length} Instagram carousel child containers...`);
        const childIds = [];
        for (const url of imageUrls) {
            const containerResponse = await axios.post(`${FB_API_URL}/${igAccountId}/media`, {
                image_url: url,
                is_carousel_item: true,
                access_token: accessToken
            });
            childIds.push(containerResponse.data.id);
            console.log(`[SOCIAL] Child container created: ${containerResponse.data.id}`);
        }

        // Step 2: Poll each child until FINISHED
        for (const childId of childIds) {
            let isReady = false;
            let attempts = 0;
            while (!isReady && attempts < 15) {
                attempts++;
                await new Promise(resolve => setTimeout(resolve, 2000));
                try {
                    const statusResp = await axios.get(`${FB_API_URL}/${childId}`, {
                        params: { fields: 'status_code', access_token: accessToken }
                    });
                    const status = statusResp.data.status_code;
                    if (status === 'FINISHED') isReady = true;
                    else if (status === 'ERROR') throw new Error(`Child container ${childId} processing failed.`);
                } catch (err) {
                    if (err.message.includes('processing failed')) throw err;
                    console.warn(`[SOCIAL] Polling child ${childId}: ${err.message}`);
                }
            }
            if (!isReady) throw new Error(`Instagram child container ${childId} timed out.`);
        }

        // Step 3: Create the carousel container
        console.log(`[SOCIAL] Creating carousel container with ${childIds.length} children...`);
        const carouselResp = await axios.post(`${FB_API_URL}/${igAccountId}/media`, {
            media_type: 'CAROUSEL',
            children: childIds.join(','),
            caption: text,
            access_token: accessToken
        });
        const carouselId = carouselResp.data.id;
        console.log(`[SOCIAL] Carousel container created: ${carouselId}`);

        // Step 4: Poll carousel container
        let carouselReady = false;
        let cAttempts = 0;
        while (!carouselReady && cAttempts < 15) {
            cAttempts++;
            await new Promise(resolve => setTimeout(resolve, 3000));
            try {
                const sResp = await axios.get(`${FB_API_URL}/${carouselId}`, {
                    params: { fields: 'status_code', access_token: accessToken }
                });
                if (sResp.data.status_code === 'FINISHED') carouselReady = true;
                else if (sResp.data.status_code === 'ERROR') throw new Error('Carousel processing failed.');
            } catch (err) {
                if (err.message.includes('processing failed')) throw err;
            }
        }
        if (!carouselReady) throw new Error('Instagram carousel processing timed out.');

        // Step 5: Publish
        const publishResp = await axios.post(`${FB_API_URL}/${igAccountId}/media_publish`, {
            creation_id: carouselId,
            access_token: accessToken
        });

        console.log(`[SOCIAL] ✅ Instagram carousel published! Post ID: ${publishResp.data.id}`);
        return publishResp.data.id;
    } catch (error) {
        console.error('Instagram Carousel Error:', error.response?.data || error.message);
        const fbError = error.response?.data?.error;
        throw new Error(fbError?.error_user_msg || fbError?.message || error.message);
    }
};

/**
 * Publish a multi-photo post to Facebook
 * Flow: upload each photo unpublished → create feed post with attached_media
 */
export const publishCarouselToFacebook = async (pageId, accessToken, text, imageUrls) => {
    try {
        if (!imageUrls || imageUrls.length < 2) {
            // Fallback to single photo
            return publishToFacebook(pageId, accessToken, text, imageUrls?.[0]);
        }

        // Step 1: Upload each photo as unpublished
        console.log(`[SOCIAL] Uploading ${imageUrls.length} unpublished photos to Facebook...`);
        const mediaFbIds = [];
        for (const url of imageUrls) {
            const resp = await axios.post(`${FB_API_URL}/${pageId}/photos`, {
                url: url,
                published: false,
                access_token: accessToken
            });
            mediaFbIds.push({ media_fbid: resp.data.id });
            console.log(`[SOCIAL] Unpublished photo uploaded: ${resp.data.id}`);
        }

        // Step 2: Create feed post with all photos
        const feedResp = await axios.post(`${FB_API_URL}/${pageId}/feed`, {
            message: text,
            attached_media: JSON.stringify(mediaFbIds),
            access_token: accessToken
        });

        console.log(`[SOCIAL] ✅ Facebook multi-photo post published! Post ID: ${feedResp.data.id}`);
        return feedResp.data.id;
    } catch (error) {
        console.error('Facebook Carousel Error:', error.response?.data || error.message);
        const fbError = error.response?.data?.error;
        throw new Error(fbError?.error_user_msg || fbError?.message || error.message);
    }
};

/**
 * Publish a multi-image post to LinkedIn
 */
export const publishCarouselToLinkedIn = async (personUrn, accessToken, text, imageUrls) => {
    try {
        const LI_VERSION = '202401';
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'LinkedIn-Version': LI_VERSION,
            'X-Restli-Protocol-Version': '2.0.0',
        };
        const authorUrn = personUrn.startsWith('urn:li:') ? personUrn : `urn:li:person:${personUrn}`;

        // Upload each image and collect URNs
        const imageUrns = [];
        for (const url of imageUrls) {
            try {
                const initResp = await axios.post('https://api.linkedin.com/rest/images?action=initializeUpload', {
                    initializeUploadRequest: { owner: authorUrn }
                }, { headers, httpsAgent: ipv4Agent });
                const { uploadUrl, image: imageUrn } = initResp.data.value;

                const imgResp = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000, httpsAgent: ipv4Agent });
                await axios.put(uploadUrl, imgResp.data, {
                    headers: { 'Content-Type': imgResp.headers['content-type'] || 'image/png' },
                    maxContentLength: 50 * 1024 * 1024,
                    httpsAgent: ipv4Agent
                });
                imageUrns.push(imageUrn);
                console.log(`[SOCIAL] LinkedIn carousel image uploaded: ${imageUrn}`);
            } catch (imgErr) {
                console.warn(`[SOCIAL] LinkedIn carousel image upload failed: ${imgErr.message}`);
            }
        }

        if (imageUrns.length === 0) throw new Error('No images could be uploaded to LinkedIn');

        // Create multi-image post using Posts API
        const postBody = {
            author: authorUrn,
            commentary: text,
            visibility: 'PUBLIC',
            distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
            lifecycleState: 'PUBLISHED',
            content: {
                multiImage: {
                    images: imageUrns.map(urn => ({ id: urn, altText: '' })),
                },
            },
        };

        const response = await axios.post('https://api.linkedin.com/rest/posts', postBody, { headers, httpsAgent: ipv4Agent });
        const postId = response.headers['x-restli-id'] || response.data?.id || '';
        console.log(`[SOCIAL] ✅ LinkedIn multi-image post published! ID: ${postId}`);
        return postId;
    } catch (error) {
        const errData = error.response?.data;
        console.error('[SOCIAL] LinkedIn Carousel Error:', errData || error.message);
        throw new Error(errData?.message || error.message || 'Failed to publish multi-image to LinkedIn');
    }
};

/**
 * Fetch recent posts from a Facebook Page or Instagram Account
 */
export const fetchRecentPosts = async (accountId, accessToken, platform) => {
    try {
        if (platform === 'facebook') {
            const url = `${FB_API_URL}/${accountId}/posts`;
            const response = await axios.get(url, {
                params: {
                    fields: 'id,message,created_time,full_picture,permalink_url',
                    access_token: accessToken,
                    limit: 10
                }
            });
            return response.data.data.map(post => ({
                id: post.id,
                content: post.message || '',
                createdAt: post.created_time,
                imageUrl: post.full_picture,
                permalink: post.permalink_url,
                platform: 'facebook'
            }));
        } else if (platform === 'instagram') {
            const url = `${FB_API_URL}/${accountId}/media`;
            const response = await axios.get(url, {
                params: {
                    fields: 'id,caption,timestamp,media_url,permalink,media_type',
                    access_token: accessToken,
                    limit: 10
                }
            });
            return response.data.data.map(media => ({
                id: media.id,
                content: media.caption || '',
                createdAt: media.timestamp,
                imageUrl: media.media_url,
                permalink: media.permalink,
                platform: 'instagram'
            }));
        } else if (platform === 'twitter') {
            // Twitter v2 — recent tweets for a user (bearer token, no user auth needed for public)
            const bearerToken = config.twitter.bearerToken;
            if (!bearerToken) return [];
            const twUrl = `https://api.twitter.com/2/users/${accountId}/tweets?tweet.fields=created_at,text,attachments&max_results=10`;
            const twResp = await axios.get(twUrl, {
                headers: { 'Authorization': `Bearer ${bearerToken}` }
            });
            return (twResp.data?.data || []).map(tweet => ({
                id: tweet.id,
                content: tweet.text || '',
                createdAt: tweet.created_at,
                permalink: `https://x.com/i/status/${tweet.id}`,
                platform: 'twitter',
            }));
        } else if (platform === 'linkedin') {
            // LinkedIn personal post history is not directly available via public API without r_member_social + ugcPosts scope
            // Return empty array gracefully
            return [];
        }
        return [];
    } catch (error) {
        console.error(`Failed to fetch recent posts for ${platform}:`, error.response?.data || error.message);
        throw new Error(error.response?.data?.error?.message || `Failed to fetch recent posts for ${platform}`);
    }
};

export const getLinkedInAuthUrl = (stateId) => {
    const { clientId, callbackUrl } = config.linkedin;
    // Requesting personal AND organization scopes so users can publish to both.
    const scopes = [
        'openid', 
        'profile', 
        'email', 
        'w_member_social', 
        'w_organization_social', 
        'rw_organization_admin'
    ].join(' ');
    const baseUrl = 'https://www.linkedin.com/oauth/v2/authorization';

    return `${baseUrl}?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(callbackUrl)}&state=${stateId}&scope=${encodeURIComponent(scopes)}`;
};

export const exchangeLinkedInCodeForToken = async (code) => {
    const { clientId, clientSecret, callbackUrl } = config.linkedin;
    const url = 'https://www.linkedin.com/oauth/v2/accessToken';

    const params = {
        grant_type: 'authorization_code',
        code,
        redirect_uri: callbackUrl,
        client_id: clientId,
        client_secret: clientSecret
    };

    const response = await axios.post(url, new URLSearchParams(params), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        httpsAgent: ipv4Agent
    });

    return response.data;
};

export const fetchLinkedInProfile = async (accessToken) => {
    // Use OpenID Connect userinfo endpoint (replaces deprecated /v2/me for lite profiles)
    const url = 'https://api.linkedin.com/v2/userinfo';
    const response = await axios.get(url, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
        },
        httpsAgent: ipv4Agent
    });
    // Map OpenID fields to match the shape our callback expects
    const data = response.data;
    return {
        id: data.sub,  // OpenID subject = LinkedIn member ID
        localizedFirstName: data.given_name || data.name?.split(' ')[0] || '',
        localizedLastName: data.family_name || data.name?.split(' ').slice(1).join(' ') || '',
        profilePicture: data.picture || '',
    };
};

/**
 * Fetch LinkedIn Company Pages the user is an admin of.
 * Uses the organizationAcls endpoint and then resolves the organization details.
 */
export const fetchLinkedInOrganizations = async (accessToken) => {
    try {
        // Step 1: Get all organizations where the user has an ADMIN role
        const aclsUrl = 'https://api.linkedin.com/v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED';
        const aclsResponse = await axios.get(aclsUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'LinkedIn-Version': '202401',
                'X-Restli-Protocol-Version': '2.0.0'
            },
            httpsAgent: ipv4Agent
        });

        const elements = aclsResponse.data.elements || [];
        if (elements.length === 0) return [];

        // Extract organization URNs (e.g., "urn:li:organization:123456")
        const orgUrns = elements.map(el => el.organization);

        // Step 2: Fetch details for these organizations
        const ids = orgUrns.map(urn => urn.split(':').pop()).join(',');
        const orgsUrl = `https://api.linkedin.com/v2/organizations?ids=List(${ids})`;
        const orgsResponse = await axios.get(orgsUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'LinkedIn-Version': '202401',
                'X-Restli-Protocol-Version': '2.0.0'
            },
            httpsAgent: ipv4Agent
        });

        const results = orgsResponse.data.results || {};
        
        const organizations = [];
        for (const urn of orgUrns) {
            const orgData = results[urn];
            if (orgData) {
                // Determine localized name
                const locale = Object.keys(orgData.localizedName || {})[0];
                const name = locale ? orgData.localizedName[locale] : 'LinkedIn Page';
                
                organizations.push({
                    urn,           // e.g., 'urn:li:organization:123456'
                    id: orgData.id, // e.g., 123456
                    name: name,
                    profilePicture: '' // Logos require additional projection, safe to leave blank for now
                });
            }
        }

        return organizations;
    } catch (error) {
        if (error.response?.status === 403) {
            console.log('[SOCIAL] Note: LinkedIn Company Page access skipped (missing developer permissions).');
        } else {
            console.error('[SOCIAL] Failed to fetch LinkedIn Organizations:', error.response?.data || error.message);
        }
        return [];
    }
};

export const publishToLinkedIn = async (personUrn, accessToken, text, imageUrl, videoUrl) => {
    try {
        const LI_VERSION = '202401';
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'LinkedIn-Version': LI_VERSION,
            'X-Restli-Protocol-Version': '2.0.0',
        };
        const authorUrn = personUrn.startsWith('urn:li:') ? personUrn : `urn:li:person:${personUrn}`;

        // ── Helper: Upload image to LinkedIn and get asset URN ──
        async function uploadImageToLinkedIn(imgUrl) {
            // Step 1: Initialize upload
            const initResp = await axios.post('https://api.linkedin.com/rest/images?action=initializeUpload', {
                initializeUploadRequest: { owner: authorUrn }
            }, { headers, httpsAgent: ipv4Agent });
            const { uploadUrl, image: imageUrn } = initResp.data.value;

            // Step 2: Download image and upload binary to LinkedIn
            const imgResp = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: 30000, httpsAgent: ipv4Agent });
            await axios.put(uploadUrl, imgResp.data, {
                headers: { 'Content-Type': imgResp.headers['content-type'] || 'image/png' },
                maxContentLength: 50 * 1024 * 1024,
                httpsAgent: ipv4Agent
            });
            console.log(`[SOCIAL] ✅ LinkedIn image uploaded: ${imageUrn}`);
            return imageUrn;
        }

        // ── Helper: Upload video to LinkedIn ──
        async function uploadVideoToLinkedIn(vidUrl) {
            // Step 1: Initialize upload
            const initResp = await axios.post('https://api.linkedin.com/rest/videos?action=initializeUpload', {
                initializeUploadRequest: { owner: authorUrn, fileSizeBytes: 0, uploadCaptions: false, uploadThumbnail: false }
            }, { headers, httpsAgent: ipv4Agent });
            const { uploadUrl: vidUploadUrl, video: videoUrn } = (initResp.data.value || initResp.data);

            // Step 2: Download video and upload binary
            const vidResp = await axios.get(vidUrl, { responseType: 'arraybuffer', timeout: 120000, httpsAgent: ipv4Agent });
            await axios.put(vidUploadUrl, vidResp.data, {
                headers: { 'Content-Type': 'video/mp4' },
                maxContentLength: 200 * 1024 * 1024,
                httpsAgent: ipv4Agent
            });
            console.log(`[SOCIAL] ✅ LinkedIn video uploaded: ${videoUrn}`);
            return videoUrn;
        }

        // Build the post body using the current Posts API
        const postBody = {
            author: authorUrn,
            commentary: text,
            visibility: 'PUBLIC',
            distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
            lifecycleState: 'PUBLISHED',
        };

        if (videoUrl) {
            // Video post
            try {
                const videoUrn = await uploadVideoToLinkedIn(videoUrl);
                postBody.content = { media: { title: 'Video', id: videoUrn } };
            } catch (vidErr) {
                console.warn(`[SOCIAL] LinkedIn video upload failed, posting as text+link: ${vidErr.message}`);
                postBody.commentary = `${text}\n\n🎥 ${videoUrl}`;
            }
        } else if (imageUrl) {
            // Image post
            const imageUrn = await uploadImageToLinkedIn(imageUrl);
            postBody.content = { media: { title: 'Image', id: imageUrn } };
        }

        const response = await axios.post('https://api.linkedin.com/rest/posts', postBody, { headers, httpsAgent: ipv4Agent });

        // Posts API returns 201 with the post URN in the x-restli-id header
        const postId = response.headers['x-restli-id'] || response.data?.id || '';
        console.log(`[SOCIAL] ✅ LinkedIn post published: ${postId}`);
        return postId;
    } catch (error) {
        const errData = error.response?.data;
        const msg = errData?.message || errData?.error?.message || error.message;
        console.error('[SOCIAL] LinkedIn Publish Error:', errData || error.message);
        throw new Error(msg || 'Failed to publish to LinkedIn');
    }
};

/**
 * Fetch insights/analytics for a specific post
 */
export const fetchPostAnalytics = async (postId, accessToken, platform) => {
    try {
        if (platform === 'facebook') {
            const url = `${FB_API_URL}/${postId}/insights`;
            const response = await axios.get(url, {
                params: {
                    metric: 'post_reactions_by_type_total,post_comments_by_type,post_impressions',
                    access_token: accessToken
                }
            });

            const insights = response.data.data;
            const stats = {
                likes: insights.find(i => i.name === 'post_reactions_by_type_total')?.values[0]?.value?.like || 0,
                comments: insights.find(i => i.name === 'post_comments_by_type')?.values[0]?.value || 0,
                impressions: insights.find(i => i.name === 'post_impressions')?.values[0]?.value || 0
            };
            return stats;
        } else if (platform === 'instagram') {
            const url = `${FB_API_URL}/${postId}/insights`;
            const response = await axios.get(url, {
                params: {
                    metric: 'engagement,impressions,reach',
                    access_token: accessToken
                }
            });
            const insights = response.data.data;
            return {
                engagement: insights.find(i => i.name === 'engagement')?.values[0]?.value || 0,
                impressions: insights.find(i => i.name === 'impressions')?.values[0]?.value || 0,
                reach: insights.find(i => i.name === 'reach')?.values[0]?.value || 0
            };
        } else if (platform === 'linkedin') {
            // LinkedIn Share Statistics via socialActions endpoint
            // postId is the share URN like urn:li:share:7338271625718587392
            const encodedUrn = encodeURIComponent(postId);
            const liUrl = `https://api.linkedin.com/v2/socialActions/${encodedUrn}`;
            const liResp = await axios.get(liUrl, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'X-Restli-Protocol-Version': '2.0.0',
                    'LinkedIn-Version': '202601',
                },
                httpsAgent: ipv4Agent
            });
            const d = liResp.data;
            return {
                likes: d.reactions?.numReactions ?? d.likesSummary?.totalLikes ?? 0,
                comments: d.commentsSummary?.totalFirstLevelComments ?? 0,
                impressions: 0, // LinkedIn doesn't expose personal impressions via socialActions
            };
        } else if (platform === 'twitter') {
            // Twitter v2 public metrics — works with bearer token (no user auth needed)
            const bearerToken = config.twitter.bearerToken;
            if (!bearerToken) return null;
            const twUrl = `https://api.twitter.com/2/tweets/${postId}?tweet.fields=public_metrics`;
            const twResp = await axios.get(twUrl, {
                headers: { 'Authorization': `Bearer ${bearerToken}` }
            });
            const m = twResp.data?.data?.public_metrics || {};
            return {
                likes: m.like_count || 0,
                comments: m.reply_count || 0,
                impressions: m.impression_count || 0,
                retweets: m.retweet_count || 0,
            };
        }
    } catch (error) {
        console.error(`Failed to fetch analytics for ${platform} post ${postId}:`, error.response?.data || error.message);
        // Don't throw, just return null so the UI can handle it gracefully
        return null;
    }
};

// ═══════════════════════════════════════════════════════════════════════
// TWITTER / X — OAuth 1.0a signed requests
// ═══════════════════════════════════════════════════════════════════════

import crypto from 'crypto';

/**
 * Generate OAuth 1.0a signature for Twitter API requests
 */
function twitterOAuthSign(method, url, params, consumerSecret, tokenSecret) {
    const sortedParams = Object.keys(params).sort().map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join('&');
    const baseString = `${method.toUpperCase()}&${encodeURIComponent(url)}&${encodeURIComponent(sortedParams)}`;
    const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;
    return crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');
}

function twitterAuthHeader(method, url, extraParams, consumerKey, consumerSecret, accessToken, accessTokenSecret) {
    const oauthParams = {
        oauth_consumer_key: consumerKey,
        oauth_nonce: crypto.randomBytes(16).toString('hex'),
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
        oauth_token: accessToken,
        oauth_version: '1.0',
    };
    const allParams = { ...oauthParams, ...extraParams };
    oauthParams.oauth_signature = twitterOAuthSign(method, url, allParams, consumerSecret, accessTokenSecret);
    const headerStr = Object.keys(oauthParams).sort().map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`).join(', ');
    return `OAuth ${headerStr}`;
}

/**
 * Publish a tweet to Twitter/X with optional image or video
 */
export const publishToTwitter = async (text, imageUrl, videoUrl, credentials = null) => {
    // credentials override allows per-user tokens; falls back to app-level config
    const { apiKey, apiSecret, accessToken, accessTokenSecret } = credentials || config.twitter;
    if (!apiKey || !accessToken) throw new Error('Twitter API credentials not configured');

    try {
        let mediaId = null;

        // ── Upload media if provided ──
        const mediaUrl = videoUrl || imageUrl;
        if (mediaUrl) {
            // Download media
            const mediaResp = await axios.get(mediaUrl, { responseType: 'arraybuffer', timeout: 60000 });
            const mediaBuffer = Buffer.from(mediaResp.data);
            const mediaBase64 = mediaBuffer.toString('base64');
            const isVideo = !!videoUrl;
            const mediaType = isVideo ? 'video/mp4' : (mediaResp.headers['content-type'] || 'image/png');

            if (isVideo) {
                // Chunked upload for video (INIT → APPEND → FINALIZE)
                const initUrl = 'https://upload.twitter.com/1.1/media/upload.json';

                // INIT
                const initParams = { command: 'INIT', total_bytes: mediaBuffer.length.toString(), media_type: mediaType, media_category: 'tweet_video' };
                const initAuth = twitterAuthHeader('POST', initUrl, initParams, apiKey, apiSecret, accessToken, accessTokenSecret);
                const initResp = await axios.post(initUrl, new URLSearchParams(initParams), {
                    headers: { 'Authorization': initAuth, 'Content-Type': 'application/x-www-form-urlencoded' }
                });
                mediaId = initResp.data.media_id_string;

                // APPEND (single chunk for simplicity — works for <15MB)
                const formData = new URLSearchParams();
                formData.append('command', 'APPEND');
                formData.append('media_id', mediaId);
                formData.append('segment_index', '0');
                formData.append('media_data', mediaBase64);
                const appendAuth = twitterAuthHeader('POST', initUrl, { command: 'APPEND', media_id: mediaId, segment_index: '0' }, apiKey, apiSecret, accessToken, accessTokenSecret);
                await axios.post(initUrl, formData, {
                    headers: { 'Authorization': appendAuth, 'Content-Type': 'application/x-www-form-urlencoded' },
                    maxContentLength: 200 * 1024 * 1024,
                });

                // FINALIZE
                const finParams = { command: 'FINALIZE', media_id: mediaId };
                const finAuth = twitterAuthHeader('POST', initUrl, finParams, apiKey, apiSecret, accessToken, accessTokenSecret);
                const finResp = await axios.post(initUrl, new URLSearchParams(finParams), {
                    headers: { 'Authorization': finAuth, 'Content-Type': 'application/x-www-form-urlencoded' }
                });

                // Poll for processing completion
                if (finResp.data.processing_info) {
                    let processing = true;
                    let checks = 0;
                    while (processing && checks < 60) {
                        const waitSec = finResp.data.processing_info?.check_after_secs || 5;
                        await new Promise(r => setTimeout(r, waitSec * 1000));
                        const statusParams = { command: 'STATUS', media_id: mediaId };
                        const statusAuth = twitterAuthHeader('GET', initUrl, statusParams, apiKey, apiSecret, accessToken, accessTokenSecret);
                        const statusResp = await axios.get(`${initUrl}?command=STATUS&media_id=${mediaId}`, {
                            headers: { 'Authorization': statusAuth }
                        });
                        const state = statusResp.data.processing_info?.state;
                        if (state === 'succeeded' || !statusResp.data.processing_info) processing = false;
                        else if (state === 'failed') throw new Error('Twitter video processing failed');
                        checks++;
                    }
                }
                console.log(`[SOCIAL] ✅ Twitter video uploaded: ${mediaId}`);
            } else {
                // Simple image upload
                const uploadUrl = 'https://upload.twitter.com/1.1/media/upload.json';
                const uploadParams = { media_data: mediaBase64 };
                const auth = twitterAuthHeader('POST', uploadUrl, {}, apiKey, apiSecret, accessToken, accessTokenSecret);
                const uploadResp = await axios.post(uploadUrl, new URLSearchParams(uploadParams), {
                    headers: { 'Authorization': auth, 'Content-Type': 'application/x-www-form-urlencoded' },
                    maxContentLength: 50 * 1024 * 1024,
                });
                mediaId = uploadResp.data.media_id_string;
                console.log(`[SOCIAL] ✅ Twitter image uploaded: ${mediaId}`);
            }
        }

        // ── Create tweet via v2 API ──
        const tweetUrl = 'https://api.twitter.com/2/tweets';
        const tweetBody = { text };
        if (mediaId) {
            tweetBody.media = { media_ids: [mediaId] };
        }

        const tweetAuth = twitterAuthHeader('POST', tweetUrl, {}, apiKey, apiSecret, accessToken, accessTokenSecret);
        const tweetResp = await axios.post(tweetUrl, tweetBody, {
            headers: { 'Authorization': tweetAuth, 'Content-Type': 'application/json' }
        });

        const tweetId = tweetResp.data?.data?.id;
        console.log(`[SOCIAL] ✅ Tweet published: ${tweetId}`);
        return tweetId;
    } catch (error) {
        const errData = error.response?.data;
        console.error('[SOCIAL] Twitter Publish Error:', errData || error.message);
        const msg = errData?.detail || errData?.errors?.[0]?.message || errData?.title || error.message;
        throw new Error(msg || 'Failed to publish to Twitter/X');
    }
};

// ═══════════════════════════════════════════════════════════════════════
// TWITTER / X — OAuth 1.0a Three-Legged Flow Helpers
// ═══════════════════════════════════════════════════════════════════════

/**
 * Step 1 of OAuth 1.0a: Get a temporary request token from Twitter.
 * Returns { oauthToken, oauthTokenSecret }.
 * The caller must redirect the user to:
 *   https://api.twitter.com/oauth/authenticate?oauth_token={oauthToken}
 */
export const getTwitterOAuthRequestToken = async (callbackUrl) => {
    const { apiKey, apiSecret } = config.twitter;
    if (!apiKey || !apiSecret) throw new Error('Twitter API key/secret not configured');

    const url = 'https://api.twitter.com/oauth/request_token';
    const oauthParams = {
        oauth_callback: callbackUrl,
        oauth_consumer_key: apiKey,
        oauth_nonce: crypto.randomBytes(16).toString('hex'),
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
        oauth_version: '1.0',
    };
    // Sign the request — token secret is empty string at request_token stage
    oauthParams.oauth_signature = twitterOAuthSign('POST', url, oauthParams, apiSecret, '');
    const headerStr = Object.keys(oauthParams).sort()
        .map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`).join(', ');

    const response = await axios.post(url, null, {
        headers: { 'Authorization': `OAuth ${headerStr}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const parsed = new URLSearchParams(response.data);
    const oauthToken = parsed.get('oauth_token');
    const oauthTokenSecret = parsed.get('oauth_token_secret');
    if (!oauthToken) throw new Error('Twitter did not return an oauth_token — verify your app Callback URL in the Twitter Developer Portal');
    return { oauthToken, oauthTokenSecret };
};

/**
 * Step 3 of OAuth 1.0a: Exchange the verifier for permanent user-level access tokens.
 * Returns { accessToken, accessTokenSecret, userId, screenName }.
 */
export const exchangeTwitterVerifier = async (oauthToken, oauthTokenSecret, oauthVerifier) => {
    const { apiKey, apiSecret } = config.twitter;
    const url = 'https://api.twitter.com/oauth/access_token';

    const oauthParams = {
        oauth_consumer_key: apiKey,
        oauth_nonce: crypto.randomBytes(16).toString('hex'),
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
        oauth_token: oauthToken,
        oauth_verifier: oauthVerifier,
        oauth_version: '1.0',
    };
    oauthParams.oauth_signature = twitterOAuthSign('POST', url, oauthParams, apiSecret, oauthTokenSecret);
    const headerStr = Object.keys(oauthParams).sort()
        .map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`).join(', ');

    const response = await axios.post(
        url,
        new URLSearchParams({ oauth_verifier: oauthVerifier }),
        { headers: { 'Authorization': `OAuth ${headerStr}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const parsed = new URLSearchParams(response.data);
    return {
        accessToken: parsed.get('oauth_token'),
        accessTokenSecret: parsed.get('oauth_token_secret'),
        userId: parsed.get('user_id'),
        screenName: parsed.get('screen_name'),
    };
};

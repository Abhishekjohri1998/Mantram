import axios from 'axios';
import config from '../config/env.js';

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
        // LinkedIn multi-image uses the same ugcPosts API with multiple media entries
        const media = imageUrls.map(url => ({
            status: 'READY',
            originalUrl: url,
            description: { text: text.substring(0, 200) },
        }));

        const body = {
            author: `urn:li:person:${personUrn}`,
            lifecycleState: 'PUBLISHED',
            specificContent: {
                'com.linkedin.ugc.ShareContent': {
                    shareCommentary: { text },
                    shareMediaCategory: 'IMAGE',
                    media,
                },
            },
            visibility: {
                'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
            },
        };

        const response = await axios.post('https://api.linkedin.com/v2/ugcPosts', body, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
                'X-Restli-Protocol-Version': '2.0.0',
            }
        });

        console.log(`[SOCIAL] ✅ LinkedIn multi-image post published! ID: ${response.data.id}`);
        return response.data.id;
    } catch (error) {
        throw new Error(error.response?.data?.message || 'Failed to publish multi-image to LinkedIn');
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
        }
        return [];
    } catch (error) {
        console.error(`Failed to fetch recent posts for ${platform}:`, error.response?.data || error.message);
        throw new Error(error.response?.data?.error?.message || `Failed to fetch recent posts for ${platform}`);
    }
};

export const getLinkedInAuthUrl = (stateId) => {
    const { clientId, callbackUrl } = config.linkedin;
    const scopes = ['w_member_social', 'r_liteprofile', 'r_emailaddress'].join(' ');
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
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    return response.data;
};

export const fetchLinkedInProfile = async (accessToken) => {
    const url = 'https://api.linkedin.com/v2/me';
    const response = await axios.get(url, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    return response.data;
};

export const publishToLinkedIn = async (personUrn, accessToken, text, imageUrl) => {
    try {
        const url = 'https://api.linkedin.com/v2/ugcPosts';
        const body = {
            author: `urn:li:person:${personUrn}`,
            lifecycleState: 'PUBLISHED',
            specificContent: {
                'com.linkedin.ugc.ShareContent': {
                    shareCommentary: { text },
                    shareMediaCategory: imageUrl ? 'IMAGE' : 'NONE',
                },
            },
            visibility: {
                'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
            },
        };

        if (imageUrl) {
            body.specificContent['com.linkedin.ugc.ShareContent'].media = [{
                status: 'READY',
                originalUrl: imageUrl,
                description: { text: text.substring(0, 200) },
            }];
        }

        const response = await axios.post(url, body, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
                'X-Restli-Protocol-Version': '2.0.0',
            }
        });

        return response.data.id;
    } catch (error) {
        throw new Error(error.response?.data?.message || 'Failed to publish to LinkedIn');
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
            // LinkedIn analytics usually require a separate call to the organizationalInsights or similar
            // For now, return a placeholder or implement if needed
            return { likes: 0, comments: 0, impressions: 0 };
        }
    } catch (error) {
        console.error(`Failed to fetch analytics for ${platform} post ${postId}:`, error.response?.data || error.message);
        // Don't throw, just return null so the UI can handle it gracefully
        return null;
    }
};

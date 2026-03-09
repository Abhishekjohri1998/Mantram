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
        'pages_read_user_content',
        'business_management',
        'public_profile'
    ];

    // Additional scopes for Instagram (only if specifically requested or if Instagram is active)
    const igScopes = [
        'instagram_basic',
        'instagram_content_publish',
        'instagram_manage_insights'
    ];

    const requestedScopes = [...fbScopes];
    if (platform === 'instagram') {
        requestedScopes.push(...igScopes);
    }

    const scopes = requestedScopes.join(',');

    // Always use Facebook Dialog for Business Accounts
    const baseUrl = 'https://www.facebook.com/v22.0/dialog/oauth';

    return `${baseUrl}?client_id=${appId}&redirect_uri=${config.facebook.redirectUri}&state=${stateId}&scope=${scopes}&response_type=code`;
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
    // DEBUG: Fetch user info and permissions
    try {
        const [meRes, permRes] = await Promise.all([
            axios.get(`${FB_API_URL}/me?fields=id,name,email`, { params: { access_token: userAccessToken } }),
            axios.get(`${FB_API_URL}/me/permissions`, { params: { access_token: userAccessToken } })
        ]);
        console.log(`[SOCIAL] Token Identity: ${meRes.data.name} (${meRes.data.id})`);
        const granted = permRes.data.data.filter(p => p.status === 'granted').map(p => p.permission);
        console.log(`[SOCIAL] Granted Scopes: ${granted.join(', ')}`);
    } catch (debugErr) {
        console.error('[SOCIAL] Debug fetch failed:', debugErr.response?.data || debugErr.message);
    }

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

                // Try fetching pages owned by the business
                const ownedPagesRes = await axios.get(`${FB_API_URL}/${biz.id}/owned_pages`, {
                    params: { access_token: userAccessToken, fields: 'id,name,access_token,category' }
                });

                const bizPages = ownedPagesRes.data.data || [];
                if (bizPages.length > 0) {
                    console.log(`[SOCIAL] Found ${bizPages.length} pages owned by business ${biz.name}`);
                    pages.push(...bizPages);
                }

                // Try fetching pages where the business is a client
                const clientPagesRes = await axios.get(`${FB_API_URL}/${biz.id}/client_pages`, {
                    params: { access_token: userAccessToken, fields: 'id,name,access_token,category' }
                });
                const clientPages = clientPagesRes.data.data || [];
                if (clientPages.length > 0) {
                    console.log(`[SOCIAL] Found ${clientPages.length} client pages in business ${biz.name}`);
                    pages.push(...clientPages);
                }
            }
        } catch (e) {
            console.warn('[SOCIAL] Business deep search failed:', e.response?.data || e.message);
        }
    }

    // De-duplicate pages by ID (in case multiple routes found the same page)
    const uniquePages = Array.from(new Map(pages.map(p => [p.id, p])).values());
    const accounts = [];

    // Process all discovered Pages
    for (const page of uniquePages) {
        // Collect the Facebook Page
        accounts.push({
            platform: 'facebook',
            accountId: page.id,
            accountName: page.name,
            accessToken: page.access_token || userAccessToken, // Use page token if available, else user token
            metadata: { category: page.category }
        });

        // Fetch connected Instagram Business Account for this Page
        try {
            const igResponse = await axios.get(`${FB_API_URL}/${page.id}`, {
                params: {
                    fields: 'instagram_business_account{id,username,profile_picture_url}',
                    access_token: page.access_token || userAccessToken
                }
            });

            if (igResponse.data.instagram_business_account) {
                const igAccount = igResponse.data.instagram_business_account;
                console.log(`[SOCIAL] Found IG Business Account via Page ${page.name}: ${igAccount.username}`);
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
            // Ignore individual page failures in deep search
        }
    }

    // Direct Check Fallback: If still no IG accounts, try direct Discovery
    const igCount = accounts.filter(a => a.platform === 'instagram').length;
    if (igCount === 0) {
        try {
            const directIgResponse = await axios.get(`${FB_API_URL}/me/instagram_business_accounts`, {
                params: { fields: 'id,username,profile_picture_url', access_token: userAccessToken }
            });
            const directIgs = directIgResponse.data.data || [];
            for (const ig of directIgs) {
                console.log(`[SOCIAL] Found IG Account via Direct Discovery: ${ig.username}`);
                accounts.push({
                    platform: 'instagram',
                    accountId: ig.id,
                    accountName: ig.username,
                    avatar: ig.profile_picture_url,
                    accessToken: userAccessToken,
                    metadata: { discovery: 'direct' }
                });
            }
        } catch (e) { /* ignore fallback error */ }
    }

    return accounts;
};

export const publishToFacebook = async (pageId, accessToken, text, imageUrl) => {
    try {
        if (imageUrl) {
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

export const publishToInstagram = async (igAccountId, accessToken, text, imageUrl) => {
    try {
        if (!imageUrl) {
            throw new Error("Instagram requires an image or video to publish.");
        }

        // Step 1: Create media container
        const containerUrl = `${FB_API_URL}/${igAccountId}/media`;
        const containerResponse = await axios.post(containerUrl, {
            image_url: imageUrl,
            caption: text,
            access_token: accessToken
        });

        const creationId = containerResponse.data.id;

        // Step 2: Publish the media container
        const publishUrl = `${FB_API_URL}/${igAccountId}/media_publish`;
        const publishResponse = await axios.post(publishUrl, {
            creation_id: creationId,
            access_token: accessToken
        });

        return publishResponse.data.id;
    } catch (error) {
        console.error('Instagram Publish Error:', error.response?.data || error.message);
        const fbError = error.response?.data?.error;
        const msg = fbError?.error_user_msg || fbError?.message || error.message;
        throw new Error(msg);
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

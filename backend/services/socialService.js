import axios from 'axios';
import config from '../config/env.js';

const FB_API_URL = 'https://graph.facebook.com/v19.0';

export const getMetaAuthUrl = (stateId, platform = 'facebook') => {
    // We always use the Facebook App ID even for Instagram, 
    // because Instagram Business Accounts are linked to Facebook Pages.
    // The isolated Instagram OAuth is only for consumer accounts or specific Basic Display apps.
    const appId = config.facebook.appId;

    // Scopes for Facebook vs Instagram
    const fbScopes = [
        'pages_show_list',
        'pages_read_engagement',
        'pages_manage_posts',
        'instagram_basic',
        'instagram_content_publish',
        'public_profile'
    ];

    const igScopes = [
        'pages_show_list',
        'instagram_basic',
        'instagram_content_publish',
        'instagram_manage_comments',
        'instagram_manage_insights',
        'public_profile'
    ];

    const scopes = (platform === 'instagram' ? igScopes : fbScopes).join(',');

    // Always use Facebook Dialog for Business Accounts
    const baseUrl = 'https://www.facebook.com/v19.0/dialog/oauth';

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
    // 1. Fetch all Pages the user manages
    const pagesUrl = `${FB_API_URL}/me/accounts`;
    const pagesResponse = await axios.get(pagesUrl, {
        params: { access_token: userAccessToken }
    });

    const accounts = [];
    const pages = pagesResponse.data.data;

    for (const page of pages) {
        // Collect the Facebook Page
        accounts.push({
            platform: 'facebook',
            accountId: page.id,
            accountName: page.name,
            accessToken: page.access_token, // Page-specific access token
            metadata: { category: page.category }
        });

        // 2. Fetch connected Instagram Business Account for this Page
        try {
            const igUrl = `${FB_API_URL}/${page.id}`;
            const igResponse = await axios.get(igUrl, {
                params: {
                    fields: 'instagram_business_account{id,username,profile_picture_url}',
                    access_token: page.access_token
                }
            });

            if (igResponse.data.instagram_business_account) {
                const igAccount = igResponse.data.instagram_business_account;
                accounts.push({
                    platform: 'instagram',
                    accountId: igAccount.id,
                    accountName: igAccount.username,
                    avatar: igAccount.profile_picture_url,
                    accessToken: page.access_token, // IG uses the connected Page's token
                    metadata: { connectedPageId: page.id }
                });
            }
        } catch (error) {
            console.error(`Failed to fetch IG account for page ${page.name}: ${error.message}`);
        }
    }

    return accounts;
};

export const publishToFacebook = async (pageId, accessToken, text, imageUrl) => {
    try {
        if (imageUrl) {
            // Post photo with caption
            const url = `${FB_API_URL}/${pageId}/photos`;
            const response = await axios.post(url, {
                message: text,
                url: imageUrl,
                access_token: accessToken
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
        throw new Error(error.response?.data?.error?.message || 'Failed to publish to Facebook');
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
        throw new Error(error.response?.data?.error?.message || 'Failed to publish to Instagram');
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
        }
    } catch (error) {
        console.error(`Failed to fetch analytics for ${platform} post ${postId}:`, error.response?.data || error.message);
        // Don't throw, just return null so the UI can handle it gracefully
        return null;
    }
};

import axios from 'axios';
import config from '../config/env.js';

const FB_API_URL = 'https://graph.facebook.com/v19.0';

export const getMetaAuthUrl = (stateId) => {
    // Generate URL for user to grant permissions
    const scopes = [
        'pages_show_list',
        'pages_read_engagement',
        'pages_manage_posts',
        'instagram_basic',
        'instagram_content_publish',
        'public_profile'
    ].join(',');

    // stateId is typically the user's JWT or DB ID to verify who initiated the flow
    return `https://www.facebook.com/v19.0/dialog/oauth?client_id=${config.facebook.appId}&redirect_uri=${config.facebook.redirectUri}&state=${stateId}&scope=${scopes}`;
};

export const exchangeCodeForToken = async (code) => {
    // Exchanges auth code for user access token
    const url = `${FB_API_URL}/oauth/access_token`;
    const response = await axios.get(url, {
        params: {
            client_id: config.facebook.appId,
            client_secret: config.facebook.appSecret,
            redirect_uri: config.facebook.redirectUri,
            code: code,
        }
    });
    return response.data.access_token;
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

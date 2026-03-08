import express from 'express';
import mongoose from 'mongoose';
import axios from 'axios';
import { protect } from '../middleware/auth.js';
import SocialAccount from '../models/SocialAccount.js';
import {
    getMetaAuthUrl,
    exchangeCodeForToken,
    fetchUserPagesAndIgAccounts,
    publishToFacebook,
    publishToInstagram,
    getLinkedInAuthUrl,
    exchangeLinkedInCodeForToken,
    fetchLinkedInProfile,
    publishToLinkedIn,
    fetchRecentPosts,
    fetchPostAnalytics
} from '../services/socialService.js';
import config from '../config/env.js';
import { uploadToS3 } from '../utils/s3.js';

const router = express.Router();
const FB_API_URL = 'https://graph.facebook.com/v22.0';

/**
 * @route   GET /api/social/auth/:platform
 * @desc    Initiate Social OAuth flow (facebook or instagram)
 * @access  Private
 */
router.get('/auth/:platform', protect, (req, res) => {
    try {
        const { platform } = req.params;
        if (platform !== 'facebook' && platform !== 'instagram' && platform !== 'linkedin') {
            return res.status(400).json({ success: false, error: 'Invalid platform' });
        }

        // Pass user ID, platform, and the requesting origin as state to track where to redirect back
        const origin = req.headers.origin || config.frontendUrl[0];
        const state = `${req.user._id.toString()}:${platform}:${Buffer.from(origin).toString('base64')}`;

        const authUrl = platform === 'linkedin' ? getLinkedInAuthUrl(state) : getMetaAuthUrl(state, platform);
        res.json({ success: true, authUrl });
    } catch (error) {
        console.error('Social Auth URL error:', error);
        res.status(500).json({ success: false, error: 'Failed to generate auth URL' });
    }
});

/**
 * @route   GET /api/social/auth/facebook/callback
 * @desc    Handle Meta OAuth callback
 * @access  Public (Redirected by Meta, but state contains user ID)
 */
router.get('/auth/facebook/callback', async (req, res) => {
    const { code, state, error, error_description } = req.query;

    let targetFrontend = config.frontendUrl[0];

    try {
        if (state) {
            const parts = state.split(':');
            if (parts.length >= 3) {
                targetFrontend = Buffer.from(parts[2], 'base64').toString('ascii');
            }
        }
    } catch (e) {
        console.error('Failed to parse origin from state', e);
    }

    if (error) {
        console.error('Meta OAuth Error:', error, error_description);
        return res.redirect(`${targetFrontend}/integrations?social=error`);
    }

    if (!code || !state) {
        return res.redirect(`${targetFrontend}/integrations?social=invalid_request`);
    }

    try {
        // State is "userId:platform:originBase64"
        const [userId, platform] = state.split(':');
        const activePlatform = platform || 'facebook';

        // Exchange code for access token
        const userAccessToken = await exchangeCodeForToken(code, activePlatform);

        // Ensure user is valid
        const userExists = await mongoose.model('User').findById(userId);
        if (!userExists) {
            return res.redirect(`${targetFrontend}/integrations?social=user_not_found`);
        }

        // Fetch User Pages and (if applicable) Instagram Accounts
        const accounts = await fetchUserPagesAndIgAccounts(userAccessToken);

        if (accounts.length === 0) {
            console.warn(`No Meta accounts found for user ${userId}`);
            return res.redirect(`${targetFrontend}/integrations?social=no_accounts_found`);
        }

        // Upsert ALL accounts (both Facebook Pages and linked Instagram accounts)
        // Since the Meta dialog authorizes both simultaneously, missing out on one is confusing.
        for (const account of accounts) {
            await SocialAccount.findOneAndUpdate(
                { user: userId, platform: account.platform, accountId: account.accountId },
                { ...account, user: userId, isActive: true },
                { upsert: true, new: true }
            );
        }

        res.redirect(`${targetFrontend}/integrations?social=success&platform=${activePlatform}`);
    } catch (error) {
        console.error('Meta Callback processing error:', error.response?.data || error.message);

        let errorDetails = error.message || 'Unknown Error';
        if (error.response?.data?.error?.message) {
            errorDetails = error.response.data.error.message;
        } else if (error.response?.data) {
            errorDetails = JSON.stringify(error.response.data);
        }

        res.redirect(`${targetFrontend}/integrations?social=processing_failed&details=${encodeURIComponent(errorDetails)}`);
    }
});

/**
 * @route   GET /api/social/auth/linkedin/callback
 * @desc    Handle LinkedIn OAuth callback
 * @access  Public
 */
router.get('/auth/linkedin/callback', async (req, res) => {
    const { code, state, error, error_description } = req.query;
    let targetFrontend = config.frontendUrl[0];

    try {
        if (state) {
            const parts = state.split(':');
            if (parts.length >= 3) {
                targetFrontend = Buffer.from(parts[2], 'base64').toString('ascii');
            }
        }
    } catch (e) {
        console.error('Failed to parse origin from state', e);
    }

    if (error) {
        console.error('LinkedIn OAuth Error:', error, error_description);
        return res.redirect(`${targetFrontend}/integrations?social=error&platform=linkedin`);
    }

    try {
        const [userId] = state.split(':');
        const tokenData = await exchangeLinkedInCodeForToken(code);
        const profile = await fetchLinkedInProfile(tokenData.access_token);

        await SocialAccount.findOneAndUpdate(
            { user: userId, platform: 'linkedin', accountId: profile.id },
            {
                user: userId,
                platform: 'linkedin',
                accountId: profile.id,
                accountName: `${profile.localizedFirstName} ${profile.localizedLastName}`,
                accessToken: tokenData.access_token,
                isActive: true
            },
            { upsert: true, new: true }
        );

        res.redirect(`${targetFrontend}/integrations?social=success&platform=linkedin`);
    } catch (error) {
        console.error('LinkedIn Callback Error:', error);
        res.redirect(`${targetFrontend}/integrations?social=processing_failed&platform=linkedin`);
    }
});

/**
 * @route   GET /api/social/accounts
 * @desc    Get all connected social accounts for the user
 * @access  Private
 */
router.get('/accounts', protect, async (req, res) => {
    try {
        const accounts = await SocialAccount.find({ user: req.user._id, isActive: true })
            .select('-accessToken -refreshToken');
        res.json({ success: true, data: accounts });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Server error fetching social accounts' });
    }
});

/**
 * @route   DELETE /api/social/accounts/:id
 * @desc    Disconnect a social account
 * @access  Private
 */
router.delete('/accounts/:id', protect, async (req, res) => {
    try {
        const account = await SocialAccount.findOne({ _id: req.params.id, user: req.user._id });
        if (!account) {
            return res.status(404).json({ success: false, error: 'Account not found' });
        }

        account.isActive = false;
        // Keep the old token but mark as inactive so validation doesn't fail
        await account.save();

        res.json({ success: true, message: 'Account disconnected successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Server error disconnecting account' });
    }
});

/**
 * @route   POST /api/social/publish
 * @desc    Publish content to selected social accounts
 * @access  Private
 */
router.post('/publish', protect, async (req, res) => {
    const { accountIds, text, imageUrl } = req.body;

    if (!accountIds || accountIds.length === 0 || !text) {
        return res.status(400).json({ success: false, error: 'Please provide text and select at least one account' });
    }

    // Ensure imageUrl is an absolute URL if it is provided and relative
    let absoluteImageUrl = imageUrl;
    if (imageUrl && !imageUrl.startsWith('http')) {
        if (imageUrl.startsWith('data:')) {
            console.log('[SOCIAL] Image is a data URI (base64) - Uploading to S3 fallback');
            try {
                // Determine userId for the folder structure
                const userId = req.user._id;
                const s3Url = await uploadToS3(imageUrl, `social-fallback/${userId}/${Date.now()}.png`);
                absoluteImageUrl = s3Url;
                console.log(`[SOCIAL] Fallback S3 Upload Success: ${absoluteImageUrl}`);
            } catch (s3Err) {
                console.error('[SOCIAL] Fallback S3 Upload Failed:', s3Err.message);
                // absoluteImageUrl remains base64, Meta will likely reject
            }
        } else {
            const baseUrl = (config.backendUrl || '').replace(/\/$/, '');
            const path = imageUrl.startsWith('/') ? imageUrl : `/${imageUrl}`;
            absoluteImageUrl = `${baseUrl}${path}`;
            console.log(`[SOCIAL] Transformed relative URL to absolute: ${absoluteImageUrl}`);
        }
    } else if (imageUrl) {
        console.log(`[SOCIAL] Using provided absolute URL: ${imageUrl}`);
    }

    try {
        // Find all selected active accounts for this user
        const accounts = await SocialAccount.find({
            _id: { $in: accountIds },
            user: req.user._id,
            isActive: true
        });

        if (accounts.length === 0) {
            return res.status(400).json({ success: false, error: 'No valid connected accounts selected' });
        }

        const results = [];
        // Process sequentially or using Promise.allSettled
        for (const account of accounts) {
            try {
                // Log what we are about to do
                console.log(`[SOCIAL] Publishing to ${account.platform} (${account.accountName}) - Image: ${absoluteImageUrl || 'None'}`);

                // Debug Meta tokens: check if the stored token actually has the requested permissions
                if (account.platform === 'facebook' || account.platform === 'instagram') {
                    try {
                        const debugRes = await axios.get(`${FB_API_URL}/me/permissions`, {
                            params: { access_token: account.accessToken }
                        });
                        console.log(`[DEBUG] Meta Token permissions for ${account.accountName} (${account.platform}):`,
                            debugRes.data.data.filter(p => p.status === 'granted').map(p => p.permission).join(', ')
                        );
                    } catch (debugErr) {
                        console.warn(`[DEBUG] Could not fetch permissions for ${account.accountName}:`, debugErr.message);
                    }
                }

                let postId = null;

                if (account.platform === 'facebook') {
                    postId = await publishToFacebook(account.accountId, account.accessToken, text, absoluteImageUrl);
                } else if (account.platform === 'instagram') {
                    postId = await publishToInstagram(account.accountId, account.accessToken, text, absoluteImageUrl);
                } else if (account.platform === 'linkedin') {
                    postId = await publishToLinkedIn(account.accountId, account.accessToken, text, absoluteImageUrl);
                }

                results.push({
                    accountId: account._id,
                    accountName: account.accountName,
                    platform: account.platform,
                    status: 'success',
                    postId
                });
            } catch (err) {
                console.error(`Error publishing to ${account.platform} (${account.accountName}):`, err.message);
                results.push({
                    accountId: account._id,
                    accountName: account.accountName,
                    platform: account.platform,
                    status: 'error',
                    error: err.message
                });
            }
        }

        res.json({ success: true, results });

    } catch (error) {
        console.error('Publish API Error:', error);
        res.status(500).json({ success: false, error: 'Server error during publishing' });
    }
});

/**
 * @route   GET /api/social/accounts/:id/posts
 * @desc    Get recent posts for a specific social account
 * @access  Private
 */
router.get('/accounts/:id/posts', protect, async (req, res) => {
    try {
        const account = await SocialAccount.findOne({ _id: req.params.id, user: req.user._id });
        if (!account) {
            return res.status(404).json({ success: false, error: 'Account not found' });
        }

        const posts = await fetchRecentPosts(account.accountId, account.accessToken, account.platform);
        res.json({ success: true, data: posts });
    } catch (error) {
        console.error('Fetch posts error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route   GET /api/social/accounts/:id/posts/:postId/insights
 * @desc    Get insights for a specific post
 * @access  Private
 */
router.get('/accounts/:id/posts/:postId/insights', protect, async (req, res) => {
    try {
        const account = await SocialAccount.findOne({ _id: req.params.id, user: req.user._id });
        if (!account) {
            return res.status(404).json({ success: false, error: 'Account not found' });
        }

        const insights = await fetchPostAnalytics(req.params.postId, account.accessToken, account.platform);
        res.json({ success: true, data: insights });
    } catch (error) {
        console.error('Fetch insights error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});


/**
 * @route   ANY /api/social/delete-data
 * @desc    Meta Data Deletion Callback Webhook
 * @access  Public
 */
router.all('/delete-data', (req, res) => {
    // A robust implementation requires decoding the 'signed_request' from Meta
    // and deleting the user's data.

    if (req.method === 'GET') {
        // If meta or user visits via GET, redirect to the informational page
        return res.redirect(`${config.frontendUrl}/data-deletion`);
    }

    const confirmationCode = `deleted-${Date.now()}`;
    res.json({
        url: `${config.frontendUrl}/data-deletion-status?code=${confirmationCode}`,
        confirmation_code: confirmationCode
    });
});

export default router;

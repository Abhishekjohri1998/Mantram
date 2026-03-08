import express from 'express';
import { protect } from '../middleware/auth.js';
import SocialAccount from '../models/SocialAccount.js';
import {
    getMetaAuthUrl,
    exchangeCodeForToken,
    fetchUserPagesAndIgAccounts,
    publishToFacebook,
    publishToInstagram,
    fetchRecentPosts,
    fetchPostAnalytics
} from '../services/socialService.js';
import config from '../config/env.js';

const router = express.Router();

/**
 * @route   GET /api/social/auth/:platform
 * @desc    Initiate Social OAuth flow (facebook or instagram)
 * @access  Private
 */
router.get('/auth/:platform', protect, (req, res) => {
    try {
        const { platform } = req.params;
        if (platform !== 'facebook' && platform !== 'instagram') {
            return res.status(400).json({ success: false, error: 'Invalid platform' });
        }

        // Pass user ID and platform as state to track who initiated and which app to use
        const state = `${req.user._id.toString()}:${platform}`;
        const authUrl = getMetaAuthUrl(state, platform);
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

    if (error) {
        console.error('Meta OAuth Error:', error, error_description);
        return res.redirect(`${config.frontendUrl[0]}/integrations?social=error`);
    }

    if (!code || !state) {
        return res.redirect(`${config.frontendUrl[0]}/integrations?social=invalid_request`);
    }

    try {
        // State is "userId:platform"
        const [userId, platform] = state.split(':');
        const activePlatform = platform || 'facebook';

        // Exchange code for access token
        const tokenData = await exchangeCodeForToken(code, config.facebook.redirectUri, activePlatform);

        // Ensure user is valid
        const userExists = await mongoose.model('User').findById(userId);
        if (!userExists) {
            return res.redirect(`${config.frontendUrl[0]}/integrations?social=user_not_found`);
        }

        // Fetch User Pages and (if applicable) Instagram Accounts
        const pagesData = await fetchUserPagesAndIgAccounts(tokenData.access_token);

        // Save accounts to database
        const accountsToSave = [];

        // Common profile picture if available
        const profilePic = pagesData.picture?.data?.url || '';

        // Handle Facebook Pages
        if (activePlatform === 'facebook' || !platform) {
            for (const page of pagesData.accounts?.data || []) {
                accountsToSave.push({
                    user: userId,
                    platform: 'facebook',
                    accountId: page.id,
                    username: page.name,
                    accessToken: page.access_token, // Page-specific token
                    profileUrl: `https://facebook.com/${page.id}`,
                    avatarUrl: profilePic,
                    status: 'active'
                });
            }
        }

        // Handle Instagram Accounts
        if (activePlatform === 'instagram' || !platform) {
            for (const page of pagesData.accounts?.data || []) {
                if (page.instagram_business_account) {
                    accountsToSave.push({
                        user: userId,
                        platform: 'instagram',
                        accountId: page.instagram_business_account.id,
                        username: page.name, // Usually page name unless we fetch IG specific details
                        accessToken: page.access_token, // Page token is used for IG Graph API
                        profileUrl: `https://instagram.com/`,
                        avatarUrl: profilePic,
                        status: 'active'
                    });
                }
            }
        }

        if (accountsToSave.length === 0) {
            console.warn(`No active ${activePlatform} accounts found for user ${userId}`);
            return res.redirect(`${config.frontendUrl[0]}/integrations?social=no_accounts_found`);
        }

        // Upsert accounts
        for (const account of accountsToSave) {
            await SocialAccount.findOneAndUpdate(
                { user: userId, platform: account.platform, accountId: account.accountId },
                account,
                { upsert: true, new: true }
            );
        }

        res.redirect(`${config.frontendUrl[0]}/integrations?social=success&platform=${activePlatform}`);
    } catch (error) {
        console.error('Meta Callback processing error:', error.response?.data || error.message);
        res.redirect(`${config.frontendUrl[0]}/integrations?social=processing_failed`);
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
        // Optionally nullify tokens
        account.accessToken = '';
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
                let postId = null;

                if (account.platform === 'facebook') {
                    postId = await publishToFacebook(account.accountId, account.accessToken, text, imageUrl);
                } else if (account.platform === 'instagram') {
                    postId = await publishToInstagram(account.accountId, account.accessToken, text, imageUrl);
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

import express from 'express';
import { protect } from '../middleware/auth.js';
import SocialAccount from '../models/SocialAccount.js';
import {
    getMetaAuthUrl,
    exchangeCodeForToken,
    fetchUserPagesAndIgAccounts,
    publishToFacebook,
    publishToInstagram
} from '../services/socialService.js';
import config from '../config/env.js';

const router = express.Router();

/**
 * @route   GET /api/social/auth/facebook
 * @desc    Initiate Facebook OAuth flow
 * @access  Private
 */
router.get('/auth/facebook', protect, (req, res) => {
    try {
        // Pass user ID as state to track who initiated
        const authUrl = getMetaAuthUrl(req.user._id.toString());
        res.json({ success: true, authUrl });
    } catch (error) {
        console.error('FB Auth URL error:', error);
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
        return res.redirect(`${config.frontendUrl}/settings?social=error`);
    }

    if (!code || !state) {
        return res.redirect(`${config.frontendUrl}/settings?social=invalid_request`);
    }

    try {
        const userId = state;

        // 1. Get user access token
        const userAccessToken = await exchangeCodeForToken(code);

        // 2. Fetch pages and IG accounts
        const accounts = await fetchUserPagesAndIgAccounts(userAccessToken);

        // 3. Save to database
        const savedAccounts = [];
        for (const account of accounts) {
            // Upsert the social account
            const updatedAcc = await SocialAccount.findOneAndUpdate(
                { user: userId, platform: account.platform, accountId: account.accountId },
                { ...account, user: userId, isActive: true },
                { new: true, upsert: true }
            );
            savedAccounts.push(updatedAcc);
        }

        // Redirect back to frontend
        return res.redirect(`${config.frontendUrl}/settings?social=success_facebook`);

    } catch (err) {
        console.error('Meta Callback Error:', err);
        return res.redirect(`${config.frontendUrl}/settings?social=error_fetching_accounts`);
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
 * @route   POST /api/social/delete-data
 * @desc    Meta Data Deletion Callback Webhook
 * @access  Public
 */
router.post('/delete-data', (req, res) => {
    // A robust implementation requires decoding the 'signed_request' from Meta
    // and deleting the user's data. Currently stubbed to return standard success.
    // Since we opted for Option A (email link), this endpoint is just a fallback.
    const confirmationCode = `deleted-${Date.now()}`;
    res.json({ url: `${config.frontendUrl}/data-deletion-status?code=${confirmationCode}`, confirmation_code: confirmationCode });
});

export default router;

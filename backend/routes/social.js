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

        // Pass user ID, platform, and the requesting origin as state to track where to redirect back.
        // req.headers.origin might be missing on some devices/browsers, use referer as fallback.
        let origin = req.headers.origin;
        if (!origin && req.headers.referer) {
            try {
                const refUrl = new URL(req.headers.referer);
                origin = `${refUrl.protocol}//${refUrl.host}`;
            } catch (e) { /* ignore invalid referer */ }
        }
        if (!origin) origin = config.frontendUrl[0];

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
        console.warn('[SOCIAL] Meta Callback missing code or state:', { hasCode: !!code, hasState: !!state });
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
 * @route   POST /api/social/generate-caption
 * @desc    AI-generate platform-specific captions from image + brand context
 * @access  Private
 */
router.post('/generate-caption', protect, async (req, res) => {
    try {
        const { imageUrl, platforms, brandId, userBrief } = req.body;

        if (!platforms || platforms.length === 0) {
            return res.status(400).json({ success: false, error: 'At least one platform is required' });
        }

        // Load brand for voice/style context
        const Brand = mongoose.model('Brand');
        const brand = brandId ? await Brand.findById(brandId) : null;

        // Build brand context string
        let brandContext = '';
        if (brand) {
            const dna = brand.dna || {};
            brandContext = `\nBRAND CONTEXT:
- Brand Name: ${brand.name}
- Industry: ${dna.industry || 'General'}
- Brand Voice: ${dna.voice?.personality || 'Professional, friendly'}
- Target Audience: ${dna.targetAudience || 'General audience'}
- Tone: ${dna.voice?.tone || 'Engaging'}`;
            if (dna.contentStyle?.dos?.length) {
                brandContext += `\n- Content Style: ${dna.contentStyle.dos.slice(0, 3).join(', ')}`;
            }
        }

        // Platform-specific instructions
        const platformGuides = {
            instagram: `INSTAGRAM CAPTION: Write an engaging, emoji-rich Instagram caption. Include 5-8 relevant hashtags at the end. Keep it conversational and scroll-stopping. Use line breaks for readability. Start with a hook.`,
            facebook: `FACEBOOK POST: Write a conversational Facebook post. Keep it warm and shareable. Can be slightly longer than Instagram. Use 1-2 emojis max. Include a call-to-action (like, comment, share). No hashtags unless very relevant (max 2).`,
            linkedin: `LINKEDIN POST: Write a professional LinkedIn post. Keep it insightful and value-driven. Use a storytelling format. No excessive emojis (1-2 max). Include a thought-provoking question or CTA at the end. No hashtags in the body, add 3-5 relevant ones at the very end.`,
        };

        // Build the AI prompt
        const uniquePlatforms = [...new Set(platforms)];
        const platformInstructions = uniquePlatforms
            .map(p => platformGuides[p] || `${p.toUpperCase()} POST: Write an engaging post for ${p}.`)
            .join('\n\n');

        const systemPrompt = `You are a social media expert and brand copywriter. Generate platform-specific captions for a social media post.
${brandContext}

${userBrief ? `USER BRIEF: ${userBrief}` : 'No specific brief provided — analyze the image and write compelling captions.'}

Generate a SEPARATE caption for EACH platform below. Each caption must be tailored to that platform's best practices, audience expectations, and format.

${platformInstructions}

RESPOND IN VALID JSON FORMAT ONLY:
{"captions":{"platform_name":"caption text here"}}

Do not include any text outside the JSON. Do not wrap in markdown code blocks.`;

        // Use Gemini with vision to analyze image + generate captions
        const imageKey = process.env.GEMINI_IMAGE_API_KEY || process.env.GEMINI_API_KEY;
        if (!imageKey) {
            return res.status(500).json({ success: false, error: 'Gemini API key not configured' });
        }

        const parts = [];

        // If image URL is provided, fetch and include it for vision analysis
        if (imageUrl && imageUrl.startsWith('http')) {
            try {
                console.log(`[CAPTION] Fetching image for vision analysis: ${imageUrl.substring(0, 80)}...`);
                const imgResp = await fetch(imageUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'image/*' },
                    redirect: 'follow',
                });
                if (imgResp.ok) {
                    const buf = await imgResp.arrayBuffer();
                    const ct = (imgResp.headers.get('content-type') || 'image/jpeg').split(';')[0];
                    parts.push({
                        inlineData: {
                            mimeType: ct,
                            data: Buffer.from(buf).toString('base64')
                        }
                    });
                    console.log(`[CAPTION] Image loaded for analysis (${Math.round(buf.byteLength / 1024)}KB)`);
                }
            } catch (imgErr) {
                console.warn('[CAPTION] Could not fetch image for analysis:', imgErr.message);
            }
        }

        parts.push({ text: systemPrompt });

        // Call Gemini for caption generation (text-only response)
        const models = ['gemini-2.5-flash', 'gemini-2.0-flash-001'];
        let captionsResult = null;

        for (const modelId of models) {
            try {
                console.log(`[CAPTION] Trying model: ${modelId}...`);
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${imageKey}`;
                const resp = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts }],
                        generationConfig: {
                            responseMimeType: 'application/json',
                            temperature: 0.7,
                            maxOutputTokens: 2048,
                        },
                    }),
                });
                const data = await resp.json();
                if (data.error) {
                    console.error(`[CAPTION] Model ${modelId} error:`, data.error.message);
                    continue;
                }

                const textParts = data.candidates?.[0]?.content?.parts || [];
                let rawText = textParts.map(p => p.text || '').join('').trim();

                // Strip markdown code fences if present
                rawText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

                try {
                    captionsResult = JSON.parse(rawText);
                    console.log(`[CAPTION] Successfully generated captions with ${modelId}`);
                    break;
                } catch (parseErr) {
                    console.warn(`[CAPTION] Failed to parse JSON from ${modelId}:`, rawText.substring(0, 200));
                    continue;
                }
            } catch (e) {
                console.error(`[CAPTION] Model ${modelId} exception:`, e.message);
                continue;
            }
        }

        if (!captionsResult?.captions) {
            return res.status(500).json({ success: false, error: 'Failed to generate captions' });
        }

        res.json({ success: true, captions: captionsResult.captions });

    } catch (error) {
        console.error('[CAPTION] Generate caption error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route   POST /api/social/publish
 * @desc    Publish content to selected social accounts
 * @access  Private
 */
router.post('/publish', protect, async (req, res) => {
    const { accountIds, text, imageUrl, captions } = req.body;

    if (!accountIds || accountIds.length === 0 || (!text && !captions)) {
        return res.status(400).json({ success: false, error: 'Please provide text/captions and select at least one account' });
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
                // Use platform-specific caption if available, fallback to generic text
                const postText = captions?.[account.platform] || text || '';

                // Log what we are about to do
                console.log(`[SOCIAL] Publishing to ${account.platform} (${account.accountName}) - Caption: ${postText.substring(0, 80)}... - Image: ${absoluteImageUrl || 'None'}`);

                let postId = null;

                if (account.platform === 'facebook') {
                    postId = await publishToFacebook(account.accountId, account.accessToken, postText, absoluteImageUrl);
                } else if (account.platform === 'instagram') {
                    postId = await publishToInstagram(account.accountId, account.accessToken, postText, absoluteImageUrl);
                } else if (account.platform === 'linkedin') {
                    postId = await publishToLinkedIn(account.accountId, account.accessToken, postText, absoluteImageUrl);
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

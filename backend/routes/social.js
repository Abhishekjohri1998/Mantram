import express from 'express';
import mongoose from 'mongoose';
import axios from 'axios';
import crypto from 'crypto';
import { protect } from '../middleware/auth.js';
import SocialAccount from '../models/SocialAccount.js';
import SocialPost from '../models/SocialPost.js';
import {
    getMetaAuthUrl,
    exchangeCodeForToken,
    fetchUserPagesAndIgAccounts,
    publishToFacebook,
    publishToInstagram,
    publishCarouselToInstagram,
    publishCarouselToFacebook,
    getLinkedInAuthUrl,
    exchangeLinkedInCodeForToken,
    fetchLinkedInProfile,
    publishToLinkedIn,
    publishCarouselToLinkedIn,
    fetchRecentPosts,
    fetchPostAnalytics
} from '../services/socialService.js';
import config from '../config/env.js';
import { uploadToS3, mirrorUrlToS3, getSignedUrlIfNeeded } from '../utils/s3.js';
import { safeErrorMessage } from '../utils/safeError.js';

const router = express.Router();
const FB_API_URL = 'https://graph.facebook.com/v22.0';

// BUG-3 FIX: Sign OAuth state with HMAC to prevent tampering
function signState(payload) {
    const secret = config.jwtSecret || 'dev-secret';
    const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex').substring(0, 16);
    return `${payload}:${hmac}`;
}
function verifyState(signedState) {
    const parts = signedState.split(':');
    if (parts.length < 4) return null; // userId:platform:origin:hmac
    const hmac = parts.pop();
    const payload = parts.join(':');
    const secret = config.jwtSecret || 'dev-secret';
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex').substring(0, 16);
    if (hmac !== expected) return null;
    return parts; // [userId, platform, originBase64]
}
// BUG-10 FIX: Validate redirect URL against whitelist
function getSafeRedirectUrl(base64Origin) {
    try {
        const decoded = Buffer.from(base64Origin, 'base64').toString('ascii');
        const cleanDecoded = decoded.toLowerCase().replace(/\/$/, '');
        const allowed = config.frontendUrl.map(u => u.toLowerCase().replace(/\/$/, ''));
        if (allowed.includes(cleanDecoded)) return decoded;
    } catch { /* ignore */ }
    return config.frontendUrl[0];
}

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

        const state = signState(`${req.user._id.toString()}:${platform}:${Buffer.from(origin).toString('base64')}`);

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
                targetFrontend = getSafeRedirectUrl(parts[2]);
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
        // BUG-3 FIX: Verify HMAC on state to prevent userId tampering
        const verifiedParts = verifyState(state);
        if (!verifiedParts) {
            console.warn('[SOCIAL] Meta Callback state HMAC verification failed');
            return res.redirect(`${targetFrontend}/integrations?social=invalid_state`);
        }
        const [userId, platform] = verifiedParts;
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
                { upsert: true, returnDocument: 'after' }
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
                targetFrontend = getSafeRedirectUrl(parts[2]);
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
        // BUG-3 FIX: Verify HMAC on state
        const verifiedParts = verifyState(state);
        if (!verifiedParts) {
            return res.redirect(`${targetFrontend}/integrations?social=invalid_state&platform=linkedin`);
        }
        const [userId] = verifiedParts;
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
            { upsert: true, returnDocument: 'after' }
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
        const imageKey = config.ai?.providers?.gemini?.imageApiKey || config.ai?.providers?.gemini?.apiKey;
        if (!imageKey) {

            return res.status(500).json({ success: false, error: 'Gemini API key not configured' });
        }

        const parts = [];
        // If image URL is provided, include it for vision analysis
        let normalizedImageUrl = imageUrl;

        // Handle base64 data URIs directly (no need to fetch)
        if (imageUrl && imageUrl.startsWith('data:')) {
            try {
                const match = imageUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
                if (match) {
                    parts.push({
                        inlineData: {
                            mimeType: match[1],
                            data: match[2]
                        }
                    });
                    console.log(`[CAPTION] Image loaded from data URI (${match[1]}, ${Math.round(match[2].length * 0.75 / 1024)}KB)`);
                }
            } catch (e) {
                console.warn('[CAPTION] Failed to parse data URI:', e.message);
            }
        } else {
            // Normalize relative URLs
            if (imageUrl && !imageUrl.startsWith('http')) {
                const baseUrl = (config.backendUrl || 'https://api.mantram.ai').replace(/\/$/, '');
                normalizedImageUrl = `${baseUrl}${imageUrl.startsWith('/') ? imageUrl : '/' + imageUrl}`;
                console.log(`[CAPTION] Normalized relative URL: ${normalizedImageUrl}`);
            }

            if (normalizedImageUrl && normalizedImageUrl.startsWith('http')) {
                try {
                    console.log(`[CAPTION] Fetching image for vision analysis: ${normalizedImageUrl.substring(0, 80)}...`);
                    const imgResp = await fetch(normalizedImageUrl, {
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
                    } else {
                        console.warn(`[CAPTION] Image fetch failed (${imgResp.status}):`, normalizedImageUrl);
                    }
                } catch (imgErr) {
                    console.warn('[CAPTION] Could not fetch image for analysis:', imgErr.message);
                }
            }
        }

        parts.push({ text: systemPrompt });

        // Call Gemini for caption generation (text-only response)
        const models = ['gemini-2.5-flash', 'gemini-2.5-pro'];
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

        // Normalize keys to lowercase platform names (AI may return "Instagram" vs "instagram")
        const normalized = {};
        for (const [key, val] of Object.entries(captionsResult.captions)) {
            const lower = key.toLowerCase().replace(/[^a-z]/g, '');
            // Map common variations to canonical platform keys
            const canonical = lower.startsWith('instagram') ? 'instagram'
                : lower.startsWith('facebook') ? 'facebook'
                    : lower.startsWith('linkedin') ? 'linkedin'
                        : lower.startsWith('twitter') ? 'twitter'
                            : lower;
            normalized[canonical] = val;
        }
        console.log(`[CAPTION] Normalized keys: ${Object.keys(normalized).join(', ')}`);

        res.json({ success: true, captions: normalized });

    } catch (error) {
        console.error('[CAPTION] Generate caption error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

/**
 * @route   POST /api/social/publish
 * @desc    Publish content to selected social accounts
 * @access  Private
 */
router.post('/publish', protect, async (req, res) => {
    const { accountIds, text, imageUrl, imageUrls, captions } = req.body;

    if (!accountIds || accountIds.length === 0 || (!text && !captions)) {
        return res.status(400).json({ success: false, error: 'Please provide text/captions and select at least one account' });
    }

    // Determine if this is a carousel (multi-image) or single-image publish
    const isCarousel = Array.isArray(imageUrls) && imageUrls.length > 1;
    console.log(`[SOCIAL] Publish mode: ${isCarousel ? `CAROUSEL (${imageUrls.length} images)` : 'SINGLE IMAGE'}`);

    // For single-image: ensure URL is absolute
    let absoluteImageUrl = imageUrl;
    if (!isCarousel && imageUrl && !imageUrl.startsWith('http')) {
        if (imageUrl.startsWith('data:')) {
            console.log('[SOCIAL] Image is a data URI (base64) - Uploading to S3 fallback');
            try {
                const userId = req.user._id;
                const s3Url = await uploadToS3(imageUrl, `social-fallback/${userId}/${Date.now()}.png`);
                absoluteImageUrl = s3Url;
                console.log(`[SOCIAL] Fallback S3 Upload Success: ${absoluteImageUrl}`);
            } catch (s3Err) {
                console.error('[SOCIAL] Fallback S3 Upload Failed:', s3Err.message);
            }
        } else {
            const baseUrl = (config.backendUrl || '').replace(/\/$/, '');
            const path = imageUrl.startsWith('/') ? imageUrl : `/${imageUrl}`;
            absoluteImageUrl = `${baseUrl}${path}`;
            console.log(`[SOCIAL] Transformed relative URL to absolute: ${absoluteImageUrl}`);
        }
    } else if (!isCarousel && imageUrl) {
        console.log(`[SOCIAL] Using provided absolute URL: ${imageUrl}`);
        // Mirror external URLs to S3 for persistence
        if (!imageUrl.includes('s3.amazonaws.com') || !imageUrl.includes(process.env.AWS_S3_BUCKET)) {
            const s3Url = await mirrorUrlToS3(imageUrl, `social-posts/${req.user._id}/${Date.now()}.png`);
            if (s3Url) absoluteImageUrl = s3Url;
        }
    }

    // For carousel: resolve all URLs to absolute (upload data: URIs to S3 if possible)
    let carouselUrls = [];
    if (isCarousel) {
        for (const url of imageUrls) {
            if (!url) continue;
            if (url.startsWith('http')) {
                // Mirror external URLs to S3
                if (!url.includes('s3.amazonaws.com') || !url.includes(process.env.AWS_S3_BUCKET)) {
                    const s3Url = await mirrorUrlToS3(url, `social-carousel/${req.user._id}/${Date.now()}-${carouselUrls.length}.png`);
                    carouselUrls.push(s3Url || url);
                } else {
                    carouselUrls.push(url);
                }
            } else if (url.startsWith('data:')) {
                try {
                    const userId = req.user._id;
                    const s3Url = await uploadToS3(url, `social-carousel/${userId}/${Date.now()}-${carouselUrls.length}.png`);
                    carouselUrls.push(s3Url);
                    console.log(`[SOCIAL] Carousel data URI uploaded to S3: ${s3Url.substring(0, 60)}...`);
                } catch (s3Err) {
                    console.warn(`[SOCIAL] Carousel S3 upload failed, keeping data URI: ${s3Err.message}`);
                    carouselUrls.push(url); // Keep data URI as fallback
                }
            }
        }
        console.log(`[SOCIAL] Carousel URLs resolved: ${carouselUrls.length} valid of ${imageUrls.length} total`);
    }

    try {
        const accounts = await SocialAccount.find({
            _id: { $in: accountIds },
            user: req.user._id,
            isActive: true
        }).select('+accessToken');

        if (accounts.length === 0) {
            return res.status(400).json({ success: false, error: 'No valid connected accounts selected' });
        }

        const results = [];
        for (const account of accounts) {
            try {
                const postText = captions?.[account.platform] || text || '';
                console.log(`[SOCIAL] Publishing ${isCarousel ? 'carousel' : 'single'} to ${account.platform} (${account.accountName}) - Caption: ${postText.substring(0, 80)}...`);

                let postId = null;

                if (isCarousel && carouselUrls.length >= 2) {
                    // Carousel publish
                    if (account.platform === 'facebook') {
                        postId = await publishCarouselToFacebook(account.accountId, account.accessToken, postText, carouselUrls);
                    } else if (account.platform === 'instagram') {
                        postId = await publishCarouselToInstagram(account.accountId, account.accessToken, postText, carouselUrls);
                    } else if (account.platform === 'linkedin') {
                        postId = await publishCarouselToLinkedIn(account.accountId, account.accessToken, postText, carouselUrls);
                    }
                } else {
                    // Single image publish
                    if (account.platform === 'facebook') {
                        postId = await publishToFacebook(account.accountId, account.accessToken, postText, absoluteImageUrl);
                    } else if (account.platform === 'instagram') {
                        postId = await publishToInstagram(account.accountId, account.accessToken, postText, absoluteImageUrl);
                    } else if (account.platform === 'linkedin') {
                        postId = await publishToLinkedIn(account.accountId, account.accessToken, postText, absoluteImageUrl);
                    }
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

        // ── Save SocialPost records ──
        for (const r of results) {
            try {
                await SocialPost.create({
                    user: req.user._id,
                    brand: req.body.brandId || undefined,
                    platform: r.platform,
                    accountId: r.accountId?.toString() || '',
                    accountName: r.accountName,
                    caption: captions?.[r.platform] || text || '',
                    imageUrl: isCarousel ? carouselUrls[0] : (absoluteImageUrl || ''),
                    postId: r.postId || '',
                    status: r.status === 'success' ? 'published' : 'failed',
                    error: r.error || '',
                    publishedAt: r.status === 'success' ? new Date() : undefined,
                });
            } catch (saveErr) {
                console.error('[SOCIAL] Failed to save SocialPost record:', saveErr.message);
            }
        }

        const resultsWithSignedIndices = results.map(r => ({
            ...r,
            // (The published postId is returned, but the UI might want the signed URL)
        }));

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
        const account = await SocialAccount.findOne({ _id: req.params.id, user: req.user._id }).select('+accessToken');
        if (!account) {
            return res.status(404).json({ success: false, error: 'Account not found' });
        }

        const posts = await fetchRecentPosts(account.accountId, account.accessToken, account.platform);
        res.json({ success: true, data: posts });
    } catch (error) {
        console.error('Fetch posts error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

/**
 * @route   GET /api/social/accounts/:id/posts/:postId/insights
 * @desc    Get insights for a specific post
 * @access  Private
 */
router.get('/accounts/:id/posts/:postId/insights', protect, async (req, res) => {
    try {
        const account = await SocialAccount.findOne({ _id: req.params.id, user: req.user._id }).select('+accessToken');
        if (!account) {
            return res.status(404).json({ success: false, error: 'Account not found' });
        }

        const insights = await fetchPostAnalytics(req.params.postId, account.accessToken, account.platform);
        res.json({ success: true, data: insights });
    } catch (error) {
        console.error('Fetch insights error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


/**
 * @route   POST /api/social/schedule
 * @desc    Schedule content for future publishing
 * @access  Private
 */
router.post('/schedule', protect, async (req, res) => {
    const { accountIds, text, imageUrl, imageUrls, captions, scheduledFor, brandId } = req.body;

    if (!accountIds || accountIds.length === 0 || (!text && !captions)) {
        return res.status(400).json({ success: false, error: 'Please provide text/captions and select at least one account' });
    }
    if (!scheduledFor) {
        return res.status(400).json({ success: false, error: 'scheduledFor date is required' });
    }
    const scheduleDate = new Date(scheduledFor);
    if (scheduleDate <= new Date()) {
        return res.status(400).json({ success: false, error: 'Scheduled time must be in the future' });
    }

    try {
        const accounts = await SocialAccount.find({
            _id: { $in: accountIds },
            user: req.user._id,
            isActive: true
        });

        if (accounts.length === 0) {
            return res.status(400).json({ success: false, error: 'No valid connected accounts selected' });
        }

        const scheduled = [];
        for (const account of accounts) {
            const postCaption = captions?.[account.platform] || text || '';
            const record = await SocialPost.create({
                user: req.user._id,
                brand: brandId || undefined,
                platform: account.platform,
                accountId: account.accountId,
                accountName: account.accountName,
                caption: postCaption,
                imageUrl: imageUrl || (Array.isArray(imageUrls) ? imageUrls[0] : '') || '',
                imageUrls: Array.isArray(imageUrls) && imageUrls.length > 1 ? imageUrls : undefined,
                status: 'scheduled',
                scheduledFor: scheduleDate,
            });
            scheduled.push({
                _id: record._id,
                platform: account.platform,
                accountName: account.accountName,
                scheduledFor: scheduleDate,
            });
        }

        res.json({ success: true, scheduled });
    } catch (error) {
        console.error('Schedule API Error:', error);
        res.status(500).json({ success: false, error: 'Server error during scheduling' });
    }
});

/**
 * @route   GET /api/social/posts/history
 * @desc    Get all SocialPost records for the user
 * @access  Private
 */
router.get('/posts/history', protect, async (req, res) => {
    try {
        const filter = { user: req.user._id };
        if (req.query.status) filter.status = req.query.status;
        if (req.query.brand) filter.brand = req.query.brand;

        const posts = await SocialPost.find(filter)
            .sort({ createdAt: -1 })
            .limit(parseInt(req.query.limit) || 100);

        // Sign S3 URLs in history results
        const signedPosts = await Promise.all(posts.map(async (pt) => {
            const p = pt.toObject();
            if (p.imageUrl) p.imageUrl = await getSignedUrlIfNeeded(p.imageUrl);
            if (p.imageUrls) {
                p.imageUrls = await Promise.all(p.imageUrls.map(u => getSignedUrlIfNeeded(u)));
            }
            return p;
        }));

        res.json({ success: true, posts: signedPosts });
    } catch (error) {
        console.error('Post history error:', error);
        res.status(500).json({ success: false, error: 'Server error fetching post history' });
    }
});

/**
 * @route   PUT /api/social/posts/:id/cancel
 * @desc    Cancel a scheduled post
 * @access  Private
 */
router.put('/posts/:id/cancel', protect, async (req, res) => {
    try {
        const post = await SocialPost.findOne({ _id: req.params.id, user: req.user._id });
        if (!post) return res.status(404).json({ success: false, error: 'Post not found' });
        if (post.status !== 'scheduled') {
            return res.status(400).json({ success: false, error: 'Only scheduled posts can be cancelled' });
        }
        post.status = 'cancelled';
        await post.save();
        res.json({ success: true, message: 'Scheduled post cancelled' });
    } catch (error) {
        console.error('Cancel post error:', error);
        res.status(500).json({ success: false, error: 'Server error cancelling post' });
    }
});

/**
 * @route   GET /api/social/scheduled/diagnostic
 * @desc    Inspect scheduler health for the current user — counts by status,
 *          last 10 failed posts with their error reasons, and connected accounts.
 *          Useful when "I scheduled a post but nothing happened" — surfaces the
 *          actual failure reason that the publisher already wrote to post.error.
 * @access  Private
 */
router.get('/scheduled/diagnostic', protect, async (req, res) => {
    try {
        const userId = req.user._id;
        const [counts, recentFailed, recentScheduled, accounts] = await Promise.all([
            SocialPost.aggregate([
                { $match: { user: new mongoose.Types.ObjectId(userId) } },
                { $group: { _id: '$status', count: { $sum: 1 } } },
            ]),
            SocialPost.find({ user: userId, status: 'failed' })
                .sort({ updatedAt: -1 }).limit(10)
                .select('platform accountName scheduledFor error caption updatedAt'),
            SocialPost.find({ user: userId, status: 'scheduled' })
                .sort({ scheduledFor: 1 }).limit(10)
                .select('platform accountName scheduledFor caption'),
            SocialAccount.find({ user: userId })
                .select('platform accountName accountId isActive tokenExpiresAt'),
        ]);

        const now = new Date();
        const statusCounts = counts.reduce((acc, c) => ({ ...acc, [c._id]: c.count }), {});
        const overdue = await SocialPost.countDocuments({
            user: userId, status: 'scheduled', scheduledFor: { $lte: now },
        });

        res.json({
            success: true,
            now: now.toISOString(),
            statusCounts,
            overdueScheduled: overdue, // > 0 means scheduler isn't running, or is stuck
            accounts: accounts.map(a => ({
                platform: a.platform,
                accountName: a.accountName,
                accountId: a.accountId,
                isActive: a.isActive,
                tokenExpiresAt: a.tokenExpiresAt,
                tokenExpired: !!(a.tokenExpiresAt && a.tokenExpiresAt <= now),
            })),
            recentFailed,
            upcoming: recentScheduled,
        });
    } catch (error) {
        console.error('Scheduler diagnostic error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route   POST /api/social/posts/:id/retry
 * @desc    Manually retry a failed scheduled post — re-marks as scheduled and
 *          runs the publish path immediately (does not wait for the next 5-min tick).
 * @access  Private
 */
router.post('/posts/:id/retry', protect, async (req, res) => {
    try {
        const post = await SocialPost.findOne({ _id: req.params.id, user: req.user._id });
        if (!post) return res.status(404).json({ success: false, error: 'Post not found' });
        if (!['failed', 'scheduled'].includes(post.status)) {
            return res.status(400).json({ success: false, error: `Cannot retry a ${post.status} post` });
        }
        const { retryFailedPost } = await import('../services/scheduledPostPublisher.js');
        const updated = await retryFailedPost(post._id);
        res.json({
            success: true,
            post: {
                _id: updated._id,
                status: updated.status,
                postId: updated.postId,
                error: updated.error,
                publishedAt: updated.publishedAt,
            },
        });
    } catch (error) {
        console.error('Retry post error:', error);
        res.status(500).json({ success: false, error: error.message || 'Retry failed' });
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

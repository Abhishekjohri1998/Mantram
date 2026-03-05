/**
 * Social Media Routes
 * Handles OAuth connections, publishing, and scheduling for social platforms.
 */

import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import Integration from '../models/Integration.js';
import Content from '../models/Content.js';
import { publishToMultiplePlatforms } from '../services/socialPublisher.js';

const router = Router();

// OAuth config for each platform
const OAUTH_CONFIG = {
    facebook: {
        authUrl: 'https://www.facebook.com/v19.0/dialog/oauth',
        tokenUrl: 'https://graph.facebook.com/v19.0/oauth/access_token',
        scopes: 'pages_manage_posts,pages_read_engagement,pages_show_list',
    },
    instagram: {
        authUrl: 'https://www.facebook.com/v19.0/dialog/oauth',
        tokenUrl: 'https://graph.facebook.com/v19.0/oauth/access_token',
        scopes: 'instagram_basic,instagram_content_publish,pages_show_list',
    },
    linkedin: {
        authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
        tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
        scopes: 'w_member_social,r_liteprofile',
    },
    twitter: {
        authUrl: 'https://twitter.com/i/oauth2/authorize',
        tokenUrl: 'https://api.twitter.com/2/oauth2/token',
        scopes: 'tweet.read tweet.write users.read',
    },
};

// POST /api/social/connect/:platform — Start OAuth
router.post('/connect/:platform', protect, async (req, res) => {
    try {
        const { platform } = req.params;
        const { brandId } = req.body;
        const oauthConfig = OAUTH_CONFIG[platform];

        if (!oauthConfig) {
            return res.status(400).json({ success: false, error: `Unsupported platform: ${platform}` });
        }

        const clientId = process.env[`${platform.toUpperCase()}_CLIENT_ID`] || process.env.FACEBOOK_APP_ID;
        if (!clientId) {
            return res.status(500).json({ success: false, error: `${platform} app not configured. Add API keys to .env` });
        }

        const redirectUri = `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/social/callback/${platform}`;
        const state = Buffer.from(JSON.stringify({ userId: req.user._id, brandId, platform })).toString('base64');

        let authUrl;
        if (platform === 'twitter') {
            // Twitter uses PKCE
            authUrl = `${oauthConfig.authUrl}?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(oauthConfig.scopes)}&state=${state}&code_challenge=challenge&code_challenge_method=plain`;
        } else if (platform === 'linkedin') {
            authUrl = `${oauthConfig.authUrl}?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(oauthConfig.scopes)}&state=${state}`;
        } else {
            // Facebook/Instagram
            authUrl = `${oauthConfig.authUrl}?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${oauthConfig.scopes}&state=${state}&response_type=code`;
        }

        // Save pending integration
        await Integration.findOneAndUpdate(
            { user: req.user._id, platform },
            { user: req.user._id, brand: brandId, platform, status: 'pending' },
            { upsert: true, new: true }
        );

        res.json({ success: true, authUrl });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/social/callback/:platform — OAuth Callback
router.get('/callback/:platform', async (req, res) => {
    try {
        const { platform } = req.params;
        const { code, state } = req.query;

        if (!code || !state) return res.redirect('/integrations?error=oauth_failed');

        const oauthConfig = OAUTH_CONFIG[platform];
        const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
        const clientId = process.env[`${platform.toUpperCase()}_CLIENT_ID`] || process.env.FACEBOOK_APP_ID;
        const clientSecret = process.env[`${platform.toUpperCase()}_CLIENT_SECRET`] || process.env.FACEBOOK_APP_SECRET;
        const redirectUri = `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/social/callback/${platform}`;

        // Exchange code for token
        const tokenResponse = await fetch(oauthConfig.tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
            }),
        });

        const tokenData = await tokenResponse.json();
        if (tokenData.error) throw new Error(tokenData.error_description || tokenData.error);

        // Update integration
        const updateData = {
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token || '',
            tokenExpiresAt: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null,
            status: 'connected',
        };

        // Fetch profile info based on platform
        try {
            if (platform === 'facebook' || platform === 'instagram') {
                // Get pages
                const pagesRes = await fetch(`https://graph.facebook.com/v19.0/me/accounts?access_token=${tokenData.access_token}`);
                const pages = await pagesRes.json();
                if (pages.data?.[0]) {
                    updateData['platformData.pageId'] = pages.data[0].id;
                    updateData['platformData.pageName'] = pages.data[0].name;
                    updateData['platformData.pageAccessToken'] = pages.data[0].access_token;
                    updateData.displayName = pages.data[0].name;
                }
                if (platform === 'instagram') {
                    // Get IG business account linked to page
                    const igRes = await fetch(`https://graph.facebook.com/v19.0/${pages.data[0]?.id}?fields=instagram_business_account&access_token=${tokenData.access_token}`);
                    const igData = await igRes.json();
                    if (igData.instagram_business_account) {
                        updateData['platformData.igBusinessId'] = igData.instagram_business_account.id;
                    }
                }
            } else if (platform === 'linkedin') {
                const profileRes = await fetch('https://api.linkedin.com/v2/me', {
                    headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
                });
                const profile = await profileRes.json();
                updateData['platformData.personUrn'] = `urn:li:person:${profile.id}`;
                updateData['platformData.profileName'] = `${profile.localizedFirstName} ${profile.localizedLastName}`;
                updateData.displayName = `${profile.localizedFirstName} ${profile.localizedLastName}`;
            } else if (platform === 'twitter') {
                const userRes = await fetch('https://api.twitter.com/2/users/me', {
                    headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
                });
                const userData = await userRes.json();
                if (userData.data) {
                    updateData['platformData.twitterUserId'] = userData.data.id;
                    updateData['platformData.twitterUsername'] = userData.data.username;
                    updateData.displayName = userData.data.name;
                }
            }
        } catch (profileError) {
            console.error(`Profile fetch failed for ${platform}:`, profileError.message);
        }

        await Integration.findOneAndUpdate(
            { user: stateData.userId, platform },
            updateData,
            { new: true }
        );

        res.redirect(`/integrations?${platform}=connected`);
    } catch (error) {
        console.error(`OAuth callback error (${req.params.platform}):`, error);
        res.redirect(`/integrations?error=${req.params.platform}_auth_failed`);
    }
});

// GET /api/social/status — Connection status for all platforms
router.get('/status', protect, async (req, res) => {
    try {
        const integrations = await Integration.find({ user: req.user._id });
        const status = {};

        for (const platform of ['shopify', 'facebook', 'instagram', 'linkedin', 'twitter']) {
            const integration = integrations.find(i => i.platform === platform);
            status[platform] = {
                connected: integration?.status === 'connected',
                status: integration?.status || 'disconnected',
                displayName: integration?.displayName || '',
                profileUrl: integration?.profileUrl || '',
                profilePicture: integration?.profilePicture || '',
                lastPublishAt: integration?.lastPublishAt,
                publishCount: integration?.publishCount || 0,
                lastSyncAt: integration?.lastSyncAt,
            };
        }

        res.json({ success: true, integrations: status });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/social/publish — Publish content to platform(s)
router.post('/publish', protect, async (req, res) => {
    try {
        const { contentId, content, imageUrl, platforms: targetPlatforms } = req.body;

        if (!content && !contentId) {
            return res.status(400).json({ success: false, error: 'Content or contentId is required' });
        }
        if (!targetPlatforms?.length) {
            return res.status(400).json({ success: false, error: 'Select at least one platform to publish to' });
        }

        // Get content text
        let publishContent = content;
        let publishImage = imageUrl;
        if (contentId) {
            const contentDoc = await Content.findById(contentId);
            if (contentDoc) {
                publishContent = contentDoc.content;
            }
        }

        // Get credentials for each platform
        const platformsWithCreds = [];
        for (const platform of targetPlatforms) {
            const integration = await Integration.findOne({
                user: req.user._id,
                platform,
                status: 'connected',
            }).select('+accessToken +platformData.pageAccessToken');

            if (!integration) {
                platformsWithCreds.push({
                    platform,
                    credentials: {},
                    error: `${platform} is not connected`,
                });
                continue;
            }

            const credentials = {};
            switch (platform) {
                case 'facebook':
                    credentials.accessToken = integration.platformData.pageAccessToken || integration.accessToken;
                    credentials.pageId = integration.platformData.pageId;
                    break;
                case 'instagram':
                    credentials.accessToken = integration.platformData.pageAccessToken || integration.accessToken;
                    credentials.igBusinessId = integration.platformData.igBusinessId;
                    break;
                case 'linkedin':
                    credentials.accessToken = integration.accessToken;
                    credentials.personUrn = integration.platformData.personUrn;
                    break;
                case 'twitter':
                    credentials.bearerToken = integration.accessToken;
                    break;
            }

            platformsWithCreds.push({ platform, credentials });
        }

        // Publish
        const results = await publishToMultiplePlatforms({
            content: publishContent,
            imageUrl: publishImage,
            platforms: platformsWithCreds,
        });

        // Update publish counts
        for (const result of results) {
            if (result.success) {
                await Integration.findOneAndUpdate(
                    { user: req.user._id, platform: result.platform },
                    { $inc: { publishCount: 1 }, lastPublishAt: new Date() }
                );
            }
        }

        // Update content status if contentId provided
        if (contentId) {
            await Content.findByIdAndUpdate(contentId, {
                status: 'published',
                publishedAt: new Date(),
                publishedTo: results.filter(r => r.success).map(r => r.platform),
            });
        }

        const allSuccess = results.every(r => r.success);
        res.json({ success: true, published: allSuccess, results });
    } catch (error) {
        console.error('Publish error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE /api/social/disconnect/:platform — Disconnect a platform
router.delete('/disconnect/:platform', protect, async (req, res) => {
    try {
        const { platform } = req.params;
        await Integration.findOneAndUpdate(
            { user: req.user._id, platform },
            { status: 'disconnected', accessToken: '', refreshToken: '' }
        );
        res.json({ success: true, message: `${platform} disconnected` });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;

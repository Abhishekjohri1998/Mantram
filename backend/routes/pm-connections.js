/**
 * PM Connections — OAuth routes for Meta Ads & Google Ads
 * 
 * Flow:
 * 1. Frontend opens popup → GET /api/pm-studio/connect/meta/auth
 * 2. User authorizes on Meta/Google
 * 3. Platform redirects to callback → saves tokens to Integration model
 * 4. Frontend polls GET /api/pm-studio/connections for status
 */

import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import Integration from '../models/Integration.js';
import config from '../config/env.js';

const router = Router();

// Static base URL — must match what's registered in Google/Meta Cloud Console
const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001';

// ══════════════════════════════════════════════════════════════════════════════
// META ADS OAUTH
// ══════════════════════════════════════════════════════════════════════════════

const META_SCOPES = [
    'ads_management',
    'ads_read',
    'business_management',
    'pages_read_engagement',
].join(',');

/**
 * GET /api/pm-studio/connect/meta/auth
 * Redirects user to Meta OAuth login
 */
router.get('/connect/meta/auth', protect, (req, res) => {
    const appId = config.metaAds.appId || config.facebook.appId;
    if (!appId) {
        return res.status(400).json({ success: false, error: 'Meta App ID not configured' });
    }

    // Encode user/brand info in state
    const state = Buffer.from(JSON.stringify({
        userId: req.user._id.toString(),
        brandId: req.query.brandId || '',
        ts: Date.now(),
    })).toString('base64');

    const redirectUri = `${BASE_URL}/api/pm-studio/connect/meta/callback`;

    const authUrl = `https://www.facebook.com/v21.0/dialog/oauth?` +
        `client_id=${appId}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&scope=${META_SCOPES}` +
        `&state=${state}` +
        `&response_type=code`;

    res.json({ success: true, authUrl });
});

/**
 * GET /api/pm-studio/connect/meta/callback
 * Handles Meta OAuth callback — exchanges code for access token
 */
router.get('/connect/meta/callback', async (req, res) => {
    try {
        const { code, state, error: authError } = req.query;

        if (authError) {
            return res.send(closePopupScript('Meta authorization was cancelled.'));
        }
        if (!code || !state) {
            return res.send(closePopupScript('Missing authorization code.'));
        }

        // Decode state
        let stateData;
        try {
            stateData = JSON.parse(Buffer.from(state, 'base64').toString());
        } catch {
            return res.send(closePopupScript('Invalid state parameter.'));
        }

        const { userId, brandId } = stateData;
        const appId = config.metaAds.appId || config.facebook.appId;
        const appSecret = config.metaAds.appSecret || config.facebook.appSecret;
        const redirectUri = `${BASE_URL}/api/pm-studio/connect/meta/callback`;

        // Exchange code for access token
        const tokenResp = await fetch(
            `https://graph.facebook.com/v21.0/oauth/access_token?` +
            `client_id=${appId}` +
            `&redirect_uri=${encodeURIComponent(redirectUri)}` +
            `&client_secret=${appSecret}` +
            `&code=${code}`
        );
        const tokenData = await tokenResp.json();

        if (tokenData.error) {
            console.error('Meta token exchange failed:', tokenData.error);
            return res.send(closePopupScript(`Meta auth failed: ${tokenData.error.message}`));
        }

        const shortToken = tokenData.access_token;

        // Exchange for long-lived token (60-day)
        let accessToken = shortToken;
        let tokenExpiry = new Date(Date.now() + 3600 * 1000); // 1 hour default
        try {
            const longResp = await fetch(
                `https://graph.facebook.com/v21.0/oauth/access_token?` +
                `grant_type=fb_exchange_token` +
                `&client_id=${appId}` +
                `&client_secret=${appSecret}` +
                `&fb_exchange_token=${shortToken}`
            );
            const longData = await longResp.json();
            if (longData.access_token) {
                accessToken = longData.access_token;
                tokenExpiry = new Date(Date.now() + (longData.expires_in || 5184000) * 1000);
            }
        } catch (e) {
            console.warn('Long-lived token exchange failed, using short token:', e.message);
        }

        // Fetch user's ad accounts
        let adAccounts = [];
        let displayName = '';
        try {
            const meResp = await fetch(
                `https://graph.facebook.com/v21.0/me?fields=name,id&access_token=${accessToken}`
            );
            const meData = await meResp.json();
            displayName = meData.name || '';

            const acctResp = await fetch(
                `https://graph.facebook.com/v21.0/me/adaccounts?fields=id,name,account_status,currency,business_name&access_token=${accessToken}`
            );
            const acctData = await acctResp.json();
            adAccounts = (acctData.data || []).map(a => ({
                id: a.id,
                name: a.name || a.business_name || a.id,
                status: a.account_status === 1 ? 'active' : 'inactive',
                currency: a.currency,
            }));
        } catch (e) {
            console.warn('Failed to fetch ad accounts:', e.message);
        }

        // Save integration — per-brand
        const upsertQuery = { user: userId, platform: 'meta-ads' };
        if (brandId) upsertQuery.brand = brandId;
        await Integration.findOneAndUpdate(
            upsertQuery,
            {
                user: userId,
                brand: brandId || undefined,
                platform: 'meta-ads',
                status: 'connected',
                accessToken,
                tokenExpiresAt: tokenExpiry,
                tokenExpiry,
                displayName,
                platformData: {
                    metaAdAccountId: adAccounts[0]?.id || '',
                    metaBusinessId: '',
                },
                metadata: {
                    adAccounts,
                    connectedAt: new Date(),
                    tokenType: 'long-lived',
                },
                lastSyncAt: new Date(),
            },
            { upsert: true, new: true }
        );

        console.log(`✅ Meta Ads connected for user ${userId} — ${adAccounts.length} ad accounts found`);
        res.send(closePopupScript(null, 'meta'));

    } catch (error) {
        console.error('Meta callback error:', error);
        res.send(closePopupScript(`Connection failed: ${error.message}`));
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// GOOGLE ADS OAUTH
// ══════════════════════════════════════════════════════════════════════════════

const GOOGLE_SCOPES = [
    'https://www.googleapis.com/auth/adwords',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
].join(' ');

/**
 * GET /api/pm-studio/connect/google/auth
 * Redirects user to Google OAuth login
 */
router.get('/connect/google/auth', protect, (req, res) => {
    const clientId = config.googleAds.clientId || config.google.clientId;
    if (!clientId) {
        return res.status(400).json({ success: false, error: 'Google Client ID not configured' });
    }

    const state = Buffer.from(JSON.stringify({
        userId: req.user._id.toString(),
        brandId: req.query.brandId || '',
        ts: Date.now(),
    })).toString('base64');

    const redirectUri = `${BASE_URL}/api/pm-studio/connect/google/callback`;

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${clientId}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent(GOOGLE_SCOPES)}` +
        `&access_type=offline` +
        `&prompt=consent` +
        `&state=${state}`;

    res.json({ success: true, authUrl });
});

/**
 * GET /api/pm-studio/connect/google/callback
 * Handles Google OAuth callback
 */
router.get('/connect/google/callback', async (req, res) => {
    try {
        const { code, state, error: authError } = req.query;

        if (authError) {
            return res.send(closePopupScript('Google authorization was cancelled.'));
        }
        if (!code || !state) {
            return res.send(closePopupScript('Missing authorization code.'));
        }

        let stateData;
        try {
            stateData = JSON.parse(Buffer.from(state, 'base64').toString());
        } catch {
            return res.send(closePopupScript('Invalid state parameter.'));
        }

        const { userId, brandId } = stateData;
        const clientId = config.googleAds.clientId || config.google.clientId;
        const clientSecret = config.googleAds.clientSecret || config.google.clientSecret;
        const redirectUri = `${BASE_URL}/api/pm-studio/connect/google/callback`;

        // Exchange code for tokens
        const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code',
            }),
        });
        const tokenData = await tokenResp.json();

        if (tokenData.error) {
            console.error('Google token exchange failed:', tokenData.error);
            return res.send(closePopupScript(`Google auth failed: ${tokenData.error_description || tokenData.error}`));
        }

        const { access_token: accessToken, refresh_token: refreshToken, expires_in } = tokenData;
        const tokenExpiry = new Date(Date.now() + (expires_in || 3600) * 1000);

        // Fetch user profile
        let displayName = '';
        let email = '';
        try {
            const profileResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            const profileData = await profileResp.json();
            displayName = profileData.name || '';
            email = profileData.email || '';
        } catch (e) {
            console.warn('Failed to fetch Google profile:', e.message);
        }

        // Try to fetch Google Ads customer IDs (requires developer token)
        let customerIds = [];
        if (config.googleAds.developerToken) {
            try {
                const adsResp = await fetch('https://googleads.googleapis.com/v18/customers:listAccessibleCustomers', {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'developer-token': config.googleAds.developerToken,
                    },
                });
                const adsData = await adsResp.json();
                customerIds = (adsData.resourceNames || []).map(rn => rn.replace('customers/', ''));
            } catch (e) {
                console.warn('Failed to fetch Google Ads customers:', e.message);
            }
        }

        // Save integration — per-brand
        const upsertQuery = { user: userId, platform: 'google-ads' };
        if (brandId) upsertQuery.brand = brandId;
        await Integration.findOneAndUpdate(
            upsertQuery,
            {
                user: userId,
                brand: brandId || undefined,
                platform: 'google-ads',
                status: 'connected',
                accessToken,
                refreshToken: refreshToken || '',
                tokenExpiresAt: tokenExpiry,
                tokenExpiry,
                displayName: displayName || email,
                platformData: {
                    googleAdsCustomerId: customerIds[0] || '',
                    googleAdsManagerId: '',
                },
                metadata: {
                    email,
                    customerIds,
                    connectedAt: new Date(),
                    hasDeveloperToken: !!config.googleAds.developerToken,
                },
                lastSyncAt: new Date(),
            },
            { upsert: true, new: true }
        );

        console.log(`✅ Google Ads connected for user ${userId} — ${customerIds.length} customer IDs found`);
        res.send(closePopupScript(null, 'google'));

    } catch (error) {
        console.error('Google callback error:', error);
        res.send(closePopupScript(`Connection failed: ${error.message}`));
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// DISCONNECT
// ══════════════════════════════════════════════════════════════════════════════

/**
 * DELETE /api/pm-studio/connect/:platform
 * Disconnect a platform
 */
router.delete('/connect/:platform', protect, async (req, res) => {
    try {
        const platform = req.params.platform === 'meta' ? 'meta-ads' : req.params.platform === 'google' ? 'google-ads' : req.params.platform;

        const query = { user: req.user._id, platform };
        if (req.query.brandId) query.brand = req.query.brandId;
        const integration = await Integration.findOneAndUpdate(
            query,
            {
                status: 'disconnected',
                accessToken: '',
                refreshToken: '',
                tokenExpiresAt: null,
            },
            { new: true }
        );

        if (!integration) return res.status(404).json({ success: false, error: 'Connection not found' });

        res.json({ success: true, message: `${platform} disconnected` });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// CONNECTION STATUS (detailed)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/pm-studio/connect/status
 * Detailed connection status with ad account info
 */
router.get('/connect/status', protect, async (req, res) => {
    try {
        const query = {
            user: req.user._id,
            platform: { $in: ['meta-ads', 'google-ads'] },
        };
        if (req.query.brandId) query.brand = req.query.brandId;
        const integrations = await Integration.find(query).lean();

        const meta = integrations.find(i => i.platform === 'meta-ads');
        const google = integrations.find(i => i.platform === 'google-ads');

        res.json({
            success: true,
            connections: {
                meta: meta ? {
                    status: meta.status,
                    displayName: meta.displayName,
                    adAccounts: meta.metadata?.adAccounts || [],
                    activeAdAccount: meta.platformData?.metaAdAccountId || '',
                    connectedAt: meta.metadata?.connectedAt,
                    tokenExpires: meta.tokenExpiresAt,
                } : { status: 'disconnected' },
                google: google ? {
                    status: google.status,
                    displayName: google.displayName,
                    email: google.metadata?.email || '',
                    customerIds: google.metadata?.customerIds || [],
                    activeCustomerId: google.platformData?.googleAdsCustomerId || '',
                    connectedAt: google.metadata?.connectedAt,
                    hasDeveloperToken: google.metadata?.hasDeveloperToken || false,
                } : { status: 'disconnected' },
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// Helper — Close popup and notify parent
// ══════════════════════════════════════════════════════════════════════════════

function closePopupScript(error, platform = '') {
    return `<!DOCTYPE html>
<html><head><title>Connecting...</title></head>
<body style="background:#0a0a0a;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
<div style="text-align:center;">
${error
            ? `<p style="color:#f87171;">❌ ${error}</p><p style="color:#94a3b8;font-size:14px;">Close this window and try again.</p>`
            : `<p style="color:#34d399;">✅ ${platform === 'meta' ? 'Meta Ads' : 'Google Ads'} connected successfully!</p><p style="color:#94a3b8;font-size:14px;">This window will close automatically...</p>`
        }
</div>
<script>
    if (window.opener) {
        window.opener.postMessage({
            type: 'PM_PLATFORM_CONNECTED',
            platform: '${platform}',
            ${error ? `error: ${JSON.stringify(error)}` : 'success: true'}
        }, '*');
    }
    ${!error ? 'setTimeout(() => window.close(), 2000);' : ''}
</script>
</body></html>`;
}

export default router;

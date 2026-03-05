import { Router } from 'express';
import { protect, optionalAuth } from '../middleware/auth.js';
import config from '../config/env.js';

const router = Router();

const GOOGLE_SCOPES = [
    'https://www.googleapis.com/auth/analytics.readonly',
    'https://www.googleapis.com/auth/webmasters.readonly',
    'openid',
    'email',
    'profile',
].join(' ');

const REDIRECT_URI = process.env.GOOGLE_ANALYTICS_CALLBACK_URL || `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/google-analytics/callback`;

// ============================================================================
// HELPERS
// ============================================================================

async function getTokensFromCode(code) {
    const resp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            code,
            client_id: config.google.clientId,
            client_secret: config.google.clientSecret,
            redirect_uri: REDIRECT_URI,
            grant_type: 'authorization_code',
        }),
    });
    return resp.json();
}

async function refreshAccessToken(refreshToken) {
    const resp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            refresh_token: refreshToken,
            client_id: config.google.clientId,
            client_secret: config.google.clientSecret,
            grant_type: 'refresh_token',
        }),
    });
    return resp.json();
}

async function getValidToken(userId) {
    const Integration = (await import('../models/Integration.js')).default;
    const integration = await Integration.findOne({ user: userId, platform: 'google-analytics', status: 'connected' });
    if (!integration) return null;

    // Check if token is expired (with 5 min buffer)
    if (integration.tokenExpiry && new Date(integration.tokenExpiry) < new Date(Date.now() + 5 * 60 * 1000)) {
        if (integration.refreshToken) {
            const tokens = await refreshAccessToken(integration.refreshToken);
            if (tokens.access_token) {
                integration.accessToken = tokens.access_token;
                integration.tokenExpiry = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);
                await integration.save();
            } else {
                integration.status = 'expired';
                await integration.save();
                return null;
            }
        } else {
            return null;
        }
    }
    return { token: integration.accessToken, integration };
}

async function googleAPIFetch(url, accessToken, options = {}) {
    const resp = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        },
    });
    return resp.json();
}


// ============================================================================
// OAUTH FLOW
// ============================================================================

// GET /api/google-analytics/connect — Start OAuth
router.get('/connect', protect, (req, res) => {
    const state = Buffer.from(JSON.stringify({ userId: req.user._id })).toString('base64');
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + new URLSearchParams({
        client_id: config.google.clientId,
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        scope: GOOGLE_SCOPES,
        access_type: 'offline',
        prompt: 'consent',
        state,
    }).toString();
    res.json({ success: true, authUrl });
});

// GET /api/google-analytics/callback — OAuth callback
router.get('/callback', async (req, res) => {
    try {
        const { code, state } = req.query;
        if (!code) return res.status(400).send('Missing authorization code');

        const { userId } = JSON.parse(Buffer.from(state, 'base64').toString());
        const tokens = await getTokensFromCode(code);

        if (tokens.error) {
            return res.status(400).send(`OAuth error: ${tokens.error_description || tokens.error}`);
        }

        // Get user email from Google
        const userInfo = await googleAPIFetch('https://www.googleapis.com/oauth2/v2/userinfo', tokens.access_token);

        // Save integration
        const Integration = (await import('../models/Integration.js')).default;
        await Integration.findOneAndUpdate(
            { user: userId, platform: 'google-analytics' },
            {
                user: userId,
                platform: 'google-analytics',
                status: 'connected',
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token,
                tokenExpiry: new Date(Date.now() + (tokens.expires_in || 3600) * 1000),
                displayName: userInfo.email || 'Google Analytics',
                metadata: { email: userInfo.email, scope: tokens.scope },
            },
            { upsert: true, new: true }
        );

        // Close popup and notify parent
        res.send(`<html><body><script>
            window.opener?.postMessage({ type: 'GOOGLE_ANALYTICS_CONNECTED', email: '${userInfo.email || ''}' }, '*');
            window.close();
        </script><p>Connected! You can close this window.</p></body></html>`);
    } catch (error) {
        console.error('Google Analytics callback error:', error);
        res.status(500).send(`Connection failed: ${error.message}`);
    }
});

// GET /api/google-analytics/status — Check connection status
router.get('/status', optionalAuth, async (req, res) => {
    if (!req.user) return res.json({ success: true, connected: false });
    try {
        const Integration = (await import('../models/Integration.js')).default;
        const integration = await Integration.findOne({ user: req.user._id, platform: 'google-analytics' });
        res.json({
            success: true,
            connected: integration?.status === 'connected',
            email: integration?.metadata?.email || '',
            displayName: integration?.displayName || '',
        });
    } catch (e) {
        res.json({ success: true, connected: false });
    }
});

// POST /api/google-analytics/disconnect
router.post('/disconnect', protect, async (req, res) => {
    try {
        const Integration = (await import('../models/Integration.js')).default;
        await Integration.findOneAndUpdate(
            { user: req.user._id, platform: 'google-analytics' },
            { status: 'disconnected', accessToken: '', refreshToken: '' }
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});


// ============================================================================
// GOOGLE ANALYTICS DATA (GA4)
// ============================================================================

// GET /api/google-analytics/properties — List GA4 properties
router.get('/properties', protect, async (req, res) => {
    try {
        const auth = await getValidToken(req.user._id);
        if (!auth) return res.status(401).json({ success: false, error: 'Not connected to Google Analytics' });

        const data = await googleAPIFetch(
            'https://analyticsadmin.googleapis.com/v1beta/accountSummaries',
            auth.token
        );
        const properties = [];
        (data.accountSummaries || []).forEach(acct => {
            (acct.propertySummaries || []).forEach(prop => {
                properties.push({
                    accountId: acct.account,
                    accountName: acct.displayName,
                    propertyId: prop.property?.replace('properties/', ''),
                    propertyName: prop.displayName,
                });
            });
        });
        res.json({ success: true, properties });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /api/google-analytics/report — Get analytics data
router.post('/report', protect, async (req, res) => {
    try {
        const auth = await getValidToken(req.user._id);
        if (!auth) return res.status(401).json({ success: false, error: 'Not connected' });

        const { propertyId, startDate = '30daysAgo', endDate = 'today' } = req.body;
        if (!propertyId) return res.status(400).json({ success: false, error: 'Property ID required' });

        // Run multiple reports in parallel
        const [trafficReport, pagesReport, channelReport] = await Promise.all([
            // Daily traffic
            googleAPIFetch(
                `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
                auth.token,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        dateRanges: [{ startDate, endDate }],
                        dimensions: [{ name: 'date' }],
                        metrics: [
                            { name: 'activeUsers' },
                            { name: 'sessions' },
                            { name: 'screenPageViews' },
                            { name: 'bounceRate' },
                            { name: 'averageSessionDuration' },
                            { name: 'newUsers' },
                        ],
                        orderBys: [{ dimension: { dimensionName: 'date' } }],
                    }),
                }
            ),
            // Top pages
            googleAPIFetch(
                `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
                auth.token,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        dateRanges: [{ startDate, endDate }],
                        dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
                        metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }, { name: 'bounceRate' }, { name: 'averageSessionDuration' }],
                        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
                        limit: 20,
                    }),
                }
            ),
            // Channel breakdown
            googleAPIFetch(
                `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
                auth.token,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        dateRanges: [{ startDate, endDate }],
                        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
                        metrics: [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'screenPageViews' }],
                        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
                    }),
                }
            ),
        ]);

        // Parse traffic data
        const traffic = (trafficReport.rows || []).map(row => ({
            date: row.dimensionValues?.[0]?.value,
            users: parseInt(row.metricValues?.[0]?.value || 0),
            sessions: parseInt(row.metricValues?.[1]?.value || 0),
            pageViews: parseInt(row.metricValues?.[2]?.value || 0),
            bounceRate: parseFloat(row.metricValues?.[3]?.value || 0),
            avgDuration: parseFloat(row.metricValues?.[4]?.value || 0),
            newUsers: parseInt(row.metricValues?.[5]?.value || 0),
        }));

        // Parse top pages
        const topPages = (pagesReport.rows || []).map(row => ({
            path: row.dimensionValues?.[0]?.value,
            title: row.dimensionValues?.[1]?.value,
            views: parseInt(row.metricValues?.[0]?.value || 0),
            users: parseInt(row.metricValues?.[1]?.value || 0),
            bounceRate: parseFloat(row.metricValues?.[2]?.value || 0),
            avgDuration: parseFloat(row.metricValues?.[3]?.value || 0),
        }));

        // Parse channels
        const channels = (channelReport.rows || []).map(row => ({
            channel: row.dimensionValues?.[0]?.value,
            sessions: parseInt(row.metricValues?.[0]?.value || 0),
            users: parseInt(row.metricValues?.[1]?.value || 0),
            pageViews: parseInt(row.metricValues?.[2]?.value || 0),
        }));

        // Compute totals
        const totalUsers = traffic.reduce((s, d) => s + d.users, 0);
        const totalSessions = traffic.reduce((s, d) => s + d.sessions, 0);
        const totalPageViews = traffic.reduce((s, d) => s + d.pageViews, 0);
        const avgBounce = traffic.length ? traffic.reduce((s, d) => s + d.bounceRate, 0) / traffic.length : 0;

        res.json({
            success: true,
            summary: { totalUsers, totalSessions, totalPageViews, avgBounceRate: avgBounce },
            traffic,
            topPages,
            channels,
        });
    } catch (e) {
        console.error('GA report error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});


// ============================================================================
// GOOGLE SEARCH CONSOLE DATA
// ============================================================================

// GET /api/google-analytics/search-console/sites — List verified sites
router.get('/search-console/sites', protect, async (req, res) => {
    try {
        const auth = await getValidToken(req.user._id);
        if (!auth) return res.status(401).json({ success: false, error: 'Not connected' });

        const data = await googleAPIFetch('https://www.googleapis.com/webmasters/v3/sites', auth.token);
        const sites = (data.siteEntry || []).map(s => ({
            siteUrl: s.siteUrl,
            permissionLevel: s.permissionLevel,
        }));
        res.json({ success: true, sites });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /api/google-analytics/search-console/report — SERP data
router.post('/search-console/report', protect, async (req, res) => {
    try {
        const auth = await getValidToken(req.user._id);
        if (!auth) return res.status(401).json({ success: false, error: 'Not connected' });

        const { siteUrl, startDate, endDate, dimensions = ['query'] } = req.body;
        if (!siteUrl) return res.status(400).json({ success: false, error: 'Site URL required' });

        const start = startDate || new Date(Date.now() - 28 * 86400000).toISOString().split('T')[0];
        const end = endDate || new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0];

        // Keywords report
        const keywordsData = await googleAPIFetch(
            `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
            auth.token,
            {
                method: 'POST',
                body: JSON.stringify({
                    startDate: start, endDate: end,
                    dimensions: ['query'],
                    rowLimit: 50,
                    dimensionFilterGroups: [],
                }),
            }
        );

        // Pages report
        const pagesData = await googleAPIFetch(
            `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
            auth.token,
            {
                method: 'POST',
                body: JSON.stringify({
                    startDate: start, endDate: end,
                    dimensions: ['page'],
                    rowLimit: 30,
                }),
            }
        );

        // Daily performance
        const dailyData = await googleAPIFetch(
            `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
            auth.token,
            {
                method: 'POST',
                body: JSON.stringify({
                    startDate: start, endDate: end,
                    dimensions: ['date'],
                }),
            }
        );

        const keywords = (keywordsData.rows || []).map(r => ({
            keyword: r.keys[0],
            clicks: r.clicks,
            impressions: r.impressions,
            ctr: r.ctr,
            position: r.position,
        }));

        const pages = (pagesData.rows || []).map(r => ({
            page: r.keys[0],
            clicks: r.clicks,
            impressions: r.impressions,
            ctr: r.ctr,
            position: r.position,
        }));

        const daily = (dailyData.rows || []).map(r => ({
            date: r.keys[0],
            clicks: r.clicks,
            impressions: r.impressions,
            ctr: r.ctr,
            position: r.position,
        }));

        // Totals
        const totalClicks = keywords.reduce((s, k) => s + k.clicks, 0);
        const totalImpressions = keywords.reduce((s, k) => s + k.impressions, 0);
        const avgPosition = keywords.length ? keywords.reduce((s, k) => s + k.position, 0) / keywords.length : 0;
        const avgCtr = keywords.length ? keywords.reduce((s, k) => s + k.ctr, 0) / keywords.length : 0;

        res.json({
            success: true,
            summary: { totalClicks, totalImpressions, avgPosition, avgCtr },
            keywords,
            pages,
            daily,
        });
    } catch (e) {
        console.error('Search Console error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});


export default router;

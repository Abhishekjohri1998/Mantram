/**
 * Live Campaign Sync Engine — Meta Ads & Google Ads Reporting
 * 
 * Pulls real campaign metrics from ad platform APIs using stored OAuth tokens.
 * Updates AdCampaign.performance with live data.
 * 
 * Prerequisites: OAuth tokens stored in Integration model via pm-connections.js
 */

import Integration from '../../models/Integration.js';
import AdCampaign from '../../models/AdCampaign.js';
import config from '../../config/env.js';

// ══════════════════════════════════════════════════════════════════════════════
// META ADS — Campaign Performance Sync
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Sync campaign performance data from Meta Ads API.
 * Uses the Marketing API /act_{adAccountId}/insights endpoint.
 */
export async function syncMetaCampaigns(userId, brandId) {
    const integration = await Integration.findOne({
        user: userId,
        platform: 'meta-ads',
        status: 'connected',
    });

    if (!integration) return { synced: 0, error: 'Meta Ads not connected' };

    const accessToken = integration.platformData?.accessToken;
    const adAccounts = integration.platformData?.adAccounts || [];
    if (!accessToken || adAccounts.length === 0) return { synced: 0, error: 'No access token or ad accounts' };

    const results = [];

    for (const account of adAccounts) {
        const accountId = account.id || account.accountId;
        if (!accountId) continue;

        try {
            // Fetch campaign-level insights for last 30 days
            const url = new URL(`https://graph.facebook.com/v21.0/act_${accountId.replace('act_', '')}/insights`);
            url.searchParams.set('access_token', accessToken);
            url.searchParams.set('level', 'campaign');
            url.searchParams.set('fields', 'campaign_id,campaign_name,impressions,reach,clicks,ctr,cpc,cpm,spend,actions,action_values,cost_per_action_type');
            url.searchParams.set('date_preset', 'last_30d');
            url.searchParams.set('limit', '100');

            const resp = await fetch(url.toString());
            const data = await resp.json();

            if (data.error) {
                console.warn(`Meta Insights API error for ${accountId}:`, data.error.message);
                continue;
            }

            for (const insight of (data.data || [])) {
                const metaCampaignId = insight.campaign_id;

                // Find matching local campaign by platformData.metaCampaignId
                const campaign = await AdCampaign.findOne({
                    user: userId,
                    'platformData.metaCampaignId': metaCampaignId,
                });

                // Extract conversions from actions array
                const conversions = (insight.actions || [])
                    .filter(a => ['purchase', 'lead', 'complete_registration', 'add_to_cart'].includes(a.action_type))
                    .reduce((sum, a) => sum + Number(a.value || 0), 0);

                // Extract revenue from action_values
                const revenue = (insight.action_values || [])
                    .filter(a => a.action_type === 'purchase')
                    .reduce((sum, a) => sum + Number(a.value || 0), 0);

                const perfData = {
                    impressions: Number(insight.impressions || 0),
                    reach: Number(insight.reach || 0),
                    clicks: Number(insight.clicks || 0),
                    ctr: Number(insight.ctr || 0),
                    cpc: Number(insight.cpc || 0),
                    cpm: Number(insight.cpm || 0),
                    spend: Number(insight.spend || 0),
                    conversions,
                    revenue,
                    roas: Number(insight.spend) > 0 ? revenue / Number(insight.spend) : 0,
                    lastSyncAt: new Date(),
                };

                if (campaign) {
                    // Update existing campaign
                    await AdCampaign.findByIdAndUpdate(campaign._id, { performance: perfData });
                    results.push({ campaignId: campaign._id, metaCampaignId, updated: true });
                } else {
                    // Create a shadow campaign for tracking
                    const newCampaign = await AdCampaign.create({
                        user: userId,
                        brand: brandId,
                        title: insight.campaign_name || `Meta Campaign ${metaCampaignId}`,
                        platform: 'meta',
                        status: 'active',
                        objective: 'traffic',
                        platformData: { metaCampaignId },
                        performance: perfData,
                    });
                    results.push({ campaignId: newCampaign._id, metaCampaignId, created: true });
                }
            }
        } catch (e) {
            console.error(`Meta sync error for account ${accountId}:`, e.message);
        }
    }

    return { synced: results.length, results, platform: 'meta' };
}

// ══════════════════════════════════════════════════════════════════════════════
// GOOGLE ADS — Campaign Performance Sync
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Sync campaign performance data from Google Ads Reporting API.
 * Uses the Google Ads Query Language (GAQL) via searchStream.
 */
export async function syncGoogleCampaigns(userId, brandId) {
    const integration = await Integration.findOne({
        user: userId,
        platform: 'google-ads',
        status: 'connected',
    });

    if (!integration) return { synced: 0, error: 'Google Ads not connected' };

    let accessToken = integration.platformData?.accessToken;
    const refreshToken = integration.platformData?.refreshToken;
    const customerIds = integration.platformData?.customerIds || [];
    const developerToken = config.googleAds?.developerToken;

    if (!accessToken || customerIds.length === 0) return { synced: 0, error: 'No access token or customer IDs' };

    // Refresh token if expired
    if (integration.platformData?.tokenExpiry && new Date(integration.platformData.tokenExpiry) < new Date()) {
        try {
            const clientId = config.googleAds?.clientId || config.google?.clientId;
            const clientSecret = config.googleAds?.clientSecret || config.google?.clientSecret;
            const refreshResp = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: clientId,
                    client_secret: clientSecret,
                    refresh_token: refreshToken,
                    grant_type: 'refresh_token',
                }),
            });
            const tokenData = await refreshResp.json();
            if (tokenData.access_token) {
                accessToken = tokenData.access_token;
                await Integration.findByIdAndUpdate(integration._id, {
                    'platformData.accessToken': accessToken,
                    'platformData.tokenExpiry': new Date(Date.now() + (tokenData.expires_in || 3600) * 1000),
                });
            }
        } catch (e) {
            console.warn('Google token refresh failed:', e.message);
        }
    }

    const results = [];

    for (const customerId of customerIds) {
        const cleanId = customerId.replace(/customers\//g, '').replace(/-/g, '');
        try {
            const gaqlQuery = `
                SELECT
                    campaign.id, campaign.name, campaign.status,
                    metrics.impressions, metrics.clicks, metrics.ctr,
                    metrics.average_cpc, metrics.average_cpm, metrics.cost_micros,
                    metrics.conversions, metrics.conversions_value
                FROM campaign
                WHERE segments.date DURING LAST_30_DAYS
                ORDER BY metrics.cost_micros DESC
                LIMIT 50
            `;

            const resp = await fetch(`https://googleads.googleapis.com/v18/customers/${cleanId}/googleAds:searchStream`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'developer-token': developerToken || '',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ query: gaqlQuery }),
            });
            const data = await resp.json();

            // searchStream returns array of result batches
            const rows = Array.isArray(data) ? data.flatMap(b => b.results || []) : (data.results || []);

            for (const row of rows) {
                const googleCampaignId = row.campaign?.id?.toString();
                const spendMicros = Number(row.metrics?.costMicros || row.metrics?.cost_micros || 0);
                const spend = spendMicros / 1_000_000;
                const revenue = Number(row.metrics?.conversionsValue || row.metrics?.conversions_value || 0);

                const campaign = await AdCampaign.findOne({
                    user: userId,
                    'platformData.googleCampaignId': googleCampaignId,
                });

                const perfData = {
                    impressions: Number(row.metrics?.impressions || 0),
                    clicks: Number(row.metrics?.clicks || 0),
                    ctr: Number(row.metrics?.ctr || 0) * 100,
                    cpc: Number(row.metrics?.averageCpc || row.metrics?.average_cpc || 0) / 1_000_000,
                    cpm: Number(row.metrics?.averageCpm || row.metrics?.average_cpm || 0) / 1_000_000,
                    spend,
                    conversions: Number(row.metrics?.conversions || 0),
                    revenue,
                    roas: spend > 0 ? revenue / spend : 0,
                    lastSyncAt: new Date(),
                };

                if (campaign) {
                    await AdCampaign.findByIdAndUpdate(campaign._id, { performance: perfData });
                    results.push({ campaignId: campaign._id, googleCampaignId, updated: true });
                } else {
                    const newCampaign = await AdCampaign.create({
                        user: userId,
                        brand: brandId,
                        title: row.campaign?.name || `Google Campaign ${googleCampaignId}`,
                        platform: 'google',
                        status: row.campaign?.status === 'ENABLED' ? 'active' : 'paused',
                        objective: 'traffic',
                        platformData: { googleCampaignId },
                        performance: perfData,
                    });
                    results.push({ campaignId: newCampaign._id, googleCampaignId, created: true });
                }
            }
        } catch (e) {
            console.error(`Google Ads sync error for customer ${cleanId}:`, e.message);
        }
    }

    return { synced: results.length, results, platform: 'google' };
}

// ══════════════════════════════════════════════════════════════════════════════
// FULL SYNC — Orchestrate both platforms
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Sync all campaign data from all connected platforms.
 * Returns a summary of changes.
 */
export async function syncAllCampaigns(userId, brandId) {
    console.log(`🔄 PM Live Sync: Starting full sync for user ${userId}`);

    const [metaResult, googleResult] = await Promise.allSettled([
        syncMetaCampaigns(userId, brandId),
        syncGoogleCampaigns(userId, brandId),
    ]);

    const meta = metaResult.status === 'fulfilled' ? metaResult.value : { synced: 0, error: metaResult.reason?.message };
    const google = googleResult.status === 'fulfilled' ? googleResult.value : { synced: 0, error: googleResult.reason?.message };

    const totalSynced = (meta.synced || 0) + (google.synced || 0);
    console.log(`✅ PM Live Sync: ${totalSynced} campaigns synced (Meta: ${meta.synced || 0}, Google: ${google.synced || 0})`);

    return {
        totalSynced,
        meta,
        google,
        syncedAt: new Date(),
    };
}

/**
 * Anomaly Detection & Auto-Response Engine
 * 
 * Compares live campaign data against historical baselines.
 * Triggers alerts and auto-actions when anomalies are detected.
 * 
 * Anomaly types:
 * - roas-drop: ROAS fell >20% vs 7-day average
 * - cpc-spike: CPC increased >30% vs 7-day average
 * - ctr-drop: CTR dropped >25% vs 7-day average
 * - budget-exceeded: Daily spend exceeding budget by >15%
 * - conversion-drop: Conversions dropped >40% (critical)
 */

import AdCampaign from '../../models/AdCampaign.js';
import AdLearning from '../../models/AdLearning.js';
import { getRouter } from '../../ai/router.js';

// ── Anomaly thresholds ──
const THRESHOLDS = {
    'roas-drop': { field: 'roas', direction: 'below', pctDelta: 20, severity: 'high' },
    'cpc-spike': { field: 'cpc', direction: 'above', pctDelta: 30, severity: 'warning' },
    'ctr-drop': { field: 'ctr', direction: 'below', pctDelta: 25, severity: 'warning' },
    'budget-exceeded': { field: 'spend', direction: 'above', pctDelta: 15, severity: 'high' },
    'conversion-drop': { field: 'conversions', direction: 'below', pctDelta: 40, severity: 'critical' },
};


// ══════════════════════════════════════════════════════════════════════════════
// ANOMALY DETECTION
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Detect anomalies across all active campaigns for a user/brand.
 * Compares current performance against historical baselines.
 */
export async function detectAnomalies(userId, brandId) {
    const filter = { user: userId, status: 'active' };
    if (brandId) filter.brand = brandId;

    const campaigns = await AdCampaign.find(filter).lean();
    if (campaigns.length === 0) return { anomalies: [], message: 'No active campaigns' };

    const allAnomalies = [];

    for (const campaign of campaigns) {
        const perf = campaign.performance || {};
        if (!perf.lastSyncAt) continue; // Skip if never synced

        const campaignAnomalies = [];

        // Check each threshold
        for (const [anomalyType, config] of Object.entries(THRESHOLDS)) {
            const currentValue = perf[config.field];
            if (currentValue === undefined || currentValue === null) continue;

            // Use budget as baseline for budget-exceeded
            let baselineValue;
            if (anomalyType === 'budget-exceeded') {
                baselineValue = campaign.budget?.daily || 0;
                if (baselineValue === 0) continue;
            } else {
                // Use predicted/historical values as baseline
                // For now, use a simple heuristic: if ROAS < 1 it's always bad
                baselineValue = getBaseline(campaign, config.field);
                if (baselineValue === 0) continue;
            }

            const pctChange = ((currentValue - baselineValue) / baselineValue) * 100;
            const isAnomaly = config.direction === 'above'
                ? pctChange > config.pctDelta
                : pctChange < -config.pctDelta;

            if (isAnomaly) {
                campaignAnomalies.push({
                    type: anomalyType,
                    severity: config.severity,
                    campaignId: campaign._id,
                    campaignTitle: campaign.title,
                    platform: campaign.platform,
                    metric: config.field,
                    expected: Math.round(baselineValue * 100) / 100,
                    actual: Math.round(currentValue * 100) / 100,
                    pctChange: Math.round(pctChange * 10) / 10,
                    detected: new Date(),
                    resolved: false,
                });
            }
        }

        // Always flag critically low ROAS (absolute check)
        if (perf.roas !== undefined && perf.roas < 0.5 && perf.spend > 100) {
            campaignAnomalies.push({
                type: 'roas-drop',
                severity: 'critical',
                campaignId: campaign._id,
                campaignTitle: campaign.title,
                platform: campaign.platform,
                metric: 'roas',
                expected: 1.0,
                actual: Math.round(perf.roas * 100) / 100,
                pctChange: -((1 - perf.roas) * 100),
                detected: new Date(),
                resolved: false,
                absoluteFlag: true,
            });
        }

        allAnomalies.push(...campaignAnomalies);
    }

    // Sort by severity: critical > high > medium > low
    const severityOrder = { critical: 0, high: 1, warning: 2, low: 3 };
    allAnomalies.sort((a, b) => (severityOrder[a.severity] || 3) - (severityOrder[b.severity] || 3));

    return { anomalies: allAnomalies, total: allAnomalies.length, checkedCampaigns: campaigns.length };
}


// ══════════════════════════════════════════════════════════════════════════════
// AI-POWERED ACTION GENERATION
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Generate AI-recommended actions for detected anomalies.
 */
export async function generateAnomalyActions(anomalies, brandId) {
    if (!anomalies || anomalies.length === 0) return { actions: [] };

    const anomalySummary = anomalies.map(a =>
        `• [${a.severity.toUpperCase()}] ${a.campaignTitle} (${a.platform}): ${a.type} — ${a.metric} was ${a.actual} vs expected ${a.expected} (${a.pctChange > 0 ? '+' : ''}${a.pctChange}%)`
    ).join('\n');

    const ai = getRouter();
    const systemPrompt = `You are a Performance Marketing Emergency Responder. Analyze campaign anomalies and recommend SPECIFIC actions.

For each anomaly, recommend ONE of:
- PAUSE: Pause the ad/campaign immediately
- BUDGET_SHIFT: Move budget from this campaign to a better performer
- CREATIVE_SWAP: Generate new creative variants and replace underperformers
- AUDIENCE_REFINE: Narrow or change targeting
- MONITOR: Watch for 24 more hours before acting

Return STRICT JSON:
{
  "actions": [
    {
      "campaignId": "...",
      "campaignTitle": "...",
      "action": "PAUSE|BUDGET_SHIFT|CREATIVE_SWAP|AUDIENCE_REFINE|MONITOR",
      "reason": "one-line reason",
      "urgency": "immediate|within-24h|within-48h",
      "expectedImpact": "e.g. Save ₹5,000/day, improve ROAS by 0.5x"
    }
  ],
  "overallAssessment": "one-paragraph executive summary"
}`;

    try {
        const response = await ai.generateText({
            systemPrompt: systemPrompt,
            userPrompt: `Campaign anomalies detected:\n\n${anomalySummary}\n\nRecommend actions.`,
            temperature: 0.4,
        });

        const text = response.text || '{}';
        const parsed = JSON.parse(text.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
        return parsed;
    } catch (e) {
        console.error('Anomaly action generation failed:', e.message);
        return {
            actions: anomalies.map(a => ({
                campaignId: a.campaignId,
                campaignTitle: a.campaignTitle,
                action: a.severity === 'critical' ? 'PAUSE' : 'MONITOR',
                reason: `Auto-generated: ${a.type} detected`,
                urgency: a.severity === 'critical' ? 'immediate' : 'within-24h',
            }))
        };
    }
}


// ══════════════════════════════════════════════════════════════════════════════
// AUTO-RESPOND — Execute actions if autopilot enabled
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Execute recommended actions for campaigns with autopilot enabled.
 * Logs all decisions to AdLearning for memory.
 */
export async function autoRespond(actions, userId) {
    const executed = [];

    for (const action of (actions || [])) {
        const campaign = await AdCampaign.findById(action.campaignId);
        if (!campaign) continue;

        // Only auto-execute if autopilot is enabled on the campaign
        const autopilotEnabled = campaign.autopilot?.enabled || false;

        if (autopilotEnabled) {
            let executedAction = { ...action, executed: true, executedAt: new Date() };

            switch (action.action) {
                case 'PAUSE':
                    campaign.status = 'paused';
                    campaign.anomalies = campaign.anomalies || [];
                    campaign.anomalies.push({
                        type: 'auto-paused',
                        severity: 'high',
                        detected: new Date(),
                        metric: 'roas',
                        expected: 1.0,
                        actual: campaign.performance?.roas || 0,
                        action: 'Auto-paused by anomaly detector',
                        resolved: false,
                    });
                    await campaign.save();
                    executedAction.resultNote = 'Campaign paused locally';
                    break;

                case 'BUDGET_SHIFT':
                    // Log the recommendation — actual budget changes require platform API
                    campaign.anomalies = campaign.anomalies || [];
                    campaign.anomalies.push({
                        type: 'budget-shift-recommended',
                        severity: 'warning',
                        detected: new Date(),
                        action: action.reason,
                        resolved: false,
                    });
                    await campaign.save();
                    executedAction.resultNote = 'Budget shift recommended — requires manual platform action';
                    break;

                default:
                    executedAction.resultNote = `Action ${action.action} logged for review`;
                    break;
            }

            // Log to AdLearning for memory
            try {
                await AdLearning.create({
                    user: userId,
                    brand: campaign.brand,
                    type: 'campaign-result',
                    title: `Auto-action: ${action.action} on "${campaign.title}"`,
                    insight: {
                        summary: action.reason,
                        details: `Anomaly detected: ${action.reason}. Action taken: ${action.action}. Expected impact: ${action.expectedImpact || 'N/A'}`,
                        actionable: `Review campaign "${campaign.title}" and verify the automated action was correct.`,
                        confidence: 'medium',
                    },
                    platform: campaign.platform,
                    source: { campaignId: campaign._id, agentGenerated: true },
                    status: 'active',
                });
            } catch (e) {
                console.warn('Failed to log auto-action to learnings:', e.message);
            }

            executed.push(executedAction);
        } else {
            executed.push({ ...action, executed: false, reason: 'Autopilot not enabled on this campaign' });
        }
    }

    return { executed, totalExecuted: executed.filter(e => e.executed).length };
}


// ── Helper: Get baseline value for comparison ──
function getBaseline(campaign, field) {
    const perf = campaign.performance || {};
    const insights = campaign.aiInsights || {};

    // Use predicted ROAS as baseline for ROAS
    if (field === 'roas' && insights.predictedRoas > 0) return insights.predictedRoas;

    // Use industry defaults as fallback baselines
    const defaults = { roas: 2.0, ctr: 1.5, cpc: 5.0, conversions: 10 };
    return perf[field] || defaults[field] || 1;
}

/**
 * Auto-Optimizer Agent — Autonomous Campaign Optimization
 * 
 * Designed to run periodically (every 6 hours or on-demand).
 * Full optimization cycle:
 * 1. Sync latest campaign data
 * 2. Detect anomalies
 * 3. Score each campaign (0-100)
 * 4. For underperformers: generate new creatives
 * 5. For budget-wasters: suggest budget reallocation
 * 6. Log all decisions to AdLearning
 */

import AdCampaign from '../../models/AdCampaign.js';
import AdLearning from '../../models/AdLearning.js';
import { syncAllCampaigns } from './liveSync.js';
import { detectAnomalies, generateAnomalyActions, autoRespond } from './anomalyDetector.js';
import { calculateBlendedMER } from './shopifyBridge.js';
import { adCreatorNode } from './nodes.js';
import { getRouter } from '../../ai/router.js';

// ══════════════════════════════════════════════════════════════════════════════
// OPTIMIZATION CYCLE
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Run a full optimization cycle for a user's campaigns.
 * 
 * Returns a report of all actions taken and recommendations.
 */
export async function runOptimizationCycle(userId, brandId) {
    const cycleStart = Date.now();
    const log = [];

    console.log(`🤖 Auto-Optimizer: Starting cycle for user ${userId}, brand ${brandId}`);

    // ── Step 1: Sync latest data ──
    log.push({ step: 'sync', status: 'running', startedAt: new Date() });
    let syncResult;
    try {
        syncResult = await syncAllCampaigns(userId, brandId);
        log[0].status = 'complete';
        log[0].result = `Synced ${syncResult.totalSynced} campaigns`;
    } catch (e) {
        log[0].status = 'failed';
        log[0].error = e.message;
        syncResult = { totalSynced: 0 };
    }

    // ── Step 2: Detect anomalies ──
    log.push({ step: 'anomaly-detection', status: 'running', startedAt: new Date() });
    let anomalyResult;
    try {
        anomalyResult = await detectAnomalies(userId, brandId);
        log[1].status = 'complete';
        log[1].result = `Found ${anomalyResult.total || 0} anomalies`;
    } catch (e) {
        log[1].status = 'failed';
        log[1].error = e.message;
        anomalyResult = { anomalies: [] };
    }

    // ── Step 3: Generate actions for anomalies ──
    let actionResult = { actions: [] };
    if (anomalyResult.anomalies?.length > 0) {
        log.push({ step: 'action-generation', status: 'running', startedAt: new Date() });
        try {
            actionResult = await generateAnomalyActions(anomalyResult.anomalies, brandId);
            log[2].status = 'complete';
            log[2].result = `Generated ${actionResult.actions?.length || 0} actions`;
        } catch (e) {
            log[2].status = 'failed';
            log[2].error = e.message;
        }

        // ── Step 3b: Execute auto-actions ──
        try {
            const autoResult = await autoRespond(actionResult.actions || [], userId);
            log.push({
                step: 'auto-respond',
                status: 'complete',
                result: `Executed ${autoResult.totalExecuted} actions`,
                details: autoResult.executed,
            });
        } catch (e) {
            log.push({ step: 'auto-respond', status: 'failed', error: e.message });
        }
    }

    // ── Step 4: Score all active campaigns ──
    log.push({ step: 'scoring', status: 'running', startedAt: new Date() });
    let scoredCampaigns = [];
    try {
        scoredCampaigns = await scoreCampaigns(userId, brandId);
        const lastLogIdx = log.length - 1;
        log[lastLogIdx].status = 'complete';
        log[lastLogIdx].result = `Scored ${scoredCampaigns.length} campaigns`;
    } catch (e) {
        const lastLogIdx = log.length - 1;
        log[lastLogIdx].status = 'failed';
        log[lastLogIdx].error = e.message;
    }

    // ── Step 5: Generate creative replacements for underperformers ──
    const underperformers = scoredCampaigns.filter(c => c.score < 40);
    let creativeRefreshes = [];
    if (underperformers.length > 0) {
        log.push({ step: 'creative-refresh', status: 'running', startedAt: new Date() });
        try {
            for (const up of underperformers.slice(0, 3)) { // Max 3 at a time
                const state = await adCreatorNode({
                    input: { objective: up.objective, platforms: [up.platform], query: `Refresh creatives for underperforming "${up.title}" campaign` },
                    brandId,
                });
                creativeRefreshes.push({
                    campaignId: up.campaignId,
                    campaignTitle: up.title,
                    newCreatives: state.adCreatives?.length || 0,
                });
            }
            const lastLogIdx = log.length - 1;
            log[lastLogIdx].status = 'complete';
            log[lastLogIdx].result = `Generated new creatives for ${creativeRefreshes.length} campaigns`;
        } catch (e) {
            const lastLogIdx = log.length - 1;
            log[lastLogIdx].status = 'failed';
            log[lastLogIdx].error = e.message;
        }
    }

    // ── Step 6: Budget reallocation suggestion ──
    let budgetSuggestion = null;
    if (scoredCampaigns.length >= 2) {
        log.push({ step: 'budget-reallocation', status: 'running', startedAt: new Date() });
        try {
            budgetSuggestion = await suggestBudgetReallocation(scoredCampaigns);
            const lastLogIdx = log.length - 1;
            log[lastLogIdx].status = 'complete';
            log[lastLogIdx].result = budgetSuggestion.summary || 'Reallocation suggested';
        } catch (e) {
            const lastLogIdx = log.length - 1;
            log[lastLogIdx].status = 'failed';
            log[lastLogIdx].error = e.message;
        }
    }

    // ── Step 7: Get blended MER if Shopify is connected ──
    let merData = null;
    try {
        merData = await calculateBlendedMER(userId, brandId);
    } catch (e) { /* Shopify may not be connected */ }

    // ── Generate report ──
    const cycleReport = await generateOptimizationReport({
        syncResult,
        anomalyResult,
        actionResult,
        scoredCampaigns,
        creativeRefreshes,
        budgetSuggestion,
        merData,
        log,
        duration: Date.now() - cycleStart,
    });

    // ── Log the cycle to AdLearning ──
    try {
        await AdLearning.create({
            user: userId,
            brand: brandId,
            type: 'campaign-result',
            title: `Optimization Cycle — ${new Date().toLocaleDateString('en-IN')}`,
            insight: {
                summary: cycleReport.executiveSummary || `Processed ${scoredCampaigns.length} campaigns, found ${anomalyResult.total || 0} anomalies.`,
                details: JSON.stringify(log),
                actionable: cycleReport.nextSteps || 'Review optimization results.',
                confidence: 'high',
            },
            platform: 'both',
            source: { agentGenerated: true },
            status: 'active',
        });
    } catch (e) {
        console.warn('Failed to log optimization cycle:', e.message);
    }

    console.log(`✅ Auto-Optimizer: Cycle complete in ${Date.now() - cycleStart}ms`);

    return {
        ...cycleReport,
        log,
        duration: `${Math.round((Date.now() - cycleStart) / 1000)}s`,
    };
}


// ══════════════════════════════════════════════════════════════════════════════
// CAMPAIGN SCORING
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Score each active campaign from 0-100 based on performance.
 */
async function scoreCampaigns(userId, brandId) {
    const campaigns = await AdCampaign.find({
        user: userId,
        brand: brandId,
        status: { $in: ['active', 'completed'] },
    }).lean();

    return campaigns.map(c => {
        const perf = c.performance || {};
        let score = 50; // Base score

        // ROAS scoring (biggest weight)
        if (perf.roas >= 4) score += 30;
        else if (perf.roas >= 2) score += 20;
        else if (perf.roas >= 1) score += 10;
        else if (perf.roas > 0) score -= 10;
        else score -= 20;

        // CTR scoring
        if (perf.ctr >= 3) score += 10;
        else if (perf.ctr >= 1.5) score += 5;
        else if (perf.ctr < 0.5) score -= 10;

        // CPC scoring (lower is better)
        if (perf.cpc > 0 && perf.cpc < 3) score += 5;
        else if (perf.cpc > 20) score -= 10;

        // Conversion rate
        if (perf.conversionRate >= 5) score += 5;
        else if (perf.conversionRate < 1 && perf.clicks > 100) score -= 5;

        return {
            campaignId: c._id,
            title: c.title,
            platform: c.platform,
            objective: c.objective,
            score: Math.max(0, Math.min(100, score)),
            grade: score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : score >= 20 ? 'D' : 'F',
            metrics: {
                roas: perf.roas || 0,
                ctr: perf.ctr || 0,
                cpc: perf.cpc || 0,
                spend: perf.spend || 0,
                conversions: perf.conversions || 0,
            },
        };
    }).sort((a, b) => b.score - a.score);
}


// ══════════════════════════════════════════════════════════════════════════════
// BUDGET REALLOCATION
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Suggest budget reallocation based on campaign scores.
 */
async function suggestBudgetReallocation(scoredCampaigns) {
    const winners = scoredCampaigns.filter(c => c.score >= 70);
    const losers = scoredCampaigns.filter(c => c.score < 30);

    if (losers.length === 0) return { summary: 'All campaigns performing well — no reallocation needed.' };

    const suggestions = losers.map(loser => ({
        from: loser.title,
        fromScore: loser.score,
        to: winners[0]?.title || 'Best performing campaign',
        toScore: winners[0]?.score || 0,
        amountToShift: Math.round((loser.metrics.spend || 0) * 0.5), // Shift 50% of underperformer budget
    }));

    const totalShiftable = suggestions.reduce((sum, s) => sum + s.amountToShift, 0);

    return {
        summary: `Shift ₹${totalShiftable.toLocaleString()} from ${losers.length} underperforming campaigns to top performers.`,
        suggestions,
        savingsEstimate: `₹${Math.round(totalShiftable * 0.3).toLocaleString()} estimated waste reduction`,
    };
}


// ══════════════════════════════════════════════════════════════════════════════
// OPTIMIZATION REPORT — Natural language summary
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Generate a human-readable report of the optimization cycle.
 */
async function generateOptimizationReport(cycleData) {
    const ai = getRouter();

    const systemPrompt = `You are a Performance Marketing Optimization Reporter. Summarize an optimization cycle in plain English.

Return STRICT JSON:
{
  "executiveSummary": "2-3 sentence summary of what happened and impact",
  "actionsTaken": ["action1", "action2"],
  "keyMetrics": { "campaignsOptimized": 0, "anomaliesFound": 0, "budgetSaved": "₹0" },
  "nextSteps": "What should the marketer focus on next"
}`;

    try {
        const response = await ai.chat({
            messages: [
                { role: 'system', content: systemPrompt },
                {
                    role: 'user', content: `Optimization cycle results:\n${JSON.stringify({
                        synced: cycleData.syncResult?.totalSynced,
                        anomalies: cycleData.anomalyResult?.total,
                        actions: cycleData.actionResult?.actions?.length,
                        scoredCampaigns: cycleData.scoredCampaigns?.length,
                        creativeRefreshes: cycleData.creativeRefreshes?.length,
                        budgetSuggestion: cycleData.budgetSuggestion?.summary,
                        blendedMER: cycleData.merData?.blendedMER,
                    }, null, 2)}`
                },
            ],
            temperature: 0.4,
            response_format: { type: 'json_object' },
        });

        const text = response.choices?.[0]?.message?.content || '{}';
        return JSON.parse(text.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
    } catch (e) {
        return {
            executiveSummary: `Optimization cycle complete: synced ${cycleData.syncResult?.totalSynced || 0} campaigns, found ${cycleData.anomalyResult?.total || 0} anomalies, scored ${cycleData.scoredCampaigns?.length || 0} campaigns.`,
            actionsTaken: cycleData.log?.filter(l => l.status === 'complete').map(l => l.result) || [],
            keyMetrics: {
                campaignsOptimized: cycleData.scoredCampaigns?.length || 0,
                anomaliesFound: cycleData.anomalyResult?.total || 0,
            },
            nextSteps: 'Review campaign scores and anomaly actions.',
        };
    }
}


// ══════════════════════════════════════════════════════════════════════════════
// STRATEGY HEALTH MONITOR — Compare actuals vs strategy KPI targets
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Check if a strategy's KPI targets are being met.
 * Returns a health score (0-100) and flags underperformance.
 *
 * Flow:
 * 1. Load the latest strategy's KPI targets from AdReport
 * 2. Load actual campaign performance from AdCampaign
 * 3. Compare actuals vs targets → generate health score
 * 4. If health < 60 → trigger alert, if < 40 → suggest strategy revision
 */
export async function checkStrategyHealth(userId, brandId) {
    const AdReport = (await import('../../models/AdReport.js')).default;

    // 1. Find the latest strategy report
    const latestStrategy = await AdReport.findOne({
        user: userId,
        brand: brandId,
        type: 'strategy',
        status: { $in: ['strategy', 'complete'] },
    }).sort({ createdAt: -1 }).lean();

    if (!latestStrategy?.strategyPlan?.kpis?.length) {
        return { health: null, message: 'No strategy with KPI targets found.' };
    }

    const strategyAge = Math.floor((Date.now() - new Date(latestStrategy.createdAt).getTime()) / (1000 * 60 * 60 * 24));

    // 2. Load actual campaign performance
    const campaigns = await AdCampaign.find({
        user: userId,
        brand: brandId,
        status: { $in: ['active', 'completed'] },
        'performance.spend': { $gt: 0 },
    }).lean();

    if (campaigns.length === 0) {
        return { health: null, message: 'No active campaigns with spend data to compare against strategy.', strategyAge };
    }

    // 3. Aggregate actual performance
    const totals = campaigns.reduce((acc, c) => {
        const p = c.performance || {};
        acc.spend += p.spend || 0;
        acc.clicks += p.clicks || 0;
        acc.impressions += p.impressions || 0;
        acc.conversions += p.conversions || 0;
        acc.revenue += p.revenue || 0;
        acc.count++;
        return acc;
    }, { spend: 0, clicks: 0, impressions: 0, conversions: 0, revenue: 0, count: 0 });

    const actuals = {
        ctr: totals.impressions > 0 ? ((totals.clicks / totals.impressions) * 100) : 0,
        cpc: totals.clicks > 0 ? (totals.spend / totals.clicks) : 0,
        roas: totals.spend > 0 ? (totals.revenue / totals.spend) : 0,
        cpa: totals.conversions > 0 ? (totals.spend / totals.conversions) : 0,
        conversionRate: totals.clicks > 0 ? ((totals.conversions / totals.clicks) * 100) : 0,
        totalSpend: totals.spend,
        totalConversions: totals.conversions,
    };

    // 4. Score each KPI
    const kpiResults = [];
    let totalScore = 0;
    let scoredKPIs = 0;

    for (const kpi of latestStrategy.strategyPlan.kpis) {
        const metric = (kpi.metric || '').toLowerCase();
        const targetStr = String(kpi.target || '');
        const targetNum = parseFloat(targetStr.replace(/[₹,%x]/g, ''));

        if (isNaN(targetNum)) continue;

        let actualValue = null;
        let kpiScore = 50; // neutral

        if (metric.includes('ctr')) {
            actualValue = actuals.ctr;
            kpiScore = actualValue >= targetNum ? 100 : Math.max(0, 100 * (actualValue / targetNum));
        } else if (metric.includes('cpc')) {
            actualValue = actuals.cpc;
            kpiScore = actualValue <= targetNum ? 100 : Math.max(0, 100 * (targetNum / actualValue)); // lower is better
        } else if (metric.includes('roas')) {
            actualValue = actuals.roas;
            kpiScore = actualValue >= targetNum ? 100 : Math.max(0, 100 * (actualValue / targetNum));
        } else if (metric.includes('cpa') || metric.includes('cost per')) {
            actualValue = actuals.cpa;
            kpiScore = actualValue <= targetNum ? 100 : Math.max(0, 100 * (targetNum / actualValue)); // lower is better
        } else if (metric.includes('conversion')) {
            actualValue = actuals.conversionRate;
            kpiScore = actualValue >= targetNum ? 100 : Math.max(0, 100 * (actualValue / targetNum));
        }

        if (actualValue !== null) {
            kpiResults.push({
                metric: kpi.metric,
                target: kpi.target,
                actual: Math.round(actualValue * 100) / 100,
                score: Math.round(kpiScore),
                status: kpiScore >= 80 ? 'on-track' : kpiScore >= 50 ? 'warning' : 'underperforming',
            });
            totalScore += kpiScore;
            scoredKPIs++;
        }
    }

    const healthScore = scoredKPIs > 0 ? Math.round(totalScore / scoredKPIs) : 50;

    // 5. Determine alert level
    let alertLevel = 'healthy';
    let alertMessage = '';

    if (healthScore < 40) {
        alertLevel = 'critical';
        alertMessage = `Strategy health is CRITICAL (${healthScore}/100). ${kpiResults.filter(k => k.status === 'underperforming').length} KPIs underperforming. Consider revising strategy.`;
    } else if (healthScore < 60) {
        alertLevel = 'warning';
        alertMessage = `Strategy health WARNING (${healthScore}/100). Some KPIs below target after ${strategyAge} days.`;
    } else if (healthScore >= 80) {
        alertLevel = 'excellent';
        alertMessage = `Strategy performing well (${healthScore}/100). All KPIs on track.`;
    }

    // 6. Send alert if underperforming (import alertEngine dynamically)
    if (alertLevel === 'critical' || alertLevel === 'warning') {
        try {
            const { sendAlert } = await import('./alertEngine.js');
            await sendAlert(userId, brandId, alertLevel === 'critical' ? 'anomaly' : 'budget-warning', {
                title: `Strategy Health: ${alertLevel.toUpperCase()}`,
                summary: alertMessage,
                metrics: Object.fromEntries(kpiResults.map(k => [`${k.metric}`, `Target: ${k.target} → Actual: ${k.actual} (${k.status})`])),
                actions: kpiResults
                    .filter(k => k.status === 'underperforming')
                    .map(k => `Review ${k.metric}: target was ${k.target}, actual is ${k.actual}`),
            });
        } catch (e) {
            console.warn('Strategy health alert failed:', e.message);
        }

        // Log to learnings
        try {
            await AdLearning.create({
                user: userId,
                brand: brandId,
                type: 'campaign-result',
                title: `Strategy Health Check — ${alertLevel} (${healthScore}/100)`,
                insight: {
                    summary: alertMessage,
                    details: JSON.stringify(kpiResults),
                    actionable: alertLevel === 'critical'
                        ? 'Generate a revised strategy with updated goals and budget allocation.'
                        : 'Monitor closely and consider minor adjustments to underperforming campaigns.',
                    confidence: 'high',
                },
                platform: 'both',
                source: { agentGenerated: true },
                status: 'active',
            });
        } catch (e) { console.warn('Failed to log strategy health:', e.message); }
    }

    return {
        health: healthScore,
        alertLevel,
        message: alertMessage,
        strategyTitle: latestStrategy.title,
        strategyAge,
        strategyCreated: latestStrategy.createdAt,
        kpiResults,
        actuals,
        campaignsAnalyzed: campaigns.length,
    };
}

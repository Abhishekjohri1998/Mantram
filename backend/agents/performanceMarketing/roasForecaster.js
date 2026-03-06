/**
 * ROAS Forecaster — Predictive Campaign Intelligence
 * 
 * Analyzes historical campaign data and AdLearning insights to predict
 * expected ROAS for a new campaign configuration before launch.
 */

import AdCampaign from '../../models/AdCampaign.js';
import AdLearning from '../../models/AdLearning.js';
import { getRouter } from '../../ai/router.js';

// ══════════════════════════════════════════════════════════════════════════════
// ROAS PREDICTION
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Predict ROAS for a campaign configuration before launch.
 * 
 * Analyzes:
 * 1. Historical campaigns with similar platform/objective/budget
 * 2. AdLearning insights for the brand
 * 3. Seasonal patterns
 * 4. Audience saturation signals
 */
export async function forecastROAS(campaignConfig, brandId) {
    const { platform, objective, budget, targeting } = campaignConfig;

    // 1. Find similar historical campaigns
    const filter = { brand: brandId, status: { $in: ['completed', 'active'] } };
    if (platform && platform !== 'both') filter.platform = platform;
    if (objective) filter.objective = objective;

    const historicalCampaigns = await AdCampaign.find(filter)
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();

    // 2. Calculate statistical baselines from history
    const withRoas = historicalCampaigns.filter(c => c.performance?.roas > 0 && c.performance?.spend > 0);
    const avgRoas = withRoas.length > 0
        ? withRoas.reduce((sum, c) => sum + c.performance.roas, 0) / withRoas.length
        : 0;
    const medianRoas = withRoas.length > 0
        ? withRoas.map(c => c.performance.roas).sort((a, b) => a - b)[Math.floor(withRoas.length / 2)]
        : 0;
    const bestRoas = withRoas.length > 0
        ? Math.max(...withRoas.map(c => c.performance.roas))
        : 0;
    const worstRoas = withRoas.length > 0
        ? Math.min(...withRoas.map(c => c.performance.roas))
        : 0;

    // 3. Get brand learnings for context
    const learnings = await AdLearning.find({
        brand: brandId,
        status: 'active',
        type: { $in: ['campaign-result', 'audience-insight', 'seasonal-pattern'] },
    }).sort({ createdAt: -1 }).limit(10).lean();

    const learningContext = learnings.map(l =>
        `[${l.type}] ${l.insight.summary} (Confidence: ${l.insight.confidence})`
    ).join('\n');

    // 4. AI prediction with context
    const ai = getRouter();
    const systemPrompt = `You are a Performance Marketing Forecasting Engine. Predict ROAS for a planned campaign.

Given:
- Historical campaign data (avg, median, best, worst ROAS)
- AI-accumulated brand learnings
- New campaign configuration

Return STRICT JSON:
{
  "predictedRoas": {
    "low": 0.0,
    "mid": 0.0,
    "high": 0.0
  },
  "confidence": "high|medium|low",
  "reasoning": "2-3 sentence explanation",
  "keyFactors": ["factor1", "factor2", "factor3"],
  "risks": ["risk1", "risk2"],
  "suggestions": ["suggestion to improve predicted ROAS"],
  "similarCampaigns": [
    { "title": "...", "roas": 0.0, "spend": 0, "similarity": "high|medium" }
  ]
}`;

    const userPrompt = `
HISTORICAL DATA:
- ${withRoas.length} past campaigns analyzed
- Average ROAS: ${avgRoas.toFixed(2)}x
- Median ROAS: ${medianRoas.toFixed(2)}x
- Best ROAS: ${bestRoas.toFixed(2)}x
- Worst ROAS: ${worstRoas.toFixed(2)}x

BRAND LEARNINGS:
${learningContext || 'No learnings stored yet.'}

NEW CAMPAIGN CONFIG:
- Platform: ${platform || 'meta'}
- Objective: ${objective || 'traffic'}
- Budget: ${JSON.stringify(budget || {})}
- Targeting: ${JSON.stringify(targeting || {})}

Predict the expected ROAS range for this campaign.`;

    try {
        const response = await ai.chat({
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            temperature: 0.4,
            response_format: { type: 'json_object' },
        });

        const text = response.choices?.[0]?.message?.content || '{}';
        const prediction = JSON.parse(text.replace(/```json?\n?/g, '').replace(/```/g, '').trim());

        return {
            ...prediction,
            historicalStats: {
                campaignsAnalyzed: withRoas.length,
                avgRoas: Math.round(avgRoas * 100) / 100,
                medianRoas: Math.round(medianRoas * 100) / 100,
                bestRoas: Math.round(bestRoas * 100) / 100,
                worstRoas: Math.round(worstRoas * 100) / 100,
            },
            learningsUsed: learnings.length,
        };
    } catch (e) {
        console.error('ROAS forecast failed:', e.message);

        // Fallback: statistical prediction without AI
        return {
            predictedRoas: {
                low: Math.round(Math.max(worstRoas, avgRoas * 0.7) * 100) / 100,
                mid: Math.round(avgRoas * 100) / 100,
                high: Math.round(Math.min(bestRoas, avgRoas * 1.5) * 100) / 100,
            },
            confidence: withRoas.length >= 5 ? 'medium' : 'low',
            reasoning: `Based on ${withRoas.length} historical campaigns with average ${avgRoas.toFixed(2)}x ROAS. AI analysis unavailable.`,
            keyFactors: ['Historical average', 'Platform', 'Objective'],
            risks: ['Limited data'],
            suggestions: ['Run more campaigns to improve prediction accuracy'],
            historicalStats: {
                campaignsAnalyzed: withRoas.length,
                avgRoas: Math.round(avgRoas * 100) / 100,
                medianRoas: Math.round(medianRoas * 100) / 100,
                bestRoas: Math.round(bestRoas * 100) / 100,
                worstRoas: Math.round(worstRoas * 100) / 100,
            },
            fallbackMode: true,
        };
    }
}

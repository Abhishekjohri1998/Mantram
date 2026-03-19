/**
 * Pricing Monitor Agent — tracks LLM/API cost changes
 *
 * Runs every 24 hours. Compares current hardcoded costs against stored
 * baselines in SystemSettings. If any cost drifts, logs an alert and
 * flags it for super admin review.
 *
 * Monitored:
 *   - Text LLMs: Claude, Gemini, Grok, Sarvam
 *   - Image models: Gemini, Imagen
 *   - Video models: Kling, Veo, Seedance, Grok Imagine
 *   - Voice models: MiniMax, Sarvam STT/TTS
 */

import { getSetting, setSetting } from '../models/SystemSettings.js';
import { MODEL_COSTS } from '../middleware/credits.js';

const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ── Known provider pricing (updated manually when providers announce changes) ──
// These are the "ground truth" costs we compare against our stored baselines.
export const PROVIDER_PRICING = {
    'anthropic': {
        provider: 'Anthropic', icon: '🟠',
        models: {
            'claude-sonnet-4-20250514': {
                name: 'Claude Sonnet 4', type: 'text',
                inputPer1M: 3.00, outputPer1M: 15.00, unit: 'USD/1M tokens',
                pricingUrl: 'https://docs.anthropic.com/en/docs/about-claude/pricing',
            },
        },
    },
    'gemini': {
        provider: 'Google Gemini', icon: '🔵',
        models: {
            'gemini-2.5-flash': {
                name: 'Gemini 2.5 Flash', type: 'text',
                inputPer1M: 0.15, outputPer1M: 0.60, unit: 'USD/1M tokens',
                pricingUrl: 'https://ai.google.dev/pricing',
            },
            'gemini-2.5-pro': {
                name: 'Gemini 2.5 Pro', type: 'text',
                inputPer1M: 1.25, outputPer1M: 5.00, unit: 'USD/1M tokens',
                pricingUrl: 'https://ai.google.dev/pricing',
            },
            'gemini-3.1-flash-image-preview': {
                name: 'Gemini Image Gen', type: 'image',
                flatCostUSD: 0.04, unit: 'USD/image',
                pricingUrl: 'https://ai.google.dev/pricing',
            },
        },
    },
    'xai': {
        provider: 'xAI (Grok)', icon: '⚫',
        models: {
            'grok-3-mini-fast': {
                name: 'Grok 3 Mini Fast', type: 'text',
                inputPer1M: 0.30, outputPer1M: 1.00, unit: 'USD/1M tokens',
                pricingUrl: 'https://docs.x.ai/docs/models',
            },
        },
    },
    'sarvam': {
        provider: 'Sarvam AI', icon: '🟢',
        models: {
            'sarvam-stt-saaras-v3': {
                name: 'Saaras STT v3', type: 'voice',
                costPerMinute: 0.018, unit: 'USD/min (₹1.5/min)',
                pricingUrl: 'https://www.sarvam.ai/pricing',
            },
            'sarvam-tts-bulbul-v2': {
                name: 'Bulbul TTS v2', type: 'voice',
                costPerMinute: 0.014, unit: 'USD/min (₹1.2/min)',
                pricingUrl: 'https://www.sarvam.ai/pricing',
            },
        },
    },
    'fal': {
        provider: 'fal.ai (Video)', icon: '🎥',
        models: {
            'kling-3.0': {
                name: 'Kling 3.0', type: 'video',
                costPerSecFast: 0.07, costPerSecQuality: 0.12, unit: 'USD/sec',
                pricingUrl: 'https://fal.ai/pricing',
            },
            'veo-3.1': {
                name: 'Veo 3.1', type: 'video',
                costPerSecFast: 0.15, costPerSecQuality: 0.40, unit: 'USD/sec',
                pricingUrl: 'https://fal.ai/pricing',
            },
            'veo-3.1-fast': {
                name: 'Veo 3.1 Fast', type: 'video',
                costPerSecFast: 0.08, costPerSecQuality: 0.15, unit: 'USD/sec',
                pricingUrl: 'https://fal.ai/pricing',
            },
            'seedance-1.0': {
                name: 'Seedance 1.0 Lite', type: 'video',
                costPerSecFast: 0.05, costPerSecQuality: 0.08, unit: 'USD/sec',
                pricingUrl: 'https://fal.ai/pricing',
            },
            'seedance-2.0': {
                name: 'Seedance 2.0 Pro', type: 'video',
                costPerSecFast: 0.08, costPerSecQuality: 0.15, unit: 'USD/sec',
                pricingUrl: 'https://fal.ai/pricing',
            },
        },
    },
    'minimax': {
        provider: 'MiniMax', icon: '🔊',
        models: {
            'minimax-speech-02-hd': {
                name: 'Speech-02 HD', type: 'voice',
                costPerSecond: 0.01, unit: 'USD/sec',
                pricingUrl: 'https://www.minimax.io/platform/pricing',
            },
        },
    },
    'grok-video': {
        provider: 'xAI (Grok Video)', icon: '🤖',
        models: {
            'grok-imagine': {
                name: 'Grok Imagine Video', type: 'video',
                costPerSecFast: 0.08, costPerSecQuality: 0.08, unit: 'USD/sec',
                pricingUrl: 'https://docs.x.ai/docs/models',
            },
        },
    },
};

/**
 * Compare current costs against stored baselines.
 * Returns array of changes found.
 */
export async function checkPricingChanges() {
    const baseline = await getSetting('pricing_baselines', null);
    const now = new Date().toISOString();
    const changes = [];

    // Flatten current costs
    const currentCosts = {};
    for (const [providerId, provider] of Object.entries(PROVIDER_PRICING)) {
        for (const [modelId, model] of Object.entries(provider.models)) {
            currentCosts[`${providerId}::${modelId}`] = { ...model, providerId, modelId };
        }
    }

    if (!baseline) {
        // First run — save current as baseline
        await setSetting('pricing_baselines', currentCosts);
        await setSetting('pricing_last_check', now);
        console.log('📊 Pricing Monitor: baseline saved (%d models)', Object.keys(currentCosts).length);
        return [];
    }

    // Compare each model
    for (const [key, current] of Object.entries(currentCosts)) {
        const prev = baseline[key];
        if (!prev) {
            changes.push({ key, type: 'new_model', model: current.name, details: 'New model added to monitoring' });
            continue;
        }

        // Compare relevant cost fields
        const fields = ['inputPer1M', 'outputPer1M', 'flatCostUSD', 'costPerSecFast', 'costPerSecQuality', 'costPerMinute', 'costPerSecond'];
        for (const field of fields) {
            if (current[field] !== undefined && prev[field] !== undefined && current[field] !== prev[field]) {
                const pctChange = ((current[field] - prev[field]) / prev[field] * 100).toFixed(1);
                changes.push({
                    key, model: current.name, field,
                    type: current[field] > prev[field] ? 'price_increase' : 'price_decrease',
                    oldValue: prev[field], newValue: current[field],
                    pctChange: parseFloat(pctChange),
                    details: `${field}: $${prev[field]} → $${current[field]} (${pctChange}%)`,
                });
            }
        }
    }

    // Update baseline + timestamp
    await setSetting('pricing_baselines', currentCosts);
    await setSetting('pricing_last_check', now);

    if (changes.length > 0) {
        // Store alerts
        const existingAlerts = await getSetting('pricing_alerts', []);
        const newAlerts = changes.map(c => ({ ...c, detectedAt: now }));
        await setSetting('pricing_alerts', [...newAlerts, ...existingAlerts].slice(0, 100));
        console.log('⚠️ Pricing Monitor: %d changes detected!', changes.length);
    } else {
        console.log('✅ Pricing Monitor: no changes (checked %d models)', Object.keys(currentCosts).length);
    }

    return changes;
}

/**
 * Calculate margin impact if a specific model's cost changes.
 */
export function simulateImpact(modelId, newCostMultiplier = 1.0) {
    const modelCost = MODEL_COSTS[modelId];
    if (!modelCost) return null;

    const currentCost = modelCost.flatCost || ((modelCost.input + modelCost.output) / 2) || 0;
    const newCost = currentCost * newCostMultiplier;
    const creditPriceINR = 5; // Floor price
    const exchangeRate = 85;

    return {
        modelId,
        currentCostCents: currentCost,
        newCostCents: newCost,
        currentCostINR: (currentCost / 100) * exchangeRate,
        newCostINR: (newCost / 100) * exchangeRate,
        marginImpact: currentCost > 0 ? ((newCost - currentCost) / currentCost * 100).toFixed(1) + '%' : '0%',
    };
}

/**
 * Start the background price monitor (24h interval)
 */
export function startPricingMonitor() {
    // Run initial check after 30s (let DB connect first)
    setTimeout(() => {
        checkPricingChanges().catch(err => console.error('❌ Pricing Monitor initial check failed:', err));
    }, 30_000);

    // Schedule recurring checks
    setInterval(() => {
        checkPricingChanges().catch(err => console.error('❌ Pricing Monitor check failed:', err));
    }, INTERVAL_MS);

    console.log('📊 Pricing Monitor active — checking every 24h');
}

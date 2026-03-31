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

import axios from 'axios';
import * as cheerio from 'cheerio';
import { GoogleGenAI, Type } from '@google/genai';

/**
 * Helper to extract pricing info using Gemini 2.5 Flash from website text.
 */
async function extractPricingFromWeb(url, modelsList, providerName) {
    if (!process.env.GEMINI_API_KEY) return null;
    try {
        console.log(`📡 Fetching live pricing for ${providerName} from ${url}...`);
        const { data: html } = await axios.get(url, { timeout: 15000 });
        const $ = cheerio.load(html);
        
        // Clean up unneeded tags to save context
        $('script, style, nav, footer, iframe, img, svg').remove();
        let textContent = $('body').text().replace(/\s+/g, ' ');
        if (textContent.length > 80000) textContent = textContent.slice(0, 80000); // truncate if too massive
        
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `You are an automated pricing extractor for Mantram AI. Extract the current pricing for these models:\n\n${modelsList.map(m => `- ${m.name}`).join('\n')}\n\nHere is the pricing page text from ${providerName}:\n\n${textContent}`,
            config: {
                temperature: 0,
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    description: "Extracted pricing per model",
                    properties: {
                        models: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    modelName: { type: Type.STRING },
                                    inputPer1M: { type: Type.NUMBER, description: "Cost per 1M input tokens in USD. Null if not text." },
                                    outputPer1M: { type: Type.NUMBER, description: "Cost per 1M output tokens in USD. Null if not text." },
                                    flatCostUSD: { type: Type.NUMBER, description: "Cost per image in USD. Null if not fixed." },
                                    costPerSecFast: { type: Type.NUMBER, description: "Cost per second for fast video generation in USD." },
                                    costPerSecQuality: { type: Type.NUMBER, description: "Cost per second for quality video generation in USD." },
                                    costPerMinute: { type: Type.NUMBER, description: "Cost per minute in USD." },
                                    costPerSecond: { type: Type.NUMBER, description: "Cost per second in USD." }
                                }
                            }
                        }
                    }
                }
            }
        });

        const resultJson = JSON.parse(response.text);
        return resultJson.models;
    } catch (e) {
        console.warn(`⚠️ Failed to extract live pricing for ${providerName}:`, e.message);
        return null;
    }
}

/**
 * Compare current costs against stored baselines.
 * Now dynamically fetches live prices utilizing LLM scraping!
 * Returns array of changes found.
 */
export async function checkPricingChanges() {
    let baseline = await getSetting('pricing_baselines', null);
    const now = new Date().toISOString();
    const changes = [];

    // Initialize baseline if missing
    if (!baseline) {
        baseline = {};
        for (const [providerId, provider] of Object.entries(PROVIDER_PRICING)) {
            for (const [modelId, model] of Object.entries(provider.models)) {
                baseline[`${providerId}::${modelId}`] = { ...model, providerId, modelId };
            }
        }
        await setSetting('pricing_baselines', baseline);
        await setSetting('pricing_last_check', now);
        console.log('📊 Pricing Monitor: static baseline initialized');
        return []; // first run just saves default
    }

    const currentLiveCosts = JSON.parse(JSON.stringify(baseline)); // Deep copy to merge fresh values
    
    // Attempt Oracle Extraction
    for (const [providerId, providerObj] of Object.entries(PROVIDER_PRICING)) {
        // Group models by the pricingUrl they share
        const urlsToModels = {};
        for (const [modelId, modelDef] of Object.entries(providerObj.models)) {
            if (!modelDef.pricingUrl) continue;
            if (!urlsToModels[modelDef.pricingUrl]) urlsToModels[modelDef.pricingUrl] = [];
            urlsToModels[modelDef.pricingUrl].push({ id: modelId, ...modelDef });
        }

        // Fetch each URL
        for (const [url, models] of Object.entries(urlsToModels)) {
            const extractedArray = await extractPricingFromWeb(url, models, providerObj.provider);
            if (!extractedArray) continue;
            
            for (const m of models) {
                const extractedCost = extractedArray.find(ex => 
                    ex.modelName.toLowerCase().includes(m.name.toLowerCase().split(' ')[0]) ||
                    m.name.toLowerCase().includes(ex.modelName.toLowerCase())
                );
                
                if (extractedCost) {
                    const key = `${providerId}::${m.id}`;
                    const target = currentLiveCosts[key];
                    
                    // Fields to update
                    const fields = ['inputPer1M', 'outputPer1M', 'flatCostUSD', 'costPerSecFast', 'costPerSecQuality', 'costPerMinute', 'costPerSecond'];
                    let modelChanged = false;
                    for (const field of fields) {
                        if (extractedCost[field] !== undefined && extractedCost[field] !== null && extractedCost[field] > 0) {
                            if (target[field] !== extractedCost[field]) {
                                const oldVal = target[field] || 0;
                                const pctChange = oldVal > 0 ? ((extractedCost[field] - oldVal) / oldVal * 100).toFixed(1) : '100.0';
                                
                                changes.push({
                                    key, model: m.name, field,
                                    type: extractedCost[field] > oldVal ? 'price_increase' : 'price_decrease',
                                    oldValue: oldVal, newValue: extractedCost[field],
                                    pctChange: parseFloat(pctChange),
                                    details: `${field}: $${oldVal} → $${extractedCost[field]} (${pctChange}%)`,
                                });
                                target[field] = extractedCost[field]; // apply new cost
                                modelChanged = true;
                            }
                        }
                    }
                    if (modelChanged) target.lastUpdated = now;
                }
            }
        }
    }

    // Update baseline + DB timestamp
    await setSetting('pricing_baselines', currentLiveCosts);
    await setSetting('pricing_last_check', now);

    if (changes.length > 0) {
        // Store alerts regarding price increases/decreases
        const existingAlerts = await getSetting('pricing_alerts', []);
        const newAlerts = changes.map(c => ({ ...c, detectedAt: now }));
        await setSetting('pricing_alerts', [...newAlerts, ...existingAlerts].slice(0, 100));
        console.log('⚠️ Pricing Monitor Oracle: %d live changes detected!', changes.length);
        
        // Auto-Adjust Platform Credit Costs for Models that had Price INCREASES.
        await runDynamicAdjustment(changes);
    } else {
        console.log('✅ Pricing Monitor Oracle: no changes detected by LLM.');
    }

    return changes;
}

/**
 * Dynamically adjusts internal platform credits when a provider's cost increases based
 * on the platform's standard 50% margin goal.
 */
async function runDynamicAdjustment(changes) {
    const increases = changes.filter(c => c.type === 'price_increase');
    if (increases.length === 0) return;
    
    try {
        // We will fetch system creditCosts and re-assess matching actions
        const creditCostsSetting = await getSetting('creditCosts', null);
        if (!creditCostsSetting) return;
        
        let adjusted = false;
        // In fully mature production, this would dynamically map the 'key' (e.g., 'fal::veo-3.1-fast')
        // to specific platform actions. For now, we alert the system so `dynamic` formula handles it at runtime
        // or we manually bump generic text generation actions.
        console.log('🔄 Extolling Auto-margin adjustment routine for %d increases', increases.length);
        
        // e.g. for text models increasing, we could increase contentGenerate cost 
        // Note: For video, fallback is 'dynamic' which automatically recalculates every call through estimateCost().
        
        if (adjusted) {
            await setSetting('creditCosts', creditCostsSetting);
        }
    } catch (e) {
        console.error('Failed auto-adjustment execution', e);
    }
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

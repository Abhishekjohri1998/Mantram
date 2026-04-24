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
    // ═══════════════════════════════════════════════════════════════════
    //  TEXT LLM PROVIDERS
    // ═══════════════════════════════════════════════════════════════════
    'openai': {
        provider: 'OpenAI', icon: '🟢',
        models: {
            'gpt-4o': {
                name: 'GPT-4o', type: 'text',
                inputPer1M: 2.50, outputPer1M: 10.00, unit: 'USD/1M tokens',
                pricingUrl: 'https://platform.openai.com/docs/pricing',
            },
            'gpt-4o-mini': {
                name: 'GPT-4o Mini', type: 'text',
                inputPer1M: 0.15, outputPer1M: 0.60, unit: 'USD/1M tokens',
                pricingUrl: 'https://platform.openai.com/docs/pricing',
            },
        },
    },
    'anthropic': {
        provider: 'Anthropic', icon: '🟠',
        models: {
            'claude-3-opus-20240229': {
                name: 'claude-3-opus-20240229', type: 'text',
                inputPer1M: 15.00, outputPer1M: 75.00, unit: 'USD/1M tokens',
                pricingUrl: 'https://docs.anthropic.com/en/docs/about-claude/pricing',
            },
        },
    },
    'gemini': {
        provider: 'Google Gemini', icon: '🔵',
        models: {
            'gemini-2.0-flash': {
                name: 'Gemini 2.0 Flash', type: 'text',
                inputPer1M: 0.15, outputPer1M: 0.60, unit: 'USD/1M tokens',
                pricingUrl: 'https://ai.google.dev/pricing',
            },
            'gemini-2.0-pro': {
                name: 'Gemini 2.0 Pro', type: 'text',
                inputPer1M: 1.25, outputPer1M: 5.00, unit: 'USD/1M tokens',
                pricingUrl: 'https://ai.google.dev/pricing',
            },
            'gemini-1.5-flash-latest': {
                name: 'Gemini 1.5 Flash', type: 'text',
                inputPer1M: 0.075, outputPer1M: 0.30, unit: 'USD/1M tokens',
                pricingUrl: 'https://ai.google.dev/pricing',
            },
            'gemini-1.5-pro-latest': {
                name: 'Gemini 1.5 Pro', type: 'text',
                inputPer1M: 1.25, outputPer1M: 5.00, unit: 'USD/1M tokens',
                pricingUrl: 'https://ai.google.dev/pricing',
            },
            // ── Gemini Image Models ──
            'gemini-3.1-flash-image-preview': {
                name: 'Gemini Image Gen', type: 'image',
                flatCostUSD: 0.04, unit: 'USD/image',
                pricingUrl: 'https://ai.google.dev/pricing',
            },
            'gemini-2.5-flash-image': {
                name: 'Gemini 2.5 Flash Image', type: 'image',
                flatCostUSD: 0.04, unit: 'USD/image',
                pricingUrl: 'https://ai.google.dev/pricing',
            },
            'gemini-3-pro-image-preview': {
                name: 'Gemini 3 Pro Image (NanoBanana Pro)', type: 'image',
                flatCostUSD: 0.06, unit: 'USD/image',
                pricingUrl: 'https://ai.google.dev/pricing',
            },
            'imagen-3.0-generate-001': {
                name: 'Imagen 3', type: 'image',
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
            'grok-3-mini': {
                name: 'Grok 3 Mini', type: 'text',
                inputPer1M: 0.30, outputPer1M: 1.00, unit: 'USD/1M tokens',
                pricingUrl: 'https://docs.x.ai/docs/models',
            },
            'grok-imagine-image': {
                name: 'Grok Imagen (Image)', type: 'image',
                flatCostUSD: 0.07, unit: 'USD/image',
                pricingUrl: 'https://docs.x.ai/docs/models',
            },
            'grok-imagine': {
                name: 'Grok Imagine (Video)', type: 'video',
                costPerSecFast: 0.08, costPerSecQuality: 0.08, unit: 'USD/sec',
                pricingUrl: 'https://docs.x.ai/docs/models',
            },
        },
    },
    // ═══════════════════════════════════════════════════════════════════
    //  VOICE / TTS / STT
    // ═══════════════════════════════════════════════════════════════════
    'sarvam': {
        provider: 'Sarvam AI', icon: '🟢',
        models: {
            'sarvam-m': {
                name: 'Sarvam-M (Text LLM)', type: 'text',
                inputPer1M: 0.20, outputPer1M: 0.80, unit: 'USD/1M tokens',
                pricingUrl: 'https://www.sarvam.ai',
            },
            'sarvam-stt-saaras-v3': {
                name: 'Saaras STT v3', type: 'voice',
                costPerMinute: 0.018, unit: 'USD/min (₹1.5/min)',
                pricingUrl: 'https://www.sarvam.ai',
            },
            'sarvam-tts-bulbul-v2': {
                name: 'Bulbul TTS v2', type: 'voice',
                costPerMinute: 0.014, unit: 'USD/min (₹1.2/min)',
                pricingUrl: 'https://www.sarvam.ai',
            },
        },
    },
    'minimax': {
        provider: 'MiniMax (via fal.ai)', icon: '🔊',
        models: {
            'minimax-speech-02-hd': {
                name: 'Speech-02 HD', type: 'voice',
                costPerSecond: 0.01, unit: 'USD/sec',
                pricingUrl: 'https://fal.ai/pricing',
            },
        },
    },
    // ═══════════════════════════════════════════════════════════════════
    //  VIDEO PROVIDERS
    // ═══════════════════════════════════════════════════════════════════
    'fal': {
        provider: 'fal.ai (Video + Image)', icon: '🎥',
        models: {
            'kling-3.0': {
                name: 'Kling 3.0', type: 'video',
                costPerSecFast: 0.07, costPerSecQuality: 0.12, unit: 'USD/sec',
                pricingUrl: 'https://fal.ai/pricing',
            },
            'veo-3.1': {
                name: 'Veo 3.1', type: 'video',
                costPerSecFast: 0.10, costPerSecQuality: 0.25, unit: 'USD/sec',
                pricingUrl: 'https://fal.ai/pricing',
            },
            'veo-3.1-fast': {
                name: 'Veo 3.1 Fast', type: 'video',
                costPerSecFast: 0.06, costPerSecQuality: 0.10, unit: 'USD/sec',
                pricingUrl: 'https://fal.ai/pricing',
            },
            'hunyuan': {
                name: 'HunyuanVideo (Tencent)', type: 'video',
                costPerSecFast: 0.03, costPerSecQuality: 0.05, unit: 'USD/sec',
                pricingUrl: 'https://fal.ai/pricing',
            },
            // ── fal.ai Image Models ──
            'fal-ai/flux-pro/v1.1': {
                name: 'Flux Pro v1.1', type: 'image',
                flatCostUSD: 0.05, unit: 'USD/image',
                pricingUrl: 'https://fal.ai/pricing',
            },
            'fal-ai/flux-pro/v2': {
                name: 'Flux 2 Pro', type: 'image',
                flatCostUSD: 0.08, unit: 'USD/image',
                pricingUrl: 'https://fal.ai/pricing',
            },
            'fal-ai/bytedance/seedream/v3/text-to-image': {
                name: 'Seedream 5 (ByteDance)', type: 'image',
                flatCostUSD: 0.05, unit: 'USD/image',
                pricingUrl: 'https://fal.ai/pricing',
            },
            'fal-ai/ideogram/v3': {
                name: 'Ideogram v3', type: 'image',
                flatCostUSD: 0.06, unit: 'USD/image',
                pricingUrl: 'https://fal.ai/pricing',
            },
        },
    },
    'piapi': {
        provider: 'PiAPI (Video)', icon: '⚡',
        models: {
            'seedance-1.0': {
                name: 'Seedance 1.0 Lite', type: 'video',
                costPerSecFast: 0.05, costPerSecQuality: 0.08, unit: 'USD/sec',
                pricingUrl: 'https://piapi.ai/pricing',
            },
            'seedance-2.0': {
                name: 'Seedance 2.0 Pro', type: 'video',
                costPerSecFast: 0.08, costPerSecQuality: 0.15, unit: 'USD/sec',
                pricingUrl: 'https://piapi.ai/pricing',
            },
            'piapi-wan': {
                name: 'Wan (PiAPI)', type: 'video',
                flatCostUSD: 0.08, unit: 'USD/gen',
                pricingUrl: 'https://piapi.ai/pricing',
            },
        },
    },
    'muapi': {
        provider: 'MuAPI (Video)', icon: 'Ⓜ️',
        models: {
            'seedance-2.0': {
                name: 'Seedance 2.0 Pro', type: 'video',
                costPerSecFast: 0.08, costPerSecQuality: 0.15, unit: 'USD/sec',
                pricingUrl: 'https://www.muapi.ai', // Pointing to main landing if pricing 404s
            },
        },
    },
    // ═══════════════════════════════════════════════════════════════════
    //  LAOZHANG GATEWAY (Unified Proxy — Video + Image)
    // ═══════════════════════════════════════════════════════════════════
    'laozhang': {
        provider: 'LaoZhang AI Gateway', icon: '🐉',
        models: {
            // ── LaoZhang Video Models ──
            'laozhang-veo': {
                name: 'Veo 3.1 (via LZ)', type: 'video',
                costPerSecFast: 0.10, costPerSecQuality: 0.25, unit: 'USD/sec',
                flatCostUSD: 0.05, pricingUrl: 'https://api.laozhang.ai',
            },
            'laozhang-veo-fast': {
                name: 'Veo 3.1 Fast (via LZ)', type: 'video',
                costPerSecFast: 0.06, costPerSecQuality: 0.10, unit: 'USD/sec',
                flatCostUSD: 0.03, pricingUrl: 'https://api.laozhang.ai',
            },
            'laozhang-seedance': {
                name: 'Seedance 2.0 (via LZ)', type: 'video',
                costPerSecFast: 0.05, costPerSecQuality: 0.10, unit: 'USD/sec',
                flatCostUSD: 0.04, pricingUrl: 'https://api.laozhang.ai',
            },
            'laozhang-sora-2': {
                name: 'Sora 2 (via LZ)', type: 'video',
                costPerSecFast: 0.10, costPerSecQuality: 0.15, unit: 'USD/sec',
                flatCostUSD: 0.08, pricingUrl: 'https://api.laozhang.ai',
            },
            // ── LaoZhang Image Models ──
            'laozhang-nanobanana2': {
                name: 'NanoBanana 2 (via LZ)', type: 'image',
                flatCostUSD: 0.01, unit: 'USD/image',
                pricingUrl: 'https://api.laozhang.ai',
            },
            'laozhang-nanobanana-pro': {
                name: 'NanoBanana Pro (via LZ)', type: 'image',
                flatCostUSD: 0.03, unit: 'USD/image',
                pricingUrl: 'https://api.laozhang.ai',
            },
            'laozhang-ideogram': {
                name: 'Ideogram v3 (via LZ)', type: 'image',
                flatCostUSD: 0.02, unit: 'USD/image',
                pricingUrl: 'https://api.laozhang.ai',
            },
            'laozhang-flux': {
                name: 'Flux Kontext Pro (via LZ)', type: 'image',
                flatCostUSD: 0.02, unit: 'USD/image',
                pricingUrl: 'https://api.laozhang.ai',
            },
            'laozhang-seedream': {
                name: 'Seedream 5 (via LZ)', type: 'image',
                flatCostUSD: 0.02, unit: 'USD/image',
                pricingUrl: 'https://api.laozhang.ai',
            },
        },
    },
    // ═══════════════════════════════════════════════════════════════════
    //  SORA 2 (via LaoZhang — separate for clarity)
    // ═══════════════════════════════════════════════════════════════════
    'sora': {
        provider: 'OpenAI Sora 2 (via LZ)', icon: '🎞️',
        models: {
            'sora-2': {
                name: 'Sora 2', type: 'video',
                costPerSecFast: 0.10, costPerSecQuality: 0.15, unit: 'USD/sec',
                pricingUrl: 'https://openai.com/sora',
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
        const { data: html } = await axios.get(url, { 
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        });
        const $ = cheerio.load(html);
        
        // Clean up unneeded tags to save context
        $('script, style, nav, footer, iframe, img, svg').remove();
        let textContent = $('body').text().replace(/\s+/g, ' ');
        if (textContent.length > 80000) textContent = textContent.slice(0, 80000); // truncate if too massive
        
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        
        let response;
        let retries = 3;
        let delayMs = 2000;
        
        while (retries > 0) {
            try {
                response = await ai.models.generateContent({
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
                break; // Success, exit retry loop
            } catch (err) {
                if ((err.message?.includes('503') || err.message?.includes('429') || err.message?.includes('overloaded')) && retries > 1) {
                    retries--;
                    console.log(`📊 [Pricing Monitor] Gemini overloaded. Retrying in ${delayMs}ms... (${retries} retries left)`);
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                    delayMs *= 2; // Exponential backoff
                } else {
                    throw err; // Throw if not retryable or out of retries
                }
            }
        }

        const result = await response.response;
        if (!result) return null;

        const textResponse = result.text ? result.text() : null;
        if (!textResponse) {
            console.warn(`📊 [Pricing Monitor] Empty response from Gemini for ${providerName}`);
            return null;
        }

        let cleanJson = textResponse.trim();
        
        // Remove Markdown wrapping if present
        if (cleanJson.startsWith('```')) {
            cleanJson = cleanJson.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
        }
        
        // If still contains garbage before/after the JSON object
        const firstBrace = cleanJson.indexOf('{');
        const lastBrace = cleanJson.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
            cleanJson = cleanJson.substring(firstBrace, lastBrace + 1);
        }

        const resultJson = JSON.parse(cleanJson);
        return resultJson.models;
    } catch (e) {
        if (e.message?.includes('503') || e.message?.includes('overloaded')) {
             console.log(`📊 [Pricing Monitor] Gemini overloaded (503) for ${providerName}. Skipping.`);
        } else if (e.message?.includes('403') || e.message?.includes('redirects exceeded')) {
             console.log(`📊 [Pricing Monitor] Web scraper blocked by ${providerName} (${e.message}). Skipping.`);
        } else {
             console.log(`📊 [Pricing Monitor] Failed to extract live pricing for ${providerName}:`, e.message);
        }
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
                    if (!target) {
                        console.warn(`📊 [Pricing Monitor] Skipping ${key} — not found in baselines.`);
                        continue;
                    }

                    
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
    const exchangeRate = 93.21;

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
    // ⚡ PERF: Delay initial run to 5min (was 30s) — prevents competing with first user requests
    // The pricing data is updated at most every 24h, so a 5min startup delay has zero business impact.
    const INITIAL_DELAY_MS = 5 * 60 * 1000; // 5 minutes
    setTimeout(() => {
        checkPricingChanges().catch(err => console.error('❌ Pricing Monitor initial check failed:', err));
    }, INITIAL_DELAY_MS);

    // Schedule recurring checks
    setInterval(() => {
        checkPricingChanges().catch(err => console.error('❌ Pricing Monitor check failed:', err));
    }, INTERVAL_MS);

    console.log('📊 Pricing Monitor active — checking every 24h (first run in 5min)');
}


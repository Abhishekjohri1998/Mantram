import config from '../config/env.js';
import { GeminiProvider } from './providers/gemini.js';
import { OpenAIProvider } from './providers/openai.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { AIProviderBusyError, AIProviderQuotaError, AIProviderModelError } from './errors.js';

/**
 * Model Router — Routes AI requests to the configured provider.
 * Handles provider selection, fallback, and usage tracking.
 */
class ModelRouter {
    constructor() {
        this.providers = {};
        this.usageLog = [];
        this._initProviders();
    }

    _initProviders() {
        const providerConfigs = config.ai.providers;

        // Register all providers — they self-check if API key exists
        this.providers.gemini = new GeminiProvider({
            apiKey: providerConfigs.gemini?.apiKey,
            imageApiKey: providerConfigs.gemini?.imageApiKey,
            defaultModel: config.ai.defaultGeminiModel || 'gemini-3-flash-preview',
            defaultImageModel: config.ai.defaultImageModel || 'gemini-3.1-flash-image-preview',
            // GCP Vertex AI (Billed)
            gcpProjectId: providerConfigs.gemini?.gcpProjectId,
            gcpLocation: providerConfigs.gemini?.gcpLocation,
            googleApplicationCredentials: providerConfigs.gemini?.googleApplicationCredentials,
        });
        this.providers.openai = new OpenAIProvider({
            apiKey: providerConfigs.openai?.apiKey,
            defaultModel: config.ai.defaultOpenAIModel || 'gpt-4o-mini',
        });
        this.providers.anthropic = new AnthropicProvider({
            apiKey: providerConfigs.anthropic?.apiKey,
            defaultModel: config.ai.defaultAnthropicModel || 'claude-3-5-sonnet-latest',
        });


        // Log available providers
        const available = Object.entries(this.providers)
            .filter(([_, p]) => p.isAvailable())
            .map(([name]) => name);
        console.log(`🤖 AI Providers available: ${available.length > 0 ? available.join(', ') : 'None (add API keys to .env)'}`);
    }

    /**
     * Get a specific provider by name, or the default
     */
    getProvider(name) {
        const provider = this.providers[name];
        if (!provider) throw new Error(`Unknown provider: ${name}`);
        if (!provider.isAvailable()) throw new Error(`Provider ${name} not configured (missing API key)`);
        return provider;
    }

    /**
     * Get the best available text provider
     * Priority: user preference > brand preference > global default > any available
     */
    getTextProvider(preferences = {}) {
        const priority = [
            preferences.provider,
            config.ai.defaultTextProvider,
            'gemini',
            'openai',
            'anthropic',
        ].filter(Boolean);

        for (const name of priority) {
            if (this.providers[name]?.isAvailable()) {
                return this.providers[name];
            }
        }
        throw new Error('No text AI provider available. Add an API key to .env');
    }

    /**
     * Get the image provider — Gemini only, NO OpenAI fallback
     */
    getImageProvider(preferences = {}) {
        const priority = [
            preferences.provider,
            config.ai.defaultImageProvider,
            'gemini',
        ].filter(Boolean);

        for (const name of priority) {
            if (this.providers[name]?.isAvailable()) {
                return this.providers[name];
            }
        }
        throw new Error('No image AI provider available. Gemini API key required.');
    }

    /**
     * Generate text with automatic provider selection and fallback
     */
    async generateText(params, preferences = {}) {
        let provider = this.getTextProvider(preferences);

        // If primary is in cooldown, find next best available
        if (provider.cooldownUntil && Date.now() < provider.cooldownUntil) {
            console.warn(`⏳ Primary provider ${provider.name} is in cooldown, searching for alternative...`);
            const fallback = this._getFallback(provider.name, 'text');
            if (fallback) {
                provider = fallback;
            }
        }

        const triedProviders = new Set([provider.name]);
        let lastError = null;

        try {
            const result = await provider.generateText(params);
            this._logUsage('text', provider.name, result.tokensUsed);
            return result;
        } catch (error) {
            lastError = error;
            const isQuotaError = this._testQuotaError(error);

            if (isQuotaError) {
                provider.cooldownUntil = Date.now() + (5 * 60 * 1000); // 5 min cooldown
                console.warn(`⏳ Provider ${provider.name} hit quota/credit limits. Cooling down.`);
            }

            console.error(`Provider ${provider.name} failed, searching for fallback:`, error.message);
            
            // Try ALL other available providers in order
            const remainingProviders = Object.entries(this.providers)
                .filter(([name, p]) => !triedProviders.has(name) && p.isAvailable() && !(p.cooldownUntil && Date.now() < p.cooldownUntil))
                .map(([_, p]) => p);

            for (const fallback of remainingProviders) {
                try {
                    triedProviders.add(fallback.name);
                    console.log(`Trying fallback provider: ${fallback.name}`);
                    
                    // Strip the model ID so the fallback uses its own default model
                    const { model: _, ...fallbackParams } = params;
                    const result = await fallback.generateText(fallbackParams);
                    
                    this._logUsage('text', fallback.name, result.tokensUsed);
                    return result;
                } catch (fallbackError) {
                    lastError = fallbackError;
                    console.error(`Fallback ${fallback.name} also failed:`, fallbackError.message);
                }
            }
            
            // If we reached here, ALL available providers failed.
            // Throw a categorized error for the client.
            throw this._categorizeError(lastError, 'text');
        }
    }

    /**
     * Generate text with Google Search Grounding (Gemini only).
     * Provides real-time web access for strategy/research queries.
     * Falls back to regular generateText if search grounding fails.
     */
    async generateTextWithSearch(params) {
        try {
            const gemini = this.providers.gemini;
            if (!gemini?.isAvailable()) throw new Error('Gemini not available for search');
            const result = await gemini.generateTextWithSearch(params);
            this._logUsage('search', 'gemini', result.tokensUsed);
            return result;
        } catch (error) {
            console.warn('⚠️ Search-grounded generation failed, falling back to regular:', error.message);
            // Fallback to regular text generation
            const result = await this.generateText(params);
            return { ...result, citations: [], searchQueries: [], grounded: false };
        }
    }

    async analyzeText(params, preferences = {}) {
        const provider = this.getTextProvider(preferences);
        try {
            return await provider.analyzeText(params);
        } catch (error) {
            throw this._categorizeError(error, 'text', provider.name);
        }
    }

    _testQuotaError(error) {
        const msg = error.message?.toLowerCase() || '';
        return msg.includes('quota') || 
               msg.includes('rate limit') || 
               msg.includes('429') || 
               msg.includes('credit') || 
               msg.includes('balance') ||
               msg.includes('billing');
    }

    _categorizeError(error, type, providerName = 'multi') {
        const msg = error.message?.toLowerCase() || '';
        const isBusy = msg.includes('rate limit') || 
                       msg.includes('429') || 
                       msg.includes('busy') || 
                       msg.includes('overloaded') ||
                       msg.includes('503') ||
                       msg.includes('capacity') ||
                       msg.includes('high demand');
        
        const isQuota = msg.includes('quota') || 
                        msg.includes('credit') || 
                        msg.includes('balance') ||
                        msg.includes('billing') ||
                        msg.includes('402');

        const isModelError = msg.includes('404') ||
                             msg.includes('no longer available') ||
                             msg.includes('not found') ||
                             msg.includes('deprecated') ||
                             msg.includes('text output') ||
                             msg.includes('internal error'); // Internal errors during preview are usually transient model failures

        if (isBusy) return new AIProviderBusyError(providerName, error.message);
        if (isQuota) return new AIProviderQuotaError(providerName, error.message);
        if (isModelError) return new AIProviderModelError(providerName, error.message);

        // Fallback to generic AI error if not specifically recognized as busy/quota
        return error;
    }

    /**
     * Generate image — NO FALLBACK. If the selected provider fails, throw immediately.
     * Users see a clear error message and can retry manually.
     */
    async generateImage(params, preferences = {}) {
        const provider = this.getImageProvider(preferences);

        // If provider is in cooldown, throw immediately — don't try fallbacks
        if (provider.cooldownUntil && Date.now() < provider.cooldownUntil) {
            throw new AIProviderBusyError(provider.name, `${provider.name} is in cooldown. Please try again in a few minutes.`);
        }

        try {
            return await provider.generateImage(params);
        } catch (error) {
            const isQuotaError = this._testQuotaError(error);
            if (isQuotaError) {
                provider.cooldownUntil = Date.now() + (5 * 60 * 1000);
                console.warn(`⏳ Image provider ${provider.name} hit quota limits. Cooling down.`);
            }

            console.error(`❌ Image provider ${provider.name} failed:`, error.message);
            // NO FALLBACK — throw immediately so user gets a clear error
            throw this._categorizeError(error, 'image', provider.name);
        }
    }

    _getFallback(failedProvider, type) {
        const available = Object.entries(this.providers)
            .filter(([name, p]) => {
                const isFailed = name === failedProvider;
                const isAvailable = p.isAvailable();
                const inCooldown = p.cooldownUntil && Date.now() < p.cooldownUntil;
                return !isFailed && isAvailable && !inCooldown;
            })
            .map(([_, p]) => p);

        // If everything else is in cooldown or unavailable, just return the first available one that isn't the failed one
        if (available.length === 0) {
            return Object.entries(this.providers)
                .filter(([name, p]) => name !== failedProvider && p.isAvailable())
                .map(([_, p]) => p)[0] || null;
        }

        return available[0] || null;
    }

    _logUsage(type, provider, tokens) {
        this.usageLog.push({ type, provider, tokens, timestamp: new Date() });
        // Keep last 1000 entries
        if (this.usageLog.length > 1000) this.usageLog = this.usageLog.slice(-500);
    }

    getUsageStats() {
        return {
            total: this.usageLog.length,
            byProvider: this.usageLog.reduce((acc, log) => {
                acc[log.provider] = (acc[log.provider] || 0) + 1;
                return acc;
            }, {}),
        };
    }
}

// Singleton
let routerInstance = null;
export const getAIRouter = () => {
    if (!routerInstance) routerInstance = new ModelRouter();
    return routerInstance;
};

// Alias for backward compatibility with existing imports
export const getRouter = getAIRouter;

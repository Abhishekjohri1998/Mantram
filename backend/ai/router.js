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
            defaultModel: 'gemini-2.5-flash', // Upgraded from 2.0-flash
        });
        this.providers.openai = new OpenAIProvider({
            apiKey: providerConfigs.openai?.apiKey,
            defaultModel: 'gpt-4o-mini',
        });
        this.providers.anthropic = new AnthropicProvider({
            apiKey: providerConfigs.anthropic?.apiKey,
            defaultModel: 'claude-sonnet-4-20250514',
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
     * Get the best available image provider
     * Priority: Gemini (Imagen 3) > OpenAI (DALL-E)
     */
    getImageProvider(preferences = {}) {
        const priority = [
            preferences.provider,
            config.ai.defaultImageProvider,
            'gemini',
            'openai',
        ].filter(Boolean);

        for (const name of priority) {
            if (this.providers[name]?.isAvailable()) {
                return this.providers[name];
            }
        }
        throw new Error('No image AI provider available. Add an API key to .env');
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
                    const result = await fallback.generateText(params);
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
                       msg.includes('capacity');
        
        const isQuota = msg.includes('quota') || 
                        msg.includes('credit') || 
                        msg.includes('balance') ||
                        msg.includes('billing') ||
                        msg.includes('402');

        const isModelError = msg.includes('404') ||
                             msg.includes('no longer available') ||
                             msg.includes('not found') ||
                             msg.includes('deprecated') ||
                             msg.includes('text output');

        if (isBusy) return new AIProviderBusyError(providerName, error.message);
        if (isQuota) return new AIProviderQuotaError(providerName, error.message);
        if (isModelError) return new AIProviderModelError(providerName, error.message);

        // Fallback to generic AI error if not specifically recognized as busy/quota
        return error;
    }

    /**
     * Generate image with automatic provider selection and fallback
     */
    async generateImage(params, preferences = {}) {
        const provider = this.getImageProvider(preferences);
        let lastError = null;

        if (provider.cooldownUntil && Date.now() < provider.cooldownUntil) {
            const fallback = this._getFallback(provider.name, 'image');
            if (fallback) {
                try { 
                    return await fallback.generateImage(params); 
                } catch (e) {
                    lastError = e;
                }
            }
        }

        try {
            return await provider.generateImage(params);
        } catch (error) {
            lastError = error;
            const isQuotaError = this._testQuotaError(error);

            if (isQuotaError) {
                provider.cooldownUntil = Date.now() + (5 * 60 * 1000);
                console.warn(`⏳ Image provider ${provider.name} hit quota limits. Cooling down.`);
            }

            console.error(`Image provider ${provider.name} failed:`, error.message);
            // Try fallback provider
            const fallback = this._getFallback(provider.name, 'image');
            if (fallback) {
                try {
                    console.log(`Trying fallback image provider: ${fallback.name}`);
                    return await fallback.generateImage(params);
                } catch (fallbackError) {
                    lastError = fallbackError;
                }
            }
            throw this._categorizeError(lastError, 'image', provider.name);
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

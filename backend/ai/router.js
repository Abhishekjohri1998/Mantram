import config from '../config/env.js';
import { GeminiProvider } from './providers/gemini.js';
import { OpenAIProvider } from './providers/openai.js';
import { AnthropicProvider } from './providers/anthropic.js';

/**
 * Model Router — Routes AI requests to the configured provider.
 * Handles provider selection, fallback, and usage tracking.
 * 
 * To add a new provider:
 *   1. Create server/ai/providers/myProvider.js extending BaseProvider
 *   2. Add it to the providers map below
 *   3. Set DEFAULT_TEXT_PROVIDER=myProvider in .env
 *   Done. No other code changes.
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
            defaultModel: 'gemini-2.0-flash',
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
     * Priority: Gemini (Imagen 3 / nanobanana pro) > OpenAI (DALL-E)
     */
    getImageProvider(preferences = {}) {
        const priority = [
            preferences.provider,
            config.ai.defaultImageProvider,
            'gemini',  // Gemini 3.1 Flash Image Preview (nanobanana pro)
            'openai',  // DALL-E fallback
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
        const provider = this.getTextProvider(preferences);

        // Skip if provider is in cooldown
        if (provider.cooldownUntil && Date.now() < provider.cooldownUntil) {
            const fallback = this._getFallback(provider.name, 'text');
            if (fallback) return await fallback.generateText(params);
        }

        try {
            const result = await provider.generateText(params);
            this._logUsage('text', provider.name, result.tokensUsed);
            return result;
        } catch (error) {
            const isQuotaError = error.message?.toLowerCase().includes('quota') ||
                error.message?.toLowerCase().includes('rate limit') ||
                error.message?.toLowerCase().includes('credit') ||
                error.message?.toLowerCase().includes('balance') ||
                error.message?.toLowerCase().includes('429');

            if (isQuotaError) {
                // Cool down for 5 minutes
                provider.cooldownUntil = Date.now() + (5 * 60 * 1000);
                console.warn(`⏳ Provider ${provider.name} hit quota/credit limits. Cooling down for 5 mins.`);
            }

            // Try ALL other available providers in order
            console.error(`Provider ${provider.name} failed, searching for fallback:`, error.message);
            
            const remainingProviders = Object.entries(this.providers)
                .filter(([name, p]) => name !== provider.name && p.isAvailable() && !(p.cooldownUntil && Date.now() < p.cooldownUntil))
                .map(([_, p]) => p);

            for (const fallback of remainingProviders) {
                try {
                    console.log(`Trying fallback provider: ${fallback.name}`);
                    const result = await fallback.generateText(params);
                    this._logUsage('text', fallback.name, result.tokensUsed);
                    return result;
                } catch (fallbackError) {
                    console.error(`Fallback ${fallback.name} also failed:`, fallbackError.message);
                    // Continue to next fallback
                }
            }
            
            throw error;
        }
    }

    async analyzeText(params, preferences = {}) {
        const provider = this.getTextProvider(preferences);
        return provider.analyzeText(params);
    }

    /**
     * Generate image with automatic provider selection and fallback
     */
    async generateImage(params, preferences = {}) {
        const provider = this.getImageProvider(preferences);

        if (provider.cooldownUntil && Date.now() < provider.cooldownUntil) {
            const fallback = this._getFallback(provider.name, 'image');
            if (fallback) return await fallback.generateImage(params);
        }

        try {
            return await provider.generateImage(params);
        } catch (error) {
            const isQuotaError = error.message?.toLowerCase().includes('quota') ||
                error.message?.toLowerCase().includes('rate limit') ||
                error.message?.toLowerCase().includes('credit') ||
                error.message?.toLowerCase().includes('balance') ||
                error.message?.toLowerCase().includes('429');

            if (isQuotaError) {
                provider.cooldownUntil = Date.now() + (5 * 60 * 1000);
                console.warn(`⏳ Image provider ${provider.name} hit quota limits. Cooling down for 5 mins.`);
            }

            console.error(`Image provider ${provider.name} failed:`, error.message);
            // Try fallback provider
            const fallback = this._getFallback(provider.name, 'image');
            if (fallback) {
                console.log(`Trying fallback image provider: ${fallback.name}`);
                return await fallback.generateImage(params);
            }
            throw error;
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

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
            defaultModel: config.ai.defaultTextModel,
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
            'gemini',  // Imagen 3 (nanobanana pro) — user preferred
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
        try {
            const result = await provider.generateText(params);
            this._logUsage('text', provider.name, result.tokensUsed);
            return result;
        } catch (error) {
            // Try fallback provider
            console.error(`Provider ${provider.name} failed, trying fallback:`, error.message);
            const fallback = this._getFallback(provider.name, 'text');
            if (fallback) {
                const result = await fallback.generateText(params);
                this._logUsage('text', fallback.name, result.tokensUsed);
                return result;
            }
            throw error;
        }
    }

    /**
     * Analyze text with automatic provider selection
     */
    async analyzeText(params, preferences = {}) {
        const provider = this.getTextProvider(preferences);
        return provider.analyzeText(params);
    }

    /**
     * Generate image with automatic provider selection and fallback
     */
    async generateImage(params, preferences = {}) {
        const provider = this.getImageProvider(preferences);
        try {
            return await provider.generateImage(params);
        } catch (error) {
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
            .filter(([name, p]) => name !== failedProvider && p.isAvailable())
            .map(([_, p]) => p);
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
export const getRouter = () => {
    if (!routerInstance) routerInstance = new ModelRouter();
    return routerInstance;
};

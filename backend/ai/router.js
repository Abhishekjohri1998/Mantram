import config from '../config/env.js';
import { GeminiProvider } from './providers/gemini.js';
import { OpenAIProvider } from './providers/openai.js';
import { AnthropicProvider } from './providers/anthropic.js';
// xAI (Grok) uses OpenAI-compatible API — reuse OpenAIProvider with different base URL
// See: https://docs.x.ai/docs/overview
import { AIProviderBusyError, AIProviderQuotaError, AIProviderModelError } from './errors.js';

/**
 * Model Router — Routes AI requests to the configured provider.
 * Handles provider selection, fallback, and usage tracking.
 */
class ModelRouter {
    constructor() {
        this.providers = {};
        this.usageLog = [];
        // Circuit breaker: track recent 503 errors per provider for preemptive avoidance
        // Structure: { providerName: { count, firstSeen, lastSeen } }
        this._recentErrors = {};
        // Max time (ms) a single provider API call is allowed before aborting
        this.PER_CALL_TIMEOUT_MS = 12_000; // 12 seconds (reduced from 20s to fit within MCoT 15s window)
        this._initProviders();
    }

    _initProviders() {
        const providerConfigs = config.ai.providers;

        // Always initialize a native Gemini provider if API key is present
        // to handle native capabilities like search grounding and Imagen generation
        if (providerConfigs.gemini?.apiKey) {
            this.nativeGemini = new GeminiProvider({
                apiKey: providerConfigs.gemini.apiKey,
                imageApiKey: providerConfigs.gemini.imageApiKey,
                defaultModel: config.ai.defaultGeminiModel || 'gemini-2.5-flash-preview-05-20',
                defaultImageModel: config.ai.defaultImageModel || 'gemini-2.5-flash-preview-05-20',
                gcpProjectId: providerConfigs.gemini.gcpProjectId,
                gcpLocation: providerConfigs.gemini.gcpLocation,
                googleApplicationCredentials: providerConfigs.gemini.googleApplicationCredentials,
            });
            this.nativeGemini.name = 'native_gemini'; // Make name unique for fallback logging
        }

        // Register all providers — they self-check if API key exists
        // ── Gemini: Atlas Cloud primary → Laozhang fallback → Native Gemini ──
        if (providerConfigs.atlascloud?.apiKey) {
            console.log('🔄 Routing Gemini through Atlas Cloud (OpenAI format)');
            const geminiAtlasProvider = new OpenAIProvider({
                apiKey: providerConfigs.atlascloud.apiKey,
                defaultModel: 'google/' + (config.ai.defaultGeminiModel || 'gemini-2.5-pro'),
            });
            geminiAtlasProvider.name = 'gemini';
            geminiAtlasProvider.baseUrl = providerConfigs.atlascloud.baseUrl;
            this.providers.gemini = geminiAtlasProvider;
        } else if (providerConfigs.laozhang?.apiKey) {
            console.log('🔄 Routing Gemini through Laozhang (OpenAI format)');
            const geminiLzProvider = new OpenAIProvider({
                apiKey: providerConfigs.laozhang.apiKey,
                defaultModel: config.ai.defaultGeminiModel || 'gemini-2.5-pro',
            });
            geminiLzProvider.name = 'gemini';
            geminiLzProvider.baseUrl = providerConfigs.laozhang.baseUrl;
            this.providers.gemini = geminiLzProvider;
        } else {
            this.providers.gemini = new GeminiProvider({
                apiKey: providerConfigs.gemini?.apiKey,
                imageApiKey: providerConfigs.gemini?.imageApiKey,
                defaultModel: config.ai.defaultGeminiModel || 'gemini-2.5-flash-preview-05-20',
                defaultImageModel: config.ai.defaultImageModel || 'gemini-2.5-flash-preview-05-20',
                // GCP Vertex AI (Billed)
                gcpProjectId: providerConfigs.gemini?.gcpProjectId,
                gcpLocation: providerConfigs.gemini?.gcpLocation,
                googleApplicationCredentials: providerConfigs.gemini?.googleApplicationCredentials,
            });
        }
        this.providers.openai = new OpenAIProvider({
            apiKey: providerConfigs.openai?.apiKey,
            defaultModel: config.ai.defaultOpenAIModel || 'gpt-4o-mini',
            // LaoZhang proxy — required for gpt-image-2 /images/edits (ref images)
            laozhangApiKey: providerConfigs.openai?.laozhangApiKey,
            laozhangBaseUrl: providerConfigs.openai?.laozhangBaseUrl,
        });
        // xAI / Grok — OpenAI-compatible API, different base URL + API key
        if (config.grok?.apiKey) {
            const xaiProvider = new OpenAIProvider({
                apiKey: config.grok.apiKey,
                defaultModel: 'grok-3',
            });
            xaiProvider.name = 'xai';
            xaiProvider.baseUrl = 'https://api.x.ai/v1';
            this.providers.xai = xaiProvider;
        }

        // ── Anthropic/Claude: Atlas Cloud primary → Direct Anthropic fallback ──
        if (providerConfigs.atlascloud?.apiKey) {
            console.log('🔄 Routing Anthropic/Claude through Atlas Cloud (OpenAI format)');
            const claudeAtlasProvider = new OpenAIProvider({
                apiKey: providerConfigs.atlascloud.apiKey,
                // Atlas Cloud uses its own naming: 'anthropic/claude-sonnet-4.6' (not 'claude-sonnet-4-6')
                defaultModel: 'anthropic/claude-sonnet-4.6',
            });
            claudeAtlasProvider.name = 'anthropic';
            claudeAtlasProvider.baseUrl = providerConfigs.atlascloud.baseUrl;
            this.providers.anthropic = claudeAtlasProvider;

            // Keep native Anthropic as a separate fallback provider
            if (providerConfigs.anthropic?.apiKey) {
                this.nativeAnthropic = new AnthropicProvider({
                    apiKey: providerConfigs.anthropic.apiKey,
                    defaultModel: config.ai.defaultAnthropicModel || 'claude-sonnet-4-6',
                });
            }
        } else {
            this.providers.anthropic = new AnthropicProvider({
                apiKey: providerConfigs.anthropic?.apiKey,
                defaultModel: config.ai.defaultAnthropicModel || 'claude-sonnet-4-6',
            });
        }

        // ── DeepSeek: Atlas Cloud primary → Laozhang fallback ──
        if (providerConfigs.atlascloud?.apiKey) {
            const deepseekProvider = new OpenAIProvider({
                apiKey: providerConfigs.atlascloud.apiKey,
                defaultModel: 'deepseek-ai/DeepSeek-V3-0324',
            });
            deepseekProvider.name = 'deepseek';
            deepseekProvider.baseUrl = providerConfigs.atlascloud.baseUrl;
            this.providers.deepseek = deepseekProvider;
        } else if (providerConfigs.laozhang?.apiKey) {
            const deepseekProvider = new OpenAIProvider({
                apiKey: providerConfigs.laozhang.apiKey,
                defaultModel: 'deepseek-chat',
            });
            deepseekProvider.name = 'deepseek';
            deepseekProvider.baseUrl = providerConfigs.laozhang.baseUrl;
            this.providers.deepseek = deepseekProvider;
        }
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
        // If they explicitly requested 'native_gemini', and it's available, return it directly.
        if (preferences.provider === 'native_gemini' && this.nativeGemini?.isAvailable()) {
            return this.nativeGemini;
        }

        const priority = [
            preferences.provider,
            config.ai.defaultTextProvider,
            'gemini',
            'openai',
            'anthropic',
            'deepseek',  // Last-resort via Laozhang — cheap, often has channels when premium models don't
        ].filter(Boolean);

        for (const name of priority) {
            let p = this.providers[name];

            // Special fallback logic for gemini: if the primary routed Gemini (e.g. Atlas Cloud/Laozhang)
            // is not available, in cooldown, or circuit-broken, fall back to nativeGemini.
            if (name === 'gemini' && (!p || !p.isAvailable() || (p.cooldownUntil && Date.now() < p.cooldownUntil) || this._isProviderThrottled('gemini'))) {
                if (this.nativeGemini && this.nativeGemini.isAvailable() && !(this.nativeGemini.cooldownUntil && Date.now() < this.nativeGemini.cooldownUntil)) {
                    console.log('🔄 Primary Gemini is unavailable, throttled, or in cooldown. Routing to native Gemini.');
                    return this.nativeGemini;
                }
            }

            // Special fallback logic for anthropic: if Atlas Cloud Claude is unavailable/throttled,
            // fall back to native Anthropic API (direct, more expensive but reliable).
            if (name === 'anthropic' && (!p || !p.isAvailable() || (p.cooldownUntil && Date.now() < p.cooldownUntil) || this._isProviderThrottled('anthropic'))) {
                if (this.nativeAnthropic && this.nativeAnthropic.isAvailable() && !(this.nativeAnthropic.cooldownUntil && Date.now() < this.nativeAnthropic.cooldownUntil)) {
                    console.log('🔄 Primary Anthropic (Atlas Cloud) is unavailable, throttled, or in cooldown. Routing to native Anthropic.');
                    return this.nativeAnthropic;
                }
            }

            if (!p?.isAvailable()) continue;
            // Skip providers in cooldown
            if (p.cooldownUntil && Date.now() < p.cooldownUntil) continue;
            // Skip providers that are circuit-broken (frequent recent 503s)
            if (this._isProviderThrottled(name)) {
                console.warn(`⚡ Skipping ${name} — circuit breaker open (${this._recentErrors[name]?.count} recent 503s)`);
                continue;
            }
            return p;
        }

        // If all preferred providers are throttled/cooldown, see if any provider is NOT in cooldown
        if (this.nativeGemini?.isAvailable() && !(this.nativeGemini.cooldownUntil && Date.now() < this.nativeGemini.cooldownUntil)) {
            return this.nativeGemini;
        }
        for (const name of priority) {
            const p = this.providers[name];
            if (p?.isAvailable() && !(p.cooldownUntil && Date.now() < p.cooldownUntil)) {
                return p;
            }
        }

        // ── LAST RESORT: All providers are in cooldown ──
        // Instead of throwing (which blocks the user for 5 minutes), pick the provider 
        // with the soonest cooldown expiry and force a retry. This allows transient 
        // issues to self-heal.
        console.warn('⚠️ All AI providers are in cooldown. Forcing a retry on the soonest-expiring provider...');
        
        // Prefer native_gemini (free, direct Google API) — clear its cooldown and retry
        if (this.nativeGemini?.isAvailable()) {
            console.log('🔄 Force-clearing native_gemini cooldown for retry attempt');
            this.nativeGemini.cooldownUntil = 0;
            return this.nativeGemini;
        }

        // Find the provider whose cooldown expires soonest
        let soonest = null;
        let soonestTime = Infinity;
        for (const name of priority) {
            const p = this.providers[name];
            if (p?.isAvailable() && p.cooldownUntil && p.cooldownUntil < soonestTime) {
                soonest = p;
                soonestTime = p.cooldownUntil;
            }
        }
        if (soonest) {
            console.log(`🔄 Force-clearing ${soonest.name} cooldown for retry attempt`);
            soonest.cooldownUntil = 0;
            return soonest;
        }

        // Absolute last resort — should never reach here unless no providers are configured
        throw new Error('No AI providers are configured. Please check your API keys in the .env file.');
    }

    /**
     * Get options for the fastest/most available model
     */
    getFastModelOptions() {
        // Check Laozhang Gemini first — if it's available AND not in cooldown
        const lzGemini = this.providers.gemini;
        if (lzGemini?.isAvailable() && !(lzGemini.cooldownUntil && Date.now() < lzGemini.cooldownUntil)) {
            return { provider: 'gemini', model: 'gemini-2.5-flash' };
        }
        // Native Gemini (direct Google API) — most reliable fallback
        if (this.nativeGemini?.isAvailable() && !(this.nativeGemini.cooldownUntil && Date.now() < this.nativeGemini.cooldownUntil)) {
            return { provider: 'native_gemini', model: 'gemini-2.5-flash' };
        }
        // OpenAI
        const openai = this.providers.openai;
        if (openai?.isAvailable() && !(openai.cooldownUntil && Date.now() < openai.cooldownUntil)) {
            return { provider: 'openai', model: 'gpt-4o-mini' };
        }
        // Anthropic
        const anthropic = this.providers.anthropic;
        if (anthropic?.isAvailable() && !(anthropic.cooldownUntil && Date.now() < anthropic.cooldownUntil)) {
            return { provider: 'anthropic' };
        }
        // xAI
        const xai = this.providers.xai;
        if (xai?.isAvailable() && !(xai.cooldownUntil && Date.now() < xai.cooldownUntil)) {
            return { provider: 'xai' };
        }
        // DeepSeek via Laozhang — cheap fallback
        const deepseek = this.providers.deepseek;
        if (deepseek?.isAvailable() && !(deepseek.cooldownUntil && Date.now() < deepseek.cooldownUntil)) {
            return { provider: 'deepseek', model: 'deepseek-chat' };
        }
        // Fallback
        return { provider: 'native_gemini', model: 'gemini-2.5-flash' };
    }

    /**
     * Get the image provider.
     * Priority: explicit preference → config default → openai (gpt-image-2) → gemini
     * Both OpenAI and Gemini support image generation.
     */
    getImageProvider(preferences = {}) {
        const priority = [
            preferences.provider,
            config.ai.defaultImageProvider,
            'openai',
            'gemini',
        ].filter(Boolean);

        for (const name of priority) {
            if (name === 'gemini' && this.nativeGemini?.isAvailable()) {
                return this.nativeGemini;
            }
            if (this.providers[name]?.isAvailable()) {
                return this.providers[name];
            }
        }
        throw new Error('No image AI provider available. Add OPENAI_API_KEY or GEMINI_API_KEY to .env');
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
            const result = await this._withTimeout(provider.generateText(params), provider.name);
            if (!result || !result.text || !result.text.trim()) {
                throw new Error(`Model returned an empty response (likely blocked by safety/recitation filters or rate limits).`);
            }
            this._logUsage('text', provider.name, result.tokensUsed);
            // Success — reset circuit breaker for this provider
            this._resetErrors(provider.name);
            return result;
        } catch (error) {
            lastError = error;
            const isQuotaError = this._testQuotaError(error);
            const is503Error = this._test503Error(error);
            const isConnectionError = this._testConnectionError(error);

            if (isQuotaError || isConnectionError || error.message.includes('empty response')) {
                provider.cooldownUntil = Date.now() + (60 * 1000); // 60s cooldown (was 5m — too long)
                console.warn(`⏳ Provider ${provider.name} hit quota/connection limits/errors. Cooling down 60s.`);
            } else if (is503Error) {
                // 503 = server overloaded — shorter cooldown, track in circuit breaker
                this._record503(provider.name);
                if (this._isProviderThrottled(provider.name)) {
                    provider.cooldownUntil = Date.now() + (30 * 1000); // 30s cooldown for 503
                    console.warn(`⚡ Provider ${provider.name} circuit breaker tripped (${this._recentErrors[provider.name].count} 503s). Cooling down 30s.`);
                }
            }

            console.error(`Provider ${provider.name} failed, searching for fallback:`, error.message);
            
            // Try ALL other available providers in order
            const remainingProviders = Object.entries(this.providers)
                .filter(([name, p]) => !triedProviders.has(name) && p.isAvailable() && !(p.cooldownUntil && Date.now() < p.cooldownUntil))
                .map(([_, p]) => p);

            // Add native Gemini if it's available, not already tried, and not in cooldown
            if (this.nativeGemini && 
                this.nativeGemini.isAvailable() && 
                !triedProviders.has(this.nativeGemini.name) && 
                !(this.nativeGemini.cooldownUntil && Date.now() < this.nativeGemini.cooldownUntil)) {
                remainingProviders.push(this.nativeGemini);
            }

            for (const fallback of remainingProviders) {
                try {
                    triedProviders.add(fallback.name);
                    console.log(`Trying fallback provider: ${fallback.name}`);
                    
                    // Strip the model ID so the fallback uses its own default model
                    const { model: _, ...fallbackParams } = params;
                    const result = await this._withTimeout(fallback.generateText(fallbackParams), fallback.name);
                    if (!result || !result.text || !result.text.trim()) {
                        throw new Error(`Model returned an empty response.`);
                    }
                    
                    this._logUsage('text', fallback.name, result.tokensUsed);
                    return result;
                } catch (fallbackError) {
                    lastError = fallbackError;
                    const fbQuota = this._testQuotaError(fallbackError);
                    const fbConn = this._testConnectionError(fallbackError);
                    if (fbQuota || fbConn || fallbackError.message.includes('empty response')) {
                        fallback.cooldownUntil = Date.now() + (60 * 1000);
                        console.warn(`⏳ Fallback provider ${fallback.name} hit quota/connection limits/errors. Cooling down 60s.`);
                    } else if (this._test503Error(fallbackError)) {
                        this._record503(fallback.name);
                        if (this._isProviderThrottled(fallback.name)) {
                            fallback.cooldownUntil = Date.now() + (30 * 1000);
                            console.warn(`⚡ Fallback provider ${fallback.name} circuit breaker tripped. Cooling down 30s.`);
                        }
                    }
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
            const gemini = this.nativeGemini || this.providers.gemini;
            if (!gemini || typeof gemini.generateTextWithSearch !== 'function' || !gemini.isAvailable()) {
                throw new Error('Gemini provider is not available or does not support search grounding');
            }
            const result = await this._withTimeout(gemini.generateTextWithSearch(params), 'gemini-search');
            if (!result || !result.text || !result.text.trim()) {
                throw new Error('Gemini search grounding returned an empty response.');
            }
            this._logUsage('search', 'gemini', result.tokensUsed);
            return result;
        } catch (error) {
            console.warn('⚠️ Search-grounded generation failed, falling back to regular:', error.message);
            // Fallback to regular text generation
            const result = await this.generateText(params);
            return { ...result, citations: [], searchQueries: [], grounded: false };
        }
    }

    /**
     * Stream text generation — returns an async generator of text chunks.
     * Uses Gemini's streamGenerateContent endpoint (fastest, real-time tokens).
     * Falls back to regular generateText if streaming is unavailable.
     * 
     * @param {object} params - { systemPrompt, userPrompt, temperature, maxTokens }
     * @yields {string} Token chunks as they arrive
     */
    async *generateTextStream(params) {
        try {
            const gemini = this.nativeGemini || this.providers.gemini;
            if (!gemini || !gemini.isAvailable() || typeof gemini.generateTextStream !== 'function') {
                throw new Error('Gemini streaming not available');
            }
            this._logUsage('stream', 'gemini', 0);
            yield* gemini.generateTextStream(params);
        } catch (error) {
            console.warn('⚠️ Streaming generation failed, emitting buffered fallback:', error.message);
            // Fallback: run regular generateText and emit the full result as one chunk
            const result = await this.generateText(params);
            if (result.text) yield result.text;
        }
    }

    async analyzeText(params, preferences = {}) {
        const resolvedPrefs = { provider: params.provider, ...preferences };
        let provider = this.getTextProvider(resolvedPrefs);

        // If primary is in cooldown, find next best available
        if (provider.cooldownUntil && Date.now() < provider.cooldownUntil) {
            console.warn(`⏳ Primary provider ${provider.name} is in cooldown for analyzeText, searching for alternative...`);
            const fallback = this._getFallback(provider.name, 'text');
            if (fallback) {
                provider = fallback;
            }
        }

        const triedProviders = new Set([provider.name]);
        let lastError = null;

        try {
            return await this._withTimeout(provider.analyzeText(params), provider.name);
        } catch (error) {
            lastError = error;
            const isQuotaError = this._testQuotaError(error);
            const is503Error = this._test503Error(error);
            const isConnectionError = this._testConnectionError(error);

            if (isQuotaError || isConnectionError) {
                provider.cooldownUntil = Date.now() + (5 * 60 * 1000); // 5 min cooldown for quota/connection errors
                console.warn(`⏳ Provider ${provider.name} hit quota/connection limits/errors. Cooling down 5m.`);
            } else if (is503Error) {
                this._record503(provider.name);
                if (this._isProviderThrottled(provider.name)) {
                    provider.cooldownUntil = Date.now() + (2 * 60 * 1000); // 2 min cooldown for 503
                    console.warn(`⚡ Provider ${provider.name} circuit breaker tripped. Cooling down 2m.`);
                }
            }

            console.error(`Provider ${provider.name} analyzeText failed, searching for fallback:`, error.message);

            // Try ALL other available providers in order
            const remainingProviders = Object.entries(this.providers)
                .filter(([name, p]) => !triedProviders.has(name) && p.isAvailable() && !(p.cooldownUntil && Date.now() < p.cooldownUntil))
                .map(([_, p]) => p);

            // Add native Gemini if it's available, not already tried, and not in cooldown
            if (this.nativeGemini && 
                this.nativeGemini.isAvailable() && 
                !triedProviders.has(this.nativeGemini.name) && 
                !(this.nativeGemini.cooldownUntil && Date.now() < this.nativeGemini.cooldownUntil)) {
                remainingProviders.push(this.nativeGemini);
            }

            for (const fallback of remainingProviders) {
                try {
                    triedProviders.add(fallback.name);
                    console.log(`Trying fallback provider for analyzeText: ${fallback.name}`);
                    const result = await this._withTimeout(fallback.analyzeText(params), fallback.name);
                    this._resetErrors(fallback.name);
                    return result;
                } catch (fallbackError) {
                    lastError = fallbackError;
                    const fbQuota = this._testQuotaError(fallbackError);
                    const fbConn = this._testConnectionError(fallbackError);
                    if (fbQuota || fbConn) {
                        fallback.cooldownUntil = Date.now() + (5 * 60 * 1000);
                        console.warn(`⏳ Fallback provider ${fallback.name} hit quota/connection limits/errors. Cooling down 5m.`);
                    } else if (this._test503Error(fallbackError)) {
                        this._record503(fallback.name);
                        if (this._isProviderThrottled(fallback.name)) {
                            fallback.cooldownUntil = Date.now() + (2 * 60 * 1000);
                            console.warn(`⚡ Fallback provider ${fallback.name} circuit breaker tripped. Cooling down 2m.`);
                        }
                    }
                    console.error(`Fallback ${fallback.name} also failed for analyzeText:`, fallbackError.message);
                }
            }

            throw this._categorizeError(lastError, 'text');
        }
    }

    /**
     * Wrap a provider call with a timeout to prevent indefinite hangs.
     * If the provider doesn't respond within PER_CALL_TIMEOUT_MS, rejects with a timeout error.
     */
    _withTimeout(promise, providerName) {
        return Promise.race([
            promise,
            new Promise((_, reject) =>
                setTimeout(
                    () => reject(new Error(`TIMEOUT: Provider ${providerName} did not respond within ${this.PER_CALL_TIMEOUT_MS / 1000}s`)),
                    this.PER_CALL_TIMEOUT_MS
                )
            ),
        ]);
    }

    _testQuotaError(error) {
        const msg = error.message?.toLowerCase() || '';
        return msg.includes('quota') || 
               msg.includes('rate limit') || 
               msg.includes('429') || 
               msg.includes('credit') || 
               msg.includes('balance') ||
               msg.includes('billing') ||
               msg.includes('403') ||
               msg.includes('forbidden') ||
               msg.includes('401') ||
               msg.includes('unauthorized');
    }

    _testConnectionError(error) {
        const msg = error.message?.toLowerCase() || '';
        return msg.includes('fetch failed') ||
               msg.includes('timeout') ||
               msg.includes('connect') ||
               msg.includes('econnrefused') ||
               msg.includes('etimedout') ||
               msg.includes('dns') ||
               msg.includes('network error');
    }

    /**
     * Test if an error is a 503 (server overloaded) — these recover faster than quota.
     */
    _test503Error(error) {
        const msg = error.message?.toLowerCase() || '';
        return msg.includes('503') || 
               msg.includes('overloaded') || 
               msg.includes('service unavailable') ||
               msg.includes('capacity') ||
               msg.includes('high demand');
    }

    /**
     * Circuit breaker: record a 503 error for a provider.
     * Tracks errors within a 2-minute sliding window.
     */
    _record503(providerName) {
        const now = Date.now();
        const entry = this._recentErrors[providerName] || { count: 0, firstSeen: now, lastSeen: 0 };
        // Reset window if last error was >2 min ago
        if (now - entry.lastSeen > 120_000) {
            entry.count = 0;
            entry.firstSeen = now;
        }
        entry.count++;
        entry.lastSeen = now;
        this._recentErrors[providerName] = entry;
    }

    /**
     * Circuit breaker: check if a provider should be preemptively skipped.
     * Trips after 3+ 503 errors within a 2-minute window.
     */
    _isProviderThrottled(providerName) {
        const entry = this._recentErrors[providerName];
        if (!entry) return false;
        // Auto-recover after 2 minutes
        if (Date.now() - entry.lastSeen > 120_000) return false;
        return entry.count >= 3;
    }

    /**
     * Reset circuit breaker on successful call — provider has recovered.
     */
    _resetErrors(providerName) {
        if (this._recentErrors[providerName]) {
            delete this._recentErrors[providerName];
        }
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
                        msg.includes('402') ||
                        msg.includes('403') ||
                        msg.includes('forbidden') ||
                        msg.includes('401') ||
                        msg.includes('unauthorized');

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

        let timeoutId;
        try {
            const timeoutPromise = new Promise((_, reject) => {
                timeoutId = setTimeout(() => {
                    reject(new Error(`TIMEOUT: Image provider ${provider.name} timed out after 25 seconds.`));
                }, 25000);
            });

            const result = await Promise.race([
                provider.generateImage(params),
                timeoutPromise
            ]);
            clearTimeout(timeoutId);
            this._resetErrors(provider.name);
            return result;
        } catch (error) {
            clearTimeout(timeoutId);
            const isQuotaError = this._testQuotaError(error);
            const is503Error = this._test503Error(error);

            if (isQuotaError) {
                provider.cooldownUntil = Date.now() + (5 * 60 * 1000);
                console.warn(`⏳ Image provider ${provider.name} hit quota limits. Cooling down 5m.`);
            } else if (is503Error) {
                this._record503(provider.name);
                provider.cooldownUntil = Date.now() + (2 * 60 * 1000); // Shorter cooldown for 503
                console.warn(`⚡ Image provider ${provider.name} returned 503. Cooling down 2m.`);
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

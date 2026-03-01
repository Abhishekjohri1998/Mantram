/**
 * Smart Language Router — Intelligent model selection based on language & task type.
 *
 * This module maps {language, taskType, langStyle} → {provider, model, reason}
 * so the orchestrator can auto-select the best LLM for each content generation.
 *
 * To update routing (e.g. when a new model drops):
 *   1. Edit the ROUTING_TABLE below
 *   2. Add any new provider in server/ai/providers/
 *   3. Done — no frontend changes needed
 */

import { getRouter } from './router.js';

// ============================================================================
// ROUTING TABLE — the single source of truth for model selection
// ============================================================================

const INDIAN_LANGUAGES = new Set([
    'hindi', 'tamil', 'telugu', 'bengali', 'marathi', 'gujarati', 'punjabi',
    'kannada', 'malayalam', 'urdu', 'odia', 'assamese', 'nepali', 'konkani',
    'kashmiri', 'sindhi', 'sanskrit', 'maithili', 'dogri', 'manipuri', 'bodo', 'santali',
]);

const EAST_ASIAN_LANGUAGES = new Set(['japanese', 'korean', 'chinese', 'mandarin']);
const EUROPEAN_LANGUAGES = new Set(['french', 'german', 'spanish', 'portuguese', 'italian', 'dutch', 'polish', 'russian']);
const MIDDLE_EASTERN_LANGUAGES = new Set(['arabic', 'persian', 'turkish', 'hebrew']);

/**
 * Routing rules — ordered by priority.
 * Each rule has:  match(ctx) → boolean,  route → { provider, model, reason }
 *
 * The first matching rule wins. Fallback at the bottom catches everything.
 */
const ROUTING_RULES = [
    // ── Indian Languages → Sarvam (best for Indic) ──
    {
        match: (ctx) => INDIAN_LANGUAGES.has(ctx.language),
        route: { provider: 'sarvam', model: 'sarvam-m', reason: 'Best for Indian languages' },
        icon: '🇮🇳',
    },

    // ── East Asian → Gemini (strong polyglot, good CJK) ──
    {
        match: (ctx) => EAST_ASIAN_LANGUAGES.has(ctx.language),
        route: { provider: 'gemini', model: null, reason: 'Strong multilingual (CJK)' },
        icon: '🌏',
    },

    // ── Arabic / Middle-Eastern → Gemini ──
    {
        match: (ctx) => MIDDLE_EASTERN_LANGUAGES.has(ctx.language),
        route: { provider: 'gemini', model: null, reason: 'Strong multilingual (MENA)' },
        icon: '🌍',
    },

    // ── European → OpenAI (good EU language quality) ──
    {
        match: (ctx) => EUROPEAN_LANGUAGES.has(ctx.language),
        route: { provider: 'openai', model: 'gpt-4o', reason: 'Strong European languages' },
        icon: '🇪🇺',
    },

    // ── English: long-form (blog, SEO, educate) → Claude (best structured writing) ──
    {
        match: (ctx) => (!ctx.language || ctx.language === 'english') &&
            ['educate', 'brand', 'blog', 'seo', 'email'].includes(ctx.taskType),
        route: { provider: 'anthropic', model: 'claude-sonnet-4-20250514', reason: 'Best for long-form English' },
        icon: '📝',
    },

    // ── English: social/creative → Gemini (fast, creative) ──
    {
        match: (ctx) => (!ctx.language || ctx.language === 'english') &&
            ['promote', 'celebrate', 'launch', 'social', 'ad', 'caption'].includes(ctx.taskType),
        route: { provider: 'gemini', model: null, reason: 'Fast & creative for social' },
        icon: '⚡',
    },

    // ── Fallback: English or unknown → default provider ──
    {
        match: () => true,
        route: { provider: null, model: null, reason: 'Default provider' },
        icon: '🤖',
    },
];


// ============================================================================
// ROUTER CLASS
// ============================================================================

class SmartLanguageRouter {
    constructor() {
        this.modelRouter = getRouter();
    }

    /**
     * Determine the best provider/model for a given context.
     *
     * @param {object} ctx
     * @param {string} ctx.language    – e.g. 'hindi', 'english', 'tamil'
     * @param {string} ctx.taskType    – e.g. 'promote', 'educate', 'blog'
     * @param {string} [ctx.langStyle] – 'pure', 'mixed', 'slang'
     * @param {string} [ctx.userOverride] – user-selected provider override
     * @returns {{ provider: string, model: string|null, reason: string, icon: string, isOverride: boolean }}
     */
    resolve(ctx = {}) {
        const lang = (ctx.language || 'english').toLowerCase().trim();
        const normalizedCtx = { ...ctx, language: lang };

        // 1. User override takes top priority
        if (ctx.userOverride && ctx.userOverride !== 'auto') {
            const providerNames = { sarvam: 'Sarvam AI', gemini: 'Gemini', openai: 'GPT-4o', anthropic: 'Claude' };
            return {
                provider: ctx.userOverride,
                model: null,
                reason: `User selected ${providerNames[ctx.userOverride] || ctx.userOverride}`,
                icon: '👤',
                isOverride: true,
            };
        }

        // 2. Walk routing rules
        for (const rule of ROUTING_RULES) {
            if (rule.match(normalizedCtx)) {
                return {
                    ...rule.route,
                    icon: rule.icon,
                    isOverride: false,
                };
            }
        }

        // Should never reach here (last rule always matches), but just in case
        return { provider: null, model: null, reason: 'Default', icon: '🤖', isOverride: false };
    }

    /**
     * Execute text generation using the resolved provider.
     * Handles Sarvam separately (custom API), then falls back to ModelRouter.
     */
    async generateText({ systemPrompt, userPrompt, temperature, maxTokens }, routeCtx = {}) {
        const route = this.resolve(routeCtx);
        console.log(`🧠 Smart Router → ${route.icon} ${route.provider || 'default'} (${route.reason})`);

        let result = null;

        // Sarvam has its own API — call directly
        if (route.provider === 'sarvam') {
            result = await this._callSarvam(systemPrompt, userPrompt, { temperature, maxTokens });
            if (result) {
                return { ...result, _routeInfo: route };
            }
            // Sarvam failed → fall through to ModelRouter fallback
            console.warn('⚠️ Sarvam unavailable, falling back to default provider');
            route.reason += ' (Sarvam fallback)';
        }

        // Regular providers via ModelRouter
        const preferences = route.provider ? { provider: route.provider } : {};
        result = await this.modelRouter.generateText(
            { systemPrompt, userPrompt, temperature, maxTokens },
            preferences,
        );

        return { ...result, _routeInfo: route };
    }

    /**
     * Call Sarvam AI LLM (OpenAI-compatible API)
     */
    async _callSarvam(systemPrompt, userPrompt, options = {}) {
        const apiKey = process.env.SARVAM_API_KEY;
        if (!apiKey) return null;

        try {
            const response = await fetch('https://api.sarvam.ai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'api-subscription-key': apiKey,
                },
                body: JSON.stringify({
                    model: 'sarvam-m',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt },
                    ],
                    temperature: options.temperature || 0.7,
                    max_tokens: options.maxTokens || 2048,
                }),
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                console.error('Sarvam LLM error:', err);
                return null;
            }

            const data = await response.json();
            const text = data.choices?.[0]?.message?.content || '';
            return {
                text,
                tokensUsed: data.usage?.total_tokens || 0,
                model: 'sarvam-m',
                provider: 'sarvam',
                generationTime: 0,
            };
        } catch (err) {
            console.error('Sarvam exception:', err.message);
            return null;
        }
    }

    /**
     * Get all available providers (for the frontend override dropdown)
     */
    getAvailableProviders() {
        const providers = [
            { id: 'auto', label: 'Auto (Recommended)', icon: 'auto_awesome', desc: 'AI picks the best model' },
        ];

        // Check which providers have API keys
        try {
            if (this.modelRouter.providers.gemini?.isAvailable()) {
                providers.push({ id: 'gemini', label: 'Gemini', icon: 'smart_toy', desc: 'Google — fast, multilingual' });
            }
        } catch { }
        try {
            if (this.modelRouter.providers.openai?.isAvailable()) {
                providers.push({ id: 'openai', label: 'GPT-4o', icon: 'psychology', desc: 'OpenAI — strong all-rounder' });
            }
        } catch { }
        try {
            if (this.modelRouter.providers.anthropic?.isAvailable()) {
                providers.push({ id: 'anthropic', label: 'Claude', icon: 'edit_note', desc: 'Anthropic — best for long-form' });
            }
        } catch { }
        if (process.env.SARVAM_API_KEY) {
            providers.push({ id: 'sarvam', label: 'Sarvam AI', icon: 'translate', desc: 'Indian languages specialist' });
        }

        return providers;
    }
}

// Singleton
let instance = null;
export const getSmartRouter = () => {
    if (!instance) instance = new SmartLanguageRouter();
    return instance;
};

import { getSmartRouter } from '../ai/smartRouter.js';
import { getPromptOptimizer } from '../ai/rlhf/promptOptimizer.js';

/**
 * Agent Orchestrator — The brain of the agentic system.
 * Decomposes user requests into tasks, delegates to specialized agents,
 * and coordinates the full pipeline from prompt to output.
 */
class Orchestrator {
    constructor() {
        this.smartRouter = getSmartRouter();
        this.optimizer = getPromptOptimizer();
    }

    /**
     * Backward compatibility: expose the underlying model router
     */
    get router() {
        return this.smartRouter.modelRouter;
    }

    /**
     * Generate text content — full agentic pipeline
     */
    async generateContent({ brand, user, type, prompt, platform, options = {}, toneSettings = {} }) {
        // Step 1: Build optimized system prompt (incorporates RLHF learnings)
        const systemPrompt = await this.optimizer.buildOptimizedPrompt(brand, type);

        // Step 2: Build the user prompt with context
        const userPrompt = this._buildContentPrompt({ type, prompt, platform, options });

        // Step 3: Smart Language Routing — pick best provider based on language + task
        const routeCtx = {
            language: toneSettings.language || this._detectLanguageFromPrompt(prompt),
            taskType: type,
            langStyle: toneSettings.langStyle || 'pure',
            userOverride: options.modelOverride || user?.preferences?.defaultTextProvider || undefined,
        };

        const result = await this.smartRouter.generateText({
            systemPrompt,
            userPrompt,
            temperature: options.temperature || 0.7,
            maxTokens: this._getMaxTokens(type),
        }, routeCtx);

        const routeInfo = result._routeInfo || {};

        // Step 4: Calculate brand alignment score
        const alignmentScore = this._calculateAlignment(result.text, brand);

        // Step 5: Update brand context periodically
        this.optimizer.updateBrandContext(brand._id).catch(() => { }); // async, non-blocking

        return {
            content: result.text,
            title: this._extractTitle(result.text, type),
            aiMeta: {
                provider: result.provider,
                model: result.model,
                tokensUsed: result.tokensUsed,
                generationTime: result.generationTime,
                brandAlignmentScore: alignmentScore,
                systemPromptUsed: systemPrompt.substring(0, 200),
                temperature: options.temperature || 0.7,
                // Smart Router info (for frontend model indicator)
                routingReason: routeInfo.reason || '',
                routingIcon: routeInfo.icon || '🤖',
                isModelOverride: routeInfo.isOverride || false,
            },
        };
    }

    /**
     * Detect language from structured prompt (fallback when toneSettings not available)
     */
    _detectLanguageFromPrompt(prompt) {
        if (!prompt) return 'english';
        const langMatch = prompt.match(/LANGUAGE:\s*(.+)/i);
        if (!langMatch) return 'english';
        const langLine = langMatch[1].trim().toLowerCase();

        // Check all known language sets
        const ALL_LANGUAGES = [
            'hindi', 'tamil', 'telugu', 'bengali', 'marathi', 'gujarati', 'punjabi',
            'kannada', 'malayalam', 'urdu', 'odia', 'assamese', 'nepali',
            'japanese', 'korean', 'chinese', 'mandarin',
            'french', 'german', 'spanish', 'portuguese', 'italian', 'dutch', 'russian',
            'arabic', 'persian', 'turkish', 'hebrew',
        ];
        for (const lang of ALL_LANGUAGES) {
            if (langLine.includes(lang)) return lang;
        }
        return 'english';
    }

    /**
     * Generate visual creative — full pipeline
     */
    async generateCreative({ brand, user, type, prompt, options = {} }) {
        const dna = brand.dna || {};

        // Build visual prompt with brand context
        const visualPrompt = this._buildVisualPrompt({ brand, type, prompt, options });

        const preferences = {
            provider: user.preferences?.defaultImageProvider || undefined,
        };

        const result = await this.smartRouter.modelRouter.generateImage({
            prompt: visualPrompt,
            size: this._getCreativeSize(type),
        }, preferences);

        return {
            imageUrl: result.imageUrl,
            thumbnailUrl: result.imageUrl,
            title: prompt.substring(0, 50),
            dimensions: this._getCreativeDimensions(type),
            designData: {
                style: options.style || 'modern',
                layout: options.layout || 'center',
                textOverlay: options.textOverlay || '',
                colors: dna.colors?.map(c => c.hex) || [],
                fonts: [dna.fonts?.heading?.family, dna.fonts?.body?.family].filter(Boolean),
            },
            aiMeta: {
                provider: result.provider,
                model: result.model,
                generationTime: result.generationTime || 0,
                brandAlignmentScore: 85,
            },
        };
    }

    /**
     * Scan a website and extract brand DNA
     */
    async scanWebsite(url) {
        // Delegate to brand scanner agent
        const { scanWebsite } = await import('./brandScanner.js');
        return scanWebsite(url, this.smartRouter.modelRouter);
    }

    /**
     * Brainstorm brand identity with AI
     */
    async brainstormBrand({ industry, keywords, description }) {
        const result = await this.smartRouter.modelRouter.generateText({
            systemPrompt: 'You are a brand identity expert. Generate a comprehensive brand identity based on the provided information. Return valid JSON with the following structure: { "name": "", "tagline": "", "personality": "", "voiceDescription": "", "tone": 0-100, "formality": 0-100, "warmth": 0-100, "clarity": 0-100, "targetAudience": "", "keyPhrases": [], "dos": [], "donts": [], "colorSuggestions": [{"name": "", "hex": "", "usage": ""}], "fontSuggestions": {"heading": "", "body": ""} }',
            userPrompt: `Industry: ${industry}\nKeywords: ${keywords}\nDescription: ${description || 'Not provided'}\n\nGenerate a complete brand identity:`,
            temperature: 0.8,
        });

        try {
            const jsonMatch = result.text.match(/\{[\s\S]*\}/);
            return jsonMatch ? JSON.parse(jsonMatch[0]) : { error: 'Could not parse response', raw: result.text };
        } catch {
            return { error: 'Could not parse response', raw: result.text };
        }
    }

    /**
     * Get available providers for frontend dropdown
     */
    getAvailableProviders() {
        return this.smartRouter.getAvailableProviders();
    }

    // --- Helper methods ---

    _buildContentPrompt({ type, prompt, platform, options }) {
        // New intent-based flow sends structured prompts with INTENT/SUB-TYPE/PLATFORM/TONE blocks
        // If the prompt already has structured blocks, use it directly with enhancements
        if (prompt && prompt.includes('INTENT:')) {
            let fullPrompt = prompt;

            if (options.isRegeneration) {
                fullPrompt += `\n\n⚠️ The user rejected the previous version. Generate something COMPLETELY DIFFERENT and BETTER.`;
                if (options.previousOutput) {
                    fullPrompt += `\nPrevious (rejected): "${options.previousOutput.substring(0, 300)}..."`;
                }
            }

            // Extract language directive for strong enforcement
            const langMatch = prompt.match(/LANGUAGE:\s*(.+)/i);
            const langDirective = langMatch ? langMatch[1].trim() : null;
            const isNonEnglish = langDirective && !langDirective.toLowerCase().startsWith('english');

            fullPrompt += `\n\n📋 OUTPUT REQUIREMENTS:`;
            fullPrompt += `\n- Write FINAL copy ready to publish — no placeholders like [Your Brand], [Product Name]`;
            fullPrompt += `\n- Use the brand knowledge to fill in real brand details`;
            fullPrompt += `\n- Include all platform-specific elements mentioned above`;
            fullPrompt += `\n- Output ONLY the content — no explanations, no "Here's your content:" prefix`;

            // STRONG language enforcement
            if (isNonEnglish) {
                fullPrompt += `\n\n🌍 CRITICAL LANGUAGE REQUIREMENT:`;
                fullPrompt += `\n- ${langDirective}`;
                fullPrompt += `\n- This is NON-NEGOTIABLE. The ENTIRE output MUST follow this language instruction.`;
                fullPrompt += `\n- Do NOT write in English. Do NOT add English translations.`;
                fullPrompt += `\n- Write naturally in the specified language as a native speaker would.`;
                fullPrompt += `\n- Hashtags can remain in English if appropriate for the platform.`;
            }

            return fullPrompt;
        }

        // Legacy simple prompt flow
        let fullPrompt = `Create ${type} content`;
        if (platform) fullPrompt += ` for ${platform}`;
        fullPrompt += `.\n\nUser Request: ${prompt}`;

        if (options.isRegeneration) {
            fullPrompt += `\n\n⚠️ The user rejected the previous version. Generate something DIFFERENT and BETTER.`;
            if (options.previousOutput) {
                fullPrompt += `\nPrevious (rejected): "${options.previousOutput.substring(0, 200)}..."`;
            }
        }

        const platformGuides = {
            Instagram: '\nFormat: Include relevant emojis, hashtags (5-10), and keep under 2200 chars. Make it engaging and visual.',
            LinkedIn: '\nFormat: Professional tone, structured with line breaks, no hashtags in body (add at end). Start with a hook.',
            'X (Twitter)': '\nFormat: Keep under 280 characters. Punchy and shareable.',
            Facebook: '\nFormat: Conversational, can be longer. Include a call to action.',
            Blog: '\nFormat: Full article with H1, H2 headings, introduction, body, and conclusion. SEO optimized.',
        };

        if (platform && platformGuides[platform]) {
            fullPrompt += platformGuides[platform];
        }

        return fullPrompt;
    }

    _buildVisualPrompt({ brand, type, prompt, options }) {
        const dna = brand.dna || {};
        let visual = prompt;

        if (dna.colors?.length) {
            const colorStr = dna.colors.map(c => `${c.name} (${c.hex})`).join(', ');
            visual += `\nBrand Colors: ${colorStr}`;
        }
        if (options.style) visual += `\nStyle: ${options.style}`;
        if (options.textOverlay) visual += `\nText overlay: "${options.textOverlay}"`;

        return visual;
    }

    _calculateAlignment(text, brand) {
        const keywords = brand.dna?.voice?.keywords || [];
        const keyPhrases = brand.dna?.contentStyle?.keyPhrases || [];
        const allTerms = [...keywords, ...keyPhrases];
        if (!allTerms.length) return 85;

        const lower = text.toLowerCase();
        const matches = allTerms.filter(k => lower.includes(k.toLowerCase())).length;
        const score = Math.min(95, 70 + Math.round((matches / Math.max(allTerms.length, 1)) * 25));
        return score;
    }

    _extractTitle(text, type) {
        if (['blog', 'educate', 'brand'].includes(type)) {
            const firstLine = text.split('\n')[0];
            return firstLine.replace(/^#\s*/, '').substring(0, 100);
        }
        return '';
    }

    _getMaxTokens(type) {
        return {
            // Intent-based types
            promote: 1024, celebrate: 512, launch: 1024,
            educate: 4096, brand: 2048,
            // Legacy types
            blog: 4096, email: 1024, seo: 2048,
            social: 1024, ad: 512, caption: 512,
            trend_matching: 2048,
        }[type] || 1024;
    }

    _getCreativeSize(type) {
        return {
            'instagram-post': '1024x1024',
            'instagram-story': '1024x1792',
            'facebook-ad': '1024x1024',
            'linkedin-post': '1024x1024',
            'youtube-thumb': '1792x1024',
            'banner': '1792x1024',
        }[type] || '1024x1024';
    }

    _getCreativeDimensions(type) {
        const dims = {
            'instagram-post': { width: 1080, height: 1080 },
            'instagram-story': { width: 1080, height: 1920 },
            'facebook-ad': { width: 1200, height: 628 },
            'linkedin-post': { width: 1200, height: 627 },
            'youtube-thumb': { width: 1280, height: 720 },
            'banner': { width: 1920, height: 600 },
        };
        return dims[type] || { width: 1080, height: 1080 };
    }
}

// Singleton
let instance = null;
export const getOrchestrator = () => {
    if (!instance) instance = new Orchestrator();
    return instance;
};

/**
 * Base AI Provider — Abstract interface all providers must implement.
 * To add a new AI model, create a new file extending this class.
 * That's all — no other code changes needed.
 */
export class BaseProvider {
    constructor(config = {}) {
        this.name = 'base';
        this.config = config;
        this.apiKey = config.apiKey || '';
    }

    /**
     * Generate text content
     * @param {Object} params
     * @param {string} params.systemPrompt - System instructions (brand voice, context)
     * @param {string} params.userPrompt - User's actual request
     * @param {number} params.temperature - Creativity (0-1)
     * @param {number} params.maxTokens - Max output length
     * @returns {Object} { text, tokensUsed, model }
     */
    async generateText(params) {
        throw new Error(`generateText not implemented for provider: ${this.name}`);
    }

    /**
     * Generate image
     * @param {Object} params
     * @param {string} params.prompt - Image description
     * @param {string} params.size - e.g. "1024x1024"
     * @param {string} params.style - e.g. "minimal", "bold"
     * @returns {Object} { imageUrl, model }
     */
    async generateImage(params) {
        throw new Error(`generateImage not implemented for provider: ${this.name}`);
    }

    /**
     * Analyze text (for brand voice analysis, sentiment, etc.)
     * @param {Object} params
     * @param {string} params.text - Text to analyze
     * @param {string} params.task - What to analyze for
     * @returns {Object} Analysis results
     */
    async analyzeText(params) {
        throw new Error(`analyzeText not implemented for provider: ${this.name}`);
    }

    /**
     * Check if provider is configured and ready
     */
    isAvailable() {
        return !!this.apiKey;
    }
}

import { BaseProvider } from './base.js';

/**
 * Anthropic Claude Provider
 * Drop-in replacement for other providers — text only.
 */
export class AnthropicProvider extends BaseProvider {
    constructor(config) {
        super(config);
        this.name = 'anthropic';
        this.baseUrl = 'https://api.anthropic.com/v1';
    }

    async generateText({ systemPrompt, userPrompt, temperature = 0.7, maxTokens = 2048, model }) {
        const modelId = model || this.config.defaultModel || 'claude-sonnet-4-20250514';

        const startTime = Date.now();
        const response = await fetch(`${this.baseUrl}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: modelId,
                max_tokens: maxTokens,
                system: systemPrompt,
                messages: [{ role: 'user', content: userPrompt }],
                temperature,
            }),
        });

        const data = await response.json();
        if (data.error) throw new Error(`Claude Error: ${data.error.message}`);

        return {
            text: data.content?.[0]?.text || '',
            tokensUsed: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
            model: modelId,
            provider: 'anthropic',
            generationTime: Date.now() - startTime,
        };
    }

    async analyzeText({ text, task, model }) {
        const result = await this.generateText({
            systemPrompt: 'You are a precise brand analysis AI. Always respond with valid JSON only.',
            userPrompt: `Task: ${task}\n\nAnalyze:\n${text}`,
            temperature: 0.2,
            model,
        });
        try {
            const jsonMatch = result.text.match(/\{[\s\S]*\}/);
            return jsonMatch ? JSON.parse(jsonMatch[0]) : { analysis: result.text };
        } catch {
            return { analysis: result.text };
        }
    }

    // Claude doesn't support image gen — router will fallback to another provider
    async generateImage() {
        throw new Error('Anthropic Claude does not support image generation. Use OpenAI or Stability provider.');
    }
}

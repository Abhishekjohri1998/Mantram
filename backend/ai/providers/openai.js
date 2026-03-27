import { BaseProvider } from './base.js';

/**
 * OpenAI Provider — GPT-4 / GPT-3.5 + DALL-E
 * Drop-in replacement for Gemini — same interface, different model.
 */
export class OpenAIProvider extends BaseProvider {
    constructor(config) {
        super(config);
        this.name = 'openai';
        this.baseUrl = 'https://api.openai.com/v1';
    }

    async generateText({ systemPrompt, userPrompt, temperature = 0.7, maxTokens = 2048, model }) {
        const modelId = model || this.config.defaultModel || 'gpt-4o-mini';

        const startTime = Date.now();
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                model: modelId,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                temperature,
                max_tokens: maxTokens,
            }),
        });

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(`OpenAI Error [${response.status}]: ${data.error?.message || response.statusText}`);
        }

        const data = await response.json();

        return {
            text: data.choices?.[0]?.message?.content || '',
            tokensUsed: data.usage?.total_tokens || 0,
            model: modelId,
            provider: 'openai',
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

    async generateImage({ prompt, size = '1024x1024', model }) {
        // Normalize size — Gemini uses '1K', aspect ratios, etc. but OpenAI only accepts specific dimensions
        const sizeMap = {
            '1K': '1024x1024', '1k': '1024x1024', '2K': '1024x1024', '2k': '1024x1024',
            '1:1': '1024x1024', '4:5': '1024x1536', '5:4': '1536x1024',
            '9:16': '1024x1536', '16:9': '1536x1024', '3:4': '1024x1536', '4:3': '1536x1024',
            '2:3': '1024x1536', '3:2': '1536x1024',
        };
        const normalizedSize = sizeMap[size] || (['1024x1024', '1024x1536', '1536x1024', 'auto'].includes(size) ? size : 'auto');
        const response = await fetch(`${this.baseUrl}/images/generations`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                model: model || 'dall-e-3',
                prompt,
                size: normalizedSize,
                n: 1,
            }),
        });

        const data = await response.json();
        if (data.error) throw new Error(`OpenAI Image Error: ${data.error.message}`);

        return {
            imageUrl: data.data?.[0]?.url || '',
            model: model || 'dall-e-3',
            provider: 'openai',
        };
    }
}

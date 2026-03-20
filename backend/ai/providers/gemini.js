import { BaseProvider } from './base.js';

/**
 * Google Gemini Provider
 * Supports text generation, analysis, and image generation via Imagen / Gemini Flash.
 * Uses the Gemini REST API directly (no SDK dependency).
 */
export class GeminiProvider extends BaseProvider {
    constructor(config) {
        super(config);
        this.name = 'gemini';
        this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
        // Dedicated image generation key (billed) — falls back to main key
        this.imageApiKey = config.imageApiKey || this.apiKey;
    }

    async generateText({ systemPrompt, userPrompt, temperature = 0.7, maxTokens = 2048, model }) {
        const modelId = model || this.config.defaultModel || 'gemini-2.5-flash';
        const url = `${this.baseUrl}/models/${modelId}:generateContent?key=${this.apiKey}`;

        const startTime = Date.now();
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [
                    { role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] },
                ],
                generationConfig: {
                    temperature,
                    maxOutputTokens: maxTokens,
                },
            }),
        });

        const data = await response.json();

        if (data.error) {
            throw new Error(`Gemini API Error: ${data.error.message}`);
        }

        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const tokensUsed = data.usageMetadata?.totalTokenCount || 0;

        return {
            text,
            tokensUsed,
            model: modelId,
            provider: 'gemini',
            generationTime: Date.now() - startTime,
        };
    }

    async analyzeText({ text, task, model }) {
        const prompt = `You are a brand analysis AI. Task: ${task}\n\nAnalyze the following text and return structured JSON:\n\n${text}`;
        const result = await this.generateText({
            systemPrompt: 'You are a precise brand analysis AI. Always respond with valid JSON.',
            userPrompt: prompt,
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

    /**
     * Generate image using NanoBanana 2 (gemini-3.1-flash-image-preview).
     * Uses the dedicated GEMINI_IMAGE_API_KEY (billed key) for image generation.
     * Direct call — no fallback chain for speed.
     */
    async generateImage({ prompt, size = '1024x1024', model }) {
        const startTime = Date.now();
        const [width, height] = size.split('x').map(Number);
        const aspectRatio = width === height ? '1:1' : width > height ? '16:9' : '9:16';
        const imageKey = this.imageApiKey;
        const modelId = 'gemini-3.1-flash-image-preview'; // NanoBanana 2

        const url = `${this.baseUrl}/models/${modelId}:generateContent?key=${imageKey}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: `Generate an image: ${prompt}` }] }],
                generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
            }),
        });

        const data = await response.json();
        if (data.error) throw new Error(`NanoBanana 2 error: ${data.error.message}`);

        const parts = data.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
            if (part.inlineData?.mimeType?.startsWith('image/')) {
                return {
                    imageUrl: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
                    model: modelId,
                    provider: 'gemini',
                    generationTime: Date.now() - startTime,
                };
            }
        }
        throw new Error('NanoBanana 2: no image in response');
    }
}

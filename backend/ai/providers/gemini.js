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
     * Generate image using Gemini's image generation capabilities.
     * Uses the dedicated GEMINI_IMAGE_API_KEY (billed key) for image generation.
     * Tries in order:
     *   1. gemini-3.1-flash-image-preview (Nanobanana 2 — latest, Feb 2026)
     *   2. gemini-2.0-flash-exp-image-generation (Gemini native image gen)
     *   3. imagen-4.0-generate-001 (Imagen 4 via predict API)
     */
    async generateImage({ prompt, size = '1024x1024', model }) {
        const startTime = Date.now();
        const [width, height] = size.split('x').map(Number);
        const aspectRatio = width === height ? '1:1' : width > height ? '16:9' : '9:16';
        // Use dedicated image API key (billed)
        const imageKey = this.imageApiKey;

        // Method 1: Nano Banana 2 — Gemini 3.1 Flash Image Preview (latest, Feb 2026)
        try {
            const modelId = 'gemini-3.1-flash-image-preview';
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
            if (data.error) throw new Error(data.error.message);

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
            throw new Error('No image in response');
        } catch (err) {
            console.error('Nanobanana 2 (Gemini 3.1 Flash) failed:', err.message);
        }

        // Method 2: Gemini 2.0 Flash Image Generation (fallback)
        try {
            const modelId = 'gemini-2.5-flash-preview-image-generation';
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
            if (data.error) throw new Error(data.error.message);

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
            throw new Error('No image in response');
        } catch (err) {
            console.error('Gemini 2.0 Flash image gen failed:', err.message);
        }

        // Method 3: Imagen 4.0 (predict API fallback)
        try {
            const modelId = 'imagen-4.0-generate-001';
            const url = `${this.baseUrl}/models/${modelId}:predict?key=${imageKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    instances: [{ prompt }],
                    parameters: { sampleCount: 1, aspectRatio },
                }),
            });

            const data = await response.json();
            if (data.error) throw new Error(data.error.message);

            if (data.predictions?.[0]?.bytesBase64Encoded) {
                return {
                    imageUrl: `data:image/png;base64,${data.predictions[0].bytesBase64Encoded}`,
                    model: modelId,
                    provider: 'gemini',
                    generationTime: Date.now() - startTime,
                };
            }
            throw new Error('No image in Imagen response');
        } catch (err) {
            console.error('Imagen 4.0 failed:', err.message);
        }

        throw new Error('Gemini image generation requires a billed API key. Please enable billing at https://ai.google.dev/pricing or the system will use DALL-E as fallback.');
    }
}

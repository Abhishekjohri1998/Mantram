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

    async generateText({ systemPrompt, userPrompt, temperature = 0.7, maxTokens = 2048, model, images = [] }) {
        const modelId = model || this.config.defaultModel || 'gemini-1.5-flash-latest';
        const url = `${this.baseUrl}/models/${modelId}:generateContent?key=${this.apiKey}`;
        
        const parts = [{ text: `${systemPrompt}\n\n${userPrompt}` }];

        // Attach base64 or URL images to Gemini payload
        if (images && images.length > 0) {
            for (const img of images) {
                let mimeType = 'image/jpeg';
                let b64Data = '';
                
                if (img.startsWith('data:')) {
                    const match = img.match(/^data:([\w/+]+);base64,(.+)$/);
                    if (match) {
                        mimeType = match[1];
                        b64Data = match[2];
                    }
                } else if (img.startsWith('http')) {
                    try {
                        console.log(`📥 Fetching image URL for Gemini Vision: ${img.substring(0, 100)}...`);
                        const r = await fetch(img);
                        const arr = await r.arrayBuffer();
                        b64Data = Buffer.from(arr).toString('base64');
                        mimeType = r.headers.get('content-type') || 'image/jpeg';
                    } catch(e) { console.warn('⚠️ Failed to fetch image URL for Gemini:', e.message); }
                }
                
                if (b64Data) {
                    parts.push({ inlineData: { mimeType, data: b64Data } });
                }
            }
        }

        const startTime = Date.now();
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [
                    { role: 'user', parts },
                ],
                generationConfig: {
                    temperature,
                    maxOutputTokens: maxTokens,
                },
            }),
        });
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(`Gemini API Error [${response.status}]: ${data.error?.message || response.statusText}`);
        }

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
        const models = ['gemini-1.5-flash-latest', 'gemini-1.5-pro-latest'];
        let lastError = null;

        for (const modelId of models) {
            try {
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
                if (data.error) {
                    lastError = data.error.message;
                    continue; // try next model
                }

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
            } catch (err) {
                lastError = err.message;
                continue;
            }
        }
        throw new Error(`NanoBanana/Gemini Image models failed. Last error: ${lastError}`);
    }
}

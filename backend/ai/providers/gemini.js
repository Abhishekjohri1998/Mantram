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
        const modelId = model || this.config.defaultModel || 'gemini-2.5-flash';
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
     * Generate image using modern Gemini models (Flash/Pro) or older Imagen models.
     * Supports gemini-3.1-flash-image-preview, imagen-3, etc.
     */
    async generateImage({ prompt, aspectRatio = '1:1', model, imageParts = [] }) {
        const startTime = Date.now();
        const imageKey = this.imageApiKey;
        const modelId = model || this.config.defaultImageModel || 'gemini-3.1-flash-image-preview';

        console.log(`\n══════ GEMINI IMAGE GENERATION (${modelId}) ══════`);
        console.log(`📐 Aspect Ratio: ${aspectRatio}`);
        console.log(`📝 Prompt: ${prompt.substring(0, 100)}...`);

        try {
            // Modern models (Flash 2.5, Flash 3.1 Preview, etc.) use generateContent
            if (modelId.includes('flash') || modelId.includes('pro') || modelId.includes('preview')) {
                const url = `${this.baseUrl}/models/${modelId}:generateContent?key=${imageKey}`;
                
                // Build content parts
                const parts = [];
                for (const ip of imageParts) {
                    if (ip.inlineData) parts.push({ inlineData: ip.inlineData });
                    if (ip.text) parts.push({ text: ip.text });
                }
                
                // Append aspect ratio instruction to prompt if needed
                const arInstruction = aspectRatio !== '1:1' ? `\n\n[ASPECT RATIO: ${aspectRatio}]` : '';
                parts.push({ text: prompt + arInstruction });

                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ role: 'user', parts }],
                        generationConfig: {
                            responseModalities: ['TEXT', 'IMAGE'],
                            temperature: 0.4,
                        },
                    }),
                });

                const data = await response.json();
                
                if (data.error) {
                    const errMsg = data.error.message || JSON.stringify(data.error);
                    const isBusy = errMsg.toLowerCase().includes('high demand') || 
                                   errMsg.toLowerCase().includes('busy') || 
                                   response.status === 503 || 
                                   response.status === 429;
                    
                    if (isBusy) {
                        throw new Error(`BUSY: ${errMsg}`);
                    }
                    throw new Error(`Gemini Image Error: ${errMsg}`);
                }

                const resParts = data.candidates?.[0]?.content?.parts || [];
                let imageUrl = null;
                for (const part of resParts) {
                    if (part.inlineData?.mimeType?.startsWith('image/')) {
                        imageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                        break;
                    }
                }

                if (imageUrl) {
                    return {
                        imageUrl,
                        model: modelId,
                        provider: 'gemini',
                        generationTime: Date.now() - startTime,
                    };
                }
                throw new Error('Gemini returned no image in response');
            } 
            
            // Legacy Imagen models use predict endpoint
            else {
                const url = `${this.baseUrl}/models/${modelId}:predict?key=${imageKey}`;
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        instances: [{ prompt }],
                        parameters: { sampleCount: 1, aspectRatio: '1:1' }
                    }),
                });

                const data = await response.json();
                if (data.error) throw new Error(data.error.message);

                const prediction = data.predictions?.[0];
                if (prediction?.bytesBase64Encoded) {
                    return {
                        imageUrl: `data:image/png;base64,${prediction.bytesBase64Encoded}`,
                        model: modelId,
                        provider: 'gemini',
                        generationTime: Date.now() - startTime,
                    };
                }
                throw new Error('Gemini Predict returned no image');
            }
        } catch (err) {
            console.error(`❌ Gemini Image generation failed (${modelId}):`, err.message);
            throw err;
        }
    }
}

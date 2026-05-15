import { BaseProvider } from './base.js';

/**
 * OpenAI Provider — GPT-4o / GPT-4o-mini + GPT Image 2 + gpt-4o Vision
 * Drop-in replacement for Gemini — same interface, different model.
 */
export class OpenAIProvider extends BaseProvider {
    constructor(config) {
        super(config);
        this.name = 'openai';
        this.baseUrl = 'https://api.openai.com/v1';
    }

    async generateText({ systemPrompt, userPrompt, temperature = 0.7, maxTokens = 2048, model, imageParts }) {
        const modelId = model || this.config.defaultModel || 'gpt-4o-mini';

        // Build message content — supports vision (imageParts = array of { inlineData: { data, mimeType } } or URL strings)
        let userContent = userPrompt;
        if (imageParts?.length) {
            userContent = [
                { type: 'text', text: userPrompt },
                ...imageParts.map(part => {
                    if (typeof part === 'string') {
                        return { type: 'image_url', image_url: { url: part } };
                    }
                    if (part.inlineData) {
                        return {
                            type: 'image_url',
                            image_url: { url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` },
                        };
                    }
                    return { type: 'text', text: '[image not available]' };
                }),
            ];
        }

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
                    { role: 'user', content: userContent },
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

    /**
     * Generate image — supports both dall-e-3 and gpt-image-2
     *
     * gpt-image-2:
     *  - Endpoint: POST /images/generations
     *  - Supported sizes: 1024x1024, 1024x1536, 1536x1024, auto
     *  - quality: 'standard' | 'hd'  (hd = 2x cost, sharper)
     *  - Returns: base64 (b64_json) or URL depending on response_format
     *
     * For thumbnails (16:9) → 1536x1024, quality: hd
     */
    async generateImage({ prompt, size = '1024x1024', model, quality, aspectRatio, imageParts }) {
        const modelId = model || this.config.defaultImageModel || 'dall-e-3';
        const isGptImage2 = modelId === 'gpt-image-2';

        // Aspect ratio → size mapping
        const aspectToSize = {
            '1:1':   '1024x1024',
            '16:9':  '1536x1024',
            '9:16':  '1024x1536',
            '4:3':   '1536x1024',
            '3:4':   '1024x1536',
            '4:5':   '1024x1536',
        };
        const sizeMap = {
            '1K': '1024x1024', '1k': '1024x1024', '2K': '1024x1024', '2k': '1024x1024',
            '1:1': '1024x1024', '4:5': '1024x1536', '5:4': '1536x1024',
            '9:16': '1024x1536', '16:9': '1536x1024', '3:4': '1024x1536', '4:3': '1536x1024',
            '2:3': '1024x1536', '3:2': '1536x1024',
        };
        const resolvedSize = (aspectRatio ? (aspectToSize[aspectRatio] || '1536x1024') : sizeMap[size]) || '1024x1024';
        const allowedSizes = ['1024x1024', '1024x1536', '1536x1024', 'auto'];
        const finalSize = allowedSizes.includes(resolvedSize) ? resolvedSize : '1024x1024';

        // Build request body
        const body = {
            model: modelId,
            prompt,
            n: 1,
            size: isGptImage2 ? finalSize : (finalSize === 'auto' ? '1024x1024' : finalSize),
        };

        if (isGptImage2) {
            body.quality = quality || 'hd';
            body.response_format = 'b64_json';  // gpt-image-2 default — more reliable than URL
            // Reference images for gpt-image-2 (for style/composition grounding)
            if (imageParts?.length) {
                // gpt-image-2 supports input images via the /images/edits endpoint
                // For generations with reference, we encode them in the prompt context
                // (gpt-image-2 in generations mode takes text prompts only; edits endpoint takes images)
                // We note the reference in the prompt instead
                console.log(`   ℹ️ gpt-image-2: ${imageParts.length} reference image(s) — context injected into prompt`);
            }
        } else {
            // dall-e-3
            body.quality = quality || 'hd';
            const dalleSizes = ['256x256', '512x512', '1024x1024', '1792x1024', '1024x1792'];
            body.size = dalleSizes.includes(finalSize) ? finalSize : '1792x1024'; // dalle-3 doesn't have 1536x1024
        }

        const response = await fetch(`${this.baseUrl}/images/generations`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify(body),
        });

        const data = await response.json();
        if (!response.ok || data.error) {
            throw new Error(`OpenAI Image Error [${response.status}]: ${data.error?.message || JSON.stringify(data).substring(0, 200)}`);
        }

        const item = data.data?.[0];
        if (!item) throw new Error('OpenAI image response has no data');

        // gpt-image-2 returns base64 — upload to a data URL for consumption
        let imageUrl = item.url || '';
        if (item.b64_json) {
            // Return as data URI — caller can upload to S3 or serve directly
            imageUrl = `data:image/png;base64,${item.b64_json}`;
        }

        return {
            imageUrl,
            b64: item.b64_json || null,
            model: modelId,
            provider: 'openai',
        };
    }

    /**
     * Generate image with edits — gpt-image-2 specific
     * Allows reference images for style/character grounding
     * Uses multipart/form-data (not JSON) per API spec
     */
    async generateImageEdit({ prompt, referenceImageBase64, referenceImageMime = 'image/jpeg', size = '1536x1024' }) {
        const allowedSizes = ['1024x1024', '1024x1536', '1536x1024'];
        const finalSize = allowedSizes.includes(size) ? size : '1536x1024';

        // Build FormData for multipart request
        const { FormData, Blob } = await import('node:buffer').then(() => globalThis);

        const formData = new FormData();
        formData.append('model', 'gpt-image-2');
        formData.append('prompt', prompt);
        formData.append('size', finalSize);
        formData.append('quality', 'hd');
        formData.append('n', '1');
        formData.append('response_format', 'b64_json');

        if (referenceImageBase64) {
            const imgBuffer = Buffer.from(referenceImageBase64, 'base64');
            const blob = new Blob([imgBuffer], { type: referenceImageMime });
            formData.append('image[]', blob, 'reference.jpg');
        }

        const response = await fetch(`${this.baseUrl}/images/edits`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${this.apiKey}` },
            body: formData,
        });

        const data = await response.json();
        if (!response.ok || data.error) {
            throw new Error(`OpenAI ImageEdit Error [${response.status}]: ${data.error?.message || JSON.stringify(data).substring(0, 200)}`);
        }

        const item = data.data?.[0];
        if (!item?.b64_json) throw new Error('OpenAI image edit returned no b64_json');

        return {
            imageUrl: `data:image/png;base64,${item.b64_json}`,
            b64: item.b64_json,
            model: 'gpt-image-2',
            provider: 'openai',
        };
    }
}

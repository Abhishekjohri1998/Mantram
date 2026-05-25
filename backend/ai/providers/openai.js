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
        // LaoZhang proxy — used automatically for gpt-image-2 when key is available
        // This mirrors exactly how Creative Studio's openaiImageGenerate() works
        this.lzApiKey = config.laozhangApiKey;
        this.lzBaseUrl = config.laozhangBaseUrl || 'https://api.laozhang.ai/v1';
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
     * Generate image — supports both gpt-image-2 and gpt-image-1
     *
     * gpt-image-2:
     *  - Endpoint: POST /images/generations
     *  - Supported sizes: 1024x1024, 1024x1536, 1536x1024, auto
     *  - quality: 'standard' | 'hd'  (hd = 2x cost, sharper)
     *  - Returns: base64 (b64_json) or URL depending on response_format
     *
     * For thumbnails (16:9) → 1536x1024, quality: hd
     */
    async generateImage({ prompt, size = '1024x1024', model, quality, aspectRatio, imageParts, image_url }) {
        let modelId = model || this.config.defaultImageModel || 'gpt-image-2';
        if (modelId === 'nanobanana') modelId = 'gpt-image-2'; // NanoBanana is an alias for gpt-image-2
        if (modelId === 'dall-e-3') {
            throw new Error('DALL-E 3 is a deprecated model and cannot be used.');
        }

        const isGptImageModel = modelId === 'gpt-image-2' || modelId === 'gpt-image-1';

        // Aspect ratio → size mapping
        const sizeMap = {
            '1:1': '1024x1024', '16:9': '1536x1024', '9:16': '1024x1536', '4:5': '1024x1024', '5:4': '1536x1024',
            '21:9': '1536x1024', '2:1': '1536x1024', '1:2': '1024x1536',
        };
        // specific fallback mappings
        const aspectToSize = {
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
            size: isGptImageModel ? finalSize : (finalSize === 'auto' ? '1024x1024' : finalSize),
        };

        if (image_url) {
            body.image_url = image_url;
            console.log(`   ℹ️ ${modelId}: Injecting S3 URL natively into API payload -> ${image_url.substring(0,60)}...`);
        }

        if (isGptImageModel) {
            body.quality = quality || 'high';
            // Reference images for gpt-image models — must go through LaoZhang /images/edits
            if (imageParts?.length) {
                if (!this.lzApiKey) {
                    console.warn(`   ⚠️  ${modelId} ref images require LAOZHANG_API_KEY (no fallback). Ignoring refs.`);
                } else {
                    console.log(`   ℹ️  ${modelId}: ${imageParts.length} reference image(s) — routing to LaoZhang /images/edits`);
                    return this.generateImageEdit({ prompt, imageParts, size: finalSize, model: modelId });
                }
            }
        } else {
            body.quality = quality || 'high';
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
     * Generate image with edits — gpt-image specific
     * Allows reference images for style/character grounding
     * Uses multipart/form-data (not JSON) per API spec
     */
    async generateImageEdit({ prompt, imageParts = [], size = '1536x1024', model = 'gpt-image-2' }) {
        const allowedSizes = ['1024x1024', '1024x1536', '1536x1024'];
        const finalSize = allowedSizes.includes(size) ? size : '1536x1024';

        // Build FormData for multipart request
        const { FormData, Blob } = await import('node:buffer').then(() => globalThis);

        const formData = new FormData();
        formData.append('model', model);
        formData.append('prompt', prompt);
        formData.append('size', finalSize);
        formData.append('quality', 'high');
        formData.append('n', '1');

        // LaoZhang proxy supports multiple 'image[]' parameters for character/style injection
        for (let i = 0; i < imageParts.length; i++) {
            const part = imageParts[i].inlineData;
            if (part && part.data) {
                const imgBuffer = Buffer.from(part.data, 'base64');
                const blob = new Blob([imgBuffer], { type: part.mimeType || 'image/jpeg' });
                const ext = (part.mimeType || '').includes('png') ? 'png' : 'jpg';
                formData.append('image[]', blob, `reference_${i}.${ext}`);
            }
        }

        // ── Always use LaoZhang proxy for /images/edits (native OpenAI doesn't support gpt-image edits) ──
        const editApiKey = this.lzApiKey || this.apiKey;
        const editBaseUrl = this.lzApiKey ? this.lzBaseUrl : this.baseUrl;
        if (!editApiKey) throw new Error('No API key for image edit — set LAOZHANG_API_KEY or OPENAI_API_KEY');
        console.log(`   📡 Sending to: ${editBaseUrl}/images/edits (${this.lzApiKey ? 'LaoZhang' : 'Direct OpenAI'})`);

        const response = await fetch(`${editBaseUrl}/images/edits`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${editApiKey}` },
            body: formData,
        });

        const data = await response.json();
        if (!response.ok || data.error) {
            throw new Error(`OpenAI ImageEdit Error [${response.status}]: ${data.error?.message || JSON.stringify(data).substring(0, 200)}`);
        }

        const item = data.data?.[0];
        if (!item) throw new Error('OpenAI image edit returned empty data array');

        return {
            imageUrl: item.b64_json ? `data:image/png;base64,${item.b64_json}` : item.url,
            b64: item.b64_json || null,
            model: model,
            provider: 'openai',
        };
    }
}

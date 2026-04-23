import { BaseProvider } from './base.js';
import { fetchOptions } from '../../utils/network.js';
import { getCachedImageBuffer, setCachedImageBuffer } from '../../utils/imageCache.js';

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

    async generateText({ systemPrompt, userPrompt, temperature = 0.7, maxTokens = 2048, model, images = [], youtubeUrl = null }) {
        const modelId = model || this.config.defaultModel || 'gemini-3-flash-preview';
        const url = `${this.baseUrl}/models/${modelId}:generateContent?key=${this.apiKey}`;
        
        // Native YouTube URL support — inject as fileData part so Gemini watches the video
        // Per Google AI docs: fileData with video/mp4 mimeType + youtube URL triggers native video understanding
        const parts = [];
        if (youtubeUrl) {
            parts.push({ fileData: { mimeType: 'video/mp4', fileUri: youtubeUrl } });
            console.log(`🎬 [Gemini] Native YouTube video analysis: ${youtubeUrl}`);
        }
        parts.push({ text: `${systemPrompt}\n\n${userPrompt}` });


        // Attach base64 or URL images to Gemini payload
        if (images && images.length > 0) {
            const processImage = async (img) => {
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
                        const cached = getCachedImageBuffer(img);
                        if (cached) {
                            console.log(`⚡ Cache HIT for Gemini Vision image: ${img.substring(0, 100)}...`);
                            b64Data = cached.buffer;
                            mimeType = cached.mimeType;
                        } else {
                            console.log(`📥 Fetching image URL for Gemini Vision: ${img.substring(0, 100)}...`);
                            const r = await fetch(img, {
                                headers: {
                                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                                    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
                                }
                            });
                            
                            if (!r.ok) {
                                throw new Error(`HTTP ${r.status} ${r.statusText}`);
                            }
                            
                            const arr = await r.arrayBuffer();
                            b64Data = Buffer.from(arr).toString('base64');
                            mimeType = r.headers.get('content-type') || 'image/jpeg';
                            
                            // Guard against CDNs returning HTML CAPTCHAs disguised as images
                            if (mimeType.includes('text/html')) {
                                throw new Error('Received HTML page instead of image (likely CAPTCHA blocked)');
                            }
                            
                            setCachedImageBuffer(img, b64Data, mimeType);
                        }
                    } catch(e) { console.warn(`⚠️ Failed to fetch image URL for Gemini (${img.substring(0,60)}...):`, e.message); }
                }
                
                if (b64Data) {
                    return { inlineData: { mimeType, data: b64Data } };
                }
                return null;
            };

            const imageParts = await Promise.all(images.map(processImage));
            parts.push(...imageParts.filter(p => p !== null));
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
            const errMsg = data.error?.message || response.statusText;
            console.error(`❌ [Gemini] API Error [${response.status}]: ${errMsg} | Model: ${modelId}`);
            throw new Error(`Gemini API Error [${response.status}]: ${errMsg}`);
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

    /**
     * Generate text with Google Search Grounding — gives the model real-time web access.
     * Uses Gemini's built-in `google_search` tool (free, no extra API key).
     * Returns text + grounding citations (URLs, titles, snippets).
     */
    async generateTextWithSearch({ systemPrompt, userPrompt, temperature = 0.7, maxTokens = 4096, model }) {
        const modelId = model || this.config.defaultModel || 'gemini-3-flash-preview';
        const url = `${this.baseUrl}/models/${modelId}:generateContent?key=${this.apiKey}`;

        const startTime = Date.now();
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [
                    { role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] },
                ],
                tools: [{ google_search: {} }],
                generationConfig: {
                    temperature,
                    maxOutputTokens: maxTokens,
                },
            }),
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(`Gemini Search API Error [${response.status}]: ${errData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        if (data.error) throw new Error(`Gemini Search Error: ${data.error.message}`);

        // Extract text from all parts
        const parts = data.candidates?.[0]?.content?.parts || [];
        const textParts = parts.filter(p => p.text).map(p => p.text);
        const text = textParts.join('\n');

        // Extract grounding metadata (citations, search queries, sources)
        const groundingMeta = data.candidates?.[0]?.groundingMetadata || {};
        const searchQueries = groundingMeta.searchEntryPoint?.renderedContent ? [groundingMeta.searchEntryPoint] : [];
        const groundingChunks = groundingMeta.groundingChunks || [];
        const groundingSupports = groundingMeta.groundingSupports || [];

        // Build clean citation list
        const citations = groundingChunks
            .filter(chunk => chunk.web)
            .map(chunk => ({
                url: chunk.web.uri,
                title: chunk.web.title || new URL(chunk.web.uri).hostname,
            }));

        // Deduplicate citations by URL
        const uniqueCitations = [...new Map(citations.map(c => [c.url, c])).values()];

        const tokensUsed = data.usageMetadata?.totalTokenCount || 0;

        return {
            text,
            citations: uniqueCitations,
            searchQueries: groundingMeta.webSearchQueries || [],
            tokensUsed,
            model: modelId,
            provider: 'gemini',
            generationTime: Date.now() - startTime,
            grounded: uniqueCitations.length > 0,
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
        console.log(`📝 Prompt: ${(prompt || '').toString().substring(0, 100)}...`);

        try {
            // Modern models (Flash 2.5, Flash 3.1 Preview, etc.) use generateContent
            if (modelId.includes('flash') || modelId.includes('pro') || modelId.includes('preview')) {
                const url = `${this.baseUrl}/models/${modelId}:generateContent?key=${imageKey}`;
                
                // Build content parts
                const parts = [];
                if (prompt) parts.push({ text: prompt });
                
                for (const ip of imageParts) {
                    if (ip.inlineData) parts.push({ inlineData: ip.inlineData });
                    if (ip.text) parts.push({ text: ip.text });
                }
                
                // Clean aspectRatio parameter to guarantee valid native values (default to 1:1)
                const safeARs = ["1:1","1:4","1:8","2:3","3:2","3:4","4:1","4:3","4:5","5:4","8:1","9:16","16:9","21:9"];
                const nativeAspectRatio = safeARs.includes(aspectRatio) ? aspectRatio : '1:1';

                let response;
                let data;
                let lastError = null;

                for (let attempt = 1; attempt <= 2; attempt++) {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 45_000); // 45s timeout per attempt (reduced from 60s)
                    try {
                        response = await fetch(url, fetchOptions({
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                contents: [{ role: 'user', parts }],
                                generationConfig: {
                                    responseModalities: ['TEXT', 'IMAGE'],
                                    temperature: 0.4,
                                    imageConfig: {
                                        aspectRatio: nativeAspectRatio,
                                        imageSize: "2K"
                                    }
                                },
                            }),
                            signal: controller.signal,
                        }));
                        data = await response.json();
                        
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
                        
                        // Success -> break out of retry loop
                        lastError = null;
                        break;
                    } catch (attemptErr) {
                        clearTimeout(timeoutId);
                        
                        const isTimeout = attemptErr.name === 'AbortError' || (attemptErr.message && attemptErr.message.toLowerCase().includes('aborted'));
                        const isBusy = attemptErr.message && attemptErr.message.includes('BUSY:');
                        
                        if ((isTimeout || isBusy) && attempt === 1) {
                            console.warn(`⚠️ Gemini Image attempt 1 failed (${isTimeout ? 'Timeout' : '503 Busy'}). Retrying in 500ms...`);
                            await new Promise(r => setTimeout(r, 500)); // ⚡ Reduced from 2s to 500ms
                            continue;
                        }
                        
                        // If it's not a retryable error or we exhausted attempts
                        if (isTimeout) throw new Error('BUSY: Gemini API timed out after 45 seconds. Google servers are likely overloaded.');
                        throw attemptErr;
                    } finally {
                        clearTimeout(timeoutId);
                    }
                }

                if (lastError) throw lastError;

                const resParts = data.candidates?.[0]?.content?.parts || [];
                // ── Return base64 immediately — caller's background IIFE handles S3 upload ──
                // Previously we blocked here on S3 upload (could take 10-30s extra).
                // Now we return the data URL and let the background upload flow handle it.
                for (const part of resParts) {
                    if (part.inlineData?.mimeType?.startsWith('image/')) {
                        const imageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                        console.log(`✅ Gemini image generated (${modelId}) — returning base64, S3 upload pending`);
                        return {
                            imageUrl,
                            model: modelId,
                            provider: 'gemini',
                            generationTime: Date.now() - startTime,
                        };
                    }
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
            const isTimeout = err.name === 'AbortError' || (err.message && err.message.toLowerCase().includes('aborted'));
            if (isTimeout) {
                console.warn(`⏳ Gemini Image generation timed out after 90s (${modelId})`);
                throw new Error('BUSY: Gemini API timed out after 90 seconds. Google servers are likely overloaded.');
            }
            console.error(`❌ Gemini Image generation failed (${modelId}):`, err.message);
            throw err;
        }
    }
}

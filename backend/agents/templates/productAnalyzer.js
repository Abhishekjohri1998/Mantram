/**
 * productAnalyzer.js — Stage 4: Two-pass AI product intelligence pipeline
 *
 * Uses raw fetch for the Anthropic API (same pattern as AnthropicProvider in ai/providers/anthropic.js).
 * Does NOT require the @anthropic-ai/sdk package — only the ANTHROPIC_API_KEY env var.
 *
 * Pass 1: Classification — determines product category + complexity from image
 * Pass 2: Specification Capture — extracts detailed mechanical/visual specs per taxonomy
 *
 * Only runs when:
 *  1. A product image URL is provided
 *  2. ANTHROPIC_API_KEY is set in env
 */

import { PRODUCT_CATEGORIES } from './productTaxonomy.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ATLAS_CHAT_URL = (process.env.ATLASCLOUD_BASE_URL || 'https://api.atlascloud.ai/v1') + '/chat/completions';
const CLAUDE_MODEL = 'claude-sonnet-4-6';
const ATLAS_CLAUDE_MODEL = 'anthropic/claude-sonnet-4.6';
const SUPPORTED_CATEGORIES = Object.keys(PRODUCT_CATEGORIES);

/**
 * Low-level Claude call with vision support.
 * Uses Atlas Cloud (OpenAI-compatible) as primary, direct Anthropic as fallback.
 * imageData: full S3/CDN URL (preferred) or data: base64 string.
 */
async function callClaudeVision(imageData, userText, maxTokens = 512) {
    const atlasKey = process.env.ATLASCLOUD_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!atlasKey && !anthropicKey) throw new Error('No AI API key set (ATLASCLOUD_API_KEY or ANTHROPIC_API_KEY)');

    const useAtlas = !!atlasKey;

    if (useAtlas) {
        // Atlas Cloud — OpenAI-compatible multimodal format
        let imageUrl;
        if (imageData.startsWith('data:')) {
            imageUrl = imageData; // data: URI works directly in OpenAI format
        } else {
            imageUrl = imageData; // HTTP URL
        }

        const body = {
            model: ATLAS_CLAUDE_MODEL,
            max_tokens: maxTokens,
            messages: [{
                role: 'user',
                content: [
                    { type: 'image_url', image_url: { url: imageUrl } },
                    { type: 'text', text: userText },
                ],
            }],
        };

        const response = await fetch(ATLAS_CHAT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${atlasKey}`,
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(`Atlas Claude API Error [${response.status}]: ${errData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        const rawText = (data.choices?.[0]?.message?.content || '').trim();
        return rawText.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
    }

    // Fallback: Direct Anthropic API (native format)
    let imageBlock;
    if (imageData.startsWith('data:')) {
        const [meta, b64] = imageData.split(',');
        const mediaType = meta.replace('data:', '').replace(';base64', '');
        imageBlock = { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } };
    } else {
        imageBlock = { type: 'image', source: { type: 'url', url: imageData } };
    }

    const body = {
        model: CLAUDE_MODEL,
        max_tokens: maxTokens,
        messages: [{
            role: 'user',
            content: [imageBlock, { type: 'text', text: userText }]
        }]
    };

    const response = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(`Claude API Error [${response.status}]: ${errData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    if (data.error) throw new Error(`Claude Error: ${data.error.message}`);

    const rawText = (data.content?.[0]?.text || '').trim();
    // Strip markdown code fences if present
    return rawText.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
}

/**
 * Pass 1: Classification
 * Returns { category, complexity, confidence, productType }
 */
async function classifyProduct(imageData) {
    const categoryList = SUPPORTED_CATEGORIES.join(', ');

    const prompt = `You are a product classification expert. Analyze this product image and classify it.

Available categories: ${categoryList}

Respond ONLY with a JSON object (no markdown, no explanation):
{
  "category": "one of the categories above, or 'general' if none fit",
  "complexity": "low" | "medium" | "high",
  "confidence": 0.0-1.0,
  "productType": "specific product type in 2-4 words"
}

Complexity guidance:
- high: products with many precise visual details that must be reproduced exactly (earbuds, smartwatches, laptop stands with geometric structure, skincare tubes)
- medium: products with moderate visual complexity (apparel, food packaging, basic accessories)
- low: simple products with few critical visual features

Respond with valid JSON only.`;

    try {
        const text = await callClaudeVision(imageData, prompt, 256);
        return JSON.parse(text);
    } catch (err) {
        console.warn('[productAnalyzer] Pass 1 parse/fetch failed:', err.message);
        return { category: 'general', complexity: 'medium', confidence: 0.5, productType: 'product' };
    }
}

/**
 * Pass 2: Specification Capture
 * Returns { specs, description }
 */
async function captureProductSpecs(imageData, category) {
    const taxonomy = PRODUCT_CATEGORIES[category];
    if (!taxonomy) return { specs: {}, description: '' };

    const fieldsDescription = taxonomy.fields
        .map(f => `- "${f.name}": ${f.description}`)
        .join('\n');

    const criticalFieldsStr = taxonomy.criticalFields.join(', ');

    const prompt = `You are a professional product photographer and technical writer with meticulous attention to detail.

This product belongs to the category: ${category}

Extract EVERY visible detail from this image according to the following specification schema. Be precise and literal — describe EXACTLY what you see, not what you assume.

SPECIFICATION FIELDS (extract all you can see):
${fieldsDescription}

CRITICAL FIELDS (must be present, never omit): ${criticalFieldsStr}

Respond ONLY with a valid JSON object mapping field names to their observed values.
If a field is not visible or not applicable, use null.
All values should be short descriptive strings.
No markdown, no explanation, pure JSON only.`;

    let specs = {};
    try {
        const text = await callClaudeVision(imageData, prompt, 1024);
        specs = JSON.parse(text);
    } catch (err) {
        console.warn('[productAnalyzer] Pass 2 parse/fetch failed:', err.message);
    }

    // Warn on missing critical fields
    const missingCritical = taxonomy.criticalFields.filter(f => !specs[f]);
    if (missingCritical.length > 0) {
        console.warn(`[productAnalyzer] Missing critical fields for ${category}: ${missingCritical.join(', ')}`);
    }

    const description = taxonomy.descriptionTemplate(specs);
    return { specs, description };
}

/**
 * analyzeProduct — Main export
 *
 * Runs Pass 1 (classify) then Pass 2 (spec capture) if category is supported.
 * Non-fatal: all errors return null, generation continues without intelligence.
 *
 * @param {string} imageData - S3 URL or data: base64 string of the product image
 * @returns {{ category, complexity, confidence, productType, specs, description, isComplex } | null}
 */
export async function analyzeProduct(imageData) {
    if (!imageData) return null;
    if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('[productAnalyzer] ANTHROPIC_API_KEY not set — skipping analysis');
        return null;
    }

    try {
        // Pass 1: Classify
        const classification = await classifyProduct(imageData);
        const category = classification.category;

        // Only run Pass 2 for known taxonomy categories
        if (category === 'general' || !SUPPORTED_CATEGORIES.includes(category)) {
            return {
                ...classification,
                specs: {},
                description: '',
                isComplex: classification.complexity === 'high',
            };
        }

        // Pass 2: Spec capture
        const { specs, description } = await captureProductSpecs(imageData, category);

        return {
            ...classification,
            specs,
            description,
            isComplex: classification.complexity === 'high',
        };
    } catch (err) {
        console.error('[productAnalyzer] Analysis failed (non-fatal):', err.message);
        return null; // Generation continues without intelligence
    }
}

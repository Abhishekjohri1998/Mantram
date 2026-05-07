/**
 * productAnalyzer.js — Stage 4: Two-pass AI product intelligence pipeline
 *
 * Pass 1: Classification — determines product category + complexity from image
 * Pass 2: Specification Capture — extracts detailed mechanical/visual specs per taxonomy
 *
 * Uses Claude 3.5 Sonnet (claude-3-5-sonnet-20241022) for both passes.
 *
 * Only runs when:
 *  1. A product image is provided
 *  2. The template has complex_product: true (or category matches auto-detect)
 */

import Anthropic from '@anthropic-ai/sdk';
import { PRODUCT_CATEGORIES } from './productTaxonomy.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SUPPORTED_CATEGORIES = Object.keys(PRODUCT_CATEGORIES);

/**
 * Pass 1: Classification
 * Takes image URL/base64, returns { category, complexity, confidence }
 */
async function classifyProduct(imageData) {
    const isBase64 = imageData.startsWith('data:');
    const isUrl = imageData.startsWith('http');

    const imageSource = isBase64
        ? {
            type: 'base64',
            media_type: imageData.split(';')[0].replace('data:', ''),
            data: imageData.split(',')[1],
          }
        : {
            type: 'url',
            url: imageData,
          };

    const categoryList = SUPPORTED_CATEGORIES.join(', ');

    const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 256,
        messages: [{
            role: 'user',
            content: [
                { type: 'image', source: imageSource },
                {
                    type: 'text',
                    text: `You are a product classification expert. Analyze this product image and classify it.

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

Respond with valid JSON only.`
                }
            ]
        }]
    });

    const rawText = response.content[0].text.trim();
    // Strip any markdown code fences
    const jsonText = rawText.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();

    try {
        return JSON.parse(jsonText);
    } catch {
        // Safe fallback if Claude returns non-JSON
        return { category: 'general', complexity: 'medium', confidence: 0.5, productType: 'product' };
    }
}

/**
 * Pass 2: Specification Capture
 * Takes image + category, returns detailed spec object + description paragraph
 */
async function captureProductSpecs(imageData, category) {
    const taxonomy = PRODUCT_CATEGORIES[category];
    if (!taxonomy) {
        return { description: '', specs: {} };
    }

    const isBase64 = imageData.startsWith('data:');
    const imageSource = isBase64
        ? {
            type: 'base64',
            media_type: imageData.split(';')[0].replace('data:', ''),
            data: imageData.split(',')[1],
          }
        : {
            type: 'url',
            url: imageData,
          };

    // Build the spec schema from taxonomy
    const fieldsDescription = taxonomy.fields
        .map(f => `- "${f.name}": ${f.description}`)
        .join('\n');

    const criticalFieldsStr = taxonomy.criticalFields.join(', ');

    const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [{
            role: 'user',
            content: [
                { type: 'image', source: imageSource },
                {
                    type: 'text',
                    text: `You are a professional product photographer and technical writer with meticulous attention to detail.

This product belongs to the category: ${category}

Extract EVERY visible detail from this image according to the following specification schema. Be precise and literal — describe EXACTLY what you see, not what you assume.

SPECIFICATION FIELDS (extract all you can see):
${fieldsDescription}

CRITICAL FIELDS (must be present, never omit): ${criticalFieldsStr}

Respond ONLY with a valid JSON object mapping field names to their observed values.
If a field is not visible or not applicable, use null.
All values should be short descriptive strings.
No markdown, no explanation, pure JSON only.`
                }
            ]
        }]
    });

    const rawText = response.content[0].text.trim();
    const jsonText = rawText.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();

    let specs = {};
    try {
        specs = JSON.parse(jsonText);
    } catch {
        // If parsing fails, return empty specs — prompt will use fallback
        console.warn('[productAnalyzer] Pass 2 JSON parse failed — using empty specs');
    }

    // Validate critical fields — warn if any are null/missing
    const missingCritical = taxonomy.criticalFields.filter(f => !specs[f]);
    if (missingCritical.length > 0) {
        console.warn(`[productAnalyzer] Missing critical fields for ${category}: ${missingCritical.join(', ')}`);
    }

    // Generate description from taxonomy template
    const description = taxonomy.descriptionTemplate(specs);

    return { specs, description };
}

/**
 * Main export: analyzeProduct
 *
 * Runs both passes and returns a complete productIntelligence object.
 * Call this before buildTemplatePrompt when a product image is present.
 *
 * Returns:
 *  - category         : string — PRODUCT_CATEGORIES key or 'general'
 *  - complexity       : 'low' | 'medium' | 'high'
 *  - confidence       : 0.0-1.0
 *  - productType      : string — short label
 *  - specs            : object — all extracted fields
 *  - description      : string — dense description paragraph for injection
 *  - isComplex        : boolean — shorthand for complexity === 'high'
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

        // Only run Pass 2 for supported categories (skip 'general')
        if (classification.category === 'general' || !SUPPORTED_CATEGORIES.includes(classification.category)) {
            return {
                ...classification,
                specs: {},
                description: '',
                isComplex: classification.complexity === 'high',
            };
        }

        // Pass 2: Spec capture
        const { specs, description } = await captureProductSpecs(imageData, classification.category);

        return {
            ...classification,
            specs,
            description,
            isComplex: classification.complexity === 'high',
        };

    } catch (err) {
        console.error('[productAnalyzer] Analysis failed:', err.message);
        // Non-fatal — generation continues without intelligence
        return null;
    }
}

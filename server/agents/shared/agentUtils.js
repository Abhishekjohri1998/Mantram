/**
 * Shared Agent Utilities
 * 
 * Reusable functions for all agentic pipelines:
 *   - callAgent: LLM call with JSON parsing
 *   - loadBrandContext: Brand DNA → prompt context
 *   - buildBrandContext: Brand → XML context block
 *   - buildStyleMemory: Past projects → memory block
 */

import Brand from '../../models/Brand.js';
import { getRouter } from '../../ai/router.js';

/**
 * Call Claude Sonnet and parse JSON response
 */
export async function callAgent(systemPrompt, userPrompt, temperature = 0.7, maxTokens = 4096) {
    const router = getRouter();
    const result = await router.generateText({
        systemPrompt,
        userPrompt,
        temperature,
        maxTokens,
    }, { provider: 'anthropic' });

    const text = result.text || '';
    try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch (e) {
        console.warn('Agent JSON parse failed, raw:', text.substring(0, 200));
    }
    return { error: 'Failed to parse agent response', raw: text.substring(0, 500) };
}

/**
 * Call Claude and return raw text (not JSON)
 */
export async function callAgentText(systemPrompt, userPrompt, temperature = 0.7, maxTokens = 4096) {
    const router = getRouter();
    const result = await router.generateText({
        systemPrompt,
        userPrompt,
        temperature,
        maxTokens,
    }, { provider: 'anthropic' });
    return result.text || '';
}

/**
 * Load brand + build context strings
 */
export async function loadBrandContext(brandId) {
    if (!brandId) return { brand: null, brandContext: '<brand_bible>No brand data. Use professional style.</brand_bible>', styleMemory: '' };

    const brand = await Brand.findById(brandId).lean();
    const brandContext = buildBrandContext(brand);
    return { brand, brandContext };
}

/**
 * Build brand bible XML block for agent prompts
 */
export function buildBrandContext(brand) {
    if (!brand?.dna) return '<brand_bible>No brand data available. Use generic professional style.</brand_bible>';

    const dna = brand.dna;
    const parts = [];

    if (brand.name) parts.push(`Brand: ${brand.name}`);
    if (dna.industry) parts.push(`Industry: ${dna.industry}`);
    if (dna.targetAudience) parts.push(`Target Audience: ${dna.targetAudience}`);
    if (dna.brandDescription) parts.push(`Description: ${dna.brandDescription}`);
    if (dna.country) parts.push(`Market: ${dna.country}${dna.region ? ` (${dna.region})` : ''}`);

    if (dna.voice?.personality) parts.push(`Voice: ${dna.voice.personality}`);
    if (dna.voice?.description) parts.push(`Voice Style: ${dna.voice.description}`);
    if (dna.voice?.sampleQuote) parts.push(`Sample Quote: "${dna.voice.sampleQuote}"`);
    if (dna.voice?.keywords?.length) parts.push(`Key Phrases: ${dna.voice.keywords.join(', ')}`);

    if (dna.colors?.length) {
        const colorStr = dna.colors.map(c => `${c.name || c.usage}: ${c.hex}`).join(', ');
        parts.push(`Brand Colors: ${colorStr}`);
    }
    if (dna.fonts?.heading?.family) parts.push(`Heading Font: ${dna.fonts.heading.family}`);

    if (dna.contentStyle?.dos?.length) parts.push(`Content Dos: ${dna.contentStyle.dos.join('; ')}`);
    if (dna.contentStyle?.donts?.length) parts.push(`Content Don'ts: ${dna.contentStyle.donts.join('; ')}`);
    if (dna.contentStyle?.keyPhrases?.length) parts.push(`Key Phrases: ${dna.contentStyle.keyPhrases.join('; ')}`);

    return `<brand_bible>\n${parts.join('\n')}\n</brand_bible>`;
}

/**
 * Build style memory from past projects
 */
export function buildStyleMemory(projects = [], type = 'general') {
    if (!projects.length) return '';

    const memories = projects.slice(0, 5).map(p => {
        const edits = (p.editHistory || []).map(e => `Changed ${e.field}: "${e.before}" → "${e.after}"`).join('; ');
        return `- "${p.title}": ${edits || 'No edits'}`;
    }).join('\n');

    return `\n<user_style_memory type="${type}">\n${memories}\nApply these learned preferences.\n</user_style_memory>`;
}

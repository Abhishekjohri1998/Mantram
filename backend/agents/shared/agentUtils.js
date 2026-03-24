/**
 * Shared Agent Utilities
 * 
 * Reusable functions for all agentic pipelines:
 *   - callAgent: LLM call with JSON parsing
 *   - loadBrandContext: Brand DNA → prompt context
 *   - buildBrandContext: Brand → XML context block (includes DNA + knowledge + products + images)
 *   - buildStyleMemory: Past projects → memory block
 */

import Brand from '../../models/Brand.js';
import Product from '../../models/Product.js';
import { getRouter } from '../../ai/router.js';
import { resolveTargetMarkets, getMarketContext, getRelevantFestivals } from '../../utils/globalCalendar.js';

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
    }); // Router auto-selects cheapest provider

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
    }); // Router auto-selects cheapest provider
    return result.text || '';
}

/**
 * Load brand + products + build context strings
 */
export async function loadBrandContext(brandId) {
    if (!brandId) return { brand: null, brandContext: '<brand_bible>No brand data. Use professional style.</brand_bible>', styleMemory: '' };

    const brand = await Brand.findById(brandId).lean();

    // Also load active products for this brand (up to 20)
    let products = [];
    try {
        products = await Product.find({ brand: brandId, status: 'active' })
            .select('title description shortDescription category subCategory price features keywords tags images')
            .limit(20)
            .lean();
    } catch (e) {
        // Products collection may not exist yet — gracefully continue
    }

    const brandContext = buildBrandContext(brand, products);
    return { brand, brandContext, products };
}

/**
 * Build brand bible XML block for agent prompts
 * Now includes: DNA + Knowledge Bank + Product Catalog + Brand Images
 */
export function buildBrandContext(brand, products = []) {
    if (!brand?.dna) return '<brand_bible>No brand data available. Use generic professional style.</brand_bible>';

    const dna = brand.dna;
    const parts = [];

    // ── Core Brand Identity ──
    if (brand.name) parts.push(`Brand: ${brand.name}`);
    if (dna.industry) parts.push(`Industry: ${dna.industry}`);
    if (dna.targetAudience) parts.push(`Target Audience: ${dna.targetAudience}`);
    if (dna.brandDescription) parts.push(`Description: ${dna.brandDescription}`);
    if (dna.country) parts.push(`Origin: ${dna.country}${dna.region ? ` (${dna.region})` : ''}`);

    // ── Target Markets & Global Intelligence ──
    const targetMarkets = resolveTargetMarkets(brand);
    parts.push(`Target Markets: ${targetMarkets.join(', ')}`);

    const marketCtx = getMarketContext(targetMarkets);
    if (marketCtx) parts.push(marketCtx);

    // Inject verified festival dates filtered by target markets
    const festivalCtx = getRelevantFestivals('', targetMarkets, 8);
    if (festivalCtx) parts.push(festivalCtx);

    // Language directive
    if (dna.defaultLanguage && dna.defaultLanguage !== 'english') {
        parts.push(`Content Language: Generate content primarily in ${dna.defaultLanguage}`);
    }

    // ── Voice & Tone ──
    if (dna.voice?.personality) parts.push(`Voice: ${dna.voice.personality}`);
    if (dna.voice?.description) parts.push(`Voice Style: ${dna.voice.description}`);
    if (dna.voice?.sampleQuote) parts.push(`Sample Quote: "${dna.voice.sampleQuote}"`);
    if (dna.voice?.keywords?.length) parts.push(`Key Phrases: ${dna.voice.keywords.join(', ')}`);

    // ── Visual Identity ──
    if (dna.colors?.length) {
        const colorStr = dna.colors.map(c => `${c.name || c.usage}: ${c.hex}`).join(', ');
        parts.push(`Brand Colors: ${colorStr}`);
    }
    if (dna.fonts?.heading?.family) parts.push(`Heading Font: ${dna.fonts.heading.family}`);

    // ── Content Style ──
    if (dna.contentStyle?.dos?.length) parts.push(`Content Dos: ${dna.contentStyle.dos.join('; ')}`);
    if (dna.contentStyle?.donts?.length) parts.push(`Content Don'ts: ${dna.contentStyle.donts.join('; ')}`);
    if (dna.contentStyle?.keyPhrases?.length) parts.push(`Key Phrases: ${dna.contentStyle.keyPhrases.join('; ')}`);

    // ── Knowledge Bank Entries ──
    const knowledgeEntries = brand.knowledge?.entries || [];
    if (knowledgeEntries.length > 0) {
        parts.push('');
        parts.push('=== KNOWLEDGE BANK ===');
        let totalChars = 0;
        const MAX_KNOWLEDGE_CHARS = 3000; // Cap to avoid blowing context window
        for (const entry of knowledgeEntries) {
            if (totalChars >= MAX_KNOWLEDGE_CHARS) {
                parts.push(`... and ${knowledgeEntries.length - knowledgeEntries.indexOf(entry)} more knowledge entries (truncated)`);
                break;
            }
            const content = (entry.content || '').trim();
            if (!content) continue;
            const truncated = content.length > 500 ? content.substring(0, 500) + '...' : content;
            parts.push(`[${entry.sourceType?.toUpperCase() || 'TEXT'}] ${entry.title || 'Knowledge Entry'}:`);
            parts.push(truncated);
            totalChars += truncated.length;
        }
    }

    // ── Product Catalog ──
    if (products.length > 0) {
        parts.push('');
        parts.push('=== PRODUCT CATALOG ===');
        const maxProducts = Math.min(products.length, 15);
        for (let i = 0; i < maxProducts; i++) {
            const p = products[i];
            const pParts = [`• ${p.title}`];
            if (p.category) pParts.push(`Category: ${p.category}${p.subCategory ? ` > ${p.subCategory}` : ''}`);
            if (p.shortDescription) pParts.push(p.shortDescription);
            else if (p.description) pParts.push(p.description.substring(0, 150));
            if (p.price?.amount) pParts.push(`Price: ${p.price.currency || 'INR'} ${p.price.amount}${p.price.mrp ? ` (MRP: ${p.price.mrp})` : ''}`);
            if (p.features?.length) pParts.push(`Features: ${p.features.slice(0, 5).join(', ')}`);
            if (p.keywords?.length) pParts.push(`Keywords: ${p.keywords.slice(0, 5).join(', ')}`);
            if (p.tags?.length) pParts.push(`Tags: ${p.tags.slice(0, 5).join(', ')}`);
            parts.push(pParts.join(' | '));
        }
        if (products.length > maxProducts) {
            parts.push(`... and ${products.length - maxProducts} more products`);
        }
    }

    // ── Market Rules ──
    parts.push('');
    parts.push('=== MARKET RULES ===');
    parts.push('1. Adapt ALL content for the target markets — use their currency, language, cultural references, and local trends.');
    parts.push('2. If multiple target markets, create content that resonates across all of them, noting key differences.');
    parts.push('3. Use ONLY verified dates from the festival calendar. NEVER hallucinate dates.');
    parts.push('4. Respect cultural sensitivities of each target market.');

    // ── Brand Images Summary ──
    const brandImages = dna.brandImages || [];
    if (brandImages.length > 0) {
        parts.push('');
        parts.push(`=== BRAND IMAGES: ${brandImages.length} images available ===`);
        const imageSummary = brandImages
            .filter(img => img.alt)
            .slice(0, 10)
            .map(img => `[${img.source || 'page'}] ${img.alt}`)
            .join(', ');
        if (imageSummary) parts.push(`Image tags: ${imageSummary}`);
    }

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

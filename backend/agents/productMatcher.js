/**
 * AI Product Matcher Agent
 * Smart module that matches products from catalog to occasions/events,
 * generates content ideas, and builds optimized prompts with product context.
 * 
 * Core capabilities:
 * - Match products to occasions (e.g., "Women's Day" → products for women)
 * - Generate content ideas with product+occasion combos
 * - Search product catalog by intent/theme
 * - Build product-aware content generation prompts
 */

import Product from '../models/Product.js';

/**
 * Generate smart content ideas by matching products to an occasion
 * @param {Object} params
 * @param {Object} params.brand - Brand document with DNA
 * @param {string} params.occasion - Occasion/event (e.g., "Women's Day", "Diwali", "Summer Sale")
 * @param {string} params.intent - User's intent description (optional free text)
 * @param {Object} params.aiRouter - AI router for analysis
 * @returns {Array<Object>} Array of content ideas with matched products
 */
export async function generateProductIdeas({ brand, occasion, intent, aiRouter }) {
    // 1. Get all active products for this brand
    const allProducts = await Product.find({
        brand: brand._id,
        status: 'active',
    }).limit(100).lean();

    if (allProducts.length === 0) {
        // No products — generate ideas from brand knowledge only
        return generateBrandOnlyIdeas({ brand, occasion, intent, aiRouter });
    }

    // 2. Build product catalog summary for AI
    const productSummary = allProducts.map(p => ({
        id: p._id,
        title: p.title,
        type: p.productType,
        tags: p.tags?.join(', '),
        price: p.variants?.[0]?.price || 0,
        description: p.description?.substring(0, 150),
        image: p.images?.[0]?.url || '',
    }));

    // 3. Ask AI to match products to the occasion and generate ideas
    const prompt = `You are a smart marketing strategist for the brand "${brand.name}" (${brand.dna?.industry || 'general'}).

OCCASION: ${occasion}
${intent ? `USER INTENT: ${intent}` : ''}

PRODUCT CATALOG:
${JSON.stringify(productSummary, null, 2)}

BRAND VOICE: ${brand.dna?.voice?.personality || 'Professional'}
BRAND KEYWORDS: ${(brand.dna?.voice?.keywords || []).join(', ')}

TASK: Generate 5-8 smart content ideas that combine the products with the occasion.
For each idea:
1. Pick the most RELEVANT product(s) for this occasion
2. Create a compelling content angle that ties product + occasion naturally
3. Suggest the best platform (Instagram, Facebook, LinkedIn, WhatsApp, Email)
4. Rate relevance 1-10

Return ONLY valid JSON array:
[
  {
    "productId": "product _id from catalog",
    "productTitle": "product name",
    "contentIdea": "Brief content idea (1-2 sentences)",
    "angle": "The creative angle (e.g., 'Gift guide', 'Celebrate her with...', 'Limited time offer')",
    "platform": "best platform",
    "contentType": "post/story/reel/carousel/email",
    "relevanceScore": 8,
    "suggestedCaption": "A ready-to-use caption/copy",
    "hashtags": ["relevant", "hashtags"]
  }
]

Be creative. Think like a consumer, not a marketer. What would make someone STOP scrolling?`;

    try {
        const result = await aiRouter.analyzeText({
            text: prompt,
            task: 'Generate product-occasion content ideas as JSON array',
        });

        // Parse result (could be array or object with ideas key)
        let ideas = Array.isArray(result) ? result : result.ideas || result;
        if (!Array.isArray(ideas)) ideas = [ideas];

        // Enrich with product images
        return ideas.map(idea => {
            const product = allProducts.find(p => String(p._id) === idea.productId);
            return {
                ...idea,
                productImage: product?.images?.[0]?.url || '',
                productPrice: product?.variants?.[0]?.price || 0,
            };
        });
    } catch (error) {
        console.error('AI idea generation failed:', error.message);
        return generateFallbackIdeas(allProducts, occasion);
    }
}

/**
 * Search products by AI-interpreted intent
 * e.g., "something for women under 2000" → finds matching products
 */
export async function searchProductsByIntent({ brandId, query, aiRouter }) {
    // First try text search
    let products = await Product.find({
        brand: brandId,
        status: 'active',
        $text: { $search: query },
    }).limit(20).lean();

    // If no results, try keyword-based search
    if (products.length === 0) {
        const keywords = query.toLowerCase().split(/\s+/);
        products = await Product.find({
            brand: brandId,
            status: 'active',
            $or: [
                { tags: { $in: keywords } },
                { productType: { $regex: keywords.join('|'), $options: 'i' } },
                { title: { $regex: keywords.join('|'), $options: 'i' } },
            ],
        }).limit(20).lean();
    }

    // If AI router available, rank by relevance
    if (aiRouter && products.length > 5) {
        try {
            const rankPrompt = `Given the search: "${query}"
Rank these products by relevance (return just the IDs in order):
${products.map(p => `${p._id}: ${p.title} [${p.productType}] ${p.tags?.join(', ')}`).join('\n')}

Return JSON: { "ranked": ["id1", "id2", ...] }`;

            const ranking = await aiRouter.analyzeText({ text: rankPrompt, task: 'Rank products' });
            if (ranking.ranked) {
                const idOrder = ranking.ranked;
                products.sort((a, b) => {
                    const aIdx = idOrder.indexOf(String(a._id));
                    const bIdx = idOrder.indexOf(String(b._id));
                    return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
                });
            }
        } catch { /* use original order */ }
    }

    return products;
}

/**
 * Build a product-aware prompt for content generation
 */
export function buildProductPrompt({ product, occasion, platform, brand, contentType }) {
    const priceInfo = product.variants?.[0]?.price
        ? `Price: ₹${product.variants[0].price}${product.variants[0].compareAtPrice ? ` (was ₹${product.variants[0].compareAtPrice})` : ''}`
        : '';

    return `
PRODUCT DETAILS:
- Name: ${product.title}
- Type: ${product.productType || 'Product'}
- Description: ${product.description?.substring(0, 300) || ''}
- Tags: ${(product.tags || []).join(', ')}
- ${priceInfo}
${product.variants?.length > 1 ? `- Variants: ${product.variants.map(v => v.title).join(', ')}` : ''}

OCCASION: ${occasion || 'General'}
PLATFORM: ${platform || 'Instagram'}
CONTENT TYPE: ${contentType || 'post'}

BRAND: ${brand.name}
BRAND VOICE: ${brand.dna?.voice?.personality || 'Professional'}
BRAND STYLE: ${brand.dna?.contentStyle?.writingStyle || ''}

Create compelling ${contentType || 'social media'} content for this product, perfectly timed for ${occasion || 'today'}.
Make it feel human, not AI-generated. Use the brand voice naturally.
${brand.dna?.contentStyle?.dos?.length ? `WRITING RULES: ${brand.dna.contentStyle.dos.join('. ')}` : ''}
${brand.dna?.contentStyle?.donts?.length ? `AVOID: ${brand.dna.contentStyle.donts.join('. ')}` : ''}
`.trim();
}

/**
 * Generate ideas without products (brand knowledge only)
 */
async function generateBrandOnlyIdeas({ brand, occasion, intent, aiRouter }) {
    if (!aiRouter) return [];

    try {
        const result = await aiRouter.analyzeText({
            text: `Brand: ${brand.name}
Industry: ${brand.dna?.industry || ''}
Occasion: ${occasion}
${intent ? `Intent: ${intent}` : ''}
Brand Voice: ${brand.dna?.voice?.personality || 'Professional'}
Keywords: ${(brand.dna?.voice?.keywords || []).join(', ')}`,
            task: `Generate 5 content ideas for this brand for the occasion. Return JSON array:
[{ "contentIdea": "...", "angle": "...", "platform": "...", "contentType": "...", "suggestedCaption": "...", "hashtags": [...], "relevanceScore": 8 }]`,
        });

        return Array.isArray(result) ? result : result.ideas || [result];
    } catch {
        return [];
    }
}

/**
 * Fallback ideas when AI fails
 */
function generateFallbackIdeas(products, occasion) {
    return products.slice(0, 5).map(p => ({
        productId: p._id,
        productTitle: p.title,
        productImage: p.images?.[0]?.url || '',
        contentIdea: `Feature ${p.title} for ${occasion}`,
        angle: `${occasion} special`,
        platform: 'Instagram',
        contentType: 'post',
        relevanceScore: 5,
        suggestedCaption: `Celebrate ${occasion} with ${p.title}! ✨`,
        hashtags: [occasion.replace(/\s+/g, ''), p.productType, 'special'].filter(Boolean),
    }));
}

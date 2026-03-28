/**
 * Creative Studio — Agentic Pipeline Node Functions (v2)
 * 
 * 5-agent chain: BrandIntel → ArtDirector → PromptEngineer → [StyleCritic] → generate
 * VariationGenerator available for A/B mode.
 * Each node: (state) → updatedState
 */

import { callAgent, loadBrandContext } from '../shared/agentUtils.js';
import Brand from '../../models/Brand.js';
import Product from '../../models/Product.js';
import {
    ART_DIRECTOR_PROMPT,
    PROMPT_ENGINEER_PROMPT,
    STYLE_CRITIC_PROMPT,
    VARIATION_PROMPT,
} from './prompts.js';


// ══════════════════════════════════════════════════════════════════════════════
// NODE 0: BRAND INTELLIGENCE — Gather brand context (DB-only, no AI call)
// ══════════════════════════════════════════════════════════════════════════════
export async function brandIntelligenceNode(state) {
    console.log('🧠 Creative Agent: Brand Intelligence — gathering context...');
    const startMs = Date.now();

    const brand = await Brand.findById(state.brandId).lean();
    if (!brand) {
        return { ...state, brandIntel: { error: 'Brand not found' }, status: 'brand-intel' };
    }

    const dna = brand.dna || {};

    // ── Fetch REAL products from catalog (anti-hallucination) ──
    const products = await Product.find(
        { brand: state.brandId, status: 'active' },
        { title: 1, shortDescription: 1, description: 1, features: 1, category: 1, subCategory: 1, images: 1, tags: 1, type: 1, productType: 1 }
    ).lean().limit(20);

    const hasProducts = products.length > 0;
    const brandType = hasProducts ? 'product' : 'service';

    // ── Auto-detect which product the user is referring to ──
    let matchedProduct = null;
    if (hasProducts && state.brief) {
        const briefLower = state.brief.toLowerCase();
        // Score each product by keyword overlap with the user's brief
        let bestScore = 0;
        for (const p of products) {
            let score = 0;
            const titleWords = (p.title || '').toLowerCase().split(/\s+/);
            for (const w of titleWords) {
                if (w.length > 2 && briefLower.includes(w)) score += 3;
            }
            // Check tags, category, productType
            for (const tag of (p.tags || [])) {
                if (briefLower.includes(tag.toLowerCase())) score += 2;
            }
            if (p.category && briefLower.includes(p.category.toLowerCase())) score += 2;
            if (p.productType && briefLower.includes(p.productType.toLowerCase())) score += 2;
            // Bonus: if product name appears as a whole phrase
            if (briefLower.includes(p.title.toLowerCase())) score += 10;
            
            if (score > bestScore) {
                bestScore = score;
                matchedProduct = p;
            }
        }
        // Only match if there's reasonable confidence
        if (bestScore < 2) matchedProduct = null;
        if (matchedProduct) {
            console.log(`🎯 Product matched: "${matchedProduct.title}" (score: ${bestScore}, images: ${(matchedProduct.images || []).length})`);
        }
    }

    // If no specific match but brand has products, pick a random product with images as fallback
    if (!matchedProduct && hasProducts) {
        const productsWithImages = products.filter(p => (p.images || []).length > 0);
        if (productsWithImages.length > 0) {
            // Pick a random product for variety (not always the first one)
            matchedProduct = productsWithImages[Math.floor(Math.random() * productsWithImages.length)];
            console.log(`📦 No specific product match — auto-selecting product: "${matchedProduct.title}" (${productsWithImages.length} candidates)`);
        }
    }

    // ── Build top product candidates for downstream injection ──
    // When user brief is generic (no specific product), provide multiple options
    const productCandidates = hasProducts
        ? products
            .filter(p => (p.images || []).length > 0)
            .slice(0, 5)
            .map(p => ({
                title: p.title,
                description: (p.shortDescription || p.description || '').substring(0, 150),
                category: p.category || p.productType || '',
                images: (p.images || []).slice(0, 2).map(img => img.url).filter(Boolean),
            }))
        : [];

    // Extract rich brand visual context
    const intel = {
        name: brand.name,
        industry: dna.industry || '',
        personality: dna.voice?.personality || '',
        targetAudience: dna.targetAudience || '',
        tagline: dna.tagline || '',
        overview: (dna.companyOverview || dna.brandDescription || '').substring(0, 300),
        
        // Visual DNA
        designStyle: dna.visualDNA?.designStyle || '',
        layoutPreference: dna.visualDNA?.layoutPreference || '',
        imageMood: dna.visualDNA?.imageMood || '',
        textureStyle: dna.visualDNA?.textureStyle || '',
        photographyStyle: dna.photographyStyle || '',
        designRules: dna.visualDNA?.designRules || [],
        designAvoid: dna.visualDNA?.designAvoid || [],

        // Colors — described by name only, NEVER hex codes
        colors: (dna.colors || []).slice(0, 5).map(c => {
            const name = c.name || '';
            if (name && !/^#|rgb|color/i.test(name)) return name.toLowerCase();
            return 'brand accent';
        }).filter((v, i, a) => a.indexOf(v) === i),

        // Content style
        contentDos: dna.contentStyle?.dos?.slice(0, 3) || [],
        contentDonts: dna.contentStyle?.donts?.slice(0, 3) || [],
        
        // Brand values
        values: (dna.brandValues || []).slice(0, 4),
        usps: (dna.uniqueSellingPoints || []).slice(0, 3),
        services: (dna.servicesOffered || []).slice(0, 5),
        
        // Logo info (for awareness, NOT for inclusion in prompts)
        hasLogo: !!(dna.logo?.url),

        // ── ANTI-HALLUCINATION: Real product data ──
        brandType,
        productCatalogSize: products.length,
        brandImages: (dna.brandImages || []).slice(0, 5).map(img => img.url).filter(Boolean),
        // Product candidates for downstream image injection
        productCandidates,
    };

    console.log(`🧠 Brand intel loaded in ${Date.now() - startMs}ms: ${intel.name} (${intel.industry}) — type: ${brandType}, products: ${products.length}, candidates: ${productCandidates.length}, brandImages: ${intel.brandImages.length}`);

    return {
        ...state,
        brandIntel: intel,
        matchedProduct: matchedProduct ? {
            title: matchedProduct.title,
            description: (matchedProduct.shortDescription || matchedProduct.description || '').substring(0, 200),
            features: (matchedProduct.features || []).slice(0, 5),
            category: matchedProduct.category || matchedProduct.productType || '',
            images: (matchedProduct.images || []).slice(0, 3).map(img => img.url).filter(Boolean),
        } : null,
        status: 'brand-intel',
    };
}


// ══════════════════════════════════════════════════════════════════════════════
// NODE 1: ART DIRECTOR — Define creative vision using brand intel
// ══════════════════════════════════════════════════════════════════════════════
export async function artDirectorNode(state) {
    console.log('🎨 Creative Agent: Art Director — defining vision...');
    const startMs = Date.now();

    // Use pre-loaded brandContext from pipeline runner (avoids redundant DB query)
    const brandContext = state.brandContext || (await loadBrandContext(state.brandId)).brandContext;
    const intel = state.brandIntel || {};

    // ── Build product context for anti-hallucination ──
    const mp = state.matchedProduct;
    const productContext = mp ? [
        `\n⚠️ REAL PRODUCT DATA (DO NOT HALLUCINATE — use ONLY this info):`,
        `PRODUCT NAME: ${mp.title}`,
        mp.description ? `PRODUCT DESCRIPTION: ${mp.description}` : '',
        mp.features?.length > 0 ? `KEY FEATURES: ${mp.features.join(', ')}` : '',
        mp.category ? `CATEGORY: ${mp.category}` : '',
        mp.images?.length > 0 ? `📸 REAL PRODUCT IMAGES ARE PROVIDED AS REFERENCE — the generated image MUST feature this exact product, not an imagined version.` : '',
        `CRITICAL: Describe this specific product based on the data above. Do NOT invent features, shapes, or designs not mentioned here.`,
    ].filter(Boolean).join('\n') : '';

    const userPrompt = [
        `CREATIVE BRIEF: ${state.brief}`,
        `FORMAT: ${state.format || 'instagram-post'}`,
        `ASPECT RATIO: ${state.aspectRatio || '1:1'}`,
        state.style ? `PREFERRED STYLE: ${state.style}` : '',
        // Inject brand intelligence for smarter direction
        intel.designStyle ? `BRAND DESIGN STYLE: ${intel.designStyle}` : '',
        intel.imageMood ? `BRAND IMAGE MOOD: ${intel.imageMood}` : '',
        intel.photographyStyle ? `PHOTOGRAPHY DIRECTION: ${intel.photographyStyle}` : '',
        intel.colors?.length > 0 ? `BRAND COLOR PALETTE: ${intel.colors.join(', ')} — use these as the foundation` : '',
        intel.designRules?.length > 0 ? `DESIGN RULES (must follow): ${intel.designRules.slice(0, 3).join('; ')}` : '',
        intel.designAvoid?.length > 0 ? `AVOID: ${intel.designAvoid.slice(0, 3).join('; ')}` : '',
        state.references ? `REFERENCE NOTES: ${state.references}` : '',
        state.productName ? `PRODUCT: ${state.productName}` : '',
        productContext,
        intel.brandType === 'product' && !mp ? `NOTE: This brand sells physical products. If the brief involves a product, base your direction on the brand's actual product catalog — do NOT invent product shapes or designs.` : '',
        // When no specific product matched, tell the agent about available products
        !mp && intel.productCandidates?.length > 0 ? `AVAILABLE PRODUCTS IN CATALOG (pick the most relevant for this brief):\n${intel.productCandidates.map(c => `• ${c.title}${c.category ? ` [${c.category}]` : ''}: ${c.description || 'No description'}`).join('\n')}` : '',
    ].filter(Boolean).join('\n');

    const result = await callAgent(ART_DIRECTOR_PROMPT(brandContext), userPrompt, 0.7);
    console.log(`🎨 Art direction defined in ${Date.now() - startMs}ms`);

    return {
        ...state,
        artDirection: result,
        status: 'art-direction',
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// NODE 2: PROMPT ENGINEER — Craft optimal image prompt
// ══════════════════════════════════════════════════════════════════════════════
export async function promptEngineerNode(state) {
    console.log('🔧 Creative Agent: Prompt Engineer — crafting prompt...');
    const startMs = Date.now();

    // Use pre-loaded brandContext from pipeline runner (avoids redundant DB query)
    const brandContext = state.brandContext || (await loadBrandContext(state.brandId)).brandContext;
    const intel = state.brandIntel || {};

    // ── Build product grounding for prompt engineer ──
    const mp2 = state.matchedProduct;
    const productGrounding = mp2 ? [
        `\n⚠️ ANTI-HALLUCINATION — REAL PRODUCT:`,
        `Product: "${mp2.title}"`,
        mp2.description ? `What it is: ${mp2.description}` : '',
        mp2.features?.length > 0 ? `Real features: ${mp2.features.join(', ')}` : '',
        mp2.images?.length > 0 ? `Real product images are provided as reference to the image model. Your prompt MUST describe this exact product.` : '',
        `RULE: Describe the product appearance ONLY based on the data above. Never invent product details, shapes, or features.`,
    ].filter(Boolean).join('\n') : '';

    const userPrompt = [
        `CONVERT THIS ART DIRECTION INTO AN IMAGE GENERATION PROMPT:`,
        `Creative Direction: ${state.artDirection?.creativeDirection || ''}`,
        `Visual Style: ${state.artDirection?.visualStyle || ''}`,
        `Mood: ${state.artDirection?.mood || ''}`,
        `Lighting: ${state.artDirection?.lightingDirection || 'natural'}`,
        `Color Strategy: ${state.artDirection?.colorStrategy || ''}`,
        `Composition: ${state.artDirection?.composition || ''}`,
        `Key Elements: ${(state.artDirection?.keyElements || []).join(', ')}`,
        `Scroll Stop Factor: ${state.artDirection?.scrollStopFactor || ''}`,
        `Avoid: ${(state.artDirection?.avoidList || []).join(', ')}`,
        `Format: ${state.format || 'instagram-post'}`,
        `Aspect Ratio: ${state.aspectRatio || '1:1'}`,
        `Image Model: ${state.imageModel || 'gemini'} — optimize prompt for this model`,
        `Original Brief: ${state.brief}`,
        // Brand colors for visual context (no hex codes)
        intel.colors?.length > 0 ? `BRAND COLORS (describe visually): ${intel.colors.join(', ')}` : '',
        productGrounding,
    ].filter(Boolean).join('\n');

    const result = await callAgent(PROMPT_ENGINEER_PROMPT(brandContext), userPrompt, 0.5);
    console.log(`🔧 Prompt engineered in ${Date.now() - startMs}ms`);

    return {
        ...state,
        engineeredPrompt: result,
        status: 'prompt-engineering',
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// NODE 3: STYLE CRITIC — Pre-generation quality check
// ══════════════════════════════════════════════════════════════════════════════
export async function styleCriticNode(state) {
    console.log('🔍 Creative Agent: Style Critic — analyzing prompt...');
    const startMs = Date.now();

    // Use pre-loaded brandContext from pipeline runner (avoids redundant DB query)
    const brandContext = state.brandContext || (await loadBrandContext(state.brandId)).brandContext;

    const userPrompt = [
        `ANALYZE THIS IMAGE GENERATION PROMPT:`,
        `Primary Prompt: ${state.engineeredPrompt?.primaryPrompt || ''}`,
        `Negative Prompt: ${state.engineeredPrompt?.negativePrompt || ''}`,
        `Style Modifiers: ${state.engineeredPrompt?.styleModifiers || ''}`,
        `Target Format: ${state.format || 'instagram-post'}`,
        `Aspect Ratio: ${state.aspectRatio || '1:1'}`,
        `Original Brief: ${state.brief}`,
    ].join('\n');

    const result = await callAgent(STYLE_CRITIC_PROMPT(brandContext), userPrompt, 0.3);
    console.log(`🔍 Critique complete in ${Date.now() - startMs}ms — verdict: ${result.verdict}`);

    // If critic says improve-first, use the improved prompt (immutable — create new object)
    let finalEngineeredPrompt = state.engineeredPrompt;
    if (result.verdict === 'improve-first' && result.improvedPrompt) {
        console.log('🔄 Critic requested improvement — using improved prompt');
        finalEngineeredPrompt = { ...state.engineeredPrompt, primaryPrompt: result.improvedPrompt };
    }

    return {
        ...state,
        engineeredPrompt: finalEngineeredPrompt,
        styleCritique: result,
        finalPrompt: finalEngineeredPrompt?.primaryPrompt || '',
        status: 'critique',
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// NODE 4: VARIATION GENERATOR — Create 3 style variations for A/B testing
// ══════════════════════════════════════════════════════════════════════════════
export async function variationGeneratorNode(state) {
    console.log('🔀 Creative Agent: Variation Generator — creating alternatives...');
    const startMs = Date.now();

    // Use pre-loaded brandContext from pipeline runner (avoids redundant DB query)
    const brandContext = state.brandContext || (await loadBrandContext(state.brandId)).brandContext;

    const userPrompt = [
        `CREATE 3 VARIATIONS OF THIS PROMPT:`,
        `Original Prompt: ${state.finalPrompt || state.engineeredPrompt?.primaryPrompt || ''}`,
        `Art Direction: ${state.artDirection?.creativeDirection || ''}`,
        `Mood: ${state.artDirection?.mood || ''}`,
        `Format: ${state.format || 'instagram-post'}`,
        `Aspect Ratio: ${state.aspectRatio || '1:1'}`,
        `Original Brief: ${state.brief}`,
    ].join('\n');

    const result = await callAgent(VARIATION_PROMPT(brandContext), userPrompt, 0.8);
    console.log(`🔀 ${(result.variations || []).length} variations generated in ${Date.now() - startMs}ms`);

    return {
        ...state,
        variations: result.variations || [],
        status: 'variations',
    };
}


// ══════════════════════════════════════════════════════════════════════════════
// RUNNER: Execute the full agentic pipeline
// ══════════════════════════════════════════════════════════════════════════════
/**
 * Run the creative agentic pipeline.
 * 
 * @param {object} params
 * @param {string} params.brandId - Brand ID
 * @param {string} params.brief - User's creative brief / prompt
 * @param {string} params.format - Platform format (instagram-post, etc)
 * @param {string} params.aspectRatio - Target aspect ratio
 * @param {string} params.style - User-selected style
 * @param {string} params.imageModel - Selected image model
 * @param {string} params.mode - 'fast' (skip critic) | 'quality' (full chain)
 * @returns {object} { finalPrompt, artDirection, engineeredPrompt, styleCritique, brandIntel }
 */
export async function runCreativePipeline(params) {
    const { brandId, brief, format, aspectRatio, style, imageModel, mode = 'fast' } = params;
    const pipelineStart = Date.now();
    console.log(`\n══════════ AGENTIC CREATIVE PIPELINE (${mode.toUpperCase()}) ══════════`);

    // ── Pre-load brandContext ONCE to avoid redundant DB queries in each node ──
    const { brandContext } = await loadBrandContext(brandId);

    let state = {
        brandId,
        brandContext, // Shared across all nodes — eliminates 4× redundant Brand+Product DB round-trips
        brief,
        format: format || 'instagram-post',
        aspectRatio: aspectRatio || '1:1',
        style: style || '',
        imageModel: imageModel || 'nanobanana-2',
    };

    // Node 0: Brand Intelligence (DB-only, ~50ms)
    state = await brandIntelligenceNode(state);

    // Node 1: Art Director (Gemini Flash, ~1-1.5s)
    state = await artDirectorNode(state);

    // Node 2: Prompt Engineer (Gemini Flash, ~0.5-1s)
    state = await promptEngineerNode(state);

    // Node 3: Style Critic (optional in fast mode)
    if (mode === 'quality') {
        state = await styleCriticNode(state);
    } else {
        // In fast mode, use the engineered prompt directly
        state.finalPrompt = state.engineeredPrompt?.primaryPrompt || brief;
    }

    const totalMs = Date.now() - pipelineStart;
    console.log(`══════════ PIPELINE COMPLETE (${totalMs}ms) ══════════\n`);

    return {
        finalPrompt: state.finalPrompt || state.engineeredPrompt?.primaryPrompt || brief,
        artDirection: state.artDirection,
        engineeredPrompt: state.engineeredPrompt,
        styleCritique: state.styleCritique || null,
        brandIntel: state.brandIntel,
        matchedProduct: state.matchedProduct || null,
        pipelineTimeMs: totalMs,
        mode,
    };
}

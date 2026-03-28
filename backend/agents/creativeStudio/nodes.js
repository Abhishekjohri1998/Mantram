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

    // ── Semantic keyword expansion for better matching ──
    // Maps thematic/abstract words to product-relevant keywords
    const SEMANTIC_MAP = {
        // Music/Audio
        beat: ['earbuds', 'headphones', 'speaker', 'audio', 'music', 'sound', 'bass', 'wireless'],
        beats: ['earbuds', 'headphones', 'speaker', 'audio', 'music', 'sound', 'bass', 'wireless'],
        music: ['earbuds', 'headphones', 'speaker', 'audio', 'sound', 'neckband'],
        sound: ['earbuds', 'headphones', 'speaker', 'audio', 'neckband'],
        listen: ['earbuds', 'headphones', 'neckband', 'audio'],
        // Fashion/Lifestyle
        summer: ['light', 'casual', 'outdoor', 'travel', 'portable', 'wireless', 'sport'],
        winter: ['warm', 'cozy', 'premium', 'over-ear', 'studio'],
        travel: ['portable', 'wireless', 'compact', 'powerbank', 'charger'],
        fitness: ['sport', 'wireless', 'sweat', 'gym', 'active', 'neckband'],
        workout: ['sport', 'wireless', 'neckband', 'earbuds', 'active'],
        // Tech
        gaming: ['headphones', 'gaming', 'rgb', 'bass', 'over-ear', 'studio'],
        work: ['headphones', 'neckband', 'noise', 'office', 'professional'],
        gift: ['premium', 'watch', 'earbuds', 'headphones', 'powerbank'],
        style: ['watch', 'earbuds', 'premium', 'fashion'],
    };

    // ── Auto-detect which product the user is referring to ──
    let matchedProduct = null;
    if (hasProducts && state.brief) {
        const briefLower = state.brief.toLowerCase();
        const briefWords = briefLower.split(/\s+/).filter(w => w.length > 2);

        // Expand brief with semantic keywords
        const expandedKeywords = new Set(briefWords);
        for (const word of briefWords) {
            const expansions = SEMANTIC_MAP[word];
            if (expansions) {
                expansions.forEach(kw => expandedKeywords.add(kw));
            }
        }
        const expandedBrief = [...expandedKeywords].join(' ');

        // Score each product by keyword overlap with the user's brief + semantic expansion
        let bestScore = 0;
        for (const p of products) {
            let score = 0;
            const titleWords = (p.title || '').toLowerCase().split(/\s+/);
            const descWords = (p.description || p.shortDescription || '').toLowerCase().split(/\s+/);
            const allProductWords = [...titleWords, ...descWords, ...(p.tags || []).map(t => t.toLowerCase())];

            // Direct match in original brief
            for (const w of titleWords) {
                if (w.length > 2 && briefLower.includes(w)) score += 3;
            }

            // Semantic match from expanded keywords
            for (const w of allProductWords) {
                if (w.length > 2 && expandedBrief.includes(w)) score += 1;
            }

            // Check tags, category, productType
            for (const tag of (p.tags || [])) {
                if (briefLower.includes(tag.toLowerCase())) score += 2;
                if (expandedBrief.includes(tag.toLowerCase())) score += 1;
            }
            if (p.category && (briefLower.includes(p.category.toLowerCase()) || expandedBrief.includes(p.category.toLowerCase()))) score += 2;
            if (p.productType && (briefLower.includes(p.productType.toLowerCase()) || expandedBrief.includes(p.productType.toLowerCase()))) score += 2;
            // Bonus: if product name appears as a whole phrase
            if (briefLower.includes(p.title.toLowerCase())) score += 10;
            
            if (score > bestScore) {
                bestScore = score;
                matchedProduct = p;
            }
        }
        // Only match if there's reasonable confidence (lowered from 2 to 1 for semantic matches)
        if (bestScore < 1) matchedProduct = null;
        if (matchedProduct) {
            console.log(`🎯 Product matched: "${matchedProduct.title}" (score: ${bestScore}, images: ${(matchedProduct.images || []).length}, semantic: ${bestScore > 0 && !briefLower.includes(matchedProduct.title.toLowerCase().split(/\s+/)[0])})`);
        }
    }

    // If no specific match but brand has products, pick a random product for variety
    // (Even if product has no images — we'll use brand DNA images as fallback)
    if (!matchedProduct && hasProducts) {
        // Prefer products with images, but fall back to any product
        const productsWithImages = products.filter(p => (p.images || []).length > 0);
        if (productsWithImages.length > 0) {
            matchedProduct = productsWithImages[Math.floor(Math.random() * productsWithImages.length)];
            console.log(`📦 No specific product match — auto-selecting product with images: "${matchedProduct.title}"`);
        } else {
            // No products have images — still select one for prompt grounding, and use brand DNA images
            matchedProduct = products[Math.floor(Math.random() * products.length)];
            console.log(`📦 No products have images — auto-selecting "${matchedProduct.title}" for prompt grounding (will use brand DNA images)`);
        }
    }

    // ── Brand DNA Image Discovery — find product-relevant images from brand DNA ──
    // When products lack images, brand DNA images (from website scan) often contain the actual products
    const dnaImages = (dna.brandImages || []).filter(img => img.url && !img.url.includes('logo') && !img.url.includes('Logo'));
    let matchedDnaImages = [];
    
    if (matchedProduct && (matchedProduct.images || []).length === 0 && dnaImages.length > 0) {
        // Search brand DNA images by alt text relevance to the matched product
        const productKeywords = (matchedProduct.title || '').toLowerCase().split(/\s+/).filter(w => w.length > 2);
        const scored = dnaImages.map(img => {
            const alt = (img.alt || '').toLowerCase();
            let score = 0;
            for (const kw of productKeywords) {
                if (alt.includes(kw)) score += 3;
            }
            // Also check source — 'product' source images are more likely product images
            if (img.source === 'product') score += 2;
            return { ...img, matchScore: score };
        }).filter(s => s.matchScore > 0).sort((a, b) => b.matchScore - a.matchScore);

        if (scored.length > 0) {
            matchedDnaImages = scored.slice(0, 3).map(s => s.url);
            console.log(`🔍 Found ${scored.length} relevant brand DNA images for "${matchedProduct.title}": ${matchedDnaImages.map(u => u.substring(u.lastIndexOf('/') + 1)).join(', ')}`);
        }
    }

    // If still no matched DNA images, use top non-logo brand DNA images as generic reference
    if (matchedDnaImages.length === 0 && dnaImages.length > 0) {
        // Prefer hero and product source images
        const prioritized = [...dnaImages].sort((a, b) => {
            const priority = { product: 3, hero: 2, page: 1 };
            return (priority[b.source] || 0) - (priority[a.source] || 0);
        });
        matchedDnaImages = prioritized.slice(0, 3).map(img => img.url);
        console.log(`🎨 Using top ${matchedDnaImages.length} brand DNA images as visual reference`);
    }

    // ── Build top product candidates for downstream injection ──
    // Include ALL products (not just those with images) for prompt grounding
    const productCandidates = hasProducts
        ? products
            .slice(0, 8)
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
        // Product-relevant brand DNA images (discovered from alt text matching)
        matchedDnaImages,
        // Product candidates for downstream image injection
        productCandidates,
    };

    console.log(`🧠 Brand intel loaded in ${Date.now() - startMs}ms: ${intel.name} (${intel.industry}) — type: ${brandType}, products: ${products.length}, candidates: ${productCandidates.length}, brandImages: ${intel.brandImages.length}`);

    // Build matched product return — merge DNA images when product has no direct images
    const matchedProductImages = (matchedProduct?.images || []).slice(0, 3).map(img => img.url).filter(Boolean);
    const finalProductImages = matchedProductImages.length > 0 ? matchedProductImages : matchedDnaImages.slice(0, 3);

    return {
        ...state,
        brandIntel: intel,
        matchedProduct: matchedProduct ? {
            title: matchedProduct.title,
            description: (matchedProduct.shortDescription || matchedProduct.description || '').substring(0, 200),
            features: (matchedProduct.features || []).slice(0, 5),
            category: matchedProduct.category || matchedProduct.productType || '',
            images: finalProductImages,
            usingDnaImages: matchedProductImages.length === 0 && finalProductImages.length > 0,
        } : null,
        status: 'brand-intel',
    };
}


// ══════════════════════════════════════════════════════════════════════════════
// FORMAT-SPECIFIC CREATIVE INTELLIGENCE
// Guides the AI to produce platform-optimized visuals (not just correct aspect ratio)
// ══════════════════════════════════════════════════════════════════════════════
const FORMAT_INTELLIGENCE = {
    'youtube-thumb': {
        label: 'YouTube Thumbnail',
        spec: '1280×720 landscape (16:9)',
        rules: [
            'MUST include large, bold, readable text/headline as the HERO element — this is the most important visual on a YouTube thumbnail',
            'Use extremely high contrast — bright colors on dark backgrounds or vice versa',
            'Include an expressive human face with dramatic emotion if relevant (surprise, excitement, curiosity)',
            'Use the "rule of thirds" — place the subject on one side, text on the other',
            'Add visual drama: spotlights, arrows, circles, or glow effects to draw the eye',
            'Keep text to 3-5 words maximum — big, punchy, readable at tiny mobile sizes',
            'Avoid cluttered compositions — YouTube thumbnails are viewed at ~160×90px on mobile',
            'Use bright yellow, red, or white text for maximum visibility',
        ].join('\n'),
    },
    'instagram-post': {
        label: 'Instagram Post',
        spec: '1080×1350 portrait (4:5)',
        rules: [
            'Optimize for the Instagram feed: visually striking in the first half-second of scrolling',
            'Keep key elements in the center — edges get cropped in different views',
            'If including text, keep it minimal and use high-contrast legible fonts',
            'Lifestyle-first aesthetic: make it feel native to Instagram, not an ad',
            'Bold colors that pop on both light and dark mode feeds',
        ].join('\n'),
    },
    'instagram-story': {
        label: 'Instagram Story / Reel',
        spec: '1080×1920 vertical (9:16)',
        rules: [
            'Full vertical composition — use the entire tall canvas',
            'Keep key content in the center 60% — top and bottom get obscured by UI elements',
            'Design for thumb-stopping impact: bold, dynamic, motion-feeling',
            'Avoid placing important text in the top 15% (username area) or bottom 15% (CTA area)',
            'Story-native aesthetic: less polished, more raw and engaging',
        ].join('\n'),
    },
    'facebook-ad': {
        label: 'Facebook Ad',
        spec: '1080×1350 portrait (4:5)',
        rules: [
            'Text overlay should be minimal — Facebook penalizes ads with >20% text',
            'Focus on a single clear value proposition or product benefit',
            'CTA-ready composition: leave space for the Facebook CTA button at bottom',
            'Eye-catching but not clickbaity — match Facebook advertising guidelines',
        ].join('\n'),
    },
    'linkedin-post': {
        label: 'LinkedIn Post',
        spec: '1200×1200 square (1:1)',
        rules: [
            'Professional, corporate-friendly aesthetic — no flashy or playful treatments',
            'Clean typography, subtle gradients, and minimalist layouts',
            'Content should feel thought-leadership-worthy, not sales-pitch-like',
            'If including data or stats, make them the visual hero with clean infographic styling',
            'Muted or navy/dark color palettes work best on LinkedIn',
        ].join('\n'),
    },
    'banner': {
        label: 'Website Banner / Hero',
        spec: '1920×600 wide banner (16:9)',
        rules: [
            'Ultra-wide composition: spread content horizontally, avoid centering everything',
            'Leave text-safe zones on left and/or right for overlay text by the website',
            'Background should be visually rich but not compete with foreground text',
            'Consider a gradient or vignette to ensure text readability on all areas',
            'High-res, editorial-quality photography aesthetic',
        ].join('\n'),
    },
};

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

    // Get format-specific intelligence
    const formatKey = state.format || 'instagram-post';
    const formatIntel = FORMAT_INTELLIGENCE[formatKey];

    const userPrompt = [
        `CREATIVE BRIEF: ${state.brief}`,
        `FORMAT: ${formatIntel?.label || formatKey} (${formatIntel?.spec || state.aspectRatio || '1:1'})`,
        `ASPECT RATIO: ${state.aspectRatio || '1:1'}`,
        // Platform-specific creative rules
        formatIntel ? `\n🎯 PLATFORM-SPECIFIC RULES FOR ${formatIntel.label.toUpperCase()}:\n${formatIntel.rules}` : '',
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

    // Get format-specific intelligence for prompt engineer too
    const formatKey2 = state.format || 'instagram-post';
    const formatIntel2 = FORMAT_INTELLIGENCE[formatKey2];

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
        state.artDirection?.suggestedHeadline ? `SUGGESTED HEADLINE TEXT: "${state.artDirection.suggestedHeadline}" — INCORPORATE this as bold, readable text in the image prompt. Describe it like: 'Bold text reading "${state.artDirection.suggestedHeadline}" prominently displayed in high-contrast lettering'` : '',
        `Avoid: ${(state.artDirection?.avoidList || []).join(', ')}`,
        `Format: ${formatIntel2?.label || formatKey2} (${formatIntel2?.spec || state.aspectRatio || '1:1'})`,
        `Aspect Ratio: ${state.aspectRatio || '1:1'}`,
        // Platform-specific rules for the prompt engineer
        formatIntel2 ? `\n🎯 PLATFORM-SPECIFIC REQUIREMENTS (your prompt MUST address these):\n${formatIntel2.rules}` : '',
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
 * @param {function} params.onProgress - Optional callback: (step) => void, for live progress tracking
 * @returns {object} { finalPrompt, artDirection, engineeredPrompt, styleCritique, brandIntel }
 */
export async function runCreativePipeline(params) {
    const { brandId, brief, format, aspectRatio, style, imageModel, mode = 'fast', onProgress } = params;
    const pipelineStart = Date.now();
    console.log(`\n══════════ AGENTIC CREATIVE PIPELINE (${mode.toUpperCase()}) ══════════`);

    const emit = (agent, message, status = 'working', detail = '') => {
        if (onProgress) onProgress({ agent, message, status, detail });
    };

    // ── Pre-load brandContext ONCE to avoid redundant DB queries in each node ──
    emit('brand-intel', 'Gathering brand intelligence...', 'working');
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
    const productName = state.matchedProduct?.title || '';
    emit('brand-intel', productName ? `Matched product: ${productName}` : 'Brand context loaded', 'done', productName ? `Using "${productName}" as hero product` : '');

    // Node 1: Art Director (Gemini Flash, ~10-15s)
    emit('art-director', 'Art Director crafting creative vision...', 'working');
    state = await artDirectorNode(state);
    emit('art-director', `Creative direction: ${state.artDirection?.mood || 'defined'}`, 'done', state.artDirection?.visualStyle || '');

    // Node 2: Prompt Engineer (Gemini Flash, ~10-18s)
    emit('prompt-engineer', 'Prompt Engineer optimizing for image model...', 'working');
    state = await promptEngineerNode(state);
    emit('prompt-engineer', 'Prompt optimized for maximum quality', 'done');

    // Node 3: Style Critic (optional in fast mode)
    if (mode === 'quality') {
        emit('style-critic', 'Style Critic reviewing brand alignment...', 'working');
        state = await styleCriticNode(state);
        emit('style-critic', 'Brand alignment verified', 'done');
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

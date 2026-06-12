/**
 * Creative Studio — Agentic Pipeline Node Functions (v2)
 * 
 * 6-agent chain: BrandIntel → ArtDirector → PromptEngineer → [StyleCritic] → generate
 * Optional: CopywriterAgent runs in PARALLEL with image generation.
 * VariationGenerator available for A/B mode.
 * Each node: (state) → updatedState
 */

import { agentUtils } from '../shared/agentUtils.js';
import Brand from '../../models/Brand.js';
import Product from '../../models/Product.js';
import { inferBrandLanguage, buildLanguageDirective } from '../../utils/brandLanguage.js';
import { callMcpToolsParallel } from '../../mcp/registry.js';
import { getCachedImageBuffer, setCachedImageBuffer } from '../../utils/imageCache.js';
import { getSignedUrlForPath } from '../../utils/s3.js';
import {
    ART_DIRECTOR_PROMPT,
    FAST_CREATIVE_DIRECTOR_PROMPT,
    UNIFIED_CREATIVE_ENGINE_PROMPT,
    PROMPT_ENGINEER_PROMPT,
    STYLE_CRITIC_PROMPT,
    VARIATION_PROMPT,
    COPYWRITER_PROMPT,
    VISUAL_GROUNDING_PROMPT,
    POST_GENERATION_CRITIC_PROMPT,
} from './prompts.js';
import { getEnvironmentDiversityDirective } from './generationFingerprint.js';


// ── MCP MARKET INTEL NODE — Runs BEFORE Art Director ──
// Uses MCP to fetch live visual trends + web intel for the brand.
// Non-blocking: if MCP is unavailable, pipeline continues without market intel.
// NOTE: brandIntelligenceNode has already run — read industry directly from state
// to avoid a redundant loadBrandContext() DB/Redis hit.
export async function mcpMarketIntelNode(state) {
    // Read industry directly from the brand intel state populated by brandIntelligenceNode
    const industry = state.brandIntel?.industry || '';

    console.log('🔎 Creative MCP: Fetching live market intelligence...');
    const startMs = Date.now();

    try {
        // Hard 6s timeout on the full MCP block — since this now runs in parallel, we cap it
        // so a slow Grok response never delays the art director or visual grounding results.
        const MCP_TIMEOUT_MS = 6000;
        const mcpTimeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('MCP market intel timeout (6s)')), MCP_TIMEOUT_MS)
        );

        const results = await Promise.race([
            callMcpToolsParallel([
                { tool: 'fetch_trending',  args: { brandId: state.brandId } },
                { tool: 'web_search',      args: { query: `visual design trends ${industry} ${new Date().getFullYear()} advertising creative`, mode: 'quick' } },
            ]),
            mcpTimeoutPromise,
        ]);

        const trending  = results['fetch_trending'];
        const webSearch = results['web_search'];

        const trendingTopics = (trending?.data?.trending || []).slice(0, 4).map(t => `• ${t.topic}`).join('\n');
        const viralFormats   = (trending?.data?.viralFormats || []).slice(0, 3).join(', ');
        const calendarHooks  = (trending?.data?.calendarHooks || []).slice(0, 3).join(', ');
        const webIntel       = webSearch?.data ? String(webSearch.data).substring(0, 800) : '';

        state.marketIntel = { trendingTopics, viralFormats, calendarHooks, webIntel, source: 'mcp' };
        console.log(`✅ Creative MCP: Market intel fetched in ${Date.now() - startMs}ms`);
    } catch (err) {
        console.warn('⚠️ Creative MCP: Market intel skipped (non-blocking):', err.message);
        state.marketIntel = null;
    }

    return state;
}


// ══════════════════════════════════════════════════════════════════════════════
// NODE 0: BRAND INTELLIGENCE — Gather brand context (DB-only, no AI call)
// ══════════════════════════════════════════════════════════════════════════════
export async function brandIntelligenceNode(state) {
    console.log('🧠 Creative Agent: Brand Intelligence — gathering context...');
    const startMs = Date.now();

    // ⚡ PERF: Reuse pre-loaded brand from state if available (loadBrandContext already ran in runCreativePipeline).
    // Only fall back to a fresh DB query when called standalone (e.g. creative-agentic.js routes).
    let brand = state.loadedBrand || null;
    let products = state.loadedProducts || null;

    if (!brand) {
        brand = await Brand.findById(state.brandId).lean();
    }
    if (!brand) {
        return { ...state, brandIntel: { error: 'Brand not found' }, status: 'brand-intel' };
    }

    const dna = brand.dna || {};

    // ── Fetch REAL products from catalog (anti-hallucination) ──
    // Skip if products were already loaded by loadBrandContext (passed via state.loadedProducts)
    if (!products) {
        products = await Product.find(
            { brand: state.brandId, status: 'active' },
            { title: 1, shortDescription: 1, description: 1, features: 1, category: 1, subCategory: 1, images: 1, tags: 1, type: 1, productType: 1 }
        ).lean().limit(20);
    }

    const hasProducts = products.length > 0;
    const brandType = hasProducts ? 'product' : 'service';

    // ── Semantic keyword expansion for better matching ──
    // Maps thematic/abstract words to product-relevant keywords
    const SEMANTIC_MAP = {
        // Music/Audio
        beat: ['earbuds', 'headphones', 'speaker', 'audio', 'music', 'sound', 'bass', 'wireless', 'neckband'],
        beats: ['earbuds', 'headphones', 'speaker', 'audio', 'music', 'sound', 'bass', 'wireless', 'neckband'],
        music: ['earbuds', 'headphones', 'speaker', 'audio', 'sound', 'neckband', 'soundbar'],
        sound: ['earbuds', 'headphones', 'speaker', 'audio', 'neckband', 'soundbar'],
        listen: ['earbuds', 'headphones', 'neckband', 'audio'],
        bass: ['speaker', 'headphones', 'earbuds', 'soundbar', 'audio'],
        speaker: ['speaker', 'soundbar', 'portable', 'boom', 'bluetooth', 'audio'],
        // Fashion/Lifestyle
        summer: ['light', 'casual', 'outdoor', 'travel', 'portable', 'wireless', 'sport'],
        winter: ['warm', 'cozy', 'premium', 'over-ear', 'studio'],
        travel: ['portable', 'wireless', 'compact', 'powerbank', 'charger'],
        fitness: ['sport', 'wireless', 'sweat', 'gym', 'active', 'neckband'],
        workout: ['sport', 'wireless', 'neckband', 'earbuds', 'active'],
        // Tech
        gaming: ['headphones', 'gaming', 'rgb', 'bass', 'over-ear', 'studio', 'tws'],
        work: ['headphones', 'neckband', 'noise', 'office', 'professional'],
        gift: ['premium', 'watch', 'earbuds', 'headphones', 'powerbank'],
        style: ['watch', 'earbuds', 'premium', 'fashion'],
        watch: ['watch', 'smartwatch', 'wrist', 'fitness'],
        charge: ['powerbank', 'charger', 'charging', 'cable', 'type-c'],
        // Occasions — no specific product preference
        birthday: [],
        holi: [],
        diwali: [],
        christmas: [],
        valentine: [],
        anniversary: [],
        party: ['speaker', 'earbuds', 'headphones', 'soundbar'],
        celebration: [],
        festival: [],
        wish: [],
        greeting: [],
    };

    // ── Auto-detect which product the user is referring to ──
    let matchedProduct = null;
    if (hasProducts && state.brief) {
        const briefLower = state.brief.toLowerCase();
        const briefWords = briefLower.split(/\s+/).filter(w => w.length > 2);

        // Check if it's purely an occasion (no product context at all)
        const occasionWords = ['birthday', 'holi', 'diwali', 'christmas', 'valentine', 'anniversary', 'wish', 'greeting', 'festival', 'happy', 'celebration', 'congratulation'];
        const isOnlyOccasion = briefWords.every(w => occasionWords.includes(w) || w.length <= 2);

        // Expand brief with semantic keywords
        const expandedKeywords = new Set(briefWords);
        for (const word of briefWords) {
            const expansions = SEMANTIC_MAP[word];
            if (expansions) {
                expansions.forEach(kw => expandedKeywords.add(kw));
            }
        }
        const expandedBrief = [...expandedKeywords].join(' ');

        if (!isOnlyOccasion) {
            // Score each product by keyword overlap with the user's brief + semantic expansion
            let bestScore = 0;
            for (const p of products) {
                let score = 0;
                const titleLower = (p.title || '').toLowerCase();
                const titleWords = titleLower.split(/\s+/).filter(w => w.length > 2);
                const descLower = (p.description || p.shortDescription || '').toLowerCase();
                const categoryLower = (p.category || '').toLowerCase();

                // Direct title word match in original brief (strongest signal)
                for (const w of titleWords) {
                    if (briefLower.includes(w)) score += 3;
                }

                // Expanded brief keywords found in product title (semantic match)
                for (const kw of expandedKeywords) {
                    if (kw.length > 2 && titleLower.includes(kw)) score += 4; // Title match is strongest
                    if (kw.length > 2 && descLower.includes(kw)) score += 1;
                }

                // Category match with expanded brief (very strong signal)
                if (categoryLower) {
                    for (const kw of expandedKeywords) {
                        if (kw.length > 2 && categoryLower.includes(kw)) score += 5;
                    }
                }

                // Check tags
                for (const tag of (p.tags || [])) {
                    if (briefLower.includes(tag.toLowerCase())) score += 2;
                    if (expandedBrief.includes(tag.toLowerCase())) score += 1;
                }

                // Bonus: full product name appears in brief
                if (briefLower.includes(titleLower)) score += 10;

                // NEGATIVE scoring: penalize category mismatch
                // If brief clearly mentions "speaker" but product is "SmartWatch", subtract
                if (categoryLower === 'smartwatch' && (expandedBrief.includes('speaker') || expandedBrief.includes('headphones') || expandedBrief.includes('earbuds') || expandedBrief.includes('soundbar'))) {
                    score -= 5;
                }
                if ((categoryLower === 'true wireless earbuds' || categoryLower === 'earbuds') && expandedBrief.includes('speaker') && !expandedBrief.includes('earbuds') && !expandedBrief.includes('wireless')) {
                    score -= 3;
                }

                if (score > bestScore) {
                    bestScore = score;
                    matchedProduct = p;
                }
            }
            // Only match if there's reasonable confidence
            if (bestScore < 2) matchedProduct = null;
            if (matchedProduct) {
                console.log(`🎯 Product matched: "${matchedProduct.title}" (score: ${bestScore}, images: ${(matchedProduct.images || []).length}, category: ${matchedProduct.category || 'none'})`);
            }
        } else {
            console.log(`🎉 Occasion-only brief detected: "${state.brief}" — no specific product match needed`);
        }
    }

    // ── AGENTIC DECISION: No random product injection ──
    // When no product matches the brief, DON'T force a random one.
    // Instead, provide the full catalog context and let the downstream
    // Art Director and Prompt Engineer agents make intelligent decisions.
    if (!matchedProduct && hasProducts) {
        console.log(`🧠 No specific product match for brief: "${state.brief}" — downstream agents will decide if/which product to feature`);
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
        
        // Visual DNA (Explicitly structured for prompt injection)
        visualDNA: {
            designStyle: dna.visualDNA?.designStyle || '',
            layoutPreference: dna.visualDNA?.layoutPreference || '',
            imageMood: dna.visualDNA?.imageMood || '',
            textureStyle: dna.visualDNA?.textureStyle || '',
            photographyStyle: dna.photographyStyle || '',
            designRules: dna.visualDNA?.designRules || [],
            designAvoid: dna.visualDNA?.designAvoid || [],
        },

        // Colors — Passed as names for visual grounding, hex codes for precision
        colors: (dna.colors || []).slice(0, 8).map(c => ({
            name: c.name || 'brand accent',
            hex: c.hex || '',
            type: c.type || 'primary'
        })).filter(c => c.hex || c.name),

        // Brand anchor colors (for strict fidelity)
        primaryColors: (dna.colors || []).filter(c => c.type === 'primary').map(c => c.name || c.hex),

        // Content style
        contentDos: dna.contentStyle?.dos?.slice(0, 5) || [],
        contentDonts: dna.contentStyle?.donts?.slice(0, 5) || [],
        
        // Brand values
        values: (dna.brandValues || []).slice(0, 5),
        usps: (dna.uniqueSellingPoints || []).slice(0, 5),
        services: (dna.servicesOffered || []).slice(0, 5),
        
        // Logo info
        hasLogo: !!(dna.logo?.url),

        // ── ANTI-HALLUCINATION: Real product data ──
        brandType,
        productCatalogSize: products.length,
        brandImages: (dna.brandImages || []).slice(0, 5).map(img => img.url).filter(Boolean),
        matchedDnaImages,
        productCandidates,
        competitorImages: dna.competitiveIntel?.competitorImages || [],
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
        spec: '1920×600 wide banner (3.2:1)',
        rules: [
            'Ultra-wide composition: spread content horizontally, avoid centering everything',
            'Leave text-safe zones on left and/or right, but keep text away from extreme edges',
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

    // Use pre-loaded brandContext from pipeline runner (pre-loaded ONCE in runCreativePipeline)
    const brandContext = state.brandContext || '<brand_bible>No brand data.</brand_bible>';
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

    // ── Detect occasion/theme from the brief ──
    const briefLower = (state.brief || '').toLowerCase();
    const OCCASIONS = {
        birthday: '🎂 BIRTHDAY CELEBRATION — cake, balloons, confetti, gifts, party atmosphere',
        holi: '🌈 HOLI FESTIVAL — colorful powder (gulal), joy, people celebrating, vibrant color explosions',
        diwali: '🪔 DIWALI FESTIVAL — diyas, sparklers, rangoli, warm golden lights, festive glow',
        christmas: '🎄 CHRISTMAS — snow, gifts, decorations, warm cozy vibes, red and green',
        'new year': '🎆 NEW YEAR — fireworks, midnight celebration, countdown, champagne, fresh starts',
        valentine: '💕 VALENTINE\'S DAY — hearts, roses, romantic mood, love, couple vibes',
        'independence day': '🇮🇳 INDEPENDENCE DAY — tricolor, patriotic, proud, national celebration',
        'republic day': '🇮🇳 REPUBLIC DAY — tricolor, patriotic, parade, national pride',
        rakhi: '🧵 RAKSHA BANDHAN — rakhi thread, brother-sister bond, festive celebration',
        eid: '🌙 EID — crescent moon, lanterns, celebration, warm gathering',
        navratri: '🕺 NAVRATRI — garba dance, dandiya, vibrant colors, festive energy',
        ganesh: '🐘 GANESH CHATURTHI — Lord Ganesha, modak, festive procession, celebration',
        onam: '🌸 ONAM — pookalam floral carpet, sadya feast, Kerala harvest festival',
        pongal: '🍚 PONGAL — harvest celebration, pot overflowing, sugarcane, sun',
        makar: '🪁 MAKAR SANKRANTI — kite flying, sky full of kites, festival vibes',
        summer: '☀️ SUMMER VIBES — bright sunshine, outdoor, tropical, cool, refreshing',
        monsoon: '🌧️ MONSOON — rain, green, cozy, refreshing, petrichor mood',
        winter: '❄️ WINTER — cozy, warm, mist, layered, premium comfort',
        party: '🎉 PARTY — energetic, dance, lights, music, celebration',
    };

    let occasionHint = '';
    for (const [key, description] of Object.entries(OCCASIONS)) {
        if (briefLower.includes(key)) {
            occasionHint = `\n🎯 DETECTED OCCASION/THEME: ${description}\n⚠️ THIS MUST BE THE VISUAL HERO OF THE IMAGE. The brand/product should be integrated into this occasion scene naturally — NOT the other way around.\nExample: If it's a birthday post for an earbuds brand → Show a birthday party scene with the earbuds as a gift on the table, NOT just earbuds with "Happy Birthday" text.\n`;
            break;
        }
    }

    // ── Visual Grounding intelligence (from MCoT product image analysis) ──
    const vgSection = state.visualGrounding ? [
        `\n━━━ PRODUCT VISUAL INTELLIGENCE (from MCoT image analysis) ━━━`,
        state.visualGrounding.productAnalysis ? `Visual Description: ${state.visualGrounding.productAnalysis}` : '',
        state.visualGrounding.keyVisualFeatures?.length ? `Key Features: ${state.visualGrounding.keyVisualFeatures.join(' | ')}` : '',
        state.visualGrounding.materialFinish ? `Materials & Finish: ${state.visualGrounding.materialFinish}` : '',
        state.visualGrounding.generationGuidance ? `Generation Rules: ${state.visualGrounding.generationGuidance}` : '',
        state.visualGrounding.brandVisualWorld ? `Product Visual World: ${state.visualGrounding.brandVisualWorld}` : '',
        state.visualGrounding.lightingSuggestion ? `Optimal Lighting: ${state.visualGrounding.lightingSuggestion}` : '',
        state.visualGrounding.environmentalAffinities?.length ? `Strong Environments for this product: ${state.visualGrounding.environmentalAffinities.join(' | ')}` : '',
        state.visualGrounding.humanContextClue ? `Human Presence Signal: ${state.visualGrounding.humanContextClue}` : '',
        `\n⚠️ CRITICAL: The user has provided an image of a specific product. You MUST base your creative direction on the visual description above, even if it doesn't match a specific product name in the catalog.`
    ].filter(Boolean).join('\n') : '';

    const userPrompt = [
        `CREATIVE BRIEF: ${state.brief}`,
        occasionHint,
        `FORMAT: ${formatIntel?.label || formatKey} (${formatIntel?.spec || state.aspectRatio || '1:1'})`,
        `ASPECT RATIO: ${state.aspectRatio || '1:1'}`,
        // Platform-specific creative rules
        formatIntel ? `\n🎯 PLATFORM-SPECIFIC RULES FOR ${formatIntel.label.toUpperCase()}:\n${formatIntel.rules}` : '',
        state.style ? `PREFERRED STYLE: ${state.style}` : '',
        // Inject brand intelligence for smarter direction
        intel.visualDNA?.designStyle ? `BRAND DESIGN STYLE: ${intel.visualDNA.designStyle}` : '',
        intel.visualDNA?.imageMood ? `BRAND IMAGE MOOD: ${intel.visualDNA.imageMood}` : '',
        intel.visualDNA?.photographyStyle ? `PHOTOGRAPHY DIRECTION: ${intel.visualDNA.photographyStyle}` : '',
        intel.primaryColors?.length > 0 ? `BRAND PRIMARY COLORS: ${intel.primaryColors.join(', ')} — these are the core anchors for the visual mood` : '',
        intel.visualDNA?.typographyStyle ? `BRAND TYPOGRAPHY PERSONALITY (HARD CONSTRAINT — all text elements must match this, every brand has a unique type voice): ${intel.visualDNA.typographyStyle}` : '',
        intel.visualDNA?.designRules?.length > 0 ? `DESIGN RULES (must follow): ${intel.visualDNA.designRules.slice(0, 3).join('; ')}` : '',
        intel.visualDNA?.designAvoid?.length > 0 ? `AVOID: ${intel.visualDNA.designAvoid.slice(0, 3).join('; ')}` : '',
        state.references ? `REFERENCE NOTES: ${state.references}` : '',
        state.productName ? `PRODUCT: ${state.productName}` : '',
        vgSection,
        productContext,
        // When no product is matched, give the agent the full catalog + decision authority
        intel.brandType === 'product' && !mp ? `\n🧠 AGENTIC DECISION REQUIRED — NO PRODUCT WAS AUTO-MATCHED:\nThe user's brief didn't clearly reference any specific product. As the Art Director, YOU must decide:\n1. ANALYZE the brief — does it have ANY thematic connection to a product category? (e.g. "summer vibes" → portable speakers/earbuds)\n2. If YES → pick the most relevant product from the catalog below and integrate it naturally at a SUPPORTING level (30-40% of the image)\n3. If the brief is an OCCASION/GREETING → create a brand-atmosphere scene using the brand's visual identity, colors, and personality. Products appear as ambient props if at all (10-20%), NOT as the hero.\n4. If the brief is PURELY about brand identity → showcase the brand's world without forcing any product.\n\nDO NOT randomly pick a product just to fill space. Make a creative decision.` : '',
        !mp && intel.productCandidates?.length > 0 ? `\nAVAILABLE PRODUCTS IN CATALOG (pick ONLY if relevant to the brief):\n${intel.productCandidates.map(c => `• ${c.title}${c.category ? ` [${c.category}]` : ''}: ${c.description || 'No description'}${c.images?.length > 0 ? ' 📸' : ''}`).join('\n')}` : '',
        // ── MCP Live Market Intelligence ──
        state.marketIntel?.trendingTopics ? `\n📡 LIVE TRENDING TOPICS RIGHT NOW (from MCP):\n${state.marketIntel.trendingTopics}\nUse these as creative context if relevant to the brief.` : '',
        state.marketIntel?.viralFormats ? `VIRAL AD FORMATS THIS WEEK: ${state.marketIntel.viralFormats}` : '',
        state.marketIntel?.calendarHooks ? `UPCOMING CALENDAR HOOKS: ${state.marketIntel.calendarHooks}` : '',
        state.diversityDirective ? `\n━━━ DIVERSITY DIRECTIVE ━━━\n${state.diversityDirective}` : '',
    ].filter(Boolean).join('\n');

    // Art Director: Claude Sonnet — high temperature for genuinely creative, non-template outputs
    const result = await agentUtils.callAgent(ART_DIRECTOR_PROMPT(brandContext, state.aspectRatio), userPrompt, 0.82, 3500, { provider: 'anthropic', model: 'claude-sonnet-4-20250514' });
    console.log(`🎨 Art direction defined in ${Date.now() - startMs}ms (Claude Sonnet 4)`);

    return {
        ...state,
        artDirection: result,
        status: 'art-direction',
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// FAST NODE: CREATIVE DIRECTOR — Art Direction + Prompt Engineering in ONE call
// Saves ~10-15s by eliminating the second LLM round-trip
// ══════════════════════════════════════════════════════════════════════════════
export async function fastCreativeDirectorNode(state) {
    console.log('⚡ Creative Agent: Fast Creative Director — combined vision + prompt...');
    const startMs = Date.now();

    const brandContext = state.brandContext || '<brand_bible>No brand data.</brand_bible>';
    const intel = state.brandIntel || {};

    // Build product context (same as artDirectorNode)
    const mp = state.matchedProduct;
    const productContext = mp ? [
        `\n⚠️ REAL PRODUCT DATA (DO NOT HALLUCINATE — use ONLY this info):`,
        `PRODUCT NAME: ${mp.title}`,
        mp.description ? `PRODUCT DESCRIPTION: ${mp.description}` : '',
        mp.features?.length > 0 ? `KEY FEATURES: ${mp.features.join(', ')}` : '',
        mp.category ? `CATEGORY: ${mp.category}` : '',
        mp.images?.length > 0 ? `📸 REAL PRODUCT IMAGES ARE PROVIDED AS REFERENCE.` : '',
    ].filter(Boolean).join('\n') : '';

    const formatKey = state.format || 'instagram-post';
    const formatIntel = FORMAT_INTELLIGENCE[formatKey];

    // Occasion detection (same as artDirectorNode)
    const briefLower = (state.brief || '').toLowerCase();
    const OCCASIONS = {
        birthday: '🎂 BIRTHDAY — cake, balloons, confetti, party vibes',
        holi: '🌈 HOLI — colorful powder, joy, vibrant color explosions',
        diwali: '🪔 DIWALI — diyas, sparklers, rangoli, golden lights',
        christmas: '🎄 CHRISTMAS — snow, gifts, decorations, cozy vibes',
        'new year': '🎆 NEW YEAR — fireworks, celebration, countdown',
        valentine: '💕 VALENTINE — hearts, roses, romantic mood',
        summer: '☀️ SUMMER — bright sunshine, outdoor, refreshing',
        party: '🎉 PARTY — energetic, dance, lights, music',
        eid: '🌙 EID — crescent moon, lanterns, celebration',
        navratri: '🕺 NAVRATRI — garba, dandiya, vibrant colors',
    };

    let occasionHint = '';
    for (const [key, desc] of Object.entries(OCCASIONS)) {
        if (briefLower.includes(key)) {
            occasionHint = `\n🎯 DETECTED OCCASION: ${desc}\n⚠️ THIS MUST BE THE VISUAL HERO. Brand/product integrates naturally into this celebration scene.\n`;
            break;
        }
    }

    // ── Live market intelligence (now guaranteed to be present — MCP co-schedules with VG) ──
    const marketIntelSection = state.marketIntel ? [
        `\n━━━ LIVE MARKET INTELLIGENCE (real-time MCP data) ━━━`,
        state.marketIntel.trendingTopics ? `Trending in ${intel.industry || 'this category'} right now:\n${state.marketIntel.trendingTopics}` : '',
        state.marketIntel.viralFormats ? `Viral creative formats this week: ${state.marketIntel.viralFormats}` : '',
        state.marketIntel.calendarHooks ? `Timely calendar hooks: ${state.marketIntel.calendarHooks}` : '',
        state.marketIntel.webIntel ? `Industry context: ${state.marketIntel.webIntel.substring(0, 350)}` : '',
        `INSTRUCTION: Use this live intelligence to make the output feel CURRENT and RELEVANT. If a trending format matches the brand DNA, apply it. Do not force trends that contradict the brand's visual identity.`,
    ].filter(Boolean).join('\n') : '';

    // ── Visual Grounding intelligence (from MCoT product image analysis) ──
    const vgSection = state.visualGrounding ? [
        `\n━━━ PRODUCT VISUAL INTELLIGENCE (from MCoT image analysis) ━━━`,
        state.visualGrounding.productAnalysis ? `Visual Description: ${state.visualGrounding.productAnalysis}` : '',
        state.visualGrounding.keyVisualFeatures?.length ? `Key Features: ${state.visualGrounding.keyVisualFeatures.join(' | ')}` : '',
        state.visualGrounding.materialFinish ? `Materials & Finish: ${state.visualGrounding.materialFinish}` : '',
        state.visualGrounding.generationGuidance ? `Generation Rules: ${state.visualGrounding.generationGuidance}` : '',
        state.visualGrounding.brandVisualWorld ? `Product Visual World: ${state.visualGrounding.brandVisualWorld}` : '',
        state.visualGrounding.lightingSuggestion ? `Optimal Lighting: ${state.visualGrounding.lightingSuggestion}` : '',
        state.visualGrounding.environmentalAffinities?.length ? `Strong Environments for this product: ${state.visualGrounding.environmentalAffinities.join(' | ')}` : '',
        state.visualGrounding.humanContextClue ? `Human Presence Signal: ${state.visualGrounding.humanContextClue}` : '',
        `\n⚠️ CRITICAL: The user has provided an image of a specific product. You MUST base your prompt on the visual description above, even if it doesn't match a specific product name in the catalog.`
    ].filter(Boolean).join('\n') : '';

    const userPrompt = [
        `CREATIVE BRIEF: ${state.brief}`,
        occasionHint,
        `FORMAT: ${formatIntel?.label || formatKey} (${formatIntel?.spec || state.aspectRatio || '1:1'})`,
        `ASPECT RATIO: ${state.aspectRatio || '1:1'}`,
        formatIntel ? `\nPLATFORM RULES for ${formatIntel.label.toUpperCase()}:\n${formatIntel.rules}` : '',
        state.style ? `STYLE: ${state.style}` : '',
        intel.visualDNA?.designStyle ? `BRAND VISUAL STYLE: ${intel.visualDNA.designStyle}` : '',
        intel.visualDNA?.imageMood ? `BRAND IMAGE MOOD: ${intel.visualDNA.imageMood}` : '',
        intel.visualDNA?.typographyStyle ? `BRAND TYPOGRAPHY PERSONALITY: ${intel.visualDNA.typographyStyle}` : '',
        intel.visualDNA?.photographyStyle ? `PHOTOGRAPHY DIRECTION: ${intel.visualDNA.photographyStyle}` : '',
        intel.visualDNA?.designRules?.length > 0 ? `DESIGN RULES (must follow): ${intel.visualDNA.designRules.slice(0, 4).join('; ')}` : '',
        intel.visualDNA?.designAvoid?.length > 0 ? `DESIGN AVOID: ${intel.visualDNA.designAvoid.slice(0, 4).join('; ')}` : '',
        intel.primaryColors?.length > 0 ? `BRAND PRIMARY COLORS: ${intel.primaryColors.join(', ')} — dominant in atmosphere and lighting` : '',
        `IMAGE MODEL: ${state.imageModel || 'gemini'} — optimize prompt accordingly`,
        marketIntelSection,
        vgSection,
        productContext,
        // When no product is matched, give the agent catalog + decision authority
        intel.brandType === 'product' && !mp ? `\n🧠 AGENTIC DECISION: No product was auto-matched to this brief. You must decide:\n- If the brief relates to a product category → pick the best fit from the catalog and integrate at SUPPORTING level\n- If it's an occasion/greeting → create a brand-atmosphere visual without forcing a product\n- If it's about brand identity → pure brand visual, no product insertion` : '',
        !mp && intel.productCandidates?.length > 0 ? `\nCATALOG (pick ONLY if relevant):\n${intel.productCandidates.map(c => `• ${c.title}${c.category ? ` [${c.category}]` : ''}${c.images?.length > 0 ? ' 📸' : ''}`).join('\n')}` : '',
        state.diversityDirective ? `\n━━━ DIVERSITY DIRECTIVE ━━━\n${state.diversityDirective}` : '',
    ].filter(Boolean).join('\n');

    // ⚡ Claude Haiku — same speed as Gemini Flash but dramatically better brand reasoning,
    //    typography understanding, and creative specificity. Critical: fast path hits ALL social-kit generations.
    const result = await agentUtils.callAgent(FAST_CREATIVE_DIRECTOR_PROMPT(brandContext, state.aspectRatio), userPrompt, 0.82, 3000, { provider: 'anthropic', model: 'claude-haiku-4-20250514', timeoutMs: 60_000 });
    console.log(`⚡ Fast Creative Director done in ${Date.now() - startMs}ms`);

    return {
        ...state,
        artDirection: {
            // Core art direction fields (same as full artDirectorNode)
            mood: result.mood,
            visualStyle: result.visualStyle,
            suggestedHeadline: result.suggestedHeadline,
            productIntegration: result.productIntegration, // hero | supporting | ambient | none
            negativePrompt: result.negativePrompt,
            engineeringNotes: result.engineeringNotes, // Art director's creative reasoning
        },
        engineeredPrompt: {
            primaryPrompt: result.primaryPrompt,
            negativePrompt: result.negativePrompt,
            engineeringNotes: result.engineeringNotes,
        },
        status: 'creative-direction',
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// NODE 2: PROMPT ENGINEER — Craft optimal image prompt
// ══════════════════════════════════════════════════════════════════════════════
export async function promptEngineerNode(state) {
    console.log('🔧 Creative Agent: Prompt Engineer — crafting prompt...');
    const startMs = Date.now();

    // Use pre-loaded brandContext from pipeline runner (pre-loaded ONCE in runCreativePipeline)
    const brandContext = state.brandContext || '<brand_bible>No brand data.</brand_bible>';
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

    const vgSection = state.visualGrounding ? [
        `\n━━━ PRODUCT VISUAL INTELLIGENCE (from MCoT image analysis) ━━━`,
        state.visualGrounding.productAnalysis ? `Visual Description: ${state.visualGrounding.productAnalysis}` : '',
        state.visualGrounding.keyVisualFeatures?.length ? `Key Features: ${state.visualGrounding.keyVisualFeatures.join(' | ')}` : '',
        state.visualGrounding.materialFinish ? `Materials & Finish: ${state.visualGrounding.materialFinish}` : '',
        state.visualGrounding.generationGuidance ? `Generation Rules: ${state.visualGrounding.generationGuidance}` : '',
        `\n⚠️ CRITICAL: Ensure the final prompt strictly features the product described in this visual intelligence section.`
    ].filter(Boolean).join('\n') : '';

    // Get format-specific intelligence for prompt engineer too
    const formatKey2 = state.format || 'instagram-post';
    const formatIntel2 = FORMAT_INTELLIGENCE[formatKey2];

    const userPrompt = [
        `CONVERT THIS ART DIRECTION INTO AN IMAGE GENERATION PROMPT:`,
        `--- BRAND GROUNDING (PRIORITY) ---`,
        `Brand Identity: ${intel.overview || ''}`,
        `Personality: ${intel.personality || ''}`,
        `Aesthetic Direction: ${intel.visualDNA?.designStyle || ''}, ${intel.visualDNA?.imageMood || ''}`,
        intel.primaryColors?.length > 0 ? `CRITICAL BRAND COLORS: Use ${intel.primaryColors.join(', ')} as the primary lighting and atmospheric hues. These colors MUST dominate the scene surfaces and environment. NEVER render names as text.` : '',
        '',
        `--- ART DIRECTION TO EXECUTE ---`,
        `Creative Direction: ${state.artDirection?.creativeDirection || ''}`,
        `Visual Style: ${state.artDirection?.visualStyle || ''}`,
        `Mood: ${state.artDirection?.mood || ''}`,
        `Lighting: ${state.artDirection?.lightingDirection || 'natural'}`,
        `Color Strategy: ${state.artDirection?.colorStrategy || ''}`,
        `Composition: ${state.artDirection?.composition || ''}`,
        `Key Elements: ${(state.artDirection?.keyElements || []).join(', ')}`,
        `Scroll Stop Factor: ${state.artDirection?.scrollStopFactor || ''}`,
        state.artDirection?.suggestedHeadline && state.generateCopy ? `SUGGESTED HEADLINE TEXT: "${state.artDirection.suggestedHeadline}" — INCORPORATE this as bold, readable text in the image prompt. Describe it like: 'Bold text reading "${state.artDirection.suggestedHeadline}" prominently displayed in high-contrast lettering'` : '',
        `Avoid: ${(state.artDirection?.avoidList || []).join(', ')}`,
        `Format: ${formatIntel2?.label || formatKey2} (${formatIntel2?.spec || state.aspectRatio || '1:1'})`,
        `Aspect Ratio: ${state.aspectRatio || '1:1'}`,
        // Platform-specific rules for the prompt engineer
        formatIntel2 ? `\n🎯 PLATFORM-SPECIFIC REQUIREMENTS (your prompt MUST address these):\n${formatIntel2.rules}` : '',
        `Image Model: ${state.imageModel || 'gemini'} — optimize prompt for this model`,
        `Original Brief: ${state.brief}`,
        vgSection,
        productGrounding,
    ].filter(Boolean).join('\n');

    // Prompt Engineer: Claude Sonnet for precise, brand-faithful prompt construction
    // Prompt Engineer at 0.75 — low temp produces mechanical identical prompts every generation
    const result = await agentUtils.callAgent(PROMPT_ENGINEER_PROMPT(brandContext, state.aspectRatio), userPrompt, 0.75, 3200, { provider: 'anthropic', model: 'claude-sonnet-4-20250514' });
    console.log(`🔧 Prompt engineered in ${Date.now() - startMs}ms (Claude Sonnet)`);

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

    // Use pre-loaded brandContext from pipeline runner (pre-loaded ONCE in runCreativePipeline)
    const brandContext = state.brandContext || '<brand_bible>No brand data.</brand_bible>';

    const userPrompt = [
        `ANALYZE THIS IMAGE GENERATION PROMPT:`,
        `Primary Prompt: ${state.engineeredPrompt?.primaryPrompt || ''}`,
        `Negative Prompt: ${state.engineeredPrompt?.negativePrompt || ''}`,
        `Style Modifiers: ${state.engineeredPrompt?.styleModifiers || ''}`,
        `Target Format: ${state.format || 'instagram-post'}`,
        `Aspect Ratio: ${state.aspectRatio || '1:1'}`,
        `Original Brief: ${state.brief}`,
    ].join('\n');

    // ⚡ preferFast — Style critic is evaluation/scoring: Gemini sufficient
    // ⚡ PERF: maxTokens reduced from 4096→1024 — critic returns short JSON verdict/score
    const result = await agentUtils.callAgent(STYLE_CRITIC_PROMPT(brandContext, state.aspectRatio), userPrompt, 0.3, 1024, { preferFast: true });
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

    // Use pre-loaded brandContext from pipeline runner (pre-loaded ONCE in runCreativePipeline)
    const brandContext = state.brandContext || '<brand_bible>No brand data.</brand_bible>';

    const userPrompt = [
        `CREATE 3 VARIATIONS OF THIS PROMPT:`,
        `Original Prompt: ${state.finalPrompt || state.engineeredPrompt?.primaryPrompt || ''}`,
        `Art Direction: ${state.artDirection?.creativeDirection || ''}`,
        `Mood: ${state.artDirection?.mood || ''}`,
        `Format: ${state.format || 'instagram-post'}`,
        `Aspect Ratio: ${state.aspectRatio || '1:1'}`,
        `Original Brief: ${state.brief}`,
    ].join('\n');

    // ⚡ preferFast — Variation is JSON structure generation: Gemini sufficient
    // ⚡ PERF: maxTokens reduced from 4096→2048 — variation JSON is typically 800-1200 tokens
    const result = await agentUtils.callAgent(VARIATION_PROMPT(brandContext), userPrompt, 0.8, 2048, { preferFast: true });
    console.log(`🔀 ${(result.variations || []).length} variations generated in ${Date.now() - startMs}ms`);

    return {
        ...state,
        variations: result.variations || [],
        status: 'variations',
    };
}


// ══════════════════════════════════════════════════════════════════════════════
// NODE 5: COPYWRITER — Generates brand-aware marketing copy alongside visuals
// Runs in PARALLEL with image generation for zero added latency
// ══════════════════════════════════════════════════════════════════════════════
export async function copywriterNode(state) {
    console.log('✍️  Creative Agent: Copywriter — writing brand copy...');
    const startMs = Date.now();

    // ⚡ Use pre-loaded brandContext + brandIntel — NO redundant DB/Redis calls
    const resolvedBrandContext = state.brandContext || '<brand_bible>No brand data.</brand_bible>';
    // Build brandObj from state.brandIntel (already loaded by brandIntelligenceNode)
    // This eliminates the redundant loadBrandContext() + Brand.findById() calls
    const brandObj = state.brandIntel
        ? { name: state.brandIntel.name, dna: { targetAudience: state.brandIntel.targetAudience, voice: { personality: state.brandIntel.personality }, defaultLanguage: state.brandIntel.defaultLanguage } }
        : null;

    // Language inference — generate copy in the brand's audience language
    const langInfo = inferBrandLanguage(brandObj);
    const languageDirective = buildLanguageDirective(
        langInfo,
        brandObj?.name || '',
        brandObj?.dna?.targetAudience || ''
    );
    if (langInfo.isRegional) {
        console.log(`🌍 Creative Copywriter: Language directive active — ${langInfo.displayName} (${langInfo.source})`);
    }

    const intel = state.brandIntel || {};
    const mp = state.matchedProduct;

    // ── Build rich context for the copywriter ──
    const formatKey = state.format || 'instagram-post';
    const platformMap = {
        'instagram-post': 'Instagram Post',
        'instagram-story': 'Instagram Story / Reel',
        'facebook-ad': 'Facebook Ad',
        'linkedin-post': 'LinkedIn Post',
        'youtube-thumb': 'YouTube Thumbnail',
        'twitter-post': 'Twitter / X Post',
        'banner': 'Website Banner',
    };
    const platformLabel = platformMap[formatKey] || formatKey;

    // ── Pull full art direction context (art director has already expanded the brief) ──
    const artDir = state.artDirection || {};
    const vg = state.visualGrounding || null; // MCoT visual grounding
    const ep = state.engineeredPrompt || null; // engineered prompt from fast director

    // Build a rich expanded brief from all upstream agent outputs
    const expandedBriefParts = [
        `ORIGINAL USER BRIEF: ${state.brief}`,
    ];

    // Fast director's engineeringNotes explains the creative interpretation — most valuable context
    if (ep?.engineeringNotes) {
        expandedBriefParts.push(`CREATIVE INTERPRETATION (Art Director's reasoning): ${ep.engineeringNotes}`);
    }
    // Art director's creativeDirection (from quality mode)
    if (artDir.creativeDirection) {
        expandedBriefParts.push(`CREATIVE DIRECTION: ${artDir.creativeDirection}`);
    }
    // The image being generated — gives the copywriter a sense of what the visual looks like
    if (ep?.primaryPrompt) {
        expandedBriefParts.push(`VISUAL BEING GENERATED: ${ep.primaryPrompt.substring(0, 300)}`);
    }
    // Product integration level — tells copywriter how prominently product features
    if (artDir.productIntegration) {
        expandedBriefParts.push(`PRODUCT INTEGRATION LEVEL: ${artDir.productIntegration} (hero = write around the product; supporting = weave in naturally; ambient/none = focus on brand mood)`);
    }
    // scrollStopFactor from full art director
    if (artDir.scrollStopFactor) {
        expandedBriefParts.push(`SCROLL-STOP FACTOR: ${artDir.scrollStopFactor}`);
    }
    // Visual grounding gives real product facts the copywriter should reference
    if (vg?.productAnalysis) {
        expandedBriefParts.push(`PRODUCT VISUAL FACTS (from real product photos): ${vg.productAnalysis}`);
    }

    const userPrompt = [
        expandedBriefParts.join('\n'),
        '',
        `PLATFORM: ${platformLabel}`,
        `FORMAT: ${state.format || 'instagram-post'}`,
        // Language enforcement
        langInfo.isRegional
            ? `LANGUAGE: Write ALL copy (headline, subtext, CTA) ENTIRELY in ${langInfo.displayName}. Do NOT write in English.`
            : '',
        '',
        '--- ART DIRECTION (what the image will look like) ---',
        `VISUAL MOOD: ${artDir.mood || 'professional'}`,
        `VISUAL STYLE: ${artDir.visualStyle || 'modern'}`,
        artDir.colorStrategy ? `COLOR STRATEGY: ${artDir.colorStrategy}` : '',
        artDir.composition ? `COMPOSITION: ${artDir.composition}` : '',
        artDir.suggestedHeadline ? `VISUAL HEADLINE ALREADY ON IMAGE: "${artDir.suggestedHeadline}" — your caption MUST complement this without repeating it verbatim` : '',
        '',
        '--- BRAND INTELLIGENCE ---',
        intel.personality ? `BRAND VOICE: ${intel.personality}` : '',
        intel.tagline ? `BRAND TAGLINE (use sparingly — never just repeat it): ${intel.tagline}` : '',
        intel.values?.length > 0 ? `BRAND VALUES: ${intel.values.join(', ')}` : '',
        intel.targetAudience ? `TARGET AUDIENCE: ${intel.targetAudience}` : '',
        intel.usps?.length > 0 ? `BRAND USPs: ${intel.usps.join(', ')}` : '',
        intel.contentDos?.length > 0 ? `CONTENT DOS: ${intel.contentDos.join('; ')}` : '',
        intel.contentDonts?.length > 0 ? `CONTENT DON'TS: ${intel.contentDonts.join('; ')}` : '',
        '',
        '--- PRODUCT CONTEXT ---',
        mp ? `FEATURED PRODUCT: "${mp.title}"${mp.description ? ` — ${mp.description.substring(0, 200)}` : ''}` : 'No specific product — write brand-level copy.',
        mp?.features?.length > 0 ? `PRODUCT USPs: ${mp.features.slice(0, 5).join(', ')}` : '',
        mp?.price?.amount ? `PRICE POINT: ${mp.price.currency || '₹'}${mp.price.amount.toLocaleString()}${mp.price.mrp && mp.price.mrp > mp.price.amount ? ` (MRP: ${mp.price.currency || '₹'}${mp.price.mrp.toLocaleString()} — ${Math.round((1 - mp.price.amount / mp.price.mrp) * 100)}% off)` : ''}` : '',
        vg?.keyVisualFeatures?.length > 0 ? `KEY VISUAL FEATURES (verified from product photos): ${vg.keyVisualFeatures.join(', ')}` : '',
    ].filter(Boolean).join('\n');




    // ── DEBUG: Log exactly what we're sending to the copywriter ──
    console.log('✍️  COPYWRITER DEBUG — userPrompt length:', userPrompt.length);
    console.log('✍️  COPYWRITER userPrompt:\n', userPrompt.substring(0, 800));
    console.log('✍️  COPYWRITER brandContext length:', resolvedBrandContext?.length || 0);

    // Build system prompt with language directive prepended
    const systemPrompt = languageDirective
        ? `${languageDirective}\n\n${COPYWRITER_PROMPT(resolvedBrandContext)}`
        : COPYWRITER_PROMPT(resolvedBrandContext);

    // Copywriter: Claude Sonnet for nuanced brand-voice copy that is specific to each brand
    const result = await agentUtils.callAgent(systemPrompt, userPrompt, 0.75, 2048, { provider: 'anthropic' });
    console.log(`✍️  Copywriter result keys: ${Object.keys(result || {}).join(', ')}`);
    console.log(`✍️  Copywriter done in ${Date.now() - startMs}ms — headline: "${result.headline || '?'}" | subtext: "${result.subtext || 'none'}" | cta: "${result.ctaText || 'none'}"${result.error ? ` [PARSE ERROR: ${result.error}] RAW: ${result.raw?.substring(0, 200)}` : ''}`);
    if (result.ctaText) console.log(`✍️  Copywriter CTA: "${result.ctaText}"`);

    return {
        ...state,
        copy: {
            headline: result.headline || '',
            subtext: result.subtext || null,
            ctaText: result.ctaText || null,
            textStyle: result.textStyle || '',
            designRationale: result.designRationale || '',
        },
        detectedLanguage: langInfo,
        status: 'copywriting',
    };
}


// ══════════════════════════════════════════════════════════════════════════════
// UNIFIED CREATIVE ENGINE NODE — ONE Claude Sonnet call for all 4 roles
// Replaces fastCreativeDirectorNode + copywriterNode in fast pipeline.
// Art Direction + Prompt Engineering + Copy + Brand Typography in one chain.
// ══════════════════════════════════════════════════════════════════════════════
export async function unifiedCreativeEngineNode(state) {
    console.log('⚡ Unified Creative Engine (Claude Sonnet) — one call for all creative roles...');
    const startMs = Date.now();

    const brandContext = state.brandContext || '<brand_bible>No brand data.</brand_bible>';
    const intel = state.brandIntel || {};
    const mp = state.matchedProduct;
    const formatKey = state.format || 'instagram-post';
    const FORMAT_INTELLIGENCE_LABELS = {
        'youtube-thumb': 'YouTube Thumbnail (1280×720, 16:9)',
        'instagram-post': 'Instagram Post (1080×1350, 4:5)',
        'instagram-story': 'Instagram Story / Reel (1080×1920, 9:16)',
        'facebook-ad': 'Facebook Ad (1080×1350, 4:5)',
        'linkedin-post': 'LinkedIn Post (1200×1200, 1:1)',
        'banner': 'Website Banner / Hero (1920×600, 16:5 = 3.2:1 — ultra-wide horizontal strip)',
        'film-poster': 'Film Poster (2000×3000, 2:3 — tall vertical)',
        'hd-wide': 'HD Video Frame (1920×1080, 16:9)',
        'a4-portrait': 'A4 Portrait Print (2480×3508, 5:7 ≈ ISO A4)',
        'square-hd': 'Square HD (1200×1200, 1:1)',
        'lifestyle-mockup': 'Lifestyle Mockup Scene',
    };

    // Product context (anti-hallucination)
    const productContext = mp ? [
        `\n⚠️ REAL PRODUCT DATA (DO NOT HALLUCINATE — use ONLY this info):`,
        `PRODUCT NAME: ${mp.title}`,
        mp.description ? `PRODUCT DESCRIPTION: ${mp.description}` : '',
        mp.features?.length > 0 ? `KEY FEATURES: ${mp.features.join(', ')}` : '',
        mp.category ? `CATEGORY: ${mp.category}` : '',
        mp.images?.length > 0 ? `📸 REAL PRODUCT IMAGES PROVIDED AS REFERENCE — base creative direction on what you see in the images.` : '',
    ].filter(Boolean).join('\n') : '';

    // Occasion detection
    const briefLower = (state.brief || '').toLowerCase();
    const OCCASIONS = {
        birthday: '🎂 BIRTHDAY — cake, balloons, confetti, party vibes',
        holi: '🌈 HOLI — colorful powder, joy, vibrant color explosions',
        diwali: '🪔 DIWALI — diyas, sparklers, rangoli, golden lights',
        christmas: '🎄 CHRISTMAS — snow, gifts, decorations, cozy vibes',
        'new year': '🎆 NEW YEAR — fireworks, celebration, midnight countdown',
        valentine: '💕 VALENTINE — hearts, roses, romantic mood',
        summer: '☀️ SUMMER — bright sunshine, outdoor, refreshing',
        party: '🎉 PARTY — energetic, dance, lights, music',
        eid: '🌙 EID — crescent moon, lanterns, celebration',
        navratri: '🕺 NAVRATRI — garba, dandiya, vibrant colors',
    };
    let occasionHint = '';
    for (const [key, desc] of Object.entries(OCCASIONS)) {
        if (briefLower.includes(key)) {
            occasionHint = `\n🎯 DETECTED OCCASION: ${desc}\n⚠️ THIS MUST BE THE VISUAL HERO. Brand/product integrates naturally into this celebration scene — NOT the other way around.\n`;
            break;
        }
    }

    // Visual Grounding section (MCoT)
    const vgSection = state.visualGrounding ? [
        `\n━━━ VISUAL GROUND TRUTH (from uploaded/matched product images — this OVERRIDES your imagination) ━━━`,
        state.visualGrounding.productAnalysis ? `What the product ACTUALLY looks like: ${state.visualGrounding.productAnalysis}` : '',
        state.visualGrounding.keyVisualFeatures?.length ? `Exact visual features: ${state.visualGrounding.keyVisualFeatures.join(' | ')}` : '',
        state.visualGrounding.materialFinish ? `Material & Finish: ${state.visualGrounding.materialFinish}` : '',
        state.visualGrounding.colorPalette?.length ? `Accurate product colours: ${state.visualGrounding.colorPalette.join(', ')}` : '',
        state.visualGrounding.generationGuidance ? `GENERATION RULE: ${state.visualGrounding.generationGuidance}` : '',
        state.visualGrounding.brandVisualWorld ? `Product's visual world: ${state.visualGrounding.brandVisualWorld}` : '',
        state.visualGrounding.lightingSuggestion ? `Optimal lighting: ${state.visualGrounding.lightingSuggestion}` : '',
        state.visualGrounding.environmentalAffinities?.length ? `Best environments for this product: ${state.visualGrounding.environmentalAffinities.join(' | ')}` : '',
        state.visualGrounding.avoidList?.length ? `DO NOT: ${state.visualGrounding.avoidList.join('; ')}` : '',
        `\n⚠️ CRITICAL: The primaryPrompt MUST accurately represent this product based on the visual analysis above.`
    ].filter(Boolean).join('\n') : '';

    // Market intel
    const marketIntelSection = state.marketIntel ? [
        `\n━━━ LIVE MARKET INTELLIGENCE ━━━`,
        state.marketIntel.trendingTopics ? `Trending right now:\n${state.marketIntel.trendingTopics}` : '',
        state.marketIntel.viralFormats ? `Viral creative formats: ${state.marketIntel.viralFormats}` : '',
    ].filter(Boolean).join('\n') : '';

    const userPrompt = [
        `CREATIVE BRIEF: ${state.brief}`,
        occasionHint,
        `FORMAT: ${FORMAT_INTELLIGENCE_LABELS[formatKey] || formatKey}`,
        `ASPECT RATIO: ${state.aspectRatio || '1:1'}`,
        state.style ? `PREFERRED STYLE: ${state.style}` : '',
        `IMAGE MODEL: ${state.imageModel || 'nanobanana-2'} — optimize prompt accordingly`,
        '',
        '--- BRAND VISUAL DNA (hard constraints) ---',
        intel.visualDNA?.designStyle ? `Visual Design Style: ${intel.visualDNA.designStyle}` : '',
        intel.visualDNA?.imageMood ? `Image Mood: ${intel.visualDNA.imageMood}` : '',
        intel.visualDNA?.typographyStyle ? `Typography Personality (STRICT — each brand must look typographically unique): ${intel.visualDNA.typographyStyle}` : '',
        intel.visualDNA?.photographyStyle ? `Photography Direction: ${intel.visualDNA.photographyStyle}` : '',
        intel.primaryColors?.length > 0 ? `Brand Primary Colors: ${intel.primaryColors.join(', ')} — use as environmental surfaces and atmospheric hues` : '',
        intel.visualDNA?.designRules?.length > 0 ? `Design Rules (must follow): ${intel.visualDNA.designRules.slice(0, 4).join('; ')}` : '',
        intel.visualDNA?.designAvoid?.length > 0 ? `Design Avoid (NEVER do this): ${intel.visualDNA.designAvoid.slice(0, 4).join('; ')}` : '',
        '',
        vgSection,
        productContext,
        intel.brandType === 'product' && !mp ? `\n🧠 AGENTIC DECISION: No product was auto-matched. Decide: relate brief to a product category → pick from catalog at SUPPORTING level. Or if it's an occasion/greeting → brand-atmosphere visual, ambient product at most.` : '',
        !mp && intel.productCandidates?.length > 0 ? `\nCATALOG (pick ONLY if genuinely relevant):\n${intel.productCandidates.map(c => `• ${c.title}${c.category ? ` [${c.category}]` : ''}${c.images?.length > 0 ? ' 📸' : ''}`).join('\n')}` : '',
        marketIntelSection,
        state.diversityDirective ? `\n━━━ DIVERSITY DIRECTIVE ━━━\n${state.diversityDirective}` : '',
    ].filter(Boolean).join('\n');

    // ONE Claude Sonnet 4 call for all 4 roles — higher temp for creative variety
    const result = await agentUtils.callAgent(
        UNIFIED_CREATIVE_ENGINE_PROMPT(brandContext, state.aspectRatio, !!state.generateCopy, formatKey),
        userPrompt,
        0.82,
        4000,
        { provider: 'anthropic', model: 'claude-sonnet-4-20250514', timeoutMs: 120_000 }
    );
    console.log(`⚡ Unified Creative Engine done in ${Date.now() - startMs}ms (Claude Sonnet) — trend: ${result.designTrend?.split(' ')[0] || '?'} | copy: ${result.copyHeadline || 'none'}`);

    // Map result to state shape
    const copyResult = (state.generateCopy || formatKey === 'youtube-thumb' || formatKey === 'banner') && result.copyHeadline
        ? {
            headline: result.copyHeadline,
            subtext: result.copySubtext || null,
            ctaText: result.copyCta || null,
            textStyle: result.copyTextStyle || '',
            designRationale: result.engineeringNotes || '',
        }
        : null;

    return {
        ...state,
        artDirection: {
            mood: result.mood,
            visualStyle: result.visualStyle,
            designTrend: result.designTrend,
            productIntegration: result.productIntegration,
            composition: result.composition,
            lightingDirection: result.lightingDirection,
            scrollStopFactor: result.scrollStopFactor,
            suggestedHeadline: result.copyHeadline || null,
            negativePrompt: result.negativePrompt,
            engineeringNotes: result.engineeringNotes,
        },
        engineeredPrompt: {
            primaryPrompt: result.primaryPrompt,
            negativePrompt: result.negativePrompt,
            styleModifiers: result.styleModifiers,
            engineeringNotes: result.engineeringNotes,
        },
        copy: copyResult,
        status: 'creative-direction',
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// MCoT NODE: VISUAL GROUNDING — Analyze product/brand images BEFORE generation

// Stage 1: The AI "sees" real images and produces a detailed visual rationale
// that prevents product hallucination in downstream prompt engineering
// ══════════════════════════════════════════════════════════════════════════════
export async function visualGroundingNode(state) {
    console.log('🧠 MCoT: Visual Grounding — analyzing product/brand images...');
    const startMs = Date.now();

    // ⚡ OPT 2: Early-exit for occasion/greeting posts with no product — saves 3-8s
    const briefLower = (state.brief || '').toLowerCase();
    const isOccasion = /\b(happy|merry|eid|diwali|holi|christmas|new year|birthday|valentine|navratri|sale|offer|discount|greet|wish|celebrate)\b/.test(briefLower);
    const mp = state.matchedProduct;
    if (isOccasion && !mp && (!state.refImageUrls || state.refImageUrls.length === 0)) {
        console.log('⚡ MCoT: Occasion/greeting post with no product — skipping visual grounding');
        return { ...state, visualGrounding: null, status: 'visual-grounding-skipped' };
    }

    // Collect all available images for analysis
    const intel = state.brandIntel || {};
    const imagesToAnalyze = [];

    // Priority 0: Explicit reference images from prompt/skill payload (highest signal)
    if (state.refImageUrls?.length > 0) {
        imagesToAnalyze.push(...state.refImageUrls.slice(0, 3));
    }

    // Priority 1: Matched product images (most important for anti-hallucination)
    if (mp?.images?.length > 0) {
        imagesToAnalyze.push(...mp.images.slice(0, 3));
    }

    // Priority 2: Competitor style reference images
    if (intel.competitorImages?.length > 0 && imagesToAnalyze.length < 5) {
        const remaining = 5 - imagesToAnalyze.length;
        const competitorSlice = intel.competitorImages.slice(0, Math.min(3, remaining));
        imagesToAnalyze.push(...competitorSlice);
    }

    // Priority 3: Brand DNA images (for style grounding)
    if (intel.matchedDnaImages?.length > 0 && imagesToAnalyze.length < 5) {
        const remaining = 5 - imagesToAnalyze.length;
        imagesToAnalyze.push(...intel.matchedDnaImages.slice(0, remaining));
    }

    // Priority 4: General brand images (fallback for brand aesthetic)
    if (intel.brandImages?.length > 0 && imagesToAnalyze.length < 5) {
        const remaining = 5 - imagesToAnalyze.length;
        const nonDuplicates = intel.brandImages.filter(url => !imagesToAnalyze.includes(url));
        imagesToAnalyze.push(...nonDuplicates.slice(0, remaining));
    }

    // Skip MCoT if no images available — fall through gracefully
    if (imagesToAnalyze.length === 0) {
        console.log('🧠 MCoT: No images available for visual grounding — skipping');
        return { ...state, visualGrounding: null, status: 'visual-grounding-skipped' };
    }

    // Build context prompt
    const userPrompt = [
        `CREATIVE BRIEF: ${state.brief}`,
        mp ? `TARGET PRODUCT: "${mp.title}"${mp.description ? ` — ${mp.description}` : ''}` : '',
        mp?.category ? `PRODUCT CATEGORY: ${mp.category}` : '',
        `BRAND: ${intel.name || 'Unknown'}`,
        intel.industry ? `INDUSTRY: ${intel.industry}` : '',
        `\nAnalyze the ${imagesToAnalyze.length} provided image(s) and produce your visual rationale.`,
        `These images show ${mp ? `the product "${mp.title}"` : "the brand's visual identity"}, and/or competitor/industry visual style references.`,
    ].filter(Boolean).join('\n');

    const result = await agentUtils.callMultimodalAgent(
        VISUAL_GROUNDING_PROMPT,
        userPrompt,
        imagesToAnalyze,
        { temperature: 0.2, maxTokens: 1024 } // Reduced from 4096 — grounding only needs color/material/shape (saves 3–10s)
    );

    // Handle MCoT failure gracefully — never block the pipeline
    if (result.error || result.skipped) {
        console.warn(`🧠 MCoT: Visual grounding failed (non-blocking): ${result.error}`);
        return { ...state, visualGrounding: null, status: 'visual-grounding-skipped' };
    }

    console.log(`🧠 MCoT: Visual grounding complete in ${Date.now() - startMs}ms — confidence: ${result.confidence || 'unknown'}`);
    console.log(`🧠 MCoT: Product analysis: ${(result.productAnalysis || '').substring(0, 120)}...`);

    return {
        ...state,
        visualGrounding: result,
        status: 'visual-grounding',
    };
}


// ══════════════════════════════════════════════════════════════════════════════
// MCoT NODE: POST-GENERATION CRITIC — Analyze the generated image quality
// Stage 2: Verifies the output matches the brief and product accuracy
// Returns a verdict (approved/improve/reject) with an optional improved prompt
// ══════════════════════════════════════════════════════════════════════════════
export async function postGenerationCriticNode(state) {
    console.log('🔎 MCoT: Post-Generation Critic — analyzing generated image...');
    const startMs = Date.now();

    const imageUrl = state.generatedImageUrl;
    if (!imageUrl) {
        console.warn('🔎 MCoT: No generated image URL provided — skipping critic');
        return { ...state, postGenCritique: null };
    }

    const intel = state.brandIntel || {};
    const mp = state.matchedProduct;
    const vg = state.visualGrounding;

    // Build comprehensive context for the critic
    const userPrompt = [
        `ORIGINAL CREATIVE BRIEF: ${state.brief}`,
        `GENERATED WITH PROMPT: ${(state.finalPrompt || '').substring(0, 500)}`,
        `TARGET FORMAT: ${state.format || 'instagram-post'}`,
        `BRAND: ${intel.name || 'Unknown'}${intel.industry ? ` (${intel.industry})` : ''}`,
        mp ? `EXPECTED PRODUCT: "${mp.title}"${mp.category ? ` [${mp.category}]` : ''}` : 'No specific product expected',
        mp?.description ? `PRODUCT DESCRIPTION: ${mp.description}` : '',
        // Inject visual grounding rationale for comparison
        vg?.productAnalysis ? `\nVISUAL GROUNDING REFERENCE (from real product photos):\n${vg.productAnalysis}` : '',
        vg?.colorPalette?.length > 0 ? `EXPECTED COLORS: ${vg.colorPalette.join(', ')}` : '',
        `\nAnalyze the generated image (provided) against these requirements. Score it honestly.`,
    ].filter(Boolean).join('\n');

    const result = await agentUtils.callMultimodalAgent(
        POST_GENERATION_CRITIC_PROMPT,
        userPrompt,
        [imageUrl], // Send the generated image for visual analysis
        { temperature: 0.2, maxTokens: 1024 } // Reduced: critic returns short JSON score/verdict, not essays
    );

    // Handle failure gracefully
    if (result.error || result.skipped) {
        console.warn(`🔎 MCoT: Post-gen critic failed (non-blocking): ${result.error}`);
        return { ...state, postGenCritique: null };
    }

    const score = result.overallScore || 0;
    const verdict = result.verdict || 'approved';
    console.log(`🔎 MCoT: Critique complete in ${Date.now() - startMs}ms — score: ${score}/100, verdict: ${verdict}`);
    if (result.issues?.length > 0) {
        console.log(`🔎 MCoT: Issues found: ${result.issues.join('; ')}`);
    }

    return {
        ...state,
        postGenCritique: result,
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
 * @param {boolean} params.generateCopy - If true, run Copywriter Agent in parallel
 * @param {function} params.onProgress - Optional callback: (step) => void, for live progress tracking
 * @returns {object} { finalPrompt, artDirection, engineeredPrompt, styleCritique, brandIntel, copy? }
 */
export async function runCreativePipeline(params) {
    const { brandId, brief, format, aspectRatio, style, imageModel, refImageUrls, mode = 'fast', generateCopy = false, customCopy = null, onProgress } = params;
    const pipelineStart = Date.now();
    const hasCustomCopy = customCopy?.headline || customCopy?.ctaText;
    console.log(`\n══════════ AGENTIC CREATIVE PIPELINE (${mode.toUpperCase()}${generateCopy ? ' + COPY' : ''}${hasCustomCopy ? ' [CUSTOM TEXT]' : ''}) ══════════`);

    const emit = (agent, message, status = 'working', detail = '') => {
        if (onProgress) onProgress({ agent, message, status, detail });
    };

    // ── Pre-load brandContext ONCE to avoid redundant DB queries in each node ──
    emit('brand-intel', 'Gathering brand intelligence...', 'working');
    // ⚡ PERF: loadBrandContext returns brand + products from Redis cache (5min TTL).
    // We pass them directly into state so brandIntelligenceNode skips redundant DB queries.
    const { brandContext, brand: loadedBrand, products: loadedProducts } = await agentUtils.loadBrandContext(brandId);

    let state = {
        brandId,
        brandContext,
        loadedBrand,    // ⚡ Pre-loaded — reused by brandIntelligenceNode to skip Brand.findById
        loadedProducts, // ⚡ Pre-loaded — reused by brandIntelligenceNode to skip Product.find
        brief,
        format: format || 'instagram-post',
        aspectRatio: aspectRatio || '1:1',
        style: style || '',
        imageModel: imageModel || 'nanobanana-2',
        refImageUrls: refImageUrls || [],
        generateCopy: !!generateCopy, // ⬅ Gate: controls whether headline text is baked into image prompt
    };

    // Node 0: Brand Intelligence (DB-only, ~50ms — now ~0ms on cache hit)
    state = await brandIntelligenceNode(state);
    
    // 💡 OVERRIDE: If the user provided custom reference images, DO NOT force a catalog product match!
    // This prevents the AI from hallucinating a Smartwatch when the user uploaded a Trimmer.
    if (state.refImageUrls && state.refImageUrls.length > 0) {
        if (state.matchedProduct) {
            console.log(`⚠️ User provided reference images. Overriding catalog match ("${state.matchedProduct.title}") to rely purely on Visual Grounding.`);
            state.matchedProduct = null;
        }
        if (state.brandIntel && state.brandIntel.productCandidates) {
            // Also clear catalog candidates so the AI doesn't randomly pick a catalog item when given user images!
            state.brandIntel.productCandidates = [];
            // Force brandType to brand so it doesn't try to force a product insertion from catalog
            if (state.brandIntel.brandType === 'product') {
                state.brandIntel.brandType = 'brand';
            }
        }
    }

    const productName = state.matchedProduct?.title || '';
    emit('brand-intel', productName ? `Matched product: ${productName}` : 'Brand context loaded', 'done', productName ? `Using "${productName}" as hero product` : '');

    // ── STEP 1: Fire intelligence tasks at t=0 simultaneously ──
    // Strategy: VG and MCP both start immediately. Creative Director awaits BOTH.
    // VG already gates the pipeline at 3-8s. MCP (max 6s) resolves within that window.
    // Net latency cost to critical path: 0ms.

    // Intelligence Task A: Visual Grounding (MCoT)
    const visualGroundingPromise = (async () => {
        emit('visual-grounding', 'Analyzing product visuals (MCoT)...', 'working');
        const updatedState = await visualGroundingNode(state);
        state.visualGrounding = updatedState.visualGrounding;
        if (state.visualGrounding) {
            emit('visual-grounding', `Visual analysis: ${state.visualGrounding.confidence || 'done'}`, 'done',
                state.visualGrounding.productAnalysis?.substring(0, 60) || '');
        } else {
            emit('visual-grounding', 'No product images — skipped', 'done');
        }
    })();

    // Intelligence Task B: MCP Market Intel — now properly awaited within the VG window
    // Previously this was fire-and-forget and always missed by the Creative Director.
    // Now: both tasks start at t=0, Creative Director reads both after they settle.
    const mcpPromise = mcpMarketIntelNode(state)
        .then(updatedState => {
            state.marketIntel = updatedState.marketIntel;
            if (state.marketIntel) {
                emit('market-intel', `📡 Live trends loaded`, 'done',
                    state.marketIntel.viralFormats?.substring(0, 50) || '');
            }
        })
        .catch(() => {
            state.marketIntel = null; // non-critical — pipeline continues without live trends
        });

    // Wait for BOTH intelligence tasks AND fingerprint directive before Creative Director starts
    // VG is typically the slower one (3-8s), so MCP and Fingerprint finish inside the VG window at zero cost.
    const [_, __, diversityDirective] = await Promise.all([
        visualGroundingPromise,
        mcpPromise,
        getEnvironmentDiversityDirective(brandId)
    ]);

    if (diversityDirective) {
        state.diversityDirective = diversityDirective;
        console.log(`[Nodes] Injected Fingerprint Directive into state`);
    }

    // Intelligence Task C: Creative Director — now has VG + MCP data fully available in state
    const nodePromises = [];
    let creativeVisionTask;

    if (mode === 'fast') {
        creativeVisionTask = (async () => {
            emit('art-director', 'Creative Engine crafting vision, prompt & copy...', 'working');
            const updatedState = await unifiedCreativeEngineNode(state);
            state.artDirection = updatedState.artDirection;
            state.engineeredPrompt = updatedState.engineeredPrompt;
            // In fast mode, copy comes from the unified node (not a separate copywriter call)
            if (updatedState.copy) {
                copyResult = updatedState.copy;
                emit('copywriter', `Copy ready: "${copyResult.headline || ''}"`, 'done');
            }
            emit('art-director', `Direction: ${state.artDirection?.mood || 'defined'}`, 'done',
                state.artDirection?.designTrend || state.artDirection?.visualStyle || '');
        })();
    } else {
        creativeVisionTask = (async () => {
            emit('art-director', 'Art Director crafting creative vision...', 'working');
            const updatedState = await artDirectorNode(state);
            state.artDirection = updatedState.artDirection;
            emit('art-director', `Creative direction: ${state.artDirection?.mood || 'defined'}`, 'done', state.artDirection?.visualStyle || '');
        })();
    }
    nodePromises.push(creativeVisionTask);

    // Promise 3: Copywriter — ONLY in quality mode (fast mode gets copy from unifiedCreativeEngineNode)
    let copyResult = null;
    if (generateCopy && mode !== 'fast') {
        const copywriterPromise = (async () => {
            if (hasCustomCopy) {
                copyResult = {
                    headline: customCopy.headline || '',
                    subtext: null,
                    ctaText: customCopy.ctaText || null,
                    textStyle: 'bold, high-contrast typography matching brand style',
                    designRationale: 'User-specified custom copy',
                };
                emit('copywriter', `Custom text: "${copyResult.headline}"`, 'done');
            } else {
                emit('copywriter', 'Copywriter crafting brand copy...', 'working');
                try {
                    const copyState = await copywriterNode(state);
                    copyResult = copyState.copy || null;
                    if (copyResult) {
                        emit('copywriter', `Copy ready: "${copyResult.headline || ''}"`, 'done');
                    }
                } catch (err) {
                    console.warn('✍️  Copywriter failed (non-critical):', err.message);
                    emit('copywriter', 'Copy generation skipped', 'done');
                }
            }
        })();
        nodePromises.push(copywriterPromise);
    }

    // Promise 4: Pre-download reference images for cache (avoids redundant downloads in routedImageGenerate)
    // Runs in parallel with all other tasks — near-zero added latency
    const refUrls = (state.refImageUrls || []).filter(u => u && u.startsWith('http'));
    if (refUrls.length > 0) {
        const imagePredownloadTask = (async () => {
            emit('predownload', `Pre-caching ${refUrls.length} reference image(s)...`, 'working');
            const downloadStartMs = Date.now();
            await Promise.all(refUrls.map(async (url) => {
                // Skip if already cached
                if (getCachedImageBuffer(url)) return;
                try {
                    // Pre-sign private S3 URLs before downloading
                    let fetchUrl = url;
                    const isOurS3 = url.includes('amazonaws.com') && (url.includes('mantram-assets') || url.includes('mantram-media'));
                    if (isOurS3 && !url.includes('X-Amz-Signature')) {
                        try {
                            fetchUrl = await getSignedUrlForPath(url, 300);
                        } catch (e) {
                            // Non-critical — continue with unsigned URL
                        }
                    }
                    const resp = await fetch(fetchUrl, {
                        headers: { 'User-Agent': 'Mozilla/5.0 (Mantram AI Backend)' },
                        signal: AbortSignal.timeout(5000), // ⚡ 5s (was 8s)
                    });
                    if (resp && resp.ok) {
                        const rawBuf = await resp.arrayBuffer();
                        const ct = resp.headers.get('content-type') || 'image/jpeg';
                        const origKB = Math.round(rawBuf.byteLength / 1024);
                        // Resize to 1024px max — matches routedImageGenerate compression.
                        // Preserves product labels, textures, and fine details for Gemini.
                        let finalBuf = Buffer.from(rawBuf);
                        let finalMime = ct;
                        try {
                            const sharp = (await import('sharp')).default;
                            finalBuf = await sharp(finalBuf).resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
                            finalMime = 'image/jpeg';
                        } catch (_) { /* compression failed — use original */ }
                        const b64Data = finalBuf.toString('base64');
                        setCachedImageBuffer(url, b64Data, finalMime);
                        console.log(`⚡ Pre-cached ref: ${origKB}KB → ${Math.round(finalBuf.byteLength / 1024)}KB (${url.substring(0, 60)}...)`);
                    }
                } catch (e) {
                    // Non-critical — routedImageGenerate will download as fallback
                    console.warn(`⚠️ Ref image pre-download skipped: ${e.message}`);
                }
            }));
            emit('predownload', `Reference images cached (${Date.now() - downloadStartMs}ms)`, 'done');
        })();
        nodePromises.push(imagePredownloadTask);
    }

    // Wait for the parallel initial block to finish (critical agents only)
    await Promise.all(nodePromises);

    // ── STEP 2: Sequential Refinement (Quality Mode Only) ──
    if (mode !== 'fast') {
        emit('prompt-engineer', 'Prompt Engineer optimizing for image model...', 'working');
        state = await promptEngineerNode(state); // Now state has artDirection from parallel step
        emit('prompt-engineer', 'Prompt optimized for maximum quality', 'done');

        emit('style-critic', 'Style Critic reviewing brand alignment...', 'working');
        state = await styleCriticNode(state);
        emit('style-critic', 'Brand alignment verified', 'done');
    }

    // ── STEP 3: Finalize Prompt — Visual Grounding FIRST, then main prompt, then copy ──
    // Grounding is front-loaded so the image model reads WHAT to generate before HOW to style it.
    const mainPrompt = mode === 'fast'
        ? (state.engineeredPrompt?.primaryPrompt || brief)
        : (state.styleCritique?.improvedPrompt || state.engineeredPrompt?.primaryPrompt || brief);

    // Visual Grounding injected FIRST (not at end) — image model reads this before creative direction
    if (state.visualGrounding?.generationGuidance) {
        const vg = state.visualGrounding;
        const groundingPrefix = [
            `VISUAL GROUND TRUTH (from real product/brand photos — RESPECT THIS ABOVE ALL ELSE):`,
            vg.productAnalysis ? `Product appearance: ${vg.productAnalysis}` : '',
            vg.colorPalette?.length > 0 ? `Accurate product colours: ${vg.colorPalette.join(', ')}` : '',
            vg.materialFinish ? `Material / finish: ${vg.materialFinish}` : '',
            vg.generationGuidance ? `CRITICAL: ${vg.generationGuidance}` : '',
            vg.avoidList?.length > 0 ? `DO NOT SHOW: ${vg.avoidList.join('; ')}` : '',
            ``,
        ].filter(Boolean).join('\n');
        state.finalPrompt = groundingPrefix + mainPrompt;
        console.log(`🧠 MCoT: Visual grounding injected at START of final prompt`);
    } else {
        state.finalPrompt = mainPrompt;
    }

    // Inject Copy Rendering instructions
    if (copyResult) {
        const brandTypographyStyle = state.brandIntel?.visualDNA?.typographyStyle || null;
        const copyInjection = buildCopyInjection(copyResult, state.aspectRatio, brandTypographyStyle);
        if (copyInjection) {
            state.finalPrompt = state.finalPrompt + '\n\n' + copyInjection;
        }
    }


    const totalMs = Date.now() - pipelineStart;
    console.log(`══════════ PIPELINE COMPLETE (${totalMs}ms)${copyResult ? ' — copy included & injected' : ''} ══════════\n`);

    return {
        finalPrompt: state.finalPrompt || state.engineeredPrompt?.primaryPrompt || brief,
        artDirection: state.artDirection,
        engineeredPrompt: state.engineeredPrompt,
        styleCritique: state.styleCritique || null,
        brandIntel: state.brandIntel,
        matchedProduct: state.matchedProduct || null,
        visualGrounding: state.visualGrounding || null,
        copy: copyResult || null,
        pipelineTimeMs: totalMs,
        mode,
    };
}


/**
 * Build copy injection text for the image prompt.
 * Instructs the image model to render headline text on the image, using brand-specific typography.
 * @param {object} copy - Copy object with headline, subtext, ctaText, textStyle
 * @param {string} aspectRatio - e.g. '1:1', '9:16', '16:9'
 * @param {string|null} brandTypographyStyle - From Brand DNA visualDNA.typographyStyle
 */
function buildCopyInjection(copy, aspectRatio = '1:1', brandTypographyStyle = null) {
    if (!copy?.headline) return '';

    const parts = [];

    // ── Typography resolution — brand-specific → copy.textStyle → 2026 default ──
    // Build a rich, specific typography instruction instead of a vague "bold, clean" fallback.
    // Image models interpret "LARGE, BOLD, DOMINANT" as "fill the whole canvas" — so we
    // must be explicit about proportions, weight vocabulary, and size relationships.
    let typographyInstruction;
    if (brandTypographyStyle) {
        // Brand has a defined typography personality — translate it to visual instructions
        const bt = brandTypographyStyle.toLowerCase();
        if (bt.includes('bold') || bt.includes('impact') || bt.includes('display') || bt.includes('heavy')) {
            typographyInstruction = `Typography: ultra-heavy weight (900/Black), tight tracking, geometric construction, maximum weight contrast. Font weight: Black/ExtraBlack. Color: white or brand primary on dark scrim.`;
        } else if (bt.includes('serif') || bt.includes('elegant') || bt.includes('luxury') || bt.includes('editorial')) {
            typographyInstruction = `Typography: refined high-contrast serif, fine strokes, classical proportions, generous letter-spacing. Font weight: Regular or SemiBold. Color: cream, gold, or ivory on deep dark background.`;
        } else if (bt.includes('geometric') || bt.includes('tech') || bt.includes('minimal') || bt.includes('clean')) {
            typographyInstruction = `Typography: precise geometric sans-serif, clinical spacing, medium weight, cold color. Font weight: Medium (500). Color: electric white or cyan on near-black.`;
        } else if (bt.includes('handwritten') || bt.includes('casual') || bt.includes('organic') || bt.includes('warm')) {
            typographyInstruction = `Typography: organic humanist sans or brushstroke display, slightly irregular baseline, warm weight distribution. Font weight: Bold but not mechanical. Color: warm off-white or brand accent.`;
        } else {
            typographyInstruction = `Typography matching brand personality "${brandTypographyStyle}": use appropriate font weight (600-800), clean rendering, color that contrasts with background.`;
        }
    } else if (copy.textStyle) {
        typographyInstruction = `TYPOGRAPHY STYLE: ${copy.textStyle}`;
    } else {
        // 2026 safe default — specific enough to prevent generic AI output
        typographyInstruction = `Typography: clean geometric sans-serif, Bold weight (700), white or near-white color on dark semi-transparent scrim behind the text for legibility.`;
    }

    // ── Size constraint vocabulary (the #1 fix for full-screen text) ──
    // Image models MUST have explicit proportional constraints or they fill the canvas.
    const [w, h] = (aspectRatio || '1:1').split(':').map(Number);
    const ratio = (w || 1) / (h || 1);
    let headlineSizeRule, safeZoneRule;

    if (ratio > 2.5) { // Ultra-wide banner
        headlineSizeRule = `The headline occupies approximately 25-35% of canvas WIDTH and a single line of text is roughly 12-16% of canvas HEIGHT. Maximum 1 line of text.`;
        safeZoneRule = `SAFE ZONE (ULTRA-WIDE BANNER): Text sits between 30-70% of canvas HEIGHT and 5-50% of canvas WIDTH (left half). Subject fills right half.`;
    } else if (ratio > 1.3) { // 16:9 horizontal
        headlineSizeRule = `The headline occupies approximately 40-55% of canvas WIDTH. A single line of text is roughly 10-14% of canvas HEIGHT. Maximum 2 lines.`;
        safeZoneRule = `SAFE ZONE (WIDE FORMAT): Text centroid between 20-80% of canvas height AND 15-85% of canvas width. 20% minimum empty margin from all edges.`;
    } else if (ratio < 0.7) { // 9:16 vertical
        headlineSizeRule = `The headline occupies approximately 60-75% of canvas WIDTH. A single line of text is roughly 8-11% of canvas HEIGHT. Maximum 2-3 lines.`;
        safeZoneRule = `SAFE ZONE (TALL FORMAT): Text centroid between 15-85% of canvas height AND 10-90% of canvas width. 15% minimum padding left/right.`;
    } else { // Square 1:1
        headlineSizeRule = `The headline occupies approximately 50-65% of canvas WIDTH. A single line of text is roughly 9-13% of canvas HEIGHT. Maximum 2 lines.`;
        safeZoneRule = `SAFE ZONE (SQUARE FORMAT): Text centroid inside inner 70% of canvas width AND height. 15% minimum padding from all four edges.`;
    }

    // Primary headline — with explicit size constraints
    parts.push(`TEXT ON IMAGE — HEADLINE: Render "${copy.headline}" as the primary typographic element. ${headlineSizeRule} ${typographyInstruction} The text must complement the visual composition — NOT fill or dominate the entire canvas. Leave the majority of the canvas for the product/visual scene.`);

    // Supporting subtext — must be clearly smaller than headline
    if (copy.subtext) {
        parts.push(`TEXT ON IMAGE — SUBTEXT: Below the headline, render "${copy.subtext}" at 45-55% of the headline's font size, lighter weight (400-500), same color family. It supports the headline; it must not compete visually with it.`);
    }

    // CTA — distinct from both headline and subtext
    if (copy.ctaText) {
        parts.push(`TEXT ON IMAGE — CTA: A pill/button/badge with text "${copy.ctaText}" in a high-contrast accent color. Approximately 55-65% of headline font size, bold weight (700). Positioned at bottom-third, clearly separated from headline and subtext.`);
    }

    parts.push(safeZoneRule);
    parts.push(`HORIZONTAL CROP PREVENTION: Minimum 15% empty horizontal margin on BOTH left and right sides. First and last letters of each line must never be near canvas edges.`);
    parts.push(`COMPOSITION HIERARCHY: The IMAGE (product/scene/environment) is the primary visual element — the TEXT is a secondary design element layered on top. Never let text fill more than 35% of the canvas area total.`);

    // Precise safe-zone rules per aspect ratio (replaces vague 'don't go to edges')
    const isUltraWide = ratio > 2.5; // 16:5 banner, 3:1, 21:9
    const isWide = ratio > 1.6 && !isUltraWide; // 16:9, 4:3
    const isTall = ratio < 0.7;  // 9:16, 2:3, 4:5

    if (isUltraWide) {
        parts.push(`SAFE ZONE (CRITICAL — ULTRA-WIDE BANNER ${aspectRatio}): This canvas is an extremely short, wide horizontal strip. Text MUST sit between 30% and 70% of image HEIGHT (top/bottom 30% crop on web). Text must sit between 5% and 50% of image WIDTH — place text in the LEFT HALF, subject in the right half (or vice versa). NEVER center text across the full width.`);
    } else if (isWide) {
        parts.push(`SAFE ZONE (CRITICAL — WIDE FORMAT ${aspectRatio}): Text centroid MUST sit between 20% and 80% of image height AND 20% and 80% of image width. Minimum 20% empty margin from all four edges. Wide-ratio images are MOST PRONE to vertical cropping.`);
    } else if (isTall) {
        parts.push(`SAFE ZONE (CRITICAL — TALL FORMAT ${aspectRatio}): Text centroid MUST sit between 15% and 85% of image width AND height. Minimum 15% empty margin from left/right. Keep all text within central 70% of width.`);
    } else {
        parts.push(`SAFE ZONE (CRITICAL — SQUARE/BALANCED FORMAT ${aspectRatio}): Text centroid MUST sit inside inner 76% of canvas width AND height. Minimum 12% empty padding from ALL four edges.`);
    }

    parts.push(`HORIZONTAL LETTER-CROP PREVENTION: Leave at least 15% empty horizontal padding on the left side AND right side. The first letter of the first word and last letter of the last word must NOT be near the canvas edge. This is the most common failure mode — prevent it explicitly.`);

    return `
═══ CRITICAL TEXT RENDERING INSTRUCTIONS ═══
${parts.join('\n')}
IMPORTANT: These text elements MUST be physically rendered as real, readable typography ON the image — not as decoration, not as a pattern. Use clean, legible fonts. The HEADLINE must be clearly readable at thumbnail size. Do NOT skip or omit any text element listed above.
═══════════════════════════════════════════`;
}

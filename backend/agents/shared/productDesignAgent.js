/**
 * productDesignAgent.js — Product Design Intelligence (PDI) Layer
 *
 * Architecture:
 *  1. analyzeProductDesign    — MCoT Gemini vision: extracts colors, materials, shape, mood
 *  2. generateMoodBoardImages — NanoBanana 2: 4 style-direction mood images (parallel)
 *  3. buildColorGuardInstruction — generates the per-prompt color lock block
 *  4. buildDesignDirective    — synthesizes the full creative brief for downstream generators
 *
 * All generators (A+, Deck, Email, Page) consume the output of this agent.
 */

import { callMultimodalAgent, callAgent } from './agentUtils.js';
import { laozhangImageGenerate } from '../videoStudio/laozhangClient.js';

// ── Fallback Mood Directions (used during loading / when AI generation fails) ──
// These are intentionally generic. The real moods are AI-generated per product.
const FALLBACK_MOOD_DIRECTIONS = {
    editorial: {
        id: 'editorial', label: 'Editorial Clean', icon: 'straighten',
        description: 'Clean, precise, professional — magazine-grade studio perfection',
        shootDirective: 'Pure white or very light grey background, soft even front-fill lighting, product perfectly centered with crisp drop shadow. Think: Apple.com, Muji catalogue.',
    },
    bold: {
        id: 'bold', label: 'Bold Ambient', icon: 'local_fire_department',
        description: 'Dramatic, moody, powerful — dark environments with cinematic rim light',
        shootDirective: 'Very dark background, dramatic directional rim lighting from behind, high contrast, cinematic quality. Think: PlayStation, Bang & Olufsen.',
    },
    lifestyle: {
        id: 'lifestyle', label: 'Lifestyle Vibrant', icon: 'wb_sunny',
        description: 'Real-world, human, contextual — aspirational but relatable',
        shootDirective: 'Real-world environment for how the product is used, natural warm light, human element implied. Think: Glossier, Away Luggage.',
    },
    luxury: {
        id: 'luxury', label: 'Premium Minimal', icon: 'diamond',
        description: 'Ultra-premium, spacious, sophisticated — luxury goods treatment',
        shootDirective: 'Extreme negative space, luxury surface textures as backgrounds, single dramatic key light. Think: Bottega Veneta, Aesop.',
    },
};

export { FALLBACK_MOOD_DIRECTIONS as MOOD_DIRECTIONS };

// ── Step 0: Generate Product-Specific Mood Directions via Claude ───────────────
/**
 * Uses Claude to generate 4 custom mood directions specific to THIS product.
 * Real designers don't use the same 4 moods for every product — they invent
 * creative territories that feel native to the product's world.
 *
 * @param {object} productDNA   - Output from analyzeProductDesign
 * @param {object} productData  - Scraped product data (title, category, bullets)
 * @param {string} brandContext - Brand DNA string
 * @returns {object} moodDirections map keyed by id (same shape as FALLBACK_MOOD_DIRECTIONS)
 */
export async function generateProductMoodDirections(productDNA, productData = {}, brandContext = '') {
    console.log(`PDI: Generating product-specific mood directions via Claude...`);

    const productSummary = [
        `Product: ${productDNA.productCategory || productData?.title || 'consumer product'}`,
        `Materials: ${productDNA.materials || 'premium finish'}`,
        `Form factor: ${productDNA.productShape || 'compact'}`,
        `Surface finish: ${productDNA.surfaceFinish || 'refined'}`,
        `Design mood tags: ${(productDNA.moodTags || []).join(', ')}`,
        `Design directive: ${productDNA.designDirective || ''}`,
        `Key features: ${(productData?.bulletPoints || []).slice(0, 4).join(' | ')}`,
        `Target use: ${productData?.description?.substring(0, 200) || ''}`,
        brandContext ? `Brand context: ${brandContext.substring(0, 150).replace(/\\n/g, ' ')}` : '',
    ].filter(Boolean).join('\n');

    const systemPrompt = `You are the world's best senior art director and creative strategist at a top creative agency (think Wieden+Kennedy, R/GA).
You create product mood boards for a living. You NEVER use the same creative territories for every product.
You invent evocative, SPECIFIC creative directions that feel native to each product's world.

Rules for mood direction naming:
- Names must be evocative and specific to THIS product (NOT generic like "Bold Ambient" or "Editorial Clean")
- Think of names like a photographer or art director would: "Golden Hour Glow", "Urban Kinetic", "Brutal Minimal", "Sunday Morning Ritual"
- Each direction must feel like a completely different WORLD that this specific product could live in
- The description should describe the emotional territory and consumer moment, not just visual adjectives

Return ONLY valid JSON, no markdown.`;

    const userPrompt = `PRODUCT PROFILE:
${productSummary}

Generate 4 creative mood directions for this specific product. Each direction is a distinct emotional/visual territory.

Return this exact JSON structure:
{
  "directions": [
    {
      "id": "unique_snake_case_id",
      "label": "Evocative 2-3 Word Name (e.g. 'Golden Hour Glow')",
      "description": "One sentence describing the consumer MOMENT and emotional territory (not just visual adjectives). E.g.: 'For the early riser finding peace before the world wakes up.'",
      "targetMoment": "The specific human moment / use context: where, when, who. Max 15 words.",
      "shootDirective": "Precise photography/image direction for this territory. What background, lighting, environment, atmosphere? Reference real brands or photographers.",
      "moodBoardDirective": "Detailed art direction for the mood board collage for this territory. What specific scenes, textures, colors, environments should appear?",
      "colorPalette": ["a suggested hex code for the mood tone (background/accent, NOT the product itself)", "second hex"],
      "icon": "a single material-symbols icon name that represents this mood"
    }
  ]
}

Make directions feel like they come from a REAL agency creative brief for this specific product. Be evocative, specific, unexpected. 4 directions that together cover the full emotional range of this product's potential consumer universe.`;

    try {
        const result = await callAgent(systemPrompt, userPrompt, 0.85, 2000, {
            provider: 'anthropic',
            model: 'claude-sonnet-4-6',
            timeoutMs: 30000,
        });

        if (result?.directions?.length >= 2) {
            // Convert array to keyed map
            const moodMap = {};
            result.directions.slice(0, 4).forEach((d, i) => {
                const id = d.id || `mood_${i}`;
                moodMap[id] = { ...d, id };
            });
            console.log(`   PDI: Generated ${Object.keys(moodMap).length} product-specific moods:`, Object.keys(moodMap).map(k => moodMap[k].label).join(', '));
            return moodMap;
        }
    } catch (err) {
        console.warn(`   PDI: Mood direction generation failed: ${err.message}`);
    }

    // Fallback to generic directions
    return FALLBACK_MOOD_DIRECTIONS;
}

// ── Step 1a: Per-Image Classification ─────────────────────────────────
/**
 * Quick per-image Gemini vision call — identifies what each image shows
 * and which A+ module type it's best suited for. Runs in parallel.
 */
async function classifyProductImageView(imageUrl) {
    const systemPrompt = `You are a product photography expert and Amazon listing consultant.
Analyze this SINGLE product image and classify it precisely.

CRITICAL FORM-FACTOR DISAMBIGUATION RULES — APPLY THESE STRICTLY:
- HEADPHONES: Has ear-cups, headband, goes OVER the ear. Correct term: "Over-ear headphones" or "On-ear headphones". NEVER call these earphones, earbuds, or in-ear.
- EARPHONES/EARBUDS: Has ear-tips, goes IN the ear canal, no headband. Correct term: "In-ear earphones" or "True wireless earbuds". NEVER call these headphones.
- IEM: In-ear monitor — larger ear-tip design. Still NOT headphones.
- NECKBAND: Neckband wireless earphones — has a neck cable+ear-tips. NOT headphones.
- LAPTOP vs TABLET: check hinge/keyboard. Laptop has keyboard attached. Tablet is standalone screen.
- MUG vs TUMBLER vs BOTTLE: Mug has handle. Tumbler is tall cylindrical no-handle. Bottle has cap.
- WATCH vs FITNESS BAND: Watch has round/square dial face. Band is thin strip.
Apply these rules before classifying. If you see ear-cups and a headband, it IS a headphone, period.

Return ONLY a valid JSON object, no markdown, no extra text.`;

    const userPrompt = `Classify this product image precisely:
{
  "viewType": "hero|front_face|back_panel|open_case|in_use|macro_detail|packaging|variant_color|lifestyle|flat_lay|group_shot|side_profile|angle_shot",
  "shortDescription": "1 sentence: exactly what is visible in this specific image",
  "exactFormFactor": "CRITICAL: Identify EXACT product type and scale (e.g., 'over-ear headphone' vs 'in-ear earphone', 'mug' vs 'tumbler', 'laptop' vs 'tablet'). Apply the disambiguation rules from system prompt. DO NOT generalize.",
  "primaryColors": ["#hexcode of 2-3 most prominent colors actually visible in this image"],
  "materialsVisible": ["specific materials visible e.g. soft-touch matte plastic, brushed aluminum, silicone eartip"],
  "lightingStyle": "studio_clean|lifestyle_ambient|dark_dramatic|bright_airy|natural_outdoor",
  "usageFor": "hero_banner|feature_closeup|lifestyle_usage|comparison|brand_story|texture_detail",
  "productStateShown": "closed|open|in_use|assembled|disassembled|packaged|bare|with_accessories",
  "isHighConfidence": true or false (false if image is blurry, cluttered, or hard to analyze),
  "confidenceScore": 0.0 to 1.0
}`;

    try {
        const result = await callMultimodalAgent(systemPrompt, userPrompt, [imageUrl], {
            temperature: 0.1,
            maxTokens: 500,
        });
        return { url: imageUrl, ...result };
    } catch (err) {
        console.warn(`   PDI Stage-1: classify failed for image: ${err.message}`);
        return { url: imageUrl, viewType: 'unknown', usageFor: 'general', confidenceScore: 0.3, shortDescription: 'Classification failed' };
    }
}

// ── Step 1b: Composite DNA Synthesis ──────────────────────────────────
/**
 * Synthesize all per-image classifications into one composite ProductDNA.
 * Has visibility of ALL images simultaneously to resolve color conflicts.
 */
async function synthesizeProductDNA(roster, allImages, productData, brief) {
    const rosterSummary = roster.map((r, i) =>
        `Image ${i+1} [${r.viewType}]: ${r.shortDescription}. Colors: ${(r.primaryColors || []).join(', ')}. Materials: ${(r.materialsVisible || []).join(', ')}. Best for: ${r.usageFor}. Confidence: ${r.confidenceScore}`
    ).join('\n');

    const systemPrompt = `You are a world-class art director and product design analyst performing composite analysis across multiple product images.
You have already classified each image individually (see roster below). Now synthesize a complete ProductDNA.
Return ONLY a valid JSON object, no markdown, no extra text.`;

    const productTitle = productData?.title || 'Unknown product';
    const bullets = (productData?.bulletPoints || []).join(' | ');
    const userPrompt = `PRODUCT TITLE (ground truth): "${productTitle}"
PRODUCT CATEGORY (from listing): ${productData?.category || 'unknown'}
BULLET POINTS: ${bullets}
BRIEF: ${brief || 'General marketing content'}

PER-IMAGE CLASSIFICATION ROSTER:
${rosterSummary}

All ${allImages.length} product images are shown. Cross-reference them to identify TRUE product colors (consistent across views, not shadows/backgrounds).

CLASSIFICATION GROUND RULES:
1. The product title "${productTitle}" is the SINGLE MOST IMPORTANT signal for productCategory. Start there.
2. Use the images to CONFIRM and REFINE the category — never override a clear title signal with image speculation.
3. Only apply audio-device disambiguation if the title OR images explicitly show audio hardware:
   - If the title says "headphone" or images show large over-ear cups + headband → "Over-ear Headphones"
   - If the title says "earphone/earbud" or images show in-ear tips → "In-ear Earphones"
   - For ALL other products: classify based on what the title and images actually show (skincare, footwear, furniture, phone, etc.)
4. productCategory must be a specific, readable product name that a consumer would use (NOT a technical code or generic label like "consumer product").

Return the composite ProductDNA:
{
  "dominantColors": [
    {
      "hex": "#exact hex — must be CONSISTENT across multiple image views, not a shadow/background color",
      "name": "Signal Red | Cobalt Blue | etc",
      "role": "product_primary | product_secondary | product_body | product_accent | background_suggestion",
      "colorGuardInstruction": "This color is [hex]. NOT [similar misinterpretation]. Do NOT change.",
      "rgbRange": "R:200-220, G:30-50, B:30-50",
      "appearsInImages": [1, 2, 3]
    }
  ],
  "backgroundSuggestions": ["#hex (reason)", "#hex", "#hex"],
  "materials": "Precise composite material description across all views",
  "productShape": "Shape character — angular/rounded/organic/cylindrical/compact/elongated",
  "productCategory": "The exact product type — derived primarily from the title '${productTitle}'. Specific, consumer-readable (e.g. 'Daily Moisturiser', 'Trail Running Shoes', 'Wireless Headphones', 'Oak Coffee Table')",
  "moodTags": ["3-5 mood tags matching the product's character and lifestyle context"],
  "defaultMoodDirection": "editorial | bold | lifestyle | luxury",
  "photographyStyle": "Recommended photography style based on what works best across all views",
  "lightingRecommendation": "Specific lighting setup recommended",
  "surfaceFinish": "matte | glossy | satin | textured | transparent | metallic",
  "colorDriftRisk": "low | medium | high",
  "designDirective": "2-sentence creative brief describing the product visual identity across all angles.",
  "heroViewIndex": 0-based index of the best hero/showcase image from the roster,
  "lifestyleViewIndex": 0-based index of the best lifestyle/in-use image, or null if none,
  "detailViewIndex": 0-based index of the best macro/detail image, or null if none,
  "productStateNotes": "key observation about how different product states (open/closed/in-use) affect the visual — useful for module image selection"
}`;

    try {
        return await callMultimodalAgent(systemPrompt, userPrompt, allImages, {
            temperature: 0.2,
            maxTokens: 2500,
        });
    } catch (err) {
        console.warn(`   PDI Stage-2 synthesis failed: ${err.message}`);
        return null;
    }
}

// ── Step 1: Analyze Product → ProductDNA (Two-Stage Agentic Pipeline) ─────────
/**
 * Stage 1: Classify each product image individually (parallel)
 * Stage 2: Synthesize all classifications into composite ProductDNA
 *
 * This approach correctly handles products with multiple distinct states
 * (e.g. earbuds: case closed, case open, in-use, macro detail) by identifying
 * which image shows which aspect and assigning them to appropriate module types.
 *
 * @param {string[]} productImages - Array of product image URLs
 * @param {object}   productData   - Scraped product data
 * @param {string}   brief         - User's generation brief
 * @returns {ProductDNA}
 */
export async function analyzeProductDesign(productImages = [], productData = {}, brief = '') {
    console.log(`PDI: Two-stage product analysis — ${productImages.length} images...`);

    if (!productImages.length) {
        return buildFallbackProductDNA(productData, brief);
    }

    // ── Stage 1: Classify each image individually (parallel) ──────────────────
    console.log(`   PDI Stage-1: Classifying ${productImages.length} images in parallel...`);
    const classifyResults = await Promise.allSettled(
        productImages.map(url => classifyProductImageView(url))
    );

    const roster = classifyResults.map((r, i) => {
        if (r.status === 'fulfilled') return r.value;
        return { url: productImages[i], viewType: 'unknown', usageFor: 'general', confidenceScore: 0.3, shortDescription: 'Analysis failed' };
    }).sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0));

    roster.forEach((r, i) => console.log(`   PDI Stage-1 [${i+1}]: ${r.viewType} — ${r.shortDescription} (conf: ${r.confidenceScore})`));

    // ── Stage 2: Composite DNA Synthesis (all images + roster) ───────────────
    console.log(`   PDI Stage-2: Synthesizing composite DNA from ${productImages.length} views...`);
    const dna = await synthesizeProductDNA(roster, productImages, productData, brief);

    if (dna?.dominantColors?.length) {
        console.log(`   PDI: Extracted ${dna.dominantColors.length} colors, mood: ${dna.defaultMoodDirection}`);
        console.log(`   PDI: Hero view: ${dna.heroViewIndex ?? 0} | Lifestyle: ${dna.lifestyleViewIndex ?? 'none'} | Detail: ${dna.detailViewIndex ?? 'none'}`);

        // Resolve image URLs from roster indices
        const heroUrl = roster[dna.heroViewIndex ?? 0]?.url || productImages[0];
        const lifestyleUrl = dna.lifestyleViewIndex != null ? roster[dna.lifestyleViewIndex]?.url : null;
        const detailUrl = dna.detailViewIndex != null ? roster[dna.detailViewIndex]?.url : null;

        // Build the image roster with resolved URLs for downstream builders
        dna.productImageRoster = roster;
        dna.heroImageUrl = heroUrl;
        dna.lifestyleImageUrl = lifestyleUrl;
        dna.detailImageUrl = detailUrl;

        // productRefImages: 3 most diverse images (hero + lifestyle + detail, then fill with high-confidence)
        const diverseSet = [heroUrl, lifestyleUrl, detailUrl].filter(Boolean);
        const remaining = roster
            .filter(r => !diverseSet.includes(r.url) && r.confidenceScore > 0.4)
            .map(r => r.url);
        dna.productRefImages = [...new Set([...diverseSet, ...remaining])].slice(0, 4);

        dna.analyzedAt = new Date().toISOString();
        dna.analysisStages = { imagesClassified: productImages.length, rosterSize: roster.length };
        return dna;
    }

    console.warn(`   PDI: Synthesis returned no colors — falling back to single-pass analysis`);

    // Last resort: single-pass with all images (original behaviour)
    try {
        const result = await callMultimodalAgent(
            `You are a product design analyst. Analyze product images and extract visual DNA. Return ONLY valid JSON, no markdown.`,
            `Product: ${productData?.title || 'Unknown'}\nBrief: ${brief}\nExtract dominantColors (with hex, name, role, colorGuardInstruction), materials, productShape, productCategory, moodTags, defaultMoodDirection, photographyStyle, lightingRecommendation, surfaceFinish, colorDriftRisk, designDirective.`,
            productImages,
            { temperature: 0.2, maxTokens: 2000 }
        );
        if (result?.dominantColors?.length) {
            result.productRefImages = productImages.slice(0, 3);
            result.productImageRoster = roster;
            result.analyzedAt = new Date().toISOString();
            return result;
        }
    } catch (err) {
        console.warn(`   PDI: Fallback single-pass failed: ${err.message}`);
    }

    return buildFallbackProductDNA(productData, brief);
}

// ── Fallback ProductDNA (when no images available) ────────────────────────────
function buildFallbackProductDNA(productData, brief) {
    return {
        dominantColors: [],
        backgroundSuggestions: ['#FFFFFF (clean white)', '#F5F5F5 (soft grey)', '#1A1A1A (premium dark)'],
        materials: 'unknown',
        productShape: 'unknown',
        productCategory: productData?.category || 'consumer product',
        moodTags: ['modern', 'clean', 'professional'],
        defaultMoodDirection: 'editorial',
        photographyStyle: 'studio clean with neutral background',
        lightingRecommendation: 'soft front-fill lighting',
        surfaceFinish: 'unknown',
        colorDriftRisk: 'low',
        designDirective: `Premium product photography. Clean aesthetic, professional quality. ${brief ? `Context: ${brief}.` : ''}`,
        productRefImages: [],
        analyzedAt: new Date().toISOString(),
        isFallback: true,
    };
}

// ── Step 2: Generate Mood Board Images ────────────────────────────────────────
/**
 * Generates 4 product-world mood board images — one per custom mood direction.
 *
 * Architecture (Real Designer Approach):
 *   Each mood board is a TRUE DESIGNER COLLAGE that does 3 things:
 *   1. Shows the PRODUCT placed NATURALLY in the mood's world (not pasted on top)
 *   2. Surrounds it with world-building elements: color swatches, material textures, lifestyle scenes
 *   3. The whole composition feels designed as a unit — like a Behance agency mood board
 *
 * @param {object} productDNA        - Output from analyzeProductDesign
 * @param {string} brandContext      - Brand DNA string
 * @param {object} customMoodDirs    - AI-generated moods from generateProductMoodDirections (or FALLBACK)
 * @returns {{ moods: MoodImage[], moodDirections: object }}
 */
export async function generateMoodBoardImages(productDNA, brandContext = '', customMoodDirs = null) {
    const moodDirections = customMoodDirs || FALLBACK_MOOD_DIRECTIONS;
    console.log(`PDI: Generating ${Object.keys(moodDirections).length} product-world mood boards...`);

    // ── Product Color Intelligence ─────────────────────────────────────────────
    const productColors = (productDNA.dominantColors || [])
        .filter(c => c.role !== 'background_suggestion')
        .slice(0, 5);

    const colorHexList = productColors.map(c => c.hex).filter(Boolean).join(', ');
    const colorDetailList = productColors.map(c =>
        `${c.name} (${c.hex}) — ${c.role?.replace('_', ' ')}`
    ).join(', ');

    // ── Product World Description ──────────────────────────────────────────────
    const productWorld = [
        `PRODUCT: ${productDNA.productCategory || 'consumer product'}`,
        `FORM: ${productDNA.productShape || 'compact form'}`,
        `MATERIALS: ${productDNA.materials || 'premium materials'}`,
        `SURFACE: ${productDNA.surfaceFinish || 'refined'} finish`,
        `MOOD TAGS: ${(productDNA.moodTags || []).join(', ')}`,
        `DESIGN BRIEF: ${productDNA.designDirective || ''}`,
        brandContext ? `BRAND: ${brandContext.substring(0, 150).replace(/\n/g, ' ')}` : '',
    ].filter(Boolean).join('\n');

    // ── Select best product reference images ──────────────────────────────────
    const roster = productDNA.productImageRoster || [];
    const heroImg = productDNA.heroImageUrl || roster.find(r => r.viewType === 'hero' || r.viewType === 'front_face')?.url;
    const lifestyleImg = productDNA.lifestyleImageUrl || roster.find(r => ['in_use', 'lifestyle', 'flat_lay'].includes(r.viewType))?.url;
    const detailImg = productDNA.detailImageUrl || roster.find(r => r.viewType === 'macro_detail')?.url;

    const diversePick = [heroImg, lifestyleImg, detailImg].filter(Boolean).filter((url, i, arr) => arr.indexOf(url) === i);
    const fallbackPool = (productDNA.productRefImages || []).filter(url => !diversePick.includes(url));
    const refImages = [...diversePick, ...fallbackPool].filter(Boolean).slice(0, 3);
    const hasRefImages = refImages.length > 0;

    let laozhangMultimodalImageGenerate;
    if (hasRefImages) {
        const mod = await import('../videoStudio/laozhangClient.js');
        laozhangMultimodalImageGenerate = mod.laozhangMultimodalImageGenerate;
    }

    // ── Generate a mood board for each direction ───────────────────────────────
    const moodImageJobs = Object.values(moodDirections).map(async (mood) => {

        // ── Build the designer collage prompt ─────────────────────────────────
        const prompt = [

            // [1] Contextual framing for the AI
            hasRefImages
                ? `REFERENCE IMAGES PROVIDED: The attached images show the ACTUAL PRODUCT (${productDNA.productCategory || 'consumer product'}).
Your task: Use these product images as the VISUAL SOURCE to render the product naturally WITHIN the mood board scene.
Do NOT paste the product as a cutout. Render it AS PART of the scene — as if it belongs there.
The product's proportions, form factor, and colors must remain accurate to what you see in the reference images.`
                : `You are creating a designer mood board. There are no product reference images — suggest where the product would appear using a realistic placeholder.`,

            '',

            // [2] Product color palette — must anchor the collage
            productColors.length
                ? `PRODUCT COLOR PALETTE (EXTRACTED FROM ACTUAL PRODUCT — USE THESE IN THE COLLAGE):
${colorDetailList}
The color swatch strips in the mood board MUST reflect these exact extracted product tones: ${colorHexList}`
                : `Use a harmonious color palette appropriate to this product and mood.`,

            '',

            // [3] Product world context
            `PRODUCT PROFILE:\n${productWorld}`,

            '',

            // [4] The mood-specific art direction
            `CREATIVE TERRITORY: "${mood.label}"
${mood.description || ''}
${mood.targetMoment ? `Consumer Moment: ${mood.targetMoment}` : ''}

ART DIRECTION FOR THIS TERRITORY:
${mood.moodBoardDirective || mood.shootDirective || ''}`,

            '',

            // [5] Exact composition spec — this is the KEY change from the old system
            `COMPOSITING INSTRUCTIONS — BUILD THIS EXACT LAYOUT:

This is a DESIGNER MOOD BOARD — a multi-panel collage like an agency creative brief. Think Behance moodboard, Adobe XD design board, Figma mood board.

Panel Layout (fill the entire ${hasRefImages ? '1344×768' : '1344×768'}px frame, NO white borders or padding):

[LEFT PANEL — 60% width, full height]: THE PRODUCT IN ITS WORLD
• Render the ${productDNA.productCategory || 'product'} NATURALLY PLACED in the environment of the "${mood.label}" creative territory
• This is NOT a studio product shot. The product is in a REAL environment appropriate to the mood.
• Lighting should match the mood's atmosphere completely
• The product's exact colors (${colorHexList || 'as shown in reference'}) and materials must be preserved faithfully
• The product looks like it BELONGS here — it's at home in this world
• Professional photography quality — think editorial campaign, not e-commerce

[RIGHT PANEL — 40% width, divided into 3 stacked sections]:

TOP SECTION (right, ≈35% height): COLOR PALETTE STRIP
• 4 flat solid-color rectangles arranged horizontally
• First 2 colors: ${colorHexList.split(', ').slice(0, 2).join(', ') || 'product primary colors'} (from the actual product)
• Last 2 colors: mood-complementary tones that harmonize with the product palette and the "${mood.label}" territory
• Clean solid fills — no gradients, no texture in these swatches

MIDDLE SECTION (right, ≈35% height): MATERIAL WORLD
• Extreme macro close-up photograph of a surface texture that MATCHES the product's world
• The texture should feel like the materials this product is made of or the environment it lives in
• Examples: brushed aluminum macro, soft-touch matte plastic detail, premium foam cushion weave, carbon fiber pattern, quality leather grain
• Photorealistic, ultra-sharp, cinematic macro photography

BOTTOM SECTION (right, ≈30% height): CONTEXT DETAIL
• A small atmospheric scene detail FROM the product's world — NOT the product itself
• This is a supporting vignette that reinforces the mood territory
• Examples: studio equipment in bokeh, city lights at night, morning coffee ritual, gym equipment detail

SEPARATORS: Thin 1-2px lines between right-panel sections for visual clarity.

QUALITY: Photorealistic, 8K, art director level composition. Every panel is a high-quality photograph or graphic element.
CRITICAL: Do NOT render any readable text, words, letters, numbers, or typography anywhere in the image.`,
        ].filter(Boolean).join('\n');

        try {
            let result;
            if (hasRefImages && laozhangMultimodalImageGenerate) {
                result = await laozhangMultimodalImageGenerate(prompt, refImages, {
                    model: 'gemini-3.1-flash-image-preview',
                    size: '1344x768',
                });
            } else {
                result = await laozhangImageGenerate(prompt, {
                    model: 'gemini-3.1-flash-image-preview',
                    size: '1344x768',
                });
            }

            if (result?.imageUrl) {
                console.log(`   PDI: Mood board generated — "${mood.label}" (${mood.id})`);
                return { ...mood, imageUrl: result.imageUrl, success: true };
            }
        } catch (err) {
            console.warn(`   PDI: Mood board failed for ${mood.id}: ${err.message}`);
        }
        return { ...mood, imageUrl: null, success: false };
    });

    const results = await Promise.allSettled(moodImageJobs);
    const moods = results.map((r, i) => {
        if (r.status === 'fulfilled') return r.value;
        const fallback = Object.values(moodDirections)[i];
        return { ...fallback, imageUrl: null, success: false };
    });

    const successCount = moods.filter(m => m.success).length;
    console.log(`   PDI: ${successCount}/${Object.keys(moodDirections).length} mood boards generated`);

    return { moods, moodDirections };
}


// ── Step 3: Build Color Guard Instruction ─────────────────────────────────────
/**
 * Generate the color-lock prompt block injected into EVERY image generation.
 * This is the most critical part of preventing product color drift.
 *
 * @param {object} productDNA - Output from analyzeProductDesign
 * @returns {string} - Color guard prompt block
 */
export function buildColorGuardInstruction(productDNA) {
    if (!productDNA?.dominantColors?.length) return '';

    const productColors = productDNA.dominantColors.filter(c => c.role !== 'background_suggestion');
    if (!productColors.length) return '';

    const colorList = productColors.map(c => {
        const star = c.role === 'product_primary' ? '★ PRIMARY' : '• SECONDARY';
        return `  ${star}: ${c.name} (${c.hex})${c.rgbRange ? ` [${c.rgbRange}]` : ''}\n    → ${c.colorGuardInstruction || `Preserve this exact color. Do NOT reinterpret, warm, cool, or stylize it.`}`;
    }).join('\n');

    const riskNote = productDNA.colorDriftRisk === 'high'
        ? '\n⚠️ HIGH COLOR DRIFT RISK: This product has colors that AI frequently misinterprets. Be extra precise.'
        : '';

    return `⚠️ PRODUCT COLOR GUARD — ABSOLUTE CONSTRAINT:
The product's physical colors are PERMANENTLY LOCKED. They CANNOT be changed under any circumstances.
${colorList}${riskNote}

IMMUTABLE RULE: The product is a FIXED physical object photographed in real life.
You MAY change: background, environment, lighting direction, scene context.
You MUST NOT: recolor, desaturate, tint, warm/cool, saturate, or stylize the product itself.
Material finish: ${productDNA.materials || 'as shown in reference'} — preserve this too.
Surface: ${productDNA.surfaceFinish || 'as shown'} — do not add gloss to a matte product or vice versa.
Think of the product as a composited photograph dropped into a new scene. It is PHYSICALLY FIXED.`.trim();
}

// ── Step 4: Build Full Design Directive ───────────────────────────────────────
/**
 * Synthesize the full design directive that flows into all creative generators.
 * Combines ProductDNA + selected mood + brand DNA into a locked creative brief.
 *
 * @param {object} productDNA     - Output from analyzeProductDesign
 * @param {string} selectedMoodId - 'editorial' | 'bold' | 'lifestyle' | 'luxury'
 * @param {string[]} brandColors  - Brand color hex codes from Brand DNA
 * @returns {object} designContext - Full design directive object
 */
export function buildDesignContext(productDNA, selectedMoodId, brandColors = [], customMoodDirections = null) {
    // Use AI-generated mood directions if available, fall back to static
    const moodMap = customMoodDirections || FALLBACK_MOOD_DIRECTIONS;
    const mood = moodMap[selectedMoodId]
        || moodMap[productDNA?.defaultMoodDirection]
        || moodMap[Object.keys(moodMap)[0]]   // first custom direction
        || FALLBACK_MOOD_DIRECTIONS.editorial;

    const colorGuardBlock = buildColorGuardInstruction(productDNA);

    const brandColorHints = brandColors.length
        ? `Brand palette for backgrounds/accents (NOT product): ${brandColors.map(c => `${c.hex}`).join(', ')}.`
        : '';

    const backgroundSuggestion = productDNA?.backgroundSuggestions?.[0] || '#FFFFFF';

    const systemDirective = `
DESIGN INTELLIGENCE ACTIVE:
${colorGuardBlock ? colorGuardBlock + '\n' : ''}
MOOD DIRECTION: ${mood.label} — ${mood.description}
${mood.systemDirective}

PRODUCT VISUAL PROFILE:
- Category: ${productDNA?.productCategory || 'consumer product'}
- Materials: ${productDNA?.materials || 'premium'}
- Shape: ${productDNA?.productShape || 'compact'}
- Photography style: ${productDNA?.photographyStyle || 'studio clean'}
- Lighting: ${productDNA?.lightingRecommendation || 'soft front fill'}
- Recommended background: ${backgroundSuggestion}
${brandColorHints}

CREATIVE DIRECTIVE:
${productDNA?.designDirective || 'Premium product photography with clean, consistent visual identity.'}
`.trim();

    // Extract actual hex values for downstream token overrides
    const colorGuardHex = (productDNA?.dominantColors || [])
        .filter(c => c.role !== 'background_suggestion')
        .map(c => c.hex)
        .filter(Boolean);

    return {
        systemDirective,
        colorGuardBlock,
        colorGuardHex,                                         // ← hex array for token overrides
        shootDirective: mood.shootDirective || mood.systemDirective || '', // ← per-shoot style
        moodId: mood.id,
        moodLabel: mood.label,
        moodSystemDirective: mood.shootDirective || mood.systemDirective || '',
        moodBoardDirective: mood.moodBoardDirective || '',
        productDNA,
        productRefImages: productDNA?.productRefImages || [],
        backgroundSuggestion,
    };
}

// ── Utility: Inject design context into any image generation prompt ───────────
/**
 * Prepend the design context to an image generation prompt.
 * Use this in every generateImage() call across all builders.
 *
 * @param {string} basePrompt     - The original image prompt
 * @param {object} designContext  - Output from buildDesignContext()
 * @returns {string}
 */
export function injectDesignContext(basePrompt, designContext) {
    if (!designContext?.systemDirective) return basePrompt;
    return `${designContext.systemDirective}\n\n---\nIMAGE TASK:\n${basePrompt}`;
}

// ── Quick Post Generator — Complete Designed Graphic Pipeline ──────────────────
/**
 * Generates a complete, fully-designed promotional graphic as a single image.
 *
 * Architecture:
 *   Step 1 (Claude): Extract structured copy — headline, hero spec, 3 features, CTA
 *   Step 2 (Gemini): Generate the COMPLETE DESIGNED GRAPHIC with all text, layout,
 *                    typography, product image, and visual elements baked IN.
 *
 * Key design philosophy:
 *   - Mood board = creative DIRECTION and THEME INSPIRATION, not the literal image
 *   - The AI creates a brand-new design themed around the mood's aesthetic
 *   - All copy is rendered INTO the image as part of the graphic design
 *   - Output = a ready-to-post promotional graphic, not a background for overlay
 *
 * @param {object} productDNA         — from analyzeProductDesign
 * @param {object} productData        — scraped product data
 * @param {object} selectedMoodDir    — the mood direction object (for design inspiration)
 * @param {string} postType           — 'promo' | 'order' | 'feature'
 * @param {string} aspectRatio        — '1:1' | '9:16' | '16:9' | '4:5' | etc.
 * @param {string} brandContext       — brand DNA string
 * @returns {{ postImageUrl, backgroundUrl, copy, palette }}
 */
export async function generateQuickPost(productDNA, productData, selectedMoodDir, postType = 'promo', aspectRatio = '1:1', brandContext = '') {
    console.log(`🎯 QuickPost: type=${postType} | ratio=${aspectRatio} | product="${productData?.title || 'unknown'}"`);

    const productTitle = productData?.title || productDNA?.productCategory || 'Product';
    const bullets      = productData?.bulletPoints || [];
    const description  = productData?.description || '';
    const category     = productDNA?.productCategory || 'consumer product';
    const colorPalette = (productDNA?.dominantColors || []).filter(c => c.role !== 'background_suggestion').slice(0, 5);
    const colorHexStr  = colorPalette.map(c => c.hex).filter(Boolean).join(', ');
    const brandName    = productData?.brand || '';

    // ── Step 1: Claude extracts structured post copy ───────────────────────────
    const { callAgent: callClaudeAgent } = await import('./agentUtils.js');

    const copySystemPrompt = `You are a senior product marketing copywriter specialising in Indian consumer brands (D2C, electronics, FMCG).
You write punchy, benefit-led copy that converts. Extract the single most impactful spec and make it the visual hero.
Return ONLY valid JSON. No markdown fences, no explanation.`;

    const postTypeInstruction = {
        order:   'ORDER POST — for distributors/retailers. CTA = "ORDER NOW". Tone: trade/B2B.',
        feature: 'FEATURE SPOTLIGHT — deep-dive ONE key feature as the hero. Tone: educational + aspirational.',
        promo:   'PROMO POST — consumer-facing social media. CTA = "Shop Now". Tone: exciting, punchy.',
    }[postType] || 'PROMO POST';

    const copyUserPrompt = `PRODUCT: "${productTitle}"
CATEGORY: ${category}
BRAND: ${brandName}
KEY BULLETS: ${bullets.slice(0, 6).join(' | ')}
DESCRIPTION: ${description.substring(0, 400)}
POST TYPE: ${postTypeInstruction}
BRAND CONTEXT: ${brandContext ? brandContext.substring(0, 200) : 'none'}

Return this JSON:
{
  "productName": "short punchy model name (no brand prefix), e.g. ZING or MPOWER 111",
  "brandName": "${brandName || 'Brand'}",
  "tagline": "1-line aspiration subtitle, max 6 words",
  "heroSpec": "the single most impressive spec/number — e.g. '80Hr Battery', 'ANC + ENC', '65W Fast Charge'. MUST be SHORT and punchy, NOT a sentence.",
  "heroSpecLabel": "what the heroSpec IS — e.g. 'PLAYTIME', 'RAPID CHARGE', 'NOISE CANCELLATION'",
  "feature1": "Feature bullet 1 — max 4 words, lead with number/stat",
  "feature2": "Feature bullet 2 — max 4 words",
  "feature3": "Feature bullet 3 — max 4 words",
  "colorVariantLabel": "e.g. 'Available in 4 Colors' or empty string",
  "boxQty": ${postType === 'order' ? '"box quantity from bullets, or null"' : 'null'},
  "priceHint": "e.g. \u20b91,499 or empty string — only if clearly stated",
  "cta": "${postType === 'order' ? 'ORDER NOW' : postType === 'feature' ? 'Discover More' : 'Shop Now'}"
}`;

    let copy = {};
    try {
        const copyResult = await callClaudeAgent(
            copySystemPrompt,
            copyUserPrompt,
            0.3,
            700,
            { provider: 'anthropic', model: 'claude-sonnet-4-6' }
        );
        copy = copyResult || {};
        console.log(`\u2705 QuickPost: Copy \u2192 heroSpec="${copy.heroSpec}" | f1="${copy.feature1}" | f2="${copy.feature2}" | f3="${copy.feature3}"`);
    } catch (e) {
        console.warn(`\u26a0\ufe0f QuickPost: Copy extraction failed: ${e.message}`);
        copy = {
            productName: productTitle.split(' ').slice(-2).join(' '),
            brandName,
            tagline: category,
            heroSpec: bullets[0]?.substring(0, 20) || '',
            heroSpecLabel: 'KEY FEATURE',
            feature1: bullets[0]?.substring(0, 25) || 'Premium Quality',
            feature2: bullets[1]?.substring(0, 25) || 'Advanced Technology',
            feature3: bullets[2]?.substring(0, 25) || 'Superior Performance',
            colorVariantLabel: '',
            boxQty: null,
            priceHint: '',
            cta: postType === 'order' ? 'ORDER NOW' : 'Shop Now',
        };
    }

    // ── Size map (pixels) ──────────────────────────────────────────────────────
    const sizeMap = {
        '1:1':      '1024x1024',
        '4:5':      '896x1120',
        '9:16':     '832x1216',
        '16:9':     '1344x768',
        '750x750':  '1024x1024',
        '1200x628': '1344x768',
        '1080x566': '1344x768',
    };
    let imageSize = sizeMap[aspectRatio];
    if (!imageSize) {
        const m = aspectRatio.match(/^(\d+):(\d+)$/);
        if (m) {
            const scale = Math.min(1344 / Math.max(parseInt(m[1]), parseInt(m[2])), 1);
            imageSize = `${Math.round(parseInt(m[1]) * scale)}x${Math.round(parseInt(m[2]) * scale)}`;
        } else {
            imageSize = '1024x1024';
        }
    }

    // ── Step 2: Generate the COMPLETE DESIGNED GRAPHIC ────────────────────────
    const { laozhangMultimodalImageGenerate, laozhangImageGenerate } = await import('../videoStudio/laozhangClient.js');

    // Product reference images (used for product rendering in the graphic)
    const refImages = [
        productDNA?.heroImageUrl,
        ...(productDNA?.productRefImages || []).slice(0, 2),
    ].filter(Boolean);

    // Mood-driven design theme — the mood INSPIRES the aesthetic, it doesn't become the image
    const moodLabel       = selectedMoodDir?.label || 'Professional';
    const moodDescription = selectedMoodDir?.description || 'Clean professional aesthetic';
    const moodColorHints  = (selectedMoodDir?.colorPalette || []).join(', ');
    const moodCreativeDir = selectedMoodDir?.shootDirective || selectedMoodDir?.moodBoardDirective || '';

    const bgColorHint = moodColorHints
        ? `Background / design palette (mood-inspired, NOT product): ${moodColorHints}`
        : `Background palette (mood-themed from product colors): ${colorHexStr || '#0d0d1a, #1a1a2e'}`;

    // ── Layout templates per post type ────────────────────────────────────────
    const layoutTemplates = {
        promo: `LAYOUT — PROMOTIONAL POST (premium mobile ad format):
- TOP ZONE: Brand name "${copy.brandName || brandName}" — small, top-left or top-center
- MIDDLE-LEFT: Product name "${copy.productName || productTitle}" in large bold type, tagline "${copy.tagline || ''}" below it
- CENTER-RIGHT: The ${category} product image, dominant and prominent (largest element)
- BELOW PRODUCT: The hero spec "${copy.heroSpec || ''}" in a MASSIVE bold display number (the visual anchor), with "${copy.heroSpecLabel || ''}" in small caps below
- FEATURE ROW: Three short feature bullets arranged cleanly — "${copy.feature1 || ''}" · "${copy.feature2 || ''}" · "${copy.feature3 || ''}"
- BOTTOM: A styled CTA button "${copy.cta || 'Shop Now'}" — high contrast, pill or rectangle shape${copy.colorVariantLabel ? `\n- COLOR STRIP: Small colored circles or "Available in X colors" text — "${copy.colorVariantLabel}"` : ''}`,

        order: `LAYOUT — ORDER / TRADE POST (B2B distributor format):
- TOP: Brand name "${copy.brandName || brandName}" prominent
- HEADLINE: Product name "${copy.productName || productTitle}" bold center or left-aligned
- CENTER: ${category} product image, large and clean
- BOX QTY BADGE: Large bold badge "${copy.boxQty ? `BOX QTY: ${copy.boxQty}` : 'WHOLESALE AVAILABLE'}" — this should visually stand out
- FEATURES: Three checkmark bullets — "\u2713 ${copy.feature1 || ''}" / "\u2713 ${copy.feature2 || ''}" / "\u2713 ${copy.feature3 || ''}"
- BOTTOM: Large CTA button "ORDER NOW" — dominant and prominent`,

        feature: `LAYOUT — FEATURE SPOTLIGHT (one-feature hero):
- TOP: Brand name "${copy.brandName || brandName}" small
- HERO NUMBER: "${copy.heroSpec || ''}" in an extremely large, dominant display typeface — the most attention-grabbing element on the page
- HERO LABEL: "${copy.heroSpecLabel || ''}" in clean small caps below the number
- PRODUCT IMAGE: ${category} placed prominently, slightly offset to balance the number
- SUPPORTING TEXT: Short benefit statement about this feature in context, followed by "${copy.feature1 || ''}" and "${copy.feature2 || ''}" as small supporting bullets
- BOTTOM: Subtle CTA "Discover More"`,
    };

    const layoutSpec = layoutTemplates[postType] || layoutTemplates.promo;

    // ── The master graphic design prompt ──────────────────────────────────────
    const designPrompt = [
        `TASK: Create a COMPLETE, READY-TO-POST promotional graphic for ${category}.`,
        `This is a FINISHED ADVERTISEMENT — not a background. ALL text, ALL typography, ALL layout elements, and the product photo are rendered as part of the final image.`,
        ``,
        `━━━ COPY TO RENDER (render ALL of this in the design) ━━━`,
        `Brand: ${copy.brandName || brandName}`,
        `Product Name: ${copy.productName || productTitle}`,
        copy.tagline ? `Tagline: ${copy.tagline}` : '',
        `HERO SPEC VALUE (render VERY LARGE — this is the visual statement): ${copy.heroSpec || ''}`,
        `HERO SPEC LABEL (small caps under the value): ${copy.heroSpecLabel || ''}`,
        `Feature 1: ${copy.feature1 || ''}`,
        `Feature 2: ${copy.feature2 || ''}`,
        `Feature 3: ${copy.feature3 || ''}`,
        copy.colorVariantLabel ? `Color availability text: ${copy.colorVariantLabel}` : '',
        copy.boxQty ? `Box Quantity: ${copy.boxQty}` : '',
        copy.priceHint ? `Price: ${copy.priceHint}` : '',
        `CTA Button text: "${copy.cta || 'Shop Now'}"`,
        ``,
        `━━━ LAYOUT SPECIFICATION ━━━`,
        layoutSpec,
        ``,
        `━━━ VISUAL DESIGN THEME ━━━`,
        `The design visual style is inspired by the "${moodLabel}" creative territory.`,
        `This means: ${moodDescription}`,
        moodCreativeDir ? `Creative direction for this aesthetic: ${moodCreativeDir}` : '',
        bgColorHint,
        ``,
        `IMPORTANT: The mood is a CREATIVE DIRECTION — build a BRAND NEW design that captures the feeling and aesthetic of "${moodLabel}".`,
        `Do NOT reproduce any mood board image. Create an original graphic design for THIS product using that aesthetic as inspiration.`,
        `The background treatment, color palette, typography mood, and graphic elements should feel native to "${moodLabel}".`,
        ``,
        `━━━ PRODUCT RENDERING ━━━`,
        refImages.length > 0
            ? `REFERENCE IMAGES ATTACHED: These show the actual ${category} product.
Render the product accurately in the design — matching the exact colors (${colorHexStr || 'as shown'}), form factor, and materials visible in the reference images.
The product should be cleanly composited with professional studio-quality lighting appropriate to the "${moodLabel}" aesthetic.
IMPORTANT: Do NOT recolor, stylize, cartoon-ize, or distort the product. It must look photorealistic.`
            : `No product reference images — illustrate a clean, photorealistic ${category} as the main visual element.`,
        ``,
        `━━━ TYPOGRAPHY & DESIGN RULES ━━━`,
        `• HIERARCHY: Brand name=smallest | Product name=medium | Tagline=supporting | HERO SPEC VALUE=LARGEST and most dominant`,
        `• The hero spec "${copy.heroSpec || 'KEY VALUE'}" MUST be rendered in an oversized, bold, attention-commanding display typeface`,
        `• All text must be legible with strong contrast against its background`,
        `• CTA button must look like an actual button — styled shape, contrasting fill, visible text`,
        `• Typography style should match the "${moodLabel}" aesthetic (e.g. clean sans-serif for minimal, heavy slab for bold, elegant serif for luxury)`,
        `• Use the product's color palette (${colorHexStr || 'brand colors'}) for accent elements, text highlights, and graphic details`,
        ``,
        `━━━ PRODUCTION SPECS ━━━`,
        `Output size: ${imageSize}. Fill the ENTIRE frame edge-to-edge. No white margins, no padding, no watermarks, no lorem ipsum.`,
        `Quality: Premium advertising grade — photorealistic product, crisp typography, polished graphic design. Think: Samsung, OnePlus, boAt campaign creative.`,
    ].filter(Boolean).join('\n');

    let postImageUrl = null;
    try {
        let result;
        if (refImages.length > 0) {
            result = await laozhangMultimodalImageGenerate(designPrompt, refImages, {
                model: 'gemini-3.1-flash-image-preview',
                size: imageSize,
            });
        } else {
            result = await laozhangImageGenerate(designPrompt, {
                model: 'gemini-3.1-flash-image-preview',
                size: imageSize,
            });
        }
        postImageUrl = result?.imageUrl || null;
        console.log(`\u2705 QuickPost: Complete graphic generated \u2014 ${postImageUrl?.substring(0, 60)}...`);
    } catch (e) {
        console.error(`\u274c QuickPost: Graphic generation failed: ${e.message}`);
    }

    return {
        postImageUrl,
        backgroundUrl: postImageUrl,          // compat alias (some frontend reads backgroundUrl)
        backgrounds: { [aspectRatio]: postImageUrl },
        copy,
        palette: colorPalette,
        aspectRatio,
        postType,
        productTitle,
        moodLabel,
    };
}


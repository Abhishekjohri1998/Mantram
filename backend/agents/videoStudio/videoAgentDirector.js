/**
 * Video Agent Director — Brain of the 5-Stage AI Video Pipeline
 *
 * Provides one function per stage:
 *   Stage 1 — analyzeInputs()         → analysis JSON
 *   Stage 2 — generatePlan()          → plan JSON
 *   Stage 3 — generateReferenceImages() → refs array
 *   Stage 4 — buildStoryboard()       → calls storyboardDirector.js (existing)
 *   Stage 5 — writeModelPrompt()      → model-specific final prompt
 *
 * Each function is stateless: it receives everything it needs and returns a result.
 * State persistence is handled by the route layer (VideoAgentSession model).
 *
 * Brand knowledge injection: Every stage uses brandContext, brandCategory,
 * and productDNA — NOT just a raw text string.
 */

import { loadBrandContext, callMultimodalAgent, callAgent, callAgentText } from '../shared/agentUtils.js';
import { geminiImageGenerate } from './firstFrame.js';
import { runStoryboardDirector } from './storyboardDirector.js';
import { estimateCost, MODEL_CAPABILITIES } from './falClient.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helper: parse JSON safely from any LLM output
// ─────────────────────────────────────────────────────────────────────────────
function safeParseJSON(text, fallback = {}) {
    try {
        let cleaned = text.trim();
        // Strip <think> tags (reasoning models)
        cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        // Strip markdown fences
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
        if (cleaned.startsWith('{') || cleaned.startsWith('[')) {
            return JSON.parse(cleaned);
        }
        const match = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
        if (match) return JSON.parse(match[1]);
    } catch (e) {
        console.warn('[VideoAgentDirector] JSON parse failed:', e.message?.substring(0, 80));
    }
    return fallback;
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 1 — ANALYZE INPUTS
// Multimodal call: brief + images + video frames + brand DNA → structured analysis
// ─────────────────────────────────────────────────────────────────────────────

export async function analyzeInputs({
    brief,
    images = [],        // [{ url, label, source }]
    videoUrl = '',
    brandId,
    productId,
    productData = null, // pre-loaded product object
}) {
    console.log('[VideoAgentDirector] Stage 1: Analyzing inputs...');

    // Load brand DNA
    const { brand, brandContext } = await loadBrandContext(brandId);
    const brandCategory = brand?.dna?.category || brand?.category || '';
    const brandName = brand?.name || 'Unknown Brand';
    const brandTargetAudience = brand?.dna?.targetAudience || '';
    const brandTone = brand?.dna?.tone || '';

    // Collect image URLs for vision analysis
    const imageUrls = images
        .map(img => img.url)
        .filter(url => url && url.startsWith('http') && !url.includes('localhost'))
        .slice(0, 6);

    const hasCharacterHint = brief?.toLowerCase().match(/\b(model|person|character|presenter|actor|girl|boy|man|woman|face|human)\b/);
    const hasProductHint = images.some(img => img.label?.toLowerCase().includes('product')) || !!productData;

    const systemPrompt = `You are an expert brand strategist and ad creative director analyzing inputs for a video ad campaign.

You have deep knowledge of how different brand categories require different visual styles:
- Fashion/Apparel: slow drama, editorial lighting, model-forward, muted palette
- Beauty/Skincare: closeups, texture, soft light, transformation arcs
- Food & Beverage: appetite appeal, macro shots, steam, warm tones
- Tech/SaaS: clean UI overlays, blue/teal grading, motion graphics
- Health/Fitness: energy, motion, bright daylight, transformation
- Jewelry/Luxury: macro product, bokeh, premium lighting, exclusivity
- FMCG/CPG: lifestyle usage, family, warmth, shelf appeal
- D2C/E-commerce: aspirational lifestyle, before/after, social proof

BRAND CONTEXT:
${brandContext || 'No brand data. Infer from provided images and brief.'}

OUTPUT FORMAT — Return ONLY valid JSON, no markdown:
{
  "contentType": "product-ad|ugc|brand-story|explainer|social-reel|testimonial",
  "brandCategory": "fashion|beauty|food|tech|health|jewelry|fmcg|d2c|other",
  "detectedStyle": "cinematic|raw-ugc|minimalist|energetic|luxurious|playful|dramatic",
  "productFeatures": ["feature1", "feature2"],
  "audienceProfile": "brief description of target audience",
  "toneKeywords": ["word1", "word2", "word3"],
  "suggestedDuration": 30,
  "suggestedRatio": "9:16|16:9|1:1|4:5",
  "hasCharacter": true,
  "hasProduct": true,
  "hasLocation": false,
  "summary": "2-3 sentence human-readable summary of what the agent understands about this request and the brand"
}`;

    const imageContext = imageUrls.length > 0
        ? `\nATTACHED IMAGES: ${imageUrls.length} image(s) provided for analysis.`
        : '\nNo images attached.';

    const productContext = productData
        ? `\nPRODUCT: ${productData.title} — ${productData.shortDescription || ''}\nFeatures: ${(productData.features || []).join(', ')}\nCategory: ${productData.category || ''}`
        : '';

    const userPrompt = `CREATIVE BRIEF: "${brief || 'Create a compelling video ad'}"
BRAND: ${brandName} | Category: ${brandCategory} | Audience: ${brandTargetAudience}
${imageContext}${productContext}
${hasCharacterHint ? 'Note: Brief mentions a human presenter/character.' : ''}
${hasProductHint ? 'Note: Product images are provided.' : ''}
${videoUrl ? `VIDEO INPUT: ${videoUrl}` : ''}

Analyze and return the JSON.`;

    let analysis;
    try {
        if (imageUrls.length > 0) {
            const raw = await callMultimodalAgent(systemPrompt, userPrompt, imageUrls, {
                temperature: 0.2, maxTokens: 2048, returnRaw: true,
            });
            analysis = safeParseJSON(raw, {});
        } else {
            const result = await callAgent(systemPrompt, userPrompt, 0.2, 2048);
            analysis = result || {};
        }
    } catch (err) {
        console.warn('[VideoAgentDirector] Analysis failed, using fallback:', err.message);
        analysis = {};
    }

    // Enrich with brand intelligence if LLM didn't fill them
    return {
        contentType:       analysis.contentType       || 'product-ad',
        brandCategory:     analysis.brandCategory     || brandCategory || 'd2c',
        detectedStyle:     analysis.detectedStyle     || 'cinematic',
        productFeatures:   Array.isArray(analysis.productFeatures) ? analysis.productFeatures : [],
        audienceProfile:   analysis.audienceProfile   || brandTargetAudience || 'general audience',
        toneKeywords:      Array.isArray(analysis.toneKeywords) ? analysis.toneKeywords : [brandTone || 'professional'],
        suggestedDuration: Number(analysis.suggestedDuration) || 30,
        suggestedRatio:    analysis.suggestedRatio    || '9:16',
        hasCharacter:      analysis.hasCharacter      !== undefined ? analysis.hasCharacter : !!hasCharacterHint,
        hasProduct:        analysis.hasProduct        !== undefined ? analysis.hasProduct   : hasProductHint,
        hasLocation:       analysis.hasLocation       || false,
        summary:           analysis.summary           || `${brandName} ${brief?.substring(0, 120) || 'video ad'} — ${brandCategory} brand targeting ${brandTargetAudience || 'general audience'}.`,
        visualGrounding:   null, // populated separately if needed
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 2 — GENERATE CREATIVE PLAN
// LLM builds a creative plan using analysis + brand DNA
// ─────────────────────────────────────────────────────────────────────────────

export async function generatePlan({ analysis, brief, brandId }) {
    console.log('[VideoAgentDirector] Stage 2: Generating creative plan...');

    const { brand, brandContext } = await loadBrandContext(brandId);
    const brandName = brand?.name || 'Unknown Brand';

    const systemPrompt = `You are a world-class creative director and video strategist.

Based on a brand analysis and brief, create a precise, actionable creative video plan.

BRAND CONTEXT:
${brandContext || 'No brand data.'}

ANALYSIS:
Content Type: ${analysis.contentType}
Brand Category: ${analysis.brandCategory}
Detected Style: ${analysis.detectedStyle}
Tone: ${(analysis.toneKeywords || []).join(', ')}
Audience: ${analysis.audienceProfile}
Has Character: ${analysis.hasCharacter}
Has Product: ${analysis.hasProduct}

OUTPUT FORMAT — Return ONLY valid JSON, no markdown:
{
  "title": "Creative project title (max 60 chars)",
  "videoType": "ad-film|ugc|product-demo|social-reel|explainer|brand-story",
  "narrativeArc": "hook → build → reveal → CTA",
  "hookStrategy": "one sentence describing the opening 3 seconds",
  "duration": 30,
  "ratio": "9:16",
  "style": "hyperrealistic|3d|2d",
  "styleGuide": "Mood board description: color palette, lighting, pacing (2-3 sentences)",
  "scenePlan": [
    { "role": "HOOK", "duration": 5, "purpose": "what happens in this scene" },
    { "role": "BUILD", "duration": 10, "purpose": "..." }
  ],
  "modelRecommendation": "seedance-2.0|kling-3.0|veo-3.1|grok-imagine|gemini-flash",
  "modelReasoning": "why this model fits this video type",
  "refsNeeded": {
    "character": true,
    "product": true,
    "location": false
  }
}

MODEL SELECTION GUIDE:
- seedance-2.0: Best for most videos, great image-to-video consistency, fast, supports long-form
- kling-3.0: Multi-shot scripts, cinematic quality, best for brand stories
- veo-3.1: Native audio generation, best for product demos with narration
- grok-imagine: Fast social content, reels, UGC-style, low cost
- gemini-flash: Motion graphics, explainers, animated content`;

    const userPrompt = `Brief: "${brief || 'Create a compelling video ad'}"
Brand: ${brandName} | Duration suggested by analysis: ${analysis.suggestedDuration}s | Ratio: ${analysis.suggestedRatio}
Create the creative plan JSON now.`;

    let plan;
    try {
        const result = await callAgent(systemPrompt, userPrompt, 0.7, 2048);
        plan = result || {};
    } catch (err) {
        console.warn('[VideoAgentDirector] Plan generation failed, using fallback:', err.message);
        plan = {};
    }

    const duration = Number(plan.duration) || analysis.suggestedDuration || 30;
    const scenePlan = Array.isArray(plan.scenePlan) && plan.scenePlan.length > 0
        ? plan.scenePlan
        : buildFallbackScenePlan(duration);

    return {
        title:               plan.title             || `${brandName} Video Ad`,
        videoType:           plan.videoType         || analysis.contentType || 'ad-film',
        narrativeArc:        plan.narrativeArc      || 'hook → build → reveal → CTA',
        hookStrategy:        plan.hookStrategy      || 'Open with a striking visual that immediately grabs attention',
        duration,
        ratio:               plan.ratio             || analysis.suggestedRatio || '9:16',
        style:               plan.style             || 'hyperrealistic',
        styleGuide:          plan.styleGuide        || `${analysis.detectedStyle} style, targeting ${analysis.audienceProfile}`,
        scenePlan,
        modelRecommendation: plan.modelRecommendation || 'seedance-2.0',
        modelReasoning:      plan.modelReasoning    || '',
        refsNeeded: {
            character: plan.refsNeeded?.character ?? analysis.hasCharacter ?? false,
            product:   plan.refsNeeded?.product   ?? analysis.hasProduct   ?? false,
            location:  plan.refsNeeded?.location  ?? false,
        },
    };
}

function buildFallbackScenePlan(duration) {
    if (duration <= 20) {
        return [
            { role: 'HOOK',   duration: Math.round(duration * 0.3), purpose: 'Grab attention with striking visual' },
            { role: 'REVEAL', duration: Math.round(duration * 0.4), purpose: 'Product hero shot and key message' },
            { role: 'CTA',    duration: Math.round(duration * 0.3), purpose: 'Call to action and brand close' },
        ];
    }
    if (duration <= 45) {
        return [
            { role: 'HOOK',    duration: 7,  purpose: 'Grab attention' },
            { role: 'BUILD',   duration: 10, purpose: 'Build context and problem' },
            { role: 'REVEAL',  duration: 8,  purpose: 'Product reveal' },
            { role: 'CTA',     duration: duration - 25, purpose: 'CTA and brand close' },
        ];
    }
    return [
        { role: 'COLD_OPEN', duration: 8,  purpose: 'Visual hook' },
        { role: 'HOOK',      duration: 10, purpose: 'Introduce problem/desire' },
        { role: 'BUILD',     duration: 12, purpose: 'Build tension/emotion' },
        { role: 'REVEAL',    duration: 10, purpose: 'Product reveal' },
        { role: 'DEMO',      duration: 10, purpose: 'Product in action' },
        { role: 'CTA',       duration: duration - 50, purpose: 'CTA and brand close' },
    ];
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 3 — GENERATE REFERENCE IMAGES
// Generates AI reference images for character/product/location
// Each image is generated with Gemini Image and returned for user approval
// ─────────────────────────────────────────────────────────────────────────────

export async function generateReferenceImages({
    plan,
    analysis,
    brief,
    uploadedImages = [],     // user-uploaded images from input stage
    characterPhoto = '',     // if user uploaded a character photo
    productImages = [],      // product images from DB
    brandId,
}) {
    console.log('[VideoAgentDirector] Stage 3: Generating reference images...');

    const { brand } = await loadBrandContext(brandId);
    const brandName = brand?.name || '';
    const logoUrl = brand?.dna?.logo?.url || brand?.logo?.url || null;

    const refs = {
        characterRefs: [],
        productRefs:   [],
        locationRefs:  [],
    };

    const generationPromises = [];

    // ── CHARACTER REF ──────────────────────────────────────────────────────────
    if (plan.refsNeeded?.character) {
        generationPromises.push(
            generateCharacterRef({ characterPhoto, analysis, plan, brief })
                .then(ref => { if (ref) refs.characterRefs.push(ref); })
                .catch(err => console.warn('[VideoAgentDirector] Character ref failed:', err.message))
        );
    }

    // ── PRODUCT REF ───────────────────────────────────────────────────────────
    if (plan.refsNeeded?.product && (productImages.length > 0 || uploadedImages.length > 0)) {
        generationPromises.push(
            generateProductRef({ productImages, uploadedImages, analysis, plan, brandName })
                .then(ref => { if (ref) refs.productRefs.push(ref); })
                .catch(err => console.warn('[VideoAgentDirector] Product ref failed:', err.message))
        );
    } else if (plan.refsNeeded?.product && uploadedImages.length > 0) {
        // Use uploaded images as product refs directly
        refs.productRefs = uploadedImages.slice(0, 3).map((img, i) => ({
            url: img.url,
            label: img.label || `Product Reference ${i + 1}`,
            approved: false,
            isUpload: true,
        }));
    }

    // ── LOCATION REF ──────────────────────────────────────────────────────────
    if (plan.refsNeeded?.location) {
        generationPromises.push(
            generateLocationRef({ analysis, plan, brief, brandName })
                .then(ref => { if (ref) refs.locationRefs.push(ref); })
                .catch(err => console.warn('[VideoAgentDirector] Location ref failed:', err.message))
        );
    }

    await Promise.allSettled(generationPromises);

    // Fallback: if no refs generated for needed types, use uploads
    if (plan.refsNeeded?.product && refs.productRefs.length === 0 && productImages.length > 0) {
        refs.productRefs = productImages.slice(0, 3).map((url, i) => ({
            url,
            label: `Product Reference ${i + 1}`,
            approved: false,
            isUpload: true,
        }));
    }

    console.log(`[VideoAgentDirector] Refs generated: char=${refs.characterRefs.length} product=${refs.productRefs.length} location=${refs.locationRefs.length}`);
    return refs;
}

async function generateCharacterRef({ characterPhoto, analysis, plan, brief }) {
    const basePrompt = characterPhoto
        ? `Create a character reference sheet for a video ad. Use the attached character photo as the base. Generate a professional reference sheet showing this exact person from 4 angles: front view, 3/4 view left, side profile, and back view. Keep face, hair, skin tone and clothing completely identical. White background, labeled panels, professional character sheet layout.`
        : `Create a professional character reference sheet for a video presenter. Style: ${plan.styleGuide}. The character is the perfect presenter for a ${analysis.brandCategory} brand ad targeting ${analysis.audienceProfile}. Show front view, 3/4 angle, close-up face, and full body. White studio background, professional character sheet layout.`;

    const inputImages = characterPhoto
        ? [characterPhoto].filter(u => u && u.startsWith('http'))
        : [];

    try {
        const result = await geminiImageGenerate(basePrompt, [], 0.3);
        if (result?.imageUrl) {
            return {
                url: result.imageUrl,
                label: 'Character Reference Sheet',
                approved: false,
                type: 'character',
            };
        }
    } catch (err) {
        console.warn('[VideoAgentDirector] generateCharacterRef failed:', err.message);
    }
    return null;
}

async function generateProductRef({ productImages, uploadedImages, analysis, plan, brandName }) {
    const allProductUrls = [
        ...productImages.filter(u => u && u.startsWith('http')).slice(0, 2),
        ...uploadedImages.filter(img => img.url && img.url.startsWith('http')).map(img => img.url).slice(0, 2),
    ].slice(0, 3);

    const prompt = `Create a product reference sheet for a ${analysis.brandCategory} brand video ad. ${allProductUrls.length > 0 ? 'Using the attached product image(s) as reference, ' : ''}generate a clean product reference sheet showing the product from 5 angles: front, back, side, three-quarter, and close-up detail shot. Pure white background. Each angle clearly labeled. Professional e-commerce style. Preserve exact product colors, shapes, and branding details. Do NOT recolor or stylize the product.`;

    try {
        const result = await geminiImageGenerate(prompt, [], 0.2);
        if (result?.imageUrl) {
            return {
                url: result.imageUrl,
                label: 'Product Reference Sheet',
                approved: false,
                type: 'product',
            };
        }
    } catch (err) {
        console.warn('[VideoAgentDirector] generateProductRef failed:', err.message);
    }
    return null;
}

async function generateLocationRef({ analysis, plan, brief, brandName }) {
    const styleMap = {
        fashion: 'minimalist studio with marble floors, soft window light, editorial fashion backdrop',
        beauty: 'soft pink studio with vanity lighting, marble countertop, spa-like atmosphere',
        food: 'warm rustic kitchen counter with natural light, wooden surfaces, food styling props',
        tech: 'sleek modern office with glass walls, blue ambient LED lighting, minimalist desk setup',
        health: 'bright airy gym with natural light, clean modern fitness equipment',
        jewelry: 'dark velvet surface with pin-spot lighting, jewelry display props, black and gold palette',
        fmcg: 'family home kitchen with warm sunlight, everyday lifestyle setting',
        d2c: 'lifestyle home interior, bright and airy, neutral tones with brand color accents',
    };

    const locationDesc = styleMap[analysis.brandCategory] || `Professional studio set for ${analysis.brandCategory} brand video, ${plan.styleGuide}`;

    const prompt = `Create an environment / set design mood board for a video advertisement. Location: ${locationDesc}. Show the space from a camera eye-level perspective suitable for video production. Include lighting setup visible in the scene. Professional photography quality. No people. This is for a ${analysis.brandCategory} brand.`;

    try {
        const result = await geminiImageGenerate(prompt, [], 0.4);
        if (result?.imageUrl) {
            return {
                url: result.imageUrl,
                label: 'Set Design / Location Mood Board',
                approved: false,
                type: 'location',
            };
        }
    } catch (err) {
        console.warn('[VideoAgentDirector] generateLocationRef failed:', err.message);
    }
    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 4 — BUILD STORYBOARD (delegates to existing storyboardDirector.js)
// Wraps runStoryboardDirector with the agent's structured plan context
// ─────────────────────────────────────────────────────────────────────────────

export async function buildStoryboard({
    plan,
    analysis,
    brief,
    approvedRefs,    // { characterRefs: [{url,label}], productRefs: [...], locationRefs: [...] }
    productImages = [],
    brandId,
    userId,
}) {
    console.log('[VideoAgentDirector] Stage 4: Building storyboard...');

    // Build image arrays for storyboardDirector
    const productImageUrls = [
        ...approvedRefs.productRefs.map(r => r.url).filter(Boolean),
        ...productImages.filter(Boolean),
    ].slice(0, 3);

    const avatarUrls = approvedRefs.characterRefs.map(r => r.url).filter(Boolean).slice(0, 2);
    const avatarNames = avatarUrls.map((_, i) => `Character ${i + 1}`);

    const refImageUrls = approvedRefs.locationRefs.map(r => r.url).filter(Boolean).slice(0, 2);

    const storyboardResult = await runStoryboardDirector({
        brandId,
        brief,
        productName:      plan.title || '',
        productFeatures:  analysis.productFeatures?.join(', ') || '',
        productImageUrls,
        avatarUrls,
        avatarNames,
        refImageUrls,
        style:            plan.style || 'hyperrealistic',
        duration:         plan.duration || 30,
        format:           plan.ratio || '9:16',
        userId,
        directorModel:    'claude',
        dialogueLanguage: 'English',
        includeBranding:  true,
    });

    return storyboardResult;
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 5 — WRITE MODEL-SPECIFIC PROMPT
// Builds the exact video generation prompt tailored to the chosen model's syntax
// ─────────────────────────────────────────────────────────────────────────────

export async function writeModelPrompt({
    model,
    storyboard,
    plan,
    analysis,
    brief,
    approvedRefs,
    brandId,
}) {
    console.log(`[VideoAgentDirector] Stage 5: Writing model-specific prompt for ${model}...`);

    const { brand, brandContext } = await loadBrandContext(brandId);
    const brandName = brand?.name || '';

    // Build ref image context (for @image tagging)
    const allRefUrls = [
        ...approvedRefs.productRefs.map(r => r.url).filter(Boolean),
        ...approvedRefs.characterRefs.map(r => r.url).filter(Boolean),
        ...approvedRefs.locationRefs.map(r => r.url).filter(Boolean),
    ].slice(0, 8);

    const modelSyntaxGuides = {
        'seedance-2.0': `SEEDANCE 2.0 PROMPT RULES:
- Reference images using @image1, @image2 etc. (maps to provided image order)
- Include explicit motion descriptions: "slow dolly-in", "tracking shot"
- Format: "[Motion][Subject][Environment][Lighting][Camera spec]"
- For each cut: specify duration in seconds explicitly
- Audio: describe ambient sound or music mood`,

        'kling-3.0': `KLING 3.0 PROMPT RULES:
- Multi-prompt mode: each shot on a new line prefixed with timing "[0s-5s]:"
- Rich cinematic language: lens mm, aperture, color grading
- Be explicit about camera movement: DOLLY IN, PULL BACK, RACK FOCUS
- Describe the subject's actions with precision
- Include environmental atmosphere in every shot`,

        'veo-3.1': `VEO 3.1 PROMPT RULES:
- Native audio: describe the SOUND explicitly (music genre, tempo, voiceover tone)
- Use cinematography language: "golden hour backlight, anamorphic lens, shallow DOF"
- Include spoken dialogue or voiceover text in quotes
- Describe scene transitions: cut to, dissolve into, smash cut
- Veo excels at physics-realistic motion and fluid transitions`,

        'grok-imagine': `GROK VIDEO PROMPT RULES:
- Keep prompts energetic and direct, short punchy sentences
- Great for fast-paced UGC and social content
- Describe motion dynamically: "spinning", "jumping", "slo-mo pour"
- Social media style: relatable, authentic, trending
- Mention brand in closing shot only`,

        'gemini-flash': `GEMINI FLASH VIDEO RULES:
- Best for motion graphics and animated content
- Describe visual transitions and animations explicitly
- Include text overlay instructions: "show text 'Brand Name' in top-right"
- Color palette driven: name exact hex colors for consistency
- UI/screen recordings describe as flat, clean, and animated`,
    };

    const modelGuide = modelSyntaxGuides[model] || modelSyntaxGuides['seedance-2.0'];

    // Build cut plan from storyboard
    const cutPlan = (storyboard.cuts || [])
        .map(cut => `  Cut ${cut.id} [${cut.duration}s] ${cut.lens || ''} ${cut.shot || ''} ${cut.move || ''}: ${cut.scene || ''}`)
        .join('\n');

    const systemPrompt = `You are an expert AI video prompt engineer specializing in ${model}.

${modelGuide}

BRAND DNA:
${brandContext || 'No brand data.'}

STORYBOARD DIRECTOR'S PLAN:
Environment: ${storyboard.environmentFingerprint || ''}
Colors: ${(storyboard.colorPalette || []).join(', ')}
Mood: ${(storyboard.moodKeywords || []).join(', ')}
Cinematography: ${storyboard.cinematographyRules || ''}
Emotional arc: ${storyboard.emotionalArc || ''}

CUT PLAN:
${cutPlan}

REF IMAGES AVAILABLE: ${allRefUrls.length} images (use @image1, @image2... if model supports it)

Your task: Write a single, comprehensive, model-optimized video generation prompt.
Return ONLY valid JSON: { "prompt": "the complete prompt", "reasoning": "why this approach" }`;

    const userPrompt = `Generate the final ${model} video prompt for this video:
Title: ${plan.title}
Brief: "${brief}"
Duration: ${plan.duration}s | Ratio: ${plan.ratio} | Style: ${plan.style}
Brand: ${brandName}`;

    let result;
    try {
        result = await callAgent(systemPrompt, userPrompt, 0.65, 3000);
    } catch (err) {
        console.warn('[VideoAgentDirector] Prompt writing failed, using storyboard prompt:', err.message);
        result = { prompt: storyboard.imagePrompt || brief, reasoning: 'Fallback to storyboard prompt' };
    }

    const finalPrompt = result?.prompt || result?.enhancedPrompt || storyboard.imagePrompt || brief;

    // Calculate cost estimate
    const resolution = plan.ratio === '9:16' ? '1080p' : '1080p';
    const costEstimate = estimateCost(model, plan.duration || 30, resolution, 'fast');

    return {
        model,
        resolution,
        qualityMode: 'fast',
        finalPrompt,
        reasoning: result?.reasoning || '',
        costEstimate,
        allRefUrls,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODEL CAPABILITIES — for the model selection UI
// ─────────────────────────────────────────────────────────────────────────────

export const VIDEO_AGENT_MODELS = [
    {
        id: 'seedance-2.0',
        name: 'Seedance 2.0',
        icon: '🎬',
        tier: 'Pro',
        tagline: 'Best overall — cinematic quality + fast',
        maxDuration: 120,
        supportsLongForm: true,
        supportsImageRef: true,
        supportsAudio: true,
        bestFor: ['product-ad', 'brand-story', 'social-reel'],
        speed: 'Fast',
        quality: '⭐⭐⭐⭐',
        color: '#14b8a6',
    },
    {
        id: 'kling-3.0',
        name: 'Kling 3.0',
        icon: '👑',
        tier: 'Premium',
        tagline: 'Best cinematic quality + multi-shot scripts',
        maxDuration: 60,
        supportsLongForm: true,
        supportsImageRef: true,
        supportsAudio: false,
        bestFor: ['brand-story', 'product-ad', 'explainer'],
        speed: 'Medium',
        quality: '⭐⭐⭐⭐⭐',
        color: '#f59e0b',
    },
    {
        id: 'veo-3.1',
        name: 'Veo 3.1',
        icon: '🎤',
        tier: 'Ultra',
        tagline: 'Native audio + dialogue — most realistic',
        maxDuration: 30,
        supportsLongForm: false,
        supportsImageRef: false,
        supportsAudio: true,
        bestFor: ['ugc', 'testimonial', 'product-demo'],
        speed: 'Slow',
        quality: '⭐⭐⭐⭐⭐',
        color: '#8b5cf6',
    },
    {
        id: 'veo-3.1-fast',
        name: 'Veo 3.1 Fast',
        icon: '⚡',
        tier: 'Premium',
        tagline: 'Fast Veo with native audio',
        maxDuration: 30,
        supportsLongForm: false,
        supportsImageRef: false,
        supportsAudio: true,
        bestFor: ['social-reel', 'ugc'],
        speed: 'Fast',
        quality: '⭐⭐⭐⭐',
        color: '#6d28d9',
    },
    {
        id: 'grok-imagine',
        name: 'Grok Video',
        icon: '🤖',
        tier: 'Fast',
        tagline: 'Fastest social content — great for reels',
        maxDuration: 15,
        supportsLongForm: false,
        supportsImageRef: false,
        supportsAudio: false,
        bestFor: ['social-reel', 'ugc'],
        speed: 'Ultra-fast',
        quality: '⭐⭐⭐',
        color: '#ef4444',
    },
    {
        id: 'gemini-flash',
        name: 'Gemini Flash Video',
        icon: '✨',
        tier: 'Pro',
        tagline: 'Motion graphics + animated explainers',
        maxDuration: 30,
        supportsLongForm: false,
        supportsImageRef: false,
        supportsAudio: false,
        bestFor: ['explainer', 'motion-graphics'],
        speed: 'Fast',
        quality: '⭐⭐⭐⭐',
        color: '#3b82f6',
    },
];

export function getModelInfo(modelId) {
    return VIDEO_AGENT_MODELS.find(m => m.id === modelId) || VIDEO_AGENT_MODELS[0];
}

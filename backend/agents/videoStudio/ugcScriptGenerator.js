/**
 * UGC Script Generator — AI-powered script creation from brand knowledge
 * 
 * Combines Brand DNA (voice, tone, values), product data, brand strategy,
 * and trending hooks to generate authentic-sounding UGC video scripts.
 * 
 * This is the secret sauce: while HeyGen alone creates generic videos,
 * Mantram AI + HeyGen creates brand-intelligent UGC content.
 */

import { getRouter } from '../../ai/router.js';
import Brand from '../../models/Brand.js';
import Product from '../../models/Product.js';

// ── UGC Video Styles ──
export const UGC_STYLES = [
    { id: 'testimonial', label: 'Testimonial', icon: '⭐', desc: 'Personal experience sharing', hookStyle: 'emotional' },
    { id: 'unboxing', label: 'Unboxing', icon: '📦', desc: 'First impressions reveal', hookStyle: 'curiosity' },
    { id: 'review', label: 'Honest Review', icon: '🔍', desc: 'Detailed product breakdown', hookStyle: 'authority' },
    { id: 'tutorial', label: 'Tutorial / How-To', icon: '📝', desc: 'Step-by-step guide', hookStyle: 'educational' },
    { id: 'before-after', label: 'Before & After', icon: '✨', desc: 'Transformation showcase', hookStyle: 'visual' },
    { id: 'grwm', label: 'Get Ready With Me', icon: '💄', desc: 'Casual routine integration', hookStyle: 'relatable' },
    { id: 'day-in-life', label: 'Day in My Life', icon: '☀️', desc: 'Natural lifestyle integration', hookStyle: 'storytelling' },
    { id: 'comparison', label: 'Product Comparison', icon: '⚖️', desc: 'Compare with alternatives', hookStyle: 'logic' },
    { id: 'hack', label: 'Life Hack / Tip', icon: '💡', desc: 'Quick useful trick', hookStyle: 'value' },
    { id: 'reaction', label: 'First Reaction', icon: '😮', desc: 'Genuine surprise reaction', hookStyle: 'emotion' },
];

/**
 * Generate a UGC video script using AI + brand knowledge
 * 
 * @param {Object} opts
 * @param {string} opts.brandId - Brand ID
 * @param {string} opts.userId - User ID
 * @param {string} opts.style - UGC style (testimonial, unboxing, etc.)
 * @param {string} [opts.productId] - Product ID (optional, loads product data)
 * @param {string} [opts.productName] - Product name (fallback if no productId)
 * @param {string} [opts.productDescription] - Product description
 * @param {string} [opts.platform] - Target platform (instagram, tiktok, youtube)
 * @param {string} [opts.duration] - Target duration ('15s', '30s', '60s')
 * @param {string} [opts.customPrompt] - Additional user instructions
 * @param {string} [opts.language] - Language (default: english)
 * 
 * Returns { script, hook, cta, estimatedDuration, metadata }
 */
export async function generateUGCScript({
    brandId,
    userId,
    style = 'testimonial',
    productId,
    productName,
    productDescription,
    platform = 'instagram',
    duration = '30s',
    customPrompt = '',
    language = 'english',
}) {
    // Load brand data
    const brand = await Brand.findOne({
        _id: brandId,
        $or: [{ user: userId }, { sharedWith: userId }],
    }).lean();

    if (!brand) throw new Error('Brand not found');

    // Load product data if productId provided
    let product = null;
    if (productId) {
        product = await Product.findOne({ _id: productId, brand: brandId }).lean();
    }

    // Extract brand intelligence
    const brandVoice = brand.dna?.voice || {};
    const contentStyle = brand.dna?.contentStyle || {};
    const styleConfig = UGC_STYLES.find(s => s.id === style) || UGC_STYLES[0];

    // Build product context
    const productContext = product
        ? `PRODUCT NAME: ${product.name}
PRODUCT DESCRIPTION: ${product.description || ''}
PRODUCT PRICE: ${product.price ? `₹${product.price}` : 'Not specified'}
PRODUCT FEATURES: ${(product.features || product.highlights || []).join(', ') || 'Not specified'}
PRODUCT CATEGORY: ${product.category || ''}`
        : `PRODUCT NAME: ${productName || brand.name}
PRODUCT DESCRIPTION: ${productDescription || brand.dna?.brandDescription || ''}`;

    // Build brand voice context
    const voiceContext = `
BRAND VOICE PERSONALITY: ${brandVoice.personality || 'Professional'}
BRAND TONE (0=playful, 100=serious): ${brandVoice.tone || 50}
BRAND WARMTH (0=cool, 100=warm): ${brandVoice.warmth || 50}
BRAND FORMALITY (0=casual, 100=formal): ${brandVoice.formality || 50}
BRAND WIT (0=straight, 100=witty): ${brandVoice.wit || 50}
BRAND VOICE DESCRIPTION: ${brandVoice.description || ''}
SAMPLE BRAND QUOTE: ${brandVoice.sampleQuote || ''}
BRAND KEYWORDS: ${(brandVoice.keywords || []).join(', ')}
WRITING STYLE: ${contentStyle.writingStyle || ''}
CTA STYLE: ${contentStyle.ctaStyle || ''}
EMOJI USAGE: ${contentStyle.emojiUsage || 'minimal'}
KEY PHRASES: ${(contentStyle.keyPhrases || []).join(', ')}
DO's: ${(contentStyle.dos || []).join(', ')}
DON'Ts: ${(contentStyle.donts || []).join(', ')}`;

    // Duration → word count mapping
    const durationMap = { '15s': 40, '30s': 80, '60s': 160, '90s': 240 };
    const targetWords = durationMap[duration] || 80;

    // Platform-specific guidance
    const platformGuide = {
        instagram: 'Instagram Reels — vertical 9:16, hook in first 3 seconds, use trending audio cues, authentic feel',
        tiktok: 'TikTok — vertical 9:16, fast-paced, relatable, use trending formats, Gen-Z appeal',
        youtube: 'YouTube Shorts — vertical 9:16 or horizontal 16:9, can be slightly more detailed, value-driven',
        linkedin: 'LinkedIn — professional but human, thought-leadership angle, 16:9 preferred',
    };

    const prompt = `You are an expert UGC (User-Generated Content) video scriptwriter.

BRAND: ${brand.name}
INDUSTRY: ${brand.dna?.industry || 'Not specified'}
TARGET AUDIENCE: ${brand.dna?.targetAudience || 'General'}
TAGLINE: ${brand.dna?.tagline || ''}

${productContext}

${voiceContext}

VIDEO STYLE: ${styleConfig.label} (${styleConfig.desc})
HOOK STYLE: ${styleConfig.hookStyle}
PLATFORM: ${platformGuide[platform] || platform}
TARGET DURATION: ${duration} (~${targetWords} words)
LANGUAGE: ${language}
${language.toLowerCase() !== 'english' ? `⚠️ CRITICAL: You MUST write the ENTIRE script in ${language}. Use native script/characters (e.g., Devanagari for Hindi, Tamil script for Tamil). Do NOT write in English or transliteration. The avatar will speak in ${language}, so the script must be in ${language} only.` : ''}
${customPrompt ? `\nADDITIONAL INSTRUCTIONS: ${customPrompt}` : ''}

Write a ${duration} UGC video script that:

1. HOOK (first 3 seconds): A strong, attention-grabbing opening line. Make it feel REAL and AUTHENTIC — like a person genuinely excited to share something. Use the "${styleConfig.hookStyle}" hook style.

2. BODY (middle): 
   - Sound like a REAL PERSON, not an ad
   - Naturally weave in 2-3 key product benefits
   - Match the brand's voice personality: ${brandVoice.personality || 'Professional'}
   - Feel unscripted and conversational
   - Use natural pauses and filler words sparingly

3. CTA (last 3-5 seconds): Clear call-to-action that fits the brand's CTA style.

RESPONSE FORMAT (respond in valid JSON only):
{
  "script": "The full script text that the avatar will speak",
  "hook": "Just the hook/opening line (first sentence)",
  "cta": "Just the CTA/closing line",
  "keyBenefits": ["benefit1", "benefit2", "benefit3"],
  "estimatedDuration": "${duration}",
  "tone": "Description of the tone used",
  "suggestedAvatarStyle": "young-female|young-male|professional-female|professional-male|casual"
}`;

    // Get AI router and generate
    const router = getRouter();
    const aiResult = await router.generateText({
        systemPrompt: `You are an expert UGC video scriptwriter. Always respond with valid JSON only.${language.toLowerCase() !== 'english' ? ` IMPORTANT: Write the script, hook, and cta fields in ${language} using native script characters. Do NOT use English.` : ''}`,
        userPrompt: prompt,
        temperature: 0.8,
        maxTokens: 1000,
    }); // Router auto-selects cheapest provider

    // Extract text from result (providers return { text, tokensUsed })
    const response = aiResult.text || aiResult;

    // Parse response
    let result;
    try {
        // Extract JSON from response (handle markdown code blocks)
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            result = JSON.parse(jsonMatch[0]);
        } else {
            throw new Error('No JSON found in response');
        }
    } catch (e) {
        console.warn('⚠️ Failed to parse UGC script JSON, using raw text');
        result = {
            script: response,
            hook: response.split('.')[0] || '',
            cta: '',
            keyBenefits: [],
            estimatedDuration: duration,
            tone: 'conversational',
            suggestedAvatarStyle: 'casual',
        };
    }

    return {
        ...result,
        metadata: {
            brandName: brand.name,
            style: styleConfig.id,
            platform,
            targetWords,
            language,
        },
    };
}

/**
 * Visual DNA Extraction Service
 * AI-powered analysis of brand images to extract design intelligence:
 * - Design style, typography patterns, color application
 * - Layout preferences, image mood, texture styles
 * - Design rules and avoids
 * Used to populate brand.dna.visualDNA for brand-consistent creative generation.
 */

export async function analyzeVisualDNA(brand, options = {}) {
    const { getRouter } = await import('../ai/router.js');
    const router = getRouter();
    
    const dna = brand.dna || {};
    const brandImages = dna.brandImages || [];
    const existingColors = (dna.colors || []).map(c => `${c.name} (${c.hex})`).join(', ');
    const existingFonts = [];
    if (dna.fonts?.heading?.family) existingFonts.push(`Heading: ${dna.fonts.heading.family}`);
    if (dna.fonts?.body?.family) existingFonts.push(`Body: ${dna.fonts.body.family}`);
    
    // Build context from brand images
    const imageContext = brandImages.length > 0
        ? `The brand has ${brandImages.length} images on their website. Image descriptions: ${brandImages.slice(0, 10).map((img, i) => `${i + 1}. ${img.alt || 'No description'} (${img.source || 'website'})`).join('; ')}`
        : 'No brand images available — analyze based on industry, colors, fonts, and brand personality.';
    
    const systemPrompt = `You are a Senior Brand Designer and Visual Identity Expert. 
You analyze brands and extract their visual DNA — the design patterns, aesthetics, and visual rules that make their creative output consistent and recognizable.

Your job: Based on the brand information provided, determine the brand's visual design language and return a structured JSON analysis.

IMPORTANT: Be specific and actionable. Don't give generic answers. Analyze the actual brand data provided to form your assessment.`;

    const userPrompt = `Analyze this brand's visual identity and extract its Visual DNA:

BRAND: ${brand.name}
INDUSTRY: ${dna.industry || 'Unknown'}
BRAND PERSONALITY: ${dna.voice?.personality || 'Not specified'}
TARGET AUDIENCE: ${dna.targetAudience || 'Not specified'}
BRAND DESCRIPTION: ${dna.brandDescription || 'Not specified'}
TAGLINE: ${dna.tagline || 'Not specified'}
PHOTOGRAPHY STYLE: ${dna.photographyStyle || 'Not specified'}
COLORS: ${existingColors || 'Not specified'}
FONTS: ${existingFonts.join(', ') || 'Not specified'}
CONTENT STYLE DOS: ${(dna.contentStyle?.dos || []).join('; ') || 'None'}
CONTENT STYLE DONTS: ${(dna.contentStyle?.donts || []).join('; ') || 'None'}
${imageContext}

Return a JSON object with EXACTLY these fields (use short, precise values):

{
  "designStyle": "<one of: minimalist | bold-graphic | luxury-premium | playful-vibrant | editorial-clean | corporate-sleek | artisanal-handmade | tech-futuristic>",
  "layoutPreference": "<one of: clean-centered | asymmetric-dynamic | grid-based-structured | full-bleed-immersive | card-based-modular>",
  "textPlacement": "<one of: left-aligned-editorial | centered-hero | overlay-on-image | bottom-bar-clean | integrated-with-product>",
  "imageMood": "<one of: bright-airy | dark-moody | warm-golden | cool-blue | high-contrast-dramatic | muted-earthy | neon-electric | soft-pastel>",
  "textureStyle": "<one of: flat-clean | textured-organic | gradient-rich | photographic-realistic | illustrated-artistic | mixed-media>",
  "typographyStyle": "<one of: sans-serif-modern | serif-elegant | bold-display-impact | handwritten-casual | geometric-tech | mixed-hierarchy>",
  "decorativeElements": "<one of: none-minimal | geometric-shapes | organic-curves | borders-frames | icons-badges | pattern-fills>",
  "imageAnalysis": "<2-3 sentence summary of the brand's overall visual approach, aesthetic fingerprint, and what makes it recognizable>",
  "designRules": ["<5 specific 'always do' rules for this brand's creatives — e.g. 'Headlines must be uppercase with generous letter spacing'>"],
  "designAvoid": ["<5 specific 'never do' rules — e.g. 'Avoid gradients on text — solid colors only'>"]
}

Return ONLY the JSON. No markdown, no explanation.`;

    try {
        const result = await router.generateText({
            systemPrompt,
            userPrompt,
            temperature: 0.3,
            maxTokens: 800,
        }, { provider: options.provider || undefined });

        const raw = result.text || '';
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.warn('⚠️ Visual DNA: Could not parse AI response');
            return null;
        }

        const parsed = JSON.parse(jsonMatch[0]);
        
        return {
            designStyle: parsed.designStyle || '',
            layoutPreference: parsed.layoutPreference || '',
            textPlacement: parsed.textPlacement || '',
            imageMood: parsed.imageMood || '',
            textureStyle: parsed.textureStyle || '',
            typographyStyle: parsed.typographyStyle || '',
            decorativeElements: parsed.decorativeElements || '',
            imageAnalysis: parsed.imageAnalysis || '',
            designRules: Array.isArray(parsed.designRules) ? parsed.designRules.slice(0, 5) : [],
            designAvoid: Array.isArray(parsed.designAvoid) ? parsed.designAvoid.slice(0, 5) : [],
            lastAnalyzedAt: new Date(),
        };
    } catch (err) {
        console.error('❌ Visual DNA analysis failed:', err.message);
        return null;
    }
}

/**
 * Retention Studio — AI Prompts
 * 
 * Brand-DNA-aware prompts for each pipeline node.
 * Follows the same pattern as performanceMarketing/prompts.js
 */

// ── Helper: Build rich brand context for Retention Studio ──
export function buildRetentionBrandCtx(brand) {
    if (!brand) return '';
    const dna = brand.dna || {};
    const sections = [
        `BRAND NAME: ${brand.name || 'Unknown'}`,
        brand.website ? `WEBSITE: ${brand.website}` : '',
        dna.industry ? `INDUSTRY: ${dna.industry}` : '',
        dna.tagline ? `TAGLINE: "${dna.tagline}"` : '',
        dna.brandDescription ? `DESCRIPTION: ${dna.brandDescription}` : '',
        dna.targetAudience ? `TARGET AUDIENCE: ${dna.targetAudience}` : '',
    ];

    // Voice
    if (dna.voice) {
        const v = dna.voice;
        sections.push(`BRAND VOICE: ${v.personality || 'Professional'} (Tone: ${v.tone}/100, Warmth: ${v.warmth}/100, Formality: ${v.formality}/100, Wit: ${v.wit}/100, Clarity: ${v.clarity}/100)`);
        if (v.keywords?.length) sections.push(`VOICE KEYWORDS: ${v.keywords.join(', ')}`);
        if (v.sampleQuote) sections.push(`VOICE EXAMPLE: "${v.sampleQuote}"`);
    }

    // Content style
    if (dna.contentStyle) {
        const cs = dna.contentStyle;
        if (cs.ctaStyle) sections.push(`CTA STYLE: ${cs.ctaStyle}`);
        if (cs.emojiUsage) sections.push(`EMOJI USAGE: ${cs.emojiUsage}`);
        if (cs.dos?.length) sections.push(`CONTENT DO's: ${cs.dos.join(', ')}`);
        if (cs.donts?.length) sections.push(`CONTENT DON'Ts: ${cs.donts.join(', ')}`);
        if (cs.keyPhrases?.length) sections.push(`KEY PHRASES: ${cs.keyPhrases.join(', ')}`);
    }

    // Colors
    if (dna.colors?.length) {
        const colorStr = dna.colors.map(c => `${c.usage || 'accent'}: ${c.hex} (${c.name || 'unnamed'})`).join(', ');
        sections.push(`BRAND COLORS: ${colorStr}`);
    }

    // Fonts
    if (dna.fonts) {
        const f = dna.fonts;
        const fontParts = [];
        if (f.heading?.family) fontParts.push(`Heading: ${f.heading.family}`);
        if (f.body?.family) fontParts.push(`Body: ${f.body.family}`);
        if (f.accent?.family) fontParts.push(`Accent: ${f.accent.family}`);
        if (fontParts.length) sections.push(`FONTS: ${fontParts.join(', ')}`);
    }

    // Visual DNA
    if (dna.visualDNA) {
        const vd = dna.visualDNA;
        const vdParts = [];
        if (vd.designStyle) vdParts.push(`Design: ${vd.designStyle}`);
        if (vd.layoutPreference) vdParts.push(`Layout: ${vd.layoutPreference}`);
        if (vd.imageMood) vdParts.push(`Mood: ${vd.imageMood}`);
        if (vd.typographyStyle) vdParts.push(`Typography: ${vd.typographyStyle}`);
        if (vd.decorativeElements) vdParts.push(`Decorations: ${vd.decorativeElements}`);
        if (vdParts.length) sections.push(`VISUAL DNA: ${vdParts.join(', ')}`);
        if (vd.designRules?.length) sections.push(`DESIGN RULES: ${vd.designRules.join('; ')}`);
        if (vd.designAvoid?.length) sections.push(`DESIGN AVOID: ${vd.designAvoid.join('; ')}`);
    }

    // USPs
    if (dna.uniqueSellingPoints?.length) {
        sections.push(`USPs: ${dna.uniqueSellingPoints.join(', ')}`);
    }

    // Logo
    if (dna.logo?.url) {
        sections.push(`LOGO URL: ${dna.logo.url}`);
    }

    return sections.filter(Boolean).join('\n');
}


// ══════════════════════════════════════════════════════════════
// NODE 3: CREATIVE DESIGN — Generate price comparison card
// ══════════════════════════════════════════════════════════════
export function CREATIVE_DESIGN_PROMPT(brandContext) {
    return `You are a world-class email creative designer for D2C brands.

Your task: Generate an HTML/CSS creative component (a "price comparison card") that will be embedded inside an email. This creative shows the customer WHY they should buy on the brand's website instead of Amazon.

═══ BRAND CONTEXT ═══
${brandContext}

═══ REQUIREMENTS ═══
1. Create a SINGLE self-contained HTML block (no external stylesheets, all CSS inline)
2. The creative must be EMAIL-SAFE (no JavaScript, no flexbox, use table-based layout)
3. Include:
   - Product image placeholder: {{productImage}}
   - Amazon price (struck through): {{amazonPrice}}
   - Website price (highlighted, large): {{shopifyPrice}}
   - Savings badge: "Save {{savingsAmount}}!" or "{{savingsPercent}}% OFF"
   - Brand logo: {{logoUrl}}
4. Use the brand's color palette for styling (primary, accent colors)
5. Follow the brand's Visual DNA (design style, mood, typography)
6. Make it visually stunning — this needs to CONVERT

═══ TEMPLATE TYPES ═══
If templateType is specified, follow that style:
- "price-showdown": Side-by-side Amazon vs Website boxes
- "savings-spotlight": Large product image + savings callout badge
- "loyalty-unlock": Price comparison + loyalty/rewards messaging
- "bundle-builder": Cross-sell angle — "Complete your set on our store"
- "vip-welcome": VIP exclusive feel with premium design

═══ OUTPUT FORMAT ═══
Return a JSON object:
{
    "creativeHtml": "<table ...>...</table>",
    "designNotes": "Brief description of design choices made"
}

The HTML must use {{placeholders}} that will be replaced per-contact. Keep it under 15KB.`;
}


// ══════════════════════════════════════════════════════════════
// NODE 4: MAILER COMPOSE — Generate full email HTML
// ══════════════════════════════════════════════════════════════
export function MAILER_COMPOSE_PROMPT(brandContext) {
    return `You are an expert email marketing copywriter and HTML email developer for D2C brands.

Your task: Generate a complete, ready-to-send HTML email that wraps around a product creative and convinces Amazon customers to buy from the brand's website instead.

═══ BRAND CONTEXT ═══
${brandContext}

═══ REQUIREMENTS ═══
1. Generate a COMPLETE HTML email document (DOCTYPE, head, body)
2. EMAIL-SAFE HTML only (table-based layout, inline CSS, no JS)
3. Structure:
   - Email preheader (hidden text for inbox preview)
   - Brand header with logo ({{logoUrl}})
   - Personalized greeting: "Hi {{name}},"
   - Persuasive body copy in the brand's voice explaining WHY to buy direct
   - The product creative block: {{creativeBlock}}
   - Primary CTA button: links to {{ctaUrl}}
   - Secondary benefits (free shipping, warranty, loyalty points, etc.)
   - Footer: unsubscribe link, brand address, social icons
4. The copy must match the brand's voice personality:
   - Follow tone/warmth/formality/wit sliders
   - Use the brand's key phrases and CTA style
   - Respect content do's and don'ts
5. Subject line and preview text must be compelling and on-brand
6. Mobile-responsive (use media queries in <style> in <head>)

═══ OUTPUT FORMAT ═══
Return a JSON object:
{
    "subjectLine": "...",
    "previewText": "...",
    "bodyHtml": "<!DOCTYPE html>...",
    "ctaText": "Shop Now on {{brandName}}.com",
    "toneNotes": "Brief explanation of tone choices"
}

The email must be production-ready. Use {{placeholders}} for dynamic content.
Keep total HTML under 50KB for email client compatibility.`;
}

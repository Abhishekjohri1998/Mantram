/**
 * Pulse Deck — Agentic Campaign Presentation Builder
 *
 * Intelligence: Claude Sonnet 4.6 (claude-sonnet-4-6) — acts as a full creative director
 * Images:       NanoBanana 2 (gemini-3.1-flash-image-preview) — every slide
 * Output:       Premium .pptx uploaded to S3
 */
import PptxGenJS from 'pptxgenjs';
import { v4 as uuidv4 } from 'uuid';
import { callAgent, loadBrandContext } from '../shared/agentUtils.js';
import { laozhangImageGenerate, laozhangMultimodalImageGenerate } from '../videoStudio/laozhangClient.js';
import { uploadToS3 } from '../../utils/s3.js';
import { generateBrandTokens } from '../../utils/brandColorEngine.js';

const CLAUDE_MODEL = 'claude-sonnet-4-6';
const IMAGE_MODEL = 'gemini-3.1-flash-image-preview';

const DECK_SYSTEM = (brandContext, urlBlock) => `You are a strategic creative director.
Your job is to write compelling copy for a premium presentation deck.

CRITICAL RULES:
1. You will receive predefined slide IDs. Fill content for each exactly matching the schema.
2. NEVER output colors, fonts, layouts, or visual elements. We have a robust design system.
3. Every headline should be punchy (max 6 words). Body copy is tight (max 25 words).
4. imagePrompt describes the exact visual. Be highly creative based on the product! For tech, describe macro circuits or UI interfaces; for software, describe analytics infographics; for consumers, lifestyle setups. It must be highly descriptive.

BRAND CONTEXT:
${brandContext}
${urlBlock || ''}

JSON SCHEMA:
{
  "title": "Real deck title",
  "subtitle": "Compelling subtitle",
  "slides": [
    {
      "id": "slide_1", "type": "hero",
      "headline": "...", "body": "...", "cta": "...",
      "imagePrompt": "..."
    },
    {
      "id": "slide_2", "type": "problem",
      "headline": "...", "body": "...",
      "stat": {"number": "...", "label": "..."}
    },
    {
      "id": "slide_3", "type": "solution",
      "headline": "...", "body": "...",
      "imagePrompt": "..."
    },
    {
      "id": "slide_4", "type": "features",
      "headline": "...",
      "items": [
        {"icon": "⚡", "title": "...", "description": "..."} // max 3
      ]
    },
    {
      "id": "slide_5", "type": "testimonial",
      "quote": "...", "author": "...", "role": "..."
    },
    {
      "id": "slide_6", "type": "comparison",
      "headline": "...", "vsLabel": "Us vs Them",
      "features": [
        {"name": "...", "ours": true, "theirs": false} // max 3
      ]
    },
    {
      "id": "slide_7", "type": "how",
      "headline": "...",
      "items": [
        {"title": "...", "description": "..."} // max 4
      ]
    },
    {
      "id": "slide_8", "type": "cta",
      "headline": "...", "body": "...", "ctaText": "..."
    }
  ]
}`;

// Helpers
const hex = (c) => (c || '#FFFFFF').replace('#', '');
const SLIDE_W = 10;
const SLIDE_H = 7.5;

async function generateImage(prompt, slideType, brandContext, referenceImage, tokens) {
    if (!prompt) return null;
    let style = "contemporary premium aesthetic.";
    if (brandContext.toLowerCase().match(/luxury|premium|high-end/)) style = "editorial luxury aesthetic, Vogue quality, highly refined layout.";
    if (tokens?.colors?.primary) style += ` Use a prominent color accent matching the hex code ${tokens.colors.primary} in the composition (e.g. glowing lights, apparel, background gradients).`;
    
    // Add explicitly calculated style DNA
    style += ` Strictly follow this brand ethos: ${brandContext.substring(0, 150).replace(/\n/g, ' ')}`;
    
    try {
        if (referenceImage) {
            const r = await laozhangMultimodalImageGenerate(`${prompt}, ${style}`, [referenceImage], {
                model: IMAGE_MODEL,
                size: slideType === 'hero' ? '1792x1024' : '1024x768',
            });
            return r?.imageUrl || null;
        } else {
            const r = await laozhangImageGenerate(`${prompt}, ${style}`, {
                model: IMAGE_MODEL,
                size: slideType === 'hero' ? '1792x1024' : '1024x768',
            });
            return r?.imageUrl || null;
        }
    } catch (err) {
        return null;
    }
}

async function toBase64(url) {
    if (!url) return null;
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
        if (!res.ok) return null;
        const buf = await res.arrayBuffer();
        return Buffer.from(buf).toString('base64');
    } catch {
        return null;
    }
}

// ── Slide Renderers ────────────────────────────────────────────────

function renderHeroSlide(slide, tokens, imgUrl, ps, pptx, slideNum) {
    const { colors, fonts } = tokens;
    if (imgUrl) {
        ps.addImage({ data: `image/jpeg;base64,${imgUrl}`, x:0, y:0, w:10, h:7.5 });
    }
    ps.addShape(pptx.ShapeType.rect, { x:0, y:0, w:10, h:7.5, fill:{ type:'solid', color:'000000', transparency:42 } });
    ps.addText('INTRODUCING', { x:0.7, y:1.2, w:4, fontSize:10, bold:true, color:'FFFFFF', charSpacing:6, transparency:30 });
    ps.addText(slide.headline || '', { x:0.7, y:1.7, w:7.5, fontSize:52, bold:true, color:'FFFFFF', fontFace:fonts.heading, lineSpacingMultiple:1.1, wrap:true });
    ps.addText(slide.body || '', { x:0.7, y:4.5, w:6, fontSize:18, color:'FFFFFF', transparency:15, wrap:true });
    if (slide.cta) {
        ps.addShape(pptx.ShapeType.rect, { x:0.7, y:5.5, w:2.8, h:0.55, fill: hex(colors.accent), rectRadius: 0.1 });
        ps.addText(slide.cta, { x:0.7, y:5.5, w:2.8, h:0.55, fontSize:14, bold:true, color:'FFFFFF', align:'center', valign:'middle' });
    }
}

function renderStatSlide(slide, tokens, imgUrl, ps, pptx, slideNum) {
    const { colors, fonts } = tokens;
    ps.addShape(pptx.ShapeType.rect, { x:0, y:0, w:10, h:7.5, fill: hex(colors.primaryDark) });
    ps.addShape(pptx.ShapeType.ellipse, { x:6.5, y:-1.5, w:5, h:5, fill:{ color: hex(colors.accent), transparency:88 } });
    ps.addShape(pptx.ShapeType.ellipse, { x:-1.5, y:4, w:4, h:4, fill:{ color: hex(colors.primary), transparency:80 } });
    
    ps.addText('BY THE NUMBERS', { x:0.8, y:1, w:8, fontSize:10, color:hex(colors.accent), charSpacing:5 });
    ps.addText(slide.stat?.number || '', { x:1, y:1.6, w:8, fontSize:88, bold:true, color:hex(colors.accent), align:'center', fontFace:fonts.heading });
    ps.addText(slide.stat?.label || '', { x:1, y:5.2, w:8, fontSize:22, color:'FFFFFF', align:'center', transparency:15 });
    ps.addText(slide.headline || '', { x:1.5, y:6, w:7, fontSize:15, color:'FFFFFF', align:'center', transparency:25, wrap:true });
}

function renderSplitSlide(slide, tokens, imgUrl, ps, pptx, slideNum) {
    const { colors, fonts } = tokens;
    ps.addShape(pptx.ShapeType.rect, { x:0, y:0, w:4.6, h:7.5, fill: hex(colors.primary) });
    ps.addShape(pptx.ShapeType.rect, { x:4.6, y:0, w:5.4, h:7.5, fill: 'FFFFFF' });
    
    if (imgUrl) ps.addImage({ data: `image/jpeg;base64,${imgUrl}`, x:0.25, y:0.7, w:4.1, h:5.8 });
    
    ps.addText(slide.type.toUpperCase(), { x:5, y:1, w:4.5, fontSize:10, color:hex(colors.accent), bold:true, charSpacing:4 });
    ps.addText(slide.headline || '', { x:5, y:1.55, w:4.5, fontSize:34, bold:true, color:hex(colors.text), fontFace:fonts.heading, wrap:true, lineSpacingMultiple:1.1 });
    ps.addText(slide.body || '', { x:5, y:3.8, w:4.4, fontSize:14, color:hex(colors.textLight), wrap:true, lineSpacingMultiple:1.4 });
}

function renderFeatureSlide(slide, tokens, imgUrl, ps, pptx, slideNum) {
    const { colors, fonts } = tokens;
    ps.addShape(pptx.ShapeType.rect, { x:0, y:0, w:10, h:7.5, fill: hex(colors.surfaceAlt) });
    ps.addShape(pptx.ShapeType.rect, { x:0, y:0, w:10, h:1.5, fill: 'FFFFFF' });
    
    ps.addText('FEATURES', { x:0.6, y:0.25, w:9, fontSize:10, color:hex(colors.accent), bold:true, charSpacing:4 });
    ps.addText(slide.headline || '', { x:0.6, y:0.7, w:9, fontSize:24, bold:true, color:hex(colors.text) });
    
    const boxW = 2.9, gap = 0.2, startX = 0.35;
    (slide.items || []).slice(0,3).forEach((item, i) => {
        const x = startX + i * (boxW + gap);
        ps.addShape(pptx.ShapeType.rect, { x, y:1.7, w:boxW, h:5.3, fill: 'FFFFFF', line: { color:'E5E7EB' }, rectRadius:0.06 });
        ps.addShape(pptx.ShapeType.ellipse, { x: x+boxW/2-0.35, y:1.95, w:0.7, h:0.7, fill:{ color: hex(colors.accent), transparency:82 } });
        ps.addText(item.icon || '✓', { x: x+boxW/2-0.35, y:1.95, w:0.7, h:0.7, fontSize:22, align:'center' });
        ps.addText(item.title || '', { x: x+0.2, y:2.9, w:boxW-0.4, fontSize:15, bold:true, color:hex(colors.text), align:'center' });
        ps.addText(item.description || '', { x: x+0.2, y:3.45, w:boxW-0.4, fontSize:12, color:hex(colors.textLight), align:'center', wrap:true, lineSpacingMultiple:1.4 });
    });
}

function renderTestimonialSlide(slide, tokens, imgUrl, ps, pptx, slideNum) {
    const { colors } = tokens;
    ps.addShape(pptx.ShapeType.rect, { x:0, y:0, w:10, h:7.5, fill: hex(colors.surfaceAlt) });
    ps.addText('"', { x:0.5, y:0.3, w:3, fontSize:120, color:hex(colors.accent), transparency:75, fontFace:'Georgia' });
    ps.addText('★★★★★', { x:0.9, y:2.2, w:5, fontSize:20, color:'F59E0B' });
    ps.addText(`"${slide.quote || ''}"`, { x:0.9, y:2.9, w:8.2, fontSize:22, italic:true, color:hex(colors.text), wrap:true, lineSpacingMultiple:1.45 });
    ps.addShape(pptx.ShapeType.rect, { x:0.9, y:5.45, w:1.5, h:0.04, fill: hex(colors.accent) });
    ps.addText(slide.author || '', { x:0.9, y:5.6, w:5, fontSize:16, bold:true, color:hex(colors.text) });
    ps.addText(slide.role || '', { x:0.9, y:6.05, w:5, fontSize:13, color:hex(colors.textLight) });
}

function renderComparisonSlide(slide, tokens, imgUrl, ps, pptx, slideNum) {
    const { colors } = tokens;
    ps.addShape(pptx.ShapeType.rect, { x:0, y:0, w:10, h:7.5, fill: 'FFFFFF' });
    ps.addText('WHY US', { x:0.6, y:0.35, w:9, fontSize:10, color:hex(colors.accent), bold:true, charSpacing:4 });
    ps.addText(slide.headline || '', { x:0.6, y:0.75, w:9, fontSize:26, bold:true, color:hex(colors.text) });
    
    ps.addShape(pptx.ShapeType.rect, { x:0, y:1.8, w:10, h:0.55, fill: hex(colors.primary) });
    ps.addText('FEATURE', { x:0.4, y:1.87, w:4, fontSize:12, bold:true, color:'FFFFFF' });
    ps.addText('✓ Us', { x:6, y:1.87, w:1.8, align:'center', fontSize:12, bold:true, color:'FFFFFF' });
    ps.addText(slide.vsLabel || 'Vs Them', { x:7.9, y:1.87, w:1.8, align:'center', fontSize:12, bold:true, color:'FFFFFF', transparency:20 });
    
    (slide.features || []).slice(0, 5).forEach((f, i) => {
        const rowY = 2.45 + i * 0.62;
        if (i % 2 === 0) ps.addShape(pptx.ShapeType.rect, { x:0, y:rowY-0.1, w:10, h:0.62, fill: hex(colors.surfaceAlt) });
        ps.addText(f.name || '', { x:0.4, y:rowY, w:5, fontSize:13, color:hex(colors.text) });
        ps.addText('✓', { x:6.3, y:rowY, w:1.2, align:'center', fontSize:16, bold:true, color:'22C55E' });
        ps.addText(f.theirs ? '✓' : '✗', { x:8.1, y:rowY, w:1.2, align:'center', fontSize:16, bold:true, color: f.theirs ? '22C55E' : 'EF4444' });
    });
}

function renderProcessSlide(slide, tokens, imgUrl, ps, pptx, slideNum) {
    const { colors } = tokens;
    ps.addShape(pptx.ShapeType.rect, { x:0, y:0, w:10, h:7.5, fill: 'FFFFFF' });
    ps.addText('HOW IT WORKS', { x:0.6, y:0.35, w:9, fontSize:10, color:hex(colors.accent), bold:true, charSpacing:4 });
    ps.addText(slide.headline || '', { x:0.6, y:0.75, w:9, fontSize:26, bold:true, color:hex(colors.text) });
    
    const items = (slide.items || []).slice(0, 4);
    const stepW = 2.1, stepGap = 0.1, startX = 0.3;
    items.forEach((item, i) => {
        const x = startX + i * (stepW + stepGap);
        if (i < items.length - 1) {
            ps.addShape(pptx.ShapeType.rect, { x:x+stepW-0.1, y:2.4, w:0.7, h:0.04, fill:{ color: hex(colors.accent), transparency:50 } });
        }
        ps.addShape(pptx.ShapeType.ellipse, { x:x+stepW/2-0.3, y:2, w:0.6, h:0.6, fill: hex(colors.accent) });
        ps.addText((i+1).toString(), { x:x+stepW/2-0.3, y:2, w:0.6, h:0.6, fontSize:16, bold:true, color:'FFFFFF', align:'center', valign:'middle' });
        ps.addText(item.title || '', { x:x, y:2.8, w:stepW, fontSize:13, bold:true, color:hex(colors.text), align:'center', wrap:true });
        ps.addText(item.description || '', { x:x+0.1, y:3.6, w:stepW-0.2, fontSize:11, color:hex(colors.textLight), align:'center', wrap:true, lineSpacingMultiple:1.35 });
    });
}

function renderCTASlide(slide, tokens, imgUrl, ps, pptx, slideNum) {
    const { colors, fonts } = tokens;
    ps.addShape(pptx.ShapeType.rect, { x:0, y:0, w:10, h:7.5, fill: hex(colors.accent) });
    ps.addShape(pptx.ShapeType.rect, { x:0, y:0, w:10, h:7.5, fill:{ color: hex(colors.primary), transparency:55 } });
    ps.addShape(pptx.ShapeType.ellipse, { x:7, y:-2, w:6, h:6, fill:{ color: 'FFFFFF', transparency:90 } });
    
    ps.addText('READY TO START?', { x:1, y:1.5, w:8, fontSize:11, color:'FFFFFF', align:'center', transparency:25, charSpacing:5 });
    ps.addText(slide.headline || '', { x:1, y:2.1, w:8, fontSize:48, bold:true, color:'FFFFFF', align:'center', wrap:true, fontFace:fonts.heading, lineSpacingMultiple:1.1 });
    ps.addText(slide.body || '', { x:1.5, y:4.6, w:7, fontSize:16, color:'FFFFFF', transparency:15, align:'center', wrap:true });
    
    if (slide.ctaText) {
        ps.addShape(pptx.ShapeType.rect, { x:3.3, y:5.7, w:3.4, h:0.7, fill:'FFFFFF', rectRadius:0.35 });
        ps.addText(slide.ctaText, { x:3.3, y:5.7, w:3.4, h:0.7, fontSize:16, bold:true, color:hex(colors.accent), align:'center', valign:'middle' });
    }
}

// ── Main Export ────────────────────────────────────────────────
export async function generateCampaignDeck({ brandId, brief, deckType = 'Pitch Deck', slideCount = 8, urlContext, referenceImage }) {
    const { brandContext } = await loadBrandContext(brandId);
    const tokens = generateBrandTokens('#6366F1', brandContext);

    console.log('📊 Pulse Deck: Claude designing strategy...');
    const plan = await callAgent(
        DECK_SYSTEM(brandContext, urlContext),
        `BRIEF: ${brief}\nTYPE: ${deckType}\nMake exact 8 slides corresponding to the required IDs: slide_1 to slide_8. Ensure correct type mappings.`,
        0.7, 4000,
        { provider: 'anthropic', model: CLAUDE_MODEL, timeoutMs: 120_000 }
    );

    if (!plan?.slides?.length) throw new Error('Deck generation failed');

    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE'; // 16:9 10x7.5

    const promises = plan.slides.map(async (slide, idx) => {
        let imgUrl = null;
        if (['hero', 'solution'].includes(slide.type)) {
            imgUrl = await generateImage(slide.imagePrompt, slide.type, brandContext, referenceImage, tokens);
        }
        const imgB64 = await toBase64(imgUrl);
        return { slide, idx, imgUrl, imgB64 };
    });

    const renderedSlides = await Promise.all(promises);
    let thumbnailUrl = null;

    renderedSlides.sort((a, b) => a.idx - b.idx).forEach(({ slide, idx, imgB64, imgUrl }) => {
        const ps = pptx.addSlide();
        const slideNum = idx + 1;
        
        try {
            if (slide.type === 'hero') renderHeroSlide(slide, tokens, imgB64, ps, pptx, slideNum);
            else if (slide.type === 'problem' || slide.type === 'stat') renderStatSlide(slide, tokens, imgB64, ps, pptx, slideNum);
            else if (slide.type === 'solution') renderSplitSlide(slide, tokens, imgB64, ps, pptx, slideNum);
            else if (slide.type === 'features') renderFeatureSlide(slide, tokens, imgB64, ps, pptx, slideNum);
            else if (slide.type === 'testimonial') renderTestimonialSlide(slide, tokens, imgB64, ps, pptx, slideNum);
            else if (slide.type === 'comparison') renderComparisonSlide(slide, tokens, imgB64, ps, pptx, slideNum);
            else if (slide.type === 'how') renderProcessSlide(slide, tokens, imgB64, ps, pptx, slideNum);
            else if (slide.type === 'cta') renderCTASlide(slide, tokens, imgB64, ps, pptx, slideNum);
            else renderHeroSlide(slide, tokens, imgB64, ps, pptx, slideNum); // fallback
            
            // Brand Accent Bar (Every slide)
            ps.addShape(pptx.ShapeType.rect, { x:0, y:7.35, w:10, h:0.15, fill: hex(tokens.colors.accent) });
            // Global Slide Number
            ps.addText(`${slideNum} / 8`, { x:9, y:7, w:0.8, fontSize:9, color: slide.type === 'hero' ? 'FFFFFF' : hex(tokens.colors.textLight), transparency: slide.type === 'hero' ? 40 : 0, align:'right' });

            if (slideNum === 1 && imgUrl) thumbnailUrl = imgUrl;
        } catch (err) {
            console.error(`Error rendering slide ${slideNum}:`, err);
        }
    });

    console.log('📊 Pulse Deck: Uploading to S3...');
    const buf = await pptx.write({ outputType: 'nodebuffer' });
    const hostedUrl = await uploadToS3(buf, `pulse-studio/decks/${brandId}/${uuidv4()}.pptx`, 'application/vnd.openxmlformats-officedocument.presentationml.presentation');

    return {
        success: true,
        deckPlan: plan,
        pptxUrl: hostedUrl,
        thumbnailUrl,
        title: plan.title,
        slideCount: plan.slides.length || 8,
    };
}

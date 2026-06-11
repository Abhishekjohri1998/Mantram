/**
 * Pulse Deck — Interactive Web Presentation Builder
 *
 * Intelligence: Claude Sonnet 4.6 — strategic creative director
 * Images:       NanoBanana 2 (gemini-3.1-flash-image-preview) — every visual slide
 * Output:       Reveal.js HTML5 presentation hosted on S3
 */
import { v4 as uuidv4 } from 'uuid';
import { callAgent, loadBrandContext } from '../shared/agentUtils.js';
import { laozhangImageGenerate, laozhangMultimodalImageGenerate } from '../videoStudio/laozhangClient.js';
import { uploadToS3 } from '../../utils/s3.js';
import { generateBrandTokens } from '../../utils/brandColorEngine.js';
import { injectDesignContext } from '../shared/productDesignAgent.js';

const CLAUDE_MODEL = 'claude-sonnet-4-6';
const DEFAULT_IMAGE_MODEL = 'gemini-3.1-flash-image-preview';

// ── Claude Creative Director System Prompt ─────────────────────────
const DECK_SYSTEM = (brandContext, urlBlock) => `You are a world-class strategic creative director at a top-tier agency.
Your job is to write compelling, conversion-driven copy for a premium campaign presentation.

CRITICAL RULES:
1. You will receive predefined slide IDs. Fill content for each exactly matching the schema.
2. NEVER output colors, fonts, layouts, or visual elements. We have a robust design system.
3. Every headline should be punchy (max 8 words). Body copy is tight (max 30 words).
4. imagePrompt describes the exact visual. Be highly creative based on the product!
   - For tech/electronics: describe macro circuits, glowing PCBs, futuristic UI dashboards
   - For software/SaaS: describe analytics infographics, data visualizations, clean UI mockups
   - For food/supplements: describe ingredient explosions, molecular structures, lifestyle shots
   - For fashion/beauty: describe editorial runway shots, texture close-ups, lifestyle scenes
   - For consumer goods: describe product hero shots, lifestyle setups, unboxing moments
   Each imagePrompt must be at least 40 words and hyper-descriptive.
5. Every slide MUST have an imagePrompt — we generate visuals for ALL slides.

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
      "imagePrompt": "Full-bleed cinematic visual description..."
    },
    {
      "id": "slide_2", "type": "problem",
      "headline": "...", "body": "...",
      "stat": {"number": "...", "label": "..."},
      "imagePrompt": "Dramatic visual metaphor for the problem..."
    },
    {
      "id": "slide_3", "type": "solution",
      "headline": "...", "body": "...",
      "imagePrompt": "Product/solution hero shot..."
    },
    {
      "id": "slide_4", "type": "features",
      "headline": "...",
      "items": [
        {"icon": "⚡", "title": "...", "description": "..."},
        {"icon": "🎯", "title": "...", "description": "..."},
        {"icon": "🚀", "title": "...", "description": "..."}
      ],
      "imagePrompt": "Abstract visual showing innovation/features..."
    },
    {
      "id": "slide_5", "type": "testimonial",
      "quote": "...", "author": "...", "role": "...",
      "imagePrompt": "Professional portrait or lifestyle scene..."
    },
    {
      "id": "slide_6", "type": "comparison",
      "headline": "...", "vsLabel": "Us vs Them",
      "features": [
        {"name": "...", "ours": true, "theirs": false},
        {"name": "...", "ours": true, "theirs": false},
        {"name": "...", "ours": true, "theirs": true}
      ],
      "imagePrompt": "Visual metaphor for competitive advantage..."
    },
    {
      "id": "slide_7", "type": "how",
      "headline": "...",
      "items": [
        {"title": "...", "description": "..."},
        {"title": "...", "description": "..."},
        {"title": "...", "description": "..."}
      ],
      "imagePrompt": "Process visualization or workflow infographic..."
    },
    {
      "id": "slide_8", "type": "cta",
      "headline": "...", "body": "...", "ctaText": "...",
      "imagePrompt": "Aspirational, emotional closing visual..."
    }
  ]
}`;

// ── Image Generator ────────────────────────────────────────────────
async function generateImage(prompt, slideType, brandContext, referenceImage, tokens, designContext = null, imageModel = DEFAULT_IMAGE_MODEL) {
    if (!prompt) return null;
    let style = "contemporary premium aesthetic, photorealistic, 8k, cinematic lighting.";
    if (brandContext.toLowerCase().match(/luxury|premium|high-end/)) style = "editorial luxury aesthetic, Vogue quality, highly refined layout, dramatic lighting.";
    if (tokens?.colors?.primary) style += ` Use a prominent color accent matching the hex code ${tokens.colors.primary} in the composition (e.g. glowing lights, apparel, background gradients).`;
    style += ` Brand ethos: ${brandContext.substring(0, 120).replace(/\n/g, ' ')}`;
    style += ` CRITICAL: Do NOT render any text, words, letters, or typography in the image. Pure visual only.`;

    // Inject PDI design context if provided (optional for deck)
    const basePrompt = `${prompt}. ${style}`;
    const fullPrompt = designContext ? injectDesignContext(basePrompt, designContext) : basePrompt;
    const refImages = designContext?.productRefImages || [];

    try {
        const size = slideType === 'hero' || slideType === 'cta' ? '1792x1024' : '1024x768';
        const primaryRef = referenceImage || refImages[0] || null;
        const model = imageModel || DEFAULT_IMAGE_MODEL;
        if (primaryRef) {
            const allRefs = [primaryRef, ...refImages.filter(r => r !== primaryRef)].slice(0, 2);
            const r = await laozhangMultimodalImageGenerate(fullPrompt, allRefs, {
                model, size,
            });
            return r?.imageUrl || null;
        } else {
            const r = await laozhangImageGenerate(fullPrompt, {
                model, size,
            });
            return r?.imageUrl || null;
        }
    } catch (err) {
        console.error(`❌ Deck image generation FAILED for ${slideType}: ${err.message}`);
        console.error(`   Prompt was: ${prompt?.substring(0, 100)}...`);
        return null;
    }
}

// ── Reveal.js HTML Builder ─────────────────────────────────────────
function buildRevealHTML(plan, images, tokens, brandId) {
    const { colors, fonts, radius, shadows } = tokens;
    const esc = (s) => (s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Build each slide section
    const slideSections = (plan.slides || []).map((slide, idx) => {
        const img = images[slide.id] || '';
        const num = idx + 1;

        switch (slide.type) {
            case 'hero':
                return `
        <section data-auto-animate data-background-image="${img}" data-background-size="cover" data-background-opacity="0.35">
          <div class="slide-inner hero-slide">
            <div class="hero-badge">✦ INTRODUCING</div>
            <h1 data-auto-animate-id="headline">${esc(slide.headline)}</h1>
            <p class="hero-body">${esc(slide.body)}</p>
            ${slide.cta ? `<a class="cta-btn">${esc(slide.cta)}</a>` : ''}
          </div>
          <div class="slide-number">${num} / ${plan.slides.length}</div>
        </section>`;

            case 'problem':
                return `
        <section data-auto-animate>
          <div class="slide-inner stat-slide" ${img ? `style="background-image:url('${img}');background-size:cover;background-position:center"` : ''}>
            <div class="stat-overlay"></div>
            <div class="stat-content">
              <div class="section-label">THE CHALLENGE</div>
              <div class="stat-number" data-auto-animate-id="stat">${esc(slide.stat?.number)}</div>
              <div class="stat-label">${esc(slide.stat?.label)}</div>
              <h2>${esc(slide.headline)}</h2>
              <p>${esc(slide.body)}</p>
            </div>
          </div>
          <div class="slide-number">${num} / ${plan.slides.length}</div>
        </section>`;

            case 'solution':
                return `
        <section data-auto-animate>
          <div class="slide-inner split-slide">
            <div class="split-image" ${img ? `style="background-image:url('${img}')"` : ''}></div>
            <div class="split-content">
              <div class="section-label">THE SOLUTION</div>
              <h2 data-auto-animate-id="headline">${esc(slide.headline)}</h2>
              <p>${esc(slide.body)}</p>
            </div>
          </div>
          <div class="slide-number">${num} / ${plan.slides.length}</div>
        </section>`;

            case 'features':
                return `
        <section data-auto-animate>
          <div class="slide-inner features-slide" ${img ? `style="background-image:url('${img}');background-size:cover;background-position:center"` : ''}>
            <div class="features-overlay"></div>
            <div class="features-content">
              <div class="section-label">KEY FEATURES</div>
              <h2>${esc(slide.headline)}</h2>
              <div class="features-grid">
                ${(slide.items || []).slice(0, 3).map(item => `
                  <div class="feature-card">
                    <div class="feature-icon">${item.icon || '✓'}</div>
                    <h3>${esc(item.title)}</h3>
                    <p>${esc(item.description)}</p>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
          <div class="slide-number">${num} / ${plan.slides.length}</div>
        </section>`;

            case 'testimonial':
                return `
        <section data-auto-animate>
          <div class="slide-inner testimonial-slide" ${img ? `style="background-image:url('${img}');background-size:cover;background-position:center"` : ''}>
            <div class="testimonial-overlay"></div>
            <div class="testimonial-content">
              <div class="quote-mark">"</div>
              <div class="stars">★★★★★</div>
              <blockquote>"${esc(slide.quote)}"</blockquote>
              <div class="author-line"></div>
              <div class="author-name">${esc(slide.author)}</div>
              <div class="author-role">${esc(slide.role)}</div>
            </div>
          </div>
          <div class="slide-number">${num} / ${plan.slides.length}</div>
        </section>`;

            case 'comparison':
                return `
        <section data-auto-animate>
          <div class="slide-inner comparison-slide" ${img ? `style="background-image:url('${img}');background-size:cover;background-position:center"` : ''}>
            <div class="comparison-overlay"></div>
            <div class="comparison-content">
              <div class="section-label">WHY CHOOSE US</div>
              <h2>${esc(slide.headline)}</h2>
              <table class="comparison-table">
                <thead>
                  <tr><th>Feature</th><th class="us-col">Us</th><th class="them-col">${esc(slide.vsLabel) || 'Others'}</th></tr>
                </thead>
                <tbody>
                  ${(slide.features || []).slice(0, 5).map(f => `
                    <tr>
                      <td>${esc(f.name)}</td>
                      <td class="us-col"><span class="check">✓</span></td>
                      <td class="them-col">${f.theirs ? '<span class="check dim">✓</span>' : '<span class="cross">✗</span>'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
          <div class="slide-number">${num} / ${plan.slides.length}</div>
        </section>`;

            case 'how':
                return `
        <section data-auto-animate>
          <div class="slide-inner process-slide" ${img ? `style="background-image:url('${img}');background-size:cover;background-position:center"` : ''}>
            <div class="process-overlay"></div>
            <div class="process-content">
              <div class="section-label">HOW IT WORKS</div>
              <h2>${esc(slide.headline)}</h2>
              <div class="process-steps">
                ${(slide.items || []).slice(0, 4).map((item, i) => `
                  <div class="step">
                    <div class="step-num">${i + 1}</div>
                    <h3>${esc(item.title)}</h3>
                    <p>${esc(item.description)}</p>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
          <div class="slide-number">${num} / ${plan.slides.length}</div>
        </section>`;

            case 'cta':
                return `
        <section data-auto-animate data-background-image="${img}" data-background-size="cover" data-background-opacity="0.3">
          <div class="slide-inner cta-slide">
            <div class="section-label" style="opacity:0.6">READY TO START?</div>
            <h1 data-auto-animate-id="headline">${esc(slide.headline)}</h1>
            <p class="cta-body">${esc(slide.body)}</p>
            ${slide.ctaText ? `<a class="cta-btn-large">${esc(slide.ctaText)}</a>` : ''}
          </div>
          <div class="slide-number">${num} / ${plan.slides.length}</div>
        </section>`;

            default:
                return `
        <section>
          <div class="slide-inner">
            <h2>${esc(slide.headline)}</h2>
            <p>${esc(slide.body)}</p>
          </div>
          <div class="slide-number">${num} / ${plan.slides.length}</div>
        </section>`;
        }
    }).join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(plan.title)} — Pulse Studio</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(fonts.heading)}:wght@400;${fonts.headingWeight}&family=${encodeURIComponent(fonts.body)}:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reveal.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/theme/black.css">
  <style>
    :root {
      --brand-primary: ${colors.primary};
      --brand-primary-dark: ${colors.primaryDark};
      --brand-accent: ${colors.accent};
      --brand-accent-dark: ${colors.accentDark};
      --brand-surface: ${colors.surface};
      --brand-surface-alt: ${colors.surfaceAlt};
      --brand-text: ${colors.text};
      --brand-text-light: ${colors.textLight};
      --brand-hero-bg: ${colors.heroBackground};
      --brand-hero-text: ${colors.heroText};
      --brand-hero-cta: ${colors.heroCta};
      --brand-hero-cta-text: ${colors.heroCtaText};
      --font-heading: '${fonts.heading}', sans-serif;
      --font-body: '${fonts.body}', sans-serif;
      --heading-weight: ${fonts.headingWeight};
    }

    /* ── Global Reset ── */
    .reveal { font-family: var(--font-body); }
    .reveal .slides { text-align: left; }
    .reveal .slides section { padding: 0; height: 100vh; }
    .reveal h1, .reveal h2, .reveal h3 {
      font-family: var(--font-heading);
      font-weight: var(--heading-weight);
      text-transform: none;
      letter-spacing: -0.02em;
      line-height: 1.15;
    }
    .reveal p { line-height: 1.6; }

    .slide-inner {
      width: 100%; height: 100vh;
      display: flex; flex-direction: column;
      justify-content: center; padding: 60px 80px;
      box-sizing: border-box; position: relative; z-index: 2;
    }

    .slide-number {
      position: absolute; bottom: 20px; right: 32px;
      font-size: 12px; color: rgba(255,255,255,0.35);
      font-family: var(--font-body); z-index: 10;
      letter-spacing: 0.1em;
    }

    .section-label {
      font-size: 12px; letter-spacing: 0.15em; text-transform: uppercase;
      color: var(--brand-accent); font-weight: 600; margin-bottom: 16px;
    }

    /* ── Hero Slide ── */
    .hero-slide {
      background: linear-gradient(135deg, var(--brand-hero-bg) 40%, transparent 100%);
    }
    .hero-badge {
      display: inline-block; background: rgba(255,255,255,0.12);
      border: 1px solid rgba(255,255,255,0.2); border-radius: 100px;
      padding: 6px 20px; font-size: 12px; font-weight: 600;
      letter-spacing: 0.1em; color: var(--brand-hero-text); margin-bottom: 28px;
    }
    .hero-slide h1 {
      font-size: 72px; color: var(--brand-hero-text); margin: 0 0 24px 0;
      max-width: 800px;
    }
    .hero-body {
      font-size: 22px; color: var(--brand-hero-text); opacity: 0.85;
      max-width: 560px; margin: 0 0 32px 0;
    }
    .cta-btn {
      display: inline-block; background: var(--brand-hero-cta);
      color: var(--brand-hero-cta-text); padding: 14px 36px;
      border-radius: 10px; font-weight: 700; font-size: 16px;
      text-decoration: none; cursor: pointer;
      box-shadow: 0 8px 24px rgba(0,0,0,0.2);
      transition: transform 0.3s ease, box-shadow 0.3s ease;
    }
    .cta-btn:hover { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(0,0,0,0.3); }

    /* ── Stat / Problem Slide ── */
    .stat-slide { position: relative; }
    .stat-overlay {
      position: absolute; inset: 0; z-index: 1;
      background: linear-gradient(135deg, var(--brand-primary-dark) 60%, rgba(0,0,0,0.7));
    }
    .stat-content {
      position: relative; z-index: 2; text-align: center;
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; height: 100vh; padding: 40px;
    }
    .stat-number {
      font-size: 120px; font-weight: 900; color: var(--brand-accent);
      font-family: var(--font-heading); line-height: 1; margin: 20px 0 8px;
    }
    .stat-label { font-size: 22px; color: rgba(255,255,255,0.8); margin-bottom: 32px; }
    .stat-content h2 { color: #fff; font-size: 36px; margin: 0 0 12px; text-align: center; }
    .stat-content p { color: rgba(255,255,255,0.7); font-size: 18px; max-width: 600px; text-align: center; }

    /* ── Split Slide (Solution) ── */
    .split-slide {
      flex-direction: row; padding: 0;
    }
    .split-image {
      width: 48%; height: 100vh;
      background-size: cover; background-position: center;
      background-color: var(--brand-primary-dark);
    }
    .split-content {
      width: 52%; padding: 60px 64px;
      display: flex; flex-direction: column; justify-content: center;
      background: #fff;
    }
    .split-content h2 { color: var(--brand-text); font-size: 42px; margin: 0 0 20px; }
    .split-content p { color: var(--brand-text-light); font-size: 18px; line-height: 1.7; }

    /* ── Features Slide ── */
    .features-slide { position: relative; }
    .features-overlay {
      position: absolute; inset: 0; z-index: 1;
      background: linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.96) 100%);
    }
    .features-content {
      position: relative; z-index: 2;
      display: flex; flex-direction: column; justify-content: center;
      height: 100vh; padding: 60px 80px;
    }
    .features-content h2 { color: var(--brand-text); font-size: 40px; margin: 0 0 40px; }
    .features-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 32px; }
    .feature-card {
      background: #fff; border-radius: 16px; padding: 36px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.06);
      border: 1px solid rgba(0,0,0,0.06);
      transition: transform 0.4s ease, box-shadow 0.4s ease;
    }
    .feature-card:hover { transform: translateY(-8px); box-shadow: 0 16px 48px rgba(0,0,0,0.12); }
    .feature-icon {
      font-size: 36px; margin-bottom: 16px;
      width: 64px; height: 64px; display: flex;
      align-items: center; justify-content: center;
      background: var(--brand-surface-alt); border-radius: 16px;
    }
    .feature-card h3 { font-size: 18px; color: var(--brand-text); margin: 0 0 8px; font-weight: 700; }
    .feature-card p { font-size: 14px; color: var(--brand-text-light); line-height: 1.5; margin: 0; }

    /* ── Testimonial Slide ── */
    .testimonial-slide { position: relative; }
    .testimonial-overlay {
      position: absolute; inset: 0; z-index: 1;
      background: linear-gradient(135deg, var(--brand-surface-alt) 70%, rgba(255,255,255,0.85));
    }
    .testimonial-content {
      position: relative; z-index: 2;
      display: flex; flex-direction: column; justify-content: center;
      height: 100vh; padding: 60px 100px;
    }
    .quote-mark { font-size: 140px; color: var(--brand-accent); opacity: 0.2; line-height: 0.8; font-family: Georgia; }
    .stars { font-size: 24px; color: #F59E0B; margin-bottom: 20px; }
    blockquote {
      font-size: 28px; color: var(--brand-text); font-style: italic;
      line-height: 1.5; margin: 0 0 32px; max-width: 700px;
    }
    .author-line { width: 60px; height: 3px; background: var(--brand-accent); margin-bottom: 16px; }
    .author-name { font-size: 18px; font-weight: 700; color: var(--brand-text); }
    .author-role { font-size: 14px; color: var(--brand-text-light); margin-top: 4px; }

    /* ── Comparison Slide ── */
    .comparison-slide { position: relative; }
    .comparison-overlay {
      position: absolute; inset: 0; z-index: 1;
      background: linear-gradient(180deg, rgba(255,255,255,0.94), rgba(255,255,255,0.97));
    }
    .comparison-content {
      position: relative; z-index: 2;
      display: flex; flex-direction: column; justify-content: center;
      height: 100vh; padding: 60px 80px;
    }
    .comparison-content h2 { font-size: 40px; color: var(--brand-text); margin: 0 0 40px; }
    .comparison-table { width: 100%; border-collapse: collapse; font-size: 16px; }
    .comparison-table thead tr {
      background: var(--brand-primary); color: #fff;
    }
    .comparison-table th { padding: 14px 20px; text-align: left; font-weight: 600; }
    .comparison-table td { padding: 14px 20px; border-bottom: 1px solid rgba(0,0,0,0.06); color: var(--brand-text); }
    .comparison-table tbody tr:nth-child(even) { background: var(--brand-surface-alt); }
    .us-col { text-align: center; width: 100px; }
    .them-col { text-align: center; width: 100px; }
    .check { color: #22C55E; font-size: 20px; font-weight: 700; }
    .check.dim { opacity: 0.4; }
    .cross { color: #EF4444; font-size: 20px; font-weight: 700; }

    /* ── Process Slide ── */
    .process-slide { position: relative; }
    .process-overlay {
      position: absolute; inset: 0; z-index: 1;
      background: linear-gradient(135deg, var(--brand-primary-dark) 50%, rgba(0,0,0,0.75));
    }
    .process-content {
      position: relative; z-index: 2;
      display: flex; flex-direction: column; justify-content: center;
      height: 100vh; padding: 60px 80px;
    }
    .process-content .section-label { color: var(--brand-accent); }
    .process-content h2 { font-size: 40px; color: #fff; margin: 0 0 48px; }
    .process-steps { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 24px; }
    .step {
      background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.1);
      border-radius: 16px; padding: 28px 24px;
      transition: transform 0.4s ease, background 0.4s ease;
    }
    .step:hover { transform: translateY(-6px); background: rgba(255,255,255,0.12); }
    .step-num {
      width: 42px; height: 42px; border-radius: 50%;
      background: var(--brand-accent); color: #fff;
      display: flex; align-items: center; justify-content: center;
      font-weight: 800; font-size: 18px; margin-bottom: 16px;
    }
    .step h3 { font-size: 16px; color: #fff; margin: 0 0 8px; font-weight: 700; }
    .step p { font-size: 13px; color: rgba(255,255,255,0.7); line-height: 1.5; margin: 0; }

    /* ── CTA Slide ── */
    .cta-slide {
      align-items: center; text-align: center;
      background: linear-gradient(135deg, var(--brand-accent), var(--brand-primary));
    }
    .cta-slide h1 { font-size: 64px; color: #fff; margin: 0 0 20px; }
    .cta-body { font-size: 20px; color: rgba(255,255,255,0.85); max-width: 550px; margin: 0 auto 36px; }
    .cta-btn-large {
      display: inline-block; background: #fff;
      color: var(--brand-accent); padding: 18px 48px;
      border-radius: 14px; font-weight: 800; font-size: 18px;
      text-decoration: none; cursor: pointer;
      box-shadow: 0 12px 40px rgba(0,0,0,0.2);
      transition: transform 0.3s ease, box-shadow 0.3s ease;
    }
    .cta-btn-large:hover { transform: translateY(-3px) scale(1.03); box-shadow: 0 16px 48px rgba(0,0,0,0.3); }

    /* ── Brand accent bar across all slides ── */
    .reveal .slides section::after {
      content: ''; position: absolute; bottom: 0; left: 0;
      width: 100%; height: 4px; z-index: 100;
      background: linear-gradient(90deg, var(--brand-primary), var(--brand-accent));
    }

    /* ── Print PDF mode ── */
    @media print {
      .reveal .slides section { page-break-after: always; }
      .slide-number { display: none; }
    }
  </style>
</head>
<body>
  <div class="reveal">
    <div class="slides">
${slideSections}
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reveal.js"></script>
  <script>
    Reveal.initialize({
      hash: true,
      transition: 'slide',
      transitionSpeed: 'default',
      backgroundTransition: 'fade',
      autoAnimateEasing: 'ease-out',
      autoAnimateDuration: 0.8,
      controls: true,
      controlsLayout: 'bottom-right',
      progress: true,
      center: false,
      width: '100%',
      height: '100%',
      margin: 0,
      minScale: 1,
      maxScale: 1,
    });
  </script>
</body>
</html>`;
}

// ── Main Export ────────────────────────────────────────────────
export async function generateCampaignDeck({ brandId, brief, deckType = 'Pitch Deck', slideCount = 8, urlContext, referenceImage, designContext = null, imageModel }) {
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

    // Generate images for ALL slides in parallel
    console.log(`📊 Pulse Deck: Generating visuals for all slides via NanoBanana 2${designContext ? ' (PDI-guided)' : ''}...`);
    const imagePromises = plan.slides.map(async (slide) => {
        const imgUrl = await generateImage(slide.imagePrompt, slide.type, brandContext, referenceImage, tokens, designContext, imageModel);
        return { key: slide.id, url: imgUrl };
    });

    const imageResults = await Promise.allSettled(imagePromises);
    const images = {};
    let thumbnailUrl = null;
    for (const r of imageResults) {
        if (r.status === 'fulfilled' && r.value.url) {
            images[r.value.key] = r.value.url;
            if (!thumbnailUrl) thumbnailUrl = r.value.url;
        }
    }

    console.log(`📊 Pulse Deck: ${Object.keys(images).length}/${plan.slides.length} images generated. Building interactive presentation...`);

    const html = buildRevealHTML(plan, images, tokens, brandId);
    const slug = uuidv4().substring(0, 8);

    const hostedUrl = await uploadToS3(
        Buffer.from(html),
        `pulse-studio/decks/${brandId || 'anon'}/${slug}.html`,
        'text/html'
    );

    return {
        success: true,
        deckPlan: plan,
        hostedUrl,
        thumbnailUrl,
        images,
        tokens,
        title: plan.title,
        slideCount: plan.slides.length || 8,
        html,
    };
}

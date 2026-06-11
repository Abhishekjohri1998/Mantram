/**
 * Pulse Page — Interactive Campaign Landing Page Builder
 *
 * Intelligence Stack:
 *   MCP market research → Claude Opus creative director
 *   → NanoBanana 2 images → GSAP + Lenis + Chart.js HTML
 *   → S3 host + Shopify publish + embed code
 */
import { v4 as uuidv4 } from 'uuid';
import { callAgent, loadBrandContext } from '../shared/agentUtils.js';
import { callMcpToolsParallel } from '../../mcp/registry.js';
import { laozhangImageGenerate, laozhangMultimodalImageGenerate } from '../videoStudio/laozhangClient.js';
import { uploadToS3 } from '../../utils/s3.js';
import { generateBrandTokens } from '../../utils/brandColorEngine.js';
import fetch from 'node-fetch';

const CLAUDE_OPUS = 'claude-3-5-sonnet-20241022';

// ── Fixed Sections Scaffold ────────────────────────────────────────

const SECTION_TEMPLATE = [
    { id: 'sec_hero', type: 'hero' },
    { id: 'sec_problem', type: 'problem' },
    { id: 'sec_solution', type: 'solution' },
    { id: 'sec_features', type: 'features' },
    { id: 'sec_stats', type: 'stats' },
    { id: 'sec_proof', type: 'social_proof' },
    { id: 'sec_how', type: 'how_it_works' },
    { id: 'sec_faq', type: 'faq' },
    { id: 'sec_cta', type: 'cta_final' },
];

// ── Phase 1: MCP Market Intelligence ──────────────────────────
async function gatherIntelligence(brief, brandId) {
    try {
        const results = await callMcpToolsParallel([
            { tool: 'web_search', args: { query: `${brief} market trends 2026`, mode: 'quick' } },
            { tool: 'fetch_trending', args: { brandId } },
        ]);
        const snippets = results['web_search']?.data?.results
            ?.slice(0, 3).map(r => `• ${r.title}: ${r.snippet}`).join('\n') || '';
        const trending = results['fetch_trending']?.data?.trending
            ?.slice(0, 3).map(t => `• ${t.topic}: ${t.description}`).join('\n') || '';
        return { marketContext: snippets, trending, hasIntel: !!(snippets || trending) };
    } catch {
        return { marketContext: '', trending: '', hasIntel: false };
    }
}

// ── Phase 2: Claude Creative Director ─────────────────────────
export const PAGE_SYSTEM = (brandContext, intel, urlContext) => `You are a world-class strategic copywriter.
Your job is to write compelling, conversion-focused copy for a campaign landing page.

CRITICAL RULES:
1. You will receive predefined section IDs. You must fill each ID with real content.
2. NEVER output colors, fonts, layouts, animations, or any visual CSS/style parameters. We have a strict design system for that.
3. Every "headline" MUST be max 8 words, action-first.
4. Every "body" MUST be max 50 words, benefit-led.
5. Provide realistic content for stats, testimonials, features, and faqs.
6. The "imagePrompt" describes the exact visual. Be highly creative based on the product! For tech, describe macro circuits or UI interfaces; for supplements, infographics; for consumers, lifestyle setups. It is OK to request text or charts in the visual.

BRAND CONTEXT:
${brandContext}
${intel.hasIntel ? `\nLIVE MARKET INTELLIGENCE:\n${intel.marketContext}\nTrending: ${intel.trending}` : ''}
${urlContext ? `\nPRODUCT/CAMPAIGN DATA:\n${urlContext}` : ''}

JSON SCHEMA (Return exactly this structure with filled content):
{
  "pageStrategy": {
    "coreMessage": "Core message",
    "emotionalJourney": "Emotion A to B",
    "conversionGoal": "Desired action",
    "uniqueAngle": "Differentiator"
  },
  "seo": {
    "title": "Page title — 50-60 chars",
    "description": "Meta description — 120-160 chars",
    "slug": "url-friendly-slug-for-this-page"
  },
  "sections": [
    {
      "id": "sec_hero",
      "headline": "Real headline",
      "body": "Real body",
      "ctaPrimary": "Primary CTA text",
      "ctaSecondary": "Secondary CTA text",
      "imagePosition": "right", // left, right, background, or none
      "imagePrompt": "Commercial photography prompt..."
    },
    {
      "id": "sec_problem",
      "headline": "...",
      "body": "..."
    },
    {
      "id": "sec_solution",
      "headline": "...",
      "body": "...",
      "items": [
         { "icon": "✓", "title": "...", "description": "..." } // max 3
      ],
      "cta": "...",
      "imagePrompt": "..."
    },
    {
      "id": "sec_features",
      "headline": "...",
      "body": "...",
      "items": [
         { "icon": "emoji", "title": "...", "description": "..." } // exactly 3
      ]
    },
    {
      "id": "sec_stats",
      "headline": "...",
      "stats": [
         { "number": "10000", "label": "Label", "prefix": "", "suffix": "+" } // 3 to 4
      ],
      "hasChart": false
    },
    {
      "id": "sec_proof",
      "headline": "...",
      "testimonials": [
         { "quote": "...", "author": "Name", "role": "Title", "rating": 5 } // 2 to 3
      ]
    },
    {
      "id": "sec_how",
      "headline": "...",
      "body": "...",
      "items": [
         { "title": "Step 1", "description": "..." } // 3 to 4
      ]
    },
    {
      "id": "sec_faq",
      "headline": "...",
      "faqs": [
         { "question": "...", "answer": "..." } // 3 to 4
      ]
    },
    {
      "id": "sec_cta",
      "headline": "...",
      "body": "...",
      "cta": "..."
    }
  ]
}`;

// ── Phase 3: Image Generation ──────────────────────────────────
function buildBrandImagePrompt(basePrompt, type, brandContext, tokens, designContext) {
    if (!basePrompt) return null;
    let style = "contemporary premium aesthetic.";
    if (brandContext.toLowerCase().match(/luxury|premium|high-end/)) style = "editorial luxury aesthetic, Vogue quality, highly refined layout.";
    if (brandContext.toLowerCase().match(/bold|energetic|sport|fitness/)) style = "high energy, bold graphic, Nike campaign.";
    if (tokens?.colors?.primary) style += ` Use a prominent color accent matching the hex code ${tokens.colors.primary} in the composition.`;
    
    // Add explicitly calculated style DNA
    style += ` Strictly follow this brand ethos: ${brandContext.substring(0, 150).replace(/\n/g, ' ')}`;
    
    // PDI Color Guard & Mood injection
    if (designContext?.colorGuardHex?.length) {
        style += ` STRICT COLOR GUARD: Preserve exactly these product hex colors: ${designContext.colorGuardHex.join(', ')}. Do NOT alter product color under any circumstances.`;
    }
    if (designContext?.moodLabel) {
        style += ` Visual mood directive: ${designContext.moodLabel}. ${designContext.shootDirective || ''}`;
    }

    if (type === 'hero' || type === 'background') {
        return `${basePrompt}, cinematic lighting, photorealistic, 8k resolution. ${style}`;
    } else {
        return `${basePrompt}, clean three-point studio lighting, commercial grade product quality, ultra sharp. ${style}`;
    }
}

async function generatePageImages(plan, brandContext, referenceImage, tokens, designContext, imageModel) {
    const model = imageModel || 'gemini-3.1-flash-image-preview';
    const tasks = [];
    for (const s of (plan.sections || [])) {
        if (!s.imagePrompt) continue;
        const size = s.id === 'sec_hero' ? '1792x1024' : '1024x768';
        const finalPrompt = buildBrandImagePrompt(s.imagePrompt, s.id === 'sec_hero' ? 'hero' : 'product', brandContext, tokens, designContext);
        
        tasks.push({
            key: s.id,
            prompt: finalPrompt,
            size,
        });
    }

    console.log(`🌐 Generating ${tasks.length} images via NanoBanana 2...`);
    const results = await Promise.allSettled(
        tasks.map(async ({ key, prompt, size }) => {
            if (referenceImage) {
                const r = await laozhangMultimodalImageGenerate(prompt, [referenceImage], { model, size });
                return { key, url: r?.imageUrl || null };
            } else {
                const r = await laozhangImageGenerate(prompt, { model, size });
                return { key, url: r?.imageUrl || null };
            }
        })
    );

    const images = {};
    for (const r of results) {
        if (r.status === 'fulfilled' && r.value.url) images[r.value.key] = r.value.url;
    }
    return images;
}

// ── Phase 4: HTML Assembly (Agency Grade Design) ────────────────

function buildInteractiveHTML(plan, images, tokens, brandId, slug) {
    const { colors, fonts, spacing, radius, shadows } = tokens;

    const buildHero = (s) => `
    <section id="${s.id}" class="hero-section" style="background:${colors.heroBackground};min-height:100vh;position:relative;overflow:hidden">
      ${images[s.id] && s.imagePosition === 'background' ? `
        <div style="position:absolute;inset:0;z-index:0;overflow:hidden">
          <img id="hero-bg-img" src="${images[s.id]}" style="width:100%;height:120%;object-fit:cover;opacity:0.35" data-parallax="0.3"/>
        </div>
        <div style="position:absolute;inset:0;z-index:1;background:linear-gradient(135deg, ${colors.heroBackground} 40%, transparent 100%)"></div>` : ''}
      
      <div class="container" style="position:relative;z-index:2;display:grid;grid-template-columns:${images[s.id] && s.imagePosition === 'right' ? '1fr 1fr' : '1fr'};gap:64px;align-items:center;min-height:100vh">
        <div class="reveal">
          <div style="display:inline-flex;gap:8px;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.2);border-radius:${radius.pill};padding:6px 18px;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${colors.heroText};margin-bottom:28px">
            ✦ INTRODUCING
          </div>
          <h1 id="hero-headline" style="color:${colors.heroText}">${s.headline || ''}</h1>
          <p id="hero-body" style="color:${colors.heroText};opacity:0.85;max-width:540px">${s.body || ''}</p>
          <div id="hero-ctas" style="display:flex;gap:16px;flex-wrap:wrap">
            <a href="#cta" class="btn btn-primary" style="background:${colors.heroCta};color:${colors.heroCtaText}">${s.ctaPrimary || 'Get Started'}</a>
            ${s.ctaSecondary ? `<a href="#features" class="btn btn-ghost" style="border:2px solid rgba(255,255,255,0.35);color:${colors.heroText}">${s.ctaSecondary}</a>` : ''}
          </div>
        </div>
        ${images[s.id] && s.imagePosition === 'right' ? `
        <div class="reveal-right" style="position:relative">
          <img src="${images[s.id]}" style="width:100%;border-radius:${radius.image};box-shadow:${shadows.image};object-fit:cover" />
          <div style="position:absolute;bottom:-24px;left:-24px;background:#FFFFFF;border-radius:${radius.card};padding:16px 24px;box-shadow:${shadows.card};display:flex;gap:12px;align-items:center">
             <div style="font-size:28px;font-weight:800;color:${colors.accent}">1.0</div>
             <div style="font-size:13px;color:${colors.textLight}">Launch<br/>Edition</div>
          </div>
        </div>` : ''}
      </div>
      
      <div style="position:absolute;bottom:40px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:8px;opacity:0.6">
         <span style="font-size:11px;letter-spacing:3px;color:${colors.heroText};text-transform:uppercase">SCROLL</span>
         <div id="scroll-dot" style="width:6px;height:32px;border-radius:3px;background:${colors.heroText}"></div>
      </div>
    </section>`;

    const buildProblem = (s) => `
    <section id="${s.id}" class="section" style="background:${colors.primaryDark};padding:${spacing.sectionPad} 24px">
      <div class="container reveal" style="max-width:900px;text-align:center">
        <div style="font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:${colors.accent};margin-bottom:20px">THE PROBLEM</div>
        <h2 style="color:#FFFFFF;max-width:800px;margin:0 auto 28px">${s.headline || ''}</h2>
        <p style="font-size:18px;color:rgba(255,255,255,0.75);max-width:680px;margin:0 auto">${s.body || ''}</p>
      </div>
    </section>`;

    const buildSolution = (s) => `
    <section id="${s.id}" class="section" style="background:${colors.background};padding:${spacing.sectionPad} 24px">
      <div class="container reveal">
        <div class="split">
          ${images[s.id] ? `
          <div style="position:relative">
            <img src="${images[s.id]}" style="width:100%;border-radius:24px;box-shadow:${shadows.image}" data-parallax="-0.15" />
            <div style="position:absolute;bottom:-20px;left:-20px;width:200px;height:200px;border-radius:24px;background:${colors.accent};opacity:0.15;z-index:-1"></div>
          </div>
          ` : '<div></div>'}
          <div>
            <div style="font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:${colors.accent};margin-bottom:16px">THE SOLUTION</div>
            <h2>${s.headline || ''}</h2>
            <p style="color:${colors.textLight};margin-bottom:32px">${s.body || ''}</p>
            <div style="display:flex;flex-direction:column;gap:16px;margin-bottom:32px">
              ${(s.items || []).map(i => `
                <div style="display:flex;gap:12px;align-items:center">
                  <div style="width:28px;height:28px;border-radius:50%;background:${colors.featureIconBg};color:${colors.featureIcon};display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700">✓</div>
                  <div style="font-size:15px;font-weight:500;color:${colors.text}">${i.title || ''}</div>
                </div>
              `).join('')}
            </div>
            ${s.cta ? `<a href="#cta" style="color:${colors.accent};font-weight:700;font-size:16px;text-decoration:none">${s.cta} →</a>` : ''}
          </div>
        </div>
      </div>
    </section>`;

    const buildFeatures = (s) => `
    <section id="${s.id}" class="section" style="background:${colors.surfaceAlt};padding:${spacing.sectionPad} 24px">
      <div class="container">
        <div class="reveal" style="text-align:center;max-width:700px;margin:0 auto 64px">
          <div style="font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:${colors.accent};margin-bottom:16px">FEATURES</div>
          <h2 style="color:${colors.text}">${s.headline || ''}</h2>
          <p style="color:${colors.textLight};margin-top:16px">${s.body || ''}</p>
        </div>
        <div class="grid-3 stagger-grid">
          ${(s.items || []).slice(0,3).map(i => `
            <div class="feature-card" style="background:#FFFFFF;border-radius:${radius.card};padding:${spacing.cardPad};box-shadow:${shadows.card};border:1px solid rgba(0,0,0,0.06)">
              <div style="width:56px;height:56px;border-radius:14px;background:${colors.featureIconBg};display:flex;align-items:center;justify-content:center;font-size:28px;margin-bottom:20px">${i.icon || '✦'}</div>
              <h4 style="color:${colors.text};margin-bottom:10px">${i.title || ''}</h4>
              <p style="color:${colors.textLight};font-size:15px">${i.description || ''}</p>
            </div>
          `).join('')}
        </div>
      </div>
    </section>`;

    const buildStats = (s) => `
    <section id="${s.id}" class="section" style="background:${colors.statBackground};padding:${spacing.sectionPad} 24px;position:relative;overflow:hidden">
      <!-- Decorative -->
      <div style="position:absolute;top:-100px;right:-100px;width:400px;height:400px;border-radius:50%;background:${colors.accent};opacity:0.08"></div>
      <div style="position:absolute;bottom:-80px;left:-80px;width:300px;height:300px;border-radius:50%;background:${colors.primaryLight};opacity:0.15"></div>
      
      <div class="container position-relative z-2">
        <div class="reveal" style="text-align:center;margin-bottom:64px">
          <div style="font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:${colors.accent};margin-bottom:16px">BY THE NUMBERS</div>
          <h2 style="color:${colors.text}">${s.headline || ''}</h2>
        </div>
        <div style="display:grid;grid-template-columns:repeat(${Math.min(s.stats?.length || 3, 4)}, 1fr);gap:24px" class="stagger-grid">
          ${(s.stats || []).map(stat => `
            <div style="text-align:center;padding:40px 24px">
              <div class="stat-counter" data-target="${parseFloat(stat.number?.replace(/[^0-9.]/g, '') || 0)}" data-prefix="${stat.prefix || ''}" data-suffix="${stat.suffix || ''}" style="font-size:clamp(52px,7vw,88px);font-weight:800;color:${colors.statNumber};font-family:${fonts.heading};line-height:1">0</div>
              <div style="font-size:15px;font-weight:500;color:${colors.statLabel};margin-top:8px;text-transform:uppercase;letter-spacing:0.05em">${stat.label || ''}</div>
            </div>
          `).join('')}
        </div>
      </div>
    </section>`;

    const buildProof = (s) => `
    <section id="${s.id}" class="section" style="background:${colors.background};padding:${spacing.sectionPad} 24px">
      <div class="container reveal">
        <div style="text-align:center;margin-bottom:64px">
           <div style="font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:${colors.accent};margin-bottom:16px">WHAT CUSTOMERS SAY</div>
           <h2 style="color:${colors.text}">${s.headline || ''}</h2>
        </div>
        <div style="column-count: 3; column-gap: 24px" class="stagger-grid">
          ${(s.testimonials || []).map(t => `
            <div style="background:${colors.surface};border-radius:${radius.card};padding:28px 24px;border:1px solid rgba(0,0,0,0.06);box-shadow:${shadows.card};break-inside:avoid;margin-bottom:24px;display:inline-block;width:100%">
              <div style="color:${colors.testimonialStars};font-size:18px;margin-bottom:14px">${'★'.repeat(t.rating || 5)}</div>
              <p style="font-size:15px;color:${colors.testimonialText};font-style:italic;margin-bottom:20px;line-height:1.75">"${t.quote || ''}"</p>
              <div style="display:flex;gap:12px;align-items:center">
                 <div style="width:44px;height:44px;border-radius:50%;background:${colors.accent};color:#FFFFFF;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px">${(t.author || 'A').charAt(0)}</div>
                 <div>
                    <div style="font-weight:700;font-size:14px;color:${colors.text}">${t.author || ''}</div>
                    <div style="font-size:13px;color:${colors.textLight}">${t.role || ''}</div>
                 </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </section>`;

    const buildHow = (s) => `
    <section id="${s.id}" class="section" style="background:${colors.surfaceAlt};padding:${spacing.sectionPad} 24px">
      <div class="container reveal">
        <div style="text-align:center;margin-bottom:64px">
           <h2 style="color:${colors.text}">${s.headline || ''}</h2>
           <p style="color:${colors.textLight};margin-top:16px">${s.body || ''}</p>
        </div>
        <div style="max-width:760px;margin:0 auto" class="stagger-grid">
          ${(s.items || []).map((item, i) => `
            <div style="display:flex;gap:28px;align-items:flex-start;margin-bottom:40px;position:relative">
              ${i < s.items.length - 1 ? `<div style="position:absolute;left:23px;top:52px;width:2px;height:calc(100% - 52px + 40px);background:linear-gradient(${colors.accent}40, ${colors.accent}10)"></div>` : ''}
              <div style="width:48px;height:48px;border-radius:50%;background:${colors.accent};color:#FFFFFF;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;box-shadow:0 4px 12px ${colors.accent}40;flex-shrink:0">${i + 1}</div>
              <div>
                <h4 style="font-size:19px;color:${colors.text};margin-bottom:8px">${item.title || ''}</h4>
                <p style="font-size:15px;color:${colors.textLight};line-height:1.7">${item.description || ''}</p>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </section>`;

    const buildFaq = (s) => `
    <section id="${s.id}" class="section" style="background:${colors.background};padding:${spacing.sectionPad} 24px">
      <div class="container reveal" style="max-width:800px">
        <h2 style="text-align:center;color:${colors.text};margin-bottom:64px">${s.headline || ''}</h2>
        <div>
          ${(s.faqs || []).map(f => `
            <details style="border-bottom:1px solid rgba(0,0,0,0.08)">
              <summary style="display:flex;justify-content:space-between;align-items:center;padding:22px 0;font-size:17px;font-weight:600;color:${colors.text};cursor:pointer;list-style:none">
                ${f.question || ''}
                <div class="icon-toggle" style="width:28px;height:28px;border-radius:50%;background:${colors.featureIconBg};color:${colors.accent};display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;flex-shrink:0;transition:transform 0.3s ease">+</div>
              </summary>
              <p style="font-size:15px;line-height:1.8;color:${colors.textLight};padding-bottom:22px;max-width:680px">${f.answer || ''}</p>
            </details>
          `).join('')}
        </div>
      </div>
    </section>`;

    const buildCta = (s) => `
    <section id="${s.id}" class="section" style="background:linear-gradient(135deg, ${colors.accent} 0%, ${colors.accentDark} 100%);padding:100px 24px;text-align:center;position:relative;overflow:hidden">
      <!-- Decorative -->
      <div style="position:absolute;top:-50px;right:-50px;width:400px;height:400px;border-radius:50%;background:#FFFFFF;opacity:0.08"></div>
      <div style="position:absolute;bottom:-50px;left:-50px;width:300px;height:300px;border-radius:50%;background:${colors.accentDark};opacity:0.2"></div>
      
      <div class="container reveal" style="max-width:800px;position:relative;z-index:2">
        <div style="font-size:13px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.75);margin-bottom:20px">READY TO START?</div>
        <h2 style="color:#FFFFFF;margin-bottom:24px">${s.headline || ''}</h2>
        <p style="font-size:19px;color:rgba(255,255,255,0.85);max-width:600px;margin:0 auto 40px">${s.body || ''}</p>
        <a href="#" class="btn btn-primary" style="background:#FFFFFF;color:${colors.accent};padding:20px 56px;border-radius:${radius.button};font-size:18px;font-weight:700;box-shadow:0 16px 48px rgba(0,0,0,0.2)">${s.cta || 'Get Started Now'}</a>
      </div>
    </section>`;

    const sectionsHTML = (plan.sections || []).map((s) => {
        if (s.id === 'sec_hero') return buildHero(s);
        if (s.id === 'sec_problem') return buildProblem(s);
        if (s.id === 'sec_solution') return buildSolution(s);
        if (s.id === 'sec_features') return buildFeatures(s);
        if (s.id === 'sec_stats') return buildStats(s);
        if (s.id === 'sec_proof') return buildProof(s);
        if (s.id === 'sec_how') return buildHow(s);
        if (s.id === 'sec_faq') return buildFaq(s);
        if (s.id === 'sec_cta') return buildCta(s);
        return '';
    }).join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<!-- MANTRAM-PULSE-PAGE
  brandId: ${brandId}
  slug: ${slug}
  generated: ${Date.now()}
  canva-compatible: true
-->
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${plan.seo?.title || 'Campaign Page'}</title>
  <meta name="description" content="${plan.seo?.description || ''}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=${fonts.heading.replace(/ /g,'+')}:wght@400;500;600;700;800&family=${fonts.body.replace(/ /g,'+')}:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root {
      --text-xs: clamp(12px, 1vw, 14px);
      --text-sm: clamp(14px, 1.2vw, 16px);
      --text-base: clamp(16px, 1.5vw, 18px);
      --text-lg: clamp(18px, 2vw, 22px);
      --text-xl: clamp(22px, 2.5vw, 28px);
      --text-2xl: clamp(28px, 3.5vw, 40px);
      --text-3xl: clamp(36px, 5vw, 56px);
      --text-4xl: clamp(48px, 6.5vw, 80px);
      --text-display: clamp(60px, 8vw, ${fonts.displaySize}px);
    }
    html{scroll-behavior:smooth}
    body{font-family:'${fonts.body}',sans-serif;background:${colors.background};color:${colors.text};overflow-x:hidden;line-height:1.7}
    h1,h2,h3,h4,h5,h6{font-family:'${fonts.heading}',sans-serif;font-weight:${fonts.headingWeight}}
    h1{font-size:var(--text-display);line-height:1.05;letter-spacing:-0.03em}
    h2{font-size:var(--text-3xl);line-height:1.15;letter-spacing:-0.02em}
    h3{font-size:var(--text-2xl)}
    h4{font-size:var(--text-xl)}
    p{font-size:var(--text-base)}
    .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:14px 32px;text-decoration:none;cursor:pointer;white-space:nowrap;transition:all 0.2s ease}
    .btn-primary:hover{transform:translateY(-3px);filter:brightness(1.08)}
    .container{max-width:1200px;margin:0 auto;padding:0 24px}
    .grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:28px}
    .split{display:grid;grid-template-columns:1fr 1fr;gap:80px;align-items:center}
    @media(max-width:768px){.grid-3,.split{grid-template-columns:1fr}.hero-section{min-height:90vh;padding-top:100px!important}}
    .nav{position:fixed;top:0;left:0;right:0;z-index:100;padding:16px 24px;display:flex;justify-content:space-between;align-items:center;transition:all 0.3s ease;background:transparent}
    .nav.scrolled{background:rgba(255,255,255,0.96);backdrop-filter:blur(24px);box-shadow:0 1px 24px rgba(0,0,0,0.08)}
    details[open] .icon-toggle{transform:rotate(45deg)}
    .feature-card:hover{transform:translateY(-6px);box-shadow:${shadows.cardHover}!important}
  </style>
</head>
<body>
  <nav class="nav" id="mainNav">
    <a href="#" style="font-family:'${fonts.heading}',sans-serif;font-size:22px;font-weight:800;color:${colors.accent};text-decoration:none">${(plan.seo?.title || '').split('|')[0].trim()}</a>
    <a href="#cta" class="btn btn-primary" style="background:${colors.accent};color:${colors.ctaText};padding:10px 24px;font-size:14px;border-radius:${radius.button};font-weight:700">Get Started</a>
  </nav>
  ${sectionsHTML}
  <footer style="background:${colors.footerBackground};padding:40px 24px;text-align:center">
    <p style="color:${colors.footerText};font-size:14px">© ${new Date().getFullYear()} · Created with Mantram AI</p>
  </footer>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@studio-freight/lenis@1.0.45/bundled/lenis.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
  
  <script>
    // 1. Lenis Smooth Scroll
    const lenis = new Lenis({ lerp: 0.08, wheelMultiplier: 1.2 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    gsap.registerPlugin(ScrollTrigger);

    // 2. Nav effect
    window.addEventListener('scroll', () => {
      document.getElementById('mainNav').classList.toggle('scrolled', window.scrollY > 60);
    });

    // 3. Reveal elements
    gsap.utils.toArray('.reveal').forEach(el => {
      gsap.fromTo(el, { opacity:0, y:50 }, { opacity:1, y:0, duration:0.8, ease:'expo.out', scrollTrigger:{ trigger:el, start:'top 88%', once:true }});
    });
    gsap.utils.toArray('.reveal-right').forEach(el => {
      gsap.fromTo(el, { opacity:0, x:50 }, { opacity:1, x:0, duration:0.8, ease:'expo.out', scrollTrigger:{ trigger:el, start:'top 88%', once:true }});
    });

    // 4. Stagger grids
    gsap.utils.toArray('.stagger-grid').forEach(grid => {
      gsap.fromTo(grid.children, { opacity:0, y:40 }, { opacity:1, y:0, duration:0.7, stagger:0.1, ease:'expo.out', scrollTrigger:{ trigger:grid, start:'top 82%', once:true }});
    });

    // 5. Parallax Image
    gsap.utils.toArray('[data-parallax]').forEach(el => {
      const speed = parseFloat(el.dataset.parallax);
      gsap.to(el, { yPercent: speed * 100, ease:'none', scrollTrigger:{ trigger:el.closest('section'), start:'top bottom', end:'bottom top', scrub:1 }});
    });

    // 6. Stat Counters
    document.querySelectorAll('.stat-counter').forEach(el => {
      const target = parseFloat(el.dataset.target);
      const prefix = el.dataset.prefix || '';
      const suffix = el.dataset.suffix || '';
      ScrollTrigger.create({
        trigger: el, start: 'top 80%', once: true,
        onEnter: () => {
          gsap.fromTo({ val: 0 }, { val: target }, {
            duration: 2.2, ease: 'power2.out',
            onUpdate: function() {
              const v = this.targets()[0].val;
              el.textContent = prefix + (Number.isInteger(target) ? Math.round(v).toLocaleString() : v.toFixed(1)) + suffix;
            }
          });
        }
      });
    });

    // Hero dots animate
    const dot = document.getElementById('scroll-dot');
    if (dot) gsap.to(dot, { y: 10, repeat:-1, yoyo:true, duration:0.8, ease:'power1.inOut' });
    
    // Magnetic primary buttons
    document.querySelectorAll('.btn-primary').forEach(btn => {
      btn.addEventListener('mousemove', (e) => {
        const rect = btn.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width/2;
        const y = e.clientY - rect.top - rect.height/2;
        gsap.to(btn, { x: x*0.25, y: y*0.25, duration:0.3, ease:'power2.out' });
      });
      btn.addEventListener('mouseleave', () => {
        gsap.to(btn, { x:0, y:0, duration:0.5, ease:'elastic.out(1, 0.5)' });
      });
    });

    // Hero Intro sequence
    gsap.timeline({ delay: 0.1 })
      .fromTo('#hero-headline', { opacity:0, y:40 }, { opacity:1, y:0, duration:0.8, ease:'expo.out' })
      .fromTo('#hero-body', { opacity:0, y:20 }, { opacity:1, y:0, duration:0.6 }, '-=0.4')
      .fromTo('#hero-ctas', { opacity:0, y:20 }, { opacity:1, y:0, duration:0.5 }, '-=0.3');
  </script>
</body>
</html>`;
}

// ── Shopify Publisher ──────────────────────────────────────────
export async function publishToShopify({ title, html, slug, shopDomain, accessToken }) {
    const domain = shopDomain || process.env.SHOPIFY_STORE_DOMAIN;
    const token = accessToken || process.env.SHOPIFY_ADMIN_TOKEN;
    const version = process.env.SHOPIFY_API_VERSION || '2026-01';
    if (!domain || !token) return { success: false, error: 'Shopify not configured' };
    try {
        const res = await fetch(`https://${domain}/admin/api/${version}/pages.json`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
            body: JSON.stringify({ page: { title, handle: slug, body_html: html, published: true } }),
        });
        if (!res.ok) {
            const e = await res.text();
            return { success: false, error: `Shopify (${res.status}): ${e}` };
        }
        const data = await res.json();
        return {
            success: true, pageId: data.page.id, handle: data.page.handle,
            shopifyUrl: `https://${domain}/pages/${data.page.handle}`
        };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

export function generateEmbedCode(hostedUrl) {
    return `<div id="pulse-page-embed" style="width:100%;min-height:600px"></div>
<script>
(function(){var f=document.createElement('iframe');f.src='${hostedUrl}';f.style.cssText='width:100%;height:100vh;border:none;display:block';f.sandbox='allow-scripts allow-same-origin';document.getElementById('pulse-page-embed').appendChild(f);})();
</script>`;
}

// ── Main Export ────────────────────────────────────────────────
export async function generateLandingPage({ brandId, brief, pageType = 'campaign', urlContext, referenceImage, designContext, imageModel }) {
    const { brandContext } = await loadBrandContext(brandId);
    
    // Brand Token System initialization
    const primaryHex = designContext?.colorGuardHex?.[0] || '#6366F1';
    const tokens = generateBrandTokens(primaryHex, brandContext);
    
    // Override accent tokens with PDI palette if available
    if (designContext?.colorGuardHex?.length > 1) {
        tokens.colors.accent     = designContext.colorGuardHex[0];
        tokens.colors.accentDark = designContext.colorGuardHex[1] || designContext.colorGuardHex[0];
    }

    console.log('Pulse Page: Gathering market intelligence...');
    const intel = await gatherIntelligence(brief, brandId);

    console.log('Pulse Page: Claude formatting content...');
    const plan = await callAgent(
        PAGE_SYSTEM(brandContext, intel, urlContext),
        `BRIEF: ${brief}\nPAGE TYPE: ${pageType}`,
        0.8, 8192,
        { provider: 'anthropic', model: CLAUDE_OPUS, timeoutMs: 180_000 }
    );

    if (!plan?.sections?.length) throw new Error('Landing page generation failed — no sections returned');
    
    // Inject IDs matching our robust template set to avoid missing section bugs
    plan.sections.forEach((s, idx) => { s.id = SECTION_TEMPLATE[idx]?.id || s.id; });

    const images = await generatePageImages(plan, brandContext, referenceImage, tokens, designContext, imageModel);

    console.log('Assembling interactive robust page...');
    const slug = plan.seo?.slug || uuidv4().substring(0,8);
    const html = buildInteractiveHTML(plan, images, tokens, brandId, slug);

    const hostedUrl = await uploadToS3(
        Buffer.from(html),
        `pulse-studio/pages/${brandId || 'anon'}/${slug}.html`,
        'text/html'
    );

    return {
        success: true,
        plan,
        html,
        hostedUrl,
        thumbnailUrl: images['sec_hero'] || null,
        pageName: plan.seo?.title || brief.substring(0, 60),
        metaTitle: plan.seo?.title,
        metaDescription: plan.seo?.description,
        slug,
        embedCode: generateEmbedCode(hostedUrl),
        sectionCount: plan.sections.length,
    };
}

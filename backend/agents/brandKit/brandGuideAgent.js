/**
 * Brand Guide Agent — Generates a comprehensive, interactive Brand Style Guide
 *
 * Output: Premium HTML page (hosted on S3) with:
 * - Color System (swatches + usage rules + accessibility)
 * - Typography Scale (live font rendering)
 * - Logo Usage (do's/don'ts with visual examples)
 * - Voice & Tone Guidelines
 * - Photography & Visual Style
 * - Social Media Templates Overview
 * - 2026 design movement context
 *
 * Intelligence: Claude Sonnet 4.6 (best structured output)
 * Hosting: S3 (like Pulse Studio decks)
 */

import { callAgentText, loadBrandContext } from '../shared/agentUtils.js';
import { runArtDirector } from './artDirectorAgent.js';
import { uploadToS3 } from '../../utils/s3.js';
import { v4 as uuidv4 } from 'uuid';



const GUIDE_SYSTEM = (artStrategy, brandContext) => `You are a senior brand identity designer at a top-tier creative agency.
You are writing a comprehensive, polished brand style guide.

CREATIVE STRATEGY:
Design Movement: ${artStrategy.designMovement}
Brand Archetype: ${artStrategy.brandArchetype}
Mood: ${(artStrategy.moodKeywords || []).join(', ')}
Art Director Notes: ${artStrategy.artDirectorNotes}

BRAND CONTEXT:
${brandContext}

WRITING RULES:
1. Be opinionated and specific — not generic rules
2. Reference the brand's actual voice, colors, and positioning
3. Include real-world examples and analogies
4. Use brand-appropriate language tone
5. Each section should explain WHY not just WHAT`;

async function generateGuideContent(artStrategy, brand, brandContext, brief) {
    const colors = brand?.dna?.colors || [];
    const fonts = brand?.dna?.fonts || {};
    const voice = brand?.dna?.voice || {};
    const brandName = brand?.name || 'Brand';
    const primaryColor = colors[0]?.hex || '#2B4BEE';

    const content = await callAgentText(
        GUIDE_SYSTEM(artStrategy, brandContext),
        `Create a comprehensive brand guide for ${brandName}.
        
Brief: ${brief || 'Complete brand style guide'}

Return a structured JSON with these exact sections:
{
  "guideTitle": "${brandName} Brand Guidelines",
  "tagline": "One powerful sentence defining the brand's visual mission",
  "brandStory": "3-4 sentences about who this brand is at its core",
  "colorSections": [
    { "name": "Color Name", "hex": "#HEXCODE", "rgb": "R, G, B", "usage": "When to use this color", "emotion": "What this color conveys", "pairing": "What it pairs well with" }
  ],
  "typographyRules": {
    "headingRules": ["Rule 1 with specific guidance", "Rule 2"],
    "bodyRules": ["Rule 1", "Rule 2"],
    "sizing": { "h1": "72px / Bold", "h2": "48px / Semibold", "h3": "32px / Medium", "body": "16px / Regular", "caption": "12px / Light" },
    "spacingRules": ["Line height rule", "Letter spacing rule"]
  },
  "logoUsageDos": ["Specific do", "Another do"],
  "logoUsageDonts": ["Never stretch the logo", "Never place on busy background"],
  "voiceGuidelines": {
    "personality": "3 words that define the brand voice",
    "dos": ["Write like you're talking to a smart friend", "Use active voice always"],
    "donts": ["Never use corporate jargon", "Avoid passive voice"],
    "wordsTouse": ["vibrant", "essential", "original"],
    "wordsToAvoid": ["solutions", "synergy", "leverage"],
    "toneByContext": { "social": "Playful and direct", "email": "Warm and personal", "ads": "Bold and provocative" }
  },
  "photographyRules": {
    "style": "Description of the photography style",
    "lighting": "Lighting approach",
    "subjects": "What to photograph",
    "colorTreatment": "Color grading approach",
    "composition": "Compositional rules",
    "avoidList": ["What to never photograph or show"]
  },
  "designMovementContext": "${artStrategy.designMovement} — how this influences the brand's visual language",
  "whitespaceRules": "Specific rules about spacing and breathing room",
  "iconographyStyle": "How icons and illustrations should look",
  "patternTextures": "Whether and how to use patterns/textures"
}`,
        0.7, 4000
    );

    return content;
}

function buildGuideHTML(content, brand, artStrategy, slug) {
    const brandName = brand?.name || content?.guideTitle?.replace(' Brand Guidelines', '') || 'Brand';
    const colors = brand?.dna?.colors || [];
    const fonts = brand?.dna?.fonts || {};
    const primaryColor = colors[0]?.hex || '#2B4BEE';
    const secondaryColor = colors[1]?.hex || '#1a1a2e';
    const accentColor = colors.find(c => c.usage === 'accent')?.hex || colors[2]?.hex || '#FF4D00';
    const headingFont = fonts.heading?.family || 'Inter';
    const bodyFont = fonts.body?.family || 'Inter';

    // Try to parse content if it's a string
    let parsed = content;
    if (typeof content === 'string') {
        try {
            const cleaned = content.replace(/```json|```/g, '').trim();
            parsed = JSON.parse(cleaned);
        } catch (_) { parsed = {}; }
    }

    const esc = (s) => (s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const colorSwatches = (parsed.colorSections || colors.map(c => ({
        name: c.name || c.usage,
        hex: c.hex,
        usage: `${c.usage} color`,
        emotion: 'Core brand color',
    }))).map(c => `
        <div class="swatch-card">
            <div class="swatch-preview" style="background:${c.hex}"></div>
            <div class="swatch-info">
                <div class="swatch-name">${esc(c.name)}</div>
                <div class="swatch-hex">${esc(c.hex)}</div>
                <div class="swatch-usage">${esc(c.usage)}</div>
                <div class="swatch-emotion">${esc(c.emotion || '')}</div>
            </div>
        </div>
    `).join('');

    const logoDoList = (parsed.logoUsageDos || ['Use on white or brand-colored backgrounds', 'Maintain clear space equal to the x-height of the logo']).map(d => `<li class="do-item"><span class="do-icon">✓</span>${esc(d)}</li>`).join('');
    const logoDontList = (parsed.logoUsageDonts || ['Never stretch or distort the logo', 'Never place on busy or clashing backgrounds']).map(d => `<li class="dont-item"><span class="dont-icon">✗</span>${esc(d)}</li>`).join('');

    const voiceDos = (parsed.voiceGuidelines?.dos || []).map(d => `<li>${esc(d)}</li>`).join('');
    const voiceDonts = (parsed.voiceGuidelines?.donts || []).map(d => `<li>${esc(d)}</li>`).join('');
    const wordsToUse = (parsed.voiceGuidelines?.wordsTouse || []).map(w => `<span class="tag tag-do">${esc(w)}</span>`).join('');
    const wordsToAvoid = (parsed.voiceGuidelines?.wordsToAvoid || []).map(w => `<span class="tag tag-dont">${esc(w)}</span>`).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(brandName)} Brand Guidelines</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(headingFont)}:wght@300;400;500;600;700;800;900&family=${encodeURIComponent(bodyFont)}:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
  :root {
    --primary: ${primaryColor};
    --secondary: ${secondaryColor};
    --accent: ${accentColor};
    --font-heading: '${headingFont}', sans-serif;
    --font-body: '${bodyFont}', sans-serif;
    --bg: #F9F9F7;
    --surface: #FFFFFF;
    --text: #0F0F1A;
    --text-muted: #6B7280;
    --border: #E5E7EB;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: var(--font-body); background: var(--bg); color: var(--text); line-height: 1.6; }

  /* ── Hero ── */
  .hero {
    background: var(--primary);
    padding: 120px 80px;
    position: relative; overflow: hidden;
  }
  .hero::before {
    content: '';
    position: absolute; top: 0; right: 0;
    width: 50%; height: 100%;
    background: rgba(255,255,255,0.04);
    clip-path: polygon(100% 0, 100% 100%, 30% 100%);
  }
  .hero-eyebrow { font-size: 11px; letter-spacing: 0.25em; text-transform: uppercase; color: rgba(255,255,255,0.5); margin-bottom: 24px; }
  .hero-title { font-family: var(--font-heading); font-size: 72px; font-weight: 800; color: #fff; line-height: 1.05; letter-spacing: -0.03em; margin-bottom: 20px; }
  .hero-subtitle { font-size: 20px; color: rgba(255,255,255,0.7); max-width: 500px; }
  .hero-version { position: absolute; bottom: 40px; right: 80px; font-size: 12px; color: rgba(255,255,255,0.3); }

  /* ── Navigation ── */
  .guide-nav {
    position: sticky; top: 0; z-index: 100;
    background: rgba(255,255,255,0.95); backdrop-filter: blur(20px);
    border-bottom: 1px solid var(--border);
    padding: 0 80px;
    display: flex; gap: 0; overflow-x: auto;
  }
  .guide-nav a {
    padding: 16px 20px; font-size: 13px; font-weight: 500;
    color: var(--text-muted); text-decoration: none;
    border-bottom: 2px solid transparent;
    white-space: nowrap; transition: all 0.2s;
  }
  .guide-nav a:hover { color: var(--primary); border-color: var(--primary); }

  /* ── Sections ── */
  .section { padding: 80px; border-bottom: 1px solid var(--border); }
  .section:last-child { border: none; }
  .section-tag { font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--accent); font-weight: 600; margin-bottom: 12px; }
  .section-title { font-family: var(--font-heading); font-size: 42px; font-weight: 700; color: var(--text); margin-bottom: 12px; letter-spacing: -0.02em; }
  .section-desc { font-size: 17px; color: var(--text-muted); max-width: 600px; line-height: 1.7; margin-bottom: 48px; }

  /* ── Brand Story ── */
  .brand-story { font-size: 24px; font-weight: 300; line-height: 1.7; color: var(--text); max-width: 800px; border-left: 4px solid var(--primary); padding-left: 32px; }

  /* ── Color Swatches ── */
  .swatches-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 24px; }
  .swatch-card { border-radius: 16px; overflow: hidden; border: 1px solid var(--border); background: var(--surface); }
  .swatch-preview { height: 120px; }
  .swatch-info { padding: 16px; }
  .swatch-name { font-weight: 700; font-size: 15px; margin-bottom: 4px; }
  .swatch-hex { font-family: monospace; font-size: 13px; color: var(--text-muted); margin-bottom: 8px; }
  .swatch-usage { font-size: 12px; color: var(--text-muted); margin-bottom: 4px; }
  .swatch-emotion { font-size: 12px; font-style: italic; color: var(--primary); }

  /* ── Typography ── */
  .type-scale { space-y: 32px; }
  .type-sample { padding: 24px; background: var(--surface); border-radius: 12px; border: 1px solid var(--border); margin-bottom: 16px; }
  .type-label { font-size: 10px; letter-spacing: 0.15em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 8px; }
  .type-h1 { font-family: var(--font-heading); font-size: 72px; font-weight: 800; letter-spacing: -0.03em; line-height: 1; color: var(--text); }
  .type-h2 { font-family: var(--font-heading); font-size: 48px; font-weight: 700; letter-spacing: -0.02em; color: var(--text); }
  .type-h3 { font-family: var(--font-heading); font-size: 32px; font-weight: 600; color: var(--text); }
  .type-body { font-size: 16px; line-height: 1.7; color: var(--text); }
  .type-caption { font-size: 12px; color: var(--text-muted); letter-spacing: 0.02em; }

  /* ── Logo Rules ── */
  .rules-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
  .rules-card { padding: 32px; border-radius: 16px; }
  .rules-card.dos { background: #F0FDF4; border: 1px solid #BBF7D0; }
  .rules-card.donts { background: #FFF1F2; border: 1px solid #FECDD3; }
  .rules-title { font-size: 14px; font-weight: 700; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 0.1em; }
  .rules-card.dos .rules-title { color: #16A34A; }
  .rules-card.donts .rules-title { color: #DC2626; }
  ul.rules-list { list-style: none; space-y: 12px; }
  .do-item, .dont-item { display: flex; align-items: flex-start; gap: 10px; font-size: 14px; padding: 8px 0; border-bottom: 1px solid rgba(0,0,0,0.05); }
  .do-icon { color: #16A34A; font-weight: 700; flex-shrink: 0; margin-top: 1px; }
  .dont-icon { color: #DC2626; font-weight: 700; flex-shrink: 0; margin-top: 1px; }

  /* ── Voice ── */
  .voice-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
  .voice-card { padding: 28px; background: var(--surface); border-radius: 16px; border: 1px solid var(--border); }
  .voice-card-title { font-size: 13px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--primary); font-weight: 600; margin-bottom: 16px; }
  .voice-card ul { list-style: none; }
  .voice-card li { font-size: 14px; color: var(--text-muted); padding: 6px 0; border-bottom: 1px solid var(--border); }
  .tags { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
  .tag { padding: 4px 12px; border-radius: 100px; font-size: 12px; font-weight: 500; }
  .tag-do { background: #F0FDF4; color: #16A34A; border: 1px solid #BBF7D0; }
  .tag-dont { background: #FFF1F2; color: #DC2626; border: 1px solid #FECDD3; }

  /* ── Photography ── */
  .photo-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
  .photo-rule { padding: 20px; background: var(--surface); border-radius: 12px; border: 1px solid var(--border); }
  .photo-rule-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--primary); margin-bottom: 8px; font-weight: 600; }
  .photo-rule-text { font-size: 14px; color: var(--text-muted); line-height: 1.6; }

  /* ── Design Movement Badge ── */
  .movement-badge {
    display: inline-flex; align-items: center; gap: 12px;
    padding: 16px 24px; background: var(--primary); border-radius: 12px;
    color: white; font-size: 15px; font-weight: 600; margin-bottom: 32px;
  }
  .movement-badge .year { opacity: 0.6; font-weight: 400; }

  /* ── Footer ── */
  .guide-footer {
    padding: 48px 80px;
    background: var(--text);
    color: rgba(255,255,255,0.4);
    font-size: 13px;
    display: flex; justify-content: space-between;
  }

  @media (max-width: 768px) {
    .hero, .section { padding: 48px 24px; }
    .hero-title { font-size: 40px; }
    .guide-nav { padding: 0 24px; }
    .rules-grid, .voice-grid, .photo-grid { grid-template-columns: 1fr; }
  }
</style>
</head>
<body>

<!-- Hero -->
<section class="hero">
  <div class="hero-eyebrow">Brand Identity System — Powered by Mantram AI</div>
  <h1 class="hero-title">${esc(brandName)}</h1>
  <p class="hero-subtitle">${esc(parsed.tagline || 'A comprehensive visual identity system')}</p>
  <div class="hero-version">Guidelines v1.0 — ${new Date().getFullYear()}</div>
</section>

<!-- Navigation -->
<nav class="guide-nav">
  <a href="#story">Brand Story</a>
  <a href="#colors">Color System</a>
  <a href="#typography">Typography</a>
  <a href="#logo">Logo Usage</a>
  <a href="#voice">Voice & Tone</a>
  <a href="#photography">Photography</a>
  <a href="#movement">Design Movement</a>
</nav>

<!-- Brand Story -->
<section class="section" id="story">
  <div class="section-tag">Who We Are</div>
  <h2 class="section-title">Brand Story</h2>
  <p class="brand-story">${esc(parsed.brandStory || `${brandName} exists to create meaningful experiences for the people who matter most.`)}</p>
</section>

<!-- Color System -->
<section class="section" id="colors">
  <div class="section-tag">Visual Identity</div>
  <h2 class="section-title">Color System</h2>
  <p class="section-desc">Every color in our palette serves a purpose. Use them with intention.</p>
  <div class="swatches-grid">${colorSwatches}</div>
</section>

<!-- Typography -->
<section class="section" id="typography">
  <div class="section-tag">Type System</div>
  <h2 class="section-title">Typography Scale</h2>
  <p class="section-desc">Typography is voice made visible. Our type hierarchy creates visual rhythm and hierarchy.</p>
  <div class="type-scale">
    <div class="type-sample">
      <div class="type-label">H1 — Display / Hero</div>
      <div class="type-h1">${esc(brandName)}</div>
    </div>
    <div class="type-sample">
      <div class="type-label">H2 — Section Heading</div>
      <div class="type-h2">Make it matter.</div>
    </div>
    <div class="type-sample">
      <div class="type-label">H3 — Sub-heading</div>
      <div class="type-h3">Built for what's next</div>
    </div>
    <div class="type-sample">
      <div class="type-label">Body — ${parsed.typographyRules?.sizing?.body || '16px Regular'}</div>
      <div class="type-body">Our brand voice is confident, clear, and human. We write the way we speak — with warmth, directness, and a point of view that's uniquely ours.</div>
    </div>
    <div class="type-sample">
      <div class="type-label">Caption / Label</div>
      <div class="type-caption">ALL CAPS LABELS — 11px — LETTER-SPACING 0.15em</div>
    </div>
  </div>
</section>

<!-- Logo Usage -->
<section class="section" id="logo">
  <div class="section-tag">Brand Mark</div>
  <h2 class="section-title">Logo Usage Rules</h2>
  <p class="section-desc">The logo is our most recognizable asset. Protect it.</p>
  <div class="rules-grid">
    <div class="rules-card dos">
      <div class="rules-title">✓ Always Do</div>
      <ul class="rules-list">${logoDoList}</ul>
    </div>
    <div class="rules-card donts">
      <div class="rules-title">✗ Never Do</div>
      <ul class="rules-list">${logoDontList}</ul>
    </div>
  </div>
</section>

<!-- Voice & Tone -->
<section class="section" id="voice">
  <div class="section-tag">Brand Communication</div>
  <h2 class="section-title">Voice & Tone</h2>
  <p class="section-desc">Our personality: <strong>${esc(parsed.voiceGuidelines?.personality || 'Bold, Human, Direct')}</strong></p>
  <div class="voice-grid">
    <div class="voice-card">
      <div class="voice-card-title">We Write Like This</div>
      <ul>${voiceDos}</ul>
    </div>
    <div class="voice-card">
      <div class="voice-card-title">We Never Write Like This</div>
      <ul>${voiceDonts}</ul>
    </div>
    <div class="voice-card">
      <div class="voice-card-title">Words We Love</div>
      <div class="tags">${wordsToUse}</div>
    </div>
    <div class="voice-card">
      <div class="voice-card-title">Words We Avoid</div>
      <div class="tags">${wordsToAvoid}</div>
    </div>
  </div>
</section>

<!-- Photography -->
<section class="section" id="photography">
  <div class="section-tag">Visual Language</div>
  <h2 class="section-title">Photography Style</h2>
  <p class="section-desc">${esc(parsed.photographyRules?.style || 'Our images are authentic, purposeful, and always human-centered.')}</p>
  <div class="photo-grid">
    <div class="photo-rule">
      <div class="photo-rule-label">Lighting</div>
      <div class="photo-rule-text">${esc(parsed.photographyRules?.lighting || 'Natural, soft, directional light')}</div>
    </div>
    <div class="photo-rule">
      <div class="photo-rule-label">Subjects</div>
      <div class="photo-rule-text">${esc(parsed.photographyRules?.subjects || 'Real people in real moments')}</div>
    </div>
    <div class="photo-rule">
      <div class="photo-rule-label">Color Treatment</div>
      <div class="photo-rule-text">${esc(parsed.photographyRules?.colorTreatment || 'True-to-life color, minimal retouching')}</div>
    </div>
    <div class="photo-rule">
      <div class="photo-rule-label">Composition</div>
      <div class="photo-rule-text">${esc(parsed.photographyRules?.composition || 'Rule of thirds, generous negative space')}</div>
    </div>
    <div class="photo-rule">
      <div class="photo-rule-label">White Space</div>
      <div class="photo-rule-text">${esc(parsed.whitespaceRules || 'Generous breathing room in all compositions')}</div>
    </div>
    <div class="photo-rule">
      <div class="photo-rule-label">Always Avoid</div>
      <div class="photo-rule-text">${esc((parsed.photographyRules?.avoidList || ['Stock-looking photos', 'Heavy filters']).join(', '))}</div>
    </div>
  </div>
</section>

<!-- Design Movement -->
<section class="section" id="movement">
  <div class="section-tag">2026 Context</div>
  <h2 class="section-title">Design Movement</h2>
  <div class="movement-badge">
    ${esc(artStrategy.designMovement)} <span class="year">2026</span>
  </div>
  <p class="section-desc">${esc(parsed.designMovementContext || artStrategy.movementRationale || 'Our visual identity is rooted in contemporary design principles.')}</p>
</section>

<!-- Footer -->
<footer class="guide-footer">
  <div>© ${new Date().getFullYear()} ${esc(brandName)}. All rights reserved.</div>
  <div>Generated by Mantram AI Brand Studio</div>
</footer>

</body>
</html>`;
}

export async function generateBrandGuide({ brandId, brief, briefBrand, imageModel }) {
    const slug = uuidv4().substring(0, 8);

    console.log(`📖 [BrandGuide] Running Art Director analysis...`);

    const { artStrategy, brandContext, brand } = await runArtDirector({
        brandId,
        brief: brief || 'Comprehensive brand style guide',
        scope: 'brand',
        assetType: 'brand-guide',
        assetSpecs: [],
        briefBrand,
    });

    const usedBrand = brand || briefBrand;

    console.log(`📖 [BrandGuide] Generating guide content with Claude...`);
    const content = await generateGuideContent(artStrategy, usedBrand, brandContext, brief);

    console.log(`📖 [BrandGuide] Building interactive HTML guide...`);
    const html = buildGuideHTML(content, usedBrand, artStrategy, slug);

    const hostedUrl = await uploadToS3(
        Buffer.from(html),
        `brand-kit/${brandId || 'anon'}/brand-guide-${slug}.html`,
        'text/html'
    );

    return {
        success: true,
        assetType: 'guide',
        artStrategy,
        assets: [{
            name: 'Brand Style Guide',
            assetSubType: 'brand-guide',
            htmlContent: html,
            hostedUrl,
            format: 'html',
            thumbnailUrl: null,
        }],
        hostedUrl,
        brandContext,
    };
}

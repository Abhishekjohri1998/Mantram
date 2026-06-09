/**
 * Pulse Mail — Brand-native HTML email builder
 *
 * Intelligence: Claude Opus (claude-sonnet-4-20250514)
 * Images: NanoBanana 2 via Lao Zhang
 * Rendering: MJML → bulletproof cross-client HTML
 * Gmail safe: output stays under 80KB
 */
import mjml from 'mjml';
import { v4 as uuidv4 } from 'uuid';
import { callAgent, loadBrandContext } from '../shared/agentUtils.js';
import { laozhangImageGenerate, laozhangMultimodalImageGenerate } from '../videoStudio/laozhangClient.js';
import { uploadToS3 } from '../../utils/s3.js';
import { generateBrandTokens } from '../../utils/brandColorEngine.js';

const CLAUDE_OPUS = 'claude-sonnet-4-20250514';

const EMAIL_SYSTEM = (brandContext, urlContext) => `You are an expert email copywriter and conversion strategist.
Your job is to write compelling, benefit-driven copy for an email campaign based on the brief.
You must return your output strictly in JSON format according to the schema below.

CRITICAL RULES:
1. You are writing COPY ONLY. NEVER output colors, fonts, layouts, or visual properties.
2. The email structure is fixed: Hero, Features (x3), Stats (x3), Testimonial, and CTA. You must fill content for all.
3. Every headline should be punchy and action-oriented. Body copy must be concise.

BRAND CONTEXT:
${brandContext}
${urlContext ? '\nPRODUCT/CAMPAIGN DATA:\n' + urlContext : ''}

JSON SCHEMA:
{
  "emailName": "Internal tracking name",
  "subject": "Compelling subject line max 50 chars",
  "previewText": "Preview snippet max 90 chars",
  "sections": {
    "hero": {
      "headline": "Main headline",
      "body": "Body paragraph max 40 words",
      "ctaUrl": "{{cta_url}}",
      "cta": "Primary CTA text",
      "imagePrompt": "Detailed prompt for commercial photography, infographics, UI dashboards, or dynamic circuits depending on product. Use creative art direction. It is OK to request charts or text in the visual."
    },
    "features": [
      { "title": "Feature 1", "body": "...", "icon": "🎁" },
      { "title": "Feature 2", "body": "...", "icon": "⚡" },
      { "title": "Feature 3", "body": "...", "icon": "🛡️" }
    ],
    "stats": [
      { "number": "10x", "label": "GROWTH" },
      { "number": "99%", "label": "SATISFACTION" },
      { "number": "24/7", "label": "SUPPORT" }
    ],
    "testimonial": {
      "quote": "Amazing product that changed how we work.",
      "author": "Jane Doe",
      "role": "CEO, Company"
    },
    "cta": {
      "headline": "Ready to get started?",
      "body": "Join thousands of happy customers today.",
      "buttonText": "Join Now",
      "ctaUrl": "{{cta_url}}"
    }
  }
}`;

async function generateSectionImage(prompt, type, brandContext, referenceImage, tokens, designContext, imageModel) {
    if (!prompt) return null;
    const model = imageModel || 'gemini-3.1-flash-image-preview';
    let style = "contemporary premium aesthetic.";
    if (brandContext.toLowerCase().match(/luxury|premium|high-end/)) style = "editorial luxury aesthetic, Vogue quality, highly refined layout.";
    if (tokens?.colors?.primary) style += ` Use a prominent color accent matching the hex code ${tokens.colors.primary}.`;
    style += ` Strictly follow this brand ethos: ${brandContext.substring(0, 150).replace(/\n/g, ' ')}`;
    
    // PDI Color Guard injection
    if (designContext?.colorGuardHex?.length) {
        style += ` STRICT COLOR GUARD: The product colors are locked. Preserve exactly these hex values in the product: ${designContext.colorGuardHex.join(', ')}. Do NOT change or alter the product color under any circumstances.`;
    }
    if (designContext?.moodLabel) {
        style += ` Visual mood: ${designContext.moodLabel}. ${designContext.shootDirective || ''}`;
    }
    
    try {
        const size = type === 'hero' ? '1200x628' : '600x400';
        const finalPrompt = `${prompt}. ${style}`;
        if (referenceImage) {
            const r = await laozhangMultimodalImageGenerate(finalPrompt, [referenceImage], {
                model,
                size,
            });
            return r?.imageUrl || null;
        } else {
            const r = await laozhangImageGenerate(finalPrompt, {
                model,
                size,
            });
            return r?.imageUrl || null;
        }
    } catch (err) {
        console.warn(`Email image generation failed: ${err.message}`);
        return null;
    }
}

function buildMJML(plan, heroImage, tokens) {
    const { colors, fonts } = tokens;
    const bodyFont = fonts.body;
    const headingFont = fonts.heading;

    const mjmlContent = `
<mjml>
  <mj-head>
    <mj-preview>${plan.previewText || ''}</mj-preview>
    <mj-attributes>
      <mj-all font-family="${bodyFont}, Helvetica, Arial, sans-serif" />
      <mj-text font-size="15px" color="#0A0A0A" line-height="1.6" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="#F1F1F1">

    <!-- HERO -->
    <mj-section background-color="${colors.emailHeroBg}" padding="0">
      <mj-column>
        ${heroImage ? `<mj-image src="${heroImage}" alt="Hero Image" padding="0" width="600px"/>` : ''}
      </mj-column>
    </mj-section>
    <mj-section background-color="${colors.emailHeroBg}" padding="48px 40px 40px">
      <mj-column>
        <mj-text color="${colors.emailHeroText}" font-size="32px" font-weight="700" line-height="1.25" font-family="${headingFont}, Helvetica, sans-serif" padding="0 0 16px 0">
          ${plan.sections.hero.headline}
        </mj-text>
        <mj-text color="${colors.emailHeroText}" font-size="16px" line-height="1.7" opacity="0.88" padding="0 0 28px 0">
          ${plan.sections.hero.body}
        </mj-text>
        <mj-button background-color="${colors.emailCtaBg}" color="${colors.emailCtaText}" font-size="15px" font-weight="700" border-radius="8px" inner-padding="14px 36px" padding="0" href="${plan.sections.hero.ctaUrl}">
          ${plan.sections.hero.cta}
        </mj-button>
      </mj-column>
    </mj-section>

    <!-- FEATURES -->
    <mj-section background-color="#FFFFFF" padding="48px 32px">
      ${(plan.sections.features || []).slice(0, 3).map(f => `
      <mj-column width="33.33%">
        <mj-table padding="0">
          <tr>
            <td style="background-color: ${colors.featureIconBg}; border-radius: 12px; width: 48px; height: 48px; text-align: center; font-size: 24px; vertical-align: middle;">
              ${f.icon || '✦'}
            </td>
          </tr>
        </mj-table>
        <mj-text font-size="16px" font-weight="700" color="#0A0A0A" padding="12px 10px 0">
          ${f.title}
        </mj-text>
        <mj-text font-size="14px" color="#6B7280" line-height="1.65" padding="6px 10px 0">
          ${f.body}
        </mj-text>
      </mj-column>
      `).join('')}
    </mj-section>

    <!-- STATS -->
    <mj-section background-color="${colors.statBackground}" padding="40px 32px">
      ${(plan.sections.stats || []).slice(0, 3).map(s => `
      <mj-column width="33.33%" border-top="3px solid ${colors.accent}">
        <mj-text font-size="40px" font-weight="800" color="${colors.accent}" line-height="1" padding="16px 0 4px">
          ${s.number}
        </mj-text>
        <mj-text font-size="12px" font-weight="600" color="#6B7280" letter-spacing="0.06em" text-transform="uppercase" padding="0">
          ${s.label}
        </mj-text>
      </mj-column>
      `).join('')}
    </mj-section>

    <!-- TESTIMONIAL -->
    <mj-section background-color="${colors.testimonialBackground}" padding="40px 40px">
      <mj-column border-left="4px solid ${colors.accent}" padding-left="20px">
        <mj-text font-size="48px" color="${colors.accent}" line-height="0.5" padding="0" font-family="Georgia, serif">
          "
        </mj-text>
        <mj-text font-size="17px" font-style="italic" color="#0A0A0A" line-height="1.7" padding="10px 0">
          ${plan.sections.testimonial.quote}
        </mj-text>
        <mj-text font-size="14px" font-weight="600" color="#6B7280" margin-top="16px" padding="0">
          ${plan.sections.testimonial.author}
        </mj-text>
        <mj-text font-size="16px" color="#F59E0B" padding="4px 0 0">
          ★★★★★
        </mj-text>
      </mj-column>
    </mj-section>

    <!-- POWER CTA -->
    <mj-section background-color="${colors.emailCtaBg}" padding="56px 40px">
      <mj-column>
        <mj-text font-size="28px" font-weight="700" color="#FFFFFF" line-height="1.25" align="center" padding="0">
          ${plan.sections.cta.headline}
        </mj-text>
        <mj-text font-size="15px" color="#FFFFFF" opacity="0.85" align="center" padding="12px 0 28px">
          ${plan.sections.cta.body}
        </mj-text>
        <mj-button background-color="#FFFFFF" color="${colors.accent}" font-size="15px" font-weight="700" border-radius="8px" inner-padding="14px 40px" padding="0" href="${plan.sections.cta.ctaUrl}">
          ${plan.sections.cta.buttonText}
        </mj-button>
      </mj-column>
    </mj-section>

    <!-- FOOTER -->
    <mj-section background-color="${colors.footerBackground}" padding="40px 20px">
      <mj-column>
        <mj-text font-size="14px" font-weight="700" color="#9CA3AF" align="center">
          Mantram AI
        </mj-text>
        <mj-text font-size="12px" color="#6B7280" align="center" padding="8px 0">
          You received this email because you opted in.
        </mj-text>
        <mj-text font-size="12px" align="center" padding="0">
          <a href="{{unsubscribe_link}}" style="color:#6B7280;">Unsubscribe</a>
        </mj-text>
      </mj-column>
    </mj-section>

  </mj-body>
</mjml>`;
    return mjmlContent;
}

export async function generateEmail({ brandId, brief, emailType = 'campaign', urlContext, referenceImage, designContext, imageModel }) {
    const { brandContext } = await loadBrandContext(brandId);
    const tokens = generateBrandTokens('#6366F1', brandContext);
    
    // If PDI designContext provided, override primary token color with product primary
    if (designContext?.colorGuardHex?.length) {
        tokens.colors.primary = designContext.colorGuardHex[0];
        tokens.colors.accent   = designContext.colorGuardHex[0];
    }

    console.log('Pulse Mail: Formatting strategic copy...');
    const plan = await callAgent(
        EMAIL_SYSTEM(brandContext, urlContext),
        `BRIEF: ${brief}\nTYPE: ${emailType}`,
        0.5, 3000,
        { provider: 'anthropic', model: CLAUDE_OPUS }
    );

    if (!plan?.sections?.hero) throw new Error('Email generic failure — invalid sections.');

    console.log(`Generating Hero visual via NanoBanana...`);
    const heroImage = await generateSectionImage(plan.sections.hero.imagePrompt, 'hero', brandContext, referenceImage, tokens, designContext, imageModel);

    const mjmlSrc = buildMJML(plan, heroImage, tokens);
    const { html, errors } = await mjml(mjmlSrc, { validationLevel: 'soft' });
    if (errors?.length) console.warn('MJML warnings:', errors.map(e => e.message));

    const plainText = plan.sections.hero.headline + "\n\n" + plan.sections.hero.body + "\n\n" + plan.sections.hero.cta;

    const hostedUrl = await uploadToS3(
        Buffer.from(html),
        `pulse-studio/emails/${brandId || 'anon'}/${uuidv4()}.html`,
        'text/html'
    );

    return {
        success: true,
        emailPlan: plan,
        html,
        plainText,
        hostedUrl,
        thumbnailUrl: heroImage,
        subject: plan.subject,
        previewText: plan.previewText,
        emailName: plan.emailName,
    };
}

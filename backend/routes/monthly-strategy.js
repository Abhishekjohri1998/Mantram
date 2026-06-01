/**
 * Monthly Strategy Engine — /api/monthly-strategy
 * 
 * POST /generate/stream  — SSE: MCP research → Claude strategy → 30-day calendar + briefs
 * POST /generate          — Blocking fallback
 * GET  /                  — List strategies for brand
 * GET  /:id               — Single strategy with calendar
 * GET  /:id/calendar      — Calendar array only
 * PATCH /:id/items/:itemId/status  — Update item status
 * PATCH /:id/items/:itemId/asset   — Write back generated asset ref
 * POST /:id/items/:itemId/execute  — Trigger studio execution (credit charged by studio)
 * POST /:id/items/:itemId/regenerate-brief — Regenerate a single brief (1 credit)
 * DELETE /:id             — Soft-delete (archive)
 */

import express from 'express';
import mongoose from 'mongoose';
import { protect } from '../middleware/auth.js';
import { requireCredits } from '../middleware/credits.js';
import MonthlyStrategy from '../models/MonthlyStrategy.js';
import Brand from '../models/Brand.js';
import Product from '../models/Product.js';
import GenerationJob from '../models/GenerationJob.js';
import { callMcpToolsParallel } from '../mcp/registry.js';
import { buildBrandContext, callAgent } from '../agents/shared/agentUtils.js';
import { getRouter as getAiRouter } from '../ai/router.js';
import { createNotification } from '../utils/createNotification.js';
import crypto from 'crypto';

const router = express.Router();

// ─── Validation Constants ────────────────────────────────────────────────────
const VALID_STRATEGY_TYPES = [
  'social-media', 'performance-marketing', 'seo', 'sales',
  'content-marketing', 'email-retention', 'influencer-ugc', 'marketplace',
];
const MAX_LAUNCH_EVENTS = 10;
const MAX_BRIEF_LENGTH = 2000;
const MAX_KEYWORDS = 15;

/**
 * Shared input validation for strategy generation endpoints.
 * Returns { error, sanitized } — if error is set, respond 400 and stop.
 */
function validateStrategyInput({ brandId, strategyType, month, year, userBrief, launchEvents, focusKeywords }) {
  // Required fields
  if (!brandId || !strategyType || !month || !year) {
    return { error: 'brandId, strategyType, month, year are required' };
  }

  const m = Number(month);
  const y = Number(year);

  // Month range
  if (!Number.isInteger(m) || m < 1 || m > 12) {
    return { error: 'month must be an integer between 1 and 12' };
  }

  // Year range — allow current year and next year only
  const currentYear = new Date().getFullYear();
  if (!Number.isInteger(y) || y < currentYear || y > currentYear + 1) {
    return { error: `year must be ${currentYear} or ${currentYear + 1}` };
  }

  // Past month check — block if the entire target month has already ended
  const now = new Date();
  const lastDayOfTarget = new Date(y, m, 0); // last day of target month
  if (lastDayOfTarget < now) {
    return { error: 'Cannot generate strategy for a past month.' };
  }

  // Strategy type enum
  if (!VALID_STRATEGY_TYPES.includes(strategyType)) {
    return { error: `Invalid strategy type: ${strategyType}. Valid types: ${VALID_STRATEGY_TYPES.join(', ')}` };
  }

  // Sanitize optional fields
  const sanitized = {};

  // Brief — cap length
  sanitized.userBrief = typeof userBrief === 'string' ? userBrief.slice(0, MAX_BRIEF_LENGTH).trim() : undefined;

  // Focus keywords — cap count
  if (Array.isArray(focusKeywords)) {
    sanitized.focusKeywords = focusKeywords.filter(k => typeof k === 'string' && k.trim()).slice(0, MAX_KEYWORDS);
  } else {
    sanitized.focusKeywords = undefined;
  }

  // Launch events — sanitize: remove empty names, cap count, validate date format
  if (Array.isArray(launchEvents)) {
    sanitized.launchEvents = launchEvents
      .filter(ev => ev && typeof ev.name === 'string' && ev.name.trim())
      .slice(0, MAX_LAUNCH_EVENTS)
      .map(ev => ({
        name: ev.name.trim().slice(0, 200),
        date: /^\d{4}-\d{2}-\d{2}$/.test(ev.date) ? ev.date : '',
        type: ['product', 'campaign', 'sale', 'collab', 'event'].includes(ev.type) ? ev.type : 'product',
      }));
  } else {
    sanitized.launchEvents = undefined;
  }

  return { error: null, sanitized };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const emit = (res, obj) => {
  try { if (!res.writableEnded) res.write(`data: ${JSON.stringify(obj)}\n\n`); } catch {}
};

// stripThink + extractJSON kept only for regenerate-brief (short single-item output)
function stripThink(text) {
  text = (text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const lt = text.lastIndexOf('<think>');
  if (lt !== -1) { const b = text.substring(0, lt).trim(); text = b.length ? b : ''; }
  return text.replace(/```(?:json)?\s*\n?/gi, '').trim();
}

function extractJSON(text) {
  text = stripThink(text);
  // Strategy 1: full text is JSON
  if (text.startsWith('{')) { try { return JSON.parse(text); } catch {} }
  // Strategy 2: first {...} block
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  // Strategy 3: trailing-comma fix
  if (m) {
    const fixed = m[0].replace(/,\s*([\]}])/g, '$1');
    try { return JSON.parse(fixed); } catch {}
  }
  throw new Error('No JSON object found in AI response');
}

// MCP tool sets per strategy type
const MCP_CALLS = {
  'social-media':           (brandId, brand) => {
    const industry = brand?.dna?.industry || 'D2C';
    const country = brand?.dna?.country || 'India';
    const monthName = new Date().toLocaleString('en', { month: 'long' });
    return [
      { tool: 'fetch_trending', args: { brandId } },
      { tool: 'web_search', args: { query: `viral social media reels trends hooks ${industry} marketing ${monthName} 2026 ${country}`, mode: 'quick' } },
    ];
  },
  'performance-marketing':  (brandId, brand) => {
    const industry = brand?.dna?.industry || 'D2C';
    return [
      { tool: 'scrape_competitor', args: { brandId } },
      { tool: 'fetch_trending', args: { brandId } },
      { tool: 'web_search', args: { query: `high conversion Meta Google ads creative frameworks ${industry} performance marketing`, mode: 'quick' } },
    ];
  },
  'seo':                    (brandId, brand) => {
    const industry = brand?.dna?.industry || 'D2C';
    return [
      { tool: 'fetch_seo_audit', args: { brandId } },
      { tool: 'web_search', args: { query: `competitor keyword rankings SEO content strategy ${industry}`, mode: 'quick' } },
    ];
  },
  'sales':                  (brandId, brand) => {
    const industry = brand?.dna?.industry || 'D2C';
    return [
      { tool: 'scrape_competitor', args: { brandId } },
      { tool: 'fetch_trending', args: { brandId } },
      { tool: 'web_search', args: { query: `proven discount offers bundles promotions D2C conversion copy ${industry}`, mode: 'quick' } },
    ];
  },
  'content-marketing':      (brandId, brand) => {
    const industry = brand?.dna?.industry || 'D2C';
    return [
      { tool: 'web_search', args: { query: `trending content marketing topics thought leadership ${industry}`, mode: 'quick' } },
      { tool: 'fetch_seo_audit', args: { brandId } },
    ];
  },
  'email-retention':        (brandId, brand) => {
    const industry = brand?.dna?.industry || 'D2C';
    return [
      { tool: 'fetch_content_history', args: { brandId, platform: '', limit: 20 } },
      { tool: 'fetch_performance_learnings', args: { brandId } },
      { tool: 'web_search', args: { query: `best email retention flows subject lines loyalty strategy ${industry}`, mode: 'quick' } },
    ];
  },
  'influencer-ugc':         (brandId, brand) => {
    const industry = brand?.dna?.industry || 'D2C';
    return [
      { tool: 'fetch_trending', args: { brandId } },
      { tool: 'scrape_competitor', args: { brandId } },
      { tool: 'web_search', args: { query: `viral influencer UGC creator brief campaigns ${industry}`, mode: 'quick' } },
    ];
  },
  'marketplace':            (brandId, brand) => {
    const industry = brand?.dna?.industry || 'D2C';
    return [
      { tool: 'fetch_seo_audit', args: { brandId } },
      { tool: 'scrape_competitor', args: { brandId } },
      { tool: 'web_search', args: { query: `amazon ebc listing optimization product imagery keyword strategy ${industry}`, mode: 'quick' } },
    ];
  },
};

const TYPE_INSTRUCTIONS = {
  'social-media': null, // Dynamic — built at runtime based on connected platforms
  'performance-marketing': `Generate a paid-media strategy. Calendar: 40% ad creatives (Meta/Google), 40% social proof content, 20% landing page copy briefs. Include ROAS targets and audience targeting notes in briefs.`,
  'seo': `Generate an SEO-first strategy. Calendar: 50% blogs/articles, 30% social content promoting blogs, 20% email newsletters. Every blog brief must include a target keyword.`,
  'sales': `Generate a sales acceleration strategy. Calendar: 40% offer/promo content, 30% social proof/reviews, 30% conversion-focused emails and WhatsApp. Include urgency hooks and CTA direction in every brief.`,
  'content-marketing': `Generate a content-led growth strategy. Calendar: 40% thought leadership, 30% product education, 30% community/UGC. Focus on building brand authority.`,
  'email-retention': `Generate a retention-first strategy. Calendar: 60% emails (win-back, loyalty, educational), 20% WhatsApp, 20% social reactivation. Include subject line drafts for every email brief.`,
  'influencer-ugc': `Generate an influencer and UGC strategy. Calendar: 50% UGC briefs, 30% influencer seeding content, 20% repurposing social. Include creator brief direction and seeding notes.`,
  'marketplace': `Generate a marketplace growth strategy. Calendar: 40% listing content updates (A+/A++), 30% review response/social proof, 30% social driving traffic to listings. Include SEO keywords for every marketplace brief.`,
};

// Build dynamic social-media type instruction based on connected platforms
function buildSocialMediaInstruction(connectedPlatforms) {
  const platformList = connectedPlatforms.length > 0
    ? connectedPlatforms.join(', ')
    : 'Instagram, LinkedIn';
  return `Generate a high-impact, modern, trend-driven social media strategy. Content must feel platform-native, highly humanized, and visually premium (avoiding generic stock photography vibes). Calendar MUST include content for ALL these connected platforms: ${platformList}. Distribute content evenly across all platforms — every platform gets content every day. Mix: 40% Reels/video, 30% carousels/static, 20% stories/UGC, 10% text posts. Every brief must include a viral hook angle, structured copywriting guides, and platform-specific hashtag set.`;
}

const STUDIO_MAP = {
  reel: 'video', ugc: 'video', youtube: 'video', video: 'video',
  carousel: 'creative', static: 'creative', story: 'creative', ad: 'creative',
  blog: 'content', newsletter: 'content', text: 'creative', thread: 'creative',
  email: 'retention', whatsapp: 'retention',
  listing: 'content',
};

function buildStrategyPrompt({ brandContext, strategyContext, researchContext, strategyType, month, year, userBrief, launchEvents, focusKeywords, toneOverride, connectedPlatforms, startingDate, endDay }) {
  const monthName = new Date(year, month - 1, 1).toLocaleString('en', { month: 'long' });
  const platformList = connectedPlatforms?.length ? connectedPlatforms.join(', ') : 'instagram, linkedin';
  const numPlatforms = connectedPlatforms?.length || 2;
  const daysRemaining = (endDay || 28) - (startingDate || 1) + 1;
  const totalItems = Math.min(daysRemaining * numPlatforms, 90); // Cap at 90 to avoid token overflow

  // Build user directive block if any context was provided
  const hasDirective = userBrief || (launchEvents?.length) || (focusKeywords?.length) || toneOverride;
  const directiveBlock = hasDirective ? `
<user_directive>
${userBrief ? `CAMPAIGN BRIEF: ${userBrief}` : ''}
${launchEvents?.length ? `
KEY LAUNCH EVENTS (MANDATORY — these dates MUST have launch content):
${launchEvents.map(e => `  - "${e.name}" on ${e.date} (type: ${e.type}) → Reserve this date for launch content. Cluster 3 teaser/follow-up posts in the ±3 days around it.`).join('\n')}` : ''}
${focusKeywords?.length ? `
REQUIRED KEYWORDS: These MUST appear in captions or angles: ${focusKeywords.join(', ')}` : ''}
${toneOverride ? `
TONE OVERRIDE: Override brand default — use ${toneOverride} tone throughout all content.` : ''}
</user_directive>` : '';

  // Get type instruction — dynamic for social-media
  const typeInstruction = strategyType === 'social-media'
    ? buildSocialMediaInstruction(connectedPlatforms || [])
    : (TYPE_INSTRUCTIONS[strategyType] || '');

  return {
    system: `You are a Senior Brand Strategist, growth manager, and CMO. You generate data-driven monthly content strategies grounded in real brand data. Output ONLY valid JSON — no prose, no markdown fences, no explanation. Your JSON must be complete and parseable. Do NOT truncate.`,
    user: `${brandContext}

<strategy_context>
${strategyContext}
</strategy_context>

<market_intelligence>
${researchContext}
</market_intelligence>
${directiveBlock}

STRATEGY TYPE: ${strategyType}
TARGET MONTH: ${monthName} ${year}

TYPE-SPECIFIC FOCUS:
${typeInstruction}

CALENDAR RULES:
- The user wants ONE POST PER PLATFORM PER DAY on EVERY connected platform
- Connected platforms: ${platformList} (${numPlatforms} platforms)
- Generate content for dates from ${year}-${String(month).padStart(2,'0')}-${String(startingDate || 1).padStart(2,'0')} to ${year}-${String(month).padStart(2,'0')}-${String(endDay || 28).padStart(2,'0')}
- 🚨 CRITICAL: Do NOT generate any posts for dates BEFORE ${monthName} ${startingDate || 1}, ${year} — those dates are in the past
- Generate approximately ${totalItems} calendar items total (${daysRemaining} days × ${numPlatforms} platforms)
- Each day MUST have exactly 1 post for EACH connected platform: ${platformList}
- Vary content types per platform: Instagram (reels, carousels, stories), LinkedIn (carousels, static, articles), Twitter (static, text), Facebook (static, carousels, video), YouTube (reels/shorts)
- IMPORTANT: EVERY post caption and angle MUST mention the brand name or specific brand products. Generic content is NOT acceptable.
${launchEvents?.length ? `- CRITICAL: The following dates are launch anchors — they MUST appear in the calendar with launch content: ${launchEvents.map(e=>e.date).join(', ')}` : ''}

🚨 COPY & WRITING RULES (FOR HIGHLY HUMANIZED CONTENT):
- Keep angle under 150 chars. Ensure the angle details a creative, high-impact scroll-stopping concept.
- Keep captionDraft concise (max 300 chars). Captions must be engaging, humanized, conversational, and platform-native (use emojis pacing, an engaging hook, a natural storytelling tone, and a clear call-to-action). Avoid dry corporate copy.
- Relate content to the TRENDS and COMPETITOR GAPS found in <market_intelligence>. At least 30% of posts must actively tackle competitor gaps or hijack current industry trends/hooks.

🚨 AESTHETIC VISUAL DIRECTION RULES (FOR PREMIUM VISUALS):
- For visual platforms, visualDirection must be a highly descriptive, premium art-director prompt that visual generators (like NanoBanana 2 or Flux) can execute perfectly.
- 🚨 TO AVOID TOKEN LIMITS: Be CONCISE! Keep visualDirection under 40 words per item. Combine the details into a dense, comma-separated list of keywords rather than long sentences.
- DO NOT write generic descriptions like "A photo of the product".
- Instruct the AI to structure the visualDirection as a direct camera/set layout covering Style, Lighting, Backdrop, and Composition.
- 🚨 MANDATE HUMAN PRESENCE: For authenticity, 40-50% of visuals MUST feature humans (e.g. candid lifestyle shots, hands holding product) matching brand demographics. Avoid generic stock poses.
- Incorporate the brand's Visual DNA rules (photographyStyle, layoutPreference, decorativeElements, colors).
- CRITICAL PRODUCT & COLOR FIDELITY: Brand colors/color palette must ONLY be used for the background, set environment, or UI elements, and must NEVER be applied to recolor or color-shift the product itself.

Return ONLY this JSON (no text before or after):
{
  "summary": "2-sentence strategy summary — MUST mention the brand name",
  "strategyDocument": {
    "objective": "...",
    "keyThemes": ["..."],
    "channelPriority": ["..."]
  },
  "calendar": [
    {
      "date": "YYYY-MM-DD",
      "contentType": "reel|carousel|static|story|blog|email|ad|ugc|newsletter|youtube|whatsapp|listing",
      "platform": "${connectedPlatforms?.[0] || 'instagram'}|${platformList.replace(/, /g, '|')}",
      "brief": {
        "angle": "...",
        "format": "...",
        "captionDraft": "...",
        "hashtagSet": ["#tag1","#tag2","#tag3"],
        "postingTime": "HH:MM",
        "toneDirection": "...",
        "visualDirection": "...",
        "callToAction": "...",
        "targetKeyword": "..."
      },
      "targetStudio": "content|creative|video|retention",
      "isLaunchAnchor": false
    }
  ]
}`,
  };
}

function buildResearchContext(mcpResults) {
  const parts = [];
  if (mcpResults.web_search?.data) parts.push(`WEB RESEARCH:\n${String(mcpResults.web_search.data).substring(0, 2000)}`);
  if (mcpResults.fetch_trending?.data) {
    const t = mcpResults.fetch_trending.data;
    if (t.trending?.length) parts.push(`TRENDING: ${t.trending.slice(0,5).map(x=>`${x.topic}(${x.urgency})`).join(' | ')}`);
    if (t.calendarHooks?.length) parts.push(`HOOKS: ${t.calendarHooks.slice(0,5).join(' | ')}`);
  }
  if (mcpResults.scrape_competitor?.data?.analysis) parts.push(`COMPETITOR INTEL:\n${mcpResults.scrape_competitor.data.analysis}`);
  if (mcpResults.fetch_seo_audit?.data?.topKeywords?.length) parts.push(`SEO KEYWORDS: ${mcpResults.fetch_seo_audit.data.topKeywords.slice(0,10).join(', ')}`);
  if (mcpResults.fetch_performance_learnings?.data?.topRated?.length) parts.push(`PAST TOP CONTENT: ${mcpResults.fetch_performance_learnings.data.topRated.map(x=>x.title).join(', ')}`);
  if (mcpResults.fetch_content_history?.data) parts.push(`CONTENT HISTORY: available`);
  return parts.join('\n\n') || 'No live research data — proceeding with brand knowledge.';
}

function validateCalendar(calendar, startingDate, month, year) {
  const dateCounts = new Map();
  // Build the cutoff date string for filtering past dates
  const cutoffDate = startingDate ? `${year}-${String(month).padStart(2,'0')}-${String(startingDate).padStart(2,'0')}` : null;

  return (calendar || [])
    .filter(item => item.date && /^\d{4}-\d{1,2}-\d{1,2}$/.test(item.date))
    .map(item => {
      // Auto-pad dates generated as YYYY-M-D to YYYY-MM-DD
      const [y, m, d] = item.date.split('-');
      item.date = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      return item;
    })
    .filter(item => {
      // Filter out any items before the starting date (past dates)
      if (cutoffDate && item.date < cutoffDate) return false;
      return true;
    })
    .map(item => {
      // Allow up to N items per date (one per platform)
      const count = (dateCounts.get(item.date) || 0) + 1;
      dateCounts.set(item.date, count);
      if (count > 8) return null; // Safety cap: max 8 platforms per day

      const brief = item.brief || {};
      const incomplete = !brief.angle || !brief.captionDraft || !brief.toneDirection || !brief.callToAction;
      return {
        ...item,
        targetStudio: STUDIO_MAP[item.contentType] || 'content',
        brief: { ...brief, incomplete },
      };
    })
    .filter(Boolean);
}

function checkBrandSpecificity(strategyDoc, brandName, productNames = []) {
  const calendar = strategyDoc.calendar || [];
  const refs = calendar.filter(item => {
    const text = `${item.brief?.captionDraft || ''} ${item.brief?.angle || ''}`.toLowerCase();
    const brand = (brandName || '').toLowerCase();
    return text.includes(brand) || productNames.some(p => text.includes(p.toLowerCase()));
  });
  return refs.length >= 3;
}

// Core pipeline (used by both blocking and SSE endpoints)
async function runStrategyPipeline({ brandId, strategyType, month, year, userId, userBrief, launchEvents, focusKeywords, toneOverride, emitFn }) {
  const startTime = Date.now();

  // 1. Load brand + products
  emitFn({ type: 'research_start', tool: 'brand_dna', label: 'Loading Brand DNA' });
  const brand = await Brand.findById(brandId).lean();
  if (!brand) throw Object.assign(new Error('Brand not found'), { status: 404 });

  // Brand DNA gate — only block if brand has NO dna object at all (never been scanned)
  if (!brand.dna) {
    throw Object.assign(new Error('Complete your Brand DNA setup before generating a strategy.'), { status: 422, code: 'brand_dna_incomplete' });
  }

  // Fetch active products for full product catalog in Brand DNA context
  const brandProducts = await Product.find({ brand: brandId, status: 'active' })
    .select('title description shortDescription category price features keywords tags')
    .limit(20)
    .lean()
    .catch(() => []);

  const brandContextStr = buildBrandContext(brand, brandProducts);
  const dna = brand.dna || {};
  const products = brandProducts.map(p => p.title).filter(Boolean);

  // Fetch connected social accounts to determine which platforms to generate for
  const SocialAccount = mongoose.model('SocialAccount');
  const connectedAccounts = await SocialAccount.find({ user: userId, isActive: true })
    .select('platform accountName')
    .lean()
    .catch(() => []);
  const connectedPlatforms = [...new Set(connectedAccounts.map(a => a.platform))];
  if (connectedPlatforms.length === 0) {
    // Fallback — if no accounts connected, use common defaults
    connectedPlatforms.push('instagram', 'linkedin');
  }

  // Calculate starting date — skip past dates for current month
  const today = new Date();
  const isCurrentMonth = today.getMonth() + 1 === month && today.getFullYear() === year;
  const endDay = new Date(year, month, 0).getDate(); // Last day of month
  const startingDate = isCurrentMonth ? Math.min(today.getDate() + 1, endDay) : 1; // Start from tomorrow if current month (capped at last day)

  // Strategy context block
  const strategyContext = [
    dna.competitiveIntel?.competitors?.length ? `Competitors: ${dna.competitiveIntel.competitors.map(c=>`${c.name}(${c.weaknesses||''})`).join(', ')}` : '',
    dna.publicSentiment ? `Sentiment: ${dna.publicSentiment.overall || ''}` : '',
    dna.uniqueSellingPoints?.length ? `USPs: ${dna.uniqueSellingPoints.join(', ')}` : '',
    dna.missionStatement ? `Mission: ${dna.missionStatement}` : '',
    `Strategy for: ${new Date(year, month-1,1).toLocaleString('en',{month:'long'})} ${year}`,
    `Connected social platforms: ${connectedPlatforms.join(', ')} (${connectedAccounts.map(a => `${a.platform}: ${a.accountName}`).join(', ')})`,
    `Posting cadence: 1 post per platform per day on ALL connected platforms`,
  ].filter(Boolean).join('\n');

  emitFn({ type: 'research_done', tool: 'brand_dna', label: 'Brand DNA loaded' });

  // 2. MCP calls
  const mcpCalls = (MCP_CALLS[strategyType] || (() => []))(brandId, brand);
  const toolLabels = {
    web_search: 'Web Research', fetch_trending: 'Trending Signals',
    scrape_competitor: 'Competitor Intel', fetch_seo_audit: 'SEO Audit',
    fetch_performance_learnings: 'Performance Data', fetch_content_history: 'Content History',
  };

  for (const call of mcpCalls) emitFn({ type: 'research_start', tool: call.tool, label: toolLabels[call.tool] || call.tool, args: call.args });
  const mcpResults = await callMcpToolsParallel(mcpCalls);
  for (const call of mcpCalls) emitFn({ type: 'research_done', tool: call.tool, label: toolLabels[call.tool] || call.tool });

  const researchContext = buildResearchContext(mcpResults);

  // 3. Generate strategy via callAgent
  const daysRemaining = endDay - startingDate + 1;
  emitFn({ type: 'generating', message: `Building your ${daysRemaining}-day calendar across ${connectedPlatforms.length} platforms (${connectedPlatforms.join(', ')})...` });
  const { system, user } = buildStrategyPrompt({
    brandContext: brandContextStr, strategyContext, researchContext,
    strategyType, month, year,
    userBrief:      userBrief || '',
    launchEvents:   launchEvents || [],
    focusKeywords:  focusKeywords || [],
    toneOverride:   toneOverride || '',
    connectedPlatforms,
    startingDate,
    endDay,
  });

  let parsed;

  // Attempt 1: Claude (best quality, 16k output budget)
  emitFn({ type: 'research_start', tool: 'ai_synthesis', label: 'AI synthesizing strategy' });
  try {
    parsed = await callAgent(system, user, 0.5, 16000, { provider: 'anthropic', timeoutMs: 180_000 });
    if (!parsed?.calendar?.length) throw new Error('Empty calendar from Claude');
    emitFn({ type: 'research_done', tool: 'ai_synthesis', label: 'Strategy synthesized' });
  } catch (e1) {
    console.warn('[monthly-strategy] Claude attempt failed:', e1.message, '— falling back to Gemini');
    emitFn({ type: 'research_start', tool: 'ai_fallback', label: 'Switching to backup AI model' });
    // Attempt 2: Gemini 2.5 Pro (65k output, fast)
    try {
      parsed = await callAgent(system, user, 0.3, 16000, { provider: 'gemini', timeoutMs: 180_000 });
      if (!parsed?.calendar?.length) throw new Error('Empty calendar from Gemini');
      emitFn({ type: 'research_done', tool: 'ai_fallback', label: 'Strategy synthesized (backup)' });
    } catch (e2) {
      console.error('[monthly-strategy] Both providers failed. Claude:', e1.message, 'Gemini:', e2.message);
      throw Object.assign(new Error('strategy_parse_failed'), { status: 500 });
    }
  }

  // 4. Validate calendar
  emitFn({ type: 'research_start', tool: 'validation', label: 'Validating calendar' });
  const calendar = validateCalendar(parsed.calendar, startingDate, month, year);
  const brandSpecific = checkBrandSpecificity({ calendar }, brand.name, products);
  emitFn({ type: 'research_done', tool: 'validation', label: `Validated ${calendar.length} calendar items across ${connectedPlatforms.length} platforms` });

  // 5. Version logic
  const existing = await MonthlyStrategy.find({ user: userId, brand: brandId, strategyType, month, year }).sort({ version: -1 }).limit(1);
  const version = existing.length ? (existing[0].version || 1) + 1 : 1;
  emitFn({ type: 'generating', message: 'Saving your strategy...' });

  // 6. Save
  const doc = await MonthlyStrategy.create({
    user: userId,
    brand: brandId,
    strategyType,
    month,
    year,
    version,
    status: 'draft',
    summary: parsed.summary || '',
    researchData: mcpResults,
    strategyDocument: parsed.strategyDocument || {},
    calendar,
    mcpToolsUsed: mcpCalls.map(c => c.tool),
    brandSpecificityWarning: !brandSpecific,
    generationDurationMs: Date.now() - startTime,
    // Persist user brief context for transparency + future regen
    userBrief:     userBrief || '',
    launchEvents:  launchEvents || [],
    focusKeywords: focusKeywords || [],
    toneOverride:  toneOverride || '',
  });

  return doc;
}

// ─── POST /generate/stream ───────────────────────────────────────────────────
router.post('/generate/stream', protect, requireCredits('monthlyStrategy'), async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  try { res.flushHeaders(); } catch {}

  const { brandId, strategyType, month, year, userBrief, launchEvents, focusKeywords, toneOverride } = req.body;
  const userId = req.user._id;

  const { error: validationError, sanitized } = validateStrategyInput({ brandId, strategyType, month, year, userBrief, launchEvents, focusKeywords });
  if (validationError) {
    emit(res, { type: 'error', message: validationError });
    return res.end();
  }

  try {
    const doc = await runStrategyPipeline({
      brandId, strategyType, month: Number(month), year: Number(year), userId,
      userBrief: sanitized.userBrief, launchEvents: sanitized.launchEvents, focusKeywords: sanitized.focusKeywords, toneOverride,
      emitFn: (obj) => emit(res, obj),
    });
    emit(res, { type: 'done', strategyId: doc._id.toString(), version: doc.version });
  } catch (err) {
    console.error('[monthly-strategy/stream]', err);
    emit(res, { type: 'error', message: err.message || 'Generation failed', code: err.code });
    if (err.status === 422 || err.status === 404) {
      // Non-retryable — refund credits
      const { refundCredits } = await import('../middleware/credits.js');
      await refundCredits(userId, req.creditsDeducted || 15, 'monthlyStrategy', 'Strategy generation blocked — brand DNA incomplete', 'brainstorm', { brandId });
    }
  } finally {
    if (!res.writableEnded) res.end();
  }
});

// ─── POST /generate/start — Fire-and-forget background job ───────────────────
// Returns { jobId } immediately. Pipeline continues on server even after browser close.
// Frontend polls GET /api/jobs/:jobId for status updates.
router.post('/generate/start', protect, requireCredits('monthlyStrategy'), async (req, res) => {
  const { brandId, strategyType, month, year, userBrief, launchEvents, focusKeywords, toneOverride } = req.body;
  const userId = req.user._id;

  const { error: validationError, sanitized } = validateStrategyInput({ brandId, strategyType, month, year, userBrief, launchEvents, focusKeywords });
  if (validationError) {
    return res.status(400).json({ success: false, error: validationError });
  }

  // Concurrent generation guard — prevent double-submit / credit waste
  // Also auto-expire stale jobs stuck for >10 minutes (e.g. server crash, timeout)
  const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
  const activeJob = await GenerationJob.findOne({
    user: userId, type: 'monthly-strategy',
    status: { $in: ['pending', 'processing'] },
  }).lean();

  if (activeJob) {
    const jobAge = Date.now() - new Date(activeJob.startedAt || activeJob.createdAt).getTime();
    if (jobAge > STALE_THRESHOLD_MS) {
      // Stale job — auto-expire it so user isn't permanently blocked
      console.warn(`[strategy/start] Auto-expiring stale job ${activeJob.jobId} (age: ${Math.round(jobAge / 1000)}s)`);
      await GenerationJob.updateOne(
        { _id: activeJob._id },
        { $set: { status: 'failed', errorMessage: 'Auto-expired: generation timed out', completedAt: new Date() } }
      ).catch(() => {});
      // Allow new generation to proceed
    } else {
      return res.status(429).json({ success: false, error: 'A strategy is already being generated. Please wait for it to finish.', existingJobId: activeJob.jobId });
    }
  }

  // Build human-readable label for notifications
  const monthName = new Date(Number(year), Number(month) - 1, 1).toLocaleString('en', { month: 'long' });
  const label = `${monthName} ${year} — ${strategyType.replace(/-/g, ' ')} strategy`;

  // Create the job record immediately
  const jobId = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  const brand = await Brand.findById(brandId).select('name').lean().catch(() => null);

  await GenerationJob.create({
    jobId,
    user:   userId,
    brand:  brandId,
    type:   'monthly-strategy',
    status: 'pending',
    meta:   { label, page: '/brainstorm', brandName: brand?.name || '' },
    startedAt: new Date(),
  });

  // Return jobId to frontend immediately — HTTP request ends here
  res.json({ success: true, jobId, label });

  // ── Background pipeline (survives browser disconnect) ──
  setImmediate(async () => {
    // Helper to write step progress to DB — supports optional meta { tool, detail }
    const pushStep = async (message, status = 'working', meta = {}) => {
      await GenerationJob.updateOne(
        { jobId },
        {
          $push:  { steps: { agent: 'strategy', message, status, tool: meta.tool || '', detail: meta.detail || '', ts: new Date() } },
          $set:   { status: 'processing' },
        }
      ).catch(() => {});
    };

    // Helper to check if job was cancelled by user
    const isCancelled = async () => {
      const job = await GenerationJob.findOne({ jobId }, 'status').lean().catch(() => null);
      return job?.status === 'cancelled';
    };

    try {
      await pushStep('Initializing autonomous daily strategy campaign…', 'working', { tool: 'init' });
      if (await isCancelled()) return;

      const endDate = new Date(year, month, 0); // Last day of month
      
      const doc = await MonthlyStrategy.create({
        user: userId,
        brand: brandId,
        strategyType,
        month,
        year,
        version: 1,
        status: 'draft',
        campaignStatus: 'active',
        summary: 'Autonomous Daily Trend Campaign Initialized',
        calendar: [],
        startDate: new Date(),
        endDate: endDate,
        userBrief: sanitized.userBrief || '',
      });

      // ── Trigger immediate run for today ──
      import('../services/dailyStrategyEngine.js').then(({ runDailyStrategyEngine }) => {
          runDailyStrategyEngine().catch(e => console.error('Immediate Daily run failed', e));
      });
      // ── Mark completed ──
      await GenerationJob.updateOne(
        { jobId },
        {
          $set: {
            status: 'completed',
            completedAt: new Date(),
            result: { strategyId: doc._id.toString(), version: doc.version },
          },
          $push: { steps: { agent: 'strategy', message: 'Strategy initialized successfully!', status: 'done', ts: new Date() } },
        }
      ).catch(() => {});

      // ── Create in-app notification ──
      await createNotification({
        userId,
        brandId,
        type:  'monthly-strategy',
        title: '📅 Strategy Active',
        body:  `${label} is now active and will generate daily.`,
        link:  '/brainstorm',
        jobId,
      });

    } catch (err) {
      if (err.code === 'CANCELLED') {
        console.log(`[strategy/start] Job ${jobId} cancelled by user.`);
        return;
      }
      console.error('[strategy/start] Pipeline error:', err.message);

      await GenerationJob.updateOne(
        { jobId },
        { $set: { status: 'failed', errorMessage: err.message, completedAt: new Date() } }
      ).catch(() => {});

      // Notify user of failure too
      await createNotification({
        userId, brandId, type: 'monthly-strategy',
        title: '⚠️ Strategy Generation Failed',
        body:  `${label} — ${err.message?.slice(0, 100) || 'Unknown error'}`,
        link:  '/brainstorm',
        jobId,
      });

      // Refund credits on non-retryable errors
      if (err.status === 422 || err.status === 404) {
        const { refundCredits } = await import('../middleware/credits.js');
        await refundCredits(userId, req.creditsDeducted || 15, 'monthlyStrategy', 'Strategy generation blocked', 'brainstorm', { brandId });
      }
    }
  });
});

// ─── POST /generate (blocking) ───────────────────────────────────────────────
router.post('/generate', protect, requireCredits('monthlyStrategy'), async (req, res) => {
  const { brandId, strategyType, month, year, userBrief, launchEvents, focusKeywords, toneOverride } = req.body;
  const userId = req.user._id;

  const { error: validationError, sanitized } = validateStrategyInput({ brandId, strategyType, month, year, userBrief, launchEvents, focusKeywords });
  if (validationError) {
    return res.status(400).json({ success: false, error: validationError });
  }

  try {
    const doc = await runStrategyPipeline({
      brandId, strategyType, month: Number(month), year: Number(year), userId,
      userBrief: sanitized.userBrief, launchEvents: sanitized.launchEvents, focusKeywords: sanitized.focusKeywords, toneOverride,
      emitFn: () => {}, // no-op for blocking
    });
    res.json({ success: true, strategy: doc });
  } catch (err) {
    console.error('[monthly-strategy/generate]', err);
    const status = err.status || 500;
    res.status(status).json({ success: false, error: err.message, code: err.code });
  }
});

// ─── GET / — List strategies ─────────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  try {
    const { brandId, month, year, strategyType } = req.query;
    const filter = { user: req.user._id };
    if (brandId) filter.brand = brandId;
    if (month) filter.month = Number(month);
    if (year) filter.year = Number(year);
    if (strategyType) filter.strategyType = strategyType;
    filter.status = { $ne: 'archived' };

    const strategies = await MonthlyStrategy.find(filter)
      .sort({ createdAt: -1 })
      .select('-researchData -strategyDocument')
      .lean();

    res.json({ success: true, strategies });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /:id — Single strategy ──────────────────────────────────────────────
router.get('/:id', protect, async (req, res) => {
  try {
    const doc = await MonthlyStrategy.findOne({ _id: req.params.id, user: req.user._id }).lean();
    if (!doc) return res.status(404).json({ success: false, error: 'Strategy not found' });
    res.json({ success: true, strategy: doc });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /:id/calendar ───────────────────────────────────────────────────────
router.get('/:id/calendar', protect, async (req, res) => {
  try {
    const doc = await MonthlyStrategy.findOne({ _id: req.params.id, user: req.user._id }).select('calendar month year strategyType status').lean();
    if (!doc) return res.status(404).json({ success: false, error: 'Strategy not found' });
    res.json({ success: true, calendar: doc.calendar, month: doc.month, year: doc.year, strategyType: doc.strategyType });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── PATCH /:id/items/:itemId/status ─────────────────────────────────────────
router.patch('/:id/items/:itemId/status', protect, async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['pending', 'in_progress', 'complete', 'published'];
    if (!valid.includes(status)) return res.status(400).json({ success: false, error: `status must be one of: ${valid.join(', ')}` });

    const doc = await MonthlyStrategy.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id, 'calendar._id': req.params.itemId },
      {
        $set: {
          'calendar.$.status': status,
          ...(status === 'published' ? { 'calendar.$.publishedAt': new Date() } : {}),
        },
      },
      { new: true, select: 'calendar' }
    );
    if (!doc) return res.status(404).json({ success: false, error: 'Strategy or item not found' });
    const item = doc.calendar.id(req.params.itemId);
    res.json({ success: true, item });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── PATCH /:id/items/:itemId/asset ──────────────────────────────────────────
router.patch('/:id/items/:itemId/asset', protect, async (req, res) => {
  try {
    const { type, refId, url, preview } = req.body;
    const doc = await MonthlyStrategy.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id, 'calendar._id': req.params.itemId },
      {
        $set: {
          'calendar.$.generatedAsset.type': type || '',
          'calendar.$.generatedAsset.refId': refId ? new mongoose.Types.ObjectId(refId) : null,
          'calendar.$.generatedAsset.url': url || '',
          'calendar.$.generatedAsset.preview': preview || '',
          'calendar.$.status': 'complete',
        },
      },
      { new: true, select: 'calendar' }
    );
    if (!doc) return res.status(404).json({ success: false, error: 'Strategy or item not found' });
    const item = doc.calendar.id(req.params.itemId);
    res.json({ success: true, item });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /:id/items/:itemId/execute — Studio handoff info ───────────────────
router.post('/:id/items/:itemId/execute', protect, async (req, res) => {
  try {
    const doc = await MonthlyStrategy.findOne({ _id: req.params.id, user: req.user._id }).select('calendar strategyType month year').lean();
    if (!doc) return res.status(404).json({ success: false, error: 'Strategy not found' });

    const item = (doc.calendar || []).find(c => c._id.toString() === req.params.itemId);
    if (!item) return res.status(404).json({ success: false, error: 'Calendar item not found' });

    const studio = item.targetStudio || STUDIO_MAP[item.contentType] || 'content';

    // Return the handoff payload — frontend uses this to navigate + pre-fill
    res.json({
      success: true,
      handoff: {
        studio,
        strategyId: req.params.id,
        itemId: req.params.itemId,
        brief: item.brief,
        platform: item.platform,
        contentType: item.contentType,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /:id/items/:itemId/regenerate-brief ─────────────────────────────────
router.post('/:id/items/:itemId/regenerate-brief', protect, requireCredits('monthlyBrief'), async (req, res) => {
  try {
    const { instructions } = req.body;
    const doc = await MonthlyStrategy.findOne({ _id: req.params.id, user: req.user._id });
    if (!doc) return res.status(404).json({ success: false, error: 'Strategy not found' });

    const item = doc.calendar.id(req.params.itemId);
    if (!item) return res.status(404).json({ success: false, error: 'Calendar item not found' });

    const brand = await Brand.findById(doc.brand).lean();
    const brandContext = buildBrandContext(brand);
    const monthName = new Date(doc.year, doc.month - 1, 1).toLocaleString('en', { month: 'long' });

    const aiRouter = getAiRouter();
    const result = await aiRouter.generateText({
      systemPrompt: `You are a Senior Brand Strategist, copywriter, and visual art director. Generate a single highly-humanized and premium content brief as JSON. Output ONLY valid JSON, no prose.`,
      userPrompt: `${brandContext}

Regenerate the brief for this calendar item:
- Date: ${item.date}
- Content Type: ${item.contentType}
- Platform: ${item.platform}
- Month: ${monthName} ${doc.year}
- Strategy Type: ${doc.strategyType}
- Additional instructions: ${instructions || 'Improve quality and brand relevance'}

🚨 COPY & WRITING RULES (FOR HIGHLY HUMANIZED CONTENT):
- Keep angle under 150 chars. Ensure the angle details a creative, high-impact scroll-stopping concept.
- Allow captionDraft to be up to 400 characters. Captions must be engaging, humanized, conversational, and platform-native (use emojis pacing, an engaging hook, a natural storytelling tone, and a clear call-to-action). Avoid dry corporate copy or simple sales pitches.
- Relate content to the brand identity, products, and campaign focus if specified.

🚨 AESTHETIC VISUAL DIRECTION RULES (FOR PREMIUM VISUALS):
- For visual platforms, visualDirection must be a highly descriptive, premium art-director prompt that visual generators (like NanoBanana 2 or Flux) can execute perfectly to create a stunning visual.
- DO NOT write generic descriptions like "A photo of the product".
- Instruct the AI to structure the visualDirection as a direct camera/set layout:
  1. Style/Aesthetic: Choose a modern, on-trend style (e.g., editorial lifestyle photography, moody studio setup, quiet luxury realism, tactile analog film style, raw editorial brutalism).
  2. Lighting: Specify a hyper-specific lighting setup (e.g., dramatic high-contrast side-lighting casting long sharp shadows, soft diffused window light, warm golden hour rim light with cinematic ambient glow).
  3. Backdrop & Set Props: Specify detailed premium materials, surfaces, and props (e.g., warm cream travertine blocks, wrinkled linen fabrics, textured concrete or raw clay platforms, green foliage, delicate water droplets, raw organic ingredients scattered).
  4. Composition & Framing: Detail camera angle and rules of composition (e.g., macro close-up showing fine texture detail, rule-of-thirds asymmetric balance, clean negative space for copy overlays, direct overhead flat lay, low-angle hero shot).
  5. Anti-AI-Slop constraints: Do NOT default to generic glossy gradient backgrounds, floating products with no context, or shiny plastic textures. Emphasize physical, tactile, and photorealistic qualities.
- Incorporate the brand's Visual DNA rules (photographyStyle, layoutPreference, decorativeElements, colors).
- CRITICAL PRODUCT & COLOR FIDELITY: Brand colors/color palette must ONLY be used for the background, set environment, or UI elements, and must NEVER be applied to recolor or color-shift the product itself. The product design, packaging, and colors must remain exactly as originally designed.

Return JSON matching this exact schema:
{
  "angle": "...",
  "format": "...",
  "captionDraft": "...",
  "hashtagSet": ["..."],
  "postingTime": "HH:MM",
  "toneDirection": "...",
  "visualDirection": "...",
  "callToAction": "...",
  "targetKeyword": "..."
}`,
      temperature: 0.5,
      maxTokens: 1000,
    }, { provider: 'anthropic' });

    const newBrief = extractJSON(result.text || '');
    const required = ['angle', 'captionDraft', 'toneDirection', 'callToAction'];
    newBrief.incomplete = required.some(f => !newBrief[f]);

    item.brief = { ...item.brief, ...newBrief };
    await doc.save();

    res.json({ success: true, brief: item.brief });
  } catch (err) {
    console.error('[regenerate-brief]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── DELETE /:id — Soft-delete ───────────────────────────────────────────────
router.delete('/:id', protect, async (req, res) => {
  try {
    const doc = await MonthlyStrategy.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { $set: { status: 'archived' } },
      { new: true, select: '_id status' }
    );
    if (!doc) return res.status(404).json({ success: false, error: 'Strategy not found' });
    res.json({ success: true, message: 'Strategy archived' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /:id/batch-generate — One-click generate all pending calendar images ─
router.post('/:id/batch-generate', protect, async (req, res) => {
  try {
    const doc = await MonthlyStrategy.findOne({ _id: req.params.id, user: req.user._id });
    if (!doc) return res.status(404).json({ success: false, error: 'Strategy not found' });

    const { imageModel = 'nanobanana-2', itemIds } = req.body;

    // Filter to pending items that target creative studio (image generation) or video studio (thumbnail generation)
    const pendingItems = (doc.calendar || []).filter(item => {
      if (item.status !== 'pending') return false;
      if (itemIds?.length && !itemIds.includes(item._id.toString())) return false;
      const studio = item.targetStudio || 'creative';
      return studio === 'creative' || studio === 'video';
    });

    if (pendingItems.length === 0) {
      return res.json({ success: true, batchId: null, totalItems: 0, message: 'No pending image items to generate' });
    }

    // Generate a string jobId (UUID) so /api/jobs/:jobId polling works correctly
    const batchJobId = crypto.randomUUID();

    const batchJob = await GenerationJob.create({
      jobId: batchJobId,           // ← string UUID for polling via /api/jobs/:jobId
      user: req.user._id,
      brand: doc.brand,
      type: 'batch-calendar',
      status: 'processing',
      prompt: `Batch generate ${pendingItems.length} calendar images using ${imageModel}`,
      metadata: {
        strategyId: doc._id.toString(),
        totalItems: pendingItems.length,
        imageModel,
        completedItems: 0,
        failedItems: 0,
      },
    });

    // Return jobId (string) immediately — frontend polls /api/jobs/:jobId
    res.json({ success: true, batchId: batchJobId, totalItems: pendingItems.length });

    // ── Background: run generation sequentially via setImmediate (non-blocking) ──
    setImmediate(async () => {
      try {
        // Import internalGenerateCreative from sibling route
        // Note: ES module caches the import so this is effectively free after first call
        const { internalGenerateCreative } = await import('./creatives.js');

        const delay = ms => new Promise(res => setTimeout(res, ms));
        let completed = 0, failed = 0;
        let consecutiveFailures = 0; // Circuit breaker

        for (const item of pendingItems) {
          try {
            // Circuit breaker check
            if (consecutiveFailures >= 5) {
              console.error(`[batch-generate] Circuit breaker triggered. 5 consecutive failures. Aborting batch ${batchJobId}.`);
              break;
            }

            // Check if batch was cancelled before generating
            const jobCheck = await GenerationJob.findOne({ jobId: batchJobId }).lean();
            if (jobCheck?.status === 'cancelled') {
              console.log(`[batch-generate] Job ${batchJobId} cancelled — stopping.`);
              break;
            }

            // Build prompt purely from visualDirection and mood to avoid caption/conversational pollution
            const prompt = [
              item.brief?.visualDirection || 'Professional marketing creative showcasing the product.',
              item.brief?.toneDirection && `Mood and tone: ${item.brief.toneDirection}`,
            ].filter(Boolean).join('\n');

            // Mark item in_progress
            await MonthlyStrategy.updateOne(
              { _id: doc._id, 'calendar._id': item._id },
              { $set: { 'calendar.$.status': 'in_progress' } }
            );

            // Map platform → valid Creative.type enum value
            const PLATFORM_TO_CREATIVE_TYPE = {
              instagram: 'instagram-post',
              facebook:  'instagram-post',
              linkedin:  'linkedin-post',
              twitter:   'twitter-post',
              tiktok:    'instagram-story',
              gbp:       'instagram-post',
              youtube:   'youtube-thumb',
            };
            const normalizedPlatform = (item.platform || 'instagram').toLowerCase();
            const creativeType = PLATFORM_TO_CREATIVE_TYPE[normalizedPlatform] || 'instagram-post';

            // Determine aspect ratio based on content type + platform
            const getAspectRatio = (contentType, platformStr) => {
              const p = platformStr.toLowerCase();
              if (['story', 'reel', 'video'].includes(contentType)) return '9:16';
              if (contentType === 'carousel') return '1:1';
              if (p === 'linkedin') return '1.91:1';
              if (p === 'twitter' || p === 'x') return '16:9';
              if (p === 'youtube') return '16:9';
              return '4:5'; // instagram/facebook default
            };

            let result = null;
            let attempt = 0;
            let success = false;

            // ── Retry Loop with Exponential Backoff ──
            while (attempt < 3 && !success) {
              try {
                result = await internalGenerateCreative({
                  body: {
                    prompt,
                    brandId: doc.brand?.toString(),
                    type: creativeType,
                    options: {
                      aspectRatio: getAspectRatio(item.contentType, item.platform),
                      imageModel: imageModel,
                      imageSize: '1K',
                      syncUpload: true, // Prevents 16MB document bloat from base64 strings
                    },
                  },
                  user: req.user,
                  creditsDeducted: 0,
                });

                if (result?.success && result?.creative?.imageUrl) {
                  success = true;
                } else {
                  throw new Error(result?.error || 'Generation returned no image');
                }
              } catch (err) {
                const msg = err.message.toLowerCase();
                // Identify transient/rate-limit errors
                const isTransient = msg.includes('overload') || msg.includes('503') || 
                                    msg.includes('500') || msg.includes('timeout') || 
                                    msg.includes('busy') || msg.includes('rate limit') || 
                                    msg.includes('429');

                if (isTransient && attempt < 2) {
                  attempt++;
                  const backoff = 10000 * Math.pow(2, attempt - 1); // 10s, 20s
                  console.warn(`[batch-generate] Transient error for item ${item._id}: ${err.message}. Retrying in ${backoff/1000}s (Attempt ${attempt}/2)...`);
                  await delay(backoff);
                } else {
                  // Definitive failure or out of retries
                  throw err;
                }
              }
            }

            // Success handling
            const assetUrl = result.creative.imageUrl;
            await MonthlyStrategy.updateOne(
              { _id: doc._id, 'calendar._id': item._id },
              {
                $set: {
                  'calendar.$.status': 'complete',
                  'calendar.$.generatedAsset': {
                    type: 'image',
                    url: assetUrl,
                    title: item.brief?.angle || 'Calendar asset',
                  },
                },
              }
            );
            
            completed++;
            consecutiveFailures = 0; // Reset circuit breaker

            // Pacing delay: Wait 3 seconds between successful generations to avoid hammering the API
            await delay(3000);

          } catch (itemErr) {
            console.error(`[batch-generate] Item ${item._id} failed:`, itemErr.message);
            failed++;
            consecutiveFailures++;
            
            // Reset this item to pending so user can retry
            await MonthlyStrategy.updateOne(
              { _id: doc._id, 'calendar._id': item._id },
              { $set: { 'calendar.$.status': 'pending' } }
            ).catch(() => {});

            // Small delay after a failure before attempting the next item
            await delay(5000);
          }

          // Update batch job progress after each item
          await GenerationJob.findOneAndUpdate(
            { jobId: batchJobId },
            { $set: { 'metadata.completedItems': completed, 'metadata.failedItems': failed } }
          );
        }

        // Mark batch complete
        const finalStatus = completed > 0 ? 'completed' : 'failed';
        await GenerationJob.findOneAndUpdate(
          { jobId: batchJobId },
          { $set: { status: finalStatus, completedAt: new Date() } }
        );

        // Notify user
        await createNotification({
          user: req.user._id,
          type: 'batch-calendar',
          title: `📸 Calendar images ready!`,
          message: `${completed} of ${pendingItems.length} images generated${failed > 0 ? ` (${failed} failed)` : ''}. Open Brainstorming to review.`,
          link: '/brainstorm',
        }).catch(e => console.warn('[batch-generate] notification failed:', e.message));

      } catch (bgErr) {
        console.error('[batch-generate] background error:', bgErr.message);
        await GenerationJob.findOneAndUpdate(
          { jobId: batchJobId },
          { $set: { status: 'failed', completedAt: new Date(), errorMessage: bgErr.message } }
        ).catch(() => {});
      }
    });

  } catch (err) {
    console.error('[batch-generate]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

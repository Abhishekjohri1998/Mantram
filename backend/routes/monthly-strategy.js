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
  'social-media':           (brandId) => [
    { tool: 'fetch_trending', args: { brandId } },
    { tool: 'web_search', args: { query: `top performing social media content this month D2C brand strategy`, mode: 'quick' } },
  ],
  'performance-marketing':  (brandId) => [
    { tool: 'scrape_competitor', args: { brandId } },
    { tool: 'fetch_trending', args: { brandId } },
  ],
  'seo':                    (brandId) => [
    { tool: 'fetch_seo_audit', args: { brandId } },
    { tool: 'web_search', args: { query: `competitor keyword rankings SEO content strategy`, mode: 'quick' } },
  ],
  'sales':                  (brandId) => [
    { tool: 'scrape_competitor', args: { brandId } },
    { tool: 'fetch_trending', args: { brandId } },
  ],
  'content-marketing':      (brandId) => [
    { tool: 'web_search', args: { query: `trending content marketing topics this month`, mode: 'quick' } },
    { tool: 'fetch_seo_audit', args: { brandId } },
  ],
  'email-retention':        (brandId) => [
    { tool: 'fetch_content_history', args: { brandId, platform: '', limit: 20 } },
    { tool: 'fetch_performance_learnings', args: { brandId } },
  ],
  'influencer-ugc':         (brandId) => [
    { tool: 'fetch_trending', args: { brandId } },
    { tool: 'scrape_competitor', args: { brandId } },
  ],
  'marketplace':            (brandId) => [
    { tool: 'fetch_seo_audit', args: { brandId } },
    { tool: 'scrape_competitor', args: { brandId } },
  ],
};

const TYPE_INSTRUCTIONS = {
  'social-media': `Generate a social-media-first strategy. Calendar: 70% Reels/carousels, 20% static/stories, 10% UGC. Focus on Instagram, LinkedIn, YouTube Shorts. Every brief must include a viral hook angle and specific hashtag set.`,
  'performance-marketing': `Generate a paid-media strategy. Calendar: 40% ad creatives (Meta/Google), 40% social proof content, 20% landing page copy briefs. Include ROAS targets and audience targeting notes in briefs.`,
  'seo': `Generate an SEO-first strategy. Calendar: 50% blogs/articles, 30% social content promoting blogs, 20% email newsletters. Every blog brief must include a target keyword.`,
  'sales': `Generate a sales acceleration strategy. Calendar: 40% offer/promo content, 30% social proof/reviews, 30% conversion-focused emails and WhatsApp. Include urgency hooks and CTA direction in every brief.`,
  'content-marketing': `Generate a content-led growth strategy. Calendar: 40% thought leadership, 30% product education, 30% community/UGC. Focus on building brand authority.`,
  'email-retention': `Generate a retention-first strategy. Calendar: 60% emails (win-back, loyalty, educational), 20% WhatsApp, 20% social reactivation. Include subject line drafts for every email brief.`,
  'influencer-ugc': `Generate an influencer and UGC strategy. Calendar: 50% UGC briefs, 30% influencer seeding content, 20% repurposing social. Include creator brief direction and seeding notes.`,
  'marketplace': `Generate a marketplace growth strategy. Calendar: 40% listing content updates (A+/A++), 30% review response/social proof, 30% social driving traffic to listings. Include SEO keywords for every marketplace brief.`,
};

const STUDIO_MAP = {
  reel: 'video', ugc: 'video', youtube: 'video',
  carousel: 'creative', static: 'creative', story: 'creative', ad: 'creative',
  blog: 'content', newsletter: 'content',
  email: 'retention', whatsapp: 'retention',
  listing: 'content',
};

function buildStrategyPrompt({ brandContext, strategyContext, researchContext, strategyType, month, year, userBrief, launchEvents, focusKeywords, toneOverride }) {
  const monthName = new Date(year, month - 1, 1).toLocaleString('en', { month: 'long' });

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

  return {
    system: `You are a Senior Brand Strategist and CMO. You generate data-driven monthly content strategies grounded in real brand data. Output ONLY valid JSON — no prose, no markdown fences, no explanation. Your JSON must be complete and parseable. Do NOT truncate.`,
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
${TYPE_INSTRUCTIONS[strategyType] || ''}

CALENDAR RULES:
- Generate exactly 20 calendar items (not 30 — quality over quantity)
- Spread evenly: dates from ${year}-${String(month).padStart(2,'0')}-01 to ${year}-${String(month).padStart(2,'0')}-28
- Max 1 item per date
- Keep captionDraft under 100 chars, angle under 80 chars — be concise
${launchEvents?.length ? `- CRITICAL: The following dates are launch anchors — they MUST appear in the calendar with launch content: ${launchEvents.map(e=>e.date).join(', ')}` : ''}

Return ONLY this JSON (no text before or after):
{
  "summary": "2-sentence strategy summary mentioning brand name",
  "strategyDocument": {
    "objective": "...",
    "keyThemes": ["..."],
    "channelPriority": ["..."]
  },
  "calendar": [
    {
      "date": "YYYY-MM-DD",
      "contentType": "reel|carousel|static|story|blog|email|ad|ugc|newsletter|youtube|whatsapp|listing",
      "platform": "instagram|linkedin|twitter|facebook|youtube|email|whatsapp|amazon",
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

function validateCalendar(calendar) {
  const dateCounts = new Map();
  return (calendar || [])
    .filter(item => item.date && /^\d{4}-\d{2}-\d{2}$/.test(item.date))
    .map(item => {
      // Enforce max 2 items per date (as per the prompt instruction)
      const count = (dateCounts.get(item.date) || 0) + 1;
      dateCounts.set(item.date, count);
      if (count > 2) return null;

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

  // Strategy context block
  const strategyContext = [
    dna.competitiveIntel?.competitors?.length ? `Competitors: ${dna.competitiveIntel.competitors.map(c=>`${c.name}(${c.weaknesses||''})`).join(', ')}` : '',
    dna.publicSentiment ? `Sentiment: ${dna.publicSentiment.overall || ''}` : '',
    dna.uniqueSellingPoints?.length ? `USPs: ${dna.uniqueSellingPoints.join(', ')}` : '',
    dna.missionStatement ? `Mission: ${dna.missionStatement}` : '',
    `Strategy for: ${new Date(year, month-1,1).toLocaleString('en',{month:'long'})} ${year}`,
  ].filter(Boolean).join('\n');

  emitFn({ type: 'research_done', tool: 'brand_dna', label: 'Brand DNA loaded' });

  // 2. MCP calls
  const mcpCalls = (MCP_CALLS[strategyType] || (() => []))(brandId);
  const toolLabels = {
    web_search: 'Web Research', fetch_trending: 'Trending Signals',
    scrape_competitor: 'Competitor Intel', fetch_seo_audit: 'SEO Audit',
    fetch_performance_learnings: 'Performance Data', fetch_content_history: 'Content History',
  };

  for (const call of mcpCalls) emitFn({ type: 'research_start', tool: call.tool, label: toolLabels[call.tool] || call.tool });
  const mcpResults = await callMcpToolsParallel(mcpCalls);
  for (const call of mcpCalls) emitFn({ type: 'research_done', tool: call.tool, label: toolLabels[call.tool] || call.tool });

  const researchContext = buildResearchContext(mcpResults);

  // 3. Generate strategy via callAgent
  emitFn({ type: 'generating', message: `Building your 30-day ${strategyType} calendar...` });
  const { system, user } = buildStrategyPrompt({
    brandContext: brandContextStr, strategyContext, researchContext,
    strategyType, month, year,
    userBrief:      userBrief || '',
    launchEvents:   launchEvents || [],
    focusKeywords:  focusKeywords || [],
    toneOverride:   toneOverride || '',
  });

  let parsed;

  // Attempt 1: Claude (best quality, 16k output budget)
  try {
    parsed = await callAgent(system, user, 0.5, 16000, { provider: 'anthropic', timeoutMs: 180_000 });
    if (!parsed?.calendar?.length) throw new Error('Empty calendar from Claude');
  } catch (e1) {
    console.warn('[monthly-strategy] Claude attempt failed:', e1.message, '— falling back to Gemini');
    // Attempt 2: Gemini 2.5 Pro (65k output, fast)
    try {
      parsed = await callAgent(system, user, 0.3, 16000, { provider: 'gemini', timeoutMs: 180_000 });
      if (!parsed?.calendar?.length) throw new Error('Empty calendar from Gemini');
    } catch (e2) {
      console.error('[monthly-strategy] Both providers failed. Claude:', e1.message, 'Gemini:', e2.message);
      throw Object.assign(new Error('strategy_parse_failed'), { status: 500 });
    }
  }

  // 4. Validate calendar
  const calendar = validateCalendar(parsed.calendar);
  const brandSpecific = checkBrandSpecificity({ calendar }, brand.name, products);

  // 5. Version logic
  const existing = await MonthlyStrategy.find({ user: userId, brand: brandId, strategyType, month, year }).sort({ version: -1 }).limit(1);
  const version = existing.length ? (existing[0].version || 1) + 1 : 1;

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

  if (!brandId || !strategyType || !month || !year) {
    emit(res, { type: 'error', message: 'brandId, strategyType, month, year are required' });
    return res.end();
  }

  try {
    const doc = await runStrategyPipeline({
      brandId, strategyType, month: Number(month), year: Number(year), userId,
      userBrief, launchEvents, focusKeywords, toneOverride,
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

  if (!brandId || !strategyType || !month || !year) {
    return res.status(400).json({ success: false, error: 'brandId, strategyType, month, year are required' });
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
    meta:   { label, page: '/brainstorm-studio', brandName: brand?.name || '' },
    startedAt: new Date(),
  });

  // Return jobId to frontend immediately — HTTP request ends here
  res.json({ success: true, jobId, label });

  // ── Background pipeline (survives browser disconnect) ──
  setImmediate(async () => {
    // Helper to write step progress to DB
    const pushStep = async (message, status = 'working') => {
      await GenerationJob.updateOne(
        { jobId },
        {
          $push:  { steps: { agent: 'strategy', message, status, ts: new Date() } },
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
      await pushStep('Gathering market intelligence…');
      if (await isCancelled()) return;

      const doc = await runStrategyPipeline({
        brandId, strategyType, month: Number(month), year: Number(year), userId,
        userBrief, launchEvents, focusKeywords, toneOverride,
        emitFn: async (obj) => {
          // Map SSE events to job steps
          if (obj.type === 'research_done') await pushStep(`Research: ${obj.label || obj.tool}`, 'done');
          else if (obj.type === 'generating')   await pushStep(obj.message || 'Generating strategy…');
          else if (obj.type === 'error')        await pushStep(obj.message || 'Error', 'error');
          // Check cancellation at every pipeline step
          if (await isCancelled()) throw Object.assign(new Error('Cancelled by user'), { code: 'CANCELLED' });
        },
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
          $push: { steps: { agent: 'strategy', message: 'Strategy ready!', status: 'done', ts: new Date() } },
        }
      ).catch(() => {});

      // ── Create in-app notification ──
      await createNotification({
        userId,
        brandId,
        type:  'monthly-strategy',
        title: '📅 Strategy Ready',
        body:  `${label} has been generated successfully.`,
        link:  '/brainstorm-studio',
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
        link:  '/brainstorm-studio',
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

  if (!brandId || !strategyType || !month || !year) {
    return res.status(400).json({ success: false, error: 'brandId, strategyType, month, year are required' });
  }

  try {
    const doc = await runStrategyPipeline({
      brandId, strategyType, month: Number(month), year: Number(year), userId,
      userBrief, launchEvents, focusKeywords, toneOverride,
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
      systemPrompt: `You are a senior content strategist. Generate a single content brief as JSON. Output ONLY valid JSON, no prose.`,
      userPrompt: `${brandContext}

Regenerate the brief for this calendar item:
- Date: ${item.date}
- Content Type: ${item.contentType}
- Platform: ${item.platform}
- Month: ${monthName} ${doc.year}
- Strategy Type: ${doc.strategyType}
- Additional instructions: ${instructions || 'Improve quality and brand relevance'}

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

export default router;

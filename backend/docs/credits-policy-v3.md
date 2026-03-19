# 💰 Mantram AI — Credits & Pricing Policy v3

> **Last Updated**: March 20, 2026  
> **Commit**: `280ec23` (sachin branch)

---

## 1. Core Pricing Principles

### Credit Value System
- **1 Mantram Credit ≈ ₹5–7 retail value** (varies by tier)
- **Floor price: ₹5/credit** — No credit can ever be acquired for less
- **Target margin: ≥50%** on every action at the floor price

### Credit Formula (Video)
```
credits = Math.max(Math.ceil(API_cost_USD × 34), 5)
```
Where `API_cost_USD = costPerSecond × duration × resolutionMultiplier`  
Resolution multiplier: 720p = 0.7, 1080p = 1.0

---

## 2. API Cost Reference (Per Model)

### Text Models (per 1K tokens)

| Model | Input (¢/1K) | Output (¢/1K) | ₹ per avg call |
|-------|-------------|--------------|----------------|
| Gemini 2.5 Flash | 0.01¢ | 0.04¢ | ₹0.05 |
| GPT-4o-mini | 0.015¢ | 0.06¢ | ₹0.08 |
| Grok-3-mini | 0.03¢ | 0.10¢ | ₹0.13 |
| Sarvam-M | 0.02¢ | 0.08¢ | ₹0.10 |
| GPT-4o | 0.25¢ | 1.0¢ | ₹1.25 |
| Gemini 2.5 Pro | 0.125¢ | 0.50¢ | ₹0.63 |
| Claude Sonnet 4 | 0.30¢ | 1.50¢ | ₹1.78 |

### Image Models (flat per image)

| Model | Cost/image | ₹/image |
|-------|-----------|---------|
| Gemini Flash Image Preview | $0.04 | ₹3.50 |
| Imagen 3.0 / 4.0 | $0.04 | ₹3.50 |

### Video Models (per second of video)

| Model | Fast ($/s) | Quality ($/s) | Max Duration | Max Resolution |
|-------|-----------|--------------|-------------|---------------|
| Seedance 1.0 Lite | $0.05 | $0.08 | 10s | 1080p |
| Kling 3.0 | $0.07 | $0.12 | 15s | 4k |
| Seedance 2.0 Pro | $0.08 | $0.15 | 15s | 1080p |
| Veo 3.1 Fast | $0.08 | $0.15 | 8s | 1080p |
| Grok Imagine | $0.08 | $0.08 | 15s | 720p |
| Veo 3.1 | $0.15 | $0.40 | 8s | 4k |

### Voice Models (flat per call)

| Model | Cost/call | ₹/call |
|-------|----------|--------|
| Sarvam STT (Saaras v3) | $0.005 | ₹0.40 |
| Sarvam TTS (Bulbul v2) | $0.01 | ₹0.85 |
| Minimax Speech-02-HD | $0.02 | ₹1.70 |

---

## 3. Credit Costs Per Action

### Text Actions (85–99% margins)

| Action Key | Label | Credits | API Cost ₹ |
|-----------|-------|---------|-----------|
| `content` | Content Generation | 3 | ₹0.05–1.80 |
| `contentRefine` | Content Refine | 2 | ₹0.05–1.00 |
| `brainstorm` | Brainstorm Generate | 3 | ₹0.05–2.00 |
| `brainstormRefine` | Brainstorm Refine | 1 | ₹0.05–0.50 |
| `brainstormChat` | Brainstorm Chat | 1 | ₹0.05–0.50 |
| `brainstormScreenplay` | Screenplay Gen | 5 | ₹1.00–3.00 |
| `seoHealthCheck` | SEO Health Check | 5 | ₹3.00–6.00 |
| `seoTraffic` | SEO Traffic Analysis | 3 | ₹1.50–3.00 |
| `seoCompetitors` | SEO Competitors | 3 | ₹1.50–3.00 |
| `seoAiVisibility` | SEO AI Visibility | 3 | ₹1.50–3.00 |
| `seoAsk` | SEO Quick Question | 1 | ₹0.50–1.00 |
| `seoAuditPage` | SEO Page Audit | 1 | ₹0.50–1.00 |
| `seoCompetitorDiscover` | Discover Competitors | 1 | ₹0.50–1.00 |
| `seoBacklinks` | Backlink Intel | 5 | ₹2.00–5.00 |
| `seoWarRoom` | War Room | 5 | ₹2.00–5.00 |
| `seoLlmProbe` | LLM Probe | 3 | ₹1.50–3.00 |
| `seoAutoFix` | Auto-Fix | 2 | ₹1.00–2.00 |
| `seoPromptMining` | Prompt Mining | 3 | ₹1.50–3.00 |
| `socialMedia` | Social Strategy | 3 | ₹1.50–3.00 |
| `socialMediaCalendar` | Calendar Gen | 3 | ₹1.50–3.00 |
| `socialMediaAudit` | Account Audit | 4 | ₹2.00–4.00 |
| `socialMediaCompetitor` | Competitor Analysis | 4 | ₹2.00–4.00 |
| `socialMediaScore` | Profile Score | 2 | ₹1.00–2.00 |
| `trendRefresh` | Trend Refresh | 1 | ₹0.30–0.50 |

### Image Actions (77–86% margins)

| Action Key | Label | Credits | API Cost ₹ |
|-----------|-------|---------|-----------|
| `creative` | Creative Image | 5 | ₹3.50 |
| `photoshoot` | AI Photoshoot | 10 | ₹7.00 |
| `canvasGenerate` | Canvas AI Gen | 3 | ₹3.50 |
| `canvasBgRemove` | BG Remove | 2 | ₹3.50 |
| `canvasExtend` | Canvas Extend | 3 | ₹3.50 |
| `adCreative` | Ad Image | 5 | ₹3.50 |

### Video Actions (DYNAMIC — 50%+ margins)

| Action Key | Label | Credits | Notes |
|-----------|-------|---------|-------|
| `videoGenerate` | Video Gen | **dynamic** | `ceil(USD × 34)`, min 5 |
| `videoEdit` | Video Edit | 10 | Fixed |
| `videoBrainstorm` | Video Brainstorm | 2 | Fixed |

#### Video Credit Examples

| Model | Duration | Resolution | Mode | API $ | Credits |
|-------|----------|-----------|------|-------|---------|
| Seedance 1.0 | 5s | 720p | Fast | $0.18 | 6 |
| Seedance 1.0 | 5s | 1080p | Fast | $0.25 | 9 |
| Kling 3.0 | 5s | 1080p | Fast | $0.35 | 12 |
| Kling 3.0 | 5s | 1080p | Quality | $0.60 | 21 |
| Kling 3.0 | 15s | 1080p | Quality | $1.80 | 62 |
| Seedance 2.0 | 5s | 1080p | Fast | $0.40 | 14 |
| Seedance 2.0 | 15s | 1080p | Quality | $2.25 | 77 |
| Veo 3.1 | 5s | 1080p | Quality | $2.00 | 68 |
| Veo 3.1 | 8s | 1080p | Quality | $3.20 | 109 |
| Grok | 5s | 720p | Fast | $0.28 | 10 |

### Voice Actions (83–93% margins)

| Action Key | Label | Credits | API Cost ₹ |
|-----------|-------|---------|-----------|
| `voiceClone` | Voice Clone | 5 | ₹1.70 |
| `voiceTranscribe` | Transcription | 1 | ₹0.40 |

---

## 4. Subscription Tiers

| Plan | Price/mo | Credits/mo | ₹/Credit | Rollover | Annual Price |
|------|---------|-----------|----------|---------|-------------|
| **Free Trial** | ₹0 | 10/day (~300/mo) | Free | ❌ | — |
| **Starter** | ₹699 | 100 + 15 signup | ₹6.99 | ❌ | ₹6,999/yr |
| **Professional** | ₹2,499 | 350 + 50 signup | ₹7.14 | 1 month | ₹24,999/yr |
| **Agency** | ₹7,999 | 1,200 + 150 signup | ₹6.67 | 2 months | ₹79,999/yr |
| **Enterprise** | ₹14,999 | 2,500 + 500 signup | ₹6.00 | Full | Custom |

### Margin Guarantee

| Plan | Worst Case (100% video) | Typical Use (70% text) |
|------|------------------------|----------------------|
| Starter | 50% margin | 93% margin |
| Professional | 56% margin | 92% margin |
| Agency | 55% margin | 90% margin |
| Enterprise | 50% margin | 90% margin |

---

## 5. Credit Top-Up Packs

| Pack | Credits | Bonus | Total | Price | ₹/Credit |
|------|---------|-------|-------|-------|----------|
| ⚡ Spark | 30 | — | 30 | ₹249 | ₹8.30 |
| 🚀 Boost | 100 | +10 | 110 | ₹699 | ₹6.35 |
| 💪 Power | 300 | +45 | 345 | ₹1,999 | ₹5.79 |
| 🔥 Ultra | 750 | +150 | 900 | ₹4,999 | ₹5.55 |
| 💎 Mega | 2,000 | +500 | 2,500 | ₹12,499 | ₹5.00 |

- **First Purchase**: 2× credits (one-time)
- **Validity**: 90 days
- **Floor**: ₹5.00/credit (Mega pack)

---

## 6. Gamification & Rewards

### Daily Login
- 2 credits/day, 7-day streak = +5 bonus, 30-day streak = +25 bonus

### First-Time Milestones
- Add brand: +10cr, First content: +5cr, First image: +5cr
- First video: +10cr, Connect social: +5cr, Invite team: +15cr

### Referral Program
- Referrer: 50 credits, Friend: 30 credits
- Cap: 500 credits/month via referrals

---

## 7. Features NOT Charged / Free

| Feature | Why Free |
|---------|---------|
| Brand Onboarding (scan) | Critical UX — charging hurts activation |
| Dashboard Summary | Lightweight, engagement feature |
| Fidato Chat | 1 credit/message (recommended), or 20 free/day |

---

## 8. Competitor Benchmarks

| Platform | Pricing | Credits/mo | Video Model |
|----------|---------|-----------|-------------|
| Kling AI | $7–128/mo | 660–26,000 | Dynamic per-second |
| Higgsfield | $9–149/mo | 150–unlimited | Dynamic per-second |
| Canva | $13–20/mo | 500 AI uses | Per-use |
| Jasper AI | $39–69/seat | Unlimited text | Per-seat |
| **Mantram AI** | ₹699–14,999/mo | 100–2,500 | Dynamic ceil(USD×34) |

---

## 9. Technical Implementation

### Key Files
- `backend/middleware/credits.js` — Credit costs + dynamic video logic
- `backend/agents/videoStudio/falClient.js` — Video cost calculator
- `backend/scripts/seedPackages.js` — Subscription tier definitions
- `backend/models/CreditUsage.js` — Usage logging with token tracking
- `backend/models/SystemSettings.js` — DB-editable credit costs (super admin)

### Dynamic Video Credit Flow
```
User clicks "Generate Video"
  → Frontend shows cost preview (from estimateCost API)
  → requireCredits('videoGenerate') middleware
    → reads model, duration, resolution, qualityMode from req.body
    → estimateCost(model, duration, resolution, qualityMode)
    → credits = Math.max(ceil(USD × 34), 5)
    → deducts from user balance
  → video generation proceeds
```

# 🔁 Amazon-to-D2C Re-Engagement Automation Agent — Deep Dive & Architecture

## The Refined Problem Statement

**Core Pain Point:** D2C brands sell on Amazon *and* their own Shopify store. Amazon customers are anonymous — the brand gets order data (name, address, email) but has zero re-engagement power on Amazon. Every repeat purchase goes through Amazon, costing the brand **15–30% referral fees**. If the brand could redirect those customers to their own Shopify store, they'd save margins and build a direct relationship.

**The Goal:** An *agentic* module that:
1. **Ingests** Amazon customer data (CSV/API feed of orders with name, address, email)
2. **Matches** products to the brand's Shopify catalog (same SKU, lower price on D2C)
3. **Generates** a visually stunning email — with an **AI-designed creative** showing Amazon price vs. Shopify price
4. **Sends** that mailer automatically to all ingested Amazon customers
5. **Tracks** opens, clicks, and conversions back to the Shopify store

> **In essence:** *"You bought this on Amazon for ₹999. Get it on our website for ₹799 + free shipping + loyalty points."*

---

## Competitive Landscape — How Others Do This

| Platform | What They Do | Strengths | Gaps |
|---|---|---|---|
| **Klaviyo** | Deep Shopify integration, advanced segmentation, predictive analytics, automated email flows | Best-in-class e-commerce email. Revenue attribution. | No Amazon data ingestion. No creative generation. ₹₹₹ expensive. |
| **Omnisend** | Omnichannel (email + SMS + push), pre-built automation workflows, Shopify sync | Easy to use, great automation templates, cost-effective | No Amazon connection, no AI creative. |
| **Drip** | Lifecycle marketing, behavioral tagging, deep Shopify integration | Great for segmentation and drip campaigns | No Amazon bridge, no template design AI. |
| **ActiveCampaign** | CRM + email + automation, 900+ workflow templates | Most powerful automation engine | Overkill for this use case, no Amazon support. |
| **Linkly (Shopify App)** | Amazon order verification → email capture on Shopify store | Bridges Amazon → Shopify email capture via order verification | Requires customer to visit Shopify store first. No outbound mailer. |
| **RetainUp / Privy** | Lead capture popups + email for e-commerce | Good conversion tools | Only works for on-site visitors, not outbound Amazon lists. |

### Key Insight from Competitors
> **None of them do the full loop:**
> Amazon Data → AI Creative Generation → Price Comparison Template → Automated Email Blast
>
> Klaviyo and Omnisend are close (they handle the email sending + Shopify sync) but they DON'T:
> 1. Ingest Amazon order feeds
> 2. Auto-generate the price comparison creative
> 3. Auto-build the mailer HTML with embedded product visuals
>
> **This is Mantram's unique edge — an AI-native, brand-aware agent that does all three.**

---

## Where Should This Live? — Studio Architecture Decision

### Option A: ❌ Extend Conversation Studio (Automations.jsx)
- Current focus is **DM/comment automation** (Instagram/Meta flows)
- It's a chatbot flow builder, not an email campaign engine
- **Verdict: Wrong fit**

### Option B: ❌ Extend Funnel Studio
- Already has nurture sequences, automation rules, landing pages
- Close conceptually (nurturing leads), but Funnel Studio is about **pipeline management** (Awareness → Conversion)
- Adding a full email campaign builder here would bloat an already 260KB+ page
- **Verdict: Partial fit, but would dilute Funnel Studio's focus**

### Option C: ✅ **NEW Studio — "Retention Studio"** (Recommended)

A brand-new, **dedicated studio** focused on **customer retention and re-engagement**, designed as the 11th studio in the Mantram ecosystem.

#### Why a New Studio?
1. **Separate Concern:** Retention is a distinct marketing function from content creation, SEO, ads, or funnel management
2. **Extensible:** This studio can grow to include:
   - Amazon → D2C migration campaigns (Day 1)
   - Win-back campaigns for lapsed Shopify customers
   - Post-purchase nurture sequences
   - Review/referral request campaigns
   - Loyalty program integration
   - WhatsApp/SMS re-engagement (future)
3. **Brand-Aware:** Leverages existing Brand DNA for voice, colors, and design consistency
4. **Fits the Pattern:** Follows the proven State Machine Studio architecture (Engine → Nodes → Prompts)

---

## Module Architecture — How It Works

### The Agentic Pipeline (State Machine)

```
┌─────────────────────────────────────────────────────────────────┐
│                    RETENTION STUDIO ENGINE                       │
│                                                                  │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────────┐ │
│  │ 1. DATA  │──→│ 2. MATCH │──→│ 3. DESIGN│──→│ 4. COMPOSE   │ │
│  │ INGEST   │   │ & ENRICH │   │ CREATIVE │   │ MAILER       │ │
│  └──────────┘   └──────────┘   └──────────┘   └──────────────┘ │
│       │              │              │               │            │
│       ▼              ▼              ▼               ▼            │
│  CSV/API Feed   Shopify Price   AI-generated    HTML email       │
│  Parsing        Lookup &        comparison      with creative    │
│                 Product Match   banner/card     + CTA buttons    │
│                                                                  │
│                                     ┌──────────┐                │
│                                 ──→ │ 5. SEND  │                │
│                                     │ & TRACK  │                │
│                                     └──────────┘                │
│                                          │                       │
│                                          ▼                       │
│                                    Email delivery                │
│                                    via SES/Resend                │
│                                    + open/click tracking         │
└─────────────────────────────────────────────────────────────────┘
```

### Node Breakdown

#### Node 1: Data Ingest Agent
- **Input:** CSV upload / API webhook / manual paste (Amazon order export)
- **Parses:** Name, Email, Address, Product title, ASIN, Order date, Price paid
- **Deduplication:** Merges by email, keeps most recent order
- **Output:** Clean `ContactList` array

#### Node 2: Match & Enrich Agent
- **Connects to:** Shopify Admin API (already integrated via existing OAuth)
- **Logic:**
  - Fuzzy-match Amazon product title → Shopify product title
  - Pull Shopify price, images, product URL
  - Calculate price delta (Amazon price − Shopify price)
  - Enrich with product features from Brand DNA
- **Output:** `EnrichedContactList` with matched products + price comparisons
- **Human Gate:** ✅ User reviews matches before proceeding

#### Node 3: Creative Design Agent (AI)
- **Uses:** Gemini / GPT-4o for creative generation
- **Creates:** A product comparison card/banner:
  - Product image (from Shopify catalog)
  - Amazon price (struck through) vs. Shopify price (highlighted)
  - Savings badge ("Save ₹200!")
  - Brand colors/fonts from Brand DNA
- **Output:** HTML/CSS creative component (rendered as image or inline HTML)
- **Leverages:** Existing CanvasEditor patterns for template rendering
- **Human Gate:** ✅ User reviews/edits creative before proceeding

#### Node 4: Mailer Compose Agent (AI)
- **Generates:** Complete email HTML using:
  - Brand header (logo, brand colors)
  - Personalization ({{name}})
  - Creative from Node 3 (embedded)
  - CTA button ("Shop Now on [BrandName].com")
  - Footer (unsubscribe link, address)
- **Templates:** 3–5 pre-built layouts the user can choose from
- **AI writes:** Subject line + preview text + body copy in brand voice
- **Output:** Final `MailerHTML` + `SubjectLine`
- **Human Gate:** ✅ User previews email before sending

#### Node 5: Send & Track Agent
- **Email Service:** Resend API (or AWS SES) — already supports transactional email patterns
- **Batch sends:** Rate-limited (50/sec) to the contact list
- **Tracking:** Open pixel + click tracking on CTA links
- **Analytics:** Open rate, click rate, Shopify conversion tracking via UTM params
- **Output:** Campaign report dashboard

---

## 🧬 Brand DNA Integration — The Core Differentiator

This is what makes the Retention Studio **brand-aware** — every pipeline node pulls from the Brand DNA model (`Brand.dna.*`). Here's the exact field mapping:

### Brand DNA Fields Used Per Node

| DNA Subsystem | Fields | Node 2 (Match) | Node 3 (Creative) | Node 4 (Mailer) | Node 5 (Send) |
|---|---|:---:|:---:|:---:|:---:|
| **Logo** | `dna.logo.url`, `dna.logo.metadata` | — | ✅ Header logo | ✅ Email header | — |
| **Colors** | `dna.colors[]` (primary, secondary, accent, bg) | — | ✅ Card styling, badges, gradients | ✅ Email theme, CTA button colors | — |
| **Fonts** | `dna.fonts.heading`, `.body`, `.accent` | — | ✅ Price text, badge text | ✅ Email typography | — |
| **Voice** | `dna.voice.personality`, `.tone`, `.warmth`, `.formality`, `.sampleQuote`, `.keywords` | — | ✅ Badge copy tone | ✅ **Email copy generation** — subject line, body, CTA text | — |
| **Content Style** | `dna.contentStyle.dos`, `.donts`, `.ctaStyle`, `.emojiUsage`, `.keyPhrases` | — | — | ✅ Copy guardrails, CTA phrasing, emoji rules | — |
| **Visual DNA** | `dna.visualDNA.designStyle`, `.layoutPreference`, `.imageMood`, `.typographyStyle`, `.decorativeElements`, `.designRules`, `.designAvoid` | — | ✅ **Creative layout & style** — drives the entire visual direction | ✅ Email template styling | — |
| **Brand Images** | `dna.brandImages[]` | — | ✅ Fallback product visuals | ✅ Hero imagery | — |
| **USPs** | `dna.uniqueSellingPoints[]` | ✅ Enrichment copy | ✅ Badge callouts | ✅ Body copy selling points | — |
| **Tagline** | `dna.tagline` | — | ✅ Creative footer | ✅ Email subheader | — |
| **Target Audience** | `dna.targetAudience` | ✅ Match priority | ✅ Tone calibration | ✅ Copy personalization | — |
| **Industry** | `dna.industry` | ✅ Product matching logic | ✅ Design conventions | ✅ Subject line context | — |
| **Social Links** | `dna.socialLinks.*` | — | — | ✅ Email footer social icons | — |
| **Knowledge Bank** | `knowledge.entries[]` | ✅ Product FAQ enrichment | — | ✅ Product benefit copy | — |

### How It Flows in Code

The `buildRetentionBrandCtx(brand)` helper (following the PM Studio's `buildBrandCtx` pattern) will construct a rich context string:

```
BRAND: AcmeCo
INDUSTRY: Health & Wellness
TAGLINE: "Nature's best, delivered to your door"
VOICE: Warm & Approachable (Tone: 65, Warmth: 80, Formality: 30)
VOICE KEYWORDS: natural, pure, trusted, gentle
CTA STYLE: Action-oriented, friendly
CONTENT RULES:
  DO: Use testimonials, mention organic certifications
  DON'T: Use aggressive sales language, mention competitors
PRIMARY COLOR: #2E7D32 (Forest Green)
ACCENT COLOR: #FF8F00 (Amber)
DESIGN STYLE: clean-centered, bright-airy, sans-serif-modern
DESIGN RULES: "Always use ample white space", "Headlines in sentence case"
USPs: Organic certified, Farm-to-door in 48hrs, 100% natural ingredients
```

This context string is injected into **every AI prompt** across Nodes 3, 4, and 5, ensuring the creative, copy, and mailer are all brand-consistent.

### Visual DNA → Creative Mapping (Node 3)

| Visual DNA Field | Creative Impact |
|---|---|
| `designStyle: "minimalist"` | Clean card, lots of whitespace, subtle shadows |
| `designStyle: "bold-graphic"` | High contrast, large price typography, bright badges |
| `imageMood: "bright-airy"` | Light backgrounds, soft shadows, pastel accents |
| `imageMood: "dark-moody"` | Dark background card, neon/glow price highlights |
| `layoutPreference: "clean-centered"` | Product image centered, prices below |
| `layoutPreference: "asymmetric"` | Product left, price comparison right, diagonal cuts |
| `decorativeElements: "geometric-shapes"` | Price badges use hexagonal/circular shapes |
| `typographyStyle: "serif-elegant"` | Elegant typeface for prices, premium feel |

### Voice Sliders → Copy Tone (Node 4)

| Slider Config | Email Copy Style |
|---|---|
| **Warmth: 80+, Formality: 30-** | *"Hey {{name}}! 🎉 We noticed you loved our Green Tea on Amazon..."* |
| **Warmth: 40, Formality: 70+** | *"Dear {{name}}, as a valued customer, we'd like to offer you..."* |
| **Wit: 80+** | *"Amazon charged you HOW MUCH? 😱 Plot twist: same product, way less on our site."* |
| **Tone: 80+ (Bold)** | *"Stop overpaying. Same product. Better price. Direct from us."* |

---

## Mailer + Creative Template System

### Creative Templates (the visual inside the email)

| Template | Description |
|---|---|
| **Price Showdown** | Side-by-side: Amazon box vs. Website box with prices |
| **Savings Spotlight** | Large product image + "You saved ₹X" callout badge |
| **Loyalty Unlock** | Price comparison + "Join our website for rewards + free shipping" |
| **Bundle Builder** | "You bought X on Amazon, complete the set on our store" |
| **VIP Welcome** | "As a valued customer, here's an exclusive website-only offer" |

### Mailer Templates (the email wrapper)

| Template | Description |
|---|---|
| **Clean Minimal** | White bg, brand header, single product card, CTA |
| **Dark Premium** | Dark bg with gradient, premium feel, multiple products |
| **Social Proof** | Product card + review stars + customer testimonial |
| **Urgency Drive** | Countdown timer + limited-time offer styling |

Both are generated by AI using Brand DNA (colors, fonts, voice) and are editable via the existing Canvas Editor integration.

---

## Email Service Provider (ESP) Strategy

### Recommended: **Resend**
- Modern API-first ESP built for developers
- React Email support (generates HTML from JSX templates)
- Built-in analytics (opens, clicks, bounces)
- Generous free tier (3,000 emails/month), then $20/month for 50K
- Simple integration: `POST /emails` with HTML body
- Supports custom domains for deliverability

### Alternative: **AWS SES**
- Cheapest at scale ($0.10 per 1,000 emails)
- More setup required (domain verification, IP warm-up)
- Best for high-volume senders (100K+ monthly)

### Integration Pattern
```
Retention Studio → Resend/SES API → Recipient Inbox
                                   ↓
                              Tracking webhook → Mantram DB
                              (opens, clicks, bounces)
```

---

## Reusable Infrastructure Already in Mantram

| Existing Asset | How it's Reused |
|---|---|
| **Shopify OAuth + Admin API** | Product price lookup, catalog matching |
| **Brand DNA Engine** | Colors, fonts, voice for creative + email generation |
| **State Machine Pattern** | Engine/Nodes architecture for the pipeline |
| **AI Router (multi-model)** | GPT-4o for copy, Gemini for creative |
| **Canvas Editor** | Template editing for creative components |
| **Nurture Sequence patterns** | Email content generation prompts, channel handling |
| **Contact/FunnelEntry models** | Contact list management patterns |

---

## Future Enhancements (Phase 2+)

- **Amazon SP-API Integration** — Auto-pull orders instead of CSV upload
- **Shopify Customer Sync** — Cross-reference existing Shopify customers to avoid duplicate outreach
- **A/B Testing** — Send variant A/B subject lines + creatives, auto-optimize
- **WhatsApp/SMS channels** — Multi-channel re-engagement via Sarvam/Meta APIs
- **Win-Back Automations** — Auto-trigger campaigns for lapsed Shopify customers
- **Review Request Flows** — Ask happy customers for reviews on Amazon/Google
- **Referral Campaigns** — "Refer a friend, both get 10% off on our website"
- **Recurring Campaigns** — Schedule weekly Amazon data syncs + auto-campaigns

---

## Summary Decision

> [!IMPORTANT]
> **Create a new "Retention Studio"** — the 11th studio in Mantram AI. This gives you a dedicated, extensible space for all customer retention use cases, starting with the Amazon → D2C migration agent. It follows the established State Machine architecture, reuses Shopify OAuth and Brand DNA, and can grow to cover win-back, loyalty, and multi-channel re-engagement.

This is **not something competitors do end-to-end.** Klaviyo/Omnisend handle the *sending*, but Mantram uniquely handles the **full loop**: data ingestion → AI creative generation → brand-aware mailer composition → automated dispatch. That's the moat.

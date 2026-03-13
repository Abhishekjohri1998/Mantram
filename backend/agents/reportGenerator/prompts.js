/**
 * Report Generator — AI System Prompts
 * 
 * Prompts for generating branded, interactive reports across all studios.
 * Each prompt produces structured JSON with report sections.
 */

// ──────────────────────────────────────────────────────────────────────────────
// UNIVERSAL REPORT GENERATOR — Produces structured sections for any studio
// ──────────────────────────────────────────────────────────────────────────────

export const REPORT_SECTIONS_PROMPT = (brandContext, studioContext) => `
You are an elite marketing analyst and report designer at a top-tier consulting firm.
Generate a comprehensive, visually-structured report with multiple sections.

${brandContext}

${studioContext}

GENERATE A REPORT WITH THESE SECTIONS (as a JSON array called "sections"):

Each section must have:
- "id": unique kebab-case identifier (e.g., "executive-summary", "kpi-overview")
- "title": human-readable section title
- "type": one of "kpi-grid", "chart", "table", "text", "recommendations", "timeline", "comparison"
- "data": section-specific data (see below)
- "order": numeric ordering

SECTION TYPE SPECIFICATIONS:

1. **kpi-grid** → data: { metrics: [{ label, value, change, changeDirection: "up"|"down"|"flat", unit, icon }] }
   - Include 4-8 key metrics with actual or estimated values

2. **chart** → data: { chartType: "bar"|"line"|"pie"|"radar"|"doughnut", labels: [], datasets: [{ label, data: [] }], description }
   - Use realistic numbers. For bar/line charts, include 6-12 data points.

3. **table** → data: { columns: [{ key, label }], rows: [{ ... }], sortable: true }
   - Include 5-10 rows of meaningful data

4. **text** → data: { content: "markdown text", editable: true }
   - Rich narrative text. Use markdown: headers, bold, bullets, etc.

5. **recommendations** → data: { items: [{ title, description, priority: "high"|"medium"|"low", impact, action }] }
   - Include 4-6 actionable recommendations ranked by priority

6. **timeline** → data: { events: [{ date, title, description, status: "completed"|"in-progress"|"upcoming" }] }

7. **comparison** → data: { items: [{ name, metrics: { key: value } }], metricLabels: { key: label } }

ALSO GENERATE:
- "title": A compelling report title
- "narrative": {
    "executiveSummary": 2-3 sentence C-suite summary,
    "keyInsights": array of 3-5 key insights (one sentence each),
    "recommendations": array of { title, description, priority, impact }
  }
- "slides": array of { title, sectionIds: [ids of sections to show], notes: speaker notes, layout: "full"|"split"|"grid" }
  - Generate 5-8 slides covering the full report in presentation order

IMPORTANT:
- Use the brand's voice style in all text sections
- Include realistic, plausible data (not obviously fake round numbers)
- Make recommendations specific and actionable, not generic
- The report should tell a coherent story from overview → details → recommendations → next steps
- DO NOT use markdown formatting like #, ##, ###, **, *, ~~, or backticks in text content. Write clean, plain-language text. Use line breaks for paragraph separation. No asterisks whatsoever.

Respond in valid JSON with keys: title, sections, narrative, slides.
`;

// ──────────────────────────────────────────────────────────────────────────────
// STUDIO-SPECIFIC CONTEXT BUILDERS
// ──────────────────────────────────────────────────────────────────────────────

export const SEO_REPORT_CONTEXT = (data, reportType) => {
    const TYPE_INSTRUCTIONS = {
        'health-check': `
FOCUS: Website Health Check Report
This report must focus EXCLUSIVELY on website health and technical SEO.
REQUIRED SECTIONS:
- KPI grid: Overall SEO health score, page speed score, mobile usability, crawl errors, broken links count, HTTPS status
- Chart (bar): Issue severity breakdown (critical/high/medium/low)
- Table: Top 10 critical issues with page URL, issue type, severity, and fix priority
- Text: Technical health summary — what is working well, what needs immediate attention
- Recommendations: Specific technical fixes ordered by impact (e.g., "Fix 3 broken canonical tags on product pages")
- Timeline: 30-day fix roadmap with milestones`,
        'competitor-analysis': `
FOCUS: Competitor SEO Analysis Report
This report must focus EXCLUSIVELY on competitive SEO positioning.
REQUIRED SECTIONS:
- KPI grid: Brand vs top 3 competitors — domain authority, total keywords, total backlinks, estimated traffic
- Chart (bar): Keyword overlap and gap visualization
- Table: Head-to-head keyword comparison — keywords where competitors rank but brand does not
- Chart (radar): Multi-dimension competitor scoring (content, backlinks, technical, speed, authority)
- Text: Competitive intelligence summary — biggest threats and biggest opportunities
- Recommendations: Specific actions to outrank each competitor`,
        'traffic-report': `
FOCUS: Organic Traffic Analysis Report
This report must focus EXCLUSIVELY on organic search traffic trends and keyword performance.
REQUIRED SECTIONS:
- KPI grid: Total organic sessions, unique visitors, bounce rate, avg session duration, top landing page clicks, new vs returning
- Chart (line): Monthly organic traffic trend (6-12 months)
- Table: Top 15 performing keywords with position, search volume, CTR, impressions
- Chart (pie): Traffic by device (desktop, mobile, tablet)
- Chart (bar): Traffic by top 5 landing pages
- Text: Traffic trend analysis and seasonality insights
- Recommendations: Keyword opportunities to capture more traffic`,
        'ai-visibility': `
FOCUS: AI Search Visibility Report
This report must focus EXCLUSIVELY on how the brand appears in AI/LLM-generated answers.
REQUIRED SECTIONS:
- KPI grid: AI mention rate, citation count across LLMs, brand sentiment in AI, competitor mention comparison
- Chart (bar): Brand mentions vs competitors across AI platforms (ChatGPT, Gemini, Perplexity, Meta AI)
- Table: Key prompts/queries where brand should appear but does not
- Chart (doughnut): Sentiment analysis of AI mentions (positive/neutral/negative)
- Text: AI discoverability analysis — where the brand is strong and where it is invisible
- Recommendations: Specific content strategies to improve AI citation and recommendation rates`,
    };

    const instruction = TYPE_INSTRUCTIONS[reportType] || `
FOCUS: ${reportType} Report
Generate a comprehensive SEO report focused on ${reportType}.`;

    return `
STUDIO: SEO Intelligence
REPORT TYPE: ${reportType}
${instruction}

AVAILABLE DATA:
${JSON.stringify(data, null, 2).substring(0, 6000)}

CRITICAL: Generate ONLY sections relevant to "${reportType}". Do NOT include unrelated sections.
`;
};

export const PM_REPORT_CONTEXT = (data, reportType) => {
    const TYPE_INSTRUCTIONS = {
        'competitor-research': `
FOCUS: Competitor Ad Intelligence Report
This report must focus EXCLUSIVELY on competitor advertising analysis.
REQUIRED SECTIONS:
- KPI grid: Number of competitor ads tracked, avg competitor spend estimate, top competitor CTR, most aggressive competitor
- Chart (bar): Competitor ad spend comparison by platform (Meta vs Google)
- Table: Competitor ad library — top 10 competitor creatives with platform, format, estimated engagement, running duration
- Chart (pie): Competitor platform mix (Facebook, Instagram, Google Search, YouTube, Display)
- Text: Competitive landscape analysis — what competitors are doing differently, messaging themes, audience targeting patterns
- Recommendations: Counter-strategies for each major competitor`,
        'campaign-performance': `
FOCUS: Campaign Performance Report
This report must focus EXCLUSIVELY on the brand's own campaign performance metrics.
REQUIRED SECTIONS:
- KPI grid: Total spend, total conversions, ROAS, CPA, CTR, impressions, clicks, frequency
- Chart (line): Daily/weekly spend vs conversions trend
- Chart (bar): Performance by campaign — top 5 campaigns by ROAS
- Table: All active campaigns with spend, impressions, clicks, conversions, ROAS, CPA
- Chart (doughnut): Budget allocation by platform
- Text: Performance narrative — what drove results and what underperformed
- Recommendations: Budget reallocation and optimization suggestions`,
        'strategy-report': `
FOCUS: Advertising Strategy Report
This report must focus EXCLUSIVELY on strategic planning and media buying strategy.
REQUIRED SECTIONS:
- KPI grid: Recommended monthly budget, projected ROAS, target CPA, estimated reach, projected conversions
- Chart (bar): Recommended budget split by platform and objective
- Table: Channel strategy matrix — platform, objective, audience, creative format, budget allocation
- Text: Strategic narrative — market opportunity, audience analysis, channel rationale, phased approach
- Timeline: 90-day campaign rollout plan with milestones
- Recommendations: Top strategic priorities with expected impact and investment required`,
        'budget-analysis': `
FOCUS: Budget Efficiency Analysis Report
This report must focus EXCLUSIVELY on spend optimization and ROI analysis.
REQUIRED SECTIONS:
- KPI grid: Total spend, blended ROAS, cost per result, budget utilization rate, wasted spend estimate
- Chart (line): Monthly spend trend vs ROAS trend (dual axis)
- Chart (bar): Spend efficiency by campaign — ROAS per campaign
- Table: Budget breakdown — campaign, daily budget, actual spend, results, CPA, ROAS
- Chart (pie): Spend by objective (awareness, consideration, conversion)
- Text: Budget efficiency analysis — where money is being wasted, where to invest more
- Recommendations: Specific budget reallocation suggestions with projected improvement`,
    };

    const instruction = TYPE_INSTRUCTIONS[reportType] || `
FOCUS: ${reportType} Report
Generate a comprehensive Performance Marketing report focused on ${reportType}.`;

    return `
STUDIO: Performance Marketing
REPORT TYPE: ${reportType}
${instruction}

AVAILABLE DATA:
${JSON.stringify(data, null, 2).substring(0, 6000)}

CRITICAL: Generate ONLY sections relevant to "${reportType}". Do NOT include unrelated sections.
`;
};

export const FUNNEL_REPORT_CONTEXT = (data, reportType) => {
    const TYPE_INSTRUCTIONS = {
        'funnel-health': `
FOCUS: Funnel Health Assessment Report
This report must focus EXCLUSIVELY on overall funnel health and conversion efficiency.
REQUIRED SECTIONS:
- KPI grid: Total funnels active, overall conversion rate, avg time-to-convert, total leads in pipeline, pipeline value, drop-off rate
- Chart (bar): Conversion rate by funnel stage (awareness → interest → consideration → decision → action)
- Chart (line): Weekly funnel conversion trend
- Table: Funnel-by-funnel health scorecard — name, stages, conversion rate, avg time, health status
- Text: Health assessment summary — which funnels are performing, which need attention
- Recommendations: Specific fixes for underperforming funnel stages`,
        'conversion-analysis': `
FOCUS: Conversion Analysis Report
This report must focus EXCLUSIVELY on conversion rates, drop-off points, and optimization.
REQUIRED SECTIONS:
- KPI grid: Top-of-funnel entries, bottom-of-funnel conversions, overall CVR, biggest drop-off stage, best-converting funnel
- Chart (bar): Stage-by-stage conversion rates (showing drop-off at each step)
- Chart (line): Conversion trend over time (weekly/monthly)
- Table: Drop-off analysis — stage, entries, exits, drop-off rate, top exit reasons
- Chart (doughnut): Conversion by source/channel
- Text: Conversion pattern analysis — why leads convert or abandon
- Recommendations: A/B test ideas and friction-reduction strategies for each drop-off point`,
        'pipeline-report': `
FOCUS: Pipeline Status Report
This report must focus EXCLUSIVELY on lead pipeline health, deal stages, and revenue forecasting.
REQUIRED SECTIONS:
- KPI grid: Total pipeline value, qualified leads, deals in progress, expected close rate, weighted forecast, avg deal size
- Chart (bar): Pipeline value by stage
- Table: Top 10 deals in pipeline — lead name, stage, value, score, last activity, expected close
- Chart (pie): Pipeline by lead source
- Text: Pipeline health narrative — velocity trends, bottleneck stages, revenue forecast
- Recommendations: Actions to accelerate stuck deals and increase pipeline coverage`,
    };

    const instruction = TYPE_INSTRUCTIONS[reportType] || `
FOCUS: ${reportType} Report
Generate a comprehensive Funnel report focused on ${reportType}.`;

    return `
STUDIO: Funnel Intelligence
REPORT TYPE: ${reportType}
${instruction}

AVAILABLE DATA:
${JSON.stringify(data, null, 2).substring(0, 6000)}

CRITICAL: Generate ONLY sections relevant to "${reportType}". Do NOT include unrelated sections.
`;
};

export const D2C_REPORT_CONTEXT = (data, reportType) => {
    const TYPE_INSTRUCTIONS = {
        'revenue-report': `
FOCUS: Revenue Analytics Report
This report must focus EXCLUSIVELY on revenue, orders, and financial performance.
REQUIRED SECTIONS:
- KPI grid: Total revenue, total orders, AOV, revenue growth rate, refund rate, net revenue
- Chart (line): Daily/weekly revenue trend (30 days)
- Chart (bar): Revenue by product category
- Table: Top 10 products by revenue — product name, units sold, revenue, return rate, margin
- Chart (pie): Revenue by sales channel (online, social, marketplace)
- Text: Revenue performance narrative — growth drivers, seasonal patterns, concerns
- Recommendations: Revenue growth strategies — pricing, bundling, upsell opportunities`,
        'product-performance': `
FOCUS: Product Performance Report
This report must focus EXCLUSIVELY on individual product metrics and inventory health.
REQUIRED SECTIONS:
- KPI grid: Total SKUs, top seller units, worst performer, avg margin, out-of-stock count, new launches
- Chart (bar): Top 10 products by units sold
- Table: Full product scorecard — product, units, revenue, margin, return rate, stock status, velocity score
- Chart (radar): Product health dimensions (sales velocity, margin, customer rating, return rate, stock health)
- Chart (doughnut): Product category mix by revenue
- Text: Product analysis — winners, underperformers, and seasonal trends
- Recommendations: Actions per product — restock, bundle, discount, discontinue, or promote`,
        'customer-insights': `
FOCUS: Customer Intelligence Report
This report must focus EXCLUSIVELY on customer behavior, segmentation, and lifetime value.
REQUIRED SECTIONS:
- KPI grid: Total customers, new vs returning ratio, avg LTV, repeat purchase rate, avg days between orders, NPS estimate
- Chart (pie): Customer segments (VIP/loyal, occasional, one-time, at-risk, churned)
- Chart (line): Customer acquisition trend (monthly new customers)
- Table: Top 20 customers by LTV — name, total orders, total spend, last order, segment
- Chart (bar): Cohort analysis — retention by acquisition month
- Text: Customer behavior insights — who buys, why they return, why they leave
- Recommendations: Retention strategies by segment — win-back, loyalty, upsell programs`,
    };

    const instruction = TYPE_INSTRUCTIONS[reportType] || `
FOCUS: ${reportType} Report
Generate a comprehensive D2C analytics report focused on ${reportType}.`;

    return `
STUDIO: D2C / E-Commerce Intelligence
REPORT TYPE: ${reportType}
${instruction}

AVAILABLE DATA:
${JSON.stringify(data, null, 2).substring(0, 6000)}

CRITICAL: Generate ONLY sections relevant to "${reportType}". Do NOT include unrelated sections.
`;
};

// ──────────────────────────────────────────────────────────────────────────────
// SLIDE NARRATIVE PROMPT — enrich slides with speaker notes
// ──────────────────────────────────────────────────────────────────────────────

export const SLIDE_NARRATIVE_PROMPT = (brandContext) => `
You are a presentation coach. Given a report's sections and slide structure, 
write compelling speaker notes for each slide. Each note should be 2-3 sentences
that explain the key takeaway from the slide's data.

${brandContext}

Use the brand's voice style. Be confident and data-driven.
Respond in valid JSON with key: slides (array of { title, notes }).
`;

/**
 * Master Orchestrator — The Brain of the Platform
 *
 * Routes any user command to the right studio/pipeline and
 * supports cross-studio chaining for full campaigns.
 *
 * Upgraded: Fidato now has live tool access via MCP.
 * Before classifying intent, the orchestrator fetches trending topics
 * and web intelligence so the routing decision is grounded in current reality.
 */

import { callAgent, loadBrandContext } from './shared/agentUtils.js';
import { callMcpToolsParallel } from '../mcp/registry.js';

// ── Intent Classification Prompt ──
const CLASSIFIER_PROMPT = (brandContext, marketIntel = '') => `You are the Master Orchestrator for an AI-powered brand management platform. Your job is to analyze a user's command and decide which studio/pipeline to route it to.

${brandContext}

${marketIntel ? `LIVE MARKET INTELLIGENCE (for context-aware routing):\n${marketIntel}\n` : ''}

AVAILABLE STUDIOS:
1. "content" — Text content: captions, blogs, newsletters, ad copy, social posts
2. "creative" — Visual content: images, graphics, social media creatives, banners
3. "video" — Video content: ad films, reels, UGC, product demos
4. "brainstorm" — Ideas: campaign concepts, naming, positioning, trend-hijacking
5. "campaign" — FULL CAMPAIGN: chains brainstorm → content → creative → video

ROUTING RULES:
- If the user wants text/copy → "content"
- If the user wants an image/graphic/design → "creative"
- If the user wants a video/reel/film → "video"
- If the user wants ideas/concepts/strategy → "brainstorm"
- If the user wants an end-to-end campaign with multiple assets → "campaign"
- If unclear, ask clarifying questions

RESPONSE FORMAT — valid JSON only:
{
  "intent": "content|creative|video|brainstorm|campaign",
  "confidence": 0.95,
  "subIntent": "instagram-caption|blog|story-graphic|ad-film|etc",
  "brief": "Cleaned up version of the user's request",
  "platform": "instagram|linkedin|twitter|youtube|website|general",
  "suggestedSteps": ["Step 1", "Step 2"],
  "clarifyingQuestion": null,
  "campaignPlan": null,
  "trendingAngle": "Optional: a trending angle from live data that could enhance this request"
}`;

// ── Campaign Planner Prompt ──
const CAMPAIGN_PLANNER_PROMPT = (brandContext, marketIntel = '') => `You are the Campaign Planner Agent. You decompose a campaign request into a sequenced execution plan across multiple studios.

${brandContext}

${marketIntel ? `LIVE MARKET INTELLIGENCE (use this to suggest timely angles):\n${marketIntel}\n` : ''}

Create a step-by-step campaign execution plan. Each step specifies which studio handles it and what it produces.

RESPONSE FORMAT — valid JSON only:
{
  "campaignName": "Summer Collection Launch",
  "totalSteps": 5,
  "estimatedCredits": 50,
  "trendingHook": "Optional: a live trend to incorporate",
  "steps": [
    { "order": 1, "studio": "brainstorm", "task": "Generate 3 campaign concepts", "produces": "campaign-concept", "feedsInto": 2 },
    { "order": 2, "studio": "content", "task": "Write captions for selected concept", "produces": "captions", "feedsInto": 3 },
    { "order": 3, "studio": "creative", "task": "Generate post visuals", "produces": "images", "feedsInto": 4 },
    { "order": 4, "studio": "content", "task": "Write ad copy", "produces": "ad-copy", "feedsInto": 5 },
    { "order": 5, "studio": "video", "task": "Create 15-second reel", "produces": "reel", "feedsInto": null }
  ]
}`;

/**
 * Fetch live market intel via MCP for routing context.
 * Non-blocking — returns empty string if MCP is unavailable.
 */
async function fetchRoutingIntel(brandId) {
    try {
        const results = await callMcpToolsParallel([
            { tool: 'fetch_trending', args: { brandId } },
        ]);
        const trending = results['fetch_trending'];
        if (!trending?.data) return '';

        const topics = (trending.data.trending || []).slice(0, 3).map(t => `• ${t.topic}: ${t.description}`).join('\n');
        const formats = (trending.data.viralFormats || []).slice(0, 3).join(', ');
        const hooks   = (trending.data.calendarHooks || []).slice(0, 3).join(', ');

        return [
            topics ? `Trending topics:\n${topics}` : '',
            formats ? `Viral formats: ${formats}` : '',
            hooks   ? `Upcoming hooks: ${hooks}` : '',
        ].filter(Boolean).join('\n');
    } catch {
        return '';
    }
}

/**
 * Classify user intent — route to the right studio
 */
export async function classifyIntent(userCommand, brandId) {
    const [{ brandContext }, marketIntel] = await Promise.all([
        loadBrandContext(brandId),
        fetchRoutingIntel(brandId),
    ]);

    const result = await callAgent(
        CLASSIFIER_PROMPT(brandContext, marketIntel),
        `USER COMMAND: ${userCommand}`,
        0.3,
        2048
    );

    return result;
}

/**
 * Plan a campaign — decompose into multi-studio steps
 */
export async function planCampaign(userCommand, brandId) {
    const [{ brandContext }, marketIntel] = await Promise.all([
        loadBrandContext(brandId),
        fetchRoutingIntel(brandId),
    ]);

    const result = await callAgent(
        CAMPAIGN_PLANNER_PROMPT(brandContext, marketIntel),
        `CAMPAIGN REQUEST: ${userCommand}`,
        0.5,
        4096
    );

    return result;
}

/**
 * Get routing recommendation for a command
 */
export async function routeCommand(userCommand, brandId) {
    const classification = await classifyIntent(userCommand, brandId);

    if (classification.intent === 'campaign') {
        const plan = await planCampaign(userCommand, brandId);
        return {
            ...classification,
            campaignPlan: plan,
        };
    }

    return classification;
}

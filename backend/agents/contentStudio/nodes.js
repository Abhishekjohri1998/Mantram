/**
 * Content Studio — Agentic Pipeline Node Functions (v4)
 * 
 * TRULY AGENTIC: Each agent uses real data via 5 tools (web search, SEO, trends, history, competitors)
 * 
 * 8-agent chain: Research → Strategist → Writer → SEO → ToneMatcher → PlatformOptimizer → Humanizer → QualityCritic
 * Humanizer: Post-processes deep content (blog/YouTube/long-form) with Claude for zero AI detection
 * Quality Critic auto-loops to Writer if score < 7, humanLikeness < 8, or aiPatternScore < 7 (max 2 loops)
 * Each node: (state) → updatedState
 */

import { agentUtils } from '../shared/agentUtils.js';
import { gatherIntelligence } from './tools.js';
import Brand from '../../models/Brand.js';
import Product from '../../models/Product.js';
import { inferBrandLanguage, buildLanguageDirective } from '../../utils/brandLanguage.js';
import { resolveTargetMarkets, getRelevantFestivals } from '../../utils/globalCalendar.js';
import { humanizationNode, humanizeBlogSection, quickHumanizationCheck } from './humanization.js';
import {
    RESEARCH_PROMPT,
    WRITER_PROMPT,
    SEO_PROMPT,
    TONE_MATCHER_PROMPT,
    QUALITY_CRITIC_PROMPT,
    CONTENT_STRATEGIST_PROMPT,
    PLATFORM_OPTIMIZER_PROMPT,
    CONTENT_AB_TEST_PROMPT,
    YOUTUBE_RESEARCH_PROMPT,
    YOUTUBE_WRITER_PROMPT,
    YOUTUBE_SEO_PROMPT,
    BLOG_STRUCTURED_PROMPT,
    CONTENT_VISUAL_GROUNDING_PROMPT,
} from './prompts.js';

// Re-export humanizationNode so content-agentic.js can call it directly
export { humanizationNode };


// ────────────────────────────────────────────────────────────────────────────
// HELPER: Get language directive from state (passed from researchNode)
// or re-derive it from brand if state doesn't have it (e.g., standalone calls)
// ────────────────────────────────────────────────────────────────────────────
async function getLangDirective(state) {
    if (state.languageDirective !== undefined) {
        return { langInfo: state.langInfo || { isRegional: false }, languageDirective: state.languageDirective };
    }
    try {
        const { brand } = await agentUtils.loadBrandContext(state.brandId);
        const langInfo = inferBrandLanguage(brand);
        const languageDirective = buildLanguageDirective(langInfo, brand?.name || '', brand?.dna?.targetAudience || '');
        return { langInfo, languageDirective };
    } catch (e) {
        return { langInfo: { isRegional: false }, languageDirective: '' };
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// NODE 1: RESEARCH — Gathers REAL intelligence, then analyzes
// ══════════════════════════════════════════════════════════════════════════════
export async function researchNode(state) {
    console.log('🔍 Content Agent: Research — gathering real intelligence...');

    // ⚡ PERF: loadBrandContext + gatherIntelligence are independent — run in parallel.
    // Previously sequential: ~2-3s wait for intelligence THEN LLM call.
    // Now: both resolve together, saving 2-3s on every content request.
    const [brandResult, intelligence] = await Promise.all([
        agentUtils.loadBrandContext(state.brandId),
        gatherIntelligence(state),
    ]);
    const { brandContext, brand } = brandResult;
    state.intelligence = intelligence;

    // ── Language: User-selected language ALWAYS wins over brand DNA inference ──
    // If state.language is explicitly set (e.g. 'english'), skip regional inference entirely.
    // Only use brand DNA inference when language = 'auto' or unset.
    const userSelectedLang = state.language?.trim().toLowerCase();
    const userOverridesLang = userSelectedLang && userSelectedLang !== 'auto';

    let langInfo, languageDirective;
    if (userOverridesLang) {
        // User chose a specific language — build directive from that, NOT from brand DNA
        if (userSelectedLang === 'english') {
            langInfo = { lang: 'english', isRegional: false, displayName: 'English', confidence: 'user-selected' };
            languageDirective = ''; // No directive needed — English is default
            console.log(`🌍 Content Pipeline: Language = ENGLISH (user-selected, overrides brand DNA inference)`);
        } else {
            // User selected a regional language explicitly
            const LANG_DISPLAY_MAP = { hindi: 'Hindi', marathi: 'Marathi', tamil: 'Tamil', telugu: 'Telugu', kannada: 'Kannada', malayalam: 'Malayalam', bengali: 'Bengali', punjabi: 'Punjabi', gujarati: 'Gujarati', hinglish: 'Hinglish' };
            langInfo = { lang: userSelectedLang, isRegional: true, displayName: LANG_DISPLAY_MAP[userSelectedLang] || userSelectedLang, confidence: 'user-selected' };
            languageDirective = buildLanguageDirective(langInfo, brand?.name || '', brand?.dna?.targetAudience || '');
            console.log(`🌍 Content Pipeline: Language = ${langInfo.displayName} (user-selected)`);
        }
    } else {
        // Auto-detect from brand DNA signals
        langInfo = inferBrandLanguage(brand);
        languageDirective = buildLanguageDirective(langInfo, brand?.name || '', brand?.dna?.targetAudience || '');
        if (langInfo.isRegional) {
            console.log(`🌍 Content Pipeline: Language directive auto-detected — ${langInfo.displayName} (${langInfo.source})`);
        }
    }
    // Store for downstream nodes
    state.langInfo = langInfo;
    state.languageDirective = languageDirective;

    // Build enriched research prompt with real data
    const intelligenceContext = buildIntelligenceContext(intelligence);

    // ── Festival calendar: ONLY inject when brief is explicitly festival-related
    //    OR when a festival is within 7 days (unavoidable context).
    //    This prevents the AI from defaulting to Mother's Day / nearest holiday
    //    for ALL content regardless of the user's actual intent.
    const targetMarkets = brand ? resolveTargetMarkets(brand) : ['IN'];
    const festivalCtx = getRelevantFestivals(state.brief, targetMarkets, 5);
    // Only surface the festival block if the user mentioned a festival keyword,
    // OR if the brief contains time-sensitive words like 'upcoming', 'seasonal', 'trending'
    const SEASONAL_KEYWORDS = /festival|celebration|occasion|holiday|seasonal|upcoming|cultural moment|cultural|festive/i;
    const isFestivalBrief = SEASONAL_KEYWORDS.test(state.brief);
    const festivalContext = isFestivalBrief ? festivalCtx : '';

    const userPrompt = [
        `CONTENT BRIEF: ${state.brief}`,
        `CONTENT TYPE: ${state.contentType || 'social'}`,
        `PLATFORM: ${state.platform || 'instagram'}`,
        `TARGET AUDIENCE: ${state.targetAudience || 'general'}`,
        state.tone ? `PREFERRED TONE: ${state.tone}` : '',
        state.language ? `LANGUAGE: ${state.language}` : '',
        festivalContext || '',
        '',
        intelligenceContext,
    ].filter(Boolean).join('\n');

    const systemPrompt = languageDirective
        ? `${languageDirective}\n\n${RESEARCH_PROMPT(brandContext)}`
        : RESEARCH_PROMPT(brandContext);

    // ⚡ preferFast — Research is analytical, not creative: Gemini 2.5 Flash is fast enough
    const result = await agentUtils.callAgent(systemPrompt, userPrompt, 0.6, 4096, { preferFast: true });

    return {
        ...state,
        brandContext,   // ⚡ Pass forward so writerNode, seoNode, etc. skip loadBrandContext()
        research: result,
        detectedLanguage: langInfo,
        status: 'research',
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// NODE 2: WRITER — Create content using research + real intelligence
// ══════════════════════════════════════════════════════════════════════════════
export async function writerNode(state) {
    const rewriteNote = state.rewriteCount > 0
        ? `\n\n⚠️ REWRITE #${state.rewriteCount} — The Quality Critic asked for improvements:\n${state.rewriteInstructions || 'Improve overall quality, make it more engaging and brand-aligned.'}`
        : '';

    console.log(`✍️ Content Agent: Writer — ${state.rewriteCount > 0 ? `rewriting (attempt ${state.rewriteCount + 1})...` : 'creating content...'}`);

    const { brandContext } = state.brandContext
        ? { brandContext: state.brandContext }                // ⚡ Reuse from state (set by researchNode)
        : await agentUtils.loadBrandContext(state.brandId);              // Fallback for standalone calls
    // Reuse language directive from researchNode (already on state)
    const languageDirective = state.languageDirective || '';
    const langInfo = state.langInfo || { isRegional: false, displayName: 'English' };

    // Include real web research data if available
    const webInsights = state.intelligence?.web?.success
        ? `\n\nREAL WEB RESEARCH DATA:\n${state.intelligence.web.data.substring(0, 2000)}`
        : '';

    const trendingInsights = state.intelligence?.trending?.success
        ? `\n\nTRENDING NOW:\n${(state.intelligence.trending.data?.trending || []).map(t => `• ${t.topic}: ${t.description}`).join('\n')}`
        : '';

    const seoInsights = state.intelligence?.seo?.success
        ? `\n\nBRAND'S SEO DATA:\nSite Health: ${state.intelligence.seo.data?.siteHealthScore}/100\nTop Keywords: ${(state.intelligence.seo.data?.topKeywords || []).slice(0, 8).join(', ')}\nContent Gaps: ${(state.intelligence.seo.data?.contentGaps || []).slice(0, 3).join(', ')}`
        : '';

    // Strategy context from Content Strategist (if run)
    const strategyContext = state.strategy
        ? `\n\nSTRATEGIC PLAN FROM STRATEGIST:\nChosen Angle: ${state.strategy.chosenAngle || ''}\nFunnel Position: ${state.strategy.funnelPosition || ''}\nHook Strategy: ${state.strategy.hookStrategy || ''}\nCTA Strategy: ${state.strategy.ctaStrategy || ''}\nCompetitor Differentiator: ${state.strategy.competitorDifferentiator || ''}\nStructure: ${state.strategy.structureRecommendation || ''}`
        : '';

    // Competitor analysis from intelligence tools
    const competitorInsights = state.intelligence?.competitors?.success
        ? `\n\nCOMPETITOR ANALYSIS:\n${state.intelligence.competitors.data?.analysis || ''}`
        : '';

    // Performance learnings from past content (what worked/didn't)
    const performanceContext = state.intelligence?.performanceLearnings?.success
        ? `\n\nPERFORMANCE PLAYBOOK (what works for this brand):
Accept Rate: ${state.intelligence.performanceLearnings.data?.feedbackPatterns?.acceptRate || 0}% | Regenerate Rate: ${state.intelligence.performanceLearnings.data?.feedbackPatterns?.regenerateRate || 0}%
Top Rated Examples: ${(state.intelligence.performanceLearnings.data?.topRated || []).map(t => `"${t.title}" (${t.rating}★ on ${t.platform})`).join(', ') || 'none yet'}
Avoid Patterns: ${(state.intelligence.performanceLearnings.data?.avoidPatterns || []).map(a => `"${a.title}" (${a.rating}★)`).join(', ') || 'none flagged'}`
        : '';

    // GA4 content performance (real page analytics)
    const ga4Context = state.intelligence?.ga4?.success
        ? `\n\nGA4 CONTENT PERFORMANCE:
Total Views: ${state.intelligence.ga4.data?.totalViews || 0} | Pages Tracked: ${state.intelligence.ga4.data?.pagesTracked || 0}
Avg Bounce Rate: ${state.intelligence.ga4.data?.avgBounceRate || 0}%
Top Pages: ${(state.intelligence.ga4.data?.pages || []).slice(0, 3).map(p => `${p.contentTitle || p.path} (${p.pageViews} views)`).join(', ')}`
        : '';

    // MCoT Visual Grounding context (from contentVisualGroundingNode)
    const visualGroundingContext = state.visualGrounding && !state.visualGrounding.error
        ? `\n\nMCoT BRAND VISUAL INTELLIGENCE (from analyzing actual brand/product images):\nProduct Description: ${state.visualGrounding.productTraits || ''}\nBrand Mood: ${state.visualGrounding.brandMood || ''}\nColor Language: ${state.visualGrounding.colorNarrative || ''}\nKey Materials: ${state.visualGrounding.keyMaterials || ''}\nVisual Hooks: ${(state.visualGrounding.visualHooks || []).join(', ')}\nLifestyle Context: ${state.visualGrounding.lifestyleContext || ''}\nAvoid These Phrases: ${(state.visualGrounding.avoidPhrases || []).join(', ')}\nCopywriting Guidance: ${state.visualGrounding.copywritingGuidance || ''}\n\n⚠️ USE THIS VISUAL INTELLIGENCE: Write copy that is grounded in these real observations. Do not invent product features, colors, or materials that contradict this visual analysis.`
        : '';

    const userPrompt = [
        `WRITE CONTENT FOR: ${state.brief}`,
        `TYPE: ${state.contentType || 'social'}`,
        `PLATFORM: ${state.platform || 'instagram'}`,
        // Language: respect user-selected language (confidence='user-selected') over brand auto-detection
        (langInfo.isRegional && langInfo.confidence !== 'user-selected')
            ? `LANGUAGE: Write ENTIRELY in ${langInfo.displayName}. Do NOT output English creative copy.`
            : (state.language && state.language !== 'auto' ? `LANGUAGE: Write in ${state.language.charAt(0).toUpperCase() + state.language.slice(1)}` : ''),
        '',
        `RESEARCH INSIGHTS:`,
        `Key Angles: ${(state.research?.keyAngles || []).join(', ')}`,
        `Trending Hooks: ${(state.research?.trendingHooks || []).join(', ')}`,
        `Keywords: ${(state.research?.targetKeywords || []).join(', ')}`,
        `Structure: ${JSON.stringify(state.research?.suggestedStructure || {})}`,
        `Brand Notes: ${state.research?.brandNotes || ''}`,
        `Competitor Gap: ${state.research?.competitorInsights || ''}`,
        webInsights,
        trendingInsights,
        seoInsights,
        strategyContext,
        competitorInsights,
        performanceContext,
        ga4Context,
        visualGroundingContext,
        rewriteNote,
    ].filter(Boolean).join('\n');

    const systemPrompt = languageDirective
        ? `${languageDirective}\n\n${WRITER_PROMPT(brandContext)}`
        : WRITER_PROMPT(brandContext);

    const result = await agentUtils.callAgent(systemPrompt, userPrompt, 0.7);

    return {
        ...state,
        draft: result,
        status: 'writing',
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// NODE 3: SEO — Optimize for discoverability (now with real SEO data)
// ══════════════════════════════════════════════════════════════════════════════
export async function seoNode(state) {
    console.log('🔎 Content Agent: SEO — optimizing...');

    const { brandContext } = state.brandContext
        ? { brandContext: state.brandContext }                // ⚡ Reuse from state
        : await agentUtils.loadBrandContext(state.brandId);
    const languageDirective = state.languageDirective || '';

    // Include real SEO audit data if available
    const seoAuditContext = state.intelligence?.seo?.success
        ? `\n\nBRAND'S REAL SEO DATA:\n${JSON.stringify(state.intelligence.seo.data, null, 1)}`
        : '';

    const userPrompt = [
        `OPTIMIZE THIS CONTENT FOR SEO:`,
        `Title: ${state.draft?.title || ''}`,
        `Content: ${state.draft?.content || ''}`,
        `Platform: ${state.platform || 'instagram'}`,
        `Target Keywords: ${(state.research?.targetKeywords || []).join(', ')}`,
        seoAuditContext,
    ].join('\n');

    const systemPrompt = languageDirective
        ? `${languageDirective}\n\n${SEO_PROMPT(brandContext)}`
        : SEO_PROMPT(brandContext);

    // ⚡ preferFast — SEO optimization is analytical: Gemini 2.5 Flash is sufficient
    const result = await agentUtils.callAgent(systemPrompt, userPrompt, 0.3, 4096, { preferFast: true });

    return {
        ...state,
        seoOptimized: result,
        status: 'seo',
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// NODE 4: TONE MATCHER — Ensure brand voice consistency
// ══════════════════════════════════════════════════════════════════════════════
export async function toneMatcherNode(state) {
    console.log('🎭 Content Agent: Tone Matcher — aligning voice...');

    const { brandContext } = state.brandContext
        ? { brandContext: state.brandContext }                // ⚡ Reuse from state
        : await agentUtils.loadBrandContext(state.brandId);
    const languageDirective = state.languageDirective || '';
    const langInfo = state.langInfo || { isRegional: false, displayName: 'English' };

    const userPrompt = [
        `CHECK TONE CONSISTENCY:`,
        `Content: ${state.seoOptimized?.optimizedContent || state.draft?.content || ''}`,
        `Platform: ${state.platform || 'instagram'}`,
        state.tone ? `Requested Tone: ${state.tone}` : '',
        langInfo.isRegional
            ? `Language: Content MUST remain in ${langInfo.displayName} — do NOT translate to English`
            : (state.language ? `Language: ${state.language}` : ''),
    ].filter(Boolean).join('\n');

    const systemPrompt = languageDirective
        ? `${languageDirective}\n\n${TONE_MATCHER_PROMPT(brandContext)}`
        : TONE_MATCHER_PROMPT(brandContext);

    // ⚡ preferFast — Tone matching is pattern-based: fast model sufficient
    const result = await agentUtils.callAgent(systemPrompt, userPrompt, 0.4, 4096, { preferFast: true });

    return {
        ...state,
        toneMatched: result,
        status: 'tone',
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// NODE 5: CONTENT STRATEGIST — Turn research into strategic content plan (NEW)
// ══════════════════════════════════════════════════════════════════════════════
export async function contentStrategistNode(state) {
    console.log('🎯 Content Agent: Strategist — creating content strategy...');

    const { brandContext } = state.brandContext
        ? { brandContext: state.brandContext }                // ⚡ Reuse from state
        : await agentUtils.loadBrandContext(state.brandId);
    const languageDirective = state.languageDirective || '';

    // Competitor context if available
    const competitorContext = state.intelligence?.competitors?.success
        ? `\n\nCOMPETITOR ANALYSIS:\n${state.intelligence.competitors.data?.analysis || 'No analysis available'}\nCompetitors analyzed: ${state.intelligence.competitors.data?.competitorsAnalyzed || 0}`
        : '';

    const userPrompt = [
        `CREATE A STRATEGIC CONTENT PLAN:`,
        `Brief: ${state.brief}`,
        `Platform: ${state.platform || 'instagram'}`,
        `Content Type: ${state.contentType || 'social'}`,
        `\nRESEARCH FINDINGS:`,
        `Key Angles: ${(state.research?.keyAngles || []).join(', ')}`,
        `Trending Hooks: ${(state.research?.trendingHooks || []).join(', ')}`,
        `Keywords: ${(state.research?.targetKeywords || []).join(', ')}`,
        `Brand Notes: ${state.research?.brandNotes || ''}`,
        `Competitor Gap: ${state.research?.competitorInsights || ''}`,
        `Content Gaps: ${(state.research?.contentGaps || []).join(', ')}`,
        competitorContext,
        state.intelligence?.contentHistory?.success
            ? `\nPAST CONTENT PERFORMANCE: ${state.intelligence.contentHistory.data?.totalPieces || 0} pieces previously created`
            : '',
        state.intelligence?.performanceLearnings?.success
            ? `\nPERFORMANCE PLAYBOOK:\nBest Types: ${Object.entries(state.intelligence.performanceLearnings.data?.byType || {}).sort((a, b) => b[1].avgRating - a[1].avgRating).slice(0, 3).map(([t, d]) => `${t}(${d.avgRating}\u2605, ${d.count} pieces)`).join(', ')}\nBest Platforms: ${Object.entries(state.intelligence.performanceLearnings.data?.byPlatform || {}).sort((a, b) => b[1].avgRating - a[1].avgRating).slice(0, 3).map(([p, d]) => `${p}(${d.avgRating}\u2605)`).join(', ')}\nAccept Rate: ${state.intelligence.performanceLearnings.data?.feedbackPatterns?.acceptRate || 0}% | Regenerate Rate: ${state.intelligence.performanceLearnings.data?.feedbackPatterns?.regenerateRate || 0}%`
            : '',
        state.intelligence?.ga4?.success
            ? `\nGA4 TOP CONTENT: ${(state.intelligence.ga4.data?.pages || []).slice(0, 3).map(p => `${p.contentTitle || p.path} (${p.pageViews} views, ${(p.bounceRate * 100).toFixed(0)}% bounce)`).join(', ')}`
            : '',
    ].filter(Boolean).join('\n');

    const systemPrompt = languageDirective
        ? `${languageDirective}\n\n${CONTENT_STRATEGIST_PROMPT(brandContext)}`
        : CONTENT_STRATEGIST_PROMPT(brandContext);

    // ⚡ preferFast — Strategy planning is structured analysis: Gemini 2.5 Flash sufficient
    const result = await agentUtils.callAgent(systemPrompt, userPrompt, 0.5, 4096, { preferFast: true });

    return {
        ...state,
        strategy: result,
        status: 'strategy',
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// NODE 6: PLATFORM OPTIMIZER — Adapt content for target platform algorithm (NEW)
// ══════════════════════════════════════════════════════════════════════════════
export async function platformOptimizerNode(state) {
    console.log(`📱 Content Agent: Platform Optimizer — optimizing for ${state.platform || 'general'}...`);

    const { brandContext } = state.brandContext
        ? { brandContext: state.brandContext }                // ⚡ Reuse from state
        : await agentUtils.loadBrandContext(state.brandId);
    const { langInfo, languageDirective } = await getLangDirective(state);

    const userPrompt = [
        `OPTIMIZE THIS CONTENT FOR ${(state.platform || 'instagram').toUpperCase()}:`,
        `Title: ${state.seoOptimized?.optimizedTitle || state.draft?.title || ''}`,
        `Content: ${state.toneMatched?.matchedContent || state.seoOptimized?.optimizedContent || state.draft?.content || ''}`,
        `Platform: ${state.platform || 'instagram'}`,
        `Content Type: ${state.contentType || 'social'}`,
        state.strategy?.ctaStrategy ? `CTA Strategy: ${state.strategy.ctaStrategy}` : '',
        state.strategy?.hookStrategy ? `Hook Strategy: ${state.strategy.hookStrategy}` : '',
        state.research?.targetKeywords ? `Target Keywords: ${state.research.targetKeywords.join(', ')}` : '',
        langInfo.isRegional ? `LANGUAGE: Final output MUST remain in ${langInfo.displayName} — do NOT translate` : '',
    ].filter(Boolean).join('\n');

    const systemPrompt = languageDirective
        ? `${languageDirective}\n\n${PLATFORM_OPTIMIZER_PROMPT(brandContext)}`
        : PLATFORM_OPTIMIZER_PROMPT(brandContext);

    // ⚡ preferFast — Platform optimization is rule-based: Gemini 2.5 Flash sufficient
    const result = await agentUtils.callAgent(systemPrompt, userPrompt, 0.4, 4096, { preferFast: true });

    return {
        ...state,
        platformOptimized: result,
        status: 'platform',
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// NODE 7: QUALITY CRITIC — Final assessment with AUTO-LOOP (v2 — AI detection aware)
// ══════════════════════════════════════════════════════════════════════════════
export async function qualityCriticNode(state) {
    console.log(`⭐ Content Agent: Quality Critic — scoring... (attempt ${(state.rewriteCount || 0) + 1})`);

    const { brandContext } = state.brandContext
        ? { brandContext: state.brandContext }                // ⚡ Reuse from state
        : await agentUtils.loadBrandContext(state.brandId);
    const { langInfo, languageDirective } = await getLangDirective(state);

    // Use humanized content if available (from humanizationNode), otherwise fall back to platform-optimized
    const contentToScore =
        state.finalContent ||       // set by humanizationNode if it ran
        state.platformOptimized?.optimizedContent ||
        state.toneMatched?.matchedContent ||
        state.seoOptimized?.optimizedContent ||
        state.draft?.content || '';

    const titleToScore =
        state.finalTitle ||
        state.platformOptimized?.optimizedTitle ||
        state.seoOptimized?.optimizedTitle ||
        state.draft?.title || '';

    const userPrompt = [
        `ASSESS THIS FINAL CONTENT FOR QUALITY AND AI DETECTION:`,
        `Title: ${titleToScore}`,
        `Content: ${contentToScore}`,
        `Platform: ${state.platform || 'instagram'}`,
        `Content Type: ${state.contentType || 'social'}`,
        `Brief: ${state.brief}`,
        state.humanizationApplied ? `NOTE: Content has been through a humanization pass. Score humanLikeness, burstinessScore, and aiPatternScore rigorously — the bar is higher now.` : '',
        langInfo.isRegional ? `LANGUAGE CHECK: Verify all creative copy is in ${langInfo.displayName}. Deduct points if English is used instead.` : '',
        state.rewriteCount > 0 ? `\nThis is rewrite attempt #${state.rewriteCount}. Be fair but watch for improvement.` : '',
    ].filter(Boolean).join('\n');

    const systemPrompt = languageDirective
        ? `${languageDirective}\n\n${QUALITY_CRITIC_PROMPT(brandContext)}`
        : QUALITY_CRITIC_PROMPT(brandContext);

    // ⚡ preferFast — Quality critic scoring is evaluation, not generation: Gemini sufficient
    const result = await agentUtils.callAgent(systemPrompt, userPrompt, 0.3, 4096, { preferFast: true });

    const overallScore = result?.scores?.overall || result?.overallScore || 10;
    const humanLikeness = result?.scores?.humanLikeness || 10;
    const aiPatternScore = result?.scores?.aiPatternScore || 10;
    const burstinessScore = result?.scores?.burstinessScore || 10;
    const rewriteCount = state.rewriteCount || 0;

    // ── AUTO-LOOP: Multiple rewrite triggers — not just overall score ──
    // Triggers: overall < 7 OR humanLikeness < 8 OR aiPatternScore < 7 OR burstinessScore < 6
    // maxRewriteLoops defaults to 2 (full quality mode), callers can set 1 for fast-path social.
    const maxLoops = state.maxRewriteLoops ?? 1;
    const needsRewrite = (overallScore < 7 || humanLikeness < 8 || aiPatternScore < 7 || burstinessScore < 6);

    if (needsRewrite && rewriteCount < maxLoops) {
        const triggerReason = overallScore < 7
            ? `Overall score ${overallScore}/10`
            : humanLikeness < 8
            ? `HumanLikeness score ${humanLikeness}/10 (requires 8+)`
            : aiPatternScore < 7
            ? `AI Pattern score ${aiPatternScore}/10 (requires 7+)`
            : `Burstiness score ${burstinessScore}/10 (requires 6+)`;

        console.log(`   ⚠️ ${triggerReason} — Rewrite triggered (loop ${rewriteCount + 1}/${maxLoops})...`);

        const fixInstructions = [
            result?.humannessFeedback ? `HUMANNESS FIX: ${result.humannessFeedback}` : '',
            result?.burstinessFeedback ? `BURSTINESS FIX: ${result.burstinessFeedback}` : '',
            result?.aiPatternsFound?.length ? `REMOVE THESE AI PATTERNS: ${result.aiPatternsFound.slice(0, 5).join(', ')}` : '',
            result?.improvements?.[0] || '',
            result?.improvements?.[1] || '',
            result?.mainIssue || '',
            `TRIGGER: ${triggerReason}. Scores: humanLikeness=${humanLikeness}/10, aiPattern=${aiPatternScore}/10, burstiness=${burstinessScore}/10, overall=${overallScore}/10.`,
            `KEY INSTRUCTION: Vary sentence lengths dramatically (3-word sentences mixed with 25-word sentences), remove all AI-tell phrases, add one genuine expert opinion, start at least one sentence with 'And' or 'But'.`,
        ].filter(Boolean).join('\n');

        const newState = {
            ...state,
            rewriteCount: rewriteCount + 1,
            rewriteInstructions: fixInstructions,
            critique: result,
            // Clear humanized content so the re-writer starts fresh
            finalContent: undefined,
            finalTitle: undefined,
            humanizationApplied: false,
        };

        // Re-run Writer → Humanization → Quality Critic
        // IMPORTANT: humanizationNode must run on the rewritten content BEFORE re-scoring
        let rewrittenState = await writerNode(newState);
        rewrittenState = await humanizationNode(rewrittenState);
        return await qualityCriticNode(rewrittenState);
    }

    const passedReason = needsRewrite
        ? '(accepted — max loops reached)'
        : overallScore >= 8
        ? '— PASSED (★★★)'
        : '— accepted';
    console.log(`   ✅ Quality: overall=${overallScore}/10, human=${humanLikeness}/10, aiPattern=${aiPatternScore}/10, burstiness=${burstinessScore}/10 ${passedReason}`);

    return {
        ...state,
        critique: result,
        qualityScore: overallScore,
        humanLikenessScore: humanLikeness,
        aiPatternScore,
        burstinessScore,
        rewriteCount,
        finalContent: contentToScore,
        finalTitle: titleToScore,
        platformMeta: state.platformOptimized?.platformMeta || null,
        engagementHooks: state.platformOptimized?.engagementHooks || null,
        status: 'critique',
    };
}


// ══════════════════════════════════════════════════════════════════════════════
// NODE 8: CONTENT A/B TEST — Generate variants for split testing
// ══════════════════════════════════════════════════════════════════════════════
export async function contentABTestNode(state) {
    console.log('🔬 Content Agent: A/B Test — generating variants...');

    const { brandContext } = await agentUtils.loadBrandContext(state.brandId);
    const { langInfo, languageDirective } = await getLangDirective(state);

    const userPrompt = [
        `GENERATE A/B TEST VARIANTS FOR THIS CONTENT:`,
        `Title: ${state.finalTitle || state.draft?.title || ''}`,
        `Content: ${state.finalContent || state.draft?.content || ''}`,
        `Platform: ${state.platform || 'instagram'}`,
        `Content Type: ${state.contentType || 'social'}`,
        langInfo.isRegional ? `LANGUAGE: All variants MUST be in ${langInfo.displayName} — do NOT produce English alternatives` : '',
        state.strategy?.funnelPosition ? `Funnel Position: ${state.strategy.funnelPosition}` : '',
        state.strategy?.hookStrategy ? `Hook Strategy Used: ${state.strategy.hookStrategy}` : '',
        state.strategy?.ctaStrategy ? `CTA Strategy Used: ${state.strategy.ctaStrategy}` : '',
        state.intelligence?.performanceLearnings?.success
            ? `\nPERFORMANCE DATA (what worked before):\nAvg Sentiment: ${state.intelligence.performanceLearnings.data?.feedbackPatterns?.avgSentiment || 0}\nTop Rated Types: ${Object.entries(state.intelligence.performanceLearnings.data?.byType || {}).sort((a, b) => b[1].avgRating - a[1].avgRating).slice(0, 3).map(([t, d]) => `${t}(${d.avgRating}★)`).join(', ')}`
            : '',
    ].filter(Boolean).join('\n');

    const systemPrompt = languageDirective
        ? `${languageDirective}\n\n${CONTENT_AB_TEST_PROMPT(brandContext)}`
        : CONTENT_AB_TEST_PROMPT(brandContext);

    // ⚡ preferFast: A/B variant generation is pattern-based differentiation — Gemini Flash sufficient
    const result = await agentUtils.callAgent(systemPrompt, userPrompt, 0.7, 4096, { preferFast: true });

    return {
        ...state,
        abTestPlan: result,
        status: 'ab_test',
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// YOUTUBE NODES (kept as-is but with intelligence feeding)
// ══════════════════════════════════════════════════════════════════════════════

export async function youtubeResearchNode(state) {
    console.log('🎬 YouTube Agent: Research — analyzing topic for YouTube...');

    const { brandContext } = await agentUtils.loadBrandContext(state.brandId);
    const { langInfo, languageDirective } = await getLangDirective(state);

    // Gather intelligence for YouTube too
    if (!state.intelligence) {
        const intelligence = await gatherIntelligence({
            ...state,
            platform: 'youtube',
        });
        state.intelligence = intelligence;
    }

    const intelligenceContext = buildIntelligenceContext(state.intelligence);

    const userPrompt = [
        `VIDEO BRIEF: ${state.brief}`,
        `FORMAT: ${state.format || 'video'} (${state.format === 'shorts' ? 'YouTube Shorts — under 60 seconds' : 'Long-form YouTube video'})`,
        state.videoLength ? `TARGET LENGTH: ${state.videoLength}` : '',
        state.targetAudience ? `TARGET AUDIENCE: ${state.targetAudience}` : '',
        state.style ? `VIDEO STYLE: ${state.style}` : '',
        state.language ? `LANGUAGE: ${state.language}` : (langInfo.isRegional ? `LANGUAGE: ${langInfo.displayName}` : ''),
        state.subType ? `VIDEO TYPE: ${state.subType}` : '',
        '',
        intelligenceContext,
    ].filter(Boolean).join('\n');

    const systemPrompt = languageDirective
        ? `${languageDirective}\n\n${YOUTUBE_RESEARCH_PROMPT(brandContext)}`
        : YOUTUBE_RESEARCH_PROMPT(brandContext);

    // ⚡ preferFast: YouTube Research is analytical keyword/trend analysis — Gemini Flash is fast enough
    const result = await agentUtils.callAgent(systemPrompt, userPrompt, 0.6, 4096, { preferFast: true });

    return {
        ...state,
        youtubeResearch: result,
        langInfo,
        languageDirective,
        status: 'youtube_research',
    };
}

export async function youtubeWriterNode(state) {
    console.log('✍️ YouTube Agent: Writer — creating YouTube content...');

    const { brandContext } = await agentUtils.loadBrandContext(state.brandId);
    const { langInfo, languageDirective } = await getLangDirective(state);
    const research = state.youtubeResearch || {};

    const userPrompt = [
        `WRITE YOUTUBE CONTENT FOR: ${state.brief}`,
        `FORMAT: ${state.format || 'video'} (${state.format === 'shorts' ? 'YouTube Shorts — MAX 60 seconds, punchy, no intro' : 'Long-form YouTube video'})`,
        state.videoLength ? `TARGET VIDEO LENGTH: ${state.videoLength}` : '',
        state.language ? `LANGUAGE: Write in ${state.language}` : (langInfo.isRegional ? `LANGUAGE: Write ENTIRELY in ${langInfo.displayName}` : ''),
        state.style ? `VIDEO STYLE: ${state.style}` : '',
        '',
        `YOUTUBE RESEARCH INSIGHTS:`,
        `Primary Keyword: ${research.primaryKeyword || ''}`,
        `Secondary Keywords: ${(research.secondaryKeywords || []).join(', ')}`,
        `Long-Tail Keywords: ${(research.longTailKeywords || []).join(', ')}`,
        `Key Angles: ${(research.keyAngles || []).join('; ')}`,
        `Competitor Gaps: ${research.competitorGaps || ''}`,
        `Suggested Structure: ${JSON.stringify(research.suggestedStructure || {})}`,
        `Thumbnail Ideas: ${(research.thumbnailIdeas || []).join('; ')}`,
        `Trending Angle: ${research.trendingAngle || ''}`,
        `Brand Notes: ${research.brandNotes || ''}`,
    ].filter(Boolean).join('\n');

    const systemPrompt = languageDirective
        ? `${languageDirective}\n\n${YOUTUBE_WRITER_PROMPT(brandContext)}`
        : YOUTUBE_WRITER_PROMPT(brandContext);

    const result = await agentUtils.callAgent(systemPrompt, userPrompt, 0.7, 8192);

    return {
        ...state,
        youtubeContent: result,
        status: 'youtube_writing',
    };
}

export async function youtubeSeoNode(state) {
    console.log('🚀 YouTube Agent: SEO Optimizer — generating publish metadata...');

    const { brandContext } = await agentUtils.loadBrandContext(state.brandId);
    const { langInfo, languageDirective } = await getLangDirective(state);
    const research = state.youtubeResearch || {};

    const userPrompt = [
        `GENERATE YOUTUBE PUBLISHING METADATA FOR: ${state.brief}`,
        `FORMAT: ${state.format || 'video'} (${state.format === 'shorts' ? 'YouTube Shorts — under 60 seconds' : 'Long-form YouTube video'})`,
        state.targetAudience ? `TARGET AUDIENCE: ${state.targetAudience}` : '',
        state.language ? `LANGUAGE: ${state.language}` : (langInfo.isRegional ? `LANGUAGE: ${langInfo.displayName} audience` : ''),
        '',
        `YOUTUBE RESEARCH INSIGHTS:`,
        `Primary Keyword: ${research.primaryKeyword || ''}`,
        `Secondary Keywords: ${(research.secondaryKeywords || []).join(', ')}`,
        `Long-Tail Keywords: ${(research.longTailKeywords || []).join(', ')}`,
        `Key Angles: ${(research.keyAngles || []).join('; ')}`,
        `Competitor Gaps: ${research.competitorGaps || ''}`,
        `Trending Angle: ${research.trendingAngle || ''}`,
        `Brand Notes: ${research.brandNotes || ''}`,
    ].filter(Boolean).join('\n');

    const systemPrompt = languageDirective
        ? `${languageDirective}\n\n${YOUTUBE_SEO_PROMPT(brandContext)}`
        : YOUTUBE_SEO_PROMPT(brandContext);

    // ⚡ preferFast: YouTube SEO Optimizer is metadata/keyword analysis — Gemini Flash sufficient
    const result = await agentUtils.callAgent(systemPrompt, userPrompt, 0.5, 4096, { preferFast: true });

    return {
        ...state,
        youtubeSeo: result,
        status: 'youtube_seo',
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// HELPER: Build intelligence context string from gathered tools data
// ══════════════════════════════════════════════════════════════════════════════
function buildIntelligenceContext(intelligence) {
    if (!intelligence) return '';

    const parts = [];
    parts.push('═══ REAL-TIME INTELLIGENCE (from agent tools) ═══');

    // Web Research
    if (intelligence.web?.success) {
        parts.push(`\n📌 WEB RESEARCH [source: ${intelligence.web.source}, mode: ${intelligence.web.mode}]:`);
        parts.push(intelligence.web.data.substring(0, 2000));
        if (intelligence.web.citations?.length) {
            parts.push(`Sources: ${intelligence.web.citations.slice(0, 5).join(', ')}`);
        }
    }

    // SEO Audit Data
    if (intelligence.seo?.success && intelligence.seo.data) {
        const s = intelligence.seo.data;
        parts.push(`\n📊 BRAND SEO DATA [from latest site audit]:`);
        parts.push(`Site Health: ${s.siteHealthScore}/100`);
        if (s.topKeywords?.length) parts.push(`Top Ranking Keywords: ${s.topKeywords.slice(0, 10).join(', ')}`);
        if (s.contentGaps?.length) parts.push(`Content Gaps to Fill: ${s.contentGaps.slice(0, 5).join(', ')}`);
        if (s.topPerformingPages?.length) parts.push(`Top Pages: ${s.topPerformingPages.map(p => `${p.title} (${p.wordCount} words)`).join(', ')}`);
        if (s.algorithmRisks?.length) parts.push(`SEO Risks: ${s.algorithmRisks.join('; ')}`);
    }

    // Content History
    if (intelligence.contentHistory?.success && intelligence.contentHistory.data) {
        const h = intelligence.contentHistory.data;
        parts.push(`\n📝 PAST CONTENT PERFORMANCE:`);
        parts.push(`Total pieces: ${h.totalPieces}, Published: ${h.publishedCount}, Avg brand score: ${h.averageBrandScore}`);
        if (h.recentTitles?.length) parts.push(`Recent titles: ${h.recentTitles.slice(0, 5).join(' | ')}`);
        if (h.topRatedContent?.length) parts.push(`Best performing: ${h.topRatedContent.map(t => t.title).join(', ')}`);
    }

    // Trending
    if (intelligence.trending?.success && intelligence.trending.data) {
        const t = intelligence.trending.data;
        if (t.trending?.length) {
            parts.push(`\n🔥 TRENDING NOW:`);
            t.trending.slice(0, 5).forEach(tr => {
                parts.push(`• [${tr.urgency || 'medium'}] ${tr.topic}: ${tr.description}`);
            });
        }
        if (t.keywords?.length) {
            parts.push(`Real Keywords: ${t.keywords.slice(0, 8).map(k => k.keyword).join(', ')}`);
        }
        // NOTE: calendarHooks deliberately NOT included here — Grok returns the nearest upcoming
        // occasion (e.g. "Mother's Day") regardless of user intent, which biased ALL content.
        // Festival dates are surfaced contextually only when the user's brief requests them.
        if (t.viralFormats?.length) {
            parts.push(`Viral Formats: ${t.viralFormats.slice(0, 3).join(', ')}`);
        }
    }

    parts.push('\n═══ USE THIS REAL DATA — do NOT invent facts ═══');

    return parts.join('\n');
}

// ══════════════════════════════════════════════════════════════════════════════
// NODE: BLOG WRITER — Generates structured JSON blog article
// ══════════════════════════════════════════════════════════════════════════════
export async function blogWriterNode(state) {
    console.log('📝 Blog Agent: Writing structured blog article...');

    const { brandContext } = await agentUtils.loadBrandContext(state.brandId);
    const { langInfo, languageDirective } = await getLangDirective(state);
    if (langInfo.isRegional) {
        console.log(`🌍 Blog Agent: Language directive active — ${langInfo.displayName}`);
    }

    const intelligenceContext = buildIntelligenceContext(state.intelligence || {});

    const langNote = langInfo.isRegional
        ? `\n\nCRITICAL LANGUAGE REQUIREMENT: This blog MUST be written ENTIRELY in ${langInfo.displayName}. ALL sections, headings, metadata, and body content must be in ${langInfo.displayName}. English is NOT acceptable.`
        : '';

    const prompt = (languageDirective ? `${languageDirective}\n\n` : '') + BLOG_STRUCTURED_PROMPT
        .replace('{brandContext}', brandContext || 'No brand context')
        .replace('{researchContext}', intelligenceContext || 'No research data')
        .replace('{topic}', state.topic || state.brief || '')
        .replace('{blogType}', state.blogType || 'seo_blog')
        .replace('{targetWordCount}', String(state.targetWordCount || 1500))
        .replace('{keywords}', (state.keywords || []).join(', ') || 'auto-detect')
        .replace('{audience}', state.targetAudience || 'general')
        .replace('{tone}', state.tone || 'professional, engaging') + langNote;

    const result = await agentUtils.callAgent(prompt, `Generate a structured blog article about: ${state.topic || state.brief}`, 0.7, 8192);

    // callAgent already parses JSON and returns an object
    // result is either { title, subtitle, slug, sections, ... } or { error, raw }
    let blogData;
    if (result && result.sections && Array.isArray(result.sections)) {
        // callAgent successfully parsed the structured blog JSON
        blogData = result;
    } else if (result && !result.error) {
        // callAgent returned a parsed object but not in expected format — try to use it
        console.warn('Blog writer returned unexpected structure, adapting:', Object.keys(result));
        blogData = {
            title: result.title || state.topic || 'Blog Article',
            subtitle: result.subtitle || '',
            slug: result.slug || (state.topic || 'blog-article').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
            metaTitle: result.metaTitle || result.title || state.topic || '',
            metaDescription: result.metaDescription || '',
            keywords: result.keywords || state.keywords || [],
            estimatedReadTime: result.estimatedReadTime || '5 min read',
            sections: result.sections || [{
                heading: 'Introduction',
                body: result.raw || JSON.stringify(result).substring(0, 2000),
                imagePrompt: `Professional photograph related to ${state.topic}`,
            }],
        };
    } else {
        // Fallback: callAgent parsing failed entirely
        console.warn('Blog JSON parse failed, using raw content');
        const rawText = result?.raw || '';
        blogData = {
            title: state.topic || 'Blog Article',
            subtitle: '',
            slug: (state.topic || 'blog-article').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
            metaTitle: state.topic || '',
            metaDescription: '',
            keywords: state.keywords || [],
            estimatedReadTime: '5 min read',
            sections: [{
                heading: 'Introduction',
                body: rawText || `Blog article about ${state.topic || 'the requested topic'}`,
                imagePrompt: `Professional photograph related to ${state.topic}`,
            }],
        };
    }

    console.log(`📝 Blog Agent: Generated ${blogData.sections?.length || 0} sections, title: "${blogData.title}"`);

    // Flatten blog sections into draft.content so humanizationNode can find it
    // humanizationNode reads state.draft?.content as its final fallback
    const flatContent = (blogData.sections || []).map(s => `## ${s.heading}\n\n${s.body}`).join('\n\n');

    return {
        ...state,
        blogData,
        draft: {
            title: blogData.title || state.topic || 'Blog Article',
            content: flatContent,
        },
        status: 'blog_written',
    };
}


// ══════════════════════════════════════════════════════════════════════════════
// MCoT: CONTENT VISUAL GROUNDING NODE (Phase 4)
// Analyzes brand/product images BEFORE content writing to produce
// copywriting-specific visual context that grounds the Writer Agent.
// Fully non-blocking — if images unavailable, returns empty context.
// ══════════════════════════════════════════════════════════════════════════════
export async function contentVisualGroundingNode(state) {
    if (!state.brandId) {
        console.log('🖼️ Content MCoT: No brandId — skipping visual grounding');
        return state;
    }

    console.log('🧠 Content MCoT: Visual grounding — fetching brand/product images...');
    try {
        const brand = await Brand.findById(state.brandId).lean();
        if (!brand) return state;

        // Collect image URLs: logo, brand DNA images, product images
        const imageUrls = [];
        const dna = brand.dna || {};

        // Brand logo
        if (dna.logo?.url) imageUrls.push(dna.logo.url);

        // Brand DNA visual images (website screenshots, brand photos)
        const dnaImages = dna.images || dna.brandImages || [];
        dnaImages.slice(0, 2).forEach(img => {
            const url = typeof img === 'string' ? img : img?.url;
            if (url) imageUrls.push(url);
        });

        // Product images (top 2 products)
        if (imageUrls.length < 4) {
            const products = await Product.find({ brand: state.brandId })
                .sort({ createdAt: -1 })
                .limit(3)
                .lean();
            for (const product of products) {
                const imgUrl = product.images?.[0]?.url || product.imageUrl;
                if (imgUrl) imageUrls.push(imgUrl);
                if (imageUrls.length >= 5) break;
            }
        }

        if (imageUrls.length === 0) {
            console.log('🖼️ Content MCoT: No brand images found — skipping');
            return state;
        }

        console.log(`🧠 Content MCoT: Analyzing ${imageUrls.length} brand images...`);

        const grounding = await agentUtils.callMultimodalAgent(
            CONTENT_VISUAL_GROUNDING_PROMPT,
            `Analyze these brand/product images for ${brand.name} (${dna.industry || 'consumer brand'}). Extract copywriting guidance.`,
            imageUrls,
            { temperature: 0.3, maxTokens: 1024 }
        );

        if (grounding && !grounding.error && !grounding.skipped) {
            console.log(`🧠 Content MCoT: Visual grounding complete — mood: ${grounding.brandMood || '(parsed)'}`);
            return {
                ...state,
                visualGrounding: grounding,
            };
        } else {
            console.warn('🖼️ Content MCoT: Grounding returned no usable data — continuing without it');
        }
    } catch (err) {
        console.warn('🖼️ Content MCoT: Visual grounding failed (non-critical):', err.message);
    }

    return state;
}

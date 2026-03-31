/**
 * Content Studio — Agentic Pipeline Node Functions (v3)
 * 
 * TRULY AGENTIC: Each agent uses real data via 5 tools (web search, SEO, trends, history, competitors)
 * 
 * 7-agent chain: Research → Strategist → Writer → SEO → ToneMatcher → PlatformOptimizer → QualityCritic
 * Quality Critic auto-loops to Writer if score < 8 (max 2 loops)
 * Each node: (state) → updatedState
 */

import { callAgent, callMultimodalAgent } from '../shared/agentUtils.js';
import { loadBrandContext } from '../shared/agentUtils.js';
import { gatherIntelligence } from './tools.js';
import Brand from '../../models/Brand.js';
import Product from '../../models/Product.js';
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

// ══════════════════════════════════════════════════════════════════════════════
// NODE 1: RESEARCH — Gathers REAL intelligence, then analyzes
// ══════════════════════════════════════════════════════════════════════════════
export async function researchNode(state) {
    console.log('🔍 Content Agent: Research — gathering real intelligence...');

    const { brandContext } = await loadBrandContext(state.brandId);

    // ── NEW: Gather real data from tools ──
    const intelligence = await gatherIntelligence(state);
    state.intelligence = intelligence;

    // Build enriched research prompt with real data
    const intelligenceContext = buildIntelligenceContext(intelligence);

    const userPrompt = [
        `CONTENT BRIEF: ${state.brief}`,
        `CONTENT TYPE: ${state.contentType || 'social'}`,
        `PLATFORM: ${state.platform || 'instagram'}`,
        `TARGET AUDIENCE: ${state.targetAudience || 'general'}`,
        state.tone ? `PREFERRED TONE: ${state.tone}` : '',
        state.language ? `LANGUAGE: ${state.language}` : '',
        '',
        intelligenceContext,
    ].filter(Boolean).join('\n');

    const result = await callAgent(RESEARCH_PROMPT(brandContext), userPrompt, 0.6);

    return {
        ...state,
        research: result,
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

    const { brandContext } = await loadBrandContext(state.brandId);

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
        state.language ? `LANGUAGE: Write in ${state.language}` : '',
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


    const result = await callAgent(WRITER_PROMPT(brandContext), userPrompt, 0.7);

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

    const { brandContext } = await loadBrandContext(state.brandId);

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

    const result = await callAgent(SEO_PROMPT(brandContext), userPrompt, 0.3);

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

    const { brandContext } = await loadBrandContext(state.brandId);

    const userPrompt = [
        `CHECK TONE CONSISTENCY:`,
        `Content: ${state.seoOptimized?.optimizedContent || state.draft?.content || ''}`,
        `Platform: ${state.platform || 'instagram'}`,
        state.tone ? `Requested Tone: ${state.tone}` : '',
        state.language ? `Language: ${state.language}` : '',
    ].filter(Boolean).join('\n');

    const result = await callAgent(TONE_MATCHER_PROMPT(brandContext), userPrompt, 0.4);

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

    const { brandContext } = await loadBrandContext(state.brandId);

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
            ? `\nPERFORMANCE PLAYBOOK:\nBest Types: ${Object.entries(state.intelligence.performanceLearnings.data?.byType || {}).sort((a, b) => b[1].avgRating - a[1].avgRating).slice(0, 3).map(([t, d]) => `${t}(${d.avgRating}★, ${d.count} pieces)`).join(', ')}\nBest Platforms: ${Object.entries(state.intelligence.performanceLearnings.data?.byPlatform || {}).sort((a, b) => b[1].avgRating - a[1].avgRating).slice(0, 3).map(([p, d]) => `${p}(${d.avgRating}★)`).join(', ')}\nAccept Rate: ${state.intelligence.performanceLearnings.data?.feedbackPatterns?.acceptRate || 0}% | Regenerate Rate: ${state.intelligence.performanceLearnings.data?.feedbackPatterns?.regenerateRate || 0}%`
            : '',
        state.intelligence?.ga4?.success
            ? `\nGA4 TOP CONTENT: ${(state.intelligence.ga4.data?.pages || []).slice(0, 3).map(p => `${p.contentTitle || p.path} (${p.pageViews} views, ${(p.bounceRate * 100).toFixed(0)}% bounce)`).join(', ')}`
            : '',
    ].filter(Boolean).join('\n');

    const result = await callAgent(CONTENT_STRATEGIST_PROMPT(brandContext), userPrompt, 0.5);

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

    const { brandContext } = await loadBrandContext(state.brandId);

    const userPrompt = [
        `OPTIMIZE THIS CONTENT FOR ${(state.platform || 'instagram').toUpperCase()}:`,
        `Title: ${state.seoOptimized?.optimizedTitle || state.draft?.title || ''}`,
        `Content: ${state.toneMatched?.matchedContent || state.seoOptimized?.optimizedContent || state.draft?.content || ''}`,
        `Platform: ${state.platform || 'instagram'}`,
        `Content Type: ${state.contentType || 'social'}`,
        state.strategy?.ctaStrategy ? `CTA Strategy: ${state.strategy.ctaStrategy}` : '',
        state.strategy?.hookStrategy ? `Hook Strategy: ${state.strategy.hookStrategy}` : '',
        state.research?.targetKeywords ? `Target Keywords: ${state.research.targetKeywords.join(', ')}` : '',
    ].filter(Boolean).join('\n');

    const result = await callAgent(PLATFORM_OPTIMIZER_PROMPT(brandContext), userPrompt, 0.4);

    return {
        ...state,
        platformOptimized: result,
        status: 'platform',
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// NODE 7: QUALITY CRITIC — Final assessment with AUTO-LOOP
// ══════════════════════════════════════════════════════════════════════════════
export async function qualityCriticNode(state) {
    console.log(`⭐ Content Agent: Quality Critic — scoring... (attempt ${(state.rewriteCount || 0) + 1})`);

    const { brandContext } = await loadBrandContext(state.brandId);

    const userPrompt = [
        `ASSESS THIS FINAL CONTENT:`,
        `Title: ${state.seoOptimized?.optimizedTitle || state.draft?.title || ''}`,
        `Content: ${state.toneMatched?.matchedContent || state.seoOptimized?.optimizedContent || state.draft?.content || ''}`,
        `Platform: ${state.platform || 'instagram'}`,
        `Content Type: ${state.contentType || 'social'}`,
        `Brief: ${state.brief}`,
        state.rewriteCount > 0 ? `\nThis is rewrite attempt #${state.rewriteCount}. Be fair but watch for improvement.` : '',
    ].join('\n');

    const result = await callAgent(QUALITY_CRITIC_PROMPT(brandContext), userPrompt, 0.3);

    const overallScore = result?.scores?.overall || result?.overallScore || 10;
    const rewriteCount = state.rewriteCount || 0;

    // ── AUTO-LOOP: If score < 8 and we haven't rewritten twice, send back to Writer ──
    if (overallScore < 8 && rewriteCount < 2) {
        console.log(`   ⚠️ Score ${overallScore}/10 — below threshold. Sending back to Writer (loop ${rewriteCount + 1}/2)...`);

        const fixInstructions = [
            result?.improvements?.[0] || '',
            result?.improvements?.[1] || '',
            result?.mainIssue || '',
            `The critic scored this ${overallScore}/10. Key issues: ${result?.summary || 'Needs more engagement and brand alignment.'}`,
        ].filter(Boolean).join('\n');

        const newState = {
            ...state,
            rewriteCount: rewriteCount + 1,
            rewriteInstructions: fixInstructions,
            critique: result,
        };

        // Re-run Writer → Quality Critic
        const rewrittenState = await writerNode(newState);
        return await qualityCriticNode(rewrittenState);
    }

    console.log(`   ✅ Quality score: ${overallScore}/10 ${overallScore >= 8 ? '— PASSED' : '— accepted (max loops reached)'}`);

    return {
        ...state,
        critique: result,
        qualityScore: overallScore,
        rewriteCount,
        finalContent: state.platformOptimized?.optimizedContent || state.toneMatched?.matchedContent || state.seoOptimized?.optimizedContent || state.draft?.content || '',
        finalTitle: state.platformOptimized?.optimizedTitle || state.seoOptimized?.optimizedTitle || state.draft?.title || '',
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

    const { brandContext } = await loadBrandContext(state.brandId);

    const userPrompt = [
        `GENERATE A/B TEST VARIANTS FOR THIS CONTENT:`,
        `Title: ${state.finalTitle || state.draft?.title || ''}`,
        `Content: ${state.finalContent || state.draft?.content || ''}`,
        `Platform: ${state.platform || 'instagram'}`,
        `Content Type: ${state.contentType || 'social'}`,
        state.strategy?.funnelPosition ? `Funnel Position: ${state.strategy.funnelPosition}` : '',
        state.strategy?.hookStrategy ? `Hook Strategy Used: ${state.strategy.hookStrategy}` : '',
        state.strategy?.ctaStrategy ? `CTA Strategy Used: ${state.strategy.ctaStrategy}` : '',
        state.intelligence?.performanceLearnings?.success
            ? `\nPERFORMANCE DATA (what worked before):\nAvg Sentiment: ${state.intelligence.performanceLearnings.data?.feedbackPatterns?.avgSentiment || 0}\nTop Rated Types: ${Object.entries(state.intelligence.performanceLearnings.data?.byType || {}).sort((a, b) => b[1].avgRating - a[1].avgRating).slice(0, 3).map(([t, d]) => `${t}(${d.avgRating}★)`).join(', ')}`
            : '',
    ].filter(Boolean).join('\n');

    const result = await callAgent(CONTENT_AB_TEST_PROMPT(brandContext), userPrompt, 0.7);

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

    const { brandContext } = await loadBrandContext(state.brandId);

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
        state.language ? `LANGUAGE: ${state.language}` : '',
        state.subType ? `VIDEO TYPE: ${state.subType}` : '',
        '',
        intelligenceContext,
    ].filter(Boolean).join('\n');

    const result = await callAgent(YOUTUBE_RESEARCH_PROMPT(brandContext), userPrompt, 0.6);

    return {
        ...state,
        youtubeResearch: result,
        status: 'youtube_research',
    };
}

export async function youtubeWriterNode(state) {
    console.log('✍️ YouTube Agent: Writer — creating YouTube content...');

    const { brandContext } = await loadBrandContext(state.brandId);
    const research = state.youtubeResearch || {};

    const userPrompt = [
        `WRITE YOUTUBE CONTENT FOR: ${state.brief}`,
        `FORMAT: ${state.format || 'video'} (${state.format === 'shorts' ? 'YouTube Shorts — MAX 60 seconds, punchy, no intro' : 'Long-form YouTube video'})`,
        state.videoLength ? `TARGET VIDEO LENGTH: ${state.videoLength}` : '',
        state.language ? `LANGUAGE: Write in ${state.language}` : '',
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

    const result = await callAgent(YOUTUBE_WRITER_PROMPT(brandContext), userPrompt, 0.7, 8192);

    return {
        ...state,
        youtubeContent: result,
        status: 'youtube_writing',
    };
}

export async function youtubeSeoNode(state) {
    console.log('🚀 YouTube Agent: SEO Optimizer — generating publish metadata...');

    const { brandContext } = await loadBrandContext(state.brandId);
    const research = state.youtubeResearch || {};

    const userPrompt = [
        `GENERATE YOUTUBE PUBLISHING METADATA FOR: ${state.brief}`,
        `FORMAT: ${state.format || 'video'} (${state.format === 'shorts' ? 'YouTube Shorts — under 60 seconds' : 'Long-form YouTube video'})`,
        state.targetAudience ? `TARGET AUDIENCE: ${state.targetAudience}` : '',
        state.language ? `LANGUAGE: ${state.language}` : '',
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

    const result = await callAgent(YOUTUBE_SEO_PROMPT(brandContext), userPrompt, 0.5, 4096);

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
        if (t.calendarHooks?.length) {
            parts.push(`Calendar Hooks: ${t.calendarHooks.slice(0, 3).join(', ')}`);
        }
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

    const { brandContext } = await loadBrandContext(state.brandId);
    const intelligenceContext = buildIntelligenceContext(state.intelligence || {});

    const prompt = BLOG_STRUCTURED_PROMPT
        .replace('{brandContext}', brandContext || 'No brand context')
        .replace('{researchContext}', intelligenceContext || 'No research data')
        .replace('{topic}', state.topic || state.brief || '')
        .replace('{blogType}', state.blogType || 'seo_blog')
        .replace('{targetWordCount}', String(state.targetWordCount || 1500))
        .replace('{keywords}', (state.keywords || []).join(', ') || 'auto-detect')
        .replace('{audience}', state.targetAudience || 'general')
        .replace('{tone}', state.tone || 'professional, engaging');

    const result = await callAgent(prompt, `Generate a structured blog article about: ${state.topic || state.brief}`, 0.7, 8192);

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

    return {
        ...state,
        blogData,
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

        const grounding = await callMultimodalAgent(
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

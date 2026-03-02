/**
 * Content Studio — Agentic Pipeline Node Functions
 * 
 * 5-agent chain: Research → Writer → SEO → ToneMatcher → QualityCritic
 * Each node: (state) → updatedState
 */

import { callAgent } from '../shared/agentUtils.js';
import { loadBrandContext } from '../shared/agentUtils.js';
import {
    RESEARCH_PROMPT,
    WRITER_PROMPT,
    SEO_PROMPT,
    TONE_MATCHER_PROMPT,
    QUALITY_CRITIC_PROMPT,
} from './prompts.js';

// ══════════════════════════════════════════════════════════════════════════════
// NODE 1: RESEARCH — Analyze topic, find angles, keywords, structure
// ══════════════════════════════════════════════════════════════════════════════
export async function researchNode(state) {
    console.log('🔍 Content Agent: Research — analyzing topic...');

    const { brandContext } = await loadBrandContext(state.brandId);

    const userPrompt = [
        `CONTENT BRIEF: ${state.brief}`,
        `CONTENT TYPE: ${state.contentType || 'social'}`,
        `PLATFORM: ${state.platform || 'instagram'}`,
        `TARGET AUDIENCE: ${state.targetAudience || 'general'}`,
        state.tone ? `PREFERRED TONE: ${state.tone}` : '',
        state.language ? `LANGUAGE: ${state.language}` : '',
    ].filter(Boolean).join('\n');

    const result = await callAgent(RESEARCH_PROMPT(brandContext), userPrompt, 0.6);

    return {
        ...state,
        research: result,
        status: 'research',
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// NODE 2: WRITER — Create the content using research insights
// ══════════════════════════════════════════════════════════════════════════════
export async function writerNode(state) {
    console.log('✍️ Content Agent: Writer — creating content...');

    const { brandContext } = await loadBrandContext(state.brandId);

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
    ].filter(Boolean).join('\n');

    const result = await callAgent(WRITER_PROMPT(brandContext), userPrompt, 0.7);

    return {
        ...state,
        draft: result,
        status: 'writing',
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// NODE 3: SEO — Optimize for discoverability
// ══════════════════════════════════════════════════════════════════════════════
export async function seoNode(state) {
    console.log('🔎 Content Agent: SEO — optimizing...');

    const { brandContext } = await loadBrandContext(state.brandId);

    const userPrompt = [
        `OPTIMIZE THIS CONTENT FOR SEO:`,
        `Title: ${state.draft?.title || ''}`,
        `Content: ${state.draft?.content || ''}`,
        `Platform: ${state.platform || 'instagram'}`,
        `Target Keywords: ${(state.research?.targetKeywords || []).join(', ')}`,
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
// NODE 5: QUALITY CRITIC — Final assessment
// ══════════════════════════════════════════════════════════════════════════════
export async function qualityCriticNode(state) {
    console.log('⭐ Content Agent: Quality Critic — scoring...');

    const { brandContext } = await loadBrandContext(state.brandId);

    const userPrompt = [
        `ASSESS THIS FINAL CONTENT:`,
        `Title: ${state.seoOptimized?.optimizedTitle || state.draft?.title || ''}`,
        `Content: ${state.toneMatched?.matchedContent || state.seoOptimized?.optimizedContent || state.draft?.content || ''}`,
        `Platform: ${state.platform || 'instagram'}`,
        `Content Type: ${state.contentType || 'social'}`,
        `Brief: ${state.brief}`,
    ].join('\n');

    const result = await callAgent(QUALITY_CRITIC_PROMPT(brandContext), userPrompt, 0.3);

    return {
        ...state,
        critique: result,
        finalContent: state.toneMatched?.matchedContent || state.seoOptimized?.optimizedContent || state.draft?.content || '',
        finalTitle: state.seoOptimized?.optimizedTitle || state.draft?.title || '',
        status: 'critique',
    };
}

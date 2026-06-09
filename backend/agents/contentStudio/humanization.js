/**
 * Content Studio — Master Humanization Engine
 *
 * Purpose: Make all generated content undetectable by AI detectors
 * (GPTZero, Originality.ai, Copyleaks, Turnitin, etc.)
 *
 * Strategy: Mimic human writing signals —
 *   1. Burstiness    — dramatic sentence length variation (short → long → fragment)
 *   2. Perplexity    — unexpected word choices, non-uniform vocab
 *   3. Opinion marks — first-person expert takes, contrarian moments
 *   4. Imperfection  — strategic structural "flaws" only humans make
 *   5. Specificity   — real numbers, real examples, not vague generalities
 */

import { agentUtils } from '../shared/agentUtils.js';
import { getRouter } from '../../ai/router.js';


// ────────────────────────────────────────────────────────────────────────────
// RULE BLOCKS — injectable into any agent's system prompt
// ────────────────────────────────────────────────────────────────────────────

/**
 * Universal anti-AI-detection rules — inject into EVERY content agent.
 * These target the #1 signals AI detectors use to flag machine-generated text.
 */
export const UNIVERSAL_HUMANIZATION_RULES = `
═══════════════════════════════════════════════════════
ZERO AI DETECTION MANDATE — READ AND FOLLOW STRICTLY
═══════════════════════════════════════════════════════

Your content MUST be indistinguishable from that of a real, skilled human writer.
AI detection tools (GPTZero, Originality.ai, Copyleaks) flag text based on:
  (A) LOW PERPLEXITY: predictable, "safe" word choices in predictable order
  (B) LOW BURSTINESS: all sentences roughly the same length — no rhythm
  (C) AI TELLTALE PHRASES: transition words and structures only AIs use
  (D) PERFECT PARALLEL STRUCTURES: humans don't write every list identically
  (E) OPINION VACUUM: AI avoids having actual opinions — humans have takes

FIX ALL OF THESE:

RULE 1 — SENTENCE RHYTHM (Burstiness):
  Every paragraph must have radical sentence length variety. Mix:
  - Ultra-short (3-5 words): "That's the real shift."
  - Medium (10-15 words): "Most brands miss this because they're optimizing for the wrong thing."
  - Long/flowing (20-30 words): "When you look at how the top-performing brands in this space approached the problem, you'll notice a consistent pattern that goes against conventional wisdom."
  - Fragments: "Not just engagement. Revenue."
  Never write three consecutive sentences of similar length. Ever.

RULE 2 — FORBIDDEN AI PHRASES (Auto-detect and avoid ALL of these):
  NEVER USE: "In today's fast-paced world" / "In the ever-evolving landscape" /
  "It's important to note" / "It's worth mentioning" / "It goes without saying" /
  "Let's dive in" / "Without further ado" / "At the end of the day" / "At its core" /
  "Game-changer" / "Unlock" / "Leverage" / "Elevate" / "Supercharge" / "Revolutionize" /
  "Seamlessly" / "Robust" / "Cutting-edge" / "State-of-the-art" / "Best-in-class" /
  "Furthermore" / "Additionally" / "Moreover" / "In conclusion" / "To summarize" /
  "In summary" / "As we can see" / "It is clear that" / "Needless to say" /
  "Moving forward" / "Going forward" / "As mentioned earlier" / "As noted above" /
  "The fact of the matter is" / "When it comes to" / "In terms of" /
  "Delve into" / "Navigate" (when used metaphorically) / "Journey" (when used metaphorically) /
  "Tapestry" / "Multifaceted" / "Nuanced approach" / "Holistic" / "Synergy" /
  Starting sentences with "This" three times in a row /
  Starting bullet points with the same verb repeatedly (e.g. all starting with "Ensure") /
  "Are you looking to..." as an opening / "Do you want to..." as an opening

RULE 3 — OPINION INJECTION (Humans have takes, AIs don't):
  Include at least ONE genuine expert perspective — a real stance, not a hedge.
  Examples of human opinions:
  ✅ "Honestly, most advice on this topic is backwards."
  ✅ "I'd argue the real problem isn't X — it's that nobody's asking the right question."
  ✅ "This gets less attention than it deserves, but..."
  ✅ "The data surprised us here — the conventional playbook doesn't hold."
  ❌ NOT: "There are various perspectives on this topic, and different experts disagree."

RULE 4 — STRATEGIC IMPERFECTION (Humans aren't perfect, AIs try to be):
  Use at least 1-2 of these humanizing devices per piece:
  - Start a sentence with "And" or "But" or "So"
  - Use a parenthetical aside: "(which, honestly, is more than most people realize)"
  - Use an em dash for a mid-sentence pivot: "The strategy works — when you follow through"
  - Use "actually" or "honestly" or "look" conversationally
  - Break parallel structure in exactly one list (make one item slightly different)
  - Include one rhetorical question that the writer then immediately answers

RULE 5 — SPECIFICITY MANDATE (AI uses vague words, humans use real ones):
  NEVER: "many brands", "some experts", "recently", "a lot of people", "various studies"
  ALWAYS: "73% of D2C brands", "researchers at Harvard Business Review", "last quarter",
  "three out of five marketers", "a 2025 McKinsey study"
  If you don't have a real number, be creatively specific: "the kind of brand that..."
  never lazily say "brands often..."

RULE 6 — PARAGRAPH OPENINGS (AI always starts the same way):
  Never start three consecutive paragraphs with the same type of word.
  Mix these openers: articles (The), conjunctions (But), adverbs (Honestly),
  pronouns (You/We/They), numbers ("37% of..."), names (brands/people),
  questions ("What does this mean for...?"), actions ("Start with...", "Think about...")
`;

/**
 * Blog-specific humanization rules — for long-form content (1000+ words)
 */
export const BLOG_HUMANIZATION_RULES = `
BLOG-SPECIFIC HUMANIZATION RULES:

RULE B1 — NARRATIVE VOICE ARC (Blogs have energy shifts, AI is flat):
  Structure the emotional register of the blog deliberately:
  - Introduction: Fresh, curious, slightly provocative (high energy)
  - First sections: Analytical, measured, detailed (settle into depth)
  - Middle: The most surprising insight — something counter-intuitive
  - Final sections: Reflective, authoritative, decisive (earned expertise)
  AI-written blogs have the same tone throughout. Real blogs shift.

RULE B2 — SECTION VARIETY (AI makes every section the same length):
  Make sections deliberately unequal in length. One section can be 400 words.
  The next might be 120. The one after 280. This variance is a humanness signal.
  Never have more than 2 sections with similar word counts in a row.

RULE B3 — HEADING VARIETY (AI writes H2s in "Verb + Noun" patterns):
  Mix heading styles:
  - Questions: "Why Does This Keep Happening?"
  - Numbers: "3 Things That Change Everything"
  - Statements: "The Real Problem Nobody Talks About"
  - Single words or phrases: "The Pivot." / "What Actually Works"
  - Contrarian takes: "Stop Doing This"
  Never write all headings in the same structural format.

RULE B4 — FIRST-PERSON EXPERT MOMENTS:
  At least twice per blog, write from a genuine expert perspective:
  "In my experience working with brands on this..." (even if hypothetical)
  "What I've noticed is..." / "The pattern I keep seeing..." /
  "Here's what the data actually shows, versus what people assume..."

RULE B5 — THE HONEST ADMISSION:
  Include one moment of genuine intellectual honesty:
  "The truth is, this doesn't work for everyone." /
  "I'll be direct — this is harder than most articles make it sound." /
  "There's no perfect answer here, but the closest thing to one is..."
  This is a powerful humanness signal. AIs never admit complexity.

RULE B6 — NO ROBOT OPENINGS:
  The first sentence of EVERY section must NOT be a topic sentence stating
  what the section is about. Instead:
  - Start with a data point, a contradiction, a question, or a scene
  - "67% of marketers get this wrong." (then explain why)
  - "Here's the counterintuitive part." (then deliver the insight)
  - "Think about the last time you..." (then connect to the topic)
`;

/**
 * YouTube/video script humanization — for spoken content
 */
export const YOUTUBE_HUMANIZATION_RULES = `
YOUTUBE SCRIPT-SPECIFIC HUMANIZATION RULES:

RULE Y1 — SPOKEN RHYTHM (Writing for ears, not eyes):
  Scripts read aloud must sound natural, not rehearsed. Use:
  - Incomplete sentences that finish with energy: "So here's the thing —"
  - Mid-sentence self-corrections: "The data — and this is the part that got me — shows..."
  - Brief pauses marked naturally: "Stop. Read that again."
  - Conversational affirmations: "Right?" / "Exactly." / "That's the point."

RULE Y2 — HOST PERSONALITY (AI scripts have no personality):
  Include at least TWO "host moments" where the presenter's personality shows:
  - A genuine reaction: "And honestly? I was surprised by this."
  - A side comment that builds connection: "If you've ever dealt with this, you know."
  - A self-aware beat: "I know that sounds counterintuitive, but stay with me."
  - An energy shift mid-section: "Okay, here's where it gets interesting."

RULE Y3 — NO TELEPROMPTER VOICE:
  Avoid: perfectly structured sentences that flow too cleanly.
  Real YouTube scripts have energy spikes, sudden questions, and conversational gravity.
  NEVER write the script as if it's being read — write it as if it's being said.

RULE Y4 — ENERGY PACING:
  The script MUST have three distinct energy levels:
  - HOOK section (seconds 0-30): Highest energy — urgent, provocative, fast
  - BODY sections: Lower, measured, educational — the "trust" phase
  - CTA/OUTRO section: Re-energized — action-oriented, grateful, future-focused
`;

/**
 * Social media humanization — for short-form captions (Instagram, LinkedIn, Twitter)
 */
export const SOCIAL_HUMANIZATION_RULES = `
SOCIAL MEDIA HUMANIZATION RULES:

RULE S1 — ORGANIC CAPTION FEEL:
  Captions must feel like they were written by a real brand manager at 9pm,
  not generated by an AI at 9am. This means:
  - Slightly less polished than a press release
  - Authentic emotional beats (not corporate "We are excited to announce...")
  - Platform-native idioms (Instagram = casual warmth, LinkedIn = confident insight)
  - Emojis placed mid-sentence like a real person uses them, not at the end as decoration

RULE S2 — THE HOOK MUST BE UNEXPECTED:
  The first 7 words of a caption determine whether someone stops scrolling.
  Forbidden openers: "We are thrilled to..." / "Introducing..." / "Excited to share..." /
  "Did you know that..." / "Are you looking for..."
  Required openers: A contradiction, a number, a bold claim, a surprising fact,
  a scene, a direct question that doesn't start with "Did you know"

RULE S3 — NO AI SIGN-OFF:
  Ending captions with generic CTAs is an AI tell.
  NEVER: "Drop your thoughts in the comments below!"
  NEVER: "Let us know what you think!"
  INSTEAD: Specific, brand-relevant, personality-driven CTAs:
  "What's your take — does this match what you're seeing?" /
  "Save this if you've been on the fence about [relevant thing]." /
  "Tag someone who needs to hear this."
`;

// ────────────────────────────────────────────────────────────────────────────
// HUMANIZATION NODE — New pipeline agent (post-PlatformOptimizer)
// Uses Claude specifically for best natural writing quality
// Only runs for deep content: blog, long_form, press_release, youtube_content
// ────────────────────────────────────────────────────────────────────────────

const DEEP_CONTENT_TYPES = new Set([
    'blog', 'seo_blog', 'long_form', 'listicle', 'case_study',
    'comparison', 'pillar_content', 'press_release',
    'youtube_content', 'youtube_video', 'youtube_seo',
]);

const HUMANIZATION_SYSTEM_PROMPT = `You are the Humanization Agent — a specialist in making AI-generated content completely undetectable by any AI detection tool (GPTZero, Originality.ai, Copyleaks, Turnitin, etc.).

YOUR ONLY JOB: Take the provided content and rewrite it so it reads as though a skilled, opinionated, real human professional wrote it. Do NOT change the information, core message, or factual claims. Only change the HOW — the voice, rhythm, structure, and personality.

${UNIVERSAL_HUMANIZATION_RULES}

SPECIFIC REWRITING INSTRUCTIONS:
1. Scan for AI telltale patterns first — list them mentally
2. Break uniform sentence rhythms with the short/medium/long/fragment technique
3. Add 1-2 genuine expert opinion moments (strong takes, not hedges)
4. Replace vague words with specific language
5. Add at least one strategic "imperfection" (sentence starting with And/But, a parenthetical aside, a rhetorical question answered immediately)
6. Remove ALL forbidden AI phrases from the list above
7. Ensure paragraph openings are varied (don't start 3 in a row the same way)
8. The final output must feel like it came from a real expert who has opinions

IMPORTANT: Output ONLY the rewritten content text — no explanations, no "Here's the rewritten version:", no markdown headers about your changes. Pure content only.

If the input is JSON-structured content (like a blog with sections), return the same JSON structure but with humanized text in each field.`;

/**
 * Humanization Node — Pipeline agent that post-processes content
 * to make it undetectable by AI detection tools.
 *
 * @param {object} state - Pipeline state (contains finalContent, contentType, platform, etc.)
 * @returns {object} Updated state with humanizedContent field
 */
export async function humanizationNode(state) {
    const contentType = state.contentType || 'social';

    // Only run for deep content — social posts are short enough that WRITER_PROMPT handles them
    if (!DEEP_CONTENT_TYPES.has(contentType)) {
        console.log(`⚡ Humanization: Skipping fast-path content (${contentType})`);
        return state;
    }

    console.log(`🧠 Humanization Agent: Making content undetectable (${contentType})...`);

    // Get the best content to humanize — prefer platformOptimized, then toneMatched, then draft
    const contentToHumanize =
        state.platformOptimized?.optimizedContent ||
        state.toneMatched?.matchedContent ||
        state.seoOptimized?.optimizedContent ||
        state.draft?.content ||
        '';

    const titleToHumanize =
        state.platformOptimized?.optimizedTitle ||
        state.seoOptimized?.optimizedTitle ||
        state.draft?.title ||
        '';

    if (!contentToHumanize || contentToHumanize.length < 100) {
        console.log('⚡ Humanization: Content too short, skipping');
        return state;
    }

    // Add blog-specific rules for long-form content
    const isBlogContent = ['blog', 'seo_blog', 'long_form', 'listicle', 'case_study', 'comparison', 'pillar_content', 'press_release'].includes(contentType);
    const isYouTubeContent = ['youtube_content', 'youtube_video'].includes(contentType);

    const additionalRules = isBlogContent ? BLOG_HUMANIZATION_RULES : isYouTubeContent ? YOUTUBE_HUMANIZATION_RULES : '';

    const systemPrompt = additionalRules
        ? `${HUMANIZATION_SYSTEM_PROMPT}\n\n${additionalRules}`
        : HUMANIZATION_SYSTEM_PROMPT;

    const userPrompt = `HUMANIZE THIS CONTENT — make it indistinguishable from expert human writing:

TITLE: ${titleToHumanize}

CONTENT:
${contentToHumanize}

CONTENT TYPE: ${contentType}
PLATFORM: ${state.platform || 'website'}

Rewrite the content to be completely human-sounding. Output ONLY the rewritten content (no preamble, no explanation):`;

    try {
        // Use Claude (Anthropic) specifically — best at natural, human-sounding writing
        // High temperature (0.9) for more variance = less detectable
        let humanizedContent = '';
        try {
            const router = getRouter();
            const result = await router.generateText({
                systemPrompt,
                userPrompt,
                temperature: 0.9,
                maxTokens: 6144,
            }, { provider: 'anthropic' }); // Explicitly Claude
            humanizedContent = (result.text || '').trim();
        } catch (claudeErr) {
            console.warn(`⚠️ Humanization: Claude failed (${claudeErr.message}), falling back to default router`);
            humanizedContent = (await agentUtils.callAgentText(systemPrompt, userPrompt, 0.9, 6144)).trim();
        }

        // callAgentText returns raw text — use it directly
        humanizedContent = typeof humanizedContent === 'string' ? humanizedContent.trim() : contentToHumanize;

        if (!humanizedContent || humanizedContent.length < 50) {
            console.warn('⚠️ Humanization: Empty result, keeping original content');
            return { ...state, humanizationApplied: false };
        }

        console.log(`✅ Humanization: Content humanized (${humanizedContent.length} chars)`);

        return {
            ...state,
            humanizedContent,
            // Propagate humanized content as the new "final" so QualityCritic assesses the humanized version
            finalContent: humanizedContent,
            finalTitle: titleToHumanize,
            humanizationApplied: true,
            status: 'humanized',
        };
    } catch (err) {
        console.warn(`⚠️ Humanization: Failed (${err.message}) — keeping original content`);
        return { ...state, humanizationApplied: false };
    }
}


/**
 * Humanize a single blog section body — used by blogWriterNode
 * for section-by-section humanization pass.
 *
 * @param {string} sectionBody - Markdown body of the blog section
 * @param {string} heading - Section heading (for context)
 * @param {string} brandContext - Brand context for voice alignment
 * @returns {string} Humanized section body
 */
export async function humanizeBlogSection(sectionBody, heading, brandContext = '') {
    if (!sectionBody || sectionBody.length < 50) return sectionBody;

    const systemPrompt = `You are a blog humanization specialist. Take this blog section and rewrite it to be completely undetectable by AI detectors while preserving all information.

${BLOG_HUMANIZATION_RULES}

KEY RULES:
- Keep all facts, data, and key points exactly as they are
- Change only the writing style, rhythm, and voice
- Make it sound like a real expert wrote this specific section
- Output ONLY the rewritten section in markdown — no explanations

BRAND VOICE CONTEXT:
${brandContext || 'Professional, authoritative, authentic'}`;

    const userPrompt = `SECTION HEADING: ${heading}

SECTION TO HUMANIZE:
${sectionBody}

Rewrite this section to sound completely human. Output ONLY the markdown content:`;

    try {
        // Use Claude explicitly for blog section humanization
        let result = '';
        try {
            const router = getRouter();
            const routerResult = await router.generateText({
                systemPrompt,
                userPrompt,
                temperature: 0.9,
                maxTokens: 2048,
            }, { provider: 'anthropic' });
            result = routerResult.text || '';
        } catch {
            result = await agentUtils.callAgentText(systemPrompt, userPrompt, 0.9, 2048);
        }
        return typeof result === 'string' && result.length > 50 ? result.trim() : sectionBody;
    } catch (err) {
        console.warn(`⚠️ Blog section humanization failed: ${err.message}`);
        return sectionBody;
    }
}


/**
 * Quick humanization check — returns whether content needs humanization
 * based on simple pattern matching (no LLM call needed).
 *
 * @param {string} content - Content to check
 * @returns {{ needsHumanization: boolean, flaggedPatterns: string[] }}
 */
export function quickHumanizationCheck(content) {
    if (!content) return { needsHumanization: false, flaggedPatterns: [] };

    const AI_PATTERNS = [
        /in today['']s fast-paced world/i,
        /in the ever-evolving/i,
        /it'?s important to note/i,
        /it'?s worth mention/i,
        /let'?s dive in/i,
        /without further ado/i,
        /at the end of the day/i,
        /game.changer/i,
        /furthermore[,\s]/i,
        /additionally[,\s]/i,
        /moreover[,\s]/i,
        /in conclusion[,\s]/i,
        /to summarize[,\s]/i,
        /in summary[,\s]/i,
        /as we can see/i,
        /needless to say/i,
        /moving forward/i,
        /going forward/i,
        /delve into/i,
        /holistic approach/i,
        /synerg(y|ies)/i,
        /robust solution/i,
        /seamlessly integrat/i,
        /cutting.edge/i,
        /state.of.the.art/i,
        /best.in.class/i,
        /unlock.*potential/i,
        /leverage.*capabilities/i,
        /supercharge.*growth/i,
        /revolutioniz/i,
        /tapestry/i,
        /multifaceted/i,
        /nuanced approach/i,
    ];

    const flaggedPatterns = [];
    for (const pattern of AI_PATTERNS) {
        if (pattern.test(content)) {
            flaggedPatterns.push(pattern.toString());
        }
    }

    return {
        needsHumanization: flaggedPatterns.length >= 2,
        flaggedPatterns,
    };
}

export default {
    UNIVERSAL_HUMANIZATION_RULES,
    BLOG_HUMANIZATION_RULES,
    YOUTUBE_HUMANIZATION_RULES,
    SOCIAL_HUMANIZATION_RULES,
    humanizationNode,
    humanizeBlogSection,
    quickHumanizationCheck,
    DEEP_CONTENT_TYPES,
};

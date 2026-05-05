/**
 * Prompt Safety — Pre-flight NSFW/policy check using Gemini Flash.
 * Costs ~$0.001 per check — orders of magnitude cheaper than a failed
 * $0.50–$1.50 video generation that gets rejected mid-processing.
 *
 * IMPORTANT: Failures always fail OPEN (safe=true) — never block legitimate jobs.
 */

import { getRouter } from '../ai/router.js';

const SAFETY_SYSTEM = `You are a content moderation classifier for a video generation platform used by e-commerce brands.
Your ONLY job: classify prompts as SAFE or UNSAFE.
UNSAFE = explicit sexual content, graphic violence/gore, real person defamation, self-harm instructions.
Marketing content with models, products, lifestyle imagery = SAFE.
Return ONLY valid JSON: { "safe": true, "reason": "" } or { "safe": false, "reason": "one sentence max" }`;

/**
 * Fast, cheap safety pre-check using Gemini Flash.
 * @param {string} prompt — The user's video generation prompt
 * @returns {{ safe: boolean, reason: string }}
 */
export async function checkPromptSafety(prompt) {
    if (!prompt || prompt.length < 10) return { safe: true, reason: '' };
    try {
        const router = getRouter();
        const result = await router.generateText({
            model: 'gemini-flash',
            system: SAFETY_SYSTEM,
            prompt: `Classify this video prompt:\n\n"${prompt.substring(0, 500)}"`,
            temperature: 0,
            maxTokens: 60,
            timeoutMs: 5000,         // hard 5s timeout — never block generation
        });
        const parsed = JSON.parse(result?.text?.match(/\{[\s\S]*\}/)?.[0] || '{}');
        return { safe: parsed.safe !== false, reason: parsed.reason || '' };
    } catch (err) {
        // Safety check failures MUST fail open (safe=true) — never block legitimate jobs
        console.warn(`⚠️ [Safety] Pre-flight check failed (failing open): ${err.message}`);
        return { safe: true, reason: 'check_failed' };
    }
}

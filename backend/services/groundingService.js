/**
 * Grounding Service - Ensures AI narratives are strictly factual.
 * 
 * This service provides system prompts and formatting that prevent AI hallucinations
 * by forcing the model to stick to deterministic JSON metrics from the crawl.
 */

import { getRouter } from '../ai/router.js';
import { extractJSON } from '../utils/ai-parser.js';

/**
 * Generates a grounded SEO narrative using provided metrics.
 * 
 * @param {string} systemPrompt - The core instruction for the AI.
 * @param {string} userContext - The specific website data.
 * @param {Object} options - Model options.
 */
export async function generateGroundedNarrative(systemPrompt, userContext, options = {}) {
  const { temperature = 0.2, provider } = options; // Low temperature for deterministic output

  // Inject grounding instructions if not already present
  const groundedSystemPrompt = `
${systemPrompt}

STRICT GROUNDING RULES:
1. Use ONLY the data provided in the JSON context.
2. If a metric is 0 (e.g., word count, bytes), report it as an issue rather than inferring content exists.
3. Do NOT hallucinate specific content strategies if the crawl data shows empty pages.
4. If most pages are "Untitled" or empty, emphasize that the results are based on a partial/failed crawl.
5. NEVER claim a site has high authority or specific schema types if they are missing from the data.
  `.trim();

  try {
    const aiRouter = getRouter();
    const result = await aiRouter.generateText({
      systemPrompt: groundedSystemPrompt,
      userPrompt: userContext,
      temperature, // Force lower temperature for grounding
      maxTokens: 8192,
    }, { provider });

    return {
      text: result.text,
      model: result.model,
      provider: result.provider,
      tokensUsed: result.tokensUsed
    };
  } catch (error) {
    console.error('Grounding Service Error:', error.message);
    throw error;
  }
}

/**
 * Determines if a particular claim in a narrative is supported by metrics.
 * (Future extension: per-claim verification)
 */
export function verifyClaim(claim, metrics) {
  // Logic to cross-reference claims against JSON path values
  return true; 
}

/**
 * Brand Strategist Engine
 *
 * Phase 4B — Background Intelligence
 *
 * This engine runs asynchronously behind the scenes to "pre-warm" a creative brief
 * for a specific brand. It acts as an active AI "Art Director" who says:
 * "Based on what I know about this brand, this product, and current trends,
 * here is what you should generate next."
 *
 * It is invoked by `/suggest-briefs` or triggered periodically by the server.
 */

import { generateContent } from '../../utils/geminiClient.js';
import Brand from '../../models/Brand.js';
import { buildBrandContext } from '../shared/agentUtils.js';

// Prompt to generate high-quality, pre-warmed creative briefs
const BRAND_STRATEGIST_PROMPT = `
You are the Executive Brand Strategist at a top-tier creative agency.
Your job is to proactively pitch THREE (3) brilliant, highly-strategic creative briefs for a brand.

You will be given:
1. The full Brand DNA (Brand Identity, Photography Style, USPs, Target Audience)
2. (Optional) Recent Market Trends or Cultural Context

Based ONLY on this information, pitch 3 distinct creative concepts that would perform exceptionally well on social media right now.
The concepts must not be generic. They must be highly specific, leveraging the brand's unique photography style, typography rules, and product constraints.

REQUIREMENTS FOR EACH CONCEPT:
1. It must be visually striking and "scroll-stopping"
2. It must clearly communicate at least one of the brand's USPs
3. It must specify a concrete visual environment (e.g. "Minimalist concrete studio", "Sun-drenched Mediterranean villa")
4. It must include a precise lighting directive (e.g. "Harsh directional flash", "Soft diffused morning light")

Return the response STRICTLY as a JSON array containing exactly 3 objects.
DO NOT wrap the response in \`\`\`json or any other markdown.
Output ONLY raw valid JSON matching this schema:
[
  {
    "title": "Short punchy name for the concept",
    "rationale": "Why this works for the target audience and current trends (1-2 sentences)",
    "brief": "The actual detailed creative prompt that will be fed to an AI image generator. Include environment, lighting, casting, and product placement details.",
    "formatSuggestion": "instagram-post" | "instagram-story" | "pinterest-pin" | "linkedin-post"
  }
]
`;

/**
 * Generates strategic creative briefs for a brand.
 * @param {string} brandId
 * @param {string} [marketContext] - Optional market trend data to inject
 * @returns {Promise<Array>} Array of brief objects
 */
export async function generateStrategicBriefs(brandId, marketContext = '') {
    console.log(`🧠 [BrandStrategist] Generating pre-warmed briefs for brand: ${brandId}`);
    try {
        const brand = await Brand.findById(brandId);
        if (!brand) throw new Error('Brand not found');

        const brandContext = await buildBrandContext(brand);

        const prompt = [
            `BRAND DNA:`,
            brandContext,
            marketContext ? `\nCURRENT MARKET TRENDS / CONTEXT:\n${marketContext}` : '',
            `\nGenerate 3 high-performance creative briefs based on the instructions above. RETURN RAW JSON ONLY.`
        ].filter(Boolean).join('\n');

        const response = await generateContent({
            prompt,
            systemInstruction: BRAND_STRATEGIST_PROMPT,
            temperature: 0.8, // Slightly higher temp for creative diversity
            maxTokens: 1500
        });

        if (!response.success || !response.text) {
            throw new Error(`Gemini API failed: ${response.error || 'Empty response'}`);
        }

        let jsonStr = response.text.trim();
        // Defensive cleaning of markdown blocks
        if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.replace(/^```[a-z]*\n/i, '').replace(/\n```$/i, '');
        }

        const briefs = JSON.parse(jsonStr);
        console.log(`🧠 [BrandStrategist] Successfully generated ${briefs.length} briefs for ${brand.name}`);
        return briefs;

    } catch (err) {
        console.error(`⚠️ [BrandStrategist] Failed to generate briefs: ${err.message}`);
        // Return fallback generic briefs if the API fails
        return [
            {
                title: "Hero Product Showcase",
                rationale: "Focuses entirely on the product with perfect lighting to drive direct conversions.",
                brief: "A high-end editorial product shot highlighting the premium textures and materials. Soft diffused studio lighting, clean minimalist background, sharp focus on the product details.",
                formatSuggestion: "instagram-post"
            }
        ];
    }
}

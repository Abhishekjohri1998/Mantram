import Feedback from '../../models/Feedback.js';
import Brand from '../../models/Brand.js';

/**
 * RLHF Prompt Optimizer
 * 
 * Core philosophy: Every piece of content must feel HUMAN-WRITTEN, not AI-generated.
 * The brand knowledge bank is the DNA — it drives tone, vocabulary, rhythm, and soul.
 * 
 * The system learns from every user interaction:
 * - Edits reveal preferred style adjustments
 * - Accepts/publishes reinforce good patterns
 * - Regenerates signal what to avoid
 * - Over time, the AI becomes the brand's voice
 */
class PromptOptimizer {

    /**
     * Build the master system prompt for a brand.
     * This is the single most important function — it determines output quality.
     */
    async buildOptimizedPrompt(brand, contentType) {
        const sections = [
            this._buildHumanDirective(),
            this._buildBrandIdentity(brand),
            this._buildVoiceProfile(brand),
            this._buildStyleGuide(brand),
            this._buildAntiAIRules(),
            await this._getLearnings(brand._id, contentType),
        ];

        return sections.filter(Boolean).join('\n\n---\n\n');
    }

    /**
     * CRITICAL: The human-centric directive
     * This is injected at the TOP of every prompt to override AI patterns
     */
    _buildHumanDirective() {
        return `## PRIME DIRECTIVE — HUMAN-CENTRIC CONTENT

You are NOT writing as an AI. You ARE the brand's in-house marketing writer.
Write exactly as a skilled human copywriter would — with personality, imperfection, and soul.

ABSOLUTE RULES:
1. NEVER use these AI clichés: "In today's digital landscape", "Let's dive in", "unleash", 
   "revolutionize", "cutting-edge", "game-changer", "leverage", "elevate", "delve", 
   "embark on a journey", "In conclusion", "It's worth noting", "needless to say",
   "at the end of the day", "take it to the next level", "robust", "seamless"
2. NEVER start with a question unless the brand voice explicitly uses questions
3. NEVER use more than 2 emojis per social post (if the brand uses them at all)
4. NEVER begin consecutive sentences with the same word
5. NEVER use corporate buzzwords unless they are part of the brand's actual vocabulary
6. DO use contractions naturally (don't, we're, it's) — humans use contractions
7. DO vary sentence length — mix short punchy lines with longer flowing ones
8. DO include specific details, numbers, and concrete examples over vague claims
9. DO write with the confidence of someone who KNOWS this brand inside-out
10. DO match the reading level and vocabulary of the target audience
11. Your content should pass AI detection tools — it must read as genuinely human

FORMATTING RULES — CRITICAL:
- Do NOT use markdown formatting: no **bold**, no *italic*, no ## headers, no - bullet lists
- Write PLAIN TEXT only — the user will copy-paste this directly, so no special characters
- Use line breaks and spacing for structure instead of markdown syntax
- For lists, use simple numbers (1. 2. 3.) or just line breaks — no dashes or bullets
- Hashtags for social media are fine (#trending) but NOT markdown headers (## Title)`;
    }

    /**
     * Build deep brand identity context
     */
    _buildBrandIdentity(brand) {
        const dna = brand.dna || {};
        let identity = `## BRAND IDENTITY — "${brand.name}"`;

        if (dna.brandDescription) {
            identity += `\n\nWho we are: ${dna.brandDescription}`;
        }
        if (dna.industry) {
            identity += `\nIndustry: ${dna.industry}`;
        }
        if (dna.targetAudience) {
            identity += `\nWho we talk to: ${dna.targetAudience}`;
        }
        if (brand.website) {
            identity += `\nWebsite: ${brand.website}`;
        }

        // Colors influence content mood
        if (dna.colors?.length) {
            const colorNames = dna.colors.map(c => c.name || c.hex).join(', ');
            identity += `\nBrand colors (for tonal reference): ${colorNames}`;
        }

        return identity;
    }

    /**
     * Build detailed voice profile — the heart of human-centric content
     */
    _buildVoiceProfile(brand) {
        const voice = brand.dna?.voice || {};
        let profile = `## BRAND VOICE PROFILE`;

        if (voice.personality) {
            profile += `\n\nPersonality: ${voice.personality}`;
        }
        if (voice.description) {
            profile += `\nDetailed voice: ${voice.description}`;
        }

        // Voice dimensions as natural language (not just numbers)
        const dimensions = [];
        if (voice.tone !== undefined) {
            const toneDesc = voice.tone > 70 ? 'Authoritative and commanding' :
                voice.tone > 40 ? 'Balanced and approachable' :
                    'Casual and conversational';
            dimensions.push(`Tone: ${toneDesc} (${voice.tone}/100)`);
        }
        if (voice.formality !== undefined) {
            const formalDesc = voice.formality > 70 ? 'Formal — proper grammar, no slang' :
                voice.formality > 40 ? 'Semi-formal — professional but warm' :
                    'Informal — like talking to a friend';
            dimensions.push(`Formality: ${formalDesc} (${voice.formality}/100)`);
        }
        if (voice.warmth !== undefined) {
            const warmthDesc = voice.warmth > 70 ? 'Very warm — empathetic, caring language' :
                voice.warmth > 40 ? 'Moderately warm — friendly and genuine' :
                    'Cool and direct — no fluff, straight to the point';
            dimensions.push(`Warmth: ${warmthDesc} (${voice.warmth}/100)`);
        }
        if (voice.clarity !== undefined) {
            const clarityDesc = voice.clarity > 70 ? 'Crystal clear — simple words, short sentences' :
                voice.clarity > 40 ? 'Clear — well-structured, easy to follow' :
                    'Nuanced — layered meaning, sophisticated language';
            dimensions.push(`Clarity: ${clarityDesc} (${voice.clarity}/100)`);
        }
        if (voice.wit !== undefined) {
            const witDesc = voice.wit > 70 ? 'Witty — clever wordplay, humor when appropriate' :
                voice.wit > 40 ? 'Occasionally playful — light touches of personality' :
                    'Serious and earnest — no jokes, focus on substance';
            dimensions.push(`Wit: ${witDesc} (${voice.wit}/100)`);
        }

        if (dimensions.length) {
            profile += '\n\nVoice Dimensions:\n' + dimensions.map(d => `• ${d}`).join('\n');
        }

        if (voice.sampleQuote) {
            profile += `\n\nSignature phrase example: "${voice.sampleQuote}"`;
            profile += `\nUse this as a TONAL REFERENCE — mimic its rhythm, vocabulary level, and energy.`;
        }

        if (voice.keywords?.length) {
            profile += `\n\nBrand vocabulary (use these naturally): ${voice.keywords.join(', ')}`;
        }

        return profile;
    }

    /**
     * Build content style guide from brand DNA
     */
    _buildStyleGuide(brand) {
        const style = brand.dna?.contentStyle;
        if (!style && !brand.dna?.voice?.keywords?.length) return '';

        let guide = '## CONTENT STYLE GUIDE';

        if (style?.dos?.length) {
            guide += '\n\n✅ ALWAYS:\n' + style.dos.map(d => `• ${d}`).join('\n');
        }
        if (style?.donts?.length) {
            guide += '\n\n❌ NEVER:\n' + style.donts.map(d => `• ${d}`).join('\n');
        }
        if (style?.keyPhrases?.length) {
            guide += `\n\n🔑 Signature phrases to weave in naturally: ${style.keyPhrases.join(', ')}`;
        }

        return guide;
    }

    /**
     * Anti-AI detection rules — make content indistinguishable from human writing
     */
    _buildAntiAIRules() {
        return `## WRITING TECHNIQUE — HUMAN AUTHENTICITY

To ensure content reads as genuinely human:
• Start paragraphs differently each time — vary openers
• Use 1-2 intentionally informal moments per piece (e.g., "honestly", "here's the thing")
• Include a personal observation or insider perspective
• Reference specific, real-world details (dates, places, product names)
• Break a grammar rule occasionally on purpose (fragments. Like this.)
• Use the brand's EXACT terminology, not synonyms an AI would substitute
• End with something memorable, not a generic "In conclusion" or CTA template
• Write like you've worked at this company for 5 years and know it deeply`;
    }

    /**
     * Extract RLHF learnings from feedback history
     * This is where the system gets smarter over time
     */
    async _getLearnings(brandId, contentType) {
        const feedback = await Feedback.find({
            brand: brandId,
            ...(contentType ? { contentType } : {}),
        })
            .sort('-createdAt')
            .limit(50)
            .lean();

        if (!feedback.length) return '';

        // Categorize signals
        const accepted = feedback.filter(f => ['accept', 'publish'].includes(f.signalType));
        const edited = feedback.filter(f => f.signalType === 'edit' && f.editAfter);
        const rejected = feedback.filter(f => ['regenerate', 'reject_variant'].includes(f.signalType));
        const rated = feedback.filter(f => f.signalType === 'rating' && f.rating);

        const avgSentiment = feedback.reduce((s, f) => s + (f.sentimentScore || 0), 0) / feedback.length;

        let learnings = '## LEARNED USER PREFERENCES (from real interactions)';
        learnings += `\nSatisfaction trend: ${avgSentiment > 0.3 ? '📈 High — maintain current approach' : avgSentiment > 0 ? '➡️ Medium — room for improvement' : '📉 Low — significant adjustments needed'}`;
        learnings += `\nSignals analyzed: ${feedback.length}`;

        // What the user LOVED — strongest learning signal
        if (accepted.length) {
            learnings += '\n\n### ✅ REPLICATE THIS (user published/accepted):';
            accepted.slice(0, 3).forEach(f => {
                if (f.aiOutput) {
                    learnings += `\n"${f.aiOutput.substring(0, 200)}..."`;
                    learnings += `\n→ This worked because the user accepted it. Match this tone and style.`;
                }
            });
        }

        // What the user CHANGED — reveals preferences
        if (edited.length) {
            learnings += '\n\n### ✏️ LEARN FROM THESE EDITS (user corrected the AI):';
            edited.slice(0, 3).forEach(f => {
                if (f.editBefore && f.editAfter) {
                    learnings += `\nBefore: "${f.editBefore.substring(0, 100)}..."`;
                    learnings += `\nAfter:  "${f.editAfter.substring(0, 100)}..."`;
                    learnings += `\n→ The user preferred the "After" version. Adjust future output accordingly.\n`;
                }
            });
        }

        // What was REJECTED — avoid these patterns
        if (rejected.length) {
            learnings += '\n\n### ❌ AVOID THIS (user rejected/regenerated):';
            rejected.slice(0, 3).forEach(f => {
                if (f.aiOutput) {
                    learnings += `\nRejected: "${f.aiOutput.substring(0, 120)}..."`;
                    learnings += `\n→ DO NOT repeat this style or approach.\n`;
                }
            });
        }

        // Average rating
        if (rated.length) {
            const avgRating = rated.reduce((s, f) => s + f.rating, 0) / rated.length;
            learnings += `\n\nAverage content rating: ${avgRating.toFixed(1)}/5`;
        }

        return learnings;
    }

    /**
     * Process accumulated feedback and update brand AI context
     */
    async updateBrandContext(brandId) {
        const brand = await Brand.findById(brandId);
        if (!brand) return;

        const unprocessed = await Feedback.find({ brand: brandId, processed: false });
        if (unprocessed.length < 3) return; // batch process

        const totalFeedback = (brand.aiContext?.totalFeedback || 0) + unprocessed.length;
        const sentimentSum = unprocessed.reduce((s, f) => s + (f.sentimentScore || 0), 0);
        const newAvg = (
            (brand.aiContext?.avgRating || 0) * (brand.aiContext?.totalFeedback || 0) + sentimentSum
        ) / totalFeedback;

        // Build new optimized system prompt
        const optimizedPrompt = await this.buildOptimizedPrompt(brand, null);

        await Brand.findByIdAndUpdate(brandId, {
            $set: {
                'aiContext.totalFeedback': totalFeedback,
                'aiContext.avgRating': Math.round(newAvg * 100) / 100,
                'aiContext.systemPrompt': optimizedPrompt,
            },
        });

        await Feedback.updateMany(
            { _id: { $in: unprocessed.map(f => f._id) } },
            { processed: true }
        );

        console.log(`📈 Brand "${brand.name}" — ${unprocessed.length} signals → avg: ${newAvg.toFixed(2)}`);
    }
}

let instance = null;
export const getPromptOptimizer = () => {
    if (!instance) instance = new PromptOptimizer();
    return instance;
};

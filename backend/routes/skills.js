import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { requireCredits } from '../middleware/credits.js';
import Skill from '../models/Skill.js';
import Brand from '../models/Brand.js';
import { seedDefaultSkills } from '../seeds/defaultSkills.js';
import { resolveTargetMarkets, getMarketContext, getRelevantFestivals } from '../utils/globalCalendar.js';
import { safeErrorMessage } from '../utils/safeError.js';
import { setMaxListeners } from 'events';

const router = Router();


// ============================================================================
// AI CALL HELPER (reusable across skills)
// ============================================================================

async function aiCall(systemPrompt, userPrompt, options = {}) {
    const { temperature = 0.7, maxTokens = 4096, json = false, timeoutMs = 600000 } = options;

    const controller = new AbortController();
    try { setMaxListeners(30, controller.signal); } catch (e) {}
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        // Try OpenAI first
        if (process.env.OPENAI_API_KEY) {
            try {
                const resp = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    signal: controller.signal,
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
                    body: JSON.stringify({
                        model: 'gpt-4o-mini',
                        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
                        temperature, max_tokens: maxTokens,
                        ...(json ? { response_format: { type: 'json_object' } } : {}),
                    }),
                });
                const data = await resp.json();
                if (data.choices?.[0]?.message?.content) return data.choices[0].message.content;
                if (data.error) console.warn('OpenAI Skills failed:', data.error.message);
            } catch (e) { console.warn('OpenAI Skills error:', e.message); }
        }

        // Fallback: Grok (xAI)
        const grokKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
        if (grokKey) {
            try {
                const resp = await fetch('https://api.x.ai/v1/chat/completions', {
                    method: 'POST',
                    signal: controller.signal,
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${grokKey}` },
                    body: JSON.stringify({
                        model: 'grok-3-mini-fast',
                        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
                        temperature, max_tokens: maxTokens,
                        ...(json ? { response_format: { type: 'json_object' } } : {}),
                    }),
                });
                const data = await resp.json();
                if (data.choices?.[0]?.message?.content) return data.choices[0].message.content;
                if (data.error) console.warn('Grok Skills failed:', data.error.message);
            } catch (e) { console.warn('Grok Skills error:', e.message); }
        }

        // Fallback: Gemini (REST API)
        const geminiKey = process.env.GEMINI_IMAGE_API_KEY || process.env.GEMINI_API_KEY;
        if (geminiKey) {
            const models = ['gemini-2.5-flash', 'gemini-2.5-flash-preview-05-20'];
            for (const model of models) {
                try {
                    const resp = await fetch(
                        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
                        {
                            method: 'POST',
                            signal: controller.signal,
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                systemInstruction: { parts: [{ text: systemPrompt }] },
                                contents: [{ parts: [{ text: userPrompt }] }],
                                generationConfig: {
                                    temperature, maxOutputTokens: maxTokens,
                                    ...(json ? { responseMimeType: 'application/json' } : {}),
                                },
                            }),
                        }
                    );
                    const data = await resp.json();
                    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (text) return text;
                    if (data.error) console.warn(`Gemini ${model}:`, data.error.message);
                } catch (e) { console.warn(`Gemini ${model} error:`, e.message); }
            }
        }

        throw new Error('All AI models failed');
    } finally { clearTimeout(timer); }
}

function parseJSON(text) {
    try {
        const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
        return JSON.parse(cleaned);
    } catch {
        return { raw: text };
    }
}


// ============================================================================
// SEED — Auto-seed default skills on first request if none exist
// ============================================================================

let seeded = false;
async function ensureSeeded() {
    if (seeded) return;
    seeded = true;
    try {
        const count = await Skill.countDocuments({ isPrebuilt: true });
        if (count === 0) {
            console.log('🌱 Seeding default skills...');
            await seedDefaultSkills();
            console.log('✅ Default skills seeded');
        }
    } catch (e) { console.warn('Skill seed check failed:', e.message); }
}


// ============================================================================
// LIST SKILLS — Get available skills for current user
// ============================================================================

router.get('/', protect, async (req, res) => {
    try {
        await ensureSeeded();
        const { category, status = 'active' } = req.query;

        // User sees: own skills + all prebuilt skills + marketplace skills
        const query = {
            status,
            $or: [
                { user: req.user._id },
                { isPrebuilt: true },
                { visibility: 'marketplace' },
            ],
        };
        if (category) query.category = category;

        const skills = await Skill.find(query)
            .select('-instructions -systemPrompt -exampleOutput -changelog')  // progressive disclosure: metadata only
            .sort({ isPrebuilt: -1, usageCount: -1, createdAt: -1 })
            .lean();

        res.json({ success: true, skills });
    } catch (error) {
        console.error('List skills error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ============================================================================
// GET SINGLE SKILL — Full details (loads instructions for execution)
// ============================================================================

router.get('/:id', protect, async (req, res) => {
    try {
        const skill = await Skill.findOne({
            _id: req.params.id,
            $or: [
                { user: req.user._id },
                { isPrebuilt: true },
                { visibility: 'marketplace' },
            ],
        }).lean();

        if (!skill) return res.status(404).json({ success: false, error: 'Skill not found' });
        res.json({ success: true, skill });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ============================================================================
// CREATE SKILL
// ============================================================================

router.post('/', protect, async (req, res) => {
    try {
        const { name, description, instructions, category, tags, icon, color,
            inputFields, outputFormat, systemPrompt, modelPreference,
            temperature, visibility, exampleOutput } = req.body;

        if (!name?.trim() || !description?.trim() || !instructions?.trim()) {
            return res.status(400).json({ success: false, error: 'Name, description, and instructions are required' });
        }

        const skill = await Skill.create({
            user: req.user._id,
            name: name.trim(),
            description: description.trim(),
            instructions: instructions.trim(),
            category: category || 'general',
            tags: tags || [],
            icon: icon || 'auto_awesome',
            color: color || 'violet',
            inputFields: inputFields || [],
            outputFormat: outputFormat || 'structured',
            systemPrompt: systemPrompt || '',
            modelPreference: modelPreference || 'auto',
            temperature: temperature ?? 0.7,
            visibility: visibility || 'private',
            exampleOutput: exampleOutput || '',
            status: 'active',
            version: 1,
            changelog: [{ version: 1, changes: 'Initial creation' }],
        });

        res.status(201).json({ success: true, skill });
    } catch (error) {
        console.error('Create skill error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ============================================================================
// UPDATE SKILL (with versioning)
// ============================================================================

router.put('/:id', protect, async (req, res) => {
    try {
        const skill = await Skill.findOne({ _id: req.params.id, user: req.user._id });
        if (!skill) return res.status(404).json({ success: false, error: 'Skill not found or not yours' });
        if (skill.isPrebuilt) return res.status(403).json({ success: false, error: 'Cannot edit pre-built skills. Clone it instead.' });

        const updates = req.body;
        const editableFields = ['name', 'description', 'instructions', 'category', 'tags',
            'icon', 'color', 'inputFields', 'outputFormat', 'systemPrompt',
            'modelPreference', 'temperature', 'visibility', 'exampleOutput', 'status'];

        let changed = false;
        for (const field of editableFields) {
            if (updates[field] !== undefined) {
                skill[field] = updates[field];
                changed = true;
            }
        }

        if (changed) {
            skill.version += 1;
            skill.changelog.push({
                version: skill.version,
                changes: updates.changelogNote || 'Updated skill',
            });
        }

        await skill.save();
        res.json({ success: true, skill });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ============================================================================
// DELETE SKILL
// ============================================================================

router.delete('/:id', protect, async (req, res) => {
    try {
        const skill = await Skill.findOne({ _id: req.params.id, user: req.user._id });
        if (!skill) return res.status(404).json({ success: false, error: 'Skill not found or not yours' });
        if (skill.isPrebuilt) return res.status(403).json({ success: false, error: 'Cannot delete pre-built skills' });

        await skill.deleteOne();
        res.json({ success: true, message: 'Skill deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ============================================================================
// CLONE SKILL (duplicate to your workspace)
// ============================================================================

router.post('/:id/clone', protect, async (req, res) => {
    try {
        const source = await Skill.findOne({
            _id: req.params.id,
            $or: [
                { user: req.user._id },
                { isPrebuilt: true },
                { visibility: 'marketplace' },
            ],
        }).lean();

        if (!source) return res.status(404).json({ success: false, error: 'Source skill not found' });

        const clone = await Skill.create({
            user: req.user._id,
            name: `${source.name} (Copy)`,
            description: source.description,
            instructions: source.instructions,
            category: source.category,
            tags: source.tags,
            icon: source.icon,
            color: source.color,
            inputFields: source.inputFields,
            outputFormat: source.outputFormat,
            systemPrompt: source.systemPrompt,
            modelPreference: source.modelPreference,
            temperature: source.temperature,
            visibility: 'private',
            status: 'active',
            version: 1,
            changelog: [{ version: 1, changes: `Cloned from "${source.name}"` }],
        });

        res.status(201).json({ success: true, skill: clone });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ============================================================================
// RATE SKILL
// ============================================================================

router.post('/:id/rate', protect, async (req, res) => {
    try {
        const { rating, feedback } = req.body;
        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ success: false, error: 'Rating must be 1-5' });
        }

        const skill = await Skill.findById(req.params.id);
        if (!skill) return res.status(404).json({ success: false, error: 'Skill not found' });

        // Rolling average
        const newCount = skill.ratingCount + 1;
        skill.avgRating = ((skill.avgRating * skill.ratingCount) + rating) / newCount;
        skill.ratingCount = newCount;
        await skill.save();

        res.json({ success: true, avgRating: skill.avgRating, ratingCount: skill.ratingCount });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ============================================================================
// EXECUTE SKILL — The core engine
// ============================================================================

router.post('/:id/execute', protect, requireCredits('content'), async (req, res) => {
    try {
        const { inputs, brandId } = req.body;

        // Load the full skill
        const skill = await Skill.findOne({
            _id: req.params.id,
            status: 'active',
            $or: [
                { user: req.user._id },
                { isPrebuilt: true },
                { visibility: 'marketplace' },
            ],
        });
        if (!skill) return res.status(404).json({ success: false, error: 'Skill not found or inactive' });

        // Load brand context if provided
        let brandContext = '';
        let brand = null;
        if (brandId) {
            brand = await Brand.findOne({ _id: brandId, user: req.user._id }).lean();
            if (brand) {
                brandContext = [
                    `Brand: ${brand.name}`,
                    brand.website ? `Website: ${brand.website}` : '',
                    brand.dna?.industry ? `Industry: ${brand.dna.industry}` : '',
                    brand.dna?.targetAudience ? `Target Audience: ${brand.dna.targetAudience}` : '',
                    brand.dna?.brandDescription ? `Description: ${brand.dna.brandDescription}` : '',
                    brand.dna?.toneOfVoice ? `Tone: ${brand.dna.toneOfVoice}` : '',
                    brand.dna?.country ? `Country: ${brand.dna.country}` : '',
                    brand.dna?.productCategory ? `Product Category: ${brand.dna.productCategory}` : '',
                ].filter(Boolean).join('\n');
            }
        }

        // Build user input string from inputFields
        let userInputText = '';
        if (inputs && skill.inputFields?.length > 0) {
            userInputText = skill.inputFields.map(field => {
                const value = inputs[field.name];
                if (!value && field.required) throw new Error(`Missing required input: ${field.label}`);
                return value ? `${field.label}: ${value}` : '';
            }).filter(Boolean).join('\n');
        }

        // Resolve target markets from brand data
        const targetMarkets = resolveTargetMarkets(brand);

        // Construct the AI prompt
        const now = new Date();
        const dateContext = `TODAY'S DATE: ${now.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}. Current year is ${now.getFullYear()}. All dates in your response MUST be in ${now.getFullYear()} or later. NEVER use past dates.`;

        // Get market-specific context (cultural norms, currency, language)
        const marketCtx = getMarketContext(targetMarkets);

        // Get real festival dates filtered by target markets
        const festivalContext = getRelevantFestivals(
            `${userInputText} ${skill.name} ${skill.description} ${skill.instructions}`,
            targetMarkets,
        );

        const systemPrompt = [
            skill.systemPrompt || `You are an expert AI assistant executing the "${skill.name}" skill.`,
            '',
            `=== CURRENT DATE ===`,
            dateContext,
            '',
            marketCtx || '',
            festivalContext || '',
            '=== SKILL INSTRUCTIONS ===',
            skill.instructions,
            '',
            brandContext ? `=== BRAND CONTEXT ===\n${brandContext}\nTarget Markets: ${targetMarkets.join(', ')}` : `Target Markets: ${targetMarkets.join(', ')}`,
            '',
            'CRITICAL RULES:',
            '1. DATES: Use ONLY verified dates from the festival calendar above. NEVER guess or hallucinate dates.',
            '2. MARKET: Adapt all content to the specified target markets — use their currency, cultural references, language nuances, and local trends.',
            '3. LANGUAGE: Generate content in the language appropriate for the target market (e.g., Portuguese for Brazil, Arabic for Saudi, Hinglish for India).',
            '4. CULTURAL: Respect cultural sensitivities of each target market. If multiple markets, note differences.',
            '',
            skill.outputFormat === 'json' || skill.outputFormat === 'structured'
                ? 'Respond in valid JSON format.'
                : skill.outputFormat === 'html'
                    ? 'Respond in clean HTML.'
                    : 'Respond in well-formatted Markdown.',
        ].filter(Boolean).join('\n');

        const userPrompt = userInputText
            ? `Execute this skill with the following inputs:\n\n${userInputText}\n\nTarget Markets: ${targetMarkets.join(', ')}. Today: ${now.toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}. Use ONLY verified dates. Adapt content for the specified target markets.`
            : `Execute this skill for the brand context provided. Target Markets: ${targetMarkets.join(', ')}. Today: ${now.toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}. Use ONLY verified dates. Adapt content for the specified target markets.`;

        // Execute
        const isJson = skill.outputFormat === 'json' || skill.outputFormat === 'structured';
        const result = await aiCall(systemPrompt, userPrompt, {
            temperature: skill.temperature,
            maxTokens: 4096,
            json: isJson,
        });

        // Parse result
        let output;
        if (isJson) {
            output = parseJSON(result);
        } else {
            output = { content: result };
        }

        // Update usage stats
        skill.usageCount += 1;
        skill.lastUsedAt = new Date();
        await skill.save();

        res.json({
            success: true,
            skillName: skill.name,
            skillId: skill._id,
            output,
            outputFormat: skill.outputFormat,
            suggestedNextSkills: skill.suggestedNextSkills,
        });
    } catch (error) {
        console.error('Execute skill error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ============================================================================
// AI SKILL GENERATOR — Create skills via AI
// ============================================================================

router.post('/generate', protect, requireCredits('contentRefine'), async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt?.trim()) return res.status(400).json({ success: false, error: 'Describe the skill you want to create' });

        const systemPrompt = `You are an AI Skill Builder for Mantram AI, a D2C marketing platform. Given a user's description, generate a complete skill definition.

Respond in STRICT JSON:
{
    "name": "Skill name (short, clear)",
    "description": "1-2 sentence description for discovery",
    "category": "content|creative|seo|social|performance|video|general",
    "tags": ["tag1", "tag2", "tag3"],
    "icon": "A Material Symbols icon name (e.g., campaign, brush, analytics)",
    "color": "emerald|blue|amber|violet|rose|cyan|orange|teal",
    "instructions": "Detailed instructions for the AI to follow when executing this skill. Include: what the skill does, how to structure the output, what to include/exclude, formatting rules, and quality standards. Minimum 200 words.",
    "systemPrompt": "A concise system prompt for the AI (1-2 sentences describing the expert persona)",
    "inputFields": [
        {
            "name": "fieldName",
            "label": "Human-readable label",
            "type": "text|textarea|select|url|number",
            "required": true,
            "placeholder": "Helper text"
        }
    ],
    "outputFormat": "structured|markdown|html",
    "temperature": 0.7,
    "exampleOutput": "A brief example of what the output looks like"
}

Make the skill highly specific to D2C marketing in India. Include Hinglish support where relevant.`;

        const result = await aiCall(systemPrompt, `Create a skill for: ${prompt.trim()}`, { json: true, temperature: 0.5 });
        const parsed = parseJSON(result);

        res.json({ success: true, generated: parsed });
    } catch (error) {
        console.error('Generate skill error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ============================================================================
// ENHANCE INSTRUCTIONS — Polish rough instructions with AI
// ============================================================================

router.post('/enhance-instructions', protect, requireCredits('contentRefine'), async (req, res) => {
    try {
        const { instructions, skillName, skillDescription } = req.body;
        if (!instructions?.trim()) return res.status(400).json({ success: false, error: 'Instructions text is required' });

        const today = new Date();
        const currentDate = today.toISOString().split('T')[0];
        const currentYear = today.getFullYear();

        const systemPrompt = `You are an expert AI prompt engineer and D2C marketing strategist for Mantram AI.
Your job is to take rough, basic instructions and transform them into highly detailed, expert-level AI instructions.

Today's date: ${currentDate}. Current year: ${currentYear}.

Rules:
- Keep the original intent but make instructions dramatically more detailed and actionable
- Add clear structure with numbered steps or sections  
- Include output formatting rules (JSON keys, markdown structure, etc.)
- Add quality standards and what to avoid
- Include Indian D2C marketing context where relevant
- Add tone/voice guidelines
- Specify word counts, lengths, or quantity expectations where appropriate
- Include edge cases to handle
- Make instructions at least 200-400 words
- Do NOT wrap output in markdown code blocks or JSON — return plain text instructions only
- Use current dates and year (${currentYear}) in any examples or references`;

        const context = [
            skillName ? `Skill Name: ${skillName}` : '',
            skillDescription ? `Skill Description: ${skillDescription}` : '',
            `\nOriginal Instructions:\n${instructions.trim()}`,
            `\nEnhance these instructions to be comprehensive, detailed, and production-ready. Return ONLY the enhanced instructions text, nothing else.`,
        ].filter(Boolean).join('\n');

        const result = await aiCall(systemPrompt, context, { temperature: 0.4 });

        // Clean any accidental markdown wrapping
        let enhanced = result.trim();
        if (enhanced.startsWith('```')) {
            enhanced = enhanced.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();
        }

        res.json({ success: true, enhanced });
    } catch (error) {
        console.error('Enhance instructions error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


export default router;

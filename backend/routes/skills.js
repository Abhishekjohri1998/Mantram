import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { requireCredits } from '../middleware/credits.js';
import Skill from '../models/Skill.js';
import Brand from '../models/Brand.js';
import User from '../models/User.js';
import SkillExecution from '../models/SkillExecution.js';
import Content from '../models/Content.js';
import { seedDefaultSkills } from '../seeds/defaultSkills.js';
import { resolveTargetMarkets, getMarketContext, getRelevantFestivals } from '../utils/globalCalendar.js';
import { safeErrorMessage } from '../utils/safeError.js';
import { setMaxListeners } from 'events';
import { executeTool, interpolate, MCP_TOOL_MANIFEST } from './mcp-tools.js';

const MAX_ACTIVE_SKILLS = 5;

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
                { visibility: 'mantram_users' },
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
                { visibility: 'mantram_users' },
            ],
        });
        if (!skill) return res.status(404).json({ success: false, error: 'Skill not found or inactive' });

        // ── Load brand context ────────────────────────────────────────────────
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

        // ── Build input context string (for AI prompt) ─────────────────────
        let userInputText = '';
        if (inputs && skill.inputFields?.length > 0) {
            userInputText = skill.inputFields.map(field => {
                const value = inputs[field.name];
                if (!value && field.required) throw new Error(`Missing required input: ${field.label}`);
                // Don't include image data in text prompt — too large
                if (field.type === 'image_upload' || field.type === 'image_library') {
                    return value ? `${field.label}: [Image provided]` : '';
                }
                return value ? `${field.label}: ${value}` : '';
            }).filter(Boolean).join('\n');
        }

        const targetMarkets = resolveTargetMarkets(brand);
        const now = new Date();
        const dateContext = `TODAY'S DATE: ${now.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}. Current year is ${now.getFullYear()}. All dates in your response MUST be in ${now.getFullYear()} or later. NEVER use past dates.`;
        const marketCtx = getMarketContext(targetMarkets);
        const festivalContext = getRelevantFestivals(
            `${userInputText} ${skill.name} ${skill.description} ${skill.instructions}`,
            targetMarkets,
        );

        // ── MCP Context object (passed to all tool calls) ────────────────────
        const jwtToken = req.headers.authorization?.split(' ')[1] || '';
        const mcpContext = {
            user: req.user,
            brand,
            brandContext,
            inputs,
            executionId: null, // will be set after history record created
            internalToken: jwtToken,
        };

        // ── EXECUTION ROUTER ─────────────────────────────────────────────────
        // For non-text skills, run through MCP tool pipeline first
        let mcpResults = [];
        let aiOutput = null;
        const skillType = skill.skillType || 'text_output';

        if (skillType === 'generate_image' || skillType === 'generate_video' || skillType === 'create_content' || skillType === 'orchestrate') {
            console.log(`⚡ Skills MCP: executing skill type=${skillType}, actions=${skill.mcpActions?.length || 0}`);

            // Step 1: If the skill has instructions, let AI plan the execution params
            if (skill.instructions && skill.mcpActions?.length > 0) {
                const planSystemPrompt = [
                    `You are an AI execution planner for the "${skill.name}" skill.`,
                    'Your job is to generate the exact parameters for each MCP tool call based on the user inputs and brand context.',
                    '',
                    '=== SKILL INSTRUCTIONS ===',
                    skill.instructions,
                    '',
                    brandContext ? `=== BRAND CONTEXT ===\n${brandContext}` : '',
                    dateContext,
                    marketCtx || '',
                    festivalContext || '',
                    '',
                    'USER INPUTS:',
                    userInputText || '(no inputs provided)',
                    '',
                    'MCP TOOLS TO INVOKE:',
                    (skill.mcpActions || []).map((a, i) => `${i + 1}. ${a.tool} — ${a.label || ''}`).join('\n'),
                    '',
                    'Return ONLY valid JSON with this exact shape:',
                    '{',
                    '  "toolParams": [',
                    '    { "tool": "<tool_id>", "params": { ... } }',
                    '  ],',
                    '  "summary": "One sentence describing what will be generated"',
                    '}',
                    'For generate_image tools, "params.prompt" must be a complete, high-quality image generation prompt incorporating brand identity.',
                    'For create_content tools, "params.content" must be the full content array or text.',
                ].filter(Boolean).join('\n');

                const planUserPrompt = `Plan the execution for these user inputs:\n${userInputText || '(no inputs)'}`;

                try {
                    const planResult = await aiCall(planSystemPrompt, planUserPrompt, { json: true, temperature: 0.4, maxTokens: 2048 });
                    const plan = parseJSON(planResult);
                    aiOutput = { summary: plan.summary };

                    // Use AI-planned params, merged with static params if available
                    for (let i = 0; i < (skill.mcpActions || []).length; i++) {
                        const action = skill.mcpActions[i];
                        const plannedAction = (plan.toolParams || [])[i];
                        const baseParams = interpolate(action.params || {}, { ...inputs, brand: brand?.name, market: targetMarkets[0] });
                        const mergedParams = { ...baseParams, ...(plannedAction?.params || {}) };

                        try {
                            const toolResult = await executeTool(action.tool, mergedParams, mcpContext);
                            mcpResults.push({ tool: action.tool, label: action.label || action.tool, result: toolResult, success: true });
                        } catch (toolErr) {
                            console.error(`MCP tool ${action.tool} failed:`, toolErr.message);
                            if (!action.optional) throw toolErr;
                            mcpResults.push({ tool: action.tool, label: action.label || action.tool, error: toolErr.message, success: false });
                        }
                    }
                } catch (planErr) {
                    console.warn(`MCP planning failed, falling back to direct tool params: ${planErr.message}`);
                    // Fallback: run tools with static interpolated params only
                    for (const action of (skill.mcpActions || [])) {
                        const params = interpolate(action.params || {}, { ...inputs, brand: brand?.name });
                        try {
                            const toolResult = await executeTool(action.tool, params, mcpContext);
                            mcpResults.push({ tool: action.tool, label: action.label || action.tool, result: toolResult, success: true });
                        } catch (toolErr) {
                            if (!action.optional) throw toolErr;
                            mcpResults.push({ tool: action.tool, label: action.label || action.tool, error: toolErr.message, success: false });
                        }
                    }
                }
            } else if (skill.mcpActions?.length > 0) {
                // No AI planning — run tools with static params
                for (const action of skill.mcpActions) {
                    const params = interpolate(action.params || {}, { ...inputs, brand: brand?.name });
                    try {
                        const toolResult = await executeTool(action.tool, params, mcpContext);
                        mcpResults.push({ tool: action.tool, label: action.label || action.tool, result: toolResult, success: true });
                    } catch (toolErr) {
                        if (!action.optional) throw toolErr;
                        mcpResults.push({ tool: action.tool, label: action.label || action.tool, error: toolErr.message, success: false });
                    }
                }
            }
        }

        // ── Standard AI text execution (always runs for text_output; also for enriching MCP results) ──
        if (skillType === 'text_output' || skillType === 'create_content') {
            const isJson = skill.outputFormat === 'json' || skill.outputFormat === 'structured';
            const systemPrompt = [
                skill.systemPrompt || `You are an expert AI assistant executing the "${skill.name}" skill.`,
                '',
                `=== CURRENT DATE ===`, dateContext,
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
                '2. MARKET: Adapt all content to the specified target markets.',
                '3. LANGUAGE: Generate content in the language appropriate for the target market.',
                '4. CULTURAL: Respect cultural sensitivities of each target market.',
                '',
                isJson ? 'Respond in valid JSON format.' : skill.outputFormat === 'html' ? 'Respond in clean HTML.' : 'Respond in well-formatted Markdown.',
            ].filter(Boolean).join('\n');

            const userPrompt = userInputText
                ? `Execute this skill with the following inputs:\n\n${userInputText}\n\nTarget Markets: ${targetMarkets.join(', ')}. Today: ${now.toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}. Use ONLY verified dates.`
                : `Execute this skill for the brand context provided. Target Markets: ${targetMarkets.join(', ')}. Today: ${now.toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}.`;

            const elapsed = Date.now() - (req.startTime || Date.now());
            const remainingBudget = Math.max(300000, 600000 - elapsed);
            const result = await aiCall(systemPrompt, userPrompt, { temperature: skill.temperature, maxTokens: 4096, json: isJson, timeout: remainingBudget });
            aiOutput = isJson ? parseJSON(result) : { content: result };

            // Auto-save to Content Studio if outputAction says so
            if (skill.outputAction === 'save_to_content' && aiOutput) {
                await executeTool('content_studio.save_draft', {
                    content: aiOutput.posts || aiOutput.socialPosts || aiOutput.content || JSON.stringify(aiOutput, null, 2),
                    title: skill.name,
                }, mcpContext);
            }
        }

        // ── Aggregate final output ────────────────────────────────────────────
        const output = {
            ...(aiOutput || {}),
            ...(mcpResults.length > 0 ? { mcpResults, skillType } : {}),
        };

        // ── Update usage stats ────────────────────────────────────────────────
        skill.usageCount += 1;
        skill.lastUsedAt = new Date();
        await skill.save();

        // ── Save execution to history ─────────────────────────────────────────
        let execution;

        // Extract videoJob data if this was a video skill
        const videoJobData = mcpResults.find(r => r.tool === 'video_studio.queue_generation' && r.success);
        const videoJob = videoJobData ? {
            projectId: videoJobData.result?.projectId,
            model: videoJobData.result?.model,
            status: 'queued',
        } : undefined;

        try {
            execution = await SkillExecution.create({
                user: req.user._id,
                skill: skill._id,
                brand: brandId || undefined,
                skillName: skill.name,
                skillCategory: skill.category,
                skillIcon: skill.icon,
                skillColor: skill.color,
                inputs: inputs || {},
                output,
                outputFormat: skill.outputFormat,
                mcpResults,
                skillType,
                status: 'completed',
                ...(videoJob ? { videoJob } : {}),
            });
        } catch (histErr) {
            console.warn('Failed to save skill execution history:', histErr.message);
        }

        // ── Phase 2: Skill Chaining ───────────────────────────────────────────
        let chainResult = null;
        let chainSkillName = null;
        if (skill.chainSkillId) {
            try {
                const chainSkill = await Skill.findOne({
                    _id: skill.chainSkillId,
                    status: 'active',
                }).lean();

                if (chainSkill) {
                    chainSkillName = chainSkill.name;

                    // Map output keys → chain skill input fields using chainInputMap
                    const chainInputs = {};
                    const inputMap = skill.chainInputMap ? Object.fromEntries(skill.chainInputMap) : {};
                    const flatOutput = typeof aiOutput === 'object' ? aiOutput : {};

                    if (Object.keys(inputMap).length > 0) {
                        // Use explicit mapping
                        for (const [outputKey, inputFieldName] of Object.entries(inputMap)) {
                            const value = flatOutput[outputKey];
                            if (value !== undefined) {
                                chainInputs[inputFieldName] = typeof value === 'string' ? value : JSON.stringify(value);
                            }
                        }
                    } else {
                        // No explicit mapping — inject primary output summary as "brief"
                        const summary = flatOutput.summary || flatOutput.content || flatOutput.theme ||
                            Object.values(flatOutput).find(v => typeof v === 'string') || '';
                        if (summary) chainInputs.brief = summary;
                    }

                    console.log(`🔗 Chaining to skill: ${chainSkill.name}, inputs:`, JSON.stringify(chainInputs).substring(0, 200));

                    // Call internal execute for the chain skill (reuse same user/brand context)
                    const baseUrl = process.env.INTERNAL_API_URL || `http://localhost:${process.env.PORT || 3001}`;
                    const chainResp = await fetch(`${baseUrl}/api/skills/${skill.chainSkillId}/execute`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${req.headers.authorization?.split(' ')[1]}`,
                        },
                        body: JSON.stringify({ inputs: chainInputs, brandId }),
                        signal: AbortSignal.timeout(180000),
                    });

                    if (chainResp.ok) {
                        const chainData = await chainResp.json();
                        if (chainData.success) {
                            chainResult = {
                                skillName: chainSkill.name,
                                skillId: chainSkill._id,
                                executionId: chainData.executionId,
                                output: chainData.output,
                                mcpResults: chainData.mcpResults || [],
                                skillType: chainData.skillType,
                            };

                            // Update execution with chain info
                            if (execution) {
                                execution.chainSkillName = chainSkill.name;
                                execution.chainResult = chainResult;
                                if (chainData.executionId) execution.chainExecutionId = chainData.executionId;
                                await execution.save();
                            }
                        }
                    }
                }
            } catch (chainErr) {
                console.warn(`⚠️ Skill chaining failed (non-fatal): ${chainErr.message}`);
            }
        }

        res.json({
            success: true,
            skillName: skill.name,
            skillId: skill._id,
            skillType,
            executionId: execution?._id || null,
            output,
            outputFormat: skill.outputFormat,
            mcpResults,
            ...(videoJob ? { videoJob } : {}),
            ...(chainResult ? { chainResult, chainSkillName } : {}),
            suggestedNextSkills: skill.suggestedNextSkills,
        });
    } catch (error) {
        console.error('Execute skill error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});



// ============================================================================
// CREDIT COST PREVIEW — Show cost before executing
// ============================================================================

router.get('/:id/credit-cost', protect, async (req, res) => {
    try {
        const skill = await Skill.findOne({
            _id: req.params.id,
            status: 'active',
            $or: [{ user: req.user._id }, { isPrebuilt: true }, { visibility: 'mantram_users' }],
        }).lean();
        if (!skill) return res.status(404).json({ success: false, error: 'Skill not found' });

        // Calculate cost from mcpActions manifest
        let mcpCost = 0;
        for (const action of (skill.mcpActions || [])) {
            const manifest = MCP_TOOL_MANIFEST.find(t => t.id === action.tool);
            if (manifest) mcpCost += manifest.creditCost;
        }

        const totalCost = Math.max(skill.estimatedCreditCost || 1, mcpCost || 1);
        const breakdown = (skill.mcpActions || []).map(a => {
            const m = MCP_TOOL_MANIFEST.find(t => t.id === a.tool);
            return { tool: a.tool, label: a.label || m?.label || a.tool, cost: m?.creditCost || 0 };
        });
        breakdown.push({ tool: 'ai_inference', label: 'AI Inference', cost: 1 });

        res.json({ success: true, totalCost, breakdown, skillType: skill.skillType || 'text_output' });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ============================================================================
// MARKETPLACE — Browse, Publish, Install (Mantram users only)
// ============================================================================

// Browse marketplace
router.get('/marketplace/browse', protect, async (req, res) => {
    try {
        const { category, search, limit = 20, skip = 0 } = req.query;
        const query = { isPublished: true, status: 'active' };
        if (category) query.category = category;
        if (search) query.$text = { $search: search };

        const skills = await Skill.find(query)
            .select('-instructions -systemPrompt -changelog')
            .sort({ installCount: -1, avgRating: -1, createdAt: -1 })
            .skip(parseInt(skip))
            .limit(Math.min(parseInt(limit), 50))
            .lean();

        const total = await Skill.countDocuments(query);
        res.json({ success: true, skills, total });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// Publish skill to marketplace
router.post('/:id/publish', protect, async (req, res) => {
    try {
        const skill = await Skill.findOne({ _id: req.params.id, user: req.user._id });
        if (!skill) return res.status(404).json({ success: false, error: 'Skill not found or not yours' });
        if (skill.isPrebuilt) return res.status(403).json({ success: false, error: 'Pre-built skills are already public' });

        skill.isPublished = true;
        skill.publishedAt = new Date();
        skill.publisherName = req.user.name || req.user.email?.split('@')[0] || 'Mantram User';
        skill.visibility = 'mantram_users';
        await skill.save();

        res.json({ success: true, message: `"${skill.name}" published to Mantram Marketplace` });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// Unpublish from marketplace
router.post('/:id/unpublish', protect, async (req, res) => {
    try {
        const skill = await Skill.findOne({ _id: req.params.id, user: req.user._id });
        if (!skill) return res.status(404).json({ success: false, error: 'Skill not found' });

        skill.isPublished = false;
        skill.visibility = 'private';
        await skill.save();

        res.json({ success: true, message: `"${skill.name}" removed from marketplace` });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// Install a marketplace skill (creates a copy in user's workspace)
router.post('/:id/install', protect, async (req, res) => {
    try {
        const source = await Skill.findOne({ _id: req.params.id, isPublished: true, status: 'active' }).lean();
        if (!source) return res.status(404).json({ success: false, error: 'Skill not found in marketplace' });

        // Check if already installed
        const existing = await Skill.findOne({ user: req.user._id, originalSkillId: source._id });
        if (existing) return res.json({ success: true, skill: existing, message: 'Already installed', alreadyInstalled: true });

        const installed = await Skill.create({
            user: req.user._id,
            name: source.name,
            description: source.description,
            instructions: source.instructions,
            systemPrompt: source.systemPrompt,
            category: source.category,
            tags: source.tags,
            icon: source.icon,
            color: source.color,
            skillType: source.skillType,
            inputFields: source.inputFields,
            mcpActions: source.mcpActions,
            outputFormat: source.outputFormat,
            outputAction: source.outputAction,
            estimatedCreditCost: source.estimatedCreditCost,
            modelPreference: source.modelPreference,
            temperature: source.temperature,
            visibility: 'private',
            status: 'active',
            originalSkillId: source._id,
            version: 1,
            changelog: [{ version: 1, changes: `Installed from Mantram Marketplace: "${source.name}" by ${source.publisherName}` }],
        });

        // Increment install count on source
        await Skill.findByIdAndUpdate(source._id, { $inc: { installCount: 1 } });

        res.status(201).json({ success: true, skill: installed, message: `"${source.name}" installed to your workspace` });
    } catch (error) {
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

        const elapsed = Date.now() - (req.startTime || Date.now());
        const remainingBudget = Math.max(300000, 600000 - elapsed);
        const result = await aiCall(systemPrompt, `Create a skill for: ${prompt.trim()}`, { json: true, temperature: 0.5, timeout: remainingBudget });
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

        const elapsed = Date.now() - (req.startTime || Date.now());
        const remainingBudget = Math.max(300000, 600000 - elapsed);
        const result = await aiCall(systemPrompt, context, { temperature: 0.4, timeout: remainingBudget });

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


// ============================================================================
// ACTIVATE SKILL — Add to user's persistent active skills (Model A)
// ============================================================================

router.post('/:id/activate', protect, async (req, res) => {
    try {
        const skill = await Skill.findOne({
            _id: req.params.id,
            status: 'active',
            $or: [
                { user: req.user._id },
                { isPrebuilt: true },
                { visibility: 'mantram_users' },
            ],
        });
        if (!skill) return res.status(404).json({ success: false, error: 'Skill not found' });

        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });

        // Check if already active
        const alreadyActive = (user.activeSkills || []).some(id => id.toString() === skill._id.toString());
        if (alreadyActive) return res.json({ success: true, message: 'Skill already active', activeCount: user.activeSkills.length });

        // Cap check
        if ((user.activeSkills || []).length >= MAX_ACTIVE_SKILLS) {
            return res.status(400).json({
                success: false,
                error: `Maximum ${MAX_ACTIVE_SKILLS} active skills allowed. Deactivate one first.`,
                activeCount: user.activeSkills.length,
                max: MAX_ACTIVE_SKILLS,
            });
        }

        user.activeSkills = [...(user.activeSkills || []), skill._id];
        await user.save();

        res.json({ success: true, message: `"${skill.name}" activated`, activeCount: user.activeSkills.length });
    } catch (error) {
        console.error('Activate skill error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ============================================================================
// DEACTIVATE SKILL — Remove from user's persistent active skills
// ============================================================================

router.post('/:id/deactivate', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });

        user.activeSkills = (user.activeSkills || []).filter(id => id.toString() !== req.params.id);
        await user.save();

        res.json({ success: true, message: 'Skill deactivated', activeCount: user.activeSkills.length });
    } catch (error) {
        console.error('Deactivate skill error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ============================================================================
// GET ACTIVE SKILLS — List user's currently activated skills with full details
// ============================================================================

router.get('/active/list', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).lean();
        const activeIds = user?.activeSkills || [];

        if (activeIds.length === 0) {
            return res.json({ success: true, skills: [], count: 0, max: MAX_ACTIVE_SKILLS });
        }

        const skills = await Skill.find({ _id: { $in: activeIds }, status: 'active' })
            .select('name description category icon color tags')
            .lean();

        res.json({ success: true, skills, count: skills.length, max: MAX_ACTIVE_SKILLS });
    } catch (error) {
        console.error('Get active skills error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ============================================================================
// EXECUTION HISTORY — List past skill executions
// ============================================================================

router.get('/executions/list', protect, async (req, res) => {
    try {
        const { brandId, limit = 20, skip = 0 } = req.query;
        const query = { user: req.user._id };
        if (brandId) query.brand = brandId;

        const executions = await SkillExecution.find(query)
            .sort({ createdAt: -1 })
            .skip(parseInt(skip))
            .limit(Math.min(parseInt(limit), 50))
            .lean();

        const total = await SkillExecution.countDocuments(query);

        res.json({ success: true, executions, total });
    } catch (error) {
        console.error('List executions error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ============================================================================
// ROUTE EXECUTION OUTPUT — Send skill output to Content Studio
// ============================================================================

router.post('/executions/:executionId/route', protect, async (req, res) => {
    try {
        const { destination = 'content_studio' } = req.body;
        const execution = await SkillExecution.findOne({
            _id: req.params.executionId,
            user: req.user._id,
        });
        if (!execution) return res.status(404).json({ success: false, error: 'Execution not found' });

        if (destination !== 'content_studio') {
            return res.status(400).json({ success: false, error: 'Only content_studio routing is supported currently' });
        }

        const output = execution.output;
        if (!output || typeof output !== 'object') {
            return res.status(400).json({ success: false, error: 'No structured output to route' });
        }

        // ── Smart content extraction ──
        const contentDocs = [];
        const brandId = execution.brand;
        const skillTag = `skill:${execution.skillName}`;

        // Helper: create a Content doc
        const makeContent = (type, title, content, platform = '', extraTags = []) => ({
            user: req.user._id,
            brand: brandId || undefined,
            type,
            title: title || execution.skillName,
            content: typeof content === 'string' ? content : JSON.stringify(content, null, 2),
            prompt: `Generated by skill: ${execution.skillName}`,
            platform,
            status: 'draft',
            tags: [skillTag, 'auto-generated', ...extraTags],
            aiMeta: { agenticPipeline: true, pipelineStep: 'skill-output' },
        });

        // 1. Social posts (socialPosts, posts, variants)
        const socialData = output.socialPosts || output.posts || output.variants;
        if (Array.isArray(socialData)) {
            for (const post of socialData) {
                const caption = post.caption || post.primaryText || post.text || post.content || JSON.stringify(post);
                const platform = post.platform || '';
                const title = post.day ? `Day ${post.day}` : (post.variantName || post.title || '');
                contentDocs.push(makeContent('social', title, caption, platform, post.hashtags || []));
            }
        }

        // 2. Ad creatives
        const adData = output.adCreatives || output.ads;
        if (Array.isArray(adData)) {
            for (const ad of adData) {
                const body = [ad.headline, ad.body || ad.primaryText, ad.cta ? `CTA: ${ad.cta}` : ''].filter(Boolean).join('\n\n');
                contentDocs.push(makeContent('ad', ad.concept || ad.headline || 'Ad Creative', body, '', ['ad-creative']));
            }
        }

        // 3. Email/WhatsApp messaging
        const msgData = output.messaging || output.emails || output.emailSequence;
        if (Array.isArray(msgData)) {
            for (const msg of msgData) {
                const body = msg.template || msg.body || msg.content || JSON.stringify(msg);
                const title = msg.subject || msg.stage || msg.channel || 'Message';
                contentDocs.push(makeContent('email', title, body, msg.channel || 'email', ['messaging']));
            }
        }

        // 4. Blog/article content
        const blogData = output.blogPost || output.article || output.blog;
        if (blogData && typeof blogData === 'object') {
            const body = blogData.content || blogData.body || JSON.stringify(blogData, null, 2);
            contentDocs.push(makeContent('blog', blogData.title || 'Blog Post', body, '', ['blog']));
        }

        // 5. Content calendar days
        const daysData = output.days;
        if (Array.isArray(daysData) && !socialData) {
            for (const day of daysData) {
                if (day.posts && Array.isArray(day.posts)) {
                    for (const post of day.posts) {
                        const caption = post.caption || post.content || JSON.stringify(post);
                        contentDocs.push(makeContent('social', `${day.day || ''} — ${post.platform || ''}`, caption, post.platform || '', post.hashtags || []));
                    }
                } else if (day.socialPost) {
                    const post = day.socialPost;
                    const caption = post.caption || JSON.stringify(post);
                    contentDocs.push(makeContent('social', `Day ${day.day} — ${day.phase || day.theme || ''}`, caption, '', post.hashtags || []));
                }
            }
        }

        // 6. Reel/video concepts
        const reelData = output.reelConcepts || output.reels || output.videoConcepts;
        if (Array.isArray(reelData)) {
            for (const reel of reelData) {
                const body = [reel.title, reel.script, reel.concept].filter(Boolean).join('\n\n');
                contentDocs.push(makeContent('social', reel.title || 'Reel Concept', body, 'instagram', ['reel', 'video']));
            }
        }

        // 7. Fallback — if no structured content was extracted, wrap entire output
        if (contentDocs.length === 0) {
            contentDocs.push(makeContent('other', execution.skillName, JSON.stringify(output, null, 2), '', ['raw-output']));
        }

        // Save all content docs
        const created = await Content.insertMany(contentDocs);
        const contentIds = created.map(c => c._id);

        // Update execution with routing info
        execution.routedTo.push({
            destination: 'content_studio',
            contentIds,
            itemCount: contentIds.length,
            routedAt: new Date(),
        });
        execution.status = 'routed';
        await execution.save();

        res.json({
            success: true,
            message: `${contentIds.length} item(s) saved to Content Studio as drafts`,
            contentIds,
            itemCount: contentIds.length,
        });
    } catch (error) {
        console.error('Route execution error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});



// ============================================================================
// PHASE 2: VIDEO STATUS POLLING — GET /api/skills/:id/video-status
// ============================================================================
// Polls the Video Studio for the queued job and updates the SkillExecution record.
// Frontend polls this every 5s after a generate_video skill run.

router.get('/:id/video-status', protect, async (req, res) => {
    try {
        const { executionId, projectId } = req.query;
        if (!projectId) return res.status(400).json({ success: false, error: 'projectId is required' });

        // Poll Video Studio
        const baseUrl = process.env.INTERNAL_API_URL || `http://localhost:${process.env.PORT || 3001}`;
        const pollResp = await fetch(`${baseUrl}/api/video-studio/${projectId}/status`, {
            headers: { Authorization: req.headers.authorization },
        });

        if (!pollResp.ok) {
            return res.json({ success: true, status: 'queued', message: 'Still processing...' });
        }

        const pollData = await pollResp.json();
        const project = pollData.project || pollData;

        const genStatus = project.generation?.status || project.status || 'processing';
        const videoUrl   = project.generation?.videoUrl || project.finalVideoUrl || '';
        const thumbnail  = project.generation?.thumbnail || project.thumbnail || '';

        // Map Video Studio status → simplified status
        let status = 'processing';
        if (genStatus === 'completed' || genStatus === 'done' || videoUrl) status = 'completed';
        else if (genStatus === 'failed' || genStatus === 'error') status = 'failed';
        else if (genStatus === 'queued' || genStatus === 'pending') status = 'queued';

        // Persist into SkillExecution if executionId provided
        if (executionId && (status === 'completed' || status === 'failed')) {
            try {
                await SkillExecution.findByIdAndUpdate(executionId, {
                    'videoJob.status': status,
                    'videoJob.videoUrl': videoUrl,
                    'videoJob.thumbnail': thumbnail,
                    'videoJob.polledAt': new Date(),
                });
            } catch { /* non-fatal */ }
        }

        res.json({
            success: true,
            status,
            videoUrl:   videoUrl || null,
            thumbnail:  thumbnail || null,
            projectId,
            message: status === 'completed'
                ? 'Video ready!'
                : status === 'failed'
                    ? 'Generation failed — check Video Studio for details'
                    : 'Still generating… check back in a few seconds',
        });
    } catch (error) {
        console.error('Video status poll error:', error.message);
        res.json({ success: true, status: 'processing', message: 'Still processing...' });
    }
});


// ============================================================================
// PHASE 2: MANUAL CHAIN TRIGGER — POST /api/skills/:id/chain
// ============================================================================
// Manually triggers the configured chain skill for a given execution.

router.post('/:id/chain', protect, async (req, res) => {
    try {
        const { executionId, brandId } = req.body;
        const skill = await Skill.findOne({ _id: req.params.id }).populate('chainSkillId');
        if (!skill) return res.status(404).json({ success: false, error: 'Skill not found' });
        if (!skill.chainSkillId) return res.status(400).json({ success: false, error: 'This skill has no chain configured' });

        // Get primary output from SkillExecution
        let chainInputs = {};
        if (executionId) {
            const exec = await SkillExecution.findById(executionId).lean();
            if (exec?.output) {
                const flatOutput = exec.output;
                const inputMap = skill.chainInputMap ? Object.fromEntries(skill.chainInputMap) : {};
                if (Object.keys(inputMap).length > 0) {
                    for (const [outKey, inField] of Object.entries(inputMap)) {
                        const val = flatOutput[outKey];
                        if (val !== undefined) chainInputs[inField] = typeof val === 'string' ? val : JSON.stringify(val);
                    }
                } else {
                    const summary = flatOutput.summary || flatOutput.content || flatOutput.theme ||
                        Object.values(flatOutput).find(v => typeof v === 'string') || '';
                    if (summary) chainInputs.brief = summary;
                }
            }
        }

        const baseUrl = process.env.INTERNAL_API_URL || `http://localhost:${process.env.PORT || 3001}`;
        const chainResp = await fetch(`${baseUrl}/api/skills/${skill.chainSkillId._id}/execute`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: req.headers.authorization,
            },
            body: JSON.stringify({ inputs: chainInputs, brandId }),
            signal: AbortSignal.timeout(180000),
        });

        const chainData = await chainResp.json();
        res.json({ success: chainData.success, chainSkillName: skill.chainSkillId.name, result: chainData });
    } catch (error) {
        console.error('Chain skill error:', error.message);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


export default router;


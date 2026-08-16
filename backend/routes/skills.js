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
            const models = ['gemini-2.5-flash'];
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
        console.log('🌱 Synchronizing default skills...');
        await seedDefaultSkills();
        console.log('✅ Default skills synchronized');
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
            temperature, visibility, exampleOutput,
            skillType, mcpActions, chainSkillId, chainInputMap } = req.body;

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
            // Phase 2/3 agentic fields
            skillType: skillType || 'text_output',
            mcpActions: mcpActions || [],
            ...(chainSkillId ? { chainSkillId } : {}),
            ...(chainInputMap ? { chainInputMap } : {}),
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
            'modelPreference', 'temperature', 'visibility', 'exampleOutput', 'status',
            'skillType', 'mcpActions', 'chainSkillId', 'chainInputMap'];

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
            try {
                userInputText = skill.inputFields.map(field => {
                    const value = inputs[field.name];
                    if (!value && field.required) {
                        const err = new Error(`Missing required input: ${field.label}`);
                        err.status = 400;
                        throw err;
                    }
                    // Include image URL in text context so AI planner knows about it
                    if (field.type === 'image_upload' || field.type === 'image_library') {
                        return value ? `${field.label}: [Reference image uploaded — URL: ${value}]` : '';
                    }
                    return value ? `${field.label}: ${value}` : '';
                }).filter(Boolean).join('\n');
            } catch (e) {
                if (e.status === 400) return res.status(400).json({ success: false, error: e.message });
                throw e; // rethrow mapping or other errors
            }
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
        // Intelligent auto-dispatch: even when users don't configure MCP actions,
        // the engine automatically routes to the correct studio based on skillType.
        let mcpResults = [];
        let aiOutput = null;
        let skillType = skill.skillType || 'text_output';

        // ── Collect reference images from user inputs ──────────────────────
        const referenceImages = [];
        if (inputs && skill.inputFields?.length > 0) {
            console.log(`🔍 Skills Debug: inputFields=${JSON.stringify(skill.inputFields?.map(f => ({ name: f.name, type: f.type })))}`);
            console.log(`🔍 Skills Debug: input keys=${JSON.stringify(Object.keys(inputs))}`);
            for (const field of skill.inputFields) {
                if ((field.type === 'image_upload' || field.type === 'image_library') && inputs[field.name]) {
                    const imgData = inputs[field.name];
                    const imgPreview = typeof imgData === 'string' ? imgData.substring(0, 50) : typeof imgData;
                    console.log(`📷 Skills: Found reference image in field "${field.name}" (type=${field.type}): ${imgPreview}... (${typeof imgData === 'string' ? imgData.length : 0} chars)`);
                    referenceImages.push(imgData);
                }
            }
        }
        // Also check if inputs has any image-like data even without matching inputFields
        if (referenceImages.length === 0 && inputs) {
            for (const [key, value] of Object.entries(inputs)) {
                if (typeof value === 'string' && (value.startsWith('data:image/') || (value.startsWith('http') && /\.(jpg|jpeg|png|webp|gif)/i.test(value)))) {
                    console.log(`📷 Skills: Found image in input "${key}" (no matching field type): ${value.substring(0, 50)}... (${value.length} chars)`);
                    referenceImages.push(value);
                }
            }
        }
        console.log(`📷 Skills: Total reference images collected: ${referenceImages.length}`);

        // ── AUTO-DETECT skill type from instructions & inputs ──────────────
        // If the user created a skill with type=text_output but the instructions
        // or input fields clearly indicate they want image/video/content generation,
        // auto-upgrade the skillType so it routes to the correct pipeline.
        if (skillType === 'text_output') {
            const instructionsLower = (skill.instructions || '').toLowerCase();
            const hasImageInputs = referenceImages.length > 0;
            const hasImageFields = skill.inputFields?.some(f => f.type === 'image_upload' || f.type === 'image_library');

            // Detect image generation intent
            const imageKeywords = ['generate image', 'create image', 'new image', 'similar image', 'generate similar',
                'image generation', 'create visual', 'generate visual', 'design image', 'produce image',
                'reference image', 'style transfer', 'image template', 'generate photo', 'create photo',
                'similar type of image', 'brand creative', 'product image', 'ad creative', 'banner image',
                'social media image', 'thumbnail', 'generate artwork', 'ai image'];
            const looksLikeImageSkill = imageKeywords.some(kw => instructionsLower.includes(kw))
                || (hasImageInputs || hasImageFields);

            // Detect video generation intent
            const videoKeywords = ['generate video', 'create video', 'video generation', 'produce video',
                'video ad', 'video content', 'motion graphic', 'animate'];
            const looksLikeVideoSkill = videoKeywords.some(kw => instructionsLower.includes(kw));

            // Detect content + save intent
            const contentKeywords = ['save to content', 'create and save', 'auto-save', 'save as draft',
                'publish to', 'schedule post', 'content calendar'];
            const looksLikeContentSkill = contentKeywords.some(kw => instructionsLower.includes(kw));

            if (looksLikeImageSkill) {
                console.log(`🔄 Skills Auto-Detect: Upgrading skillType from text_output → generate_image (detected from instructions/inputs)`);
                skillType = 'generate_image';
            } else if (looksLikeVideoSkill) {
                console.log(`🔄 Skills Auto-Detect: Upgrading skillType from text_output → generate_video`);
                skillType = 'generate_video';
            } else if (looksLikeContentSkill) {
                console.log(`🔄 Skills Auto-Detect: Upgrading skillType from text_output → create_content`);
                skillType = 'create_content';
            }
        }

        if (skillType === 'generate_image' || skillType === 'generate_video' || skillType === 'create_content' || skillType === 'orchestrate') {
            console.log(`⚡ Skills MCP: executing skill type=${skillType}, actions=${skill.mcpActions?.length || 0}, refImages=${referenceImages.length}`);

            const hasMcpActions = skill.mcpActions?.length > 0;

            // ═══════════════════════════════════════════════════════════════════
            // AUTO-DISPATCH: When user creates a skill with a type but NO MCP
            // actions configured, we auto-construct the right tool call.
            // This is the KEY fix that makes Skills truly executable out of the box.
            // ═══════════════════════════════════════════════════════════════════
            if (!hasMcpActions) {
                console.log(`🤖 Skills Auto-Dispatch: No MCP actions configured — auto-routing for skillType=${skillType}`);

                // Step 1: Use AI to translate skill instructions + user inputs into an actionable prompt
                const autoDispatchSystemPrompt = [
                    `You are an AI execution engine for the "${skill.name}" skill.`,
                    `Your job is to produce the EXACT output parameters needed to execute this skill.`,
                    '',
                    '=== SKILL INSTRUCTIONS ===',
                    skill.instructions,
                    '',
                    brandContext ? `=== BRAND CONTEXT ===\n${brandContext}` : '',
                    dateContext,
                    '',
                    'USER INPUTS:',
                    userInputText || '(no specific inputs)',
                    referenceImages.length > 0 ? `\nREFERENCE IMAGES PROVIDED: ${referenceImages.length} image(s). The user wants output that is visually similar or inspired by these references.` : '',
                    '',
                    skillType === 'generate_image' ? [
                        'You MUST produce a JSON response with this EXACT shape:',
                        '{',
                        '  "prompt": "A detailed, production-quality image generation prompt based on the skill instructions and user inputs. Be specific about style, composition, colors, lighting, subject, mood, aspect ratio. If reference images were provided, describe their visual style and instruct the generator to create something in that same style.",',
                        '  "style": "photorealistic | illustration | 3d-render | flat-design | watercolor | cinematic",',
                        '  "size": "1:1 | 16:9 | 9:16 | 4:5 | 3:2",',
                        referenceImages.length > 0 ? '  "referenceNote": "Brief description of the reference image style that the new image should match",' : '',
                        '  "summary": "One sentence describing what will be generated"',
                        '}',
                    ].filter(Boolean).join('\n') : '',
                    skillType === 'generate_video' ? [
                        'You MUST produce a JSON response with this EXACT shape:',
                        '{',
                        '  "prompt": "A detailed video generation prompt.",',
                        '  "duration": 5,',
                        '  "aspectRatio": "16:9",',
                        '  "summary": "One sentence describing the video"',
                        '}',
                    ].join('\n') : '',
                    skillType === 'create_content' ? [
                        'You MUST produce a JSON response with this EXACT shape:',
                        '{',
                        '  "content": "The full generated content text (can be long).",',
                        '  "title": "Content title",',
                        '  "platform": "instagram | linkedin | twitter | blog | email",',
                        '  "summary": "One sentence summary"',
                        '}',
                    ].join('\n') : '',
                    skillType === 'orchestrate' ? [
                        'You MUST produce a JSON response with this EXACT shape:',
                        '{',
                        '  "imagePrompt": "A detailed image generation prompt (if visual output needed).",',
                        '  "content": "Generated text/content (if text output needed).",',
                        '  "title": "Output title",',
                        '  "summary": "One sentence describing what was produced"',
                        '}',
                    ].join('\n') : '',
                    '',
                    'Return ONLY valid JSON. Do NOT describe a UI. Do NOT describe what a tool would look like.',
                    'ACTUALLY PRODUCE the creative output based on the instructions.',
                ].filter(Boolean).join('\n');

                const autoDispatchUserPrompt = `Execute this skill NOW with these inputs:\n${userInputText || '(use skill defaults)'}`;

                try {
                    const adResult = await aiCall(autoDispatchSystemPrompt, autoDispatchUserPrompt, { json: true, temperature: skill.temperature || 0.6, maxTokens: 2048 });
                    const plan = parseJSON(adResult);
                    aiOutput = { summary: plan.summary || `Executed ${skill.name}` };

                    // Auto-dispatch to the correct tool
                    if (skillType === 'generate_image' && plan.prompt) {
                        try {
                            const toolParams = {
                                prompt: plan.prompt,
                                style: plan.style || 'photorealistic',
                                size: plan.size || '1:1',
                            };
                            // Pass reference images if the user uploaded any
                            if (referenceImages.length > 0) {
                                toolParams.referenceImages = referenceImages;
                            }
                            const toolResult = await executeTool('creative_studio.generate_image', toolParams, mcpContext);
                            mcpResults.push({ tool: 'creative_studio.generate_image', label: 'Generate Image', result: toolResult, success: true });
                        } catch (toolErr) {
                            console.error(`Auto-dispatch generate_image failed:`, toolErr.message);
                            mcpResults.push({ tool: 'creative_studio.generate_image', label: 'Generate Image', error: toolErr.message, success: false });
                        }
                    } else if (skillType === 'generate_video' && plan.prompt) {
                        try {
                            const toolResult = await executeTool('video_studio.queue_generation', {
                                prompt: plan.prompt,
                                duration: plan.duration || 5,
                                aspectRatio: plan.aspectRatio || '16:9',
                            }, mcpContext);
                            mcpResults.push({ tool: 'video_studio.queue_generation', label: 'Generate Video', result: toolResult, success: true });
                        } catch (toolErr) {
                            console.error(`Auto-dispatch queue_generation failed:`, toolErr.message);
                            mcpResults.push({ tool: 'video_studio.queue_generation', label: 'Generate Video', error: toolErr.message, success: false });
                        }
                    } else if (skillType === 'create_content' && plan.content) {
                        try {
                            const toolResult = await executeTool('content_studio.save_draft', {
                                content: plan.content,
                                title: plan.title || skill.name,
                                platform: plan.platform || '',
                            }, mcpContext);
                            mcpResults.push({ tool: 'content_studio.save_draft', label: 'Save Content', result: toolResult, success: true });
                            aiOutput = { content: plan.content, title: plan.title, ...aiOutput };
                        } catch (toolErr) {
                            console.error(`Auto-dispatch save_draft failed:`, toolErr.message);
                            // Still return the content even if save failed
                            aiOutput = { content: plan.content, title: plan.title, ...aiOutput };
                        }
                    } else if (skillType === 'orchestrate') {
                        // Orchestrate: try both image + content if provided
                        if (plan.imagePrompt) {
                            try {
                                const toolParams = { prompt: plan.imagePrompt, style: plan.style || 'photorealistic', size: plan.size || '1:1' };
                                if (referenceImages.length > 0) toolParams.referenceImages = referenceImages;
                                const toolResult = await executeTool('creative_studio.generate_image', toolParams, mcpContext);
                                mcpResults.push({ tool: 'creative_studio.generate_image', label: 'Generate Image', result: toolResult, success: true });
                            } catch (toolErr) {
                                mcpResults.push({ tool: 'creative_studio.generate_image', label: 'Generate Image', error: toolErr.message, success: false });
                            }
                        }
                        if (plan.content) {
                            try {
                                const toolResult = await executeTool('content_studio.save_draft', {
                                    content: plan.content, title: plan.title || skill.name,
                                }, mcpContext);
                                mcpResults.push({ tool: 'content_studio.save_draft', label: 'Save Content', result: toolResult, success: true });
                            } catch (toolErr) {
                                mcpResults.push({ tool: 'content_studio.save_draft', label: 'Save Content', error: toolErr.message, success: false });
                            }
                        }
                        aiOutput = { content: plan.content, title: plan.title, ...aiOutput };
                    }
                } catch (autoErr) {
                    console.error(`Auto-dispatch planning failed:`, autoErr.message);
                    // Fall through to text execution as last resort
                }
            }

            // ═══════════════════════════════════════════════════════════════════
            // MANUAL MCP DISPATCH: User explicitly configured tool actions
            // ═══════════════════════════════════════════════════════════════════
            if (hasMcpActions) {
                // Step 1: If the skill has instructions, let AI plan the execution params
                if (skill.instructions) {
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
                        referenceImages.length > 0 ? `\nREFERENCE IMAGES: ${referenceImages.length} image(s) provided by user.` : '',
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
                        'Do NOT describe a UI. PRODUCE the actual creative output parameters.',
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
                            // Inject reference images for image tools
                            if (action.tool.includes('generate_image') && referenceImages.length > 0 && !mergedParams.referenceImages) {
                                mergedParams.referenceImages = referenceImages;
                            }

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
                } else {
                    // No instructions — run tools with static params
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
        }

        // ── Standard AI text execution ───────────────────────────────────────
        // Runs for text_output (always), create_content (supplementary),
        // or as fallback when auto-dispatch produced no MCP results.
        const needsTextExec = skillType === 'text_output'
            || (skillType === 'create_content' && !aiOutput?.content)
            || (mcpResults.length === 0 && !aiOutput);

        if (needsTextExec) {
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
                brandContext ? `=== BRAND CONTEXT ===\n${brandContext}\nPrimary Market: ${targetMarkets[0] || 'IN'}` : `Primary Market: ${targetMarkets[0] || 'IN'}`,
                '',
                'CRITICAL RULES:',
                '1. DATES: Use ONLY verified dates from the festival calendar above. NEVER guess or hallucinate dates.',
                '2. LANGUAGE: Generate content ONLY in English or Hinglish unless the user explicitly requests another language. Do NOT auto-generate Arabic, Thai, or other languages unless told to.',
                '3. NEVER FABRICATE URLs: Do NOT invent image URLs, product URLs, or any links. If you need to reference the brand website, use the actual website from brand context.',
                '4. PRODUCE REAL OUTPUT: Generate the actual deliverable content. Do NOT describe what a tool or UI would look like. Do NOT describe upload flows, file pickers, or image processing steps.',
                '5. FOCUS: Respond ONLY with the content the skill instructions ask for. Do NOT add unrelated sections like "Cultural References", "Edge Cases", "Gallery Access", or "Help Section".',
                '6. NO FAKE IMAGES: You CANNOT generate images. If the skill asks for image generation, produce a detailed image prompt that describes the desired output instead. Do NOT output fake image filenames.',
                '',
                isJson ? 'Respond in valid JSON format.' : skill.outputFormat === 'html' ? 'Respond in clean HTML.' : 'Respond in well-formatted Markdown.',
            ].filter(Boolean).join('\n');

            const userPrompt = userInputText
                ? `Execute this skill with the following inputs:\n\n${userInputText}\n\nToday: ${now.toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}. Use ONLY verified dates. Respond in English unless the user inputs specify otherwise.`
                : `Execute this skill for the brand context provided. Today: ${now.toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}. Respond in English.`;

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
// PHASE 3: ANALYTICS — GET /api/skills/analytics/summary
// ============================================================================

router.get('/analytics/summary', protect, async (req, res) => {
    try {
        const { brandId } = req.query;
        const query = { user: req.user._id };
        if (brandId) query.brand = brandId;

        // Pull all executions for this user
        const executions = await SkillExecution.find(query)
            .sort({ createdAt: -1 })
            .limit(500)
            .lean();

        const totalRuns = executions.length;

        // Credit usage: sum estimatedCreditCost from associated skills at execution time
        // We track skillType + mcpResults per execution
        const CREDIT_MAP = {
            text_output: 1, create_content: 2, generate_image: 5,
            generate_video: 35, orchestrate: 10,
        };
        const creditsUsed = executions.reduce((sum, e) => {
            return sum + (CREDIT_MAP[e.skillType] || 1);
        }, 0);

        // Avg quality rating (from rated executions)
        const rated = executions.filter(e => e.rating);
        const avgRating = rated.length
            ? +(rated.reduce((s, e) => s + e.rating, 0) / rated.length).toFixed(1)
            : null;

        // Time saved estimate (30 min per run is industry average for AI-assisted tasks)
        const minutesSaved = totalRuns * 30;

        // Top skills by usage
        const skillCounter = {};
        const skillNames = {};
        const skillTypes = {};
        for (const e of executions) {
            const id = String(e.skill);
            skillCounter[id] = (skillCounter[id] || 0) + 1;
            skillNames[id] = e.skillName;
            skillTypes[id] = e.skillType || 'text_output';
        }
        const topSkills = Object.entries(skillCounter)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 6)
            .map(([id, count]) => ({ id, name: skillNames[id], count, type: skillTypes[id] }));

        // Skill type breakdown
        const typeBreakdown = {};
        for (const e of executions) {
            const t = e.skillType || 'text_output';
            typeBreakdown[t] = (typeBreakdown[t] || 0) + 1;
        }

        // Recent 7 days trend (runs per day)
        const trend = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dayStr = d.toISOString().split('T')[0];
            const count = executions.filter(e => e.createdAt.toISOString().split('T')[0] === dayStr).length;
            trend.push({ date: dayStr, runs: count });
        }

        res.json({
            success: true,
            summary: {
                totalRuns,
                creditsUsed,
                avgRating,
                minutesSaved,
                topSkills,
                typeBreakdown,
                trend,
            },
        });
    } catch (error) {
        console.error('Analytics summary error:', error.message);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ============================================================================
// PHASE 3: ANALYTICS HISTORY — GET /api/skills/analytics/history
// ============================================================================

router.get('/analytics/history', protect, async (req, res) => {
    try {
        const { brandId, page = 1, limit = 20 } = req.query;
        const query = { user: req.user._id };
        if (brandId) query.brand = brandId;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [executions, total] = await Promise.all([
            SkillExecution.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            SkillExecution.countDocuments(query),
        ]);

        res.json({
            success: true,
            executions: executions.map(e => ({
                _id: e._id,
                skillId: e.skill,
                skillName: e.skillName,
                skillType: e.skillType || 'text_output',
                skillIcon: e.skillIcon,
                skillColor: e.skillColor,
                status: e.status,
                rating: e.rating,
                mcpToolCount: e.mcpResults?.length || 0,
                hasChain: !!e.chainResult,
                hasVideo: !!e.videoJob?.projectId,
                createdAt: e.createdAt,
            })),
            total,
            page: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit)),
        });
    } catch (error) {
        console.error('Analytics history error:', error.message);
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
        const pollResp = await fetch(`${baseUrl}/api/video-studio/${projectId}/status?allowDiskUse=true`, {
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


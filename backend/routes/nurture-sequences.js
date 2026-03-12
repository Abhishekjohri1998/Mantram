/**
 * Nurture Sequence Routes
 * CRUD for nurture sequences tied to funnel stages,
 * AI nurture content generation, and sequence execution
 */

import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import NurtureSequence from '../models/NurtureSequence.js';
import Funnel from '../models/Funnel.js';
import FunnelEntry from '../models/FunnelEntry.js';
import Brand from '../models/Brand.js';
import { getRouter } from '../ai/router.js';
import { safeErrorMessage } from '../utils/safeError.js';

const router = Router();


// ═══════════════════════════════════════════════════════════════
//  NURTURE SEQUENCE CRUD
// ═══════════════════════════════════════════════════════════════

// GET /api/nurture-sequences?funnelId=xxx — List sequences for a funnel
router.get('/', protect, async (req, res) => {
    try {
        const { funnelId, status } = req.query;
        const filter = { user: req.user._id };
        if (funnelId) filter.funnel = funnelId;
        if (status) filter.status = status;

        const sequences = await NurtureSequence.find(filter).sort({ updatedAt: -1 });
        res.json({ success: true, sequences });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// GET /api/nurture-sequences/:id — Get single sequence
router.get('/:id', protect, async (req, res) => {
    try {
        const sequence = await NurtureSequence.findOne({ _id: req.params.id, user: req.user._id });
        if (!sequence) return res.status(404).json({ success: false, error: 'Sequence not found' });
        res.json({ success: true, sequence });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// POST /api/nurture-sequences — Create nurture sequence
router.post('/', protect, async (req, res) => {
    try {
        const { funnelId, name, description, triggerStage, triggerEvent, steps, settings } = req.body;
        if (!funnelId) return res.status(400).json({ success: false, error: 'funnelId is required' });
        if (!triggerStage) return res.status(400).json({ success: false, error: 'triggerStage is required' });

        const funnel = await Funnel.findOne({ _id: funnelId, user: req.user._id });
        if (!funnel) return res.status(404).json({ success: false, error: 'Funnel not found' });

        const sequence = await NurtureSequence.create({
            user: req.user._id,
            brand: funnel.brand,
            funnel: funnelId,
            name: name || `${triggerStage} Nurture`,
            description: description || '',
            triggerStage,
            triggerEvent: triggerEvent || 'stage_enter',
            steps: (steps || []).map((s, idx) => ({ ...s, order: idx })),
            settings: settings || {},
            status: 'draft',
        });

        res.status(201).json({ success: true, sequence });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// PUT /api/nurture-sequences/:id — Update sequence
router.put('/:id', protect, async (req, res) => {
    try {
        const { name, description, triggerStage, triggerEvent, triggerConfig, steps, settings, status } = req.body;
        const update = {};
        if (name !== undefined) update.name = name;
        if (description !== undefined) update.description = description;
        if (triggerStage) update.triggerStage = triggerStage;
        if (triggerEvent) update.triggerEvent = triggerEvent;
        if (triggerConfig) update.triggerConfig = triggerConfig;
        if (steps) update.steps = steps.map((s, idx) => ({ ...s, order: idx }));
        if (settings) update.settings = settings;
        if (status) update.status = status;

        const sequence = await NurtureSequence.findOneAndUpdate(
            { _id: req.params.id, user: req.user._id },
            update,
            { returnDocument: 'after' }
        );
        if (!sequence) return res.status(404).json({ success: false, error: 'Sequence not found' });
        res.json({ success: true, sequence });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// DELETE /api/nurture-sequences/:id — Delete sequence
router.delete('/:id', protect, async (req, res) => {
    try {
        const sequence = await NurtureSequence.findOneAndDelete({ _id: req.params.id, user: req.user._id });
        if (!sequence) return res.status(404).json({ success: false, error: 'Sequence not found' });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ═══════════════════════════════════════════════════════════════
//  AI NURTURE CONTENT GENERATION
// ═══════════════════════════════════════════════════════════════

// POST /api/nurture-sequences/ai/generate — AI generates a complete nurture sequence
router.post('/ai/generate', protect, async (req, res) => {
    try {
        const { funnelId, triggerStage, prompt, channels } = req.body;
        if (!funnelId || !triggerStage) {
            return res.status(400).json({ success: false, error: 'funnelId and triggerStage are required' });
        }

        const funnel = await Funnel.findOne({ _id: funnelId, user: req.user._id });
        if (!funnel) return res.status(404).json({ success: false, error: 'Funnel not found' });

        // Brand context
        let brandContext = '';
        const brand = await Brand.findById(funnel.brand);
        if (brand) {
            brandContext = `Brand: ${brand.name}
Industry: ${brand.industry || 'General'}
Tone: ${brand.voice?.tone || 'Professional'}
Description: ${brand.tagline || brand.description || ''}`;
        }

        const stageInfo = funnel.stages.find(s => s.name === triggerStage);
        const stageIdx = funnel.stages.findIndex(s => s.name === triggerStage);
        const nextStage = funnel.stages[stageIdx + 1]?.name || '';

        const channelStr = channels?.length ? channels.join(', ') : 'dm, email';

        const ai = getRouter();
        const result = await ai.generateText({
            prompt: `You are an expert marketing automation specialist. Create a multi-channel nurture sequence for leads entering the "${triggerStage}" stage of a "${funnel.name}" funnel.

${brandContext}

FUNNEL CONTEXT:
- Funnel type: ${funnel.type}
- Current stage: "${triggerStage}" (${stageInfo?.type || 'custom'}) — ${stageInfo?.description || 'No description'}
${nextStage ? `- Next stage: "${nextStage}"` : '- This is the final stage'}
- Available channels: ${channelStr}

${prompt ? `USER INSTRUCTIONS: ${prompt}` : ''}

Design a 3-6 step nurture sequence. Respond ONLY with valid JSON:
{
    "name": "Sequence name",
    "description": "What this sequence achieves",
    "steps": [
        {
            "name": "Step name",
            "channel": "dm|email|sms|whatsapp",
            "delay": { "value": 0, "unit": "hours|days|minutes" },
            "subject": "Email subject (if email)",
            "content": "Full message content. Use {{name}} for personalization.",
            "contentType": "text",
            "aiTone": "friendly|professional|urgent|educational|casual",
            "onComplete": {
                "updateScore": 5,
                "addTag": "optional tag",
                "moveToStage": "optional stage name"
            }
        }
    ]
}

Rules:
- First step should have 0 delay (send immediately on trigger)
- Space steps naturally (hours for DM, days for email)
- Use the brand's tone consistently
- Make content personalized and value-driven
- ${nextStage ? `Last step should move the lead to "${nextStage}" if appropriate` : ''}
- Use {{name}} placeholder for personalization`,
            maxTokens: 3000,
            temperature: 0.7,
        });

        let sequenceData;
        try {
            const jsonMatch = result.text.match(/\{[\s\S]*\}/);
            sequenceData = JSON.parse(jsonMatch ? jsonMatch[0] : result.text);
        } catch {
            return res.status(500).json({ success: false, error: 'AI response was not valid JSON. Please try again.' });
        }

        if (!sequenceData.steps || !Array.isArray(sequenceData.steps)) {
            return res.status(500).json({ success: false, error: 'AI did not return valid steps' });
        }

        // Create the sequence
        const sequence = await NurtureSequence.create({
            user: req.user._id,
            brand: funnel.brand,
            funnel: funnelId,
            name: sequenceData.name || `${triggerStage} AI Nurture`,
            description: sequenceData.description || '',
            triggerStage,
            triggerEvent: 'stage_enter',
            steps: sequenceData.steps.map((s, idx) => ({
                order: idx,
                name: s.name || `Step ${idx + 1}`,
                channel: s.channel || 'dm',
                delay: s.delay || { value: 0, unit: 'hours' },
                subject: s.subject || '',
                content: s.content || '',
                contentType: s.contentType || 'text',
                aiTone: s.aiTone || '',
                onComplete: s.onComplete || {},
            })),
            aiGenerated: true,
            aiPrompt: prompt || `Auto-generate nurture for ${triggerStage}`,
            status: 'draft',
        });

        res.status(201).json({ success: true, sequence });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// POST /api/nurture-sequences/ai/generate-step-content — AI generates content for a single step
router.post('/ai/generate-step-content', protect, async (req, res) => {
    try {
        const { funnelId, stageName, channel, stepName, tone, prompt } = req.body;

        let brandContext = '';
        if (funnelId) {
            const funnel = await Funnel.findOne({ _id: funnelId, user: req.user._id });
            if (funnel) {
                const brand = await Brand.findById(funnel.brand);
                if (brand) {
                    brandContext = `Brand: ${brand.name}, Industry: ${brand.industry || 'General'}, Voice: ${brand.voice?.tone || 'Professional'}`;
                }
            }
        }

        const ai = getRouter();
        const result = await ai.generateText({
            prompt: `Write a single ${channel || 'dm'} message for a nurture sequence.
${brandContext}
Stage: ${stageName || 'Unknown'}
Step: ${stepName || 'Follow-up'}
Tone: ${tone || 'friendly'}
${prompt ? `Instructions: ${prompt}` : ''}

Respond ONLY with JSON: { "subject": "subject if email", "content": "full message. Use {{name}} for the recipient's name." }`,
            maxTokens: 800,
            temperature: 0.7,
        });

        let stepContent;
        try {
            const jsonMatch = result.text.match(/\{[\s\S]*\}/);
            stepContent = JSON.parse(jsonMatch ? jsonMatch[0] : result.text);
        } catch {
            stepContent = { content: result.text, subject: '' };
        }

        res.json({ success: true, stepContent });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ═══════════════════════════════════════════════════════════════
//  SEQUENCE EXECUTION (SIMULATE / PREVIEW)
// ═══════════════════════════════════════════════════════════════

// POST /api/nurture-sequences/:id/preview — Preview what sequence will do for specific entries
router.post('/:id/preview', protect, async (req, res) => {
    try {
        const sequence = await NurtureSequence.findOne({ _id: req.params.id, user: req.user._id });
        if (!sequence) return res.status(404).json({ success: false, error: 'Sequence not found' });

        // Get active entries in the trigger stage
        const entries = await FunnelEntry.find({
            funnel: sequence.funnel,
            currentStage: sequence.triggerStage,
            status: 'active',
        }).limit(10);

        // Build preview timeline
        let cumulativeDelay = 0;
        const timeline = sequence.steps.map(step => {
            const delayMs = step.delay.value * (
                step.delay.unit === 'minutes' ? 60000 :
                step.delay.unit === 'hours' ? 3600000 :
                step.delay.unit === 'days' ? 86400000 : 0
            );
            cumulativeDelay += delayMs;

            return {
                stepName: step.name,
                channel: step.channel,
                delay: step.delay,
                cumulativeDelayHours: Math.round(cumulativeDelay / 3600000 * 10) / 10,
                contentPreview: step.content?.substring(0, 120) + (step.content?.length > 120 ? '...' : ''),
                subject: step.subject || '',
                hasCondition: !!(step.condition?.field),
                onComplete: step.onComplete,
                affectedEntries: entries.length,
            };
        });

        res.json({
            success: true,
            preview: {
                sequenceName: sequence.name,
                triggerStage: sequence.triggerStage,
                triggerEvent: sequence.triggerEvent,
                totalSteps: sequence.steps.length,
                totalDurationHours: Math.round(cumulativeDelay / 3600000 * 10) / 10,
                entriesInStage: entries.length,
                timeline,
                sampleEntries: entries.slice(0, 5).map(e => ({ name: e.name, email: e.email, score: e.score })),
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// POST /api/nurture-sequences/:id/toggle — Activate / pause sequence
router.post('/:id/toggle', protect, async (req, res) => {
    try {
        const sequence = await NurtureSequence.findOne({ _id: req.params.id, user: req.user._id });
        if (!sequence) return res.status(404).json({ success: false, error: 'Sequence not found' });

        sequence.status = sequence.status === 'active' ? 'paused' : 'active';
        await sequence.save();
        res.json({ success: true, sequence });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


export default router;

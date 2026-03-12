/**
 * Funnel Automation Routes — The Agentic Engine
 * CRUD for automation rules + Rule execution engine + AI rule generation
 */

import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import AutomationRule from '../models/AutomationRule.js';
import Funnel from '../models/Funnel.js';
import FunnelEntry from '../models/FunnelEntry.js';
import Brand from '../models/Brand.js';
import { getRouter } from '../ai/router.js';
import { safeErrorMessage } from '../utils/safeError.js';

const router = Router();


// ═══════════════════════════════════════════════════════════════
//  AUTOMATION RULES CRUD
// ═══════════════════════════════════════════════════════════════

// GET /api/funnel-automation?funnelId=xxx — List rules for a funnel
router.get('/', protect, async (req, res) => {
    try {
        const { funnelId } = req.query;
        const filter = { user: req.user._id };
        if (funnelId) filter.funnel = funnelId;

        const rules = await AutomationRule.find(filter).sort({ priority: -1, createdAt: -1 });
        res.json({ success: true, rules });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// GET /api/funnel-automation/:id — Get single rule
router.get('/:id', protect, async (req, res) => {
    try {
        const rule = await AutomationRule.findOne({ _id: req.params.id, user: req.user._id });
        if (!rule) return res.status(404).json({ success: false, error: 'Rule not found' });
        res.json({ success: true, rule });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// POST /api/funnel-automation — Create automation rule
router.post('/', protect, async (req, res) => {
    try {
        const { funnelId, name, description, trigger, conditions, actions, icon, color, priority } = req.body;
        if (!funnelId || !trigger || !actions?.length) {
            return res.status(400).json({ success: false, error: 'funnelId, trigger, and actions are required' });
        }

        const funnel = await Funnel.findOne({ _id: funnelId, user: req.user._id });
        if (!funnel) return res.status(404).json({ success: false, error: 'Funnel not found' });

        const rule = await AutomationRule.create({
            funnel: funnelId,
            user: req.user._id,
            brand: funnel.brand,
            name: name || 'New Automation',
            description: description || '',
            icon: icon || 'bolt',
            color: color || '#f59e0b',
            trigger,
            conditions: conditions || [],
            actions,
            priority: priority || 0,
            enabled: true,
        });

        res.status(201).json({ success: true, rule });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// PUT /api/funnel-automation/:id — Update rule
router.put('/:id', protect, async (req, res) => {
    try {
        const { name, description, trigger, conditions, actions, icon, color, priority, enabled } = req.body;
        const update = {};
        if (name !== undefined) update.name = name;
        if (description !== undefined) update.description = description;
        if (trigger) update.trigger = trigger;
        if (conditions) update.conditions = conditions;
        if (actions) update.actions = actions;
        if (icon) update.icon = icon;
        if (color) update.color = color;
        if (priority !== undefined) update.priority = priority;
        if (enabled !== undefined) update.enabled = enabled;

        const rule = await AutomationRule.findOneAndUpdate(
            { _id: req.params.id, user: req.user._id }, update, { returnDocument: 'after' }
        );
        if (!rule) return res.status(404).json({ success: false, error: 'Rule not found' });
        res.json({ success: true, rule });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// DELETE /api/funnel-automation/:id — Delete rule
router.delete('/:id', protect, async (req, res) => {
    try {
        const rule = await AutomationRule.findOneAndDelete({ _id: req.params.id, user: req.user._id });
        if (!rule) return res.status(404).json({ success: false, error: 'Rule not found' });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// POST /api/funnel-automation/:id/toggle — Toggle enable/disable
router.post('/:id/toggle', protect, async (req, res) => {
    try {
        const rule = await AutomationRule.findOne({ _id: req.params.id, user: req.user._id });
        if (!rule) return res.status(404).json({ success: false, error: 'Rule not found' });
        rule.enabled = !rule.enabled;
        await rule.save();
        res.json({ success: true, rule });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ═══════════════════════════════════════════════════════════════
//  RULE EXECUTION ENGINE — The Core Brain
// ═══════════════════════════════════════════════════════════════

/**
 * Evaluate whether an entry matches a rule's conditions
 */
function evaluateConditions(entry, conditions, funnel) {
    for (const cond of conditions) {
        let fieldValue;

        switch (cond.field) {
            case 'score':
                fieldValue = entry.score || 0;
                break;
            case 'stage':
                fieldValue = entry.currentStage;
                break;
            case 'source':
                fieldValue = entry.source;
                break;
            case 'status':
                fieldValue = entry.status;
                break;
            case 'daysSinceLastActivity': {
                const lastUpdate = entry.updatedAt || entry.createdAt;
                fieldValue = Math.floor((Date.now() - new Date(lastUpdate)) / 86400000);
                break;
            }
            case 'touchpointCount':
                fieldValue = entry.touchpoints?.length || 0;
                break;
            case 'hasEmail':
                fieldValue = !!entry.email;
                break;
            case 'hasPhone':
                fieldValue = !!entry.phone;
                break;
            case 'tag':
                fieldValue = entry.tags || [];
                break;
            case 'stageType': {
                const currentStage = funnel?.stages?.find(s => s.name === entry.currentStage);
                fieldValue = currentStage?.type || 'custom';
                break;
            }
            default:
                fieldValue = entry[cond.field];
        }

        const condValue = cond.value;

        switch (cond.operator) {
            case 'equals':
                if (fieldValue != condValue) return false;
                break;
            case 'not_equals':
                if (fieldValue == condValue) return false;
                break;
            case 'greater_than':
                if (typeof fieldValue !== 'number' || fieldValue <= Number(condValue)) return false;
                break;
            case 'less_than':
                if (typeof fieldValue !== 'number' || fieldValue >= Number(condValue)) return false;
                break;
            case 'contains':
                if (Array.isArray(fieldValue)) {
                    if (!fieldValue.includes(condValue)) return false;
                } else if (typeof fieldValue === 'string') {
                    if (!fieldValue.toLowerCase().includes(String(condValue).toLowerCase())) return false;
                } else return false;
                break;
            case 'not_contains':
                if (Array.isArray(fieldValue)) {
                    if (fieldValue.includes(condValue)) return false;
                } else if (typeof fieldValue === 'string') {
                    if (fieldValue.toLowerCase().includes(String(condValue).toLowerCase())) return false;
                }
                break;
            case 'exists':
                if (!fieldValue) return false;
                break;
            case 'not_exists':
                if (fieldValue) return false;
                break;
        }
    }
    return true;
}

/**
 * Execute a single action on an entry
 */
async function executeAction(action, entry, funnel) {
    const descriptions = [];

    switch (action.type) {
        case 'move_stage': {
            if (action.targetStage && action.targetStage !== entry.currentStage) {
                // Close current stage history
                const currentHistory = entry.stageHistory[entry.stageHistory.length - 1];
                if (currentHistory) currentHistory.exitedAt = new Date();

                entry.stageHistory.push({ stage: action.targetStage, enteredAt: new Date(), movedBy: 'automation' });
                entry.currentStage = action.targetStage;
                entry.touchpoints.push({ type: 'custom', details: `Auto-moved to "${action.targetStage}" by automation`, timestamp: new Date() });
                descriptions.push(`Moved to "${action.targetStage}"`);
            }
            break;
        }
        case 'change_status': {
            if (action.targetStatus && action.targetStatus !== entry.status) {
                entry.status = action.targetStatus;
                if (action.targetStatus === 'converted') entry.convertedAt = new Date();
                entry.touchpoints.push({ type: 'custom', details: `Status changed to "${action.targetStatus}" by automation`, timestamp: new Date() });
                descriptions.push(`Status → "${action.targetStatus}"`);
            }
            break;
        }
        case 'update_score': {
            const change = action.scoreChange || 0;
            const oldScore = entry.score;
            entry.score = Math.max(0, Math.min(100, entry.score + change));
            descriptions.push(`Score ${change >= 0 ? '+' : ''}${change} (${oldScore} → ${entry.score})`);
            break;
        }
        case 'add_tag': {
            if (action.tagName && !entry.tags.includes(action.tagName)) {
                entry.tags.push(action.tagName);
                descriptions.push(`Added tag "${action.tagName}"`);
            }
            break;
        }
        case 'remove_tag': {
            if (action.tagName) {
                entry.tags = entry.tags.filter(t => t !== action.tagName);
                descriptions.push(`Removed tag "${action.tagName}"`);
            }
            break;
        }
        case 'add_touchpoint': {
            entry.touchpoints.push({
                type: action.touchpointType || 'custom',
                details: action.touchpointDetails || 'Automation touchpoint',
                timestamp: new Date(),
            });
            descriptions.push(`Added touchpoint: ${action.touchpointDetails || 'automation'}`);
            break;
        }
        case 'send_notification': {
            // For now, log it as a touchpoint. Future: email/push notification
            entry.touchpoints.push({
                type: 'custom',
                details: `🔔 ${action.notificationMessage || 'Automation notification'}`,
                timestamp: new Date(),
            });
            descriptions.push(`Notification: ${action.notificationMessage || 'sent'}`);
            break;
        }
        // start_nurture, trigger_studio, assign_team — logged but not fully connected yet
        case 'start_nurture': {
            descriptions.push(`Nurture sequence triggered`);
            entry.touchpoints.push({ type: 'custom', details: 'Nurture sequence auto-triggered', timestamp: new Date() });
            break;
        }
        case 'trigger_studio': {
            descriptions.push(`Studio trigger: ${action.studioName} → ${action.studioAction}`);
            entry.touchpoints.push({ type: 'custom', details: `Cross-studio: ${action.studioName} → ${action.studioAction}`, timestamp: new Date(), studioRef: action.studioName });
            break;
        }
        default:
            descriptions.push(`Unknown action: ${action.type}`);
    }

    return descriptions;
}


/**
 * Run all matching rules for a specific trigger event on entries
 * This is the main engine function called by hooks
 */
export async function runAutomationRules(funnelId, triggerType, context = {}) {
    try {
        // Fetch enabled rules matching this trigger
        const rules = await AutomationRule.find({
            funnel: funnelId,
            enabled: true,
            'trigger.type': triggerType,
        }).sort({ priority: -1 });

        if (rules.length === 0) return { executed: 0, results: [] };

        const funnel = await Funnel.findById(funnelId);
        if (!funnel) return { executed: 0, results: [] };

        // Determine target entries
        let entries = [];
        if (context.entryId) {
            const entry = await FunnelEntry.findById(context.entryId);
            if (entry) entries = [entry];
        } else if (context.entries) {
            entries = context.entries;
        } else {
            // For inactivity rules, check all active entries
            entries = await FunnelEntry.find({ funnel: funnelId, status: 'active' }).limit(500);
        }

        const results = [];

        for (const rule of rules) {
            // Additional trigger-specific checks
            if (triggerType === 'stage_changed') {
                if (rule.trigger.toStage && rule.trigger.toStage !== context.toStage) continue;
                if (rule.trigger.fromStage && rule.trigger.fromStage !== context.fromStage) continue;
            }
            if (triggerType === 'score_threshold') {
                if (rule.trigger.scoreDirection === 'above' && (context.newScore || 0) < (rule.trigger.scoreThreshold || 0)) continue;
                if (rule.trigger.scoreDirection === 'below' && (context.newScore || 0) > (rule.trigger.scoreThreshold || 0)) continue;
            }
            if (triggerType === 'inactivity') {
                // Filter entries by inactivity threshold
                const threshold = rule.trigger.inactivityDays || 7;
                entries = entries.filter(e => {
                    const daysSince = Math.floor((Date.now() - new Date(e.updatedAt || e.createdAt)) / 86400000);
                    return daysSince >= threshold;
                });
            }

            for (const entry of entries) {
                // Evaluate conditions
                if (!evaluateConditions(entry, rule.conditions, funnel)) continue;

                // Execute all actions
                const allDescriptions = [];
                for (const action of rule.actions) {
                    const descs = await executeAction(action, entry, funnel);
                    allDescriptions.push(...descs);
                }

                if (allDescriptions.length > 0) {
                    await entry.save();

                    // Log execution
                    rule.executionCount += 1;
                    rule.lastExecutedAt = new Date();

                    // Keep last 20 executions
                    rule.recentExecutions = [
                        { entryId: entry._id, entryName: entry.name, actionsExecuted: allDescriptions, executedAt: new Date() },
                        ...(rule.recentExecutions || []),
                    ].slice(0, 20);

                    results.push({
                        ruleId: rule._id,
                        ruleName: rule.name,
                        entryId: entry._id,
                        entryName: entry.name,
                        actions: allDescriptions,
                    });
                }
            }

            await rule.save();
        }

        return { executed: results.length, results };
    } catch (error) {
        console.error('[Automation Engine]', error.message);
        return { executed: 0, results: [], error: error.message };
    }
}


// ═══════════════════════════════════════════════════════════════
//  MANUAL TRIGGER — Run rules on demand
// ═══════════════════════════════════════════════════════════════

// POST /api/funnel-automation/run — Execute all rules for a funnel
router.post('/run', protect, async (req, res) => {
    try {
        const { funnelId, triggerType } = req.body;
        if (!funnelId) return res.status(400).json({ success: false, error: 'funnelId required' });

        const funnel = await Funnel.findOne({ _id: funnelId, user: req.user._id });
        if (!funnel) return res.status(404).json({ success: false, error: 'Funnel not found' });

        // Run all enabled rules
        const entries = await FunnelEntry.find({ funnel: funnelId, status: 'active' }).limit(500);
        const results = await runAutomationRules(funnelId, triggerType || 'manual', { entries });

        res.json({ success: true, ...results });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// POST /api/funnel-automation/run-inactivity — Run inactivity-based rules
router.post('/run-inactivity', protect, async (req, res) => {
    try {
        const { funnelId } = req.body;
        if (!funnelId) return res.status(400).json({ success: false, error: 'funnelId required' });

        const funnel = await Funnel.findOne({ _id: funnelId, user: req.user._id });
        if (!funnel) return res.status(404).json({ success: false, error: 'Funnel not found' });

        const results = await runAutomationRules(funnelId, 'inactivity', {});
        res.json({ success: true, ...results });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ═══════════════════════════════════════════════════════════════
//  AI RULE GENERATION — AI creates automation rules
// ═══════════════════════════════════════════════════════════════

router.post('/ai/generate', protect, async (req, res) => {
    try {
        const { funnelId, prompt } = req.body;
        if (!funnelId) return res.status(400).json({ success: false, error: 'funnelId required' });

        const funnel = await Funnel.findOne({ _id: funnelId, user: req.user._id });
        if (!funnel) return res.status(404).json({ success: false, error: 'Funnel not found' });

        let brandContext = '';
        const brand = await Brand.findById(funnel.brand);
        if (brand) {
            brandContext = `Brand: ${brand.name}, Industry: ${brand.industry || 'General'}`;
        }

        // Get existing entries summary
        const [totalEntries, activeEntries] = await Promise.all([
            FunnelEntry.countDocuments({ funnel: funnelId }),
            FunnelEntry.countDocuments({ funnel: funnelId, status: 'active' }),
        ]);

        const ai = getRouter();
        const result = await ai.generateText({
            prompt: `You are a sales funnel automation expert. Create automation rules for this funnel.

${brandContext}

FUNNEL: "${funnel.name}" (${funnel.type})
STAGES: ${funnel.stages.map(s => `"${s.name}" (${s.type})`).join(' → ')}
ENTRIES: ${totalEntries} total, ${activeEntries} active

${prompt ? `USER REQUEST: ${prompt}` : 'Generate 3-5 smart automation rules that will make this funnel self-running.'}

AVAILABLE TRIGGERS: entry_created, stage_changed, score_changed, status_changed, inactivity, score_threshold
AVAILABLE CONDITIONS fields: score, stage, source, status, daysSinceLastActivity, touchpointCount, hasEmail, hasPhone, tag
AVAILABLE ACTIONS: move_stage, change_status, update_score, add_tag, remove_tag, start_nurture, send_notification, add_touchpoint

Respond ONLY with a valid JSON array of rules:
[
    {
        "name": "Rule name",
        "description": "What this rule does",
        "icon": "material icon name",
        "color": "#hex",
        "trigger": { "type": "trigger_type", ...triggerConfig },
        "conditions": [{ "field": "...", "operator": "...", "value": ... }],
        "actions": [{ "type": "action_type", ...actionConfig }]
    }
]

RULES MUST USE actual stage names from the funnel. Be specific and actionable. Use varied trigger types.`,
            maxTokens: 2500,
            temperature: 0.7,
        });

        let rulesData;
        try {
            const jsonMatch = result.text.match(/\[[\s\S]*\]/);
            rulesData = JSON.parse(jsonMatch ? jsonMatch[0] : result.text);
        } catch {
            return res.status(500).json({ success: false, error: 'AI response was not valid JSON. Try again.' });
        }

        // Create all rules
        const createdRules = [];
        for (const rd of rulesData) {
            const rule = await AutomationRule.create({
                funnel: funnelId,
                user: req.user._id,
                brand: funnel.brand,
                name: rd.name || 'AI Rule',
                description: rd.description || '',
                icon: rd.icon || 'auto_awesome',
                color: rd.color || '#f59e0b',
                trigger: rd.trigger,
                conditions: rd.conditions || [],
                actions: rd.actions || [],
                enabled: true,
                aiGenerated: true,
                aiPrompt: prompt || 'Auto-generated',
            });
            createdRules.push(rule);
        }

        res.status(201).json({ success: true, rules: createdRules, count: createdRules.length });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ═══════════════════════════════════════════════════════════════
//  AI-SUGGESTED ACTIONS EXECUTION
// ═══════════════════════════════════════════════════════════════

// POST /api/funnel-automation/execute-suggestion — Execute an AI suggestion
router.post('/execute-suggestion', protect, async (req, res) => {
    try {
        const { funnelId, action } = req.body;
        // action: { type, targetStage, entryIds, scoreChange, tagName, etc. }
        if (!funnelId || !action) return res.status(400).json({ success: false, error: 'funnelId and action required' });

        const funnel = await Funnel.findOne({ _id: funnelId, user: req.user._id });
        if (!funnel) return res.status(404).json({ success: false, error: 'Funnel not found' });

        let affected = 0;

        // Determine target entries
        let entries;
        if (action.entryIds?.length) {
            entries = await FunnelEntry.find({ _id: { $in: action.entryIds }, funnel: funnelId });
        } else if (action.stageName) {
            entries = await FunnelEntry.find({ funnel: funnelId, currentStage: action.stageName, status: 'active' });
        } else if (action.scoreAbove !== undefined) {
            entries = await FunnelEntry.find({ funnel: funnelId, score: { $gte: action.scoreAbove }, status: 'active' });
        } else if (action.scoreBelow !== undefined) {
            entries = await FunnelEntry.find({ funnel: funnelId, score: { $lte: action.scoreBelow }, status: 'active' });
        } else {
            entries = await FunnelEntry.find({ funnel: funnelId, status: 'active' });
        }

        for (const entry of entries) {
            const descs = await executeAction(action, entry, funnel);
            if (descs.length > 0) {
                await entry.save();
                affected++;
            }
        }

        res.json({ success: true, affected, message: `Action executed on ${affected} entries` });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ═══════════════════════════════════════════════════════════════
//  REAL-TIME SCORING ENDPOINT
// ═══════════════════════════════════════════════════════════════

// POST /api/funnel-automation/score-entry — Score a single entry and run score-based rules
router.post('/score-entry', protect, async (req, res) => {
    try {
        const { entryId } = req.body;
        const entry = await FunnelEntry.findOne({ _id: entryId, user: req.user._id });
        if (!entry) return res.status(404).json({ success: false, error: 'Entry not found' });

        const funnel = await Funnel.findById(entry.funnel);
        if (!funnel) return res.status(404).json({ success: false, error: 'Funnel not found' });

        const oldScore = entry.score;
        let score = 0;

        // Touchpoint volume
        const tp = entry.touchpoints?.length || 0;
        if (tp >= 5) score += 15;
        else if (tp >= 3) score += 8;
        else if (tp >= 1) score += 3;

        // Stage progression
        const stages = entry.stageHistory?.length || 0;
        if (stages >= 3) score += 20;
        else if (stages >= 2) score += 10;

        // Recency
        const daysSince = Math.floor((Date.now() - new Date(entry.updatedAt || entry.createdAt)) / 86400000);
        if (daysSince <= 1) score += 15;
        else if (daysSince <= 3) score += 10;
        else if (daysSince <= 7) score += 5;
        else if (daysSince > 14) score -= 10;

        // Source quality
        if (['referral', 'dm'].includes(entry.source)) score += 10;
        else if (['seo', 'social'].includes(entry.source)) score += 5;

        // Contact completeness
        if (entry.email) score += 5;
        if (entry.phone) score += 5;

        // Stage type bonus
        const currentStage = funnel.stages.find(s => s.name === entry.currentStage);
        const bonuses = { decision: 25, consideration: 15, interest: 10, retention: 20 };
        if (currentStage && bonuses[currentStage.type]) score += bonuses[currentStage.type];

        entry.score = Math.max(0, Math.min(100, score));
        await entry.save();

        // Run score-based automation rules
        if (entry.score !== oldScore) {
            await runAutomationRules(entry.funnel, 'score_changed', { entryId: entry._id, newScore: entry.score, oldScore });
            // Check threshold rules
            await runAutomationRules(entry.funnel, 'score_threshold', { entryId: entry._id, newScore: entry.score });
        }

        res.json({ success: true, oldScore, newScore: entry.score, entryId: entry._id });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ═══════════════════════════════════════════════════════════════
//  #7 SCORE DECAY CRON — Run inactivity-based scoring decay
// ═══════════════════════════════════════════════════════════════

router.post('/score-decay', protect, async (req, res) => {
    try {
        const { funnelId } = req.body;
        if (!funnelId) return res.status(400).json({ success: false, error: 'funnelId required' });

        const funnel = await Funnel.findOne({ _id: funnelId, user: req.user._id });
        if (!funnel) return res.status(404).json({ success: false, error: 'Funnel not found' });

        const entries = await FunnelEntry.find({ funnel: funnelId, status: 'active' });
        let decayed = 0;

        for (const entry of entries) {
            const daysSince = Math.floor((Date.now() - new Date(entry.updatedAt || entry.createdAt)) / 86400000);
            let decay = 0;

            if (daysSince > 30) decay = -15;
            else if (daysSince > 14) decay = -10;
            else if (daysSince > 7) decay = -5;
            else if (daysSince > 3) decay = -2;

            if (decay < 0) {
                const oldScore = entry.score;
                entry.score = Math.max(0, entry.score + decay);
                if (entry.score !== oldScore) {
                    entry.touchpoints.push({ type: 'custom', details: `Score decay: ${decay} (inactive ${daysSince}d)`, timestamp: new Date() });
                    await entry.save();
                    decayed++;
                }
            }
        }

        // Also run inactivity automation rules
        await runAutomationRules(funnelId, 'inactivity', {});

        res.json({ success: true, decayed, total: entries.length });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ═══════════════════════════════════════════════════════════════
//  #9 PREDICTIVE SCORING — ML-style scoring from conversion history
// ═══════════════════════════════════════════════════════════════

router.post('/predictive-score', protect, async (req, res) => {
    try {
        const { funnelId } = req.body;
        if (!funnelId) return res.status(400).json({ success: false, error: 'funnelId required' });

        const funnel = await Funnel.findOne({ _id: funnelId, user: req.user._id });
        if (!funnel) return res.status(404).json({ success: false, error: 'Funnel not found' });

        // Get historical conversion patterns
        const convertedEntries = await FunnelEntry.find({ funnel: funnelId, status: 'converted' }).limit(200);
        const activeEntries = await FunnelEntry.find({ funnel: funnelId, status: 'active' }).limit(500);

        if (convertedEntries.length === 0) {
            return res.json({ success: true, message: 'No converted entries yet — need conversion data for predictions', scored: 0 });
        }

        // Build patterns from converted entries
        const patterns = {
            avgTouchpoints: 0, avgStages: 0, avgDaysToConvert: 0,
            topSources: {}, avgScoreAtConversion: 0,
            hadEmail: 0, hadPhone: 0, hadCompany: 0,
        };

        for (const e of convertedEntries) {
            patterns.avgTouchpoints += (e.touchpoints?.length || 0);
            patterns.avgStages += (e.stageHistory?.length || 0);
            if (e.convertedAt && e.createdAt) {
                patterns.avgDaysToConvert += Math.floor((new Date(e.convertedAt) - new Date(e.createdAt)) / 86400000);
            }
            patterns.topSources[e.source] = (patterns.topSources[e.source] || 0) + 1;
            patterns.avgScoreAtConversion += (e.score || 0);
            if (e.email) patterns.hadEmail++;
            if (e.phone) patterns.hadPhone++;
            if (e.company) patterns.hadCompany++;
        }

        const n = convertedEntries.length;
        patterns.avgTouchpoints /= n;
        patterns.avgStages /= n;
        patterns.avgDaysToConvert /= n;
        patterns.avgScoreAtConversion /= n;
        patterns.emailRate = patterns.hadEmail / n;
        patterns.phoneRate = patterns.hadPhone / n;
        patterns.companyRate = patterns.hadCompany / n;

        // Find best source
        const bestSource = Object.entries(patterns.topSources).sort((a, b) => b[1] - a[1])[0];

        // Score active entries based on similarity to conversion patterns
        let scored = 0;
        for (const entry of activeEntries) {
            let predictiveScore = 0;

            // Touchpoint similarity (0-20)
            const tpRatio = Math.min((entry.touchpoints?.length || 0) / Math.max(patterns.avgTouchpoints, 1), 2);
            predictiveScore += Math.round(tpRatio * 10);

            // Stage progression similarity (0-20)
            const stageRatio = Math.min((entry.stageHistory?.length || 0) / Math.max(patterns.avgStages, 1), 2);
            predictiveScore += Math.round(stageRatio * 10);

            // Source match (0-15)
            if (bestSource && entry.source === bestSource[0]) predictiveScore += 15;
            else if (patterns.topSources[entry.source]) predictiveScore += 8;

            // Contact completeness match (0-15)
            if (entry.email && patterns.emailRate > 0.7) predictiveScore += 5;
            if (entry.phone && patterns.phoneRate > 0.5) predictiveScore += 5;
            if (entry.company && patterns.companyRate > 0.5) predictiveScore += 5;

            // Velocity — is lead progressing at similar speed? (0-15)
            const daysActive = Math.floor((Date.now() - new Date(entry.createdAt)) / 86400000);
            if (daysActive > 0 && patterns.avgDaysToConvert > 0) {
                const velocityRatio = daysActive / patterns.avgDaysToConvert;
                if (velocityRatio < 0.5) predictiveScore += 15; // Faster than avg
                else if (velocityRatio < 1) predictiveScore += 10;
                else if (velocityRatio < 1.5) predictiveScore += 5;
                // Slower = 0 bonus
            }

            // Recency (0-15)
            const daysSince = Math.floor((Date.now() - new Date(entry.updatedAt || entry.createdAt)) / 86400000);
            if (daysSince <= 1) predictiveScore += 15;
            else if (daysSince <= 3) predictiveScore += 10;
            else if (daysSince <= 7) predictiveScore += 5;

            entry.score = Math.max(0, Math.min(100, predictiveScore));
            entry.touchpoints.push({ type: 'custom', details: `Predictive score: ${predictiveScore} (based on ${n} converted leads)`, timestamp: new Date() });
            await entry.save();
            scored++;
        }

        res.json({
            success: true,
            scored,
            patterns: {
                convertedCount: n,
                avgTouchpoints: Math.round(patterns.avgTouchpoints * 10) / 10,
                avgStages: Math.round(patterns.avgStages * 10) / 10,
                avgDaysToConvert: Math.round(patterns.avgDaysToConvert),
                bestSource: bestSource?.[0],
                emailRate: Math.round(patterns.emailRate * 100),
                phoneRate: Math.round(patterns.phoneRate * 100),
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ═══════════════════════════════════════════════════════════════
//  #10 PIPELINE REVENUE FORECAST
// ═══════════════════════════════════════════════════════════════

router.get('/revenue-forecast', protect, async (req, res) => {
    try {
        const { funnelId } = req.query;
        if (!funnelId) return res.status(400).json({ success: false, error: 'funnelId required' });

        const funnel = await Funnel.findOne({ _id: funnelId, user: req.user._id });
        if (!funnel) return res.status(404).json({ success: false, error: 'Funnel not found' });

        const entries = await FunnelEntry.find({ funnel: funnelId });
        const stages = funnel.stages || [];

        // Historical conversion rate
        const converted = entries.filter(e => e.status === 'converted');
        const lost = entries.filter(e => e.status === 'lost');
        const active = entries.filter(e => e.status === 'active');
        const conversionRate = entries.length > 0 ? (converted.length / entries.length) : 0;

        // Revenue from converted
        const actualRevenue = converted.reduce((s, e) => s + (e.dealValue || 0), 0);
        const avgDealValue = converted.length > 0 ? actualRevenue / converted.length : 0;

        // Stage-by-stage forecast
        const stageConversionRates = {};
        const stageForecasts = stages.map((stage, idx) => {
            const stageEntries = active.filter(e => e.currentStage === stage.name);
            // Probability increases with each stage
            const stageProbability = stages.length > 1 ? ((idx + 1) / stages.length) : 0.5;
            const weightedRevenue = stageEntries.reduce((s, e) => {
                const dv = e.dealValue || avgDealValue;
                return s + (dv * stageProbability);
            }, 0);

            stageConversionRates[stage.name] = stageProbability;

            return {
                stage: stage.name,
                color: stage.color,
                activeEntries: stageEntries.length,
                probability: Math.round(stageProbability * 100),
                weightedRevenue: Math.round(weightedRevenue),
                potentialRevenue: stageEntries.reduce((s, e) => s + (e.dealValue || avgDealValue), 0),
            };
        });

        // Average conversion time
        let avgConversionDays = 0;
        if (converted.length > 0) {
            const totalDays = converted.reduce((s, e) => {
                return s + (e.convertedAt && e.createdAt ? Math.max(1, Math.floor((new Date(e.convertedAt) - new Date(e.createdAt)) / 86400000)) : 30);
            }, 0);
            avgConversionDays = Math.round(totalDays / converted.length);
        }

        const totalWeightedRevenue = stageForecasts.reduce((s, f) => s + f.weightedRevenue, 0);
        const totalPotentialRevenue = stageForecasts.reduce((s, f) => s + f.potentialRevenue, 0);

        res.json({
            success: true,
            forecast: {
                totalEntries: entries.length,
                activeEntries: active.length,
                convertedEntries: converted.length,
                lostEntries: lost.length,
                conversionRate: Math.round(conversionRate * 100),
                actualRevenue: Math.round(actualRevenue),
                avgDealValue: Math.round(avgDealValue),
                avgConversionDays,
                totalWeightedRevenue: Math.round(totalWeightedRevenue),
                totalPotentialRevenue: Math.round(totalPotentialRevenue),
                stages: stageForecasts,
                // 30-day projection
                projected30Day: Math.round(totalWeightedRevenue * (30 / Math.max(avgConversionDays, 1))),
                // 90-day projection
                projected90Day: Math.round(totalWeightedRevenue * (90 / Math.max(avgConversionDays, 1))),
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ═══════════════════════════════════════════════════════════════
//  #12 REAL-TIME ACTIVITY FEED
// ═══════════════════════════════════════════════════════════════

router.get('/activity-feed', protect, async (req, res) => {
    try {
        const { funnelId } = req.query;
        if (!funnelId) return res.status(400).json({ success: false, error: 'funnelId required' });

        // Get all rules with recent executions
        const rules = await AutomationRule.find({ funnel: funnelId, user: req.user._id });

        // Flatten all executions into a single feed
        const feed = [];
        for (const rule of rules) {
            for (const exec of (rule.recentExecutions || [])) {
                feed.push({
                    ruleId: rule._id,
                    ruleName: rule.name,
                    ruleIcon: rule.icon,
                    ruleColor: rule.color,
                    entryId: exec.entryId,
                    entryName: exec.entryName,
                    actions: exec.actionsExecuted,
                    executedAt: exec.executedAt,
                    triggerType: rule.trigger?.type,
                });
            }
        }

        // Also get recent touchpoints from entries for non-automation events
        const recentEntries = await FunnelEntry.find({ funnel: funnelId }).sort({ updatedAt: -1 }).limit(30);
        for (const entry of recentEntries) {
            const recent = (entry.touchpoints || []).slice(-3);
            for (const tp of recent) {
                if (!tp.details?.includes('automation')) {
                    feed.push({
                        type: 'touchpoint',
                        entryId: entry._id,
                        entryName: entry.name,
                        action: tp.details,
                        touchpointType: tp.type,
                        executedAt: tp.timestamp,
                    });
                }
            }
        }

        // Sort by time, limit to 50
        feed.sort((a, b) => new Date(b.executedAt) - new Date(a.executedAt));
        res.json({ success: true, feed: feed.slice(0, 50) });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


export default router;

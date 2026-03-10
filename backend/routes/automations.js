/**
 * Automation Routes
 * CRUD for conversation automations, recipe creation, and flow management.
 */

import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import Automation from '../models/Automation.js';
import { RECIPE_TEMPLATES, startAutomation, findMatchingAutomation } from '../services/automationEngine.js';
import { safeErrorMessage } from '../utils/safeError.js';

const router = Router();

// ── GET /api/automations/recipes — List available recipe templates ──

router.get('/recipes', protect, (req, res) => {
    const recipes = Object.entries(RECIPE_TEMPLATES).map(([id, template]) => ({
        id,
        name: template.name,
        description: template.description,
        icon: template.icon,
        color: template.color,
        triggerCount: template.triggers.length,
        nodeCount: template.nodes.length,
    }));
    res.json({ success: true, recipes });
});


// ── POST /api/automations/from-recipe — Create automation from recipe ──

router.post('/from-recipe', protect, async (req, res) => {
    try {
        const { brandId, recipeId, name } = req.body;

        if (!brandId || !recipeId) {
            return res.status(400).json({ success: false, error: 'brandId and recipeId are required' });
        }

        const template = RECIPE_TEMPLATES[recipeId];
        if (!template) {
            return res.status(400).json({ success: false, error: `Unknown recipe: ${recipeId}` });
        }

        const automation = await Automation.create({
            user: req.user._id,
            brand: brandId,
            name: name || template.name,
            description: template.description,
            icon: template.icon,
            color: template.color,
            recipe: recipeId,
            triggers: template.triggers,
            nodes: template.nodes,
            startNodeId: template.startNodeId,
            status: 'draft',
            isActive: false,
        });

        res.json({ success: true, automation });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ── GET /api/automations — List automations for a brand ──

// ── POST /api/automations — Create custom automation from scratch ──

router.post('/', protect, async (req, res) => {
    try {
        const { brandId, name, description, triggers, nodes, icon, color } = req.body;

        if (!brandId || !name) {
            return res.status(400).json({ success: false, error: 'brandId and name are required' });
        }

        // Default to a single "send_message" node if none provided
        const defaultNodes = [{
            nodeId: 'start',
            type: 'send_message',
            label: 'Welcome Message',
            config: { messageText: 'Hey! 👋 Thanks for reaching out!' },
            nextNodeId: 'end',
            position: { x: 250, y: 100 },
        }, {
            nodeId: 'end',
            type: 'end',
            label: 'End',
            config: {},
            nextNodeId: '',
            position: { x: 250, y: 250 },
        }];

        const automation = await Automation.create({
            user: req.user._id,
            brand: brandId,
            name,
            description: description || '',
            icon: icon || 'bolt',
            color: color || '#6366f1',
            recipe: 'custom',
            triggers: triggers || [{ type: 'dm_received' }],
            nodes: nodes || defaultNodes,
            startNodeId: 'start',
            status: 'draft',
            isActive: false,
        });

        res.json({ success: true, automation });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ── GET /api/automations — List automations for a brand ──

router.get('/', protect, async (req, res) => {
    try {
        const { brandId, status, recipe } = req.query;
        const filter = { user: req.user._id };
        if (brandId) filter.brand = brandId;
        if (status) filter.status = status;
        if (recipe) filter.recipe = recipe;

        const automations = await Automation.find(filter)
            .sort({ updatedAt: -1 })
            .select('-nodes'); // Don't send nodes in list view

        res.json({ success: true, automations });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ── GET /api/automations/stats/overview — Automation stats ──
// NOTE: Must be before /:id to prevent Express matching "stats" as an ID

router.get('/stats/overview', protect, async (req, res) => {
    try {
        const { brandId } = req.query;
        const filter = { user: req.user._id };
        if (brandId) filter.brand = brandId;

        const automations = await Automation.find(filter);
        const totals = {
            total: automations.length,
            active: automations.filter(a => a.isActive).length,
            totalRuns: automations.reduce((s, a) => s + (a.stats?.totalRuns || 0), 0),
            completedRuns: automations.reduce((s, a) => s + (a.stats?.completedRuns || 0), 0),
            leadsCollected: automations.reduce((s, a) => s + (a.stats?.leadsCollected || 0), 0),
        };

        res.json({ success: true, stats: totals });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ── GET /api/automations/:id — Get automation with full flow ──

router.get('/:id', protect, async (req, res) => {
    try {
        const automation = await Automation.findOne({ _id: req.params.id, user: req.user._id });
        if (!automation) return res.status(404).json({ success: false, error: 'Not found' });
        res.json({ success: true, automation });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ── PUT /api/automations/:id — Update automation (name, triggers, nodes) ──

router.put('/:id', protect, async (req, res) => {
    try {
        const { name, description, triggers, nodes, startNodeId, language, isActive, status } = req.body;
        const update = {};
        if (name !== undefined) update.name = name;
        if (description !== undefined) update.description = description;
        if (triggers) update.triggers = triggers;
        if (nodes) update.nodes = nodes;
        if (startNodeId !== undefined) update.startNodeId = startNodeId;
        if (language !== undefined) update.language = language;
        if (isActive !== undefined) update.isActive = isActive;
        if (status !== undefined) update.status = status;

        const automation = await Automation.findOneAndUpdate(
            { _id: req.params.id, user: req.user._id },
            update,
            { new: true }
        );
        if (!automation) return res.status(404).json({ success: false, error: 'Not found' });
        res.json({ success: true, automation });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ── POST /api/automations/:id/toggle — Activate/deactivate ──

router.post('/:id/toggle', protect, async (req, res) => {
    try {
        const automation = await Automation.findOne({ _id: req.params.id, user: req.user._id });
        if (!automation) return res.status(404).json({ success: false, error: 'Not found' });

        automation.isActive = !automation.isActive;
        automation.status = automation.isActive ? 'active' : 'paused';
        await automation.save();

        res.json({ success: true, isActive: automation.isActive, status: automation.status });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ── DELETE /api/automations/:id ──

router.delete('/:id', protect, async (req, res) => {
    try {
        const automation = await Automation.findOneAndDelete({ _id: req.params.id, user: req.user._id });
        if (!automation) return res.status(404).json({ success: false, error: 'Not found' });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


export default router;

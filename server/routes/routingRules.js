/**
 * Routing Rules API Routes
 * CRUD for per-brand smart routing rules
 */

import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { getRules, setRules, addRule, updateRule, deleteRule } from '../services/routingEngine.js';

const router = Router();

// ── GET /api/routing-rules — List rules for brand ──

router.get('/', protect, (req, res) => {
    try {
        const brandId = req.query.brandId || req.query.brand;
        if (!brandId) return res.status(400).json({ success: false, error: 'brandId query required' });

        const rules = getRules(brandId);
        res.json({ success: true, rules, count: rules.length });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ── POST /api/routing-rules — Create a new rule ──

router.post('/', protect, (req, res) => {
    try {
        const { brandId, name, priority, enabled = true, conditions, action, actionConfig } = req.body;
        if (!brandId || !name || !action) {
            return res.status(400).json({ success: false, error: 'brandId, name, and action are required' });
        }

        const rule = addRule(brandId, { name, priority, enabled, conditions, action, actionConfig });
        res.status(201).json({ success: true, rule });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ── PUT /api/routing-rules/:id — Update a rule ──

router.put('/:id', protect, (req, res) => {
    try {
        const { brandId, ...updates } = req.body;
        if (!brandId) return res.status(400).json({ success: false, error: 'brandId required' });

        const rule = updateRule(brandId, req.params.id, updates);
        if (!rule) return res.status(404).json({ success: false, error: 'Rule not found' });

        res.json({ success: true, rule });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ── DELETE /api/routing-rules/:id — Delete a rule ──

router.delete('/:id', protect, (req, res) => {
    try {
        const brandId = req.query.brandId || req.body.brandId;
        if (!brandId) return res.status(400).json({ success: false, error: 'brandId required' });

        const deleted = deleteRule(brandId, req.params.id);
        if (!deleted) return res.status(404).json({ success: false, error: 'Rule not found' });

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ── POST /api/routing-rules/reorder — Reorder rules ──

router.post('/reorder', protect, (req, res) => {
    try {
        const { brandId, rules } = req.body;
        if (!brandId || !Array.isArray(rules)) {
            return res.status(400).json({ success: false, error: 'brandId and rules array required' });
        }

        const updated = setRules(brandId, rules);
        res.json({ success: true, rules: updated });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ── POST /api/routing-rules/test — Test AI intent on a sample message ──

router.post('/test', protect, async (req, res) => {
    try {
        const { message, brandId } = req.body;
        if (!message) return res.status(400).json({ success: false, error: 'message required' });

        const { detectIntentAI, generateAIReplies, detectLanguage } = await import('../services/conversationEngine.js');
        const Brand = (await import('../models/Brand.js')).default;

        let brand = null;
        if (brandId) {
            try { brand = await Brand.findById(brandId); } catch { }
        }

        const intent = await detectIntentAI(message, [], brand);
        const language = detectLanguage(message);

        // Generate sample replies
        const mockConversation = {
            messages: [{ role: 'contact', content: message }],
            intent: intent.intent,
            intentConfidence: intent.confidence,
        };
        const replies = await generateAIReplies(mockConversation, brand);

        // Evaluate which rules would match
        const rules = getRules(brandId);
        const matchingRules = rules.filter(r => {
            if (!r.enabled) return false;
            if (r.conditions.intent && r.conditions.intent !== intent.intent) return false;
            if (r.conditions.intents && !r.conditions.intents.includes(intent.intent)) return false;
            if (r.conditions.minConfidence && intent.confidence < r.conditions.minConfidence) return false;
            if (r.conditions.sentiment && intent.sentiment !== r.conditions.sentiment) return false;
            return true;
        });

        res.json({
            success: true,
            intent,
            language,
            replies,
            matchingRules: matchingRules.map(r => ({ name: r.name, action: r.action })),
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});


export default router;

/**
 * Master Orchestrator — API Routes
 * 
 * Smart command routing + campaign chaining.
 * Endpoints:
 *   POST /api/orchestrate — Route any command to the right studio
 *   POST /api/orchestrate/campaign — Plan a full campaign
 */

import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { routeCommand, planCampaign } from '../agents/masterOrchestrator.js';
import { safeErrorMessage } from '../utils/safeError.js';

const router = Router();

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/orchestrate — Smart command routing
// ══════════════════════════════════════════════════════════════════════════════
router.post('/', protect, async (req, res) => {
    try {
        const { command, brandId } = req.body;
        if (!command) return res.status(400).json({ success: false, error: 'command is required' });

        const routing = await routeCommand(command, brandId);

        // Build redirect URL based on intent
        const studioRoutes = {
            content: '/content-studio',
            creative: '/creative-studio',
            video: '/video-studio',
            brainstorm: '/brainstorm',
            campaign: null, // Shows campaign plan instead
        };

        res.json({
            success: true,
            routing: {
                intent: routing.intent,
                confidence: routing.confidence,
                subIntent: routing.subIntent,
                brief: routing.brief,
                platform: routing.platform,
                suggestedSteps: routing.suggestedSteps,
                redirectTo: studioRoutes[routing.intent] || '/dashboard',
                clarifyingQuestion: routing.clarifyingQuestion,
                campaignPlan: routing.campaignPlan || null,
            },
        });
    } catch (error) {
        console.error('Orchestrate error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/orchestrate/campaign — Plan a full cross-studio campaign
// ══════════════════════════════════════════════════════════════════════════════
router.post('/campaign', protect, async (req, res) => {
    try {
        const { command, brandId } = req.body;
        if (!command) return res.status(400).json({ success: false, error: 'command is required' });

        const plan = await planCampaign(command, brandId);

        res.json({
            success: true,
            campaign: plan,
        });
    } catch (error) {
        console.error('Campaign plan error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

export default router;

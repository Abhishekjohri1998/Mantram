import { Router } from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { getDataForSEOProviderStatus } from '../utils/dataforseo.js';
import { safeErrorMessage } from '../utils/safeError.js';
import config from '../config/env.js';

const router = Router();

/**
 * GET /api/admin/provider-status
 * Aggregates status for all external AI and data providers.
 * SuperAdmin only.
 */
router.get('/provider-status', protect, authorize('superadmin'), async (req, res) => {
    try {
        const dataForSeo = getDataForSEOProviderStatus();
        
        // Basic connectivity checks for AI providers (pinging their base URL is usually enough to verify keys)
        // For now, we report configuration status
        const providerStatus = {
            dataForSeo: {
                ...dataForSeo,
                login: config.googleAds?.clientId ? 'CONFIGURED' : 'MISSING' // Reusing common check pattern
            },
            ai: {
                anthropic: config.ai.providers.anthropic.apiKey ? 'CONFIGURED' : 'MISSING',
                openai: config.ai.providers.openai.apiKey ? 'CONFIGURED' : 'MISSING',
                gemini: config.ai.providers.gemini.apiKey ? 'CONFIGURED' : 'MISSING',
            },
            google: {
                oauth: config.google.clientId ? 'CONFIGURED' : 'MISSING',
                searchConsole: 'ACTIVE' // Place-holder for future token health check
            },
            timestamp: new Date().toISOString()
        };

        res.json({ success: true, providers: providerStatus });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

export default router;

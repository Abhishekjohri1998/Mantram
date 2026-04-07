import express from 'express';
import cors from 'cors';
import connectDB from './config/db.js';
import config from './config/env.js';
import mongoose from 'mongoose';

// Route imports
import authRoutes from './routes/auth.js';
import integrationsRoutes from './routes/integrations.js';
import brandRoutes from './routes/brands.js';
import contentRoutes from './routes/content.js';
import creativeRoutes, { internalGenerateCreative } from './routes/creatives.js';
import { initCreativeWorker } from './utils/creativeQueue.js';
import adminRoutes from './routes/admin.js';
import agentRoutes from './routes/agents.js';
import shopifyRoutes from './routes/shopify.js';
import shopifyAnalyticsRoutes from './routes/shopifyAnalytics.js';
import socialRoutes from './routes/social.js';
import voiceRoutes from './routes/voice.js';
import brainstormRoutes from './routes/brainstorm-studio.js';
import seoRoutes from './routes/seo-studio.js';
import googleAnalyticsRoutes from './routes/google-analytics.js';
import productRoutes from './routes/products.js';
import trendRoutes from './routes/trends.js';
import superadminRoutes, { creditRouter } from './routes/superadmin.js';
import conversationRoutes from './routes/conversations.js';
import contactRoutes from './routes/contacts.js';
import webhookRoutes from './routes/webhooks.js';
import automationRoutes from './routes/automations.js';
import routingRulesRoutes from './routes/routingRules.js';
import canvasAssetsRoutes from './routes/canvasAssets.js';
import agentCommandRoutes from './routes/agentCommand.js';
import videoStudioRoutes from './routes/video-studio.js';
import contentAgenticRoutes from './routes/content-agentic.js';
import creativeAgenticRoutes from './routes/creative-agentic.js';
import orchestratorRoutes from './routes/orchestrator-routes.js';
import pmStudioRoutes from './routes/performance-marketing.js';
import pmConnectionRoutes from './routes/pm-connections.js';
import dashboardSummaryRoutes from './routes/dashboard-summary.js';
import teamRoutes from './routes/team.js';
import fidatoRoutes from './routes/fidato.js';
import nexusRoutes from './routes/nexus.js';
import intelMissionRoutes from './routes/intelMissions.js';
import paymentRoutes from './routes/payments.js';
import waitlistRoutes from './routes/waitlist.js';
import skillsRoutes from './routes/skills.js';
import canvasDirectRoutes from './routes/canvas-direct.js';
import rewardsRoutes from './routes/rewards.js';
import funnelStudioRoutes from './routes/funnel-studio.js';
import socialMediaStudioRoutes from './routes/social-media-studio.js';
import nurtureSequenceRoutes from './routes/nurture-sequences.js';
import funnelIntelligenceRoutes from './routes/funnel-intelligence.js';
import funnelAutomationRoutes from './routes/funnel-automation.js';
import funnelWebhookRoutes from './routes/funnel-webhooks.js';
import mediaUploadRoutes from './routes/mediaUpload.js';
import studioReportRoutes from './routes/studio-reports.js';
import funnelAgenticRoutes from './routes/funnel-agentic.js';
import retentionStudioRoutes from './routes/retention-studio.js';
import { createMantramMcpRouter } from './mcp/mantramToolsServer.js';

const HARDCODED_ORIGINS = [
    'https://mantram.ai',
    'https://www.mantram.ai',
    'https://djty1w4l0681b.cloudfront.net',
    'http://localhost:5173',
    'http://localhost:3000',
];

const app = express();

// ── CORS CONFIGURATION ────────────────────────────────────────
const isOriginAllowed = (origin) => {
    if (!origin) return true;
    const cleanOrigin = origin.toLowerCase().replace(/\/$/, '');
    const envOrigins = (config.frontendUrl || []).map(u => u.toLowerCase().replace(/\/$/, ''));
    const allowedOrigins = [...new Set([...HARDCODED_ORIGINS.map(u => u.toLowerCase()), ...envOrigins])];
    
    return allowedOrigins.includes(cleanOrigin) || 
           cleanOrigin.endsWith('mantram.ai') || 
           cleanOrigin.includes('localhost') ||
           /\.mantram\.ai$/.test(cleanOrigin); 
};

const corsOptions = {
    origin: (origin, callback) => {
        if (isOriginAllowed(origin)) {
            return callback(null, true);
        }
        console.error(`❌ CORS Rejected: "${origin}" not in allowed list.`);
        return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'Cache-Control', 'Pragma'],
    optionsSuccessStatus: 200,
    maxAge: 86400, // Cache preflight for 24h
};

app.use(cors(corsOptions));

// Trust proxy for rate limiting behind Nginx
app.set('trust proxy', 1);

// ── TOP-LEVEL DIAGNOSTICS & LOGGING ───────────────────────────
app.use((req, res, next) => {
    const path = req.path.toLowerCase();
    req.isBotScan = [
        '.php', '.xml', 'wp-admin', 'vendor', 'phpunit', '.env', '.git', 
        'boaform', 'shell', 'cgi-bin', 'autodiscover', 'config', 'admin',
        'sdk/weblanguage', 'pdown', 'web-language', 'scripts'
    ].some(p => path.includes(p.toLowerCase()));

    if (!req.isBotScan && !['/api/health', '/health', '/favicon.ico', '/robots.txt'].includes(path)) {
        console.log(`[INCOMING] ${req.method} ${req.path} | Origin: ${req.headers.origin || 'none'}`);
    }
    
    // Immediate CORS Force for all allowed origins
    const origin = req.headers.origin;
    const isAllowedOrigin = origin && (
        HARDCODED_ORIGINS.some(ao => origin.toLowerCase() === ao.toLowerCase()) ||
        origin.toLowerCase().endsWith('mantram.ai') || 
        origin.toLowerCase().includes('mantram.ai')
    );
    if (isAllowedOrigin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control, Pragma');
    }
    
    // Immediate OPTIONS Intercept
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // Start time for AI budgeting
    req.startTime = Date.now();
    next();
});


// Alias for health checks
// ── HEALTH & LOG HYGIENE ──────────────────────────────────────
app.get(['/health', '/api/health'], (req, res) => {
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    res.json({ 
        status: dbStatus === 'connected' ? 'ok' : 'error', 
        database: dbStatus,
        port: config.port,
        timestamp: new Date().toISOString()
    });
});
app.get('/favicon.ico', (req, res) => res.status(204).end());
app.get('/robots.txt', (req, res) => res.status(204).end());
app.get('/', (req, res) => res.json({ status: 'ok', message: 'Mantram AI API' }));

const server = app.listen(config.port, '0.0.0.0', () => {
    console.log(`\n🚀 Mantram AI Server FAST-START on port ${config.port}`);

    // Signal PM2 immediately to pass health checks
    if (process.send) {
        process.send('ready');
        console.log('✅ PM2 Ready signal sent (Fast-Start)');
    }
});

// ── DEFERRED INITIALIZATION (WAIT FOR DB) ─────────────────────
connectDB().then(() => {
    // Initialize Image Generation Worker (Bull + Redis)
    initCreativeWorker(internalGenerateCreative);

    // Warm up MCP Registry — connects mcpBridge to internal tool server (non-blocking)
    import('./mcp/registry.js').then(({ callMcpTool }) => {
        // Trigger lazy connection by calling a no-op probe
        setTimeout(() => {
            callMcpTool('web_search', { query: 'mantram ai platform startup ping', mode: 'quick' })
                .then(() => console.log('✅ MCP Registry: warm-up complete'))
                .catch(() => console.log('⚠️ MCP Registry: warm-up skipped (will retry on first real call)'));
        }, 8000); // Wait 8s for server to be fully ready
    }).catch(() => {});

    // Start follow-up scheduler (every 4 hours — Meta Compliance)
    import('./services/autonomousAgent.js').then(({ runFollowUpCheck }) => {
        setInterval(() => {
            runFollowUpCheck().catch(err => console.warn('⚠️ Follow-up check failed:', err.message));
        }, 4 * 60 * 60 * 1000);
        console.log('🤖 Autonomous Agent active');
    }).catch(() => { });

    // Start intelligence agent scheduler (every 6 hours — Meta Compliance)
    import('./services/intelligenceAgent.js').then(({ runIntelMissions }) => {
        setInterval(() => {
            runIntelMissions().catch(err => console.warn('🕵️ Intel Agent check failed:', err.message));
        }, 6 * 60 * 60 * 1000);
        console.log('🕵️ Agent Intelligence active');
    }).catch(() => { });

    // Start scheduled post publisher
    import('./services/scheduledPostPublisher.js').then(({ startScheduledPostPublisher }) => {
        startScheduledPostPublisher();
    }).catch((err) => { console.warn('📅 Scheduled Post Publisher failed to start:', err.message); });

    // Start pricing monitor (24h checks)
    import('./agents/pricingMonitor.js').then(({ startPricingMonitor }) => {
        startPricingMonitor();
    }).catch(err => console.error('❌ Failed to load pricingMonitor.js:', err));

    // Auto-seed credit packs if collection is empty
    import('./models/CreditPack.js').then(async ({ default: CreditPack }) => {
        const count = await CreditPack.countDocuments();
        if (count === 0) {
            const defaults = [
                { name: '🎁 Festive Special', slug: 'festive-special', credits: 800, bonusCredits: 200, price: 3000, promoOriginalPrice: 4286, promoDiscount: 30, isPromo: true, icon: 'redeem', badge: 'LIMITED TIME', badgeColor: '#ec4899', displayOrder: 0, validityDays: 365, description: '30% OFF! Best value deal', color: '#ec4899' },
                { name: '🔹 Micro', slug: 'micro', credits: 20, bonusCredits: 0, price: 149, icon: 'token', badge: '', displayOrder: 1, validityDays: 180, description: 'Try it out', color: '#64748b' },
                { name: '⚡ Spark', slug: 'spark', credits: 50, bonusCredits: 0, price: 349, icon: 'bolt', badge: '', displayOrder: 2, validityDays: 180, description: 'Quick power-up', color: '#f59e0b' },
                { name: '🚀 Boost', slug: 'boost', credits: 150, bonusCredits: 15, price: 899, icon: 'rocket_launch', badge: '', displayOrder: 3, validityDays: 180, description: '+15 bonus credits', color: '#3b82f6' },
                { name: '💪 Power', slug: 'power', credits: 300, bonusCredits: 45, price: 1699, icon: 'fitness_center', badge: 'Flash Sale', badgeColor: '#ef4444', displayOrder: 4, validityDays: 180, description: '+45 bonus credits', color: '#ef4444' },
                { name: '🔥 Ultra', slug: 'ultra', credits: 500, bonusCredits: 100, price: 2499, icon: 'local_fire_department', badge: 'Popular', badgeColor: '#f59e0b', displayOrder: 5, validityDays: 365, description: '+100 bonus! Best value', color: '#f97316' },
                { name: '🌟 Stellar', slug: 'stellar', credits: 650, bonusCredits: 150, price: 3000, icon: 'stars', badge: 'Most Popular', badgeColor: '#8b5cf6', displayOrder: 6, validityDays: 365, description: '+150 bonus! Superior value', color: '#8b5cf6' },
                { name: '💎 Mega', slug: 'mega', credits: 1000, bonusCredits: 250, price: 4499, icon: 'diamond', badge: 'Best Value', badgeColor: '#06b6d4', displayOrder: 7, validityDays: 365, description: '+250 bonus! Pro creators', color: '#06b6d4' },
                { name: '👑 Elite', slug: 'elite', credits: 2500, bonusCredits: 750, price: 9999, icon: 'military_tech', badge: 'Flash Sale', badgeColor: '#ef4444', displayOrder: 8, validityDays: 365, description: '+750 bonus! Agency tier', color: '#a855f7' },
                { name: '🏢 Enterprise', slug: 'enterprise-pack', credits: 5000, bonusCredits: 2000, price: 17999, icon: 'corporate_fare', badge: 'Max Savings', badgeColor: '#8b5cf6', displayOrder: 9, validityDays: 365, description: '+2000 bonus! Enterprise power', color: '#8b5cf6' },
            ];
            await CreditPack.insertMany(defaults);
            console.log('🛒 Seeded 8 default credit packs');
        } else {
            console.log(`🛒 Credit Store: ${count} packs loaded`);
        }
    }).catch(err => console.warn('⚠️ Credit pack seed check failed:', err.message));

    // Start funnel scheduler (nurture sequences, automation, score decay)
    import('./services/funnelScheduler.js').then(({ startFunnelScheduler }) => {
        startFunnelScheduler();
    }).catch(err => console.error('❌ Failed to load funnelScheduler.js:', err));
    // Start subscription manager (hourly checks)
    import('./agents/subscriptionManager.js').then(({ startSubscriptionManager }) => {
        startSubscriptionManager();
    }).catch(err => console.error('❌ Failed to load subscriptionManager.js:', err));

}).catch(err => {
    console.error('❌ Critical failure during background agent initialization:', err.message);
});

// Use the standard CORS package as a fallback but our brute-force above should catch most


// Special middleware for Shopify Webhooks
app.use('/api/shopify/webhooks', express.raw({ type: '*/*', limit: '50mb' }), (req, res, next) => {
    if (Buffer.isBuffer(req.body)) {
        req.rawBody = req.body;
        try {
            const bodyString = req.body.toString('utf8');
            if (bodyString && (bodyString.startsWith('{') || bodyString.startsWith('['))) {
                req.body = JSON.parse(bodyString);
            }
        } catch (e) {
            console.warn('⚠️ Webhook body is not valid JSON, but rawBody captured');
        }
    }
    next();
});

// Regular body parsers - skip for webhooks
app.use((req, res, next) => {
    if (req.originalUrl && req.originalUrl.includes('/api/shopify/webhooks')) return next();
    express.json({ limit: '50mb' })(req, res, next);
});

app.use((req, res, next) => {
    if (req.originalUrl && req.originalUrl.includes('/api/shopify/webhooks')) return next();
    express.urlencoded({ extended: true, limit: '50mb' })(req, res, next);
});

// Request logging in dev
if (config.nodeEnv === 'development') {
    app.use((req, res, next) => {
        console.log(`${req.method} ${req.path}`);
        next();
    });
}

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/integrations', integrationsRoutes);
app.use('/api/brands', brandRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/creatives', creativeRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/shopify', shopifyRoutes);
app.use('/api/shopify-analytics', shopifyAnalyticsRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/voice', voiceRoutes);
app.use('/api/brainstorm-studio', brainstormRoutes);
app.use('/api/seo-studio', seoRoutes);
app.use('/api/google-analytics', googleAnalyticsRoutes);
app.use('/api/products', productRoutes);
app.use('/api/trends', trendRoutes);
app.use('/api/superadmin', superadminRoutes);
app.use('/api/credits', creditRouter);
app.use('/api/conversations', conversationRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/automations', automationRoutes);
app.use('/api/routing-rules', routingRulesRoutes);
app.use('/api/canvas-assets', canvasAssetsRoutes);
app.use('/api/agent-command', agentCommandRoutes);
app.use('/api/video-studio', videoStudioRoutes);
app.use('/api/content/agentic', contentAgenticRoutes);
app.use('/api/creatives/agentic', creativeAgenticRoutes);
app.use('/api/orchestrate', orchestratorRoutes);
app.use('/api/pm-studio', pmStudioRoutes);
app.use('/api/pm-studio', pmConnectionRoutes);
app.use('/api/dashboard-summary', dashboardSummaryRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/fidato', fidatoRoutes);
app.use('/api/nexus', nexusRoutes);
app.use('/api/intel', intelMissionRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/waitlist', waitlistRoutes);
app.use('/api/skills', skillsRoutes);
app.use('/api/fidato', canvasDirectRoutes);
app.use('/api/rewards', rewardsRoutes);
app.use('/api/funnel-studio', funnelStudioRoutes);
app.use('/api/social-media-studio', socialMediaStudioRoutes);
app.use('/api/nurture-sequences', nurtureSequenceRoutes);
app.use('/api/funnel-intelligence', funnelIntelligenceRoutes);
app.use('/api/funnel-automation', funnelAutomationRoutes);
app.use('/api/funnel-webhooks', funnelWebhookRoutes);
app.use('/api/funnel-agentic', funnelAgenticRoutes);
app.use('/api/media', mediaUploadRoutes);
app.use('/api/studio-reports', studioReportRoutes);
app.use('/api/retention-studio', retentionStudioRoutes);

// ── Internal MCP Tool Server (SSE) — must come AFTER body parsers ──
// Exposes platform intelligence tools to all studio agents via mcpBridge
app.use('/mcp/tools', createMantramMcpRouter());
console.log('🔌 MCP Tool Server mounted at /mcp/tools/sse');

// Error handler
app.use((err, req, res, next) => {
    console.error('Server Error:', err.stack);
    
    // Ensure CORS headers are present even on errors
    const origin = req.headers.origin;
    if (origin && isOriginAllowed(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control, Pragma');
    }

    
    const response = {
        success: false,
        error: config.nodeEnv === 'development' ? err.message : 'Server Error',
    };

    // If it's a categorized AI provider error, pass metadata to frontend
    if (err.provider) {
        response.isProviderError = true;
        response.provider = err.provider;
        response.error = err.message; // Use the specific user-friendly message
    }

    res.status(err.statusCode || 500).json(response);
});

// Keep-Alive timeouts
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
server.timeout = 60000000;

// ══════════════════════════════════════════════════════════════
// GRACEFUL SHUTDOWN
// ══════════════════════════════════════════════════════════════
const gracefulShutdown = (signal) => {
    console.log(`\n🛑 ${signal} received. Starting graceful shutdown...`);
    server.close(async () => {
        console.log('HTTP server closed.');
        try {
            if (mongoose.connection) mongoose.connection.isShuttingDown = true;
            await mongoose.connection.close();
            console.log('MongoDB connection closed.');
            process.exit(0);
        } catch (err) {
            console.error('Error during shutdown:', err);
            process.exit(1);
        }
    });
    setTimeout(() => {
        console.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 30000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ══════════════════════════════════════════════════════════════
// ERROR GUARDS
// ══════════════════════════════════════════════════════════════
process.on('unhandledRejection', (reason, promise) => {
    console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('🚨 Uncaught Exception:', err);
});

// Catch-all 404 logger — suppress for known bot scans
app.use((req, res) => {
    // Catch-all 404 logger — suppress for known bot scans and POST / noise
    if (!req.isBotScan && !(req.method === 'POST' && req.path === '/')) {
        console.warn(`[404] Not Found: ${req.method} ${req.originalUrl}`);
    }
    res.status(404).json({ success: false, error: `Route ${req.originalUrl} not found` });
});

export default app;

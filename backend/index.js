import express from 'express';
import cors from 'cors';
import connectDB from './config/db.js';
import config from './config/env.js';
import mongoose from 'mongoose';

// Route imports
import authRoutes from './routes/auth.js';
import brandRoutes from './routes/brands.js';
import contentRoutes from './routes/content.js';
import creativeRoutes from './routes/creatives.js';
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

const app = express();

// Immediate health check (bypasses all middleware)
app.get('/api/health', (req, res) => res.json({ status: 'ok', port: config.port }));
app.get('/', (req, res) => res.json({ status: 'ok', message: 'Mantram AI API' }));

// Connect Database
connectDB();

// ── CORS ──────────────────────────────────────────────────────
// These are always allowed regardless of .env FRONTEND_URL value
const HARDCODED_ORIGINS = [
    'https://mantram.ai',
    'https://www.mantram.ai',
    'https://djty1w4l0681b.cloudfront.net',
    'http://localhost:5173',
    'http://localhost:3000',
];

const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, server-to-server)
        if (!origin) return callback(null, true);

        const cleanOrigin = origin.toLowerCase().replace(/\/$/, '');

        // Merge hardcoded + .env configured origins
        const envOrigins = (config.frontendUrl || []).map(u => u.toLowerCase().replace(/\/$/, ''));
        const allowedOrigins = [...new Set([...HARDCODED_ORIGINS.map(u => u.toLowerCase()), ...envOrigins])];

        const isAllowed =
            allowedOrigins.includes(cleanOrigin) ||
            (cleanOrigin.endsWith('.mantram.ai') && !cleanOrigin.includes('..'));

        if (isAllowed) {
            return callback(null, true);
        }

        console.error(`❌ CORS Rejected: "${origin}" not in allowed list.`, { allowedOrigins });
        return callback(new Error(`CORS policy: Origin "${origin}" not allowed`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));

// Handle OPTIONS preflight for all routes
// Note: '/(.*) 'used instead of '*' for path-to-regexp v8+ compatibility (Express 5)
app.options('/(.*)', cors(corsOptions));

// Special middleware for Shopify Webhooks to ensure raw body capture for HMAC verification
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

// Regular body parsers - Skip for webhooks to avoid interference
app.use((req, res, next) => {
    if (req.originalUrl && req.originalUrl.includes('/api/shopify/webhooks')) {
        return next();
    }
    express.json({ limit: '50mb' })(req, res, next);
});

app.use((req, res, next) => {
    if (req.originalUrl && req.originalUrl.includes('/api/shopify/webhooks')) {
        return next();
    }
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

// Health check moved to top

// Error handler
app.use((err, req, res, next) => {
    console.error('Server Error:', err.stack);
    res.status(err.statusCode || 500).json({
        success: false,
        error: config.nodeEnv === 'development' ? err.message : 'Server Error',
    });
});

const server = app.listen(config.port, () => {
    console.log(`\n🚀 Mantram AI Server running on port ${config.port}`);
    console.log(`📡 AI Provider: ${config.ai.defaultTextProvider} (${config.ai.defaultTextModel})`);
    console.log(`🌐 Frontend: ${config.frontendUrl}\n`);
    console.log(`🔐 CORS Hardcoded Origins: ${HARDCODED_ORIGINS.join(', ')}`);

    // Start follow-up scheduler (every 4 hours — Meta Compliance)
    import('./services/autonomousAgent.js').then(({ runFollowUpCheck }) => {
        setInterval(() => {
            runFollowUpCheck().catch(err => console.warn('⚠️ Follow-up check failed:', err.message));
        }, 4 * 60 * 60 * 1000);
        console.log('🤖 Autonomous Agent active — Follow-up scheduler running every 4 hours (Compliance Optimized)');
    }).catch(() => { });

    // Start intelligence agent scheduler (every 6 hours — Meta Compliance)
    import('./services/intelligenceAgent.js').then(({ runIntelMissions }) => {
        setInterval(() => {
            runIntelMissions().catch(err => console.warn('🕵️ Intel Agent check failed:', err.message));
        }, 6 * 60 * 60 * 1000);
        console.log('🕵️ Agent Intelligence active — Missions scheduler running every 6 hours (Compliance Optimized)');
    }).catch(() => { });

    // Start scheduled post publisher
    import('./services/scheduledPostPublisher.js').then(({ startScheduledPostPublisher }) => {
        startScheduledPostPublisher();
    }).catch((err) => { console.warn('📅 Scheduled Post Publisher failed to start:', err.message); });

    // Signal PM2 that we are ready to serve traffic
    if (process.send) {
        process.send('ready');
        console.log('✅ PM2 Ready signal sent');
    }
});

// Configure Keep-Alive timeout larger than AWS ALB / CloudFront idle timeout (60s)
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

// Timeout set to 1000 minutes to support long-running AI operations
server.timeout = 60000000;

// ══════════════════════════════════════════════════════════════
// GRACEFUL SHUTDOWN
// ══════════════════════════════════════════════════════════════
const gracefulShutdown = (signal) => {
    console.log(`\n🛑 ${signal} received. Starting graceful shutdown...`);

    server.close(async () => {
        console.log('HTTP server closed.');
        try {
            if (mongoose.connection) {
                mongoose.connection.isShuttingDown = true;
            }
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

export default app;

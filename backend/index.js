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

// Connect Database
connectDB();

// Middleware
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) return callback(null, true);

        // Standardize origin for matching (lowercase, no trailing slash)
        const cleanOrigin = origin.toLowerCase().replace(/\/$/, '');
        
        // Define hardcoded safe domains as fallback
        const safeDomains = [
            'https://mantram.ai',
            'https://www.mantram.ai',
            'https://djty1w4l0681b.cloudfront.net'
        ];
        
        const allowedOrigins = [
            ...(config.frontendUrl || []),
            ...safeDomains
        ].map(url => url.toLowerCase().replace(/\/$/, ''));

        // Check against allowed list or allow any mantram.ai subdomain in production
        const isAllowed = allowedOrigins.includes(cleanOrigin) || 
                         (cleanOrigin.endsWith('.mantram.ai') && !cleanOrigin.includes('..'));

        if (isAllowed) {
            callback(null, true);
        } else {
            console.error(`❌ CORS Rejected: Origin "${origin}" (cleaned: "${cleanOrigin}") is not in the allowed list.`, {
                configured: config.frontendUrl,
                allowedProcessed: allowedOrigins
            });
            // Still call callback with false to trigger standard CORS failure
            // but we might want to allow it anyway if we suspect config issues
            callback(null, false);
        }
    },
    credentials: true
}));
// Special middleware for Shopify Webhooks to ensure raw body capture for HMAC verification
app.use('/api/shopify/webhooks', express.raw({ type: '*/*', limit: '50mb' }), (req, res, next) => {
    if (Buffer.isBuffer(req.body)) {
        req.rawBody = req.body;
        try {
            // Attempt to parse JSON so subsequent handlers can use req.body
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

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        cors: {
            allowedOrigins: config.frontendUrl
        },
        ai: {
            textProvider: config.ai.defaultTextProvider,
            imageProvider: config.ai.defaultImageProvider,
            textModel: config.ai.defaultTextModel,
        },
    });
});

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

    // Start follow-up scheduler (every 4 hours — Meta Compliance: Decelerated from 30min)
    import('./services/autonomousAgent.js').then(({ runFollowUpCheck }) => {
        setInterval(() => {
            runFollowUpCheck().catch(err => console.warn('⚠️ Follow-up check failed:', err.message));
        }, 4 * 60 * 60 * 1000);
        console.log('🤖 Autonomous Agent active — Follow-up scheduler running every 4 hours (Compliance Optimized)');
    }).catch(() => { });

    // Start intelligence agent scheduler (every 6 hours — Meta Compliance: Decelerated from 2hrs)
    import('./services/intelligenceAgent.js').then(({ runIntelMissions }) => {
        setInterval(() => {
            runIntelMissions().catch(err => console.warn('🕵️ Intel Agent check failed:', err.message));
        }, 6 * 60 * 60 * 1000);
        console.log('🕵️ Agent Intelligence active — Missions scheduler running every 6 hours (Compliance Optimized)');
    }).catch(() => { });

    // Start scheduled post publisher (every 60 seconds)
    import('./services/scheduledPostPublisher.js').then(({ startScheduledPostPublisher }) => {
        startScheduledPostPublisher();
    }).catch((err) => { console.warn('📅 Scheduled Post Publisher failed to start:', err.message); });
});

// Configure Keep-Alive timeout to be larger than AWS ALB / CloudFront idle timeout (60s)
// This prevents random 502 Bad Gateway errors caused by TCP connection race conditions
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

// Timeout set to 1000 minutes (60,000,000ms) to support long-running AI operations
// (SEO audits, crawls, multi-model AI chains, image generation + S3 uploads)
server.timeout = 60000000; // 1000 minutes

// ══════════════════════════════════════════════════════════════
// SCALING: GRACEFUL SHUTDOWN
// ══════════════════════════════════════════════════════════════
const gracefulShutdown = (signal) => {
    console.log(`\n🛑 ${signal} received. Starting graceful shutdown...`);
    
    // Stop accepting new connections
    server.close(async () => {
        console.log('HTTP server closed.');
        
        try {
            // Signal to db.js to not attempt reconnect
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

    // Force exit after 30s if cleanup hangs
    setTimeout(() => {
        console.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 30000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ══════════════════════════════════════════════════════════════
// SCALING: ERROR GUARDS
// ══════════════════════════════════════════════════════════════
process.on('unhandledRejection', (reason, promise) => {
    console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
    // In production, we log but don't crash unless it's a critical boot error
});

process.on('uncaughtException', (err) => {
    console.error('🚨 Uncaught Exception:', err);
    // Optional: Graceful shutdown if exception is too severe
    // gracefulShutdown('UncaughtException');
});
export default app;

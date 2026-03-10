import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import connectDB from './config/db.js';
import config from './config/env.js';

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

// BUG-17 FIX: Security headers
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false, // Disabled for API server — frontend handles CSP
}));

// Middleware
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) return callback(null, true);

        // Standardize origin for matching (lowercase, no trailing slash)
        const cleanOrigin = origin.toLowerCase().replace(/\/$/, '');
        const allowedOrigins = config.frontendUrl.map(url => url.toLowerCase().replace(/\/$/, ''));

        if (allowedOrigins.includes(cleanOrigin)) {
            callback(null, true);
        } else {
            console.warn(`⚠️ CORS Blocked: Origin "${origin}" (cleaned: "${cleanOrigin}") not in allowed list:`, allowedOrigins);
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

// BUG-14 FIX: Rate limiting on sensitive endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 15, // 15 attempts per window
    message: { success: false, error: 'Too many attempts. Please try again after 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300, // 300 requests per 15 minutes per IP
    message: { success: false, error: 'Rate limit exceeded. Please slow down.' },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

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

export default app;

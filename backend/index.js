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
import funnelStudioRoutes from './routes/funnel-studio.js';
import socialMediaStudioRoutes from './routes/social-media-studio.js';
import nurtureSequenceRoutes from './routes/nurture-sequences.js';
import funnelIntelligenceRoutes from './routes/funnel-intelligence.js';
import funnelAutomationRoutes from './routes/funnel-automation.js';
import funnelWebhookRoutes from './routes/funnel-webhooks.js';
import mediaUploadRoutes from './routes/mediaUpload.js';
import studioReportRoutes from './routes/studio-reports.js';
import funnelAgenticRoutes from './routes/funnel-agentic.js';

const app = express();

// Required for express-rate-limit when behind a proxy (CloudFront/ALB)
app.set('trust proxy', 1);

// Connect Database
connectDB();

// BUG-17 FIX: Security headers
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false, // Disabled for API server — frontend handles CSP
}));

// Set Permissions Policy to allow Razorpay sensors/payment features
app.use((req, res, next) => {
    res.setHeader('Permissions-Policy', 'accelerometer=*, gyroscope=*, magnetometer=*, payment=*');
    next();
});

// Standard baseline for all requests to track performance & prevent timeouts
app.use((req, res, next) => {
    req.startTime = Date.now();
    next();
});

// Middleware
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) return callback(null, true);

        // Standardize origin for matching (lowercase, no trailing slash)
        const cleanOrigin = origin.toLowerCase().replace(/\/$/, '');
        const allowedOrigins = config.frontendUrl.map(url => url.toLowerCase().replace(/\/$/, ''));
        
        // Ensure production domains are allowed even if not in .env (fail-safe for live URL)
        const productionOrigins = ['https://mantram.ai', 'https://www.mantram.ai', 'https://api.mantram.ai'];
        
        // Match exact or any subdomain of mantram.ai
        const isMantramDomain = cleanOrigin.endsWith('.mantram.ai') || cleanOrigin === 'https://mantram.ai';

        if (allowedOrigins.includes(cleanOrigin) || productionOrigins.includes(cleanOrigin) || isMantramDomain) {
            callback(null, true);
        } else {
            console.warn(`⚠️ CORS Blocked: Origin "${origin}" (cleaned: "${cleanOrigin}") not in allowed list:`, allowedOrigins);
            callback(null, false);
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
        'Content-Type', 
        'Authorization', 
        'X-Requested-With', 
        'Accept', 
        'Origin',
        'Cache-Control',
        'x-rtb-fingerprint-id'
    ],
    exposedHeaders: ['x-rtb-fingerprint-id'],
    optionsSuccessStatus: 204,
    maxAge: 86400 // 24 hours preflight cache
}));

// Preflight OPTIONS handling
app.options(/.*/, cors());
// Special middleware for Webhooks to ensure raw body capture for HMAC verification
app.use((req, res, next) => {
    if (req.originalUrl && (req.originalUrl.includes('/api/shopify/webhooks') || req.originalUrl.includes('/api/funnel-webhooks') || req.originalUrl.includes('/api/webhooks'))) {
        express.raw({ type: '*/*', limit: '50mb' })(req, res, (err) => {
            if (err) return next(err);
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
    } else {
        next();
    }
});

// Regular body parsers - Skip for webhooks to avoid interference
app.use((req, res, next) => {
    if (req.originalUrl && (req.originalUrl.includes('/api/shopify/webhooks') || req.originalUrl.includes('/api/funnel-webhooks') || req.originalUrl.includes('/api/webhooks'))) {
        return next();
    }
    express.json({ limit: '50mb' })(req, res, next);
});

app.use((req, res, next) => {
    if (req.originalUrl && (req.originalUrl.includes('/api/shopify/webhooks') || req.originalUrl.includes('/api/funnel-webhooks') || req.originalUrl.includes('/api/webhooks'))) {
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

// BUG-14 FIX: Tightened rate limiting on sensitive endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Relaxed from 5 to 10 to prevent lockout from UI input quirks
    message: { success: false, error: 'Too many attempts. Please try again after 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 3000, // 3000 requests per 15 minutes per IP (studios + background scheduler + dev)
    message: { success: false, error: 'Rate limit exceeded. Please slow down.' },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', apiLimiter);

// Specific limiters for auth
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/resend-verification', authLimiter);

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
app.use('/api/payments', paymentRoutes);
app.use('/api/waitlist', waitlistRoutes);
app.use('/api/skills', skillsRoutes);
app.use('/api/funnel-studio', funnelStudioRoutes);
app.use('/api/social-media-studio', socialMediaStudioRoutes);
app.use('/api/nurture-sequences', nurtureSequenceRoutes);
app.use('/api/funnel-intelligence', funnelIntelligenceRoutes);
app.use('/api/funnel-automation', funnelAutomationRoutes);
app.use('/api/funnel-webhooks', funnelWebhookRoutes);

// Funnel Agentic Routes (AI qualifier, smart routing, nurture, CSV import)
app.use('/api/funnel-agentic', funnelAgenticRoutes);
app.use('/api/media', mediaUploadRoutes);
app.use('/api/studio-reports', studioReportRoutes);
app.use('/api/intel', intelMissionRoutes);

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

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('[Global Error]:', err.stack);

    // Ensure CORS headers are present even on errors
    const origin = req.headers.origin;
    if (origin) {
        // Standardize origin for matching
        const cleanOrigin = origin.toLowerCase().replace(/\/$/, '');
        const allowedOrigins = (Array.isArray(config.frontendUrl) ? config.frontendUrl : [config.frontendUrl])
            .map(url => url.toLowerCase().replace(/\/$/, ''));
        
        const productionOrigins = ['https://mantram.ai', 'https://www.mantram.ai', 'https://api.mantram.ai'];
        const isMantramDomain = cleanOrigin.endsWith('.mantram.ai') || cleanOrigin === 'https://mantram.ai';

        if (allowedOrigins.includes(cleanOrigin) || productionOrigins.includes(cleanOrigin) || isMantramDomain) {
            res.header('Access-Control-Allow-Origin', origin);
            res.header('Access-Control-Allow-Credentials', 'true');
        }
    }

    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
        success: false,
        error: config.nodeEnv === 'development' ? err.message : 'Server Error',
        message: err.message || 'Internal Server Error',
    });
});

const server = app.listen(config.port, () => {
    console.log(`\n🚀 Mantram AI Server running on port ${config.port}`);
    console.log(`📡 AI Provider: ${config.ai.defaultTextProvider} (${config.ai.defaultTextModel})`);
    console.log(`🌐 Frontend: ${config.frontendUrl}\n`);

    // Start follow-up scheduler
    import('./services/autonomousAgent.js').then(({ runFollowUpCheck }) => {
        setInterval(() => {
            runFollowUpCheck().catch(err => console.warn('⚠️ Follow-up check failed:', err.message));
        }, 4 * 60 * 60 * 1000);
        console.log('🤖 Autonomous Agent active');
    }).catch(err => console.error('❌ Failed to load autonomousAgent.js:', err));

    // Start intelligence agent scheduler
    import('./services/intelligenceAgent.js').then(({ runIntelMissions }) => {
        setInterval(() => {
            runIntelMissions().catch(err => console.warn('🕵️ Intel Agent check failed:', err.message));
        }, 6 * 60 * 60 * 1000);
        console.log('🕵️ Agent Intelligence active');
    }).catch(err => console.error('❌ Failed to load intelligenceAgent.js:', err));

    // Start scheduled post publisher
    import('./services/scheduledPostPublisher.js').then(({ startScheduledPostPublisher }) => {
        startScheduledPostPublisher();
    }).catch(err => console.error('❌ Failed to load scheduledPostPublisher.js:', err));

    // Start funnel scheduler (nurture sequences, automation, score decay)
    import('./services/funnelScheduler.js').then(({ startFunnelScheduler }) => {
        startFunnelScheduler();
    }).catch(err => console.error('❌ Failed to load funnelScheduler.js:', err));
});

// Configure Keep-Alive timeout to be larger than AWS ALB / CloudFront idle timeout (60s)
// This prevents random 502 Bad Gateway errors caused by TCP connection race conditions
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

// AI image generation (Gemini) + S3 upload + DB save can take 2-4 minutes
// Default Node.js HTTP timeout is 2 minutes — extend to 5 minutes for heavy operations
server.timeout = 300000;

export default app;

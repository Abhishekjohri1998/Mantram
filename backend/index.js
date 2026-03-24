import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import connectDB from './config/db.js';
import mongoose from 'mongoose';
import config from './config/env.js';
import session from 'express-session';
import RedisStore from 'connect-redis';
import MongoStore from 'connect-mongo';
import redisClient from './utils/cache.js';

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
import canvasDirectRoutes from './routes/canvas-direct.js';
import nexusRoutes from './routes/nexus.js';
import intelMissionRoutes from './routes/intelMissions.js';
import paymentRoutes from './routes/payments.js';
import rewardsRoutes from './routes/rewards.js';
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
import retentionStudioRoutes from './routes/retention-studio.js';

const app = express();

// Required for express-rate-limit when behind multiple proxies (CloudFront -> ALB -> Nginx)
// Setting to 3 hops (CloudFront + AWS ALB + EC2 Nginx proxy) to prevent ERR_ERL_PERMISSIVE_TRUST_PROXY
app.set('trust proxy', 3);

// Connect Database
connectDB();

// BUG-17 FIX: Security headers (Enforced for SEO & PCI compliance)
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://*.google.com", "https://*.googleapis.com"],
            connectSrc: ["'self'", "https://*.google.com", "https://*.googleapis.com", "https://*.anthropic.com", "https://*.openai.com"],
            imgSrc: ["'self'", "data:", "https://*.googleusercontent.com", "https://*.shopify.com", "https://*.aws.amazon.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: [],
        },
    },
    hsts: {
        maxAge: 63072000, // 2 years in seconds
        includeSubDomains: true,
        preload: true
    },
    frameguard: { action: 'deny' },
    xContentTypeOptions: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xssFilter: true,
    dnsPrefetchControl: { allow: false }
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
        const productionOrigins = [
            'https://mantram.ai', 
            'https://www.mantram.ai', 
            'https://api.mantram.ai',
            'https://djty1w4l0681b.cloudfront.net'
        ];
        
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
    express.json({ limit: '20mb' })(req, res, next);
});

app.use((req, res, next) => {
    if (req.originalUrl && (req.originalUrl.includes('/api/shopify/webhooks') || req.originalUrl.includes('/api/funnel-webhooks') || req.originalUrl.includes('/api/webhooks'))) {
        return next();
    }
    express.urlencoded({ extended: true, limit: '20mb' })(req, res, next);
});

// Scaling Phase 4: Redis Session Management
// FALLBACK: Use MongoStore if Redis is not configured (MemoryStore is NOT production-ready)
const sessionStore = process.env.REDIS_HOST 
    ? new RedisStore({ client: redisClient, prefix: 'sess:' })
    : MongoStore.create({ 
        mongoUrl: config.mongoUri, 
        collectionName: 'sessions',
        ttl: 24 * 60 * 60 // 1 day
    });

if (!process.env.REDIS_HOST) {
    console.log('📦 Using MongoStore for sessions (MemoryStore replaced for production stability).');
}

app.use(session({
    store: sessionStore,
    secret: config.sessionSecret || 'mantram_secret_123_scale', 
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: config.nodeEnv === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 1 day
        sameSite: 'lax'
    }
}));

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

// Global limit to prevent massive brute force across all endpoints
const globalLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 500, // max 500 requests per minute per IP
    message: { success: false, error: 'Maximum platform capacity reached for your IP. Please wait a minute.' },
    standardHeaders: true,
    legacyHeaders: false,
});

app.use('/api/', globalLimiter);
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
app.use('/api/fidato', canvasDirectRoutes);
app.use('/api/nexus', nexusRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/rewards', rewardsRoutes);
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

// Retention Studio (Amazon → D2C Re-engagement)
app.use('/api/retention-studio', retentionStudioRoutes);

// Phase 1: Health check for ALB
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

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
        
        const productionOrigins = [
            'https://mantram.ai', 
            'https://www.mantram.ai', 
            'https://api.mantram.ai',
            'https://djty1w4l0681b.cloudfront.net'
        ];
        const isMantramDomain = cleanOrigin.endsWith('.mantram.ai') || cleanOrigin.endsWith('.cloudfront.net') || cleanOrigin === 'https://mantram.ai';

        if (allowedOrigins.includes(cleanOrigin) || productionOrigins.includes(cleanOrigin) || isMantramDomain) {
            res.header('Access-Control-Allow-Origin', origin);
            res.header('Access-Control-Allow-Credentials', 'true');
        }
    }

    // AI Provider Errors (Busy/Quota) receive special status codes and friendly messages
    if (err.name === 'AIProviderBusyError' || err.name === 'AIProviderQuotaError' || err.statusCode === 429 || err.statusCode === 503) {
        return res.status(err.statusCode || 503).json({
            success: false,
            message: err.message,
            provider: err.provider,
            isAIError: true
        });
    }

    res.status(err.statusCode || 500).json({
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

    // Start pricing monitor (24h checks)
    import('./agents/pricingMonitor.js').then(({ startPricingMonitor }) => {
        startPricingMonitor();
    }).catch(err => console.error('❌ Failed to load pricingMonitor.js:', err));

    // Auto-seed credit packs if collection is empty
    import('./models/CreditPack.js').then(async ({ default: CreditPack }) => {
        const count = await CreditPack.countDocuments();
        if (count === 0) {
            const defaults = [
                { name: '🔹 Micro', slug: 'micro', credits: 20, bonusCredits: 0, price: 149, icon: 'token', badge: '', displayOrder: 1, validityDays: 180, description: 'Try it out', color: '#64748b' },
                { name: '⚡ Spark', slug: 'spark', credits: 50, bonusCredits: 0, price: 349, icon: 'bolt', badge: '', displayOrder: 2, validityDays: 180, description: 'Quick power-up', color: '#f59e0b' },
                { name: '🚀 Boost', slug: 'boost', credits: 150, bonusCredits: 15, price: 899, icon: 'rocket_launch', badge: '', displayOrder: 3, validityDays: 180, description: '+15 bonus credits', color: '#3b82f6' },
                { name: '💪 Power', slug: 'power', credits: 300, bonusCredits: 45, price: 1699, icon: 'fitness_center', badge: 'Flash Sale', badgeColor: '#ef4444', displayOrder: 4, validityDays: 180, description: '+45 bonus credits', color: '#ef4444' },
                { name: '🔥 Ultra', slug: 'ultra', credits: 500, bonusCredits: 100, price: 2499, icon: 'local_fire_department', badge: 'Popular', badgeColor: '#f59e0b', displayOrder: 5, validityDays: 365, description: '+100 bonus! Best value', color: '#f97316' },
                { name: '💎 Mega', slug: 'mega', credits: 1000, bonusCredits: 250, price: 4499, icon: 'diamond', badge: 'Best Value', badgeColor: '#06b6d4', displayOrder: 6, validityDays: 365, description: '+250 bonus! Pro creators', color: '#06b6d4' },
                { name: '👑 Elite', slug: 'elite', credits: 2500, bonusCredits: 750, price: 9999, icon: 'military_tech', badge: 'Flash Sale', badgeColor: '#ef4444', displayOrder: 7, validityDays: 365, description: '+750 bonus! Agency tier', color: '#a855f7' },
                { name: '🏢 Enterprise', slug: 'enterprise-pack', credits: 5000, bonusCredits: 2000, price: 17999, icon: 'corporate_fare', badge: 'Max Savings', badgeColor: '#8b5cf6', displayOrder: 8, validityDays: 365, description: '+2000 bonus! Enterprise power', color: '#8b5cf6' },
            ];
            await CreditPack.insertMany(defaults);
            console.log('🛒 Seeded 8 default credit packs');
        } else {
            console.log(`🛒 Credit Store: ${count} packs loaded`);
        }
    }).catch(err => console.warn('⚠️ Credit pack seed check failed:', err.message));

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

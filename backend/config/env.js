import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

export default {
    port: process.env.PORT || 3001,
    nodeEnv: process.env.NODE_ENV || 'development',
    mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/da-mantram',
    jwtSecret: (() => {
        if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
        if (process.env.NODE_ENV === 'production') {
            throw new Error('❌ FATAL: JWT_SECRET must be set in production!');
        }
        console.warn('⚠️ Using default JWT secret — NOT safe for production');
        return 'dev-secret-change-me';
    })(),
    jwtExpire: process.env.JWT_EXPIRE || '7d',
    frontendUrl: (process.env.FRONTEND_URL || 'http://localhost:5173')
        .split(',')
        .map(url => url.trim().replace(/^["']|["']$/g, '')),
    backendUrl: process.env.BACKEND_URL || 'https://api.mantram.ai',

    // AI Provider Config — Claude primary, Gemini for images
    ai: {
        defaultTextProvider: process.env.DEFAULT_TEXT_PROVIDER || 'anthropic',
        defaultImageProvider: process.env.DEFAULT_IMAGE_PROVIDER || 'gemini',
        defaultTextModel: process.env.DEFAULT_TEXT_MODEL || 'claude-3-opus-20240229',
        defaultGeminiModel: process.env.DEFAULT_GEMINI_MODEL || 'gemini-2.0-flash',
        defaultOpenAIModel: process.env.DEFAULT_OPENAI_MODEL || 'gpt-4o-mini',
        defaultAnthropicModel: process.env.DEFAULT_ANTHROPIC_MODEL || 'claude-3-opus-20240229',
        defaultImageModel: process.env.DEFAULT_IMAGE_MODEL || 'gemini-3.1-flash-image-preview',
        providers: {
            gemini: {
                apiKey: process.env.GEMINI_API_KEY,
                imageApiKey: process.env.GEMINI_IMAGE_API_KEY || process.env.GEMINI_API_KEY,
                // GCP Vertex AI (Billed)
                gcpProjectId: process.env.GCP_PROJECT_ID,
                gcpLocation: process.env.GCP_LOCATION || 'us-central1',
                googleApplicationCredentials: process.env.GOOGLE_APPLICATION_CREDENTIALS,
            },
            openai: { apiKey: process.env.OPENAI_API_KEY },
            anthropic: { apiKey: process.env.ANTHROPIC_API_KEY },
        },
    },

    // fal.ai — Video Generation (Kling)
    fal: {
        apiKey: process.env.FAL_API_KEY,
    },

    // kie.ai — Video Generation (Veo 3.1 Fast)
    kie: {
        apiKey: process.env.KIE_API_KEY,
    },

    // PiAPI — Video Generation (Seedance 2.0)
    piapi: {
        apiKey: process.env.PIAPI_API_KEY,
    },

    // HeyGen — UGC Avatar Video Generation
    heygen: {
        apiKey: process.env.HEYGEN_API_KEY,
    },

    // Google OAuth
    google: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackUrl: process.env.GOOGLE_CALLBACK_URL,
    },

    // AWS S3
    aws: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        bucket: process.env.AWS_S3_BUCKET,
        region: process.env.AWS_REGION || 'ap-south-1',
    },

    // Meta / Facebook
    facebook: {
        appId: process.env.FACEBOOK_APP_ID,
        appSecret: process.env.FACEBOOK_APP_SECRET,
        redirectUri: process.env.FACEBOOK_REDIRECT_URI,
    },

    // Instagram Specific App
    instagram: {
        appId: process.env.INSTAGRAM_APP_ID,
        appSecret: process.env.INSTAGRAM_APP_SECRET,
    },

    // Meta Ads (Marketing API)
    metaAds: {
        appId: process.env.META_ADS_APP_ID || process.env.FACEBOOK_APP_ID,
        appSecret: process.env.META_ADS_APP_SECRET || process.env.FACEBOOK_APP_SECRET,
    },

    // Google Ads
    googleAds: {
        developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
        clientId: process.env.GOOGLE_ADS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET,
    },

    // xAI Grok (Real-time trend intelligence)
    grok: {
        apiKey: process.env.GROK_API_KEY || process.env.XAI_API_KEY,
    },

    // Razorpay
    razorpay: {
        keyId: process.env.RAZORPAY_KEY_ID,
        keySecret: process.env.RAZORPAY_KEY_SECRET,
    },

    // Shopify
    shopify: {
        apiKey: process.env.SHOPIFY_API_KEY,
        apiSecret: process.env.SHOPIFY_API_SECRET,
        scope: process.env.SHOPIFY_SCOPES || 'read_products,read_orders,read_customers',
        callbackUrl: process.env.SHOPIFY_CALLBACK_URL,
    },

    // Email Config
    email: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },

    // LinkedIn
    linkedin: {
        clientId: process.env.LINKEDIN_CLIENT_ID,
        clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
        callbackUrl: process.env.LINKEDIN_CALLBACK_URL || `${process.env.BACKEND_URL || 'https://api.mantram.ai'}/api/social/auth/linkedin/callback`,
    },
    
    // Google PageSpeed Insights
    pagespeed: {
        apiKey: process.env.PAGESPEED_API_KEY,
    },
    
    // Redis
    redis: {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT) || 6379,
        tls: process.env.REDIS_TLS === 'true',
    }
};

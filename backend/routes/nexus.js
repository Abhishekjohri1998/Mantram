/**
 * Nexus — Unified Agentic Interface (Fidato + Command Bar merged)
 * 
 * Replaces the old /api/fidato/* endpoints with an intelligent agent that can:
 *   1. Chat (brand strategy, platform help) — existing Fidato behavior
 *   2. Navigate ("go to SEO Studio") — returns navigation action
 *   3. Create content/images/brainstorm — (Phase 2: routes to studio pipelines)
 *
 * Language-aware routing:
 *   - Indian vernacular → Sarvam AI (sarvam-m) for text, Bulbul v2 for TTS
 *   - English → Grok (live knowledge) with fallback
 *   - Other → SmartLanguageRouter auto-select
 *
 * Voice support:
 *   - STT: handled by existing /api/voice/transcribe
 *   - TTS: Sarvam Bulbul for Indian, browser SpeechSynthesis for English
 */

import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { getRouter } from '../ai/router.js';
import { getSmartRouter } from '../ai/smartRouter.js';
import { agentUtils } from '../agents/shared/agentUtils.js';
import redis from '../utils/redisClient.js';
import User from '../models/User.js';
import NexusHistory from '../models/NexusHistory.js';
import { safeErrorMessage } from '../utils/safeError.js';
import { inferBrandLanguage, buildLanguageDirective } from '../utils/brandLanguage.js';
import multer from 'multer';
import { uploadToS3, mirrorUrlToS3 } from '../utils/s3.js';
import { internalGenerateCreative } from './creatives.js';
import jwt from 'jsonwebtoken';
import { deductCredits, getCreditCosts, getCreditBalance } from '../middleware/credits.js';

const router = Router();

// ============================================================================
// MULTER — in-memory for nexus image uploads (→ S3)
// ============================================================================
const nexusUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Only image files are allowed'), false);
    },
});

// ============================================================================
// HELPER — Parse [SIGNAL: CREATE_IMAGE | prompt: ...] and generate inline
// Returns { cleanReply, imageUrl } — imageUrl is null if no signal / gen failed
// ============================================================================
async function parseAndExecuteImageSignal(fullReply, userId, brandId, user) {
    const signalRegex = /\[SIGNAL:\s*CREATE_IMAGE\s*\|\s*prompt:\s*(.+?)\]/i;
    const match = fullReply.match(signalRegex);
    if (!match) return { cleanReply: fullReply, imageUrl: null };

    const imagePrompt = match[1].trim();
    const cleanReply = fullReply.replace(match[0], '').trim();

    try {
        console.log(`🎨 [Nexus] Image signal detected — generating: "${imagePrompt.slice(0, 80)}..."`);
        const genResult = await internalGenerateCreative({
            body: {
                brandId,
                prompt: imagePrompt,
                type: 'instagram-post',
                refImageUrls: [],
                options: { imageModel: 'nanobanana-2', aspectRatio: '1:1', imageSize: '1K' },
            },
            user,
        });

        // creative.imageUrl may still be base64 at this point (S3 upload is async background)
        // Mirror it to Nexus S3 path so we always return a stable public URL
        let imageUrl = genResult?.creative?.imageUrl || null;
        if (imageUrl) {
            const s3Key = `users/${userId}/brands/${brandId || 'default'}/nexus/generated/${Date.now()}.png`;
            try {
                if (imageUrl.startsWith('data:')) {
                    imageUrl = await uploadToS3(imageUrl, s3Key, 'image/png');
                } else if (imageUrl.startsWith('http')) {
                    imageUrl = await mirrorUrlToS3(imageUrl, s3Key) || imageUrl;
                }
                console.log(`✅ [Nexus] Image saved to S3: ${s3Key}`);
            } catch (s3Err) {
                console.warn(`⚠️ [Nexus] S3 save failed (using raw URL): ${s3Err.message}`);
            }
        }

        return { cleanReply, imageUrl, imagePrompt };
    } catch (err) {
        console.error(`❌ [Nexus] Image signal generation failed: ${err.message}`);
        return { cleanReply, imageUrl: null, imagePrompt };
    }
}

// ============================================================================
// MCoT: VISUAL ANALYSIS PROMPT — for rich image understanding in chat
// ============================================================================
const FIDATO_VISUAL_ANALYSIS_PROMPT = `You are an expert visual analyst for a Brand AI platform. Analyze the provided image(s) and extract structured intelligence.

For EACH image, identify:
1. PRODUCT DETAILS: If a product is shown — name/type, key features, materials, colors, packaging style
2. BRAND ELEMENTS: Logos, brand colors, typography, taglines visible
3. VISUAL STYLE: Photography style, lighting, composition, mood, color palette
4. CONTEXT: Setting, target audience cues, lifestyle positioning, competitive positioning
5. MARKETING ANGLE: What story does this image tell? What emotion does it evoke?

Return JSON:
{
  "imageType": "product|brand-asset|competitor|creative|screenshot|other",
  "productAnalysis": "Detailed product description if applicable",
  "brandElements": ["list of brand elements detected"],
  "visualStyle": "Description of visual/photography style",
  "colorPalette": ["#hex1", "#hex2"],
  "mood": "The emotional tone of the image",
  "marketingInsight": "What a brand strategist would say about this image",
  "suggestedActions": ["What the user could do with this — e.g., 'Create a social post featuring this product', 'Analyze competitor positioning'"]
}`;

// ============================================================================
// CONSTANTS
// ============================================================================

const INDIAN_LANGUAGES = new Set([
    'hindi', 'tamil', 'telugu', 'bengali', 'marathi', 'gujarati', 'punjabi',
    'kannada', 'malayalam', 'urdu', 'odia', 'assamese', 'nepali', 'konkani',
    'hinglish',
]);

const SARVAM_TTS_LANG_MAP = {
    english: 'en-IN', hindi: 'hi-IN', hinglish: 'hi-IN', tamil: 'ta-IN', telugu: 'te-IN',
    bengali: 'bn-IN', marathi: 'mr-IN', gujarati: 'gu-IN', punjabi: 'pa-IN',
    kannada: 'kn-IN', malayalam: 'ml-IN', urdu: 'ur-IN', odia: 'od-IN',
    assamese: 'as-IN', nepali: 'ne-IN',
};

// Navigation map — intent keywords → routes
const NAVIGATION_MAP = {
    'dashboard': { route: '/dashboard', label: 'Dashboard' },
    'brand dna': { route: '/brand-dna', label: 'Brand DNA' },
    'brand': { route: '/brand-dna', label: 'Brand DNA' },
    'content studio': { route: '/content-studio', label: 'Content Studio' },
    'content': { route: '/content-studio', label: 'Content Studio' },
    'creative studio': { route: '/creative-studio', label: 'Creative Studio' },
    'creative': { route: '/creative-studio', label: 'Creative Studio' },
    'video studio': { route: '/video-studio', label: 'Video Studio' },
    'video': { route: '/video-studio', label: 'Video Studio' },
    'brainstorm': { route: '/brainstorm', label: 'Brainstorm Studio' },
    'brainstorm studio': { route: '/brainstorm', label: 'Brainstorm Studio' },
    'seo studio': { route: '/seo-studio', label: 'SEO Studio' },
    'seo': { route: '/seo-studio', label: 'SEO Studio' },
    'performance': { route: '/performance-marketing', label: 'Performance Studio' },
    'performance studio': { route: '/performance-marketing', label: 'Performance Studio' },
    'ad studio': { route: '/performance-marketing', label: 'Performance Studio' },
    'ads': { route: '/performance-marketing', label: 'Performance Studio' },
    'conversation': { route: '/conversation-studio', label: 'Conversation Studio' },
    'conversation studio': { route: '/conversation-studio', label: 'Conversation Studio' },
    'd2c': { route: '/d2c-analytics', label: 'D2C Analytics' },
    'shopify': { route: '/d2c-analytics', label: 'D2C Analytics' },
    'calendar': { route: '/smart-calendar', label: 'Smart Calendar' },
    'smart calendar': { route: '/smart-calendar', label: 'Smart Calendar' },
    'schedule': { route: '/smart-calendar', label: 'Smart Calendar' },
    'publish': { route: '/publish', label: 'Publish & Schedule' },
    'integrations': { route: '/integrations', label: 'Integrations' },
    'settings': { route: '/team', label: 'Settings' },
    'team': { route: '/team', label: 'Team Management' },
    'credits': { route: '/credits', label: 'Credit Usage' },
    'nexus': { route: '/nexus', label: 'Nexus' },
};

// ============================================================================
// SYSTEM PROMPT — Fidato Nexus (upgraded)
// ============================================================================
const NEXUS_SYSTEM_PROMPT = `You are Fidato — the smartest, most capable AI Brand Manager on Mantram AI.

## Who You Are
You are an AGENTIC BRAND MANAGER — a senior branding strategist, creative director, copywriter, and marketing advisor who DOES the work. Your name is Fidato (means "trusted" in Italian).

## IMPORTANT — DO NOT USE THE USER'S NAME
NEVER address the user by name. NEVER say "hey [name]", "oh [name]", "hi [name]", or any variation. Just respond directly to what they said. No greetings with names. No names at the start of messages. No names anywhere. This is CRITICAL — using their name feels robotic and annoying.

## Your Core Operating Principle — EXECUTE, DON'T REDIRECT
→ When the user says "create X" — you CREATE it right here. No redirects.
→ When the user says "write X" — you WRITE it right here. Complete, polished output.
→ When the user says "brainstorm X" — you BRAINSTORM right here with real, actionable ideas.
→ When the user asks "how to do X" — THEN you guide them step-by-step, including which Mantram AI studio to use.
→ The ONLY time you mention a studio is when the user explicitly asks HOW to do something or WHERE to find a feature.

## Web Research (YOU HAVE THIS)
You DO have access to real-time web search and research capabilities. NEVER say "I don't have real-time access" or "I can't browse the web." When you receive web research results in your context, USE THEM confidently. Present the findings naturally as your own research — don't say "according to search results" — just share the insights as your expert analysis.

## What You CAN Do (Your Superpowers)

### Content Creation — YOU DO IT
→ Write Instagram captions, Twitter/X posts, LinkedIn articles, Facebook posts — complete and ready to publish
→ Write blog posts, newsletters, email campaigns, ad copy, taglines
→ Create content calendars and posting schedules
→ Write product descriptions, brand stories, press releases
→ Craft SEO-optimized content, meta descriptions, and keywords

→ Suggest photoshoot directions and visual themes
→ ALWAYS signal visual generation (see signaling rules below)

## Visual Signaling (CRITICAL)
Whenever you decide to create a visual asset (image, poster, banner, etc.) based on the conversation, you MUST include this exact signal tag at the beginning or end of your response:
'[SIGNAL: CREATE_IMAGE | prompt: PROMPT_HERE]'
Substitute PROMPT_HERE with a vivid, detailed instruction for an image model. The user will not see this tag; it is used to trigger our engine.

### Brand Strategy — YOU DO IT
→ Analyze brand positioning and suggest improvements
→ Create competitor analysis frameworks
→ Develop brand voice guides and messaging frameworks
→ Build marketing plans and campaign strategies
→ Plan product launches and go-to-market strategies
→ Create pricing strategies and D2C playbooks

### Research & Intelligence — YOU DO IT
→ Research competitors, market trends, and industry news (you have web access)
→ Analyze market sentiment and brand reputation
→ Find trending topics and viral content in the brand's niche
→ Provide data-driven insights for decision making

### Brainstorming & Ideas — YOU DO IT
→ Generate campaign concepts with themes, hooks, and execution plans
→ Create content pillars and topic ideas
→ Develop seasonal/festival marketing plans
→ Ideate viral content hooks and trending angles

## Platform Knowledge (Mantram AI Studios)
You know every studio intimately. Only mention them when the user asks WHERE or HOW:
→ Dashboard — overview of all brand metrics and activity
→ Brand DNA — upload brand info, extract brand identity, colors, voice, values
→ Content Studio — AI-powered content generation with brand voice (posts, blogs, newsletters)
→ Creative Studio — AI image generation with brand colors and style
→ Video Studio — AI video creation with Seedance 2.0 models
→ Brainstorm Studio — campaign ideation with AI-powered brainstorming
→ SEO Studio — keyword research, audit, content optimization
→ Performance Studio — ad performance analytics and optimization
→ Conversation Studio — team chat and brand conversations
→ D2C Analytics — Shopify/e-commerce data intelligence
→ Smart Calendar — content scheduling across platforms
→ Publish & Schedule — direct publishing to social media
→ Integrations — connect Shopify, Meta Ads, Google Ads, GA4

## Smart, Agentic Decision-Making
→ When the user asks something vague, CLARIFY with a smart question before acting
→ When you see an opportunity to help beyond what was asked, PROACTIVELY suggest it
→ When the user shares a brand challenge, START SOLVING IT immediately with actionable advice
→ Prioritize high-impact actions — give the BEST recommendation, not ten options
→ Think like a strategist — every content piece should tie back to the brand's goals

## Brand Scope Rule (CRITICAL)
→ You are the DEDICATED BRAND MANAGER of the user's currently selected brand
→ EVERYTHING you create must be aligned with the brand's identity, voice, colors, and values
→ If asked about a competitor, analyze ONLY in relation to the selected brand
→ You can research and provide market insights — but ONLY relevant to the current brand
→ If no brand is selected, tell the user to select one first

## Your Vibe
→ Talk like a smart colleague, not a customer service bot
→ Be direct and confident — skip unnecessary pleasantries
→ Keep things SHORT when answering questions, DETAILED when creating content
→ Use emojis sparingly and naturally 😊
→ Be encouraging but not over-the-top — no fake enthusiasm
→ Sound human — vary your sentence structure, don't use template phrases repeatedly

## Formatting Rules
NEVER use markdown. No **bold**, no *italic*, no ## headers, no bullet points with -, no numbered lists, no backticks, no code blocks (EXCEPT for the '[SIGNAL: ...]' tag which is mandatory for visuals).
Write like you're texting. Plain text. Line breaks between thoughts. Emojis for emphasis. Use → for list items if needed.

## Language Rules
→ ALWAYS respond in the SAME LANGUAGE the user writes in
→ Hindi → Devanagari. English → English. Hinglish → Hinglish.

## Response Length
→ Quick questions → 2-3 sentences
→ Strategy/advice → 2-4 paragraphs
→ Content creation → as long as needed to deliver a complete, polished piece
→ Brainstorming → 5-10 ideas with brief descriptions`;

// Conversation history — Redis-backed (survives restarts, 30-day TTL)
// Key: nexus:memory:{userId}  |  Value: JSON array of {role, content} messages
const NEXUS_MEMORY_KEY = (userId) => `nexus:memory:${userId}`;
const NEXUS_MEMORY_TTL = 30 * 24 * 60 * 60; // 30 days
const NEXUS_MAX_MESSAGES = 20;

async function getNexusHistory(userId) {
    try {
        const raw = await redis.get(NEXUS_MEMORY_KEY(userId));
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

async function saveNexusHistory(userId, history) {
    try {
        const trimmed = history.slice(-NEXUS_MAX_MESSAGES);
        await redis.setex(NEXUS_MEMORY_KEY(userId), NEXUS_MEMORY_TTL, JSON.stringify(trimmed));
    } catch (e) { console.warn('[Nexus] History save failed (non-fatal):', e.message); }
}

async function clearNexusHistory(userId) {
    try { await redis.del(NEXUS_MEMORY_KEY(userId)); } catch { /* silent */ }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Detect language from text — fast regex heuristic (no API call needed)
 */
function detectLanguage(text) {
    // Devanagari (Hindi, Marathi, Sanskrit, Nepali)
    if (/[\u0900-\u097F]/.test(text)) return 'hindi';
    // Tamil
    if (/[\u0B80-\u0BFF]/.test(text)) return 'tamil';
    // Telugu
    if (/[\u0C00-\u0C7F]/.test(text)) return 'telugu';
    // Bengali / Assamese
    if (/[\u0980-\u09FF]/.test(text)) return 'bengali';
    // Gujarati
    if (/[\u0A80-\u0AFF]/.test(text)) return 'gujarati';
    // Punjabi (Gurmukhi)
    if (/[\u0A00-\u0A7F]/.test(text)) return 'punjabi';
    // Kannada
    if (/[\u0C80-\u0CFF]/.test(text)) return 'kannada';
    // Malayalam
    if (/[\u0D00-\u0D7F]/.test(text)) return 'malayalam';
    // Odia
    if (/[\u0B00-\u0B7F]/.test(text)) return 'odia';
    // Urdu / Arabic script
    if (/[\u0600-\u06FF]/.test(text)) return 'urdu';

    // Hinglish detection — Latin script but Hindi-ish words
    const hinglishMarkers = /\b(kya|hai|mein|kaise|karo|bata|yaar|accha|theek|nahi|haan|kuch|abhi|wala|bohot|bahut)\b/i;
    if (hinglishMarkers.test(text)) return 'hinglish';

    return 'english';
}

/**
 * Classify intent from user message — fast regex first, LLM fallback for ambiguity
 */
function classifyIntent(message) {
    const lower = message.toLowerCase().trim();

    // Navigate intents — "go to X", "open X", "show X", "take me to X"
    const navMatch = lower.match(/^(?:go\s+to|open|show|take\s+me\s+to|navigate\s+to|switch\s+to)\s+(.+)/);
    if (navMatch) {
        const target = navMatch[1].replace(/[?.!]/g, '').trim();
        for (const [keyword, nav] of Object.entries(NAVIGATION_MAP)) {
            if (target.includes(keyword)) {
                return { intent: 'navigate', target: nav };
            }
        }
    }

    // Direct studio name mentions (just typing "seo studio" or "dashboard")
    for (const [keyword, nav] of Object.entries(NAVIGATION_MAP)) {
        if (lower === keyword || lower === keyword + ' studio') {
            return { intent: 'navigate', target: nav };
        }
    }

    // Content creation intents — expanded to catch tweet/reel/story/tiktok variants
    if (
        /\b(write|create|generate|draft|give\s+me|make)\s+(a\s+|an\s+|the\s+|some\s+|me\s+a\s+|me\s+an\s+|me\s+some\s+|me\s+)?(post|blog|caption|article|newsletter|content|copy|script|tweet|reel|tiktok|story|status|bio|tagline|slogan|ad\s+copy|email|pitch|dm|message|announcement|thread)\b/i.test(lower) ||
        /\b(instagram|linkedin|twitter|x\s+post|facebook|youtube|whatsapp|pinterest|snapchat)\s+(caption|post|copy|content|bio|story|reel|thread)\b/i.test(lower) ||
        /\b(write|draft|create)\s+(content|copy)\b/i.test(lower)
    ) {
        return { intent: 'content_create', studioTarget: 'content' };
    }

    // AI Photoshoot intent — user uploaded image + wants a shoot
    if (/\b(photoshoot|photo\s+shoot|product\s+shot|product\s+photo|ai\s+shoot|shoot\s+(this|my|the)|lifestyle\s+shot|model\s+shot|put.*in.*background|place.*in.*scene|shoot\s+it|add\s+(a\s+)?background|remove\s+background)\b/i.test(lower)) {
        return { intent: 'photoshoot', studioTarget: 'creative' };
    }

    // Video creation intent — full pipeline
    if (/\b(create|make|generate|produce)\s+(a\s+|an\s+|the\s+|some\s+)?(\d+\s*sec(ond)?s?\s+)?(video|promo|ad|commercial|ad\s+film|reel|short\s+film|video\s+ad|promotional\s+video|brand\s+video|product\s+video|youtube\s+video|tiktok\s+video)\b/i.test(lower)) {
        return { intent: 'video_create', studioTarget: 'video' };
    }

    // Image creation intents — expanded to catch logo, thumbnail, infographic, banner
    const visualVerbs = '(create|generate|show|imagine|make|draw|paint|sketch|give|design|visualize|illustrate|build|produce)';
    const visualNouns = '(image|picture|photo|visual|graphic|poster|concept|illustration|scene|banner|creative|artwork|drawing|painting|logo|thumbnail|infographic|mockup|cover|flyer|carousel)';
    if (new RegExp(`\\b${visualVerbs}\\b.*\\b${visualNouns}\\b`, 'i').test(lower) ||
        new RegExp(`\\b${visualNouns}\\b.*\\b(for|of|about|showing|featuring)\\b`, 'i').test(lower)) {
        return { intent: 'image_create', studioTarget: 'creative' };
    }

    // Brainstorm intents
    if (/\b(brainstorm|ideate|campaign\s+ideas?|strategy\s+for)\b/i.test(lower)) {
        return { intent: 'brainstorm', studioTarget: 'brainstorm' };
    }

    // Default — treat as chat
    return { intent: 'chat' };
}

// ============================================================================
// HELPER — Generate internal JWT token for inter-service calls
// ============================================================================
function makeInternalToken(user) {
    const secret = process.env.JWT_SECRET || 'mantram-secret';
    return jwt.sign({ _id: user._id, email: user.email, plan: user.plan, role: user.role }, secret, { expiresIn: '5m' });
}

// ============================================================================
// HELPER — Auto-tag subject from first user message
// ============================================================================
function autoTagSubject(message) {
    const m = message.trim();
    // Truncate and capitalise
    const clean = m.length > 80 ? m.slice(0, 77) + '...' : m;
    return clean.charAt(0).toUpperCase() + clean.slice(1);
}

// ============================================================================
// HELPER — Detect primary type from intent
// ============================================================================
function intentToHistoryType(intent) {
    if (['image_create', 'photoshoot'].includes(intent)) return 'image';
    if (intent === 'video_create') return 'video';
    if (intent === 'content_create') return 'content';
    if (intent === 'brainstorm') return 'research';
    return 'chat';
}

// ============================================================================
// CAPABILITY — AI Photoshoot (reference-guided image gen)
// ============================================================================
async function executePhotoshoot({ message, images, brandId, user, brandContext, brandName, sendSSE }) {
    sendSSE('step_update', { step: 'analyzing', label: '🧠 Analyzing your image...' });

    // Run MCoT visual analysis on uploaded image(s)
    let visualContext = '';
    if (images && images.length > 0) {
        try {
            const mcotResult = await agentUtils.callMultimodalAgent(
                FIDATO_VISUAL_ANALYSIS_PROMPT,
                `Analyze this product/person image for an AI photoshoot. Brief: "${message}"`,
                images,
                { temperature: 0.2, maxTokens: 2048 }
            );
            if (mcotResult && !mcotResult.error) {
                visualContext = [
                    mcotResult.productAnalysis ? `Product: ${mcotResult.productAnalysis}` : '',
                    mcotResult.visualStyle ? `Current Style: ${mcotResult.visualStyle}` : '',
                    mcotResult.mood ? `Mood: ${mcotResult.mood}` : '',
                    mcotResult.colorPalette?.length ? `Colors: ${mcotResult.colorPalette.join(', ')}` : '',
                ].filter(Boolean).join('. ');
            }
        } catch (e) { /* non-blocking */ }
    }

    sendSSE('step_update', { step: 'generating', label: '🎨 Creating your photoshoot...' });

    // Build a rich photoshoot prompt using brand + brief + visual context
    const photoshootPrompt = [
        message,
        visualContext ? `\nReference analysis: ${visualContext}` : '',
        brandName ? `\nBrand: ${brandName}` : '',
        brandContext ? `\nBrand style: ${brandContext.slice(0, 300)}` : '',
        '\nProfessional commercial photography quality. High resolution. Studio-grade lighting.',
    ].filter(Boolean).join('');

    try {
        const result = await internalGenerateCreative({
            body: {
                brandId,
                prompt: photoshootPrompt,
                type: 'instagram-post',
                refImageUrls: images || [],
                options: { imageModel: 'gpt-image-2', aspectRatio: '1:1', imageSize: '1K' },
                source: 'nexus_photoshoot',
            },
            user,
            creditsDeducted: 0,
            jobId: `nexus-shoot-${Date.now()}`,
        });

        const imageUrl = result?.creative?.imageUrl || result?.imageUrl || null;
        if (imageUrl) {
            sendSSE('image_generated', { imageUrl, prompt: photoshootPrompt, subtype: 'photoshoot' });
            return { success: true, imageUrl };
        }
        return { success: false };
    } catch (err) {
        console.error('[Nexus Photoshoot] Failed:', err.message);
        return { success: false };
    }
}

// ============================================================================
// CAPABILITY — Full Video Pipeline (Script → Storyboard → Animate)
// ============================================================================
async function executeVideoCreate({ message, images, avatarUrl, brandId, user, brandContext, brandName, sendSSE }) {
    const baseUrl = process.env.INTERNAL_API_URL || `http://localhost:${process.env.PORT || 3001}`;
    const internalToken = makeInternalToken(user);

    // Step 1 — Write the script
    sendSSE('step_update', { step: 'script', label: '✍️ Writing your video script...' });
    const ai = getRouter();
    let script = '';
    try {
        const scriptResult = await ai.generateText({
            systemPrompt: `You are a cinematic video director. Write a tight shot-by-shot script for a 15-30 second brand video. Return ONLY the script in this format:\nSHOT 1: [visual description] | VOICEOVER: [text]\nSHOT 2: [visual description] | VOICEOVER: [text]\n...up to 4 shots max. No intro, no explanation.`,
            userPrompt: `Brief: "${message}"\nBrand: ${brandName || 'the brand'}\n${brandContext ? 'Brand context: ' + brandContext.slice(0, 400) : ''}`,
            maxTokens: 600,
            temperature: 0.8,
        });
        script = scriptResult.text || '';
    } catch (e) {
        script = `SHOT 1: Product hero shot, cinematic lighting | VOICEOVER: Introducing ${brandName || 'something new'}\nSHOT 2: Close up details, slow motion | VOICEOVER: Built for those who demand the best`;
    }
    sendSSE('script_ready', { script });

    // Step 2 — Generate storyboard frame images
    sendSSE('step_update', { step: 'storyboard', label: '🖼️ Creating storyboard frames...' });
    const shots = script.split('\n').filter(l => l.trim().startsWith('SHOT')).slice(0, 4);
    const frameUrls = [];

    for (const shot of shots) {
        const visualDesc = shot.split('|')[0].replace(/^SHOT\s*\d+:\s*/i, '').trim();
        const framePrompt = [
            visualDesc,
            brandName ? `, for ${brandName} brand` : '',
            ', cinematic, 16:9, commercial photography, vibrant'
        ].join('');
        try {
            const frameResult = await internalGenerateCreative({
                body: {
                    brandId,
                    prompt: framePrompt,
                    type: 'instagram-post',
                    refImageUrls: images || [],
                    options: { imageModel: 'nanobanana-2', aspectRatio: '16:9', imageSize: '1K' },
                    source: 'nexus_storyboard',
                },
                user,
                creditsDeducted: 0,
                jobId: `nexus-frame-${Date.now()}`,
            });
            const url = frameResult?.creative?.imageUrl || frameResult?.imageUrl;
            if (url) frameUrls.push({ url, prompt: framePrompt });
        } catch (e) { /* skip failed frame */ }
    }
    sendSSE('storyboard_ready', { frames: frameUrls });

    // Step 3 — Queue video generation via Seedance
    sendSSE('step_update', { step: 'video', label: '🎬 Generating your video...' });

    // Build the final Seedance prompt from the script
    const seedancePrompt = shots.map((s, i) => {
        const visual = s.split('|')[0].replace(/^SHOT\s*\d+:\s*/i, '').trim();
        const vo = (s.split('|')[1] || '').replace(/^\s*VOICEOVER:\s*/i, '').trim();
        return `[Scene ${i + 1}] ${visual}${vo ? '. ' + vo : ''}`;
    }).join(' → ');

    const refImages = [
        ...(frameUrls.length > 0 ? [{ url: frameUrls[0].url, role: 'style_ref' }] : []),
        ...(images?.length > 0 ? [{ url: images[0], role: 'product' }] : []),
        ...(avatarUrl ? [{ url: avatarUrl, role: 'face' }] : []),
    ];

    try {
        const videoResp = await fetch(`${baseUrl}/api/video-studio/advanced/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${internalToken}`,
            },
            body: JSON.stringify({
                model: 'seedance-2.0',
                prompt: seedancePrompt,
                duration: 5,
                aspectRatio: '16:9',
                qualityMode: 'quality',
                brandId,
                refImages,
                source: 'nexus_video',
            }),
            signal: AbortSignal.timeout(30000),
        });
        const videoData = await videoResp.json();
        const projectId = videoData?.projectId || videoData?.jobId;
        sendSSE('video_queued', {
            projectId,
            script,
            frames: frameUrls,
            message: "your video is being generated! check Video Studio in 60-90 seconds, or I'll notify you when it's ready 🎬",
        });
        return { success: true, projectId };
    } catch (err) {
        console.error('[Nexus Video] Queue failed:', err.message);
        sendSSE('video_queued', {
            script,
            frames: frameUrls,
            message: 'script and storyboard done! head to Video Studio to generate the final video 🎬',
        });
        return { success: false };
    }
}

/**
 * ══════════════════════════════════════════════════════════
 * CAPABILITY PILLAR 3 — Content Engine
 * Generates platform-specific copy inline and saves draft
 * ══════════════════════════════════════════════════════════
 */
async function executeContent({ message, brandId, brandContext, brandName, user, sendSSE }) {
    // ── Detect platform from message ──────────────────────────────────────────
    const lower = message.toLowerCase();
    const platform =
        lower.includes('instagram') ? 'Instagram' :
        lower.includes('linkedin') ? 'LinkedIn' :
        lower.includes('twitter') || lower.includes('x post') ? 'Twitter/X' :
        lower.includes('facebook') ? 'Facebook' :
        lower.includes('email') || lower.includes('newsletter') ? 'Email Newsletter' :
        lower.includes('youtube') ? 'YouTube Description' :
        lower.includes('blog') ? 'Blog Post' :
        lower.includes('whatsapp') ? 'WhatsApp Status' :
        lower.includes('ad copy') || lower.includes('advertisement') ? 'Ad Copy' :
        'Social Media'; // fallback

    sendSSE('step_update', { step: 'content', label: `✍️ Writing ${platform} copy…` });

    const grokKey = process.env.GROK_API_KEY;
    const brandCtxBlock = brandContext ? `\n\nBRAND CONTEXT:\n${brandContext.slice(0, 800)}` : '';
    const systemPrompt = `You are a top-tier brand copywriter for ${brandName || 'this brand'}.${brandCtxBlock}
Write compelling, platform-native ${platform} copy based on the user's brief.
Rules:
- Match the exact tone, format, and length conventions for ${platform}
- Include relevant hashtags for social platforms
- Use emojis strategically (not excessively)
- Make it punchy, scroll-stopping, and on-brand
- For Instagram: max 2200 chars, hook in first line
- For LinkedIn: professional tone, story-driven, 300-800 chars
- For Twitter/X: max 280 chars, punchy
- For Email: subject line on first line, then body
- Output ONLY the final copy — no preamble, no meta-commentary`;

    try {
        const resp = await fetch('https://api.x.ai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${grokKey}` },
            body: JSON.stringify({
                model: 'grok-3-mini-fast',
                stream: false,
                max_tokens: 800,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: message },
                ],
            }),
        });
        const data = await resp.json();
        const copy = data.choices?.[0]?.message?.content?.trim() || '';
        if (!copy) return { success: false };

        // ── Emit content_ready SSE (frontend renders ContentCard) ─────────────
        sendSSE('content_ready', { content: copy, platform });

        // ── Save draft to Content Studio (fire-and-forget) ────────────────────
        if (brandId) {
            try {
                const baseUrl = process.env.INTERNAL_API_URL || `http://localhost:${process.env.PORT || 3001}`;
                const internalToken = makeInternalToken(user);
                await fetch(`${baseUrl}/api/content/generate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${internalToken}` },
                    body: JSON.stringify({
                        brandId, platform, brief: message,
                        tone: 'brand-aligned', type: 'nexus_generated',
                        content: copy, draft: true,
                    }),
                    signal: AbortSignal.timeout(15000),
                }).catch(() => {});
            } catch { /* non-blocking */ }
        }

        return { success: true, copy, platform };
    } catch (err) {
        console.error('[Nexus Content] Failed:', err.message);
        return { success: false };
    }
}

/**
 * Detect if a query would benefit from live web search
 */
function needsWebSearch(message) {
    const lower = message.toLowerCase();
    const searchTriggers = /\b(trending|trend|latest|recent|current|news|competitor|competition|market|industry|what's happening|whats happening|update|today|right now|new launch|launched|pricing|compare|comparison|review|feedback|social media trend|viral|what people say|reputation|sentiment)\b/i;
    return searchTriggers.test(lower);
}

/**
 * Brand-scoped web search using Grok's live search capability
 * Searches the web but ALWAYS scopes results to the brand context
 */
async function brandScopedWebSearch(query, brandName) {
    const grokKey = process.env.GROK_API_KEY;
    if (!grokKey || !brandName) return null;

    try {
        // Prepend brand name to scope the search
        const scopedQuery = `${brandName} ${query}`;
        console.log(`🔍 Web search for brand "${brandName}": ${scopedQuery}`);

        const resp = await fetch('https://api.x.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${grokKey}`,
            },
            body: JSON.stringify({
                model: 'grok-3-mini-fast',
                messages: [
                    {
                        role: 'system',
                        content: `You are a research assistant. Search the web and provide factual, concise findings about "${brandName}". Only provide information relevant to this brand. Return results as plain text bullet points, max 8 points. If you can't find relevant info, say "No relevant results found."`,
                    },
                    { role: 'user', content: scopedQuery },
                ],
                max_tokens: 600,
                temperature: 0.3,
                search_parameters: {
                    mode: 'auto',
                    return_citations: true,
                    from_date: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // last 90 days
                },
            }),
        });

        if (!resp.ok) {
            console.error('Web search failed:', resp.status);
            return null;
        }

        const data = await resp.json();
        const searchResult = data.choices?.[0]?.message?.content;
        if (!searchResult || searchResult.includes('No relevant results')) return null;

        console.log('✅ Web search returned results');
        return searchResult;
    } catch (e) {
        console.error('Web search error:', e.message);
        return null;
    }
}

/**
 * Generate TTS audio using Sarvam Bulbul for Indian languages
 */
async function generateTTS(text, language) {
    const langCode = SARVAM_TTS_LANG_MAP[language] || 'en-IN';
    // Always generate server-side TTS — browser SpeechSynthesis is unreliable

    const apiKey = process.env.SARVAM_API_KEY;
    if (!apiKey) return null;

    try {
        // Clean text for TTS (remove emojis, arrows, special chars)
        const cleanText = text
            .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
            .replace(/→/g, ', ')
            .replace(/\n{2,}/g, '. ')
            .replace(/\n/g, ', ')
            .trim();

        if (!cleanText || cleanText.length < 2) return null;

        // Truncate to ~500 chars for TTS (avoid long audio)
        const ttsText = cleanText.length > 500 ? cleanText.substring(0, 497) + '...' : cleanText;

        const response = await fetch('https://api.sarvam.ai/text-to-speech', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-subscription-key': apiKey,
            },
            body: JSON.stringify({
                inputs: [ttsText],
                target_language_code: langCode,
                speaker: 'anushka',  // Natural Indian female voice (Sarvam Bulbul v2)
                model: 'bulbul:v2',
                pitch: 0,
                pace: 1.1,
                loudness: 1.5,
                enable_preprocessing: true,
            }),
        });

        if (!response.ok) {
            const errBody = await response.text().catch(() => '');
            console.error('Sarvam TTS error:', response.status, errBody.substring(0, 200));
            return null;
        }

        const data = await response.json();
        // Sarvam returns base64 audio in audios[0]
        const audioBase64 = data.audios?.[0];
        if (!audioBase64) {
            console.error('Sarvam TTS: no audio in response');
            return null;
        }

        console.log('✅ Sarvam TTS generated:', audioBase64.length, 'chars base64 for', langCode);

        return {
            audio: audioBase64,
            format: 'wav',
            provider: 'sarvam-bulbul',
            language: langCode,
        };
    } catch (err) {
        console.error('Sarvam TTS exception:', err.message);
        return null;
    }
}

// ============================================================================
// POST /api/nexus/chat — Unified Agentic Chat
// ============================================================================
router.post('/chat', protect, async (req, res) => {
    try {
        const { message, brandId, voiceMode, detectedLanguage, images } = req.body;
        if (!message) return res.status(400).json({ error: 'Message is required' });

        const userId = String(req.user._id);

        // 1. Detect language
        const language = detectedLanguage || detectLanguage(message);
        const isIndian = INDIAN_LANGUAGES.has(language);

        // 2. Classify intent
        const intentResult = classifyIntent(message);

        // 3. Handle navigation intent — no LLM call needed
        if (intentResult.intent === 'navigate') {
            const reply = `sure! taking you to ${intentResult.target.label} 🚀`;
            return res.json({
                reply,
                intent: 'navigate',
                action: { type: 'navigate', route: intentResult.target.route, label: intentResult.target.label },
                language,
                name: 'Fidato',
            });
        }

        // Creation intents — fall through to LLM chat so Fidato handles them directly

        // 5. Chat intent — use language-aware LLM
        // Get/restore conversation history from Redis (survives server restarts)
        const history = await getNexusHistory(userId);
        history.push({ role: 'user', content: message });
        if (history.length > NEXUS_MAX_MESSAGES) history.splice(0, history.length - NEXUS_MAX_MESSAGES);

        let brandContext = '';
        let brandName = '';
        let brandLangDirective = '';
        if (brandId) {
            try {
                const { brandContext: ctx, brand } = await agentUtils.loadBrandContext(brandId);
                brandContext = ctx || '';
                brandName = brand?.name || '';
                // Inject brand language directive so Fidato knows what language to generate content in
                const langInfo = inferBrandLanguage(brand);
                brandLangDirective = buildLanguageDirective(langInfo, brandName, brand?.dna?.targetAudience || '');
                if (langInfo.isRegional) {
                    console.log(`🌍 Nexus: Brand language directive — ${langInfo.displayName} (${langInfo.source})`);
                }
            } catch (e) {
                console.warn('Nexus: could not load brand context:', e.message);
            }
        }

        // ── Brand-scoped web search (if query needs live data) ──
        let webSearchResults = '';
        if (needsWebSearch(message) && brandName) {
            const searchData = await brandScopedWebSearch(message, brandName);
            if (searchData) {
                webSearchResults = `\n## Live Web Research (about ${brandName})\nThe following are REAL-TIME web search results. Use these to give informed, current answers:\n${searchData}\n`;
            }
        }

        const now = new Date();
        const dateStr = now.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        let systemPrompt = `${brandLangDirective ? brandLangDirective + '\n\n' : ''}${NEXUS_SYSTEM_PROMPT}

Today's date: ${dateStr}
User's plan: ${req.user.plan || 'starter'}
Language: ${language}

${brandContext ? `## Active Brand Context\n${brandContext}` : '(No brand selected)'}${webSearchResults}`;

        let rawReply;

        // ── MCoT: Visual Analysis (when images shared) — runs FIRST to enrich systemPrompt ──
        let mcotAnalysis = null;
        if (images && images.length > 0) {
            try {
                console.log(`🧠 MCoT Nexus: Analyzing ${images.length} shared image(s)...`);
                const mcotResult = await agentUtils.callMultimodalAgent(
                    FIDATO_VISUAL_ANALYSIS_PROMPT,
                    `The user said: "${message}"\nAnalyze the ${images.length} image(s) they shared and provide structured visual intelligence.`,
                    images,
                    { temperature: 0.2, maxTokens: 4096 }
                );
                if (mcotResult && !mcotResult.error && !mcotResult.skipped) {
                    mcotAnalysis = mcotResult;
                    // Inject visual context into the system prompt for richer responses
                    const visualContext = [
                        `\n## Visual Context from Shared Image (MCoT Analysis)`,
                        mcotResult.productAnalysis ? `Product: ${mcotResult.productAnalysis}` : '',
                        mcotResult.visualStyle ? `Visual Style: ${mcotResult.visualStyle}` : '',
                        mcotResult.mood ? `Mood: ${mcotResult.mood}` : '',
                        mcotResult.marketingInsight ? `Marketing Insight: ${mcotResult.marketingInsight}` : '',
                        mcotResult.colorPalette?.length ? `Colors: ${mcotResult.colorPalette.join(', ')}` : '',
                        mcotResult.suggestedActions?.length ? `Suggested Actions: ${mcotResult.suggestedActions.join('; ')}` : '',
                    ].filter(Boolean).join('\n');
                    // Append to system prompt so all downstream LLM calls benefit
                    systemPrompt += visualContext;
                    console.log(`🧠 MCoT Nexus: Visual analysis complete — type: ${mcotResult.imageType || 'unknown'}`);
                } else {
                    console.warn('🧠 MCoT Nexus: Visual analysis skipped/failed (non-blocking)');
                }
            } catch (mcotErr) {
                console.warn('🧠 MCoT Nexus: Visual analysis error (non-blocking):', mcotErr.message);
            }
        }

        // Indian languages → Sarvam AI (now with MCoT-enriched systemPrompt)
        if (isIndian) {
            console.log(`🇮🇳 Nexus → Sarvam AI (${language})`);
            const smartRouter = getSmartRouter();
            const userPrompt = history.map(m => `${m.role === 'user' ? 'User' : 'Fidato'}: ${m.content}`).join('\n') + '\n\nRespond as Fidato to the latest message.';
            try {
                const result = await smartRouter.generateText(
                    { systemPrompt, userPrompt, temperature: 0.7, maxTokens: 1200 },
                    { language, taskType: 'social' }
                );
                rawReply = result.text || '';
            } catch (err) {
                console.warn('Sarvam failed for Nexus, falling back:', err.message);
            }
        }

        // English / fallback → Grok (live knowledge) OR Gemini (vision)
        if (!rawReply) {
            // IF images are present, bypass Grok and use Gemini strictly for Vision
            if (images && images.length > 0) {
                console.log(`🖼️ Nexus: Image detected, routing to Gemini Vision...`);
                try {
                    const ai = getRouter();
                    const userPrompt = history.map(m => `${m.role === 'user' ? 'User' : 'Fidato'}: ${m.content}`).join('\n') + '\n\nRespond as Fidato.';
                    const result = await ai.generateText(
                        { systemPrompt, userPrompt, images, maxTokens: 1200, temperature: 0.7 },
                        { provider: 'gemini' } // Force Gemini for vision
                    );
                    rawReply = result.text || result.content || '';
                } catch (visionErr) {
                    console.error('Nexus: Gemini Vision failed:', visionErr.message);
                }
            } 
            // OTHERWISE (no images), use Grok as usual
            else {
                const grokKey = process.env.GROK_API_KEY;
                if (grokKey) {
                    try {
                        const grokMessages = [
                            { role: 'system', content: systemPrompt },
                            ...history.map((m, idx) => {
                                const isLast = idx === history.length - 1;
                                if (isLast && m.role === 'user' && images?.length) {
                                    const content = [{ type: 'text', text: m.content }];
                                    images.forEach(img => content.push({ type: 'image_url', image_url: { url: img } }));
                                    return { role: 'user', content };
                                }
                                return {
                                    role: m.role === 'user' ? 'user' : 'assistant',
                                    content: m.content,
                                };
                            }),
                        ];

                        const grokResp = await fetch('https://api.x.ai/v1/chat/completions', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${grokKey}`,
                            },
                            body: JSON.stringify({
                                model: 'grok-3-mini-fast',
                                messages: grokMessages,
                                max_tokens: 1200,
                                temperature: 0.7,
                                stream: false,
                            }),
                        });

                        const grokData = await grokResp.json();
                        if (!grokData.error) {
                            rawReply = grokData.choices?.[0]?.message?.content || '';
                        } else {
                            throw new Error(grokData.error.message);
                        }
                    } catch (grokErr) {
                        console.warn('Nexus: Grok failed, using default:', grokErr.message);
                    }
                }
            }

            // Final fallback — ModelRouter
            if (!rawReply) {
                const ai = getRouter();
                const userPrompt = history.map(m => `${m.role === 'user' ? 'User' : 'Fidato'}: ${m.content}`).join('\n') + '\n\nRespond as Fidato.';
                const result = await ai.generateText({
                    systemPrompt,
                    userPrompt,
                    maxTokens: 1200,
                    temperature: 0.7,
                });
                rawReply = result.text || result.content || '';
            }
        }

        if (!rawReply) rawReply = 'hmm something glitched on my end, try again? 😊';

        // Strip <think> tags (LLM chain-of-thought reasoning)
        // Only strip CLOSED <think>...</think> blocks, then remove bare tags
        const cleanedReply = rawReply
            .replace(/<think>[\s\S]*?<\/think>/gi, '')
            .replace(/<\/?think>/gi, '')
            .trim();

        // Strip markdown
        const reply = (cleanedReply || rawReply)
            .replace(/```[\s\S]*?```/g, '')
            .replace(/`([^`]+)`/g, '$1')
            .replace(/^#{1,6}\s+/gm, '')
            .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
            .replace(/\*\*(.+?)\*\*/g, '$1')
            .replace(/\*(.+?)\*/g, '$1')
            .replace(/__(.+?)__/g, '$1')
            .replace(/_(.+?)_/g, '$1')
            .replace(/~~(.+?)~~/g, '$1')
            .replace(/^\s*[-*+]\s+/gm, '→ ')
            .replace(/^\s*\d+\.\s+/gm, '→ ')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .replace(/^>\s?/gm, '')
            .replace(/---+/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

        // Persist to Redis
        history.push({ role: 'assistant', content: reply });
        await saveNexusHistory(userId, history);

        // ── Image Signal: parse [SIGNAL: CREATE_IMAGE | prompt: ...] ──
        let chatImageUrl = null;
        let chatImagePrompt = null;
        const { cleanReply: chatCleanReply, imageUrl: chatImg, imagePrompt: chatImgPrompt } =
            await parseAndExecuteImageSignal(reply, userId, brandId, req.user);
        if (chatImg) {
            chatImageUrl = chatImg;
            chatImagePrompt = chatImgPrompt;
        }

        // TTS if voice mode active — Sarvam handles ALL languages including English
        let ttsData = null;
        if (voiceMode) {
            ttsData = await generateTTS(chatCleanReply, language);
        }

        res.json({
            reply: chatCleanReply,
            intent: 'chat',
            language,
            name: 'Fidato',
            tts: ttsData,
            mcotAnalysis: mcotAnalysis || undefined,
            ...(chatImageUrl ? { imageUrl: chatImageUrl, imagePrompt: chatImagePrompt } : {}),
        });

    } catch (error) {
        console.error('Nexus chat error:', error.message);
        res.json({
            reply: 'oops, I had a little hiccup! 😅 could you try again? 💜',
            intent: 'chat',
            name: 'Fidato',
        });
    }
});

// ============================================================================
// POST /api/nexus/stream — Real-Time SSE Streaming Chat
// ============================================================================
router.post('/stream', protect, async (req, res) => {
    const { message, brandId, voiceMode, language: clientLanguage, detectedLanguage, images } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });

    const userId = String(req.user._id);
    const language = clientLanguage || detectedLanguage || detectLanguage(message);
    const isIndian = INDIAN_LANGUAGES.has(language);
    const intentResult = classifyIntent(message);

    // SSE headers
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
    });

    const sendSSE = (event, data) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
        // Navigation / creation intents — instant response, no streaming needed
        if (intentResult.intent === 'navigate') {
            const reply = `sure! taking you to ${intentResult.target.label} 🚀`;
            sendSSE('intent', { intent: 'navigate', action: { route: intentResult.target.route, label: intentResult.target.label } });
            sendSSE('done', { reply, language });
            return res.end();
        }

        // ── Photoshoot intent — execute directly, skip LLM chat ──
        if (intentResult.intent === 'photoshoot') {
            if (!images || images.length === 0) {
                // Ask user to upload an image first
                sendSSE('done', { reply: 'to do an AI photoshoot I need a product or reference image! 📸 tap the image icon below to upload one, then say "photoshoot" again', language });
                return res.end();
            }

            // ── Credit check ──
            const creditBalance = getCreditBalance(req.user);
            const SHOOT_COST = 25; // matches DEFAULT_CREDIT_COSTS.photoshoot
            if (!creditBalance.unlimited && creditBalance.remaining < SHOOT_COST) {
                sendSSE('done', { reply: `you need ${SHOOT_COST} credits for an AI photoshoot, but you only have ${creditBalance.remaining} left 😬 upgrade your plan to continue!` });
                return res.end();
            }

            // ── History storage check ──
            const histCount = await NexusHistory.countForUser(userId);
            if (histCount >= NexusHistory.MAX_CONVERSATIONS) {
                sendSSE('done', { reply: `your history is full (${NexusHistory.MAX_CONVERSATIONS} conversations)! delete some old threads from the History panel before creating more 🗂️` });
                return res.end();
            }

            let brandContextStr = '', brandName = '';
            if (brandId) {
                try {
                    const { brandContext: ctx, brand } = await agentUtils.loadBrandContext(brandId);
                    brandContextStr = ctx || ''; brandName = brand?.name || '';
                } catch (e) { /* silent */ }
            }
            sendSSE('intent', { intent: 'photoshoot' });
            const result = await executePhotoshoot({ message, images, brandId, user: req.user, brandContext: brandContextStr, brandName, sendSSE });

            // ── Deduct credits on success ──
            if (result.success) {
                await deductCredits(userId, 'photoshoot', SHOOT_COST, brandId).catch(() => {});
                // ── Write to NexusHistory ──
                NexusHistory.create({
                    userId, brandId, subject: autoTagSubject(message), type: 'image',
                    messages: [{ role: 'user', content: message }, { role: 'assistant', content: 'AI Photoshoot generated' }],
                    outputs: [{ type: 'image', url: result.imageUrl, prompt: message }],
                }).catch(() => {});
            }

            const reply = result.success
                ? `here's your AI photoshoot! 📸 tap to zoom, download, or say 'edit' to adjust`
                : `shoot didn't work this time 😅 try uploading a clearer image and describe the setting!`;
            sendSSE('done', { reply, language });
            return res.end();
        }

        // ── Video create intent — full pipeline ──
        if (intentResult.intent === 'video_create') {
            // ── Credit check (dynamic video cost — use a floor of 34 for Seedance 5s) ──
            const creditBalance = getCreditBalance(req.user);
            const VIDEO_COST_FLOOR = 34;
            if (!creditBalance.unlimited && creditBalance.remaining < VIDEO_COST_FLOOR) {
                sendSSE('done', { reply: `you need at least ${VIDEO_COST_FLOOR} credits to create a video — you have ${creditBalance.remaining} left 😬 upgrade to continue!` });
                return res.end();
            }

            // ── History storage check ──
            const histCount = await NexusHistory.countForUser(userId);
            if (histCount >= NexusHistory.MAX_CONVERSATIONS) {
                sendSSE('done', { reply: `your history is full (${NexusHistory.MAX_CONVERSATIONS} conversations)! delete some old threads from the History panel first 🗂️` });
                return res.end();
            }

            let brandContextStr = '', brandName = '';
            if (brandId) {
                try {
                    const { brandContext: ctx, brand } = await agentUtils.loadBrandContext(brandId);
                    brandContextStr = ctx || ''; brandName = brand?.name || '';
                } catch (e) { /* silent */ }
            }
            sendSSE('intent', { intent: 'video_create' });
            const avatarUrl = req.body.avatarUrl || null;
            const result = await executeVideoCreate({ message, images, avatarUrl, brandId, user: req.user, brandContext: brandContextStr, brandName, sendSSE });

            // ── Write to NexusHistory (frames + projectId) ──
            NexusHistory.create({
                userId, brandId, subject: autoTagSubject(message), type: 'video',
                messages: [{ role: 'user', content: message }, { role: 'assistant', content: 'Video project created' }],
                outputs: [
                    ...(result.frames?.map(f => ({ type: 'image', url: f.url, prompt: f.prompt })) || []),
                    ...(result.projectId ? [{ type: 'video', url: null, prompt: `Video Studio project #${result.projectId}` }] : []),
                ],
            }).catch(() => {});

            const reply = result.success
                ? `video queued! 🎬 I've written the script, created storyboard frames, and sent it to our video engine — check Video Studio in ~90 seconds!`
                : `got the script and storyboard done! head to Video Studio to generate the final video 🎬`;
            sendSSE('done', { reply, language });
            return res.end();
        }

        // ── Image create intent — direct execution (no SIGNAL tag dependency) ──
        if (intentResult.intent === 'image_create') {
            sendSSE('intent', { intent: 'image_create', prompt: message });

            // Build brand context for the image
            let brandContextStr = '', brandName = '';
            if (brandId) {
                try {
                    const { brandContext: ctx, brand } = await agentUtils.loadBrandContext(brandId);
                    brandContextStr = ctx || ''; brandName = brand?.name || '';
                } catch (e) { /* silent */ }
            }

            sendSSE('step_update', { step: 'generating', label: '🎨 Creating your visual...' });
            try {
                const imageResult = await internalGenerateCreative({
                    body: {
                        brandId,
                        prompt: [
                            message,
                            brandName ? `for ${brandName} brand` : '',
                            brandContextStr ? brandContextStr.slice(0, 300) : '',
                            'Professional commercial quality, high resolution, vibrant',
                        ].filter(Boolean).join('. '),
                        type: 'instagram-post',
                        refImageUrls: images || [],
                        options: { imageModel: 'nanobanana-2', aspectRatio: '1:1', imageSize: '1K' },
                        source: 'nexus_image_create',
                    },
                    user: req.user,
                    creditsDeducted: 0,
                    jobId: `nexus-img-${Date.now()}`,
                });
                const imageUrl = imageResult?.creative?.imageUrl || imageResult?.imageUrl || null;
                if (imageUrl) {
                    sendSSE('image_generated', { imageUrl, prompt: message, subtype: 'generated' });
                    NexusHistory.create({
                        userId, brandId, subject: autoTagSubject(message), type: 'image',
                        messages: [{ role: 'user', content: message }, { role: 'assistant', content: 'Image generated' }],
                        outputs: [{ type: 'image', url: imageUrl, prompt: message }],
                    }).catch(() => {});
                    sendSSE('done', { reply: `here's your visual! 🎨 tap to view full-size — say 'edit' to adjust, or 'photoshoot' with a product image for brand-specific results`, language });
                } else {
                    // Fallthrough: let Fidato handle with SIGNAL tag
                    sendSSE('done', { reply: `couldn't generate that image 😅 try describing it differently, or upload a reference image!`, language });
                }
            } catch (imgErr) {
                console.error('[Nexus image_create] Failed:', imgErr.message);
                sendSSE('done', { reply: `image generation hit an error 😅 try again!`, language });
            }
            return res.end();
        }

        // ── Content create intent — dedicated copy engine ──
        if (intentResult.intent === 'content_create') {
            sendSSE('intent', { intent: 'content_create', prompt: message });
            let brandContextStr = '', brandName = '';
            if (brandId) {
                try {
                    const { brandContext: ctx, brand } = await agentUtils.loadBrandContext(brandId);
                    brandContextStr = ctx || ''; brandName = brand?.name || '';
                } catch (e) { /* silent */ }
            }
            const result = await executeContent({ message, brandId, brandContext: brandContextStr, brandName, user: req.user, sendSSE });
            const reply = result.success
                ? `here's your ${result.platform} copy! ✍️ tap Copy to use it, or hit Publish to schedule it — saved as draft in Content Studio too!`
                : `hmm, couldn't write that copy 😅 try again with more details about what you need!`;
            sendSSE('done', { reply, language });
            return res.end();
        }

        if (intentResult.intent === 'brainstorm') {
            sendSSE('intent', { intent: 'brainstorm', prompt: message });
        }

        // Chat + brainstorm — fall through to LLM streaming

        // Chat — restore history from Redis + stream the response
        const history = await getNexusHistory(userId);
        history.push({ role: 'user', content: message });
        if (history.length > NEXUS_MAX_MESSAGES) history.splice(0, history.length - NEXUS_MAX_MESSAGES);

        let brandContext = '';
        let brandName = '';
        let brandLangDirective = '';
        if (brandId) {
            try {
                const { brandContext: ctx, brand } = await agentUtils.loadBrandContext(brandId);
                brandContext = ctx || '';
                brandName = brand?.name || '';
                const langInfo = inferBrandLanguage(brand);
                brandLangDirective = buildLanguageDirective(langInfo, brandName, brand?.dna?.targetAudience || '');
            } catch (e) { /* silent */ }
        }

        // ── Brand-scoped web search (if query needs live data) ──
        let webSearchResults = '';
        if (needsWebSearch(message) && brandName) {
            sendSSE('status', { status: 'searching', message: `🔍 Researching ${brandName}...` });
            const searchData = await brandScopedWebSearch(message, brandName);
            if (searchData) {
                webSearchResults = `\n## Live Web Research (about ${brandName})\nThe following are REAL-TIME web search results. Use these to give informed, current answers:\n${searchData}\n`;
            }
        }

        const now = new Date();
        const dateStr = now.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        let streamSystemPrompt = `${brandLangDirective ? brandLangDirective + '\n\n' : ''}${NEXUS_SYSTEM_PROMPT}

Today's date: ${dateStr}
User's plan: ${req.user.plan || 'starter'}
Language: ${language}

${brandContext ? `## Active Brand Context\n${brandContext}` : '(No brand selected)'}${webSearchResults}`;

        // ── MCoT: Visual Analysis for stream (when images shared) ──
        let streamMcotAnalysis = null;
        if (images && images.length > 0) {
            try {
                console.log(`🧠 MCoT Nexus Stream: Analyzing ${images.length} shared image(s)...`);
                sendSSE('status', { status: 'analyzing', message: '🧠 Analyzing image...' });
                const mcotResult = await agentUtils.callMultimodalAgent(
                    FIDATO_VISUAL_ANALYSIS_PROMPT,
                    `The user said: "${message}"\nAnalyze the ${images.length} image(s) they shared.`,
                    images,
                    { temperature: 0.2, maxTokens: 4096 }
                );
                if (mcotResult && !mcotResult.error && !mcotResult.skipped) {
                    streamMcotAnalysis = mcotResult;
                    const visualContext = [
                        `\n## Visual Context from Shared Image (MCoT Analysis)`,
                        mcotResult.productAnalysis ? `Product: ${mcotResult.productAnalysis}` : '',
                        mcotResult.visualStyle ? `Visual Style: ${mcotResult.visualStyle}` : '',
                        mcotResult.mood ? `Mood: ${mcotResult.mood}` : '',
                        mcotResult.marketingInsight ? `Marketing Insight: ${mcotResult.marketingInsight}` : '',
                        mcotResult.colorPalette?.length ? `Colors: ${mcotResult.colorPalette.join(', ')}` : '',
                    ].filter(Boolean).join('\n');
                    streamSystemPrompt += visualContext;
                    console.log(`🧠 MCoT Nexus Stream: Visual analysis complete — type: ${mcotResult.imageType || 'unknown'}`);
                }
            } catch (mcotErr) {
                console.warn('🧠 MCoT Nexus Stream: Visual analysis error (non-blocking):', mcotErr.message);
            }
        }

        let fullReply = '';

        // ── Try Grok streaming (English / fallback) OR Gemini (vision) ──
        const grokKey = process.env.GROK_API_KEY;
        let streamed = false;

        // IF images are present, bypass Grok and use Gemini strictly for Vision
        if (images && images.length > 0) {
            console.log(`🖼️ Nexus Stream: Image detected, routing to Gemini Vision...`);
            try {
                const ai = getRouter();
                const userPrompt = history.map(m => `${m.role === 'user' ? 'User' : 'Fidato'}: ${m.content}`).join('\n') + '\n\nRespond as Fidato.';
                const result = await ai.generateText(
                    { systemPrompt: streamSystemPrompt, userPrompt, images, maxTokens: 2000, temperature: 0.8 },
                    { provider: 'gemini' } // Force Gemini for vision
                );
                fullReply = result.text || result.content || '';
                // streamed is still false — the simulator below will stream it word-by-word
            } catch (visionErr) {
                console.error('Nexus stream: Gemini Vision failed:', visionErr.message);
            }
        }
        // OTHERWISE, use Grok as usual
        else if (!isIndian && grokKey) {
            // Use the MCoT-enriched system prompt
            const grokSystemPrompt = streamSystemPrompt;
            try {
                const grokMessages = [
                    { role: 'system', content: grokSystemPrompt },
                    ...history.map((m, idx) => {
                        const isLast = idx === history.length - 1;
                        if (isLast && m.role === 'user' && images?.length) {
                            const content = [{ type: 'text', text: m.content }];
                            images.forEach(img => content.push({ type: 'image_url', image_url: { url: img } }));
                            return { role: 'user', content };
                        }
                        return {
                            role: m.role === 'user' ? 'user' : 'assistant',
                            content: m.content,
                        };
                    }),
                ];

                const grokResp = await fetch('https://api.x.ai/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${grokKey}`,
                    },
                    body: JSON.stringify({
                        model: images?.length ? 'grok-2-vision-1212' : 'grok-3-fast',
                        messages: grokMessages,
                        max_tokens: 2000,
                        temperature: 0.8,
                        stream: true,
                        search_parameters: {
                            mode: 'auto',
                            return_citations: false,
                        },
                    }),
                });

                if (grokResp.ok) {
                    const reader = grokResp.body.getReader();
                    const decoder = new TextDecoder();
                    let buffer = '';

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split('\n');
                        buffer = lines.pop() || '';

                        for (const line of lines) {
                            if (!line.startsWith('data: ')) continue;
                            const payload = line.slice(6).trim();
                            if (payload === '[DONE]') continue;

                            try {
                                const chunk = JSON.parse(payload);
                                const token = chunk.choices?.[0]?.delta?.content;
                                if (token) {
                                    fullReply += token;
                                    sendSSE('token', { token });
                                }
                            } catch { /* skip malformed */ }
                        }
                    }
                    streamed = true;
                }
            } catch (err) {
                console.warn('Nexus stream: Grok failed:', err.message);
            }
        }

        // ── Indian languages → Sarvam (non-streaming, but we chunk the response) ──
        if (!streamed && isIndian) {
            console.log(`🇮🇳 Nexus stream → Sarvam AI (${language})`);
            const smartRouter = getSmartRouter();
            const userPrompt = history.map(m => `${m.role === 'user' ? 'User' : 'Fidato'}: ${m.content}`).join('\n') + '\n\nRespond as Fidato.';
            try {
                const result = await smartRouter.generateText(
                    { systemPrompt: streamSystemPrompt, userPrompt, temperature: 0.7, maxTokens: 2000 },
                    { language, taskType: 'social' }
                );
                fullReply = result.text || '';
            } catch (err) {
                console.warn('Sarvam Nexus stream failed:', err.message);
            }
        }

        // ── Final fallback (non-streaming) ──
        if (!streamed && !fullReply) {
            const ai = getRouter();
            const userPrompt = history.map(m => `${m.role === 'user' ? 'User' : 'Fidato'}: ${m.content}`).join('\n') + '\n\nRespond as Fidato.';
            const result = await ai.generateText({ systemPrompt: streamSystemPrompt, userPrompt, maxTokens: 2000, temperature: 0.7 });
            fullReply = result.text || result.content || 'hmm something glitched 😊';
        }

        // For non-streamed responses, simulate streaming by sending word-by-word
        if (!streamed && fullReply) {
            const words = fullReply.split(/(\s+)/);
            for (const word of words) {
                sendSSE('token', { t: word });
            }
        }

        // Strip <think> tags (LLM chain-of-thought reasoning)
        // Only strip CLOSED <think>...</think> blocks, then remove bare tags
        fullReply = fullReply
            .replace(/<think>[\s\S]*?<\/think>/gi, '')
            .replace(/<\/?think>/gi, '')
            .trim();

        // Strip markdown from full reply
        fullReply = fullReply
            .replace(/```[\s\S]*?```/g, '')
            .replace(/`([^`]+)`/g, '$1')
            .replace(/^#{1,6}\s+/gm, '')
            .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
            .replace(/\*\*(.+?)\*\*/g, '$1')
            .replace(/\*(.+?)\*/g, '$1')
            .replace(/__(.+?)__/g, '$1')
            .replace(/_(.+?)_/g, '$1')
            .replace(/~~(.+?)~~/g, '$1')
            .replace(/^\s*[-*+]\s+/gm, '→ ')
            .replace(/^\s*\d+\.\s+/gm, '→ ')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .replace(/^>\s?/gm, '')
            .replace(/---+/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

        // Persist stream reply to Redis (same key as /chat — both handlers share history)
        history.push({ role: 'assistant', content: fullReply });
        await saveNexusHistory(userId, history);

        // ── Image Signal: parse [SIGNAL: CREATE_IMAGE | prompt: ...] from full reply ──
        // Must run AFTER markdown strip so the signal tag survives the regex passes above
        const { cleanReply: streamCleanReply, imageUrl: streamImageUrl, imagePrompt: streamImagePrompt } =
            await parseAndExecuteImageSignal(fullReply, userId, brandId, req.user);
        if (streamImageUrl) {
            sendSSE('image_generated', { imageUrl: streamImageUrl, prompt: streamImagePrompt });
        }

        // DO NOT send TTS through SSE (200KB+ base64 breaks stream parsing)
        // Frontend calls /api/nexus/tts separately

        // ── NexusHistory write-back for LLM-handled intents ──
        try {
            const intentType = intentToHistoryType(intentResult?.intent);
            const histCount = await NexusHistory.countForUser(userId);
            if (histCount < NexusHistory.MAX_CONVERSATIONS) {
                const outputs = [];
                if (streamImageUrl) outputs.push({ type: 'image', url: streamImageUrl, prompt: streamImagePrompt });
                if (intentType === 'content' && streamCleanReply) outputs.push({ type: 'content', url: null, prompt: streamCleanReply.slice(0, 500) });
                NexusHistory.create({
                    userId, brandId,
                    subject: autoTagSubject(message),
                    type: intentType,
                    messages: [
                        { role: 'user', content: message },
                        { role: 'assistant', content: streamCleanReply?.slice(0, 1000) || '' },
                    ],
                    outputs,
                }).catch(() => {});
            }
        } catch { /* non-blocking */ }

        // Send final done event
        sendSSE('done', {
            reply: streamCleanReply,
            language,
            voiceReady: voiceMode, // tells frontend to call /tts
            mcotAnalysis: streamMcotAnalysis || undefined,
        });


    } catch (error) {
        console.error('Nexus stream error:', error.message);
        sendSSE('error', { message: 'oops, something glitched! try again? 😊' });
    }

    res.end();
});

// ============================================================================
// POST /api/nexus/upload-image — Upload user image to S3 (user/brand scoped)
// Accepts multipart/form-data: field "image" (file) + "brandId" (body)
// Returns: { success, imageUrl, key }
// ============================================================================
router.post('/upload-image', protect, nexusUpload.single('image'), async (req, res) => {
    try {
        const file = req.file;
        if (!file) return res.status(400).json({ success: false, error: 'No image file provided' });

        const userId = String(req.user._id);
        const brandId = req.body.brandId || 'default';
        const ext = file.mimetype.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
        const s3Key = `users/${userId}/brands/${brandId}/nexus/uploads/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;

        console.log(`📤 [Nexus Upload] ${userId} → S3: ${s3Key} (${(file.size / 1024).toFixed(1)}KB)`);
        const imageUrl = await uploadToS3(file.buffer, s3Key, file.mimetype);

        res.json({ success: true, imageUrl, key: s3Key });
    } catch (err) {
        console.error('Nexus upload-image error:', err.message);
        res.status(500).json({ success: false, error: 'Image upload failed. Please try again.' });
    }
});

// ============================================================================
// POST /api/nexus/tts — Dedicated Text-to-Speech endpoint
// ============================================================================
router.post('/tts', protect, async (req, res) => {
    try {
        const { text, language } = req.body;
        if (!text) return res.status(400).json({ error: 'Text is required' });

        // Strip <think> tags before TTS
        const cleanText = text
            .replace(/<think>[\s\S]*?<\/think>/gi, '')
            .replace(/<\/?think>/gi, '')
            .trim();

        if (!cleanText) return res.status(400).json({ error: 'No speakable text' });

        const ttsData = await generateTTS(cleanText, language || 'english');

        if (!ttsData) {
            return res.status(500).json({ error: 'TTS generation failed' });
        }

        // Return the WAV file directly as binary (not JSON)
        const audioBuffer = Buffer.from(ttsData.audio, 'base64');
        res.set({
            'Content-Type': 'audio/wav',
            'Content-Length': audioBuffer.length,
            'Cache-Control': 'no-cache',
        });
        res.send(audioBuffer);
    } catch (error) {
        console.error('Nexus TTS error:', error.message);
        res.status(500).json({ error: 'TTS generation failed' });
    }
});

// ============================================================================
// POST /api/nexus/briefing — Morning Briefing (migrated from fidato.js)
// ============================================================================
router.post('/briefing', protect, async (req, res) => {
    try {
        const { brandId } = req.body;
        const ai = getRouter();
        const user = req.user;
        const firstName = (user.name || 'there').split(' ')[0];

        const hour = new Date().getHours();
        let timeGreeting = 'hey';
        if (hour >= 4 && hour < 12) timeGreeting = 'good morning';
        else if (hour >= 12 && hour < 17) timeGreeting = 'good afternoon';
        else if (hour >= 17 && hour < 21) timeGreeting = 'good evening';
        else timeGreeting = 'hey night owl';

        let brandSummary = '';
        let brandName = '';
        if (brandId) {
            try {
                const { brand, products } = await agentUtils.loadBrandContext(brandId);
                if (brand) {
                    brandName = brand.name || '';
                    const dna = brand.dna || {};
                    const imageCount = (dna.brandImages?.length || 0) + (dna.bannerImages?.length || 0);
                    const knowledgeCount = brand.knowledge?.entries?.length || 0;
                    const productCount = products?.length || 0;
                    const colorCount = dna.colors?.length || 0;
                    const hasVoice = !!dna.voice?.personality;
                    const lastUpdated = brand.updatedAt ? new Date(brand.updatedAt).toLocaleDateString() : 'unknown';

                    brandSummary = `Brand: ${brandName}
Industry: ${dna.industry || 'not set'}
Images: ${imageCount}, Products: ${productCount}, Knowledge entries: ${knowledgeCount}
Colors: ${colorCount}, Voice defined: ${hasVoice ? 'yes' : 'no'}
Last updated: ${lastUpdated}
Description: ${dna.brandDescription || 'not set'}`;
                }
            } catch (e) {
                console.warn('Nexus briefing: brand load error:', e.message);
            }
        }

        const briefingPrompt = `You are Fidato, generating a SHORT morning briefing popup for ${firstName}. Be warm, fun, and inspiring.

Current time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
User plan: ${user.plan || 'starter'}
Credits used: ${user.credits?.used || 0} / ${user.credits?.total || 50}
Content generated: ${user.usage?.contentGenerated || 0}
Creatives generated: ${user.usage?.creativesGenerated || 0}
${brandSummary ? `\nActive brand:\n${brandSummary}` : '\nNo brand selected yet.'}

Generate a briefing in this EXACT JSON format (no markdown, no code blocks, just raw JSON):
{
  "greeting": "A warm, personalized 1-line greeting using their first name",
  "daySpecial": "Something special about today — marketing holiday, inspiration, fun fact. 1 line.",
  "brandHealth": "1-2 line brand status summary. If no brand, encourage creating one.",
  "inspiration": "A powerful 1-line branding/marketing quote.",
  "suggestions": ["Specific actionable suggestion 1", "Suggestion 2", "Suggestion 3"]
}`;

        const result = await ai.generateText({
            systemPrompt: 'You are a JSON generator. Output ONLY valid JSON, no markdown, no explanation.',
            userPrompt: briefingPrompt,
            maxTokens: 600,
            temperature: 0.8,
        });

        const raw = (result.text || result.content || '{}')
            .replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

        let briefing;
        try {
            briefing = JSON.parse(raw);
        } catch {
            briefing = {
                greeting: `${timeGreeting} ${firstName}! 🌟`,
                daySpecial: 'today is a great day to build something amazing for your brand! 🎨',
                brandHealth: brandName ? `${brandName} is looking good — keep the momentum going!` : 'no brand selected yet — let\'s get one set up!',
                inspiration: '"The best marketing doesn\'t feel like marketing." — Tom Fishburne',
                suggestions: [
                    'Review your brand DNA and add any missing details',
                    'Try brainstorming a new campaign idea',
                    'Check your content calendar for this week',
                ],
            };
        }

        await User.findByIdAndUpdate(user._id, { lastActive: new Date() });

        res.json({
            success: true,
            briefing,
            brandName,
            preferences: {
                fidatoPopup: user.preferences?.fidatoPopup ?? true,
                fidatoEnabled: user.preferences?.fidatoEnabled ?? true,
            },
        });
    } catch (error) {
        console.error('Nexus briefing error:', error.message);
        res.json({
            success: true,
            briefing: {
                greeting: 'hey there! 🌟',
                daySpecial: 'today is a perfect day to level up your brand game 🚀',
                brandHealth: 'let\'s check in on how things are going!',
                inspiration: '"Your brand is what people say about you when you\'re not in the room." — Jeff Bezos',
                suggestions: ['Explore your brand DNA', 'Try the Creative Studio', 'Chat with me about your brand strategy!'],
            },
            preferences: { fidatoPopup: true, fidatoEnabled: true },
        });
    }
});

// ============================================================================
// GET /api/nexus/notifications — Proactive Brand Health Alerts
// ============================================================================
router.get('/notifications', protect, async (req, res) => {
    try {
        const brandId = req.query.brandId;
        const notifications = [];

        if (brandId) {
            try {
                const { brand, products } = await agentUtils.loadBrandContext(brandId);
                if (brand) {
                    const dna = brand.dna || {};

                    if (!dna.brandDescription) {
                        notifications.push({
                            type: 'missing_description', severity: 'warning',
                            message: `${brand.name} doesn't have a brand description yet — this helps AI generate better content!`,
                            action: 'Let\'s add a brand description', route: '/brand-dna',
                        });
                    }

                    if (!dna.voice?.personality) {
                        notifications.push({
                            type: 'missing_voice', severity: 'warning',
                            message: 'Brand voice isn\'t defined yet — defining it helps all AI content match your style!',
                            action: 'Define brand voice', route: '/brand-dna',
                        });
                    }

                    if (!dna.colors?.length) {
                        notifications.push({
                            type: 'missing_colors', severity: 'info',
                            message: 'No brand colors extracted — add them to keep all visuals on-brand!',
                            action: 'Add brand colors', route: '/brand-dna',
                        });
                    }

                    const imageCount = (dna.brandImages?.length || 0) + (dna.bannerImages?.length || 0);
                    if (imageCount === 0) {
                        notifications.push({
                            type: 'no_images', severity: 'info',
                            message: 'No brand images yet — scan your website or upload images to build your visual library!',
                            action: 'Add brand images', route: '/brand-dna',
                        });
                    }

                    if (!products || products.length === 0) {
                        notifications.push({
                            type: 'no_products', severity: 'info',
                            message: 'No products added yet — adding products helps with product-specific content!',
                            action: 'Add products', route: '/brand-dna',
                        });
                    }

                    const lastUpdate = brand.updatedAt ? new Date(brand.updatedAt) : null;
                    if (lastUpdate) {
                        const daysSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
                        if (daysSinceUpdate > 14) {
                            notifications.push({
                                type: 'stale_brand', severity: 'warning',
                                message: `${brand.name} hasn't been updated in ${Math.floor(daysSinceUpdate)} days — keeping things fresh helps AI stay sharp!`,
                                action: 'Review brand DNA', route: '/brand-dna',
                            });
                        }
                    }
                }
            } catch (e) {
                console.warn('Nexus notifications: brand check error:', e.message);
            }
        }

        // Credit warning
        const user = req.user;
        const creditsRemaining = Math.max(0, (user.credits?.total || 50) + (user.credits?.bonus || 0) - (user.credits?.used || 0));
        if (creditsRemaining <= 5) {
            notifications.push({
                type: 'low_credits', severity: 'warning',
                message: `Only ${creditsRemaining} credits left! You might want to upgrade your plan.`,
                action: 'Check plans', route: '/credits',
            });
        }

        res.json({ success: true, notifications, count: notifications.length });
    } catch (error) {
        console.error('Nexus notifications error:', error.message);
        res.json({ success: true, notifications: [], count: 0 });
    }
});

// ============================================================================
// GET /api/nexus/history — List conversation threads for the user
// ============================================================================
router.get('/history', protect, async (req, res) => {
    try {
        const userId = req.user._id;
        const { brandId, type, limit = 20 } = req.query;
        const query = { userId, isDeleted: false };
        if (brandId) query.brandId = brandId;
        if (type) query.type = type;

        const threads = await NexusHistory
            .find(query)
            .sort({ updatedAt: -1 })
            .limit(parseInt(limit))
            .select('subject type outputs isPinned createdAt updatedAt brandId')
            .lean();

        res.json({ success: true, threads, count: threads.length });
    } catch (err) {
        console.error('Nexus history GET error:', err.message);
        res.json({ success: true, threads: [], count: 0 });
    }
});

// ============================================================================
// GET /api/nexus/history/:id — Get a single thread with full messages
// ============================================================================
router.get('/history/:id', protect, async (req, res) => {
    try {
        const thread = await NexusHistory.findOne({ _id: req.params.id, userId: req.user._id, isDeleted: false });
        if (!thread) return res.status(404).json({ success: false, error: 'Thread not found' });
        res.json({ success: true, thread });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

// ============================================================================
// DELETE /api/nexus/history/:id — Soft-delete a conversation thread
// ============================================================================
router.delete('/history/:id', protect, async (req, res) => {
    try {
        await NexusHistory.findOneAndUpdate(
            { _id: req.params.id, userId: req.user._id },
            { isDeleted: true }
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

// ============================================================================
// PATCH /api/nexus/history/:id — Rename subject of a thread
// ============================================================================
router.patch('/history/:id', protect, async (req, res) => {
    try {
        const { subject, isPinned } = req.body;
        const update = {};
        if (subject) update.subject = subject.slice(0, 120);
        if (typeof isPinned === 'boolean') update.isPinned = isPinned;
        await NexusHistory.findOneAndUpdate({ _id: req.params.id, userId: req.user._id }, update);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

// ============================================================================
// GET /api/nexus/history/count — Check if user is at the storage limit
// ============================================================================
router.get('/history/count', protect, async (req, res) => {
    try {
        const count = await NexusHistory.countForUser(req.user._id);
        const max = NexusHistory.MAX_CONVERSATIONS;
        res.json({ success: true, count, max, isFull: count >= max });
    } catch (err) {
        res.json({ success: true, count: 0, max: 20, isFull: false });
    }
});

// ============================================================================
// POST /api/nexus/preferences — Update Fidato/Nexus settings
// ============================================================================
router.post('/preferences', protect, async (req, res) => {
    try {
        const { fidatoPopup, fidatoEnabled } = req.body;
        const update = {};
        if (typeof fidatoPopup === 'boolean') update['preferences.fidatoPopup'] = fidatoPopup;
        if (typeof fidatoEnabled === 'boolean') update['preferences.fidatoEnabled'] = fidatoEnabled;

        if (Object.keys(update).length > 0) {
            await User.findByIdAndUpdate(req.user._id, { $set: update });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Nexus preferences error:', error.message);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ============================================================================
// POST /api/nexus/clear — Clear conversation history
// ============================================================================
router.post('/clear', protect, async (req, res) => {
    await clearNexusHistory(String(req.user._id));
    res.json({ success: true });
});

export default router;

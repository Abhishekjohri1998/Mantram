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
import { loadBrandContext } from '../agents/shared/agentUtils.js';
import User from '../models/User.js';
import { safeErrorMessage } from '../utils/safeError.js';

const router = Router();

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

### Creative Direction — YOU DO IT
→ Describe image concepts in vivid detail with art direction (mood, colors, composition, style)
→ Create creative briefs for campaigns
→ Design banner/poster concepts with detailed visual descriptions
→ Suggest photoshoot directions and visual themes

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
NEVER use markdown. No **bold**, no *italic*, no ## headers, no bullet points with -, no numbered lists, no backticks, no code blocks.
Write like you're texting. Plain text. Line breaks between thoughts. Emojis for emphasis. Use → for list items if needed.

## Language Rules
→ ALWAYS respond in the SAME LANGUAGE the user writes in
→ Hindi → Devanagari. English → English. Hinglish → Hinglish.

## Response Length
→ Quick questions → 2-3 sentences
→ Strategy/advice → 2-4 paragraphs
→ Content creation → as long as needed to deliver a complete, polished piece
→ Brainstorming → 5-10 ideas with brief descriptions`;

// Conversation history per user (in-memory)
const conversationHistory = new Map();

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

    // Content creation intents (Phase 2 — for now just flag them)
    if (/\b(write|create|generate|draft)\s+(a\s+)?(post|blog|caption|article|newsletter|content|copy)\b/i.test(lower)) {
        return { intent: 'content_create', studioTarget: 'content' };
    }

    // Image creation intents (Phase 2)
    if (/\b(create|generate|design|make)\s+(a\s+)?(image|banner|poster|creative|graphic|photoshoot)\b/i.test(lower)) {
        return { intent: 'image_create', studioTarget: 'creative' };
    }

    // Brainstorm intents
    if (/\b(brainstorm|ideate|campaign\s+ideas?|strategy\s+for)\b/i.test(lower)) {
        return { intent: 'brainstorm', studioTarget: 'brainstorm' };
    }

    // Default — treat as chat
    return { intent: 'chat' };
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
        // Get/create conversation history
        if (!conversationHistory.has(userId)) {
            conversationHistory.set(userId, []);
        }
        const history = conversationHistory.get(userId);
        history.push({ role: 'user', content: message });
        if (history.length > 20) history.splice(0, history.length - 20);

        // Load brand context
        let brandContext = '';
        let brandName = '';
        if (brandId) {
            try {
                const { brandContext: ctx, brand } = await loadBrandContext(brandId);
                brandContext = ctx || '';
                brandName = brand?.name || '';
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

        const systemPrompt = `${NEXUS_SYSTEM_PROMPT}

Today's date: ${dateStr}
User's plan: ${req.user.plan || 'starter'}
Language: ${language}

${brandContext ? `## Active Brand Context\n${brandContext}` : '(No brand selected)'}${webSearchResults}`;

        let rawReply;

        // Indian languages → Sarvam AI
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

        // English / fallback → Grok (live knowledge)
        if (!rawReply) {
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
                            model: images?.length ? 'grok-2-vision-1212' : 'grok-3-mini-fast',
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

        // Save to history
        history.push({ role: 'assistant', content: reply });

        // TTS if voice mode active — Sarvam handles ALL languages including English
        let ttsData = null;
        if (voiceMode) {
            ttsData = await generateTTS(reply, language);
        }

        res.json({
            reply,
            intent: 'chat',
            language,
            name: 'Fidato',
            tts: ttsData,
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

        // Creation intents — fall through to LLM streaming so Fidato handles them directly

        // Chat — stream the response
        if (!conversationHistory.has(userId)) conversationHistory.set(userId, []);
        const history = conversationHistory.get(userId);
        history.push({ role: 'user', content: message });
        if (history.length > 20) history.splice(0, history.length - 20);

        let brandContext = '';
        let brandName = '';
        if (brandId) {
            try {
                const { brandContext: ctx, brand } = await loadBrandContext(brandId);
                brandContext = ctx || '';
                brandName = brand?.name || '';
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

        const systemPrompt = `${NEXUS_SYSTEM_PROMPT}

Today's date: ${dateStr}
User's plan: ${req.user.plan || 'starter'}
Language: ${language}

${brandContext ? `## Active Brand Context\n${brandContext}` : '(No brand selected)'}${webSearchResults}`;

        let fullReply = '';

        // ── Try Grok streaming (English / fallback) ──
        const grokKey = process.env.GROK_API_KEY;
        let streamed = false;

        if (!isIndian && grokKey) {
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
                                    sendSSE('token', { t: token });
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
                    { systemPrompt, userPrompt, temperature: 0.7, maxTokens: 2000 },
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
            const result = await ai.generateText({ systemPrompt, userPrompt, maxTokens: 2000, temperature: 0.7 });
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

        // Save to conversation history
        history.push({ role: 'assistant', content: fullReply });

        // DO NOT send TTS through SSE (200KB+ base64 breaks stream parsing)
        // Frontend calls /api/nexus/tts separately

        // Send final done event
        sendSSE('done', {
            reply: fullReply,
            language,
            voiceReady: voiceMode, // tells frontend to call /tts
        });

    } catch (error) {
        console.error('Nexus stream error:', error.message);
        sendSSE('error', { message: 'oops, something glitched! try again? 😊' });
    }

    res.end();
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
                const { brand, products } = await loadBrandContext(brandId);
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
                const { brand, products } = await loadBrandContext(brandId);
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
router.post('/clear', protect, (req, res) => {
    conversationHistory.delete(String(req.user._id));
    res.json({ success: true });
});

export default router;

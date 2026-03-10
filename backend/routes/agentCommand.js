import { Router } from 'express';
import { optionalAuth } from '../middleware/auth.js';
import { safeErrorMessage } from '../utils/safeError.js';

const router = Router();

// ============================================================================
// AI HELPER (same pattern as brainstorm-studio)
// ============================================================================
async function aiCall(systemPrompt, userPrompt, options = {}) {
    const { temperature = 0.7, maxTokens = 4096, json = false } = options;

    // Try Claude first (best at intent classification & reasoning)
    if (process.env.ANTHROPIC_API_KEY) {
        try {
            const resp = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': process.env.ANTHROPIC_API_KEY,
                    'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify({
                    model: process.env.DEFAULT_TEXT_MODEL || 'claude-sonnet-4-20250514',
                    max_tokens: maxTokens,
                    system: systemPrompt,
                    messages: [{ role: 'user', content: userPrompt }],
                    ...(json ? {} : {}),
                }),
            });
            const data = await resp.json();
            if (data.content?.[0]?.text) return data.content[0].text;
            if (data.error) console.warn('Claude failed:', data.error.message);
        } catch (e) {
            console.warn('Claude error:', e.message);
        }
    }

    // Fallback to GPT-4o-mini
    if (process.env.OPENAI_API_KEY) {
        try {
            const resp = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt },
                    ],
                    temperature,
                    max_tokens: maxTokens,
                    ...(json ? { response_format: { type: 'json_object' } } : {}),
                }),
            });
            const data = await resp.json();
            if (data.choices?.[0]?.message?.content) return data.choices[0].message.content;
        } catch (e) {
            console.warn('GPT fallback error:', e.message);
        }
    }

    // Fallback to Gemini
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey) {
        try {
            const resp = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        systemInstruction: { parts: [{ text: systemPrompt }] },
                        contents: [{ parts: [{ text: userPrompt }] }],
                        generationConfig: {
                            temperature,
                            maxOutputTokens: maxTokens,
                            ...(json ? { responseMimeType: 'application/json' } : {}),
                        },
                    }),
                }
            );
            const data = await resp.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) return text;
        } catch (e) {
            console.warn('Gemini fallback error:', e.message);
        }
    }

    throw new Error('All AI models failed');
}

function parseJSON(text) {
    let clean = text.trim();
    if (clean.startsWith('```')) {
        clean = clean.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }
    return JSON.parse(clean);
}

// ============================================================================
// NAVIGATION MAP — for "open X" commands
// ============================================================================
const NAV_MAP = {
    'dashboard': '/dashboard',
    'home': '/dashboard',
    'content studio': '/content-studio',
    'content': '/content-studio',
    'write': '/content-studio',
    'creative studio': '/creative-studio',
    'creative': '/creative-studio',
    'design': '/creative-studio',
    'canvas': '/creative-studio/editor',
    'editor': '/creative-studio/editor',
    'brainstorm': '/brainstorm',
    'brainstorm studio': '/brainstorm',
    'ideas': '/brainstorm',
    'calendar': '/smart-calendar',
    'smart calendar': '/smart-calendar',
    'schedule': '/publish',
    'publish': '/publish',
    'seo': '/seo-studio',
    'seo studio': '/seo-studio',
    'conversations': '/conversations',
    'messages': '/conversations',
    'dms': '/conversations',
    'integrations': '/integrations',
    'brand': '/brand-dna',
    'brand dna': '/brand-dna',
    'nexus': '/nexus',
    'analytics': '/analytics',
    'onboarding': '/onboarding',
    'add brand': '/onboarding',
    'new brand': '/onboarding',
    'credits': '/credits',
    'settings': '/admin',
};

// ============================================================================
// POST /api/agent-command/chat — Main agentic endpoint
// ============================================================================
router.post('/chat', optionalAuth, async (req, res) => {
    try {
        const { message, history = [], brand } = req.body;
        if (!message?.trim()) {
            return res.status(400).json({ success: false, error: 'Message is required' });
        }

        const userMsg = message.trim();

        // ===== Quick navigation check (no AI needed) =====
        const lowerMsg = userMsg.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
        for (const [key, path] of Object.entries(NAV_MAP)) {
            if (lowerMsg === key || lowerMsg === `open ${key}` || lowerMsg === `go to ${key}` ||
                lowerMsg === `show ${key}` || lowerMsg === `take me to ${key}`) {
                return res.json({
                    success: true,
                    type: 'navigate',
                    message: `Opening ${key.charAt(0).toUpperCase() + key.slice(1)} for you! 🚀`,
                    path,
                });
            }
        }

        // ===== Build brand context =====
        const dna = brand?.dna || {};
        const brandContext = brand ? [
            `Brand: ${brand.name}`,
            dna.industry ? `Industry: ${dna.industry}` : '',
            dna.brandDescription ? `Description: ${dna.brandDescription}` : '',
            dna.targetAudience ? `Target Audience: ${dna.targetAudience}` : '',
            dna.voice?.personality ? `Voice: ${dna.voice.personality}` : '',
            dna.tagline ? `Tagline: "${dna.tagline}"` : '',
            dna.country ? `Country: ${dna.country}` : '',
        ].filter(Boolean).join('\n') : 'No brand context available.';

        // ===== Build conversation history =====
        const historyText = history.map(m =>
            `${m.role === 'user' ? 'USER' : 'MANTRAM AI'}: ${m.text}`
        ).join('\n');

        // ===== AI Classification + Response =====
        const systemPrompt = `You are "Mantram AI" — a smart, friendly creative assistant for a marketing platform. You help users create content, generate visuals, brainstorm ideas, and navigate the platform.

BRAND CONTEXT:
${brandContext}

YOUR CAPABILITIES:
1. CONTENT — Write social media posts, blog articles, ad copy, email campaigns, product descriptions
2. CREATIVE — Generate images, product visuals, ad banners, social media graphics
3. BRAINSTORM — Campaign ideas, naming, positioning, festival campaigns, ad films, trend hijacking
4. NAVIGATE — Open pages in the platform (Content Studio, Creative Studio, Calendar, etc.)
5. QUESTION — Answer questions about the brand, marketing strategy, or the platform

BEHAVIOR:
- You are warm, professional, and proactive — like a smart creative partner
- If the user's request is CLEAR enough to produce output immediately, DO IT. Don't ask unnecessary questions.
- If you need 1-2 critical details to do a great job, ask a SHORT clarifying question. Never ask more than 2 questions at a time.
- When generating content, make it brand-aware — match the voice, tone, and style from the brand DNA.
- For image/creative requests: write the imagePrompt as ONE flowing natural-language paragraph describing what the final design looks like. Write it like you are describing a photograph to a painter.
  CRITICAL RULES FOR imagePrompt:
  • Describe visuals ONLY: scene, composition, mood, colors (as adjectives like "warm teal background"), imagery, text placement
  • NEVER include ANY of these in the prompt: hex codes, font names, pixel dimensions, aspect ratios, color labels, palette descriptions, structured lists, metadata labels
  • NEVER write things like "Brand:", "Font:", "Color:", "Style:" — these get rendered as visible text in the image
  • The image AI will render every noun as visible text — so do NOT name fonts, do NOT list colors as labels, do NOT add any structured data
  • The imagePrompt should read like: "A vibrant poster with warm teal gradients and coral accents showing a family celebrating Holi, with bold text reading 'Happy Holi' centrally placed"
- Keep responses concise and actionable.

CONVERSATION HISTORY:
${historyText || '(New conversation)'}

RESPONSE FORMAT — respond in STRICT JSON:
{
  "type": "result" | "question" | "navigate",
  "intent": "content" | "creative" | "brainstorm" | "navigate" | "question",
  "message": "Your response text (plain text only, no markdown formatting like **bold** or *italic*)",
  "data": {
    // For content: { "content": "the generated text", "type": "social|blog|ad|email", "platform": "instagram|linkedin|twitter|etc" }
    // For creative: { "imagePrompt": "detailed visual scene description for AI image generation — NO hex codes, NO size labels, NO color swatches", "aspectRatio": "1:1|16:9|9:16|4:5" }
    // For brainstorm: { "ideas": [{ "title": "...", "description": "..." }] }
    // For navigate: { "path": "/route-path" }
    // For question answers or follow-up questions: null
  },
  "suggestions": ["Follow-up action 1", "Follow-up action 2", "Follow-up action 3"]
}`;

        const result = await aiCall(systemPrompt, `USER: ${userMsg}`, { json: true, temperature: 0.7 });
        const parsed = parseJSON(result);

        // If it's a content result, also generate the actual content
        if (parsed.type === 'result' && parsed.intent === 'content' && parsed.data?.content) {
            // Content is already in the response
        }

        // If it's a creative result with an image prompt, try to actually generate the image
        if (parsed.type === 'result' && parsed.intent === 'creative' && parsed.data?.imagePrompt) {
            // Clean the prompt: strip any metadata the AI might still include
            let cleanPrompt = parsed.data.imagePrompt
                .replace(/#[0-9A-Fa-f]{6}\b/g, '') // remove hex color codes
                .replace(/\b\d{3,4}\s*[x×]\s*\d{3,4}\b/gi, '') // remove dimension strings
                .replace(/\b(instagram|facebook|linkedin|youtube|twitter)\s*(post|story|ad|banner|thumbnail|creative)\b/gi, '') // remove platform labels
                .replace(/color\s*(palette|swatch|code|reference|panel|circle)s?\b/gi, '') // remove color palette references
                .replace(/\b(hex|rgb|cmyk)\b/gi, '') // remove color format references
                .trim();

            // Append strict anti-render suffix
            cleanPrompt += '\n\nThe output must be ONLY the design itself, edge-to-edge, filling the entire canvas. Do NOT add color swatches, color circles, color labels, palette panels, title cards, dimension text, mockup frames, or any elements outside the design.';

            try {
                const { getRouter } = await import('../ai/router.js');
                const aiRouter = getRouter();
                const imageResult = await aiRouter.generateImage({
                    prompt: cleanPrompt,
                    size: parsed.data.aspectRatio === '9:16' ? '1024x1792' :
                        parsed.data.aspectRatio === '16:9' ? '1792x1024' :
                            parsed.data.aspectRatio === '4:5' ? '1024x1792' : '1024x1024',
                });
                if (imageResult?.imageUrl) {
                    parsed.data.imageUrl = imageResult.imageUrl;
                }
            } catch (imgErr) {
                console.warn('Image generation in agent-command failed:', imgErr.message);
                // Still return the prompt, user can use it in Creative Studio
            }
        }

        res.json({ success: true, ...parsed });
    } catch (error) {
        console.error('Agent command error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

export default router;

import { Router } from 'express';
import { optionalAuth } from '../middleware/auth.js';
import { safeErrorMessage } from '../utils/safeError.js';

const router = Router();

// ============================================================================
// AI HELPER (same pattern as brainstorm-studio)
// ============================================================================
async function aiCall(systemPrompt, userPrompt, options = {}) {
    const { temperature = 0.7, maxTokens = 4096, json = false, timeout = 600000 } = options;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
        // Try Gemini first (cheapest and fast)
        const geminiKey = process.env.GEMINI_API_KEY;
        if (geminiKey) {
            try {
                const resp = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
                    {
                        method: 'POST',
                        signal: controller.signal,
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
                if (e.name === 'AbortError') throw e;
                console.warn('Gemini error:', e.message);
            }
        }

        // Fallback to GPT-4o-mini
        if (process.env.OPENAI_API_KEY) {
            try {
                const resp = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    signal: controller.signal,
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
                if (e.name === 'AbortError') throw e;
                console.warn('GPT fallback error:', e.message);
            }
        }

        // Last resort: Claude (premium — most expensive)
        if (process.env.ANTHROPIC_API_KEY) {
            try {
                const resp = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    signal: controller.signal,
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': process.env.ANTHROPIC_API_KEY,
                        'anthropic-version': '2023-06-01',
                    },
                    body: JSON.stringify({
                        model: process.env.DEFAULT_TEXT_MODEL || 'claude-3-5-sonnet-20240620',
                        max_tokens: maxTokens,
                        system: systemPrompt,
                        messages: [{ role: 'user', content: userPrompt }],
                        temperature,
                    }),
                });
                const data = await resp.json();
                if (data.content?.[0]?.text) return data.content[0].text;
                if (data.error) console.warn('Claude failed:', data.error.message);
            } catch (e) {
                if (e.name === 'AbortError') throw e;
                console.warn('Claude error:', e.message);
            }
        }

        throw new Error('All AI models failed');
    } finally {
        clearTimeout(timer);
    }
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
// IMAGE-FIRST FLOW: "create a post" = generate image, "write a caption" = text
// ============================================================================
router.post('/chat', optionalAuth, async (req, res) => {
    try {
        // ===== Load FULL brand from DB if brandId provided =====
        const { message, history = [], brand: brandPayload, brandId } = req.body;
        if (!message?.trim()) {
            return res.status(400).json({ success: false, error: 'Message is required' });
        }
        const userMsg = message.trim();

        let brand = brandPayload;
        console.log(`🤖 Agent chat: brandId=${brandId || 'none'}, brandPayload.name=${brandPayload?.name || 'none'}, user=${req.user?._id || 'no-auth'}`);
        
        // Load full brand from DB — brandId alone is enough, no auth required
        if (brandId) {
            try {
                const Brand = (await import('../models/Brand.js')).default;
                const fullBrand = await Brand.findOne({ _id: brandId }).lean();
                if (fullBrand) {
                    brand = fullBrand;
                    console.log(`📦 Agent: Loaded full brand "${fullBrand.name}" (${(fullBrand.knowledge?.entries || []).length} knowledge entries, ${(fullBrand.dna?.brandImages || []).length} brand images, ${(fullBrand.dna?.colors || []).length} colors)`);
                }
            } catch (e) {
                console.warn('Agent: Could not load full brand:', e.message);
            }
        }

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

        // ===== Build RICH brand context for AI =====
        const dna = brand?.dna || {};
        const brandLines = [];
        if (brand?.name) brandLines.push(`Brand Name: ${brand.name}`);
        if (brand?.website) brandLines.push(`Website: ${brand.website}`);
        if (dna.industry) brandLines.push(`Industry: ${dna.industry}`);
        if (dna.brandDescription) brandLines.push(`About: ${dna.brandDescription}`);
        if (dna.targetAudience) brandLines.push(`Target Audience: ${dna.targetAudience}`);
        if (dna.tagline) brandLines.push(`Tagline: "${dna.tagline}"`);
        if (dna.country) brandLines.push(`Market: ${dna.country}${dna.region ? ` (${dna.region})` : ''}`);

        // Voice & tone
        if (dna.voice?.personality) brandLines.push(`Voice Personality: ${dna.voice.personality}`);
        if (dna.voice?.description) brandLines.push(`Voice Detail: ${dna.voice.description}`);

        // Visual identity — described as adjectives for the image AI
        const colorNames = (dna.colors || []).filter(c => c.name || c.hex).map(c => {
            const name = c.name || hexToColorName(c.hex);
            return `${name} (${c.usage || 'accent'})`;
        });
        if (colorNames.length) brandLines.push(`Brand Colors: ${colorNames.join(', ')}`);
        if (dna.logo?.url) brandLines.push(`Logo URL: ${dna.logo.url}`);
        if (dna.logo?.metadata?.visionDescription) brandLines.push(`Logo Description: ${dna.logo.metadata.visionDescription}`);
        if (dna.photographyStyle) brandLines.push(`Photography Style: ${dna.photographyStyle}`);
        if (dna.fonts?.heading?.family) brandLines.push(`Heading Font Style: ${dna.fonts.heading.family}`);

        // Content style
        if (dna.contentStyle?.writingStyle) brandLines.push(`Writing Style: ${dna.contentStyle.writingStyle}`);
        if (dna.contentStyle?.ctaStyle) brandLines.push(`CTA Style: ${dna.contentStyle.ctaStyle}`);

        // ===== PRODUCTS & KNOWLEDGE BANK (critical for post creation) =====
        const knowledgeEntries = brand?.knowledge?.entries || [];
        if (knowledgeEntries.length > 0) {
            brandLines.push(`\n--- BRAND KNOWLEDGE BANK (${knowledgeEntries.length} entries) ---`);
            for (const entry of knowledgeEntries.slice(0, 10)) {
                const label = entry.title || entry.sourceType || 'info';
                const content = (entry.content || '').slice(0, 300);
                if (content) brandLines.push(`[${label}]: ${content}`);
            }
        }

        // ===== BRAND IMAGES (reference for visual style) =====
        const brandImages = dna.brandImages || [];
        if (brandImages.length > 0) {
            brandLines.push(`\n--- BRAND IMAGES (${brandImages.length} reference images from website) ---`);
            for (const img of brandImages.slice(0, 5)) {
                if (img.alt) brandLines.push(`Image: "${img.alt}" (${img.url})`);
            }
        }

        const brandContext = brandLines.length > 0 ? brandLines.join('\n') : 'No brand context available. Ask the user to select or create a brand.';

        // ===== Build conversation history =====
        const historyText = history.map(m =>
            `${m.role === 'user' ? 'USER' : 'MANTRAM AI'}: ${m.text}`
        ).join('\n');

        // ===== AI Classification + Response =====
        const systemPrompt = `You are "Mantram AI" — a smart, proactive creative assistant for a brand marketing platform. You help users create images, write content, brainstorm ideas, and navigate.

BRAND CONTEXT (use this to make every output brand-aware):
${brandContext}

═══ CRITICAL: INTENT CLASSIFICATION RULES ═══

"POST" = IMAGE. When a user says "create a post", "make a poster", "women's day post", "Diwali post", "social media post", "Instagram post", "banner", "creative", "design", "visual" — they want an IMAGE, not text. Intent = "creative".

"CAPTION" = TEXT. When a user says "write a caption", "write copy", "write text", "draft a message", "email copy" — they want text only. Intent = "content".

DEFAULT: If ambiguous (e.g. "something for women's day") — default to IMAGE (creative intent). Users can always ask for a caption separately.

═══ FOR CREATIVE (IMAGE) INTENT ═══

STEP 1 — RESEARCH THE BRAND: Before generating anything, study the BRAND CONTEXT above. Look at:
  • What products/services does this brand sell? (from knowledge bank)
  • What is the brand's visual identity? (colors, photography style, logo)
  • Who is the target audience?
  • What is the brand's industry?

STEP 2 — CONNECT OCCASION TO BRAND: When the user asks for a Women's Day post for a shoe brand, don't just make a generic Women's Day poster. Make a poster that features the brand's products in a Women's Day context (e.g. "Gift her the perfect pair" featuring the brand's shoes with Women's Day elements). EVERY post should tie the occasion to the brand's actual offering.

STEP 3 — Return structured data so the user can easily see and edit:

data: {
  "imagePrompt": "One flowing paragraph. MUST include: the brand's actual product/service in the scene, brand color palette as adjectives, the occasion elements, text placement. Example: 'A sleek product-showcase poster featuring [ACTUAL PRODUCT from knowledge bank] against a soft pink floral backdrop. The product is elegantly placed on a marble surface with scattered rose petals. Bold text on top reads [textOverlay]. Brand name [BRAND] in elegant script at the bottom. Warm, empowering lighting with brand's [COLOR] accent elements.'",
  "textOverlay": "The headline text ON the image — combine the occasion with the brand hook (e.g. 'Celebrate Her Strength — Gift ACwO Style', 'Happy Women's Day — Step into Confidence')",
  "tagline": "Brand tagline if relevant (from DNA)",
  "productMention": "The SPECIFIC product/service name from the knowledge bank that fits this occasion. If no exact product fits, mention the brand's core offering.",
  "style": "Brief visual style description",
  "aspectRatio": "1:1"
}

CRITICAL IMAGE PROMPT RULES:
• ALWAYS feature the brand's REAL product/service in the image — check the knowledge bank for product names, descriptions, and categories
• Use the brand's color palette as ADJECTIVES: "warm coral background", "deep navy elements" — NEVER use hex codes
• Reference the brand's photography style and visual identity
• The textOverlay should combine the OCCASION + BRAND HOOK (not just "Happy Women's Day" — make it brand-specific like "Step into Confidence this Women's Day — ACwO")
• Include the brand name naturally in the design
• NEVER include hex codes, font names, pixel sizes, color labels, or metadata
• DO NOT write "Brand:", "Font:", "Color:" in the prompt — these render as visible text
• If the knowledge bank has NO products, use the brand description and industry to create a relevant offering context

═══ FOR CONTENT (TEXT) INTENT ═══
Generate brand-voice-aligned copy. Match the tone, personality, and style from the brand DNA. Reference actual products and services.

═══ GENERAL BEHAVIOR ═══
- Be warm, professional, proactive — like a smart creative partner
- If the request is clear enough, DO IT immediately. NEVER ask "which brand" or "please select a brand" if brand context is provided above — THE BRAND IS ALREADY SELECTED.
- Only ask a clarifying question if critical info is missing (max 2 questions)
- If the BRAND CONTEXT section above says "No brand context available" (meaning no brand is selected), then say: "Please select a brand from the sidebar so I can create with your brand's identity."
- If the brand is selected but has no products in the knowledge bank, still create using the brand name, description, industry, and colors. Infer what the brand likely sells from its description.

CONVERSATION HISTORY:
${historyText || '(New conversation)'}

RESPONSE FORMAT — respond in STRICT JSON:
{
  "type": "result" | "question" | "navigate",
  "intent": "content" | "creative" | "brainstorm" | "navigate" | "question",
  "message": "Your response text (plain text only, no markdown)",
  "data": {
    // For creative: { "imagePrompt": "...", "textOverlay": "...", "tagline": "...", "productMention": "...", "style": "...", "aspectRatio": "1:1|16:9|9:16|4:5" }
    // For content: { "content": "the generated text", "type": "social|blog|ad|email", "platform": "instagram|linkedin|twitter|etc" }
    // For brainstorm: { "ideas": [{ "title": "...", "description": "..." }] }
    // For navigate: { "path": "/route-path" }
    // For questions: null
  },
  "suggestions": ["Follow-up action 1", "Follow-up action 2", "Follow-up action 3"]
}`;

        const elapsed = Date.now() - (req.startTime || Date.now());
        const remainingBudget = Math.max(300000, 600000 - elapsed);
        const result = await aiCall(systemPrompt, `USER: ${userMsg}`, { json: true, temperature: 0.7, timeout: remainingBudget });
        const parsed = parseJSON(result);

        // ===== CREATIVE INTENT — Auto-generate the branded image =====
        if (parsed.type === 'result' && parsed.intent === 'creative' && parsed.data?.imagePrompt) {
            // Clean the prompt: strip any metadata the AI might still include
            let cleanPrompt = parsed.data.imagePrompt
                .replace(/#[0-9A-Fa-f]{6}\b/g, '') // remove hex color codes
                .replace(/\b\d{3,4}\s*[x×]\s*\d{3,4}\b/gi, '') // remove dimension strings
                .replace(/\b(instagram|facebook|linkedin|youtube|twitter)\s*(post|story|ad|banner|thumbnail|creative)\b/gi, '')
                .replace(/color\s*(palette|swatch|code|reference|panel|circle)s?\b/gi, '')
                .replace(/\b(hex|rgb|cmyk)\b/gi, '')
                .trim();

            // Inject brand color adjectives if not already in prompt
            const brandColorAdj = (dna.colors || []).slice(0, 3).map(c => c.name || hexToColorName(c.hex)).filter(Boolean);
            if (brandColorAdj.length && !cleanPrompt.toLowerCase().includes(brandColorAdj[0]?.toLowerCase())) {
                cleanPrompt += ` The design uses the brand's signature ${brandColorAdj.join(', ')} color palette.`;
            }

            // ===== BRAND IMAGE RESEARCH =====
            // If brand has images from onboarding, pick the best-fit ones and describe them
            const brandImgs = dna.brandImages || [];
            if (brandImgs.length > 0) {
                // Select images with alt text that might match the occasion
                const userWords = userMsg.toLowerCase().split(/\s+/);
                const scored = brandImgs
                    .filter(img => img.url && img.alt)
                    .map(img => {
                        const altLower = (img.alt || '').toLowerCase();
                        const score = userWords.filter(w => altLower.includes(w)).length;
                        return { ...img, score };
                    })
                    .sort((a, b) => b.score - a.score);

                // Take the best matching images (up to 3)
                const bestImages = scored.slice(0, 3).filter(img => img.url);
                if (bestImages.length > 0) {
                    const imageDescs = bestImages.map(img => `"${img.alt || 'brand product'}"`).join(', ');
                    cleanPrompt += `\n\nThe brand has these product/lifestyle images that should inspire the design: ${imageDescs}. Feature the brand's actual products prominently in the composition.`;
                }
            }

            // Add brand name into the design explicitly
            if (brand?.name) {
                cleanPrompt += `\n\nInclude "${brand.name}" as a visible brand name/logo text in the design.`;
            }

            // Append strict anti-render suffix
            cleanPrompt += '\n\nThe output must be ONLY the design itself, edge-to-edge, filling the entire canvas. Do NOT add color swatches, color circles, color labels, palette panels, title cards, dimension text, mockup frames, or any elements outside the design.';

            // ===== SOCIAL MEDIA SIZE MAPPING =====
            // DALL-E 3 only supports: 1024x1024 (1:1), 1024x1792 (9:16), 1792x1024 (16:9)
            // Map all social media ratios to these three
            const ratio = (parsed.data.aspectRatio || '1:1').toLowerCase().replace(/\s+/g, '');
            let imageSize;
            switch (ratio) {
                case '9:16':  // Instagram/Facebook Story, Reels, TikTok
                case '4:5':   // Instagram post (portrait) — closest DALL-E match
                    imageSize = '1024x1792';
                    break;
                case '16:9':  // YouTube thumbnail, LinkedIn cover, Twitter/X header
                    imageSize = '1792x1024';
                    break;
                case '1:1':   // Instagram post (square), Facebook post
                default:
                    imageSize = '1024x1024';
                    break;
            }

            console.log(`🎨 Agent: Generating image (ratio: ${ratio} → ${imageSize}, brand: ${brand?.name || 'none'}, brandImages: ${brandImgs.length})`);

            try {
                const { getRouter } = await import('../ai/router.js');
                const aiRouter = getRouter();
                const imageResult = await aiRouter.generateImage({
                    prompt: cleanPrompt,
                    size: imageSize,
                });
                if (imageResult?.imageUrl) {
                    parsed.data.imageUrl = imageResult.imageUrl;
                    console.log(`✅ Agent: Image generated via ${imageResult.provider}/${imageResult.model}`);
                }
            } catch (imgErr) {
                console.warn('Image generation in agent-command failed:', imgErr.message);
                // Still return the prompt — user can use it in Creative Studio
            }
        }

        res.json({ success: true, ...parsed });
    } catch (error) {
        console.error('Agent command error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ============================================================================
// HEX TO COLOR NAME — converts hex codes to human-readable color adjectives
// ============================================================================
function hexToColorName(hex) {
    if (!hex) return '';
    hex = hex.replace('#', '').toLowerCase();
    if (hex.length !== 6) return '';
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);

    // Simple color classification
    if (r > 200 && g < 100 && b < 100) return 'vibrant red';
    if (r > 200 && g > 100 && g < 180 && b < 100) return 'warm orange';
    if (r > 200 && g > 200 && b < 100) return 'golden yellow';
    if (r < 100 && g > 150 && b < 100) return 'rich green';
    if (r < 100 && g > 150 && b > 150) return 'teal';
    if (r < 100 && g < 100 && b > 150) return 'deep blue';
    if (r > 100 && g < 100 && b > 150) return 'purple';
    if (r > 200 && g < 150 && b > 150) return 'pink';
    if (r > 200 && g > 200 && b > 200) return 'white';
    if (r < 50 && g < 50 && b < 50) return 'black';
    if (r > 100 && r < 180 && g > 100 && g < 180 && b > 100 && b < 180) return 'warm grey';
    if (r > 150 && g > 100 && b < 80) return 'amber';
    if (r < 80 && g > 100 && b > 100) return 'ocean blue';
    if (r > 150 && g < 80 && b > 80) return 'crimson';
    if (r > 100 && g > 200 && b > 100) return 'lime green';
    return 'muted tone';
}

export default router;

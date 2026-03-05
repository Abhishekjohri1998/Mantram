/**
 * Conversation Engine Service
 * Handles message processing, AI-powered intent detection, brand-voice reply generation,
 * and compliance checking for the Conversation Studio.
 */

import Conversation from '../models/Conversation.js';
import Contact from '../models/Contact.js';
import Brand from '../models/Brand.js';
import { getRouter } from '../ai/router.js';

// ============================================================================
// KEYWORD-BASED INTENT DETECTION (Fallback)
// ============================================================================

const INTENT_PATTERNS = {
    price_inquiry: {
        keywords: ['price', 'cost', 'how much', 'rate', 'pricing', 'charges', 'fees', 'kitna', 'kya rate', 'amount', 'budget', 'discount', 'offer'],
        label: 'Price Inquiry', icon: 'payments',
    },
    product_inquiry: {
        keywords: ['product', 'item', 'catalog', 'available', 'stock', 'collection', 'range', 'variety', 'kya milega', 'show me', 'options'],
        label: 'Product Inquiry', icon: 'shopping_bag',
    },
    order_status: {
        keywords: ['order', 'tracking', 'delivery', 'shipped', 'dispatch', 'kab aayega', 'where is my', 'status', 'when will'],
        label: 'Order Status', icon: 'local_shipping',
    },
    complaint: {
        keywords: ['complaint', 'issue', 'problem', 'broken', 'defective', 'wrong', 'damaged', 'refund', 'return', 'disappointed', 'poor quality'],
        label: 'Complaint', icon: 'report_problem',
    },
    store_location: {
        keywords: ['store', 'location', 'address', 'shop', 'outlet', 'branch', 'where', 'kaha', 'nearest', 'visit', 'directions'],
        label: 'Store Location', icon: 'location_on',
    },
    greeting: {
        keywords: ['hi', 'hello', 'hey', 'namaste', 'good morning', 'good evening', 'howdy', 'hola', 'what\'s up', 'sup'],
        label: 'Greeting', icon: 'waving_hand',
    },
    support: {
        keywords: ['help', 'support', 'assist', 'guide', 'how to', 'can you help', 'need help', 'madad'],
        label: 'Support', icon: 'support_agent',
    },
    purchase_intent: {
        keywords: ['buy', 'purchase', 'order', 'want to buy', 'khareedna', 'add to cart', 'checkout', 'interested in buying'],
        label: 'Purchase Intent', icon: 'shopping_cart',
    },
    feedback: {
        keywords: ['feedback', 'review', 'rating', 'experience', 'loved', 'great', 'amazing', 'awesome', 'excellent', 'thank you'],
        label: 'Feedback', icon: 'star',
    },
};

/**
 * Keyword-based intent detection (fast fallback)
 */
export function detectIntent(messageText) {
    const text = messageText.toLowerCase().trim();
    let bestMatch = { intent: 'unknown', confidence: 20, label: 'Unknown', icon: 'help' };
    let highestScore = 0;

    for (const [intentId, config] of Object.entries(INTENT_PATTERNS)) {
        let score = 0;
        const matchedKeywords = [];

        for (const keyword of config.keywords) {
            if (text.includes(keyword)) {
                score += keyword.split(' ').length;
                matchedKeywords.push(keyword);
            }
        }

        if (score > highestScore) {
            highestScore = score;
            const confidence = Math.min(95, 40 + score * 15);
            bestMatch = { intent: intentId, confidence, label: config.label, icon: config.icon, matchedKeywords };
        }
    }

    return bestMatch;
}

// ============================================================================
// AI-POWERED INTENT DETECTION (Primary)
// ============================================================================

const INTENT_CATEGORIES = [
    { id: 'greeting', label: 'Greeting', icon: 'waving_hand' },
    { id: 'price_inquiry', label: 'Price Inquiry', icon: 'payments' },
    { id: 'product_inquiry', label: 'Product Inquiry', icon: 'shopping_bag' },
    { id: 'order_status', label: 'Order Status', icon: 'local_shipping' },
    { id: 'complaint', label: 'Complaint', icon: 'report_problem' },
    { id: 'support', label: 'Support', icon: 'support_agent' },
    { id: 'purchase_intent', label: 'Purchase Intent', icon: 'shopping_cart' },
    { id: 'feedback', label: 'Feedback', icon: 'star' },
    { id: 'store_location', label: 'Store Location', icon: 'location_on' },
    { id: 'booking', label: 'Booking / Appointment', icon: 'calendar_month' },
    { id: 'partnership', label: 'Partnership / Collab', icon: 'handshake' },
    { id: 'spam', label: 'Spam / Irrelevant', icon: 'block' },
    { id: 'unknown', label: 'Unknown', icon: 'help' },
];

/**
 * AI-powered intent detection using LLM
 * Falls back to keyword matching if AI fails
 */
export async function detectIntentAI(messageText, conversationHistory = [], brand = null) {
    try {
        const router = getRouter();
        const brandContext = brand ? `Brand: "${brand.name}". Industry: ${brand.dna?.industry || 'general'}.` : '';

        const historyContext = conversationHistory.length > 0
            ? `\nRecent conversation:\n${conversationHistory.slice(-5).map(m => `${m.role}: ${m.content}`).join('\n')}`
            : '';

        const prompt = `You are a message intent classifier for a business DM inbox. Analyze the following message and classify it.

${brandContext}${historyContext}

Message: "${messageText}"

Classify into ONE of these intents:
${INTENT_CATEGORIES.map(c => `- ${c.id}: ${c.label}`).join('\n')}

Respond ONLY with valid JSON (no markdown, no code fences):
{"intent":"intent_id","confidence":0-100,"sentiment":"positive|neutral|negative","language":"en|hi|hinglish|other","suggestedAction":"auto_reply|escalate|tag|none","reasoning":"one line explanation"}`;

        const result = await router.generateText({
            prompt,
            maxTokens: 150,
            temperature: 0.1,
        });

        const text = result.text.trim();
        // Extract JSON from response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON in response');

        const parsed = JSON.parse(jsonMatch[0]);
        const category = INTENT_CATEGORIES.find(c => c.id === parsed.intent) || INTENT_CATEGORIES[INTENT_CATEGORIES.length - 1];

        return {
            intent: parsed.intent || 'unknown',
            confidence: Math.min(99, Math.max(10, parsed.confidence || 50)),
            label: category.label,
            icon: category.icon,
            sentiment: parsed.sentiment || 'neutral',
            language: parsed.language || detectLanguage(messageText),
            suggestedAction: parsed.suggestedAction || 'none',
            reasoning: parsed.reasoning || '',
            source: 'ai',
        };
    } catch (error) {
        console.warn('⚠️ AI intent detection failed, using keyword fallback:', error.message);
        const fallback = detectIntent(messageText);
        return {
            ...fallback,
            sentiment: 'neutral',
            language: detectLanguage(messageText),
            suggestedAction: 'none',
            reasoning: 'Keyword-based detection (AI unavailable)',
            source: 'keyword',
        };
    }
}

// ============================================================================
// AI REPLY GENERATION (Brand Voice)
// ============================================================================

/**
 * Generate AI reply suggestions using LLM + brand voice
 */
export async function generateAIReplies(conversation, brand) {
    const lastMessage = conversation.messages?.[conversation.messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'contact') {
        return generateFallbackSuggestions(conversation, brand);
    }

    try {
        const router = getRouter();
        const voice = brand?.dna?.voice || {};
        const brandName = brand?.name || 'our brand';

        // Build conversation context
        const recentMessages = (conversation.messages || []).slice(-8).map(m => {
            const role = m.role === 'contact' ? 'Customer' : 'Brand';
            return `${role}: ${m.content}`;
        }).join('\n');

        const prompt = `You are a DM reply assistant for "${brandName}".

BRAND VOICE:
- Personality: ${voice.personality || 'Professional & Friendly'}
- Tone: ${voice.tone || 'warm, approachable'}
- Language style: ${brand?.dna?.languageStyle?.primary || 'English'}
- Industry: ${brand?.dna?.industry || 'general'}

CONVERSATION:
${recentMessages}

DETECTED INTENT: ${conversation.intent || 'unknown'} (${conversation.intentConfidence || 0}% confidence)

Generate exactly 3 reply options for the brand to send. Each should be different in approach:
1. A quick, concise reply (1-2 sentences)
2. A helpful, detailed reply (2-3 sentences)  
3. A hand-to-human escalation message

Rules:
- Stay in brand voice
- Use emojis sparingly (1-2 max)
- If message is in Hindi/Hinglish, reply in the same language
- Keep each reply under 200 characters for DM format
- Be genuine, not robotic

Respond ONLY with valid JSON (no markdown, no code fences):
[
  {"type":"quick","label":"Quick Reply","content":"reply text","confidence":85},
  {"type":"helpful","label":"Detailed Reply","content":"reply text","confidence":75},
  {"type":"escalation","label":"Hand to Human","content":"reply text","confidence":95}
]`;

        const result = await router.generateText({
            prompt,
            maxTokens: 400,
            temperature: 0.7,
        });

        const text = result.text.trim();
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) throw new Error('No JSON array in response');

        const suggestions = JSON.parse(jsonMatch[0]);
        return suggestions.map(s => ({
            type: s.type || 'quick',
            label: s.label || 'Reply',
            content: s.content || '',
            confidence: Math.min(99, Math.max(30, s.confidence || 70)),
            source: 'ai',
        }));
    } catch (error) {
        console.warn('⚠️ AI reply generation failed, using templates:', error.message);
        return generateFallbackSuggestions(conversation, brand);
    }
}

/**
 * Fallback: template-based suggestions when AI is unavailable
 */
function generateFallbackSuggestions(conversation, brand) {
    const lastMessage = conversation.messages?.[conversation.messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'contact') return [];

    const brandName = brand?.name || 'our brand';
    const voice = brand?.dna?.voice || {};
    const personality = voice.personality || 'Professional & Friendly';
    const language = detectLanguage(lastMessage.content);
    const intent = detectIntent(lastMessage.content);

    const suggestions = [];

    if (intent.intent === 'greeting') {
        suggestions.push(
            { type: 'quick', label: 'Quick Reply', content: language === 'hinglish' ? `Hey! 👋 ${brandName} mein aapka swagat hai. Kaise help kar sakte hain?` : `Hey! 👋 Thanks for reaching out to ${brandName}. How can I help you today?`, confidence: 90 },
            { type: 'warm', label: 'Warm Welcome', content: `Hello! 🌟 So glad you reached out to ${brandName}! We're here to help with anything you need.`, confidence: 85 },
        );
    } else if (intent.intent === 'price_inquiry') {
        suggestions.push(
            { type: 'helpful', label: 'Price Info', content: `Thanks for asking about pricing! 💰 Could you let me know which product or service you're interested in?`, confidence: 82 },
        );
    } else if (intent.intent === 'complaint') {
        suggestions.push(
            { type: 'empathetic', label: 'Acknowledge', content: `I'm sorry to hear about this 😔 Your satisfaction is our priority. Could you share more details so we can fix this?`, confidence: 88 },
        );
    } else {
        suggestions.push(
            { type: 'quick', label: 'Quick Reply', content: `Thanks for reaching out to ${brandName}! 😊 How can I help you?`, confidence: 65 },
            { type: 'helpful', label: 'Helpful', content: `I'd love to help! 😊 Could you tell me more about what you need? I can assist with products, pricing, orders, or anything else.`, confidence: 60 },
        );
    }

    suggestions.push(
        { type: 'escalation', label: 'Hand to Human', content: language === 'hinglish' ? `Main aapko team member se connect kar raha hoon. Thoda wait karein! 🙏` : `I'm connecting you with a team member who can personally assist you. They'll be with you shortly! 🙏`, confidence: 95 },
    );

    return suggestions.map(s => ({ ...s, source: 'template' }));
}

// ============================================================================
// LANGUAGE DETECTION
// ============================================================================

const HINDI_CHARS = /[\u0900-\u097F]/;
const HINGLISH_PATTERNS = /\b(hai|hain|kya|kaise|kaha|nahi|accha|theek|bahut|aur|bhi|mujhe|mera|tera|uska|wala|wali|karo|karna|dena|lena|bolna|batao)\b/i;

export function detectLanguage(text) {
    if (HINDI_CHARS.test(text)) return 'hi';
    if (HINGLISH_PATTERNS.test(text)) return 'hinglish';
    return 'en';
}

// ============================================================================
// COMPLIANCE CHECKER
// ============================================================================

export function checkCompliance(conversation, messageType = 'text') {
    const now = new Date();
    const window = conversation.complianceWindow;

    if (!window?.closesAt) {
        return { allowed: true, type: 'standard', reason: 'No window restriction' };
    }

    const windowOpen = window.closesAt > now;
    const isPromotional = ['template', 'broadcast', 'promotional'].includes(messageType);

    if (!windowOpen && isPromotional) {
        return {
            allowed: false, type: 'blocked',
            reason: '24h messaging window has closed. Only human-initiated or message-tag replies are allowed.',
            windowClosedAt: window.closesAt,
        };
    }

    if (!windowOpen) {
        return {
            allowed: true, type: 'restricted',
            reason: 'Window closed. Standard messaging only (no promotional).',
            windowClosedAt: window.closesAt,
        };
    }

    return { allowed: true, type: 'open', reason: 'Within 24h window', closesAt: window.closesAt };
}

// ============================================================================
// PROCESS INCOMING MESSAGE
// ============================================================================

/**
 * Process an incoming message — create/update contact, conversation, detect intent via AI
 */
export async function processIncomingMessage({ userId, brandId, platform, senderInfo, messageContent, messageType = 'text', channel = 'instagram_dm', metadata = {} }) {
    // 1. Find or create contact
    let contact = await Contact.findOne({ platform, platformUserId: senderInfo.id });
    if (!contact) {
        contact = await Contact.create({
            user: userId,
            brand: brandId,
            platform,
            platformUserId: senderInfo.id,
            platformUsername: senderInfo.username || '',
            name: senderInfo.name || 'Unknown',
            profilePicture: senderInfo.profilePicture || senderInfo.profilePic || '',
            language: detectLanguage(messageContent),
            lastInteractionAt: new Date(),
        });
    } else {
        contact.totalMessages += 1;
        contact.lastInteractionAt = new Date();
        contact.language = detectLanguage(messageContent);
        await contact.save();
    }

    // 2. Find or create conversation
    let conversation = await Conversation.findOne({
        contact: contact._id,
        brand: brandId,
        status: { $in: ['active', 'waiting', 'handed_off'] },
    });

    // 3. Detect intent — use AI if brand is available, otherwise keyword
    let brand = null;
    if (brandId) {
        try { brand = await Brand.findById(brandId); } catch { }
    }

    const existingMessages = conversation?.messages || [];
    let intent;
    try {
        intent = await detectIntentAI(messageContent, existingMessages, brand);
    } catch {
        intent = detectIntent(messageContent);
        intent.sentiment = 'neutral';
        intent.language = detectLanguage(messageContent);
        intent.suggestedAction = 'none';
        intent.source = 'keyword';
    }

    if (!conversation) {
        conversation = await Conversation.create({
            user: userId,
            brand: brandId,
            contact: contact._id,
            channel,
            platform: platform || 'simulation',
            status: 'active',
            intent: intent.intent,
            intentConfidence: intent.confidence,
            sentiment: intent.sentiment,
            intentHistory: [{ intent: intent.intent, confidence: intent.confidence, sentiment: intent.sentiment }],
            complianceWindow: {
                opensAt: new Date(),
                closesAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
                canSendPromotional: true,
            },
            messages: [{
                role: 'contact',
                content: messageContent,
                messageType,
                sentBy: 'contact',
            }],
            lastMessageAt: new Date(),
            lastMessagePreview: messageContent.substring(0, 100),
            unreadCount: 1,
        });
    } else {
        conversation.messages.push({
            role: 'contact',
            content: messageContent,
            messageType,
            sentBy: 'contact',
        });
        conversation.lastMessageAt = new Date();
        conversation.lastMessagePreview = messageContent.substring(0, 100);
        conversation.unreadCount += 1;
        conversation.intent = intent.intent;
        conversation.intentConfidence = intent.confidence;
        conversation.sentiment = intent.sentiment;
        conversation.intentHistory.push({ intent: intent.intent, confidence: intent.confidence, sentiment: intent.sentiment });
        conversation.complianceWindow = {
            opensAt: new Date(),
            closesAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            canSendPromotional: true,
        };
        if (conversation.status === 'resolved' || conversation.status === 'snoozed') {
            conversation.status = 'active';
        }
        await conversation.save();
    }

    // 4. Smart routing — import dynamically to avoid circular deps
    try {
        const { evaluateRoutes } = await import('./routingEngine.js');
        await evaluateRoutes(conversation, intent, brand);
    } catch (routeErr) {
        // Routing engine not critical — just log
        if (!routeErr.message?.includes('Cannot find module')) {
            console.warn('⚠️ Routing engine error:', routeErr.message);
        }
    }

    return { contact, conversation, intent };
}

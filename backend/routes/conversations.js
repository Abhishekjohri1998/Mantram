/**
 * Conversation Routes
 * Handles inbox threads, messaging, AI suggestions, and human takeover.
 */

import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import Conversation from '../models/Conversation.js';
import Contact from '../models/Contact.js';
import Brand from '../models/Brand.js';
import { detectIntent, detectIntentAI, checkCompliance, generateAIReplies, processIncomingMessage } from '../services/conversationEngine.js';

const router = Router();

// ── GET /api/conversations — List conversations with filters ──

router.get('/', protect, async (req, res) => {
    try {
        const { brandId, status, channel, intent, search, page = 1, limit = 30 } = req.query;

        const filter = { user: req.user._id };
        if (brandId) filter.brand = brandId;
        if (status) filter.status = status;
        if (channel) filter.channel = channel;
        if (intent) filter.intent = intent;

        const conversations = await Conversation.find(filter)
            .populate('contact', 'name platformUsername profilePicture platform tags interestScore language leadStatus')
            .populate('brand', 'name')
            .sort({ lastMessageAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .select('-messages'); // Don't send all messages in list view

        const total = await Conversation.countDocuments(filter);

        // Count by status
        const statusCounts = await Conversation.aggregate([
            { $match: { user: req.user._id, ...(brandId ? { brand: brandId } : {}) } },
            { $group: { _id: '$status', count: { $sum: 1 } } },
        ]);
        const counts = {};
        for (const s of statusCounts) counts[s._id] = s.count;

        res.json({ success: true, conversations, total, page: parseInt(page), limit: parseInt(limit), statusCounts: counts });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});


// ── GET /api/conversations/stats/overview — Dashboard stats ──
// NOTE: Must be before /:id to prevent Express matching "stats" as an ID

router.get('/stats/overview', protect, async (req, res) => {
    try {
        const { brandId } = req.query;
        const filter = { user: req.user._id };
        if (brandId) filter.brand = brandId;

        const [total, active, resolved, handedOff, aiHandled] = await Promise.all([
            Conversation.countDocuments(filter),
            Conversation.countDocuments({ ...filter, status: 'active' }),
            Conversation.countDocuments({ ...filter, status: 'resolved' }),
            Conversation.countDocuments({ ...filter, status: 'handed_off' }),
            Conversation.countDocuments({ ...filter, isAIHandling: true }),
        ]);

        // Top intents
        const topIntents = await Conversation.aggregate([
            { $match: filter },
            { $group: { _id: '$intent', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 5 },
        ]);

        // Channel breakdown
        const channelBreakdown = await Conversation.aggregate([
            { $match: filter },
            { $group: { _id: '$channel', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
        ]);

        // Last 7 days volume (time-series)
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const dailyVolume = await Conversation.aggregate([
            { $match: { ...filter, createdAt: { $gte: sevenDaysAgo } } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    count: { $sum: 1 },
                    aiCount: { $sum: { $cond: ['$isAIHandling', 1, 0] } },
                }
            },
            { $sort: { _id: 1 } },
        ]);

        // Fill missing days in the 7-day series
        const volumeSeries = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
            const key = d.toISOString().split('T')[0];
            const dayName = d.toLocaleDateString('en', { weekday: 'short' });
            const existing = dailyVolume.find(v => v._id === key);
            volumeSeries.push({
                date: key,
                day: dayName,
                total: existing?.count || 0,
                aiHandled: existing?.aiCount || 0,
            });
        }

        // Sentiment distribution
        const sentimentDist = await Conversation.aggregate([
            { $match: filter },
            { $unwind: '$intentHistory' },
            { $match: { 'intentHistory.sentiment': { $exists: true, $ne: null } } },
            { $group: { _id: '$intentHistory.sentiment', count: { $sum: 1 } } },
        ]);
        const sentiments = { positive: 0, neutral: 0, negative: 0 };
        sentimentDist.forEach(s => { if (sentiments.hasOwnProperty(s._id)) sentiments[s._id] = s.count; });

        // Avg response time (approx: time between first contact msg and first brand msg)
        const convosWithReplies = await Conversation.find({
            ...filter,
            'messages.1': { $exists: true },
        }).select('messages').limit(50).lean();

        let totalResponseMs = 0;
        let responseCount = 0;
        for (const conv of convosWithReplies) {
            const firstContact = conv.messages.find(m => m.role === 'contact');
            const firstBrand = conv.messages.find(m => m.role === 'brand');
            if (firstContact && firstBrand && firstBrand.timestamp > firstContact.timestamp) {
                totalResponseMs += firstBrand.timestamp - firstContact.timestamp;
                responseCount++;
            }
        }
        const avgResponseTimeSec = responseCount > 0 ? Math.round(totalResponseMs / responseCount / 1000) : 0;

        // Compliance — conversations with open windows
        const now = new Date();
        const complianceOpen = await Conversation.countDocuments({
            ...filter, status: 'active', 'complianceWindow.closesAt': { $gt: now },
        });
        const complianceClosed = active - complianceOpen;

        // AI vs human reply ratio
        const replyBreakdown = await Conversation.aggregate([
            { $match: filter },
            { $unwind: '$messages' },
            { $match: { 'messages.role': 'brand' } },
            {
                $group: {
                    _id: '$messages.sentBy',
                    count: { $sum: 1 },
                }
            },
        ]);
        const repliesByType = { ai: 0, human: 0, automation: 0 };
        replyBreakdown.forEach(r => { if (repliesByType.hasOwnProperty(r._id)) repliesByType[r._id] = r.count; });

        res.json({
            success: true,
            stats: {
                total, active, resolved, handedOff, aiHandled,
                topIntents, channelBreakdown, volumeSeries,
                sentiments, avgResponseTimeSec,
                compliance: { open: complianceOpen, closed: complianceClosed },
                repliesByType,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});


// ── POST /api/conversations/simulate — Simulate incoming DM for testing ──
// NOTE: Must be before /:id

router.post('/simulate', protect, async (req, res) => {
    try {
        const { brandId, message, platform = 'instagram', senderName = 'Test User', senderUsername = 'test_user' } = req.body;

        if (!brandId || !message) {
            return res.status(400).json({ success: false, error: 'brandId and message are required' });
        }

        const result = await processIncomingMessage({
            userId: req.user._id,
            brandId,
            platform,
            senderInfo: {
                id: `sim_${Date.now()}_${Math.random().toString(36).substring(7)}`,
                name: senderName,
                username: senderUsername,
            },
            messageContent: message,
            channel: platform === 'instagram' ? 'instagram_dm' : 'facebook_messenger',
        });

        res.json({ success: true, ...result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});


// ── GET /api/conversations/:id — Get single conversation with all messages ──

router.get('/:id', protect, async (req, res) => {
    try {
        const conversation = await Conversation.findOne({ _id: req.params.id, user: req.user._id })
            .populate('contact')
            .populate('brand', 'name dna');

        if (!conversation) return res.status(404).json({ success: false, error: 'Conversation not found' });

        // Mark as read
        conversation.unreadCount = 0;
        await conversation.save();

        // Check compliance
        const compliance = checkCompliance(conversation);

        res.json({ success: true, conversation, compliance });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});


// ── POST /api/conversations/:id/reply — Send a reply ──

router.post('/:id/reply', protect, async (req, res) => {
    try {
        const { content, messageType = 'text', sentBy = 'human' } = req.body;

        if (!content?.trim()) return res.status(400).json({ success: false, error: 'Content is required' });

        const conversation = await Conversation.findOne({ _id: req.params.id, user: req.user._id })
            .populate('brand', 'name dna');

        if (!conversation) return res.status(404).json({ success: false, error: 'Conversation not found' });

        // Compliance check
        const compliance = checkCompliance(conversation, messageType);
        if (!compliance.allowed) {
            return res.status(403).json({ success: false, error: compliance.reason, compliance });
        }

        // Add message
        conversation.messages.push({
            role: 'brand',
            content: content.trim(),
            messageType,
            sentBy,
            aiConfidence: sentBy === 'ai' ? 85 : undefined,
        });
        conversation.lastMessageAt = new Date();
        conversation.lastMessagePreview = `You: ${content.substring(0, 80)}`;
        conversation.unreadCount = 0;
        if (conversation.status === 'waiting') conversation.status = 'active';
        await conversation.save();

        // Dispatch via Meta Graph API for real conversations
        if (conversation.contact?.platformId && conversation.platform !== 'simulation') {
            try {
                const { sendMetaReply } = await import('./webhooks.js');
                if (sendMetaReply) {
                    const metaResult = await sendMetaReply(conversation.contact.platformId, content.trim(), conversation.platform);
                    if (!metaResult.success) {
                        console.warn('⚠️ Meta reply failed (saved locally):', metaResult.error);
                    }
                }
            } catch (metaErr) {
                console.warn('⚠️ Meta dispatch unavailable:', metaErr.message);
            }
        }

        res.json({ success: true, message: conversation.messages[conversation.messages.length - 1] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});


// ── POST /api/conversations/:id/takeover — Human takes over from AI ──

router.post('/:id/takeover', protect, async (req, res) => {
    try {
        const conversation = await Conversation.findOne({ _id: req.params.id, user: req.user._id });
        if (!conversation) return res.status(404).json({ success: false, error: 'Conversation not found' });

        conversation.isAIHandling = false;
        conversation.assignedTo = req.user._id;
        conversation.status = 'handed_off';
        conversation.messages.push({
            role: 'system',
            content: `${req.user.name || 'Agent'} took over this conversation`,
            sentBy: 'human',
        });
        await conversation.save();

        res.json({ success: true, conversation: { status: conversation.status, isAIHandling: false } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});


// ── POST /api/conversations/:id/resolve — Mark as resolved ──

router.post('/:id/resolve', protect, async (req, res) => {
    try {
        const conversation = await Conversation.findOneAndUpdate(
            { _id: req.params.id, user: req.user._id },
            { status: 'resolved' },
            { new: true }
        );
        if (!conversation) return res.status(404).json({ success: false, error: 'Conversation not found' });

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});


// ── POST /api/conversations/:id/ai-mode — Toggle AI handling ──

router.post('/:id/ai-mode', protect, async (req, res) => {
    try {
        const { enabled } = req.body;
        const conversation = await Conversation.findOneAndUpdate(
            { _id: req.params.id, user: req.user._id },
            {
                isAIHandling: enabled,
                status: enabled ? 'active' : 'handed_off',
                ...(enabled ? { assignedTo: null } : { assignedTo: req.user._id }),
            },
            { new: true }
        );
        if (!conversation) return res.status(404).json({ success: false, error: 'Not found' });

        res.json({ success: true, isAIHandling: conversation.isAIHandling });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});


// ── GET /api/conversations/:id/suggestions — Get AI reply suggestions ──

router.get('/:id/suggestions', protect, async (req, res) => {
    try {
        const conversation = await Conversation.findOne({ _id: req.params.id, user: req.user._id })
            .populate('brand', 'name dna');

        if (!conversation) return res.status(404).json({ success: false, error: 'Not found' });

        // Use AI-powered reply generation
        const suggestions = await generateAIReplies(conversation, conversation.brand);
        const intent = conversation.intent ? {
            intent: conversation.intent,
            confidence: conversation.intentConfidence,
            sentiment: conversation.sentiment || 'neutral',
        } : null;

        res.json({ success: true, suggestions, intent });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});



export default router;

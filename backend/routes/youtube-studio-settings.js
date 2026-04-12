/**
 * YouTube Studio Settings Routes
 *
 * Mounted at: /api/youtube-studio/settings
 *
 * IMPORTANT: Static paths (/channel-configs, /templates/seed-starters) MUST
 * be registered BEFORE wildcard paths (/:id) to prevent Express from swallowing them.
 *
 * Route map:
 *   GET    /channel-configs              — List all channels for this user
 *   POST   /channel-configs              — Create a new channel config
 *   PUT    /channel-configs/:id          — Update a channel config
 *   DELETE /channel-configs/:id          — Delete a channel config
 *   POST   /channel-configs/:id/default  — Set as default channel
 *
 *   POST   /templates/seed-starters     — Seed pre-built starter templates (STATIC — must be first)
 *   GET    /templates                   — List user's templates
 *   POST   /templates                   — Create new template
 *   PUT    /templates/:id               — Update template
 *   DELETE /templates/:id               — Delete template
 *   POST   /templates/:id/set-default   — Set as default template
 *   POST   /templates/:id/clone         — Clone a starter template
 */

import express from 'express';
import { protect } from '../middleware/auth.js';
import ThumbnailTemplate from '../models/ThumbnailTemplate.js';
import YoutubeChannelConfig from '../models/YoutubeChannelConfig.js';

const router = express.Router();

// ── STARTER TEMPLATE DEFINITIONS ─────────────────────────────────────────────

const STARTER_TEMPLATES = [
    {
        name: 'Bollywood Drama',
        description: 'Rich cinematic tones for drama, reality-tv and entertainment channels. Deep reds and gold.',
        icon: 'theaters',
        tags: ['drama', 'entertainment', 'hindi', 'reality-tv'],
        classification: { theme: 'drama', language: 'hindi' },
        visual: {
            primaryColor: '#C41E3A', secondaryColor: '#FFD700', backgroundColor: '#1A0A0A',
            backgroundStyle: 'dramatic-dark', composition: 'split-dual',
            titleFont: 'noto-devanagari-bold', titleColor: '#FFD700', titleShadow: 'hard-black',
            overlayMood: 'dramatic-vignette', energyLevel: 'dramatic', logoPlacement: 'top-right', logoSize: 'small',
        },
        outputLanguage: { title: 'hindi', description: 'hindi' },
        generationPromptSuffix: 'Cinematic Bollywood aesthetic, rich deep red and gold tones, dramatic theatrical lighting, high-contrast dramatic vignette, intense emotional expressions, film poster quality',
    },
    {
        name: 'Music Hype',
        description: 'High-energy dark backgrounds with neon accents. Perfect for music videos, live concerts, artist profiles.',
        icon: 'queue_music',
        tags: ['music', 'artist', 'concert', 'hindi-music', 'pop'],
        classification: { theme: 'music', language: 'hinglish' },
        visual: {
            primaryColor: '#7C3AED', secondaryColor: '#EC4899', backgroundColor: '#0D0D1A',
            backgroundStyle: 'neon-glow', composition: 'center',
            titleFont: 'bebas-neue', titleColor: '#FFFFFF', titleShadow: 'neon-glow',
            overlayMood: 'cool-cinematic', energyLevel: 'intense', logoPlacement: 'top-left', logoSize: 'small',
        },
        outputLanguage: { title: 'english', description: 'english' },
        generationPromptSuffix: 'Music concert aesthetic, neon purple and pink lighting, stage energy, bokeh lights in background, performer silhouette, electric atmosphere, music festival vibes',
    },
    {
        name: 'News & Commentary',
        description: 'Professional, authoritative style for news, politics, and current affairs channels.',
        icon: 'breaking_news',
        tags: ['news', 'politics', 'commentary', 'currentaffairs'],
        classification: { theme: 'news', language: 'hindi' },
        visual: {
            primaryColor: '#1E40AF', secondaryColor: '#EF4444', backgroundColor: '#0F172A',
            backgroundStyle: 'editorial-white', composition: 'left-subject',
            titleFont: 'montserrat-extrabold', titleColor: '#FFFFFF', titleShadow: 'hard-black',
            overlayMood: 'high-contrast', energyLevel: 'energetic', logoPlacement: 'top-right', logoSize: 'small',
        },
        outputLanguage: { title: 'hindi', description: 'hindi' },
        generationPromptSuffix: 'Television news studio aesthetic, professional broadcast quality, bold typography, urgent breaking news energy, deep navy and red color palette, serious authoritative mood',
    },
    {
        name: 'Education & Tutorial',
        description: 'Clean, trust-building style for educational content. Great for EdTech, tutorials, skill channels.',
        icon: 'school',
        tags: ['education', 'tutorial', 'edtech', 'skills', 'learning'],
        classification: { theme: 'education', language: 'english' },
        visual: {
            primaryColor: '#0EA5E9', secondaryColor: '#FFFFFF', backgroundColor: '#F0F9FF',
            backgroundStyle: 'editorial-white', composition: 'right-subject',
            titleFont: 'poppins-black', titleColor: '#0C4A6E', titleShadow: 'soft',
            overlayMood: 'golden-warm', energyLevel: 'calm', logoPlacement: 'bottom-right', logoSize: 'small',
        },
        outputLanguage: { title: 'english', description: 'english' },
        generationPromptSuffix: 'Clean educational aesthetic, bright and trustworthy, soft warm lighting, professional classroom or studio setting, confident presenter expression, light blue and white palette',
    },
    {
        name: 'Lifestyle & Vlog',
        description: 'Warm, authentic, personal. For lifestyle, travel, food, and daily vlog channels.',
        icon: 'explore',
        tags: ['lifestyle', 'vlog', 'travel', 'food', 'daily'],
        classification: { theme: 'lifestyle', language: 'english' },
        visual: {
            primaryColor: '#F59E0B', secondaryColor: '#FFFFFF', backgroundColor: '#FFF9F0',
            backgroundStyle: 'watercolor', composition: 'center',
            titleFont: 'baloo-bold', titleColor: '#78350F', titleShadow: 'soft',
            overlayMood: 'golden-warm', energyLevel: 'calm', logoPlacement: 'top-right', logoSize: 'small',
        },
        outputLanguage: { title: 'english', description: 'english' },
        generationPromptSuffix: 'Warm lifestyle aesthetic, golden hour lighting, authentic candid energy, Instagram-worthy composition, soft warm tones, life-is-beautiful mood, approachable and personal',
    },
    {
        name: 'Reality TV Shock',
        description: 'High-contrast drama for reality TV, prank videos, challenge formats and shocking reveals.',
        icon: 'live_tv',
        tags: ['reality-tv', 'prank', 'challenge', 'shocking', 'viral'],
        classification: { theme: 'reality-tv', language: 'hinglish' },
        visual: {
            primaryColor: '#EF4444', secondaryColor: '#FFF000', backgroundColor: '#1A0000',
            backgroundStyle: 'bold-flat', composition: 'split-dual',
            titleFont: 'impact', titleColor: '#FFFFFF', titleShadow: 'outlined',
            overlayMood: 'high-contrast', energyLevel: 'intense', logoPlacement: 'top-right', logoSize: 'small',
        },
        outputLanguage: { title: 'hinglish', description: 'hinglish' },
        generationPromptSuffix: 'Shock and drama, extreme facial expressions, high contrast red and yellow, bold impact typography energy, reality television drama aesthetic, explosive visual tension',
    },
    {
        name: 'Tech & Review',
        description: 'Minimal dark glass aesthetic for tech reviews, gadget unboxings, and digital content.',
        icon: 'devices',
        tags: ['tech', 'gadget', 'review', 'unboxing', 'digital'],
        classification: { theme: 'tech', language: 'english' },
        visual: {
            primaryColor: '#06B6D4', secondaryColor: '#FFFFFF', backgroundColor: '#0A0A0F',
            backgroundStyle: 'cinematic-blur', composition: 'left-subject',
            titleFont: 'roboto-black', titleColor: '#FFFFFF', titleShadow: 'soft',
            overlayMood: 'cool-cinematic', energyLevel: 'energetic', logoPlacement: 'top-right', logoSize: 'small',
        },
        outputLanguage: { title: 'english', description: 'english' },
        generationPromptSuffix: 'Minimalist tech aesthetic, dark glass and metal surfaces, cyan accent lighting, clean product photography energy, futuristic and precise, Apple-commercial quality',
    },
    {
        name: 'Sports & Action',
        description: 'Dynamic, explosive energy for sports highlights, cricket, football, fitness channels.',
        icon: 'sports_soccer',
        tags: ['sports', 'cricket', 'football', 'fitness', 'action', 'highlights'],
        classification: { theme: 'sports', language: 'hindi' },
        visual: {
            primaryColor: '#F59E0B', secondaryColor: '#1E3A8A', backgroundColor: '#0A0A0A',
            backgroundStyle: 'dramatic-dark', composition: 'full-bleed',
            titleFont: 'bebas-neue', titleColor: '#F59E0B', titleShadow: 'hard-black',
            overlayMood: 'high-contrast', energyLevel: 'intense', logoPlacement: 'top-left', logoSize: 'small',
        },
        outputLanguage: { title: 'hindi', description: 'hindi' },
        generationPromptSuffix: 'Explosive sports action, stadium energy, motion blur and freeze-frame drama, high-contrast dark background with bright subject, intense athletic achievement moment',
    },
    {
        name: 'Devotional & Spiritual',
        description: 'Sacred and serene aesthetic for devotional, religious, and spiritual channels.',
        icon: 'self_improvement',
        tags: ['devotional', 'spiritual', 'religion', 'bhakti', 'mantra'],
        classification: { theme: 'devotional', language: 'hindi' },
        visual: {
            primaryColor: '#D97706', secondaryColor: '#FFFBEB', backgroundColor: '#1C0A00',
            backgroundStyle: 'dramatic-dark', composition: 'center',
            titleFont: 'noto-devanagari-bold', titleColor: '#FFD700', titleShadow: 'soft',
            overlayMood: 'golden-warm', energyLevel: 'calm', logoPlacement: 'bottom-right', logoSize: 'small',
        },
        outputLanguage: { title: 'hindi', description: 'hindi' },
        generationPromptSuffix: 'Divine sacred aesthetic, warm golden temple light, spiritual glow, incense atmosphere, deep saffron and gold palette, reverent and peaceful mood, Devanagari typography energy',
    },
    {
        name: 'Finance & Business',
        description: 'Professional, premium feel for stock market, business, invest, and finance channels.',
        icon: 'trending_up',
        tags: ['finance', 'business', 'stock-market', 'investment', 'money'],
        classification: { theme: 'finance', language: 'english' },
        visual: {
            primaryColor: '#22C55E', secondaryColor: '#FFFFFF', backgroundColor: '#0A0F0A',
            backgroundStyle: 'cinematic-blur', composition: 'right-subject',
            titleFont: 'montserrat-extrabold', titleColor: '#22C55E', titleShadow: 'hard-black',
            overlayMood: 'cool-cinematic', energyLevel: 'energetic', logoPlacement: 'top-right', logoSize: 'small',
        },
        outputLanguage: { title: 'english', description: 'english' },
        generationPromptSuffix: 'Professional finance aesthetic, dark trading terminal background, green profit colors, Wall Street energy, Bloomberg-style data visualization background, confident wealth mindset',
    },
];

// ── Channel Config — MULTI-CHANNEL ───────────────────────────────────────────

// GET /channel-configs — list all channels for this user
router.get('/channel-configs', protect, async (req, res) => {
    try {
        const channels = await YoutubeChannelConfig.find({ userId: req.user._id })
            .populate('defaultTemplateId', 'name icon visual classification')
            .sort({ isDefault: -1, createdAt: 1 });
        res.json({ success: true, channels });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /channel-configs — create new channel
router.post('/channel-configs', protect, async (req, res) => {
    try {
        const internalId = `channel-${Date.now()}`;
        const channel = await YoutubeChannelConfig.create({
            ...req.body,
            userId: req.user._id,
            internalId,
            isDefault: false,
        });
        res.json({ success: true, channel });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

// PUT /channel-configs/:id — update a channel
router.put('/channel-configs/:id', protect, async (req, res) => {
    try {
        const update = { ...req.body };
        delete update.userId;
        delete update.internalId;
        const channel = await YoutubeChannelConfig.findOneAndUpdate(
            { _id: req.params.id, userId: req.user._id },
            { $set: update },
            { new: true, runValidators: true }
        ).populate('defaultTemplateId', 'name icon visual classification');
        if (!channel) return res.status(404).json({ success: false, error: 'Channel not found' });
        res.json({ success: true, channel });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

// DELETE /channel-configs/:id — delete a channel
router.delete('/channel-configs/:id', protect, async (req, res) => {
    try {
        await YoutubeChannelConfig.deleteOne({ _id: req.params.id, userId: req.user._id });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /channel-configs/:id/default — set as default channel
router.post('/channel-configs/:id/default', protect, async (req, res) => {
    try {
        await YoutubeChannelConfig.updateMany(
            { userId: req.user._id },
            { $set: { isDefault: false } }
        );
        const channel = await YoutubeChannelConfig.findOneAndUpdate(
            { _id: req.params.id, userId: req.user._id },
            { $set: { isDefault: true } },
            { new: true }
        );
        if (!channel) return res.status(404).json({ success: false, error: 'Channel not found' });
        res.json({ success: true, channel });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── Templates — STATIC routes MUST come before /:id wildcard ─────────────────

// POST /templates/seed-starters — STATIC — seed 10 pre-built starters
router.post('/templates/seed-starters', protect, async (req, res) => {
    try {
        const existing = await ThumbnailTemplate.find({ userId: req.user._id, isStarter: true });
        const existingNames = new Set(existing.map(t => t.name));

        const toInsert = STARTER_TEMPLATES
            .filter(t => !existingNames.has(t.name))
            .map(t => ({ ...t, userId: req.user._id, isStarter: true }));

        if (toInsert.length > 0) {
            await ThumbnailTemplate.insertMany(toInsert);
        }

        const allStarters = await ThumbnailTemplate.find({ userId: req.user._id, isStarter: true }).sort({ name: 1 });
        res.json({ success: true, seeded: toInsert.length, templates: allStarters });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /templates — list all
router.get('/templates', protect, async (req, res) => {
    try {
        const { theme, language, search } = req.query;
        const filter = {
            userId: req.user._id,
            isArchived: { $ne: true },
        };
        if (theme)    filter['classification.theme']    = theme;
        if (language) filter['classification.language'] = language;
        if (search)   filter.name = { $regex: search, $options: 'i' };

        const templates = await ThumbnailTemplate.find(filter).sort({ isDefault: -1, usageCount: -1, createdAt: -1 });
        res.json({ success: true, templates });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /templates — create new
router.post('/templates', protect, async (req, res) => {
    try {
        const template = await ThumbnailTemplate.create({
            ...req.body,
            userId: req.user._id,
            isStarter: false,
        });
        res.json({ success: true, template });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

// POST /templates/:id/set-default — MUST be before PUT /:id
router.post('/templates/:id/set-default', protect, async (req, res) => {
    try {
        await ThumbnailTemplate.updateMany(
            { userId: req.user._id, isDefault: true },
            { $set: { isDefault: false } }
        );
        const tpl = await ThumbnailTemplate.findOneAndUpdate(
            { _id: req.params.id, userId: req.user._id },
            { $set: { isDefault: true } },
            { new: true }
        );
        if (!tpl) return res.status(404).json({ success: false, error: 'Template not found' });
        res.json({ success: true, template: tpl });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /templates/:id/clone
router.post('/templates/:id/clone', protect, async (req, res) => {
    try {
        const source = await ThumbnailTemplate.findById(req.params.id);
        if (!source) return res.status(404).json({ success: false, error: 'Template not found' });
        const clone = new ThumbnailTemplate({
            ...source.toObject(),
            _id: undefined,
            userId: req.user._id,
            name: `${source.name} (My Version)`,
            isStarter: false, isDefault: false, isArchived: false,
            usageCount: 0,
        });
        await clone.save();
        res.json({ success: true, template: clone });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// PUT /templates/:id — update
router.put('/templates/:id', protect, async (req, res) => {
    try {
        const template = await ThumbnailTemplate.findOneAndUpdate(
            { _id: req.params.id, userId: req.user._id },
            { $set: req.body },
            { new: true, runValidators: true }
        );
        if (!template) return res.status(404).json({ success: false, error: 'Template not found' });
        res.json({ success: true, template });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

// DELETE /templates/:id — archive
router.delete('/templates/:id', protect, async (req, res) => {
    try {
        const tpl = await ThumbnailTemplate.findOne({ _id: req.params.id, userId: req.user._id });
        if (!tpl) return res.status(404).json({ success: false, error: 'Template not found' });
        if (tpl.isStarter) return res.status(400).json({ success: false, error: 'Cannot delete a starter template — clone it first to customise' });
        tpl.isArchived = true;
        await tpl.save();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;

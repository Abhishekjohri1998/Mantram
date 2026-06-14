/**
 * Super Admin — Growth Content Engine Routes
 * Auto-generated daily marketing content for all social platforms.
 */

import { Router } from 'express';
import GrowthContent from '../models/GrowthContent.js';
import { generateDailyContent, regeneratePlatformContent, getISTDateDetails } from '../services/growthContentEngine.js';
import { safeErrorMessage } from '../utils/safeError.js';
import { getRouter } from '../ai/router.js';

const router = Router();

// ══════════════════════════════════════════════════════════════
// GET /api/superadmin/growth/today — Today's generated content
// ══════════════════════════════════════════════════════════════
router.get('/today', async (req, res) => {
    try {
        const today = getISTDateDetails().dateKey;
        const content = await GrowthContent.findOne({ dateKey: today }).lean();

        if (!content) {
            return res.json({
                success: true,
                content: null,
                message: 'No content generated for today yet. Click "Generate" to create.',
            });
        }

        res.json({ success: true, content });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════
// GET /api/superadmin/growth/history — Past content (paginated)
// ══════════════════════════════════════════════════════════════
router.get('/history', async (req, res) => {
    try {
        const { page = 1, limit = 14 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [content, total] = await Promise.all([
            GrowthContent.find()
                .sort({ date: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            GrowthContent.countDocuments(),
        ]);

        res.json({
            success: true,
            content,
            total,
            page: parseInt(page),
            pages: Math.ceil(total / parseInt(limit)),
        });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════
// POST /api/superadmin/growth/generate — Manually trigger generation
// ══════════════════════════════════════════════════════════════
router.post('/generate', async (req, res) => {
    try {
        const { date } = req.body; // Optional: generate for specific date
        const targetDate = date ? new Date(date) : new Date();
        const dateKey = getISTDateDetails(targetDate).dateKey;

        // If content already exists, delete it first (force regeneration)
        await GrowthContent.deleteOne({ dateKey });

        const content = await generateDailyContent(targetDate);
        res.json({ success: true, content });
    } catch (error) {
        console.error('[Growth Generate]', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════
// PUT /api/superadmin/growth/:id/mark-posted — Toggle posted status
// ══════════════════════════════════════════════════════════════
router.put('/:id/mark-posted', async (req, res) => {
    try {
        const { platform, index = 0 } = req.body;
        const content = await GrowthContent.findById(req.params.id);
        if (!content) return res.status(404).json({ success: false, error: 'Content not found' });

        const now = new Date();

        if (platform === 'linkedin' && content.linkedin[index]) {
            content.linkedin[index].posted = !content.linkedin[index].posted;
            content.linkedin[index].postedAt = content.linkedin[index].posted ? now : null;
        } else if (platform === 'twitter' && content.twitter[index]) {
            content.twitter[index].posted = !content.twitter[index].posted;
            content.twitter[index].postedAt = content.twitter[index].posted ? now : null;
        } else if (platform === 'reddit' && content.reddit[index]) {
            content.reddit[index].posted = !content.reddit[index].posted;
            content.reddit[index].postedAt = content.reddit[index].posted ? now : null;
        } else if (platform === 'instagram_post') {
            content.instagram.post.posted = !content.instagram.post.posted;
            content.instagram.post.postedAt = content.instagram.post.posted ? now : null;
        } else if (platform === 'instagram_story') {
            content.instagram.story.posted = !content.instagram.story.posted;
            content.instagram.story.postedAt = content.instagram.story.posted ? now : null;
        } else if (platform === 'instagram_reel') {
            if (!content.instagram?.reel) return res.status(400).json({ success: false, error: 'Instagram Reel not found in document' });
            content.instagram.reel.posted = !content.instagram.reel.posted;
            content.instagram.reel.postedAt = content.instagram.reel.posted ? now : null;
        } else {
            return res.status(400).json({ success: false, error: 'Invalid platform or index' });
        }

        // Update overall status
        const allPosted = [
            ...(content.linkedin || []).map(p => p.posted),
            content.instagram?.post?.posted,
            content.instagram?.story?.posted,
            ...(content.instagram?.reel ? [content.instagram.reel.posted] : []),
            ...(content.twitter || []).map(p => p.posted),
            ...(content.reddit || []).map(p => p.posted),
        ];
        content.status = allPosted.every(Boolean) ? 'posted' : allPosted.some(Boolean) ? 'partial' : 'generated';

        await content.save();
        res.json({ success: true, content });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════
// POST /api/superadmin/growth/:id/regenerate — Regenerate specific post
// ══════════════════════════════════════════════════════════════
router.post('/:id/regenerate', async (req, res) => {
    try {
        const { platform, index = 0 } = req.body;
        const content = await regeneratePlatformContent(req.params.id, platform, index);
        res.json({ success: true, content });
    } catch (error) {
        console.error('[Growth Regenerate]', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════
// POST /api/superadmin/growth/:id/generate-image — Generate image for post
// ══════════════════════════════════════════════════════════════
router.post('/:id/generate-image', async (req, res) => {
    try {
        const { platform, index = 0, slideIndex = null, imageModel = 'gpt-image-2' } = req.body;
        const content = await GrowthContent.findById(req.params.id);
        if (!content) return res.status(404).json({ success: false, error: 'Content not found' });

        let promptText = '';
        let targetObj = null;
        let aspectRatio = '1:1';

        if (platform === 'linkedin' && content.linkedin[index]) {
            targetObj = content.linkedin[index];
            promptText = `Create a professional LinkedIn graphic for the following post: ${targetObj.content}`;
            aspectRatio = '16:9';
        } else if (platform === 'twitter' && content.twitter[index]) {
            targetObj = content.twitter[index];
            promptText = `Create an engaging Twitter graphic for this tweet: ${targetObj.tweets[0]}`;
            aspectRatio = '16:9';
        } else if (platform === 'reddit' && content.reddit[index]) {
            targetObj = content.reddit[index];
            promptText = `Create a Reddit post image for title: ${targetObj.title}. Tone: ${targetObj.tone}`;
            aspectRatio = '16:9';
        } else if (platform === 'instagram_post') {
            if (slideIndex !== null && content.instagram.post.slides[slideIndex]) {
                targetObj = content.instagram.post.slides[slideIndex];
                promptText = targetObj.visualDescription || targetObj.text;
            } else {
                return res.status(400).json({ success: false, error: 'Slide index required for instagram post' });
            }
            aspectRatio = '4:5';
        } else if (platform === 'instagram_story') {
            if (slideIndex !== null && content.instagram.story.slides[slideIndex]) {
                targetObj = content.instagram.story.slides[slideIndex];
                promptText = targetObj.visualDescription || targetObj.text;
            } else {
                return res.status(400).json({ success: false, error: 'Slide index required for instagram story' });
            }
            aspectRatio = '9:16';
        } else {
            return res.status(400).json({ success: false, error: 'Invalid platform or index' });
        }

        const aiRouter = getRouter();
        const result = await aiRouter.generateImage({ 
            prompt: promptText, 
            aspectRatio,
            model: imageModel
        });

        if (!result.imageUrl) throw new Error('Image generation failed to return URL');

        targetObj.imageUrl = result.imageUrl;
        await content.save();

        res.json({ success: true, content });
    } catch (error) {
        console.error('[Growth Generate Image]', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ══════════════════════════════════════════════════════════════
// GET /api/superadmin/growth/stats — Posting stats & streak
// ══════════════════════════════════════════════════════════════
router.get('/stats', async (req, res) => {
    try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        const [totalDays, thisWeek, allRecent] = await Promise.all([
            GrowthContent.countDocuments(),
            GrowthContent.countDocuments({ date: { $gte: sevenDaysAgo } }),
            GrowthContent.find({ date: { $gte: thirtyDaysAgo } })
                .sort({ date: -1 })
                .select('dateKey status linkedin twitter reddit instagram')
                .lean(),
        ]);

        // Calculate posting streak (consecutive days with ALL posts marked as posted)
        let streak = 0;
        const sortedDays = allRecent.sort((a, b) => new Date(b.date) - new Date(a.date));
        for (const day of sortedDays) {
            if (day.status === 'posted' || day.status === 'partial') {
                streak++;
            } else {
                break;
            }
        }

        // Count total posts this week
        let postsThisWeek = 0;
        let postsPosted = 0;
        for (const day of allRecent.filter(d => new Date(d.date) >= sevenDaysAgo)) {
            const hasReel = !!day.instagram?.reel;
            const total = (day.linkedin?.length || 0) + (day.twitter?.length || 0) + (day.reddit?.length || 0) + 2 + (hasReel ? 1 : 0); // +2 for IG post + story, +1 for reel if exists
            const posted = [
                ...(day.linkedin || []).filter(p => p.posted),
                ...(day.twitter || []).filter(p => p.posted),
                ...(day.reddit || []).filter(p => p.posted),
                ...(day.instagram?.post?.posted ? [true] : []),
                ...(day.instagram?.story?.posted ? [true] : []),
                ...(day.instagram?.reel?.posted ? [true] : []),
            ].length;
            postsThisWeek += total;
            postsPosted += posted;
        }

        res.json({
            success: true,
            stats: {
                totalDaysGenerated: totalDays,
                daysThisWeek: thisWeek,
                streak,
                postsThisWeek,
                postsPosted,
                coverage: postsThisWeek > 0 ? Math.round((postsPosted / postsThisWeek) * 100) : 0,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

export default router;

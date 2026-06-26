/**
 * Super Admin — Growth Content Engine Routes
 * Auto-generated daily marketing content for all social platforms.
 */

import { Router } from 'express';
import GrowthContent from '../models/GrowthContent.js';
import Brand from '../models/Brand.js';
import { generateDailyContent, regeneratePlatformContent, getISTDateDetails } from '../services/growthContentEngine.js';
import { safeErrorMessage } from '../utils/safeError.js';
import { getRouter } from '../ai/router.js';
import { ensureS3Url, getSignedUrlIfNeeded, uploadToS3 } from '../utils/s3.js';
import { fetchImageBuffer, overlayLogo } from '../utils/logoOverlay.js';

const router = Router();

// Helper to sign S3 URLs in GrowthContent document dynamically
async function signGrowthContentUrls(content) {
    if (!content) return content;
    const signed = JSON.parse(JSON.stringify(content));

    if (signed.linkedin && Array.isArray(signed.linkedin)) {
        for (const post of signed.linkedin) {
            if (post.imageUrl) {
                post.imageUrl = await getSignedUrlIfNeeded(post.imageUrl);
            }
        }
    }
    if (signed.twitter && Array.isArray(signed.twitter)) {
        for (const post of signed.twitter) {
            if (post.imageUrl) {
                post.imageUrl = await getSignedUrlIfNeeded(post.imageUrl);
            }
        }
    }
    if (signed.reddit && Array.isArray(signed.reddit)) {
        for (const post of signed.reddit) {
            if (post.imageUrl) {
                post.imageUrl = await getSignedUrlIfNeeded(post.imageUrl);
            }
        }
    }
    if (signed.instagram) {
        if (signed.instagram.post) {
            if (signed.instagram.post.coverImageUrl) {
                signed.instagram.post.coverImageUrl = await getSignedUrlIfNeeded(signed.instagram.post.coverImageUrl);
            }
            if (signed.instagram.post.slides && Array.isArray(signed.instagram.post.slides)) {
                for (const slide of signed.instagram.post.slides) {
                    if (slide.imageUrl) {
                        slide.imageUrl = await getSignedUrlIfNeeded(slide.imageUrl);
                    }
                }
            }
        }
        if (signed.instagram.story) {
            if (signed.instagram.story.slides && Array.isArray(signed.instagram.story.slides)) {
                for (const slide of signed.instagram.story.slides) {
                    if (slide.imageUrl) {
                        slide.imageUrl = await getSignedUrlIfNeeded(slide.imageUrl);
                    }
                }
            }
        }
        if (signed.instagram.reel) {
            if (signed.instagram.reel.imageUrl) {
                signed.instagram.reel.imageUrl = await getSignedUrlIfNeeded(signed.instagram.reel.imageUrl);
            }
            if (signed.instagram.reel.videoUrl) {
                signed.instagram.reel.videoUrl = await getSignedUrlIfNeeded(signed.instagram.reel.videoUrl);
            }
        }
    }
    return signed;
}

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

        const signedContent = await signGrowthContentUrls(content);
        res.json({ success: true, content: signedContent });
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

        const signedContentList = await Promise.all(content.map(signGrowthContentUrls));
        res.json({
            success: true,
            content: signedContentList,
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
        const { date, brandId } = req.body; // Optional: generate for specific date and brand
        const targetDate = date ? new Date(date) : new Date();
        const dateKey = getISTDateDetails(targetDate).dateKey;

        // If content already exists, delete it first (force regeneration)
        await GrowthContent.deleteOne({ dateKey });

        const content = await generateDailyContent(targetDate, brandId);
        const signedContent = await signGrowthContentUrls(content?.toObject ? content.toObject() : content);
        res.json({ success: true, content: signedContent });
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
        const signedContent = await signGrowthContentUrls(content.toObject());
        res.json({ success: true, content: signedContent });
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
        const signedContent = await signGrowthContentUrls(content?.toObject ? content.toObject() : content);
        res.json({ success: true, content: signedContent });
    } catch (error) {
        console.error('[Growth Regenerate]', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════
// Simple concurrency limiter helper
class ConcurrencyLimiter {
    constructor(maxConcurrency = 5) {
        this.maxConcurrency = maxConcurrency;
        this.activeCount = 0;
        this.queue = [];
    }

    async run(task) {
        if (this.activeCount >= this.maxConcurrency) {
            await new Promise(resolve => this.queue.push(resolve));
        }
        this.activeCount++;
        try {
            return await task();
        } finally {
            this.activeCount--;
            if (this.queue.length > 0) {
                const next = this.queue.shift();
                next();
            }
        }
    }
}

const imageLimiter = new ConcurrencyLimiter(5);

// POST /api/superadmin/growth/:id/generate-image — Generate image for post
router.post('/:id/generate-image', async (req, res) => {
    try {
        const { platform, index = 0, slideIndex = null, imageModel = 'gpt-image-2' } = req.body;
        const content = await GrowthContent.findById(req.params.id);
        if (!content) return res.status(404).json({ success: false, error: 'Content not found' });

        let promptText = '';
        let targetObj = null;
        let aspectRatio = '1:1';
        let updateField = '';

        if (platform === 'linkedin' && content.linkedin[index]) {
            targetObj = content.linkedin[index];
            promptText = `Create a professional LinkedIn graphic for the following post: ${targetObj.content}`;
            aspectRatio = '16:9';
            updateField = `linkedin.${index}.imageUrl`;
        } else if (platform === 'twitter' && content.twitter[index]) {
            targetObj = content.twitter[index];
            promptText = `Create an engaging Twitter graphic for this tweet: ${targetObj.tweets[0]}`;
            aspectRatio = '16:9';
            updateField = `twitter.${index}.imageUrl`;
        } else if (platform === 'reddit' && content.reddit[index]) {
            targetObj = content.reddit[index];
            promptText = `Create a Reddit post image for title: ${targetObj.title}. Tone: ${targetObj.tone}`;
            aspectRatio = '16:9';
            updateField = `reddit.${index}.imageUrl`;
        } else if (platform === 'instagram_post') {
            if (slideIndex !== null) {
                if (content.instagram.post.slides[slideIndex]) {
                    targetObj = content.instagram.post.slides[slideIndex];
                    const visualDesc = targetObj.visualDescription || 'A clean and professional graphic';
                    const slideText = targetObj.text || '';
                    promptText = `A professional, modern Instagram post graphic depicting the following scene: "${visualDesc}". The graphic MUST feature the following exact text overlay, written clearly, boldly, legibly, and prominently on the image: "${slideText}". Make sure the text is integrated cleanly as a header or overlay banner. The layout should look high-end, clean, aesthetic, and premium. No spelling mistakes in the text.`.trim();
                    updateField = `instagram.post.slides.${slideIndex}.imageUrl`;
                } else {
                    return res.status(400).json({ success: false, error: 'Invalid slide index for instagram post' });
                }
            } else {
                // Generate COVER IMAGE!
                const post = content.instagram.post;
                const firstSlideText = post.slides?.[0]?.text || '';
                const theme = content.theme || '';
                promptText = `A highly aesthetic and scroll-stopping Instagram carousel cover graphic. Visual theme context: "${theme}". The cover image MUST display the following main title/hook text clearly, boldly, legibly, and prominently: "${firstSlideText}". Ensure the design is clean, premium, and visually striking, with a modern layout and professional typography. No spelling mistakes.`.trim();
                updateField = `instagram.post.coverImageUrl`;
            }
            aspectRatio = '4:5';
        } else if (platform === 'instagram_story') {
            if (slideIndex !== null && content.instagram.story.slides[slideIndex]) {
                targetObj = content.instagram.story.slides[slideIndex];
                const visualDesc = targetObj.visualDescription || 'A clean and professional graphic';
                const slideText = targetObj.text || '';
                promptText = `A professional, modern Instagram story graphic depicting the following scene: "${visualDesc}". The graphic MUST feature the following exact text overlay, written clearly, boldly, legibly, and prominently on the image: "${slideText}". Make sure the text is integrated cleanly as a header or overlay banner. The layout should look high-end, clean, aesthetic, and premium. No spelling mistakes in the text.`.trim();
                updateField = `instagram.story.slides.${slideIndex}.imageUrl`;
            } else {
                return res.status(400).json({ success: false, error: 'Slide index required for instagram story' });
            }
            aspectRatio = '9:16';
        } else {
            return res.status(400).json({ success: false, error: 'Invalid platform or index' });
        }

        // Run the generation logic inside our Concurrency Limiter
        const s3Url = await imageLimiter.run(async () => {
            const aiRouter = getRouter();

            // Determine the correct provider based on the model name.
            const isOpenAIModel = imageModel.startsWith('gpt-') || imageModel.startsWith('dall-e');
            const providerPreference = isOpenAIModel ? 'openai' : 'gemini';

            let result;
            try {
                result = await aiRouter.generateImage({ 
                    prompt: promptText, 
                    aspectRatio,
                    model: imageModel
                }, { provider: providerPreference });
            } catch (err) {
                console.warn(`[Growth Image Gen] ⚠️ Generation failed with model ${imageModel}: ${err.message}. Trying fallback to gemini...`);
                if (isOpenAIModel) {
                    result = await aiRouter.generateImage({
                        prompt: promptText,
                        aspectRatio,
                        model: 'gemini-3.1-flash-image-preview'
                    }, { provider: 'gemini' });
                } else {
                    throw err;
                }
            }

            if (!result || !result.imageUrl) throw new Error('Image generation failed to return URL');

            // Decode base64 and upload to S3 (this also stores a copy on local SSD)
            console.log(`📤 Growth Image: Uploading generated image to S3...`);
            let logoUrl = '';
            if (content.brandId) {
                const brand = await Brand.findById(content.brandId).lean();
                if (brand && brand.dna?.logo?.url) {
                    logoUrl = brand.dna.logo.url;
                }
            }

            if (logoUrl) {
                try {
                    console.log(`📥 Downloading generated image for overlay: ${result.imageUrl.substring(0, 100)}`);
                    const imageBuffer = await fetchImageBuffer(result.imageUrl, { cache: false });
                    const logoBuffer = await fetchImageBuffer(logoUrl).catch(err => {
                        console.warn(`Failed to fetch brand logo buffer: ${err.message}`);
                        return null;
                    });
                    
                    if (imageBuffer && logoBuffer) {
                        console.log(`🎨 Overlaying brand logo watermark on generated image...`);
                        const finalBuffer = await overlayLogo(imageBuffer, logoBuffer, 'bottom-right', 'medium');
                        const targetKey = `growth/gen-${Date.now()}.png`;
                        return await uploadToS3(finalBuffer, targetKey, 'image/png');
                    } else {
                        return await ensureS3Url(result.imageUrl, `growth/gen-${Date.now()}`);
                    }
                } catch (err) {
                    console.error(`Error applying watermark logo overlay: ${err.message}`);
                    return await ensureS3Url(result.imageUrl, `growth/gen-${Date.now()}`);
                }
            } else {
                return await ensureS3Url(result.imageUrl, `growth/gen-${Date.now()}`);
            }
        });

        // Perform atomic update in DB using $set to prevent versioning / lost update conflicts
        await GrowthContent.updateOne(
            { _id: req.params.id },
            { $set: { [updateField]: s3Url } }
        );

        // Fetch the updated document, sign URLs, and return
        const updatedDoc = await GrowthContent.findById(req.params.id);
        if (!updatedDoc) {
            return res.status(500).json({ success: false, error: 'Failed to retrieve updated content' });
        }
        
        const signedContent = await signGrowthContentUrls(updatedDoc.toObject());
        res.json({ success: true, content: signedContent });
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
        console.error('[Growth Stats] Error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════
// PUT /api/superadmin/growth/:id/reel-video — Update Reel Video details
// ══════════════════════════════════════════════════════════════
router.put('/:id/reel-video', async (req, res) => {
    try {
        const { videoUrl, imageUrl, storyboardProjectId } = req.body;
        const content = await GrowthContent.findById(req.params.id);
        if (!content) return res.status(404).json({ success: false, error: 'Content not found' });

        if (!content.instagram) content.instagram = {};
        if (!content.instagram.reel) content.instagram.reel = {};

        if (videoUrl !== undefined) content.instagram.reel.videoUrl = videoUrl;
        if (imageUrl !== undefined) content.instagram.reel.imageUrl = imageUrl;
        if (storyboardProjectId !== undefined) content.instagram.reel.storyboardProjectId = storyboardProjectId;

        await content.save();
        const signedContent = await signGrowthContentUrls(content.toObject());
        res.json({ success: true, content: signedContent });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

export default router;

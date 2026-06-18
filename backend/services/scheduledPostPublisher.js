/**
 * Scheduled Post Publisher — Background Service
 *
 * Runs every 60 seconds:
 *  1. Recovers stuck posts (processing > 15 min)
 *  2. Publishes posts where scheduledFor <= now (in parallel)
 *  3. Sends 1-hour reminder email for posts due in 55–65 min
 *
 * KEY DESIGN DECISIONS:
 * - Posts are atomically set to 'processing' before publish to prevent double-fire
 * - All due posts are published concurrently via Promise.allSettled()
 * - Carousel and video posts are fully supported
 * - Stuck-post recovery catches server restarts mid-publish
 */

import mongoose from 'mongoose';
import SocialPost from '../models/SocialPost.js';
import SocialAccount from '../models/SocialAccount.js';
import {
    publishToFacebook,
    publishToInstagram,
    publishToLinkedIn,
    publishToTwitter,
    publishCarouselToInstagram,
    publishCarouselToFacebook,
    publishCarouselToLinkedIn,
} from './socialService.js';
import { publishVideoToTikTok, publishPhotosToTikTok } from './tiktokService.js';
import { uploadToS3, mirrorUrlToS3, getSignedUrlIfNeeded } from '../utils/s3.js';
import { sendRetentionEmail } from '../agents/retention/mailer.js';
import config from '../config/env.js';

const POLL_INTERVAL_MS = 60 * 1000; // 60 seconds — fast enough to catch posts on time
const STUCK_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes — if still 'processing' after this, mark failed
const MAX_BATCH_SIZE = 20; // Max posts to process per tick
const MAX_RETRIES = 3; // Max retry attempts before permanent failure
const BACKOFF_BASE_MS = 2 * 60 * 1000; // 2 minutes — base for exponential backoff
let isRunning = false;

// ── Exponential backoff delay: 2min, 8min, 32min ──────────────────────────────
function getBackoffDelay(retryCount) {
    return BACKOFF_BASE_MS * Math.pow(4, retryCount); // 2m → 8m → 32m
}

// ── Determine if an error is retryable (transient) vs permanent ───────────────
function isRetryableError(errorMessage) {
    if (!errorMessage) return false;
    const msg = errorMessage.toLowerCase();
    // Permanent errors — do NOT retry
    const permanentPatterns = [
        'no active',         // No account connected
        'token expired',     // Need to reconnect
        'missing access',    // Missing credentials
        'unsupported platform', // Platform not implemented
        'require at least',  // Missing required media
        'reconnect',         // Account needs reconnection
        'permission',        // Insufficient permissions
        'invalid_token',     // Token is invalid
        'oauth',             // OAuth flow needed
    ];
    if (permanentPatterns.some(p => msg.includes(p))) return false;
    // Everything else (rate limit, timeout, network, 500, etc.) is retryable
    return true;
}

// ── Helper: format a datetime nicely ──────────────────────────────────────────
function fmtDate(d) {
    return new Date(d).toLocaleString('en-IN', {
        weekday: 'short', day: 'numeric', month: 'short',
        hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
    });
}

// ── 1-hour reminder email ─────────────────────────────────────────────────────
async function sendOneHourReminder(post) {
    try {
        // Load user email
        const User = mongoose.model('User');
        const user = await User.findById(post.user).select('email name');
        if (!user?.email) return;

        const platform = post.platform.charAt(0).toUpperCase() + post.platform.slice(1);
        const goLiveAt = fmtDate(post.scheduledFor);
        const preview  = (post.caption || '').substring(0, 120);

        const html = `
<div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;background:#09090b;color:#e4e4e7;border-radius:12px;overflow:hidden;">
  <div style="background:#FF4D00;padding:20px 28px;">
    <p style="margin:0;font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,0.8)">Mantram AI</p>
    <h1 style="margin:8px 0 0;font-size:22px;font-weight:800;color:#fff;">🔔 Post going live in 1 hour</h1>
  </div>
  <div style="padding:28px;">
    <p style="margin:0 0 16px;color:#a1a1aa;font-size:14px;">Your <strong style="color:#fff">${platform}</strong> post is scheduled for <strong style="color:#FF7A00">${goLiveAt} IST</strong>.</p>
    ${preview ? `<div style="background:#18181b;border:1px solid #27272a;border-radius:8px;padding:14px;margin-bottom:20px;font-size:13px;color:#d4d4d8;line-height:1.6;">${preview}${post.caption?.length > 120 ? '…' : ''}</div>` : ''}
    ${post.imageUrl ? `<img src="${post.imageUrl}" alt="Post image" style="width:100%;border-radius:8px;margin-bottom:20px;" />` : ''}
    <p style="margin:0;font-size:13px;color:#71717a;">If you need to make changes, open your <a href="${(config.frontendUrl?.[0] || 'https://mantram.ai')}/brand-calendar" style="color:#FF4D00;text-decoration:none;font-weight:600;">Brand Calendar</a> and cancel or reschedule before it goes live.</p>
  </div>
  <div style="padding:16px 28px;border-top:1px solid #27272a;font-size:11px;color:#52525b;">Mantram AI · You received this because you scheduled a social post.</div>
</div>`;

        await sendRetentionEmail({
            to:      user.email,
            subject: `🔔 Your ${platform} post goes live in 1 hour — ${goLiveAt}`,
            html,
        });

        post.reminderSentAt = new Date();
        await post.save();
        console.log(`[SCHEDULER] 📧 1-hr reminder sent for post ${post._id} to ${user.email}`);
    } catch (err) {
        console.warn(`[SCHEDULER] Failed to send reminder for post ${post._id}:`, err.message);
    }
}

// ── Helper: If a URL is from our S3 bucket, map it to our clean public proxy route ──
function getPublicProxyUrl(url) {
    if (!url || typeof url !== 'string') return url;
    const bucket = process.env.AWS_S3_BUCKET || config.aws?.bucket || 'mantram-ai-generated-media';
    const isS3 = (url.includes('.amazonaws.com') && url.includes(bucket)) || url.includes('mantram-media-assets.s3');
    if (isS3) {
        try {
            const parsedUrl = new URL(url);
            let pathname = parsedUrl.pathname;
            const pathParts = pathname.split('/').filter(Boolean);
            let key = pathParts[0] === bucket ? pathParts.slice(1).join('/') : pathParts.join('/');
            key = key.split('?')[0];
            try { key = decodeURIComponent(key); } catch { }
            const baseUrl = (config.backendUrl || 'https://api.mantram.ai').replace(/\/$/, '');
            return `${baseUrl}/api/media/file/${key}`;
        } catch (e) {
            console.warn('[PROXY URL] Failed to parse S3 URL:', url, e.message);
        }
    }
    return url;
}

// ── Resolve media URL to an absolute, publicly-accessible URL ─────────────────
async function resolveMediaUrl(url, userId, ext = 'png') {
    if (!url) return '';

    // Already an absolute URL
    if (url.startsWith('http')) {
        return getPublicProxyUrl(url);
    }

    // Data URI — upload to S3
    if (url.startsWith('data:')) {
        try {
            const s3Url = await uploadToS3(url, `social-scheduled/${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`);
            return getPublicProxyUrl(s3Url);
        } catch (s3Err) {
            console.error('[SCHEDULER] S3 upload failed:', s3Err.message);
            return url; // Return original as fallback
        }
    }

    // Relative path — prepend backend URL
    const baseUrl = (config.backendUrl || '').replace(/\/$/, '');
    const path = url.startsWith('/') ? url : `/${url}`;
    const fullUrl = `${baseUrl}${path}`;
    return getPublicProxyUrl(fullUrl);
}

// ── Publish a single post ─────────────────────────────────────────────────────
async function publishScheduledPost(post) {
    try {
        // Find the matching social account
        const basePlatform = post.platform.startsWith('instagram') ? 'instagram' : post.platform;
        const accountQuery = {
            user: post.user,
            platform: basePlatform,
            isActive: true,
        };
        if (post.accountId) accountQuery.accountId = post.accountId;
        const account = await SocialAccount.findOne(accountQuery).select('+accessToken');

        if (!account) {
            console.warn(`[SCHEDULER] No active ${post.platform} account for user ${post.user} (post ${post._id}) — marking failed`);
            post.status = 'failed';
            post.error = `No active ${post.platform} account connected. Please reconnect "${post.accountName || post.accountId}" and reschedule.`;
            await post.save();
            return;
        }

        // Pre-check token expiry — Meta tokens silently die after 60 days for many flows.
        // Catching this here gives the user a clear "reconnect" message instead of a cryptic Graph error.
        if (account.tokenExpiresAt && new Date(account.tokenExpiresAt) <= new Date()) {
            console.warn(`[SCHEDULER] Token expired for ${post.platform} account ${account.accountName} — marking failed`);
            post.status = 'failed';
            post.error = `Access token expired for ${post.platform} (${account.accountName}). Please reconnect.`;
            await post.save();
            return;
        }

        if (!account.accessToken) {
            post.status = 'failed';
            post.error = `Missing access token for ${post.platform} (${account.accountName}). Please reconnect.`;
            await post.save();
            return;
        }

        // Auto-detect video URLs stored in imageUrl field (e.g. from Video Studio storyboard)
        if (!post.videoUrl && post.imageUrl) {
            const cleanUrl = post.imageUrl.split('?')[0].toLowerCase();
            if (/\.(mp4|mov|avi|webm|mkv)$/.test(cleanUrl)) {
                console.log(`[SCHEDULER] Auto-detected video URL in imageUrl field for post ${post._id}, promoting to videoUrl`);
                post.videoUrl = post.imageUrl;
                post.imageUrl = null;
            }
        }

        // Resolve media URLs
        let absoluteImageUrl = await resolveMediaUrl(post.imageUrl, post.user, 'png');
        const absoluteVideoUrl = await resolveMediaUrl(post.videoUrl, post.user, 'mp4');

        // Resolve carousel URLs
        let carouselUrls = [];
        try {
            if (post.imageUrls && post.imageUrls.length > 1) {
                carouselUrls = await Promise.all(post.imageUrls.map(u => resolveMediaUrl(u, post.user, 'png')));
            }
            if (!absoluteImageUrl && carouselUrls.length > 0) {
                absoluteImageUrl = carouselUrls[0];
            }
        } catch (resolveErr) {
            console.error(`[SCHEDULER] Image resolution failed for post ${post._id}:`, resolveErr.message);
            post.status = 'failed';
            post.error = `Image upload/resolution failed: ${resolveErr.message}`;
            await post.save();
            return;
        }

        // Instagram requires media — fail fast with a clear message.
        if (post.platform === 'instagram' && !absoluteImageUrl && !absoluteVideoUrl && carouselUrls.length === 0) {
            post.status = 'failed';
            post.error = 'Instagram posts require at least one image or video. Add media and reschedule.';
            await post.save();
            return;
        }

        const caption = post.caption || '';
        const isCarousel = carouselUrls.length >= 2;

        console.log(`[SCHEDULER] Publishing post ${post._id} to ${post.platform} (${account.accountName}) — mode: ${absoluteVideoUrl ? 'VIDEO' : isCarousel ? 'CAROUSEL' : 'IMAGE/TEXT'}`);

        let postId = null;

        const isStory = post.platform === 'instagram_story';

        if (isCarousel) {
            // ── Carousel publish ──
            if (post.platform === 'facebook') {
                postId = await publishCarouselToFacebook(account.accountId, account.accessToken, caption, carouselUrls);
            } else if (post.platform.startsWith('instagram')) {
                if (isStory) {
                    // Publish each story individually since Instagram API doesn't support carousel stories
                    console.log(`[SCHEDULER] Sequential story publish for ${carouselUrls.length} items`);
                    const storyIds = [];
                    for (const imgUrl of carouselUrls) {
                        const id = await publishToInstagram(account.accountId, account.accessToken, '', imgUrl, null, { mediaType: 'STORIES' });
                        storyIds.push(id);
                    }
                    postId = storyIds.join(',');
                } else {
                    postId = await publishCarouselToInstagram(account.accountId, account.accessToken, caption, carouselUrls);
                }
            } else if (post.platform === 'linkedin') {
                postId = await publishCarouselToLinkedIn(account.accountId, account.accessToken, caption, carouselUrls);
            } else if (post.platform === 'twitter') {
                // Twitter doesn't support carousels — post first image with per-user credentials
                const twCreds = {
                    apiKey: config.twitter.apiKey,
                    apiSecret: config.twitter.apiSecret,
                    accessToken: account.accessToken,
                    accessTokenSecret: account.metadata?.accessTokenSecret || config.twitter.accessTokenSecret,
                };
                postId = await publishToTwitter(caption, carouselUrls[0], null, twCreds);
            } else if (post.platform === 'tiktok') {
                postId = await publishPhotosToTikTok(account.accessToken, carouselUrls, caption);
            }
        } else {
            // ── Single image/video/text publish ──
            if (post.platform === 'facebook') {
                postId = await publishToFacebook(account.accountId, account.accessToken, caption, absoluteImageUrl, absoluteVideoUrl);
            } else if (post.platform.startsWith('instagram')) {
                const options = isStory ? { mediaType: 'STORIES' } : {};
                postId = await publishToInstagram(account.accountId, account.accessToken, caption, absoluteImageUrl, absoluteVideoUrl, options);
            } else if (post.platform === 'linkedin') {
                postId = await publishToLinkedIn(account.accountId, account.accessToken, caption, absoluteImageUrl, absoluteVideoUrl);
            } else if (post.platform === 'twitter') {
                // Use per-user tokens stored in SocialAccount — not global app credentials
                const twCreds = {
                    apiKey: config.twitter.apiKey,
                    apiSecret: config.twitter.apiSecret,
                    accessToken: account.accessToken,
                    accessTokenSecret: account.metadata?.accessTokenSecret || config.twitter.accessTokenSecret,
                };
                postId = await publishToTwitter(caption, absoluteImageUrl, absoluteVideoUrl, twCreds);
            } else if (post.platform === 'tiktok') {
                if (absoluteVideoUrl) {
                    postId = await publishVideoToTikTok(account.accessToken, absoluteVideoUrl, caption);
                } else if (absoluteImageUrl) {
                    postId = await publishPhotosToTikTok(account.accessToken, [absoluteImageUrl], caption);
                } else {
                    throw new Error('TikTok requires a video or photo URL');
                }
            } else {
                post.status = 'failed';
                post.error = `Unsupported platform: ${post.platform}`;
                await post.save();
                return;
            }
        }

        post.status = 'published';
        post.postId = postId || '';
        post.publishedAt = new Date();
        post.error = '';
        await post.save();

        console.log(`[SCHEDULER] ✅ Published post ${post._id} to ${post.platform} (${post.accountName || 'N/A'}) — postId: ${postId}`);

    } catch (err) {
        const errorMsg = err.message || 'Unknown publishing error';
        console.error(`[SCHEDULER] ❌ Attempt ${(post.retryCount || 0) + 1} failed for post ${post._id} (${post.platform}):`, errorMsg);
        if (err.stack) console.error(err.stack);

        const currentRetry = post.retryCount || 0;

        // Check if the error is retryable and we haven't exceeded max retries
        if (isRetryableError(errorMsg) && currentRetry < (post.maxRetries || MAX_RETRIES)) {
            // Schedule retry with exponential backoff
            const backoffMs = getBackoffDelay(currentRetry);
            const nextRetryAt = new Date(Date.now() + backoffMs);

            post.status = 'scheduled';  // Put back in the scheduled queue
            post.retryCount = currentRetry + 1;
            post.lastRetryAt = new Date();
            post.scheduledFor = nextRetryAt;  // Reschedule with backoff delay
            post.error = `Retry ${currentRetry + 1}/${post.maxRetries || MAX_RETRIES}: ${errorMsg} — next attempt at ${fmtDate(nextRetryAt)}`;
            await post.save();

            console.log(`[SCHEDULER] 🔄 Post ${post._id} scheduled for retry ${post.retryCount}/${post.maxRetries || MAX_RETRIES} at ${nextRetryAt.toISOString()} (backoff: ${Math.round(backoffMs / 60000)}min)`);
        } else {
            // Permanent failure — max retries exhausted or non-retryable error
            post.status = 'failed';
            post.error = currentRetry > 0
                ? `Failed after ${currentRetry + 1} attempts: ${errorMsg}`
                : errorMsg;
            await post.save();

            if (currentRetry > 0) {
                console.warn(`[SCHEDULER] 💀 Post ${post._id} permanently failed after ${currentRetry + 1} attempts`);
            }
        }
    }
}

// ── Main polling tick ─────────────────────────────────────────────────────────
async function processDuePosts() {
    if (isRunning) return;
    isRunning = true;

    if (mongoose.connection.readyState !== 1) {
        console.warn('[SCHEDULER] Database not connected, skipping tick');
        isRunning = false;
        return;
    }

    try {
        const now = new Date();

        // ── 0) Recover stuck posts ───────────────────────────────────────────
        // If a post has been in 'processing' for over 15 minutes, the publish
        // attempt likely crashed (e.g. server restart). Mark it failed so the
        // user gets notified and can retry.
        const stuckCutoff = new Date(now.getTime() - STUCK_THRESHOLD_MS);
        const stuckResult = await SocialPost.updateMany(
            {
                status: 'processing',
                processingStartedAt: { $lt: stuckCutoff },
            },
            {
                $set: {
                    status: 'failed',
                    error: 'Publishing timed out (server may have restarted). Please reschedule.',
                },
            }
        );
        if (stuckResult.modifiedCount > 0) {
            console.warn(`[SCHEDULER] ⚠️ Recovered ${stuckResult.modifiedCount} stuck post(s)`);
        }

        // ── 1) Atomically claim due posts ────────────────────────────────────
        // Use findOneAndUpdate in a loop to atomically set status='processing'.
        // This prevents double-fire if two PM2 instances run simultaneously.
        const duePosts = [];
        for (let i = 0; i < MAX_BATCH_SIZE; i++) {
            const claimed = await SocialPost.findOneAndUpdate(
                {
                    status: 'scheduled',
                    scheduledFor: { $lte: now },
                },
                {
                    $set: {
                        status: 'processing',
                        processingStartedAt: now,
                    },
                },
                { returnDocument: 'after' }
            );
            if (!claimed) break; // No more due posts
            duePosts.push(claimed);
        }

        if (duePosts.length > 0) {
            console.log(`[SCHEDULER] Found ${duePosts.length} due post(s) — publishing in parallel...`);
        } else {
            // Diagnostic: show when the next scheduled post is due (helps catch timezone bugs)
            const nextPost = await SocialPost.findOne({ status: 'scheduled' })
                .sort({ scheduledFor: 1 })
                .select('scheduledFor platform accountName')
                .lean();
            if (nextPost) {
                const diff = Math.round((new Date(nextPost.scheduledFor).getTime() - now.getTime()) / 60000);
                console.log(`[SCHEDULER] No due posts. Next: ${nextPost.platform} (${nextPost.accountName}) at ${new Date(nextPost.scheduledFor).toISOString()} (in ${diff} min)`);
            }
        }

        // ── 2) Publish all claimed posts in parallel ─────────────────────────
        // Promise.allSettled ensures one failure doesn't block the others.
        // A Facebook text post takes <1s, while an IG Reel can take up to 5 min.
        // Running them in parallel means the fast ones go live immediately.
        const results = await Promise.allSettled(
            duePosts.map(post => publishScheduledPost(post))
        );

        // Log any unexpected rejections (publishScheduledPost should catch internally)
        for (let i = 0; i < results.length; i++) {
            if (results[i].status === 'rejected') {
                console.error(`[SCHEDULER] Unhandled rejection for post ${duePosts[i]._id}:`, results[i].reason);
                try {
                    duePosts[i].status = 'failed';
                    duePosts[i].error = results[i].reason?.message || 'Unknown error';
                    await duePosts[i].save();
                } catch (saveErr) {
                    console.error(`[SCHEDULER] Failed to save error state for post ${duePosts[i]._id}:`, saveErr.message);
                }
            }
        }

        // ── 3) Send 1-hour reminders ─────────────────────────────────────────
        const reminderWindow = {
            from: new Date(now.getTime() + 55 * 60 * 1000),
            to:   new Date(now.getTime() + 65 * 60 * 1000),
        };
        const reminderPosts = await SocialPost.find({
            status: 'scheduled',
            scheduledFor: { $gte: reminderWindow.from, $lte: reminderWindow.to },
            reminderSentAt: null,
        }).limit(30);

        if (reminderPosts.length > 0) {
            console.log(`[SCHEDULER] Sending ${reminderPosts.length} 1-hour reminder(s)...`);
        }
        for (const post of reminderPosts) {
            await sendOneHourReminder(post);
        }

    } catch (err) {
        console.error('[SCHEDULER] Error during tick:', err.message);
    } finally {
        isRunning = false;
    }
}

// ── Start ─────────────────────────────────────────────────────────────────────
export function startScheduledPostPublisher() {
    console.log(`📅 Scheduled Post Publisher starting — poll interval ${POLL_INTERVAL_MS / 1000}s`);

    processDuePosts()
        .then(() => console.log('📅 [SCHEDULER] Initial tick complete'))
        .catch(err => console.warn('[SCHEDULER] Initial run failed:', err.message));

    setInterval(() => {
        processDuePosts().catch(err => console.warn('[SCHEDULER] Tick failed:', err.message));
    }, POLL_INTERVAL_MS);

    console.log('📅 Scheduled Post Publisher active — checking every 60s (parallel publish + 1-hr reminder + stuck recovery)');
}

// ── Manual trigger (used by diagnostic endpoint) ──────────────────────────────
export async function runScheduledPostPublisherNow() {
    await processDuePosts();
}

// ── Single-post retry (used by diagnostic endpoint) ───────────────────────────
export async function retryFailedPost(postId) {
    const post = await SocialPost.findById(postId);
    if (!post) throw new Error('Post not found');
    post.status = 'scheduled';
    post.error = '';
    if (!post.scheduledFor || post.scheduledFor > new Date()) {
        post.scheduledFor = new Date();
    }
    await post.save();
    await publishScheduledPost(post);
    return post;
}

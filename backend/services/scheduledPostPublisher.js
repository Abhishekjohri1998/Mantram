/**
 * Scheduled Post Publisher — Background Service
 * 
 * Runs every 60 seconds, finds posts with status='scheduled' and scheduledFor <= now,
 * and publishes them via the platform-specific APIs.
 */

import SocialPost from '../models/SocialPost.js';
import SocialAccount from '../models/SocialAccount.js';
import {
    publishToFacebook,
    publishToInstagram,
    publishToLinkedIn
} from './socialService.js';
import { uploadToS3 } from '../utils/s3.js';
import config from '../config/env.js';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes (Compliance: Decelerated from 1min)
let isRunning = false;

/**
 * Process a single scheduled post — fetch its account, publish, update status
 */
async function publishScheduledPost(post) {
    try {
        // Find the connected social account — use accountId to match the exact account
        // the user selected (important when user has multiple accounts on the same platform)
        const accountQuery = {
            user: post.user,
            platform: post.platform,
            isActive: true,
        };
        if (post.accountId) accountQuery.accountId = post.accountId;
        const account = await SocialAccount.findOne(accountQuery);

        if (!account) {
            console.warn(`[SCHEDULER] No active ${post.platform} account found for user ${post.user} — marking failed`);
            post.status = 'failed';
            post.error = `No active ${post.platform} account connected. Please reconnect and reschedule.`;
            await post.save();
            return;
        }

        // Ensure imageUrl is absolute
        let absoluteImageUrl = post.imageUrl;
        if (absoluteImageUrl && !absoluteImageUrl.startsWith('http')) {
            if (absoluteImageUrl.startsWith('data:')) {
                try {
                    const s3Url = await uploadToS3(absoluteImageUrl, `social-scheduled/${post.user}/${Date.now()}.png`);
                    absoluteImageUrl = s3Url;
                } catch (s3Err) {
                    console.error('[SCHEDULER] S3 upload failed:', s3Err.message);
                }
            } else {
                const baseUrl = (config.backendUrl || '').replace(/\/$/, '');
                const path = absoluteImageUrl.startsWith('/') ? absoluteImageUrl : `/${absoluteImageUrl}`;
                absoluteImageUrl = `${baseUrl}${path}`;
            }
        }

        const caption = post.caption || '';

        console.log(`[SCHEDULER] Publishing scheduled post ${post._id} to ${post.platform} (${account.accountName}) — Caption: ${caption.substring(0, 60)}...`);

        let postId = null;

        if (post.platform === 'facebook') {
            postId = await publishToFacebook(account.accountId, account.accessToken, caption, absoluteImageUrl);
        } else if (post.platform === 'instagram') {
            postId = await publishToInstagram(account.accountId, account.accessToken, caption, absoluteImageUrl);
        } else if (post.platform === 'linkedin') {
            postId = await publishToLinkedIn(account.accountId, account.accessToken, caption, absoluteImageUrl);
        } else {
            post.status = 'failed';
            post.error = `Unsupported platform: ${post.platform}`;
            await post.save();
            return;
        }

        // Success — update the post record
        post.status = 'published';
        post.postId = postId || '';
        post.publishedAt = new Date();
        post.error = '';
        await post.save();

        console.log(`[SCHEDULER] ✅ Published post ${post._id} to ${post.platform} (${account.accountName}) — postId: ${postId}`);

    } catch (err) {
        console.error(`[SCHEDULER] ❌ Failed to publish post ${post._id} to ${post.platform}:`, err.message);
        post.status = 'failed';
        post.error = err.message || 'Unknown publishing error';
        await post.save();
    }
}

/**
 * Main polling function — find and process due posts
 */
async function processDuePosts() {
    if (isRunning) return; // Prevent overlap
    isRunning = true;

    try {
        const now = new Date();

        // Find all posts that are scheduled and due
        const duePosts = await SocialPost.find({
            status: 'scheduled',
            scheduledFor: { $lte: now },
        }).limit(20); // Process max 20 per tick to avoid overwhelming APIs

        if (duePosts.length > 0) {
            console.log(`[SCHEDULER] Found ${duePosts.length} due post(s) — processing...`);
        }

        // Process sequentially to respect API rate limits
        for (const post of duePosts) {
            await publishScheduledPost(post);
        }

    } catch (err) {
        console.error('[SCHEDULER] Error during scheduled post processing:', err.message);
    } finally {
        isRunning = false;
    }
}

/**
 * Start the scheduler — call this once from index.js
 */
export function startScheduledPostPublisher() {
    // Run immediately on startup
    processDuePosts().catch(err => console.warn('[SCHEDULER] Initial run failed:', err.message));

    // Then run every minute
    setInterval(() => {
        processDuePosts().catch(err => console.warn('[SCHEDULER] Tick failed:', err.message));
    }, POLL_INTERVAL_MS);

    console.log('📅 Scheduled Post Publisher active — checking every 5 minutes (Compliance Optimized)');
}

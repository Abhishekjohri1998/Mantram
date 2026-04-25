/**
 * Scheduled Post Publisher — Background Service
 *
 * Runs every 5 minutes:
 *  1. Publishes posts where scheduledFor <= now
 *  2. Sends 1-hour reminder email for posts due in 55–65 min
 */

import mongoose from 'mongoose';
import SocialPost from '../models/SocialPost.js';
import SocialAccount from '../models/SocialAccount.js';
import {
    publishToFacebook,
    publishToInstagram,
    publishToLinkedIn
} from './socialService.js';
import { uploadToS3 } from '../utils/s3.js';
import { sendRetentionEmail } from '../agents/retention/mailer.js';
import config from '../config/env.js';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let isRunning = false;

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

// ── Publish a single post ─────────────────────────────────────────────────────
async function publishScheduledPost(post) {
    try {
        const accountQuery = {
            user: post.user,
            platform: post.platform,
            isActive: true,
        };
        if (post.accountId) accountQuery.accountId = post.accountId;
        const account = await SocialAccount.findOne(accountQuery).select('+accessToken');

        if (!account) {
            console.warn(`[SCHEDULER] No active ${post.platform} account for user ${post.user} — marking failed`);
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
        console.log(`[SCHEDULER] Publishing post ${post._id} to ${post.platform} (${account.accountName})`);

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

        post.status = 'published';
        post.postId = postId || '';
        post.publishedAt = new Date();
        post.error = '';
        await post.save();

        console.log(`[SCHEDULER] ✅ Published post ${post._id} to ${post.platform} — postId: ${postId}`);

    } catch (err) {
        console.error(`[SCHEDULER] ❌ Failed to publish post ${post._id}:`, err.message);
        post.status = 'failed';
        post.error = err.message || 'Unknown publishing error';
        await post.save();
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

        // 1) Publish posts that are due now
        const duePosts = await SocialPost.find({
            status: 'scheduled',
            scheduledFor: { $lte: now },
        }).limit(20);

        if (duePosts.length > 0) {
            console.log(`[SCHEDULER] Found ${duePosts.length} due post(s) — publishing...`);
        }
        for (const post of duePosts) {
            await publishScheduledPost(post);
        }

        // 2) Send 1-hour reminders for posts due in 55–65 minutes
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
    processDuePosts().catch(err => console.warn('[SCHEDULER] Initial run failed:', err.message));

    setInterval(() => {
        processDuePosts().catch(err => console.warn('[SCHEDULER] Tick failed:', err.message));
    }, POLL_INTERVAL_MS);

    console.log('📅 Scheduled Post Publisher active — checking every 5 min (publish + 1-hr reminder)');
}

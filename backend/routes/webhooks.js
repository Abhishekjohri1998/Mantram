/**
 * Meta Webhook Routes
 * Handles Instagram & Facebook webhook verification and real-time event processing.
 * Processes incoming DMs, comments, and sends replies via Meta Graph API.
 */

import { Router } from 'express';
import crypto from 'crypto';
import { runAutonomousPipeline, handleCommentAutonomously } from '../services/autonomousAgent.js';
import Integration from '../models/Integration.js';
import Conversation from '../models/Conversation.js';
import config from '../config/env.js';
import { safeErrorMessage } from '../utils/safeError.js';

const router = Router();

const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN || 'mantram_verify_2025';
// removed shared global token fallback to comply with Meta "Account Integrity" policies
const PAGE_ACCESS_TOKEN = null;
const META_API_VERSION = 'v21.0';
const META_GRAPH_URL = `https://graph.facebook.com/${META_API_VERSION}`;

/**
 * Verify Meta X-Hub-Signature-256 header to prevent forged webhooks.
 * `rawBody` MUST be the exact bytes Meta sent (Buffer or string). Re-stringifying
 * a parsed JSON body will produce different bytes and the HMAC will never match.
 */
function verifyMetaSignature(rawBody, signatureHeader) {
    if (!signatureHeader) return false;
    const appSecret = config.facebook?.appSecret;
    if (!appSecret) {
        console.warn('⚠️ FACEBOOK_APP_SECRET not configured — skipping webhook signature verification');
        return true; // Allow in dev, but log warning
    }
    const [algo, signature] = signatureHeader.split('=');
    if (algo !== 'sha256' || !signature) return false;
    const bodyBuf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody || '', 'utf8');
    const expected = crypto.createHmac('sha256', appSecret).update(bodyBuf).digest('hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    const sigBuf = Buffer.from(signature, 'hex');
    if (expectedBuf.length !== sigBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, sigBuf);
}

// ── GET /api/webhooks/meta — Webhook verification (Meta requires this) ──

router.get('/meta', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('✅ Meta webhook verified');
        return res.status(200).send(challenge);
    }

    console.warn('⚠️ Meta webhook verification failed', { mode, tokenMatch: token === VERIFY_TOKEN });
    return res.sendStatus(403);
});

// ── POST /api/webhooks/meta — Receive real events from Meta ──

router.post('/meta', async (req, res) => {
    // Verify webhook signature against the EXACT raw bytes Meta sent.
    // index.js installs express.raw() for /api/webhooks/meta and stores those bytes
    // on req.rawBody before JSON-parsing, so signature checks survive parsing.
    const signature = req.headers['x-hub-signature-256'];
    const rawBody = req.rawBody;
    if (!rawBody) {
        console.error('❌ Meta webhook missing rawBody — raw-body middleware not applied');
        return res.sendStatus(500);
    }
    if (!verifyMetaSignature(rawBody, signature)) {
        console.warn('⚠️ Meta webhook signature verification failed — rejecting');
        return res.sendStatus(403);
    }

    // Immediately respond 200 (Meta retries on slow responses)
    res.sendStatus(200);

    try {
        const body = req.body;

        // ── Debug: log every incoming webhook payload ──
        console.log('🔔 WEBHOOK RECEIVED:', JSON.stringify(body).substring(0, 500));
        console.log('🔔 Object type:', body.object);
        console.log('🔔 Entries:', (body.entry || []).length);

        if (body.object === 'instagram' || body.object === 'page') {
            for (const entry of body.entry || []) {
                const pageId = entry.id;
                console.log('🔔 Processing entry for page:', pageId);
                console.log('🔔 Has messaging:', !!entry.messaging, '| Has changes:', !!entry.changes);

                // ── Instagram / Facebook DMs ──
                if (entry.messaging) {
                    for (const event of entry.messaging) {
                        console.log('📨 DM event:', JSON.stringify(event).substring(0, 300));
                        await handleIncomingDM(event, body.object, pageId);
                    }
                }

                // ── Comments (Instagram / Facebook) ──
                if (entry.changes) {
                    for (const change of entry.changes) {
                        console.log('💬 Change event field:', change.field);
                        if (change.field === 'comments' || change.field === 'feed') {
                            await handleComment(change, body.object, pageId);
                        }
                    }
                }
            }
        } else {
            console.warn('⚠️ Unknown webhook object type:', body.object);
        }
    } catch (error) {
        console.error('❌ Webhook processing error:', error.message);
    }
});

// ── Handle incoming DM ──

async function handleIncomingDM(event, platform, pageId) {
    try {
        if (!event.message || !event.message.text) {
            console.log('📎 Non-text message received (attachment/media), skipping');
            return;
        }

        // Skip echo messages (messages sent by us)
        if (event.message.is_echo) return;

        const senderId = event.sender?.id;
        const messageText = event.message.text;
        const timestamp = event.timestamp;

        console.log(`📨 [${platform}] DM from ${senderId}: "${messageText.substring(0, 60)}..."`);

        // Find which brand/user this page belongs to
        const integration = await Integration.findOne({
            $or: [
                { 'platformData.pageId': pageId },
                { 'platformData.igBusinessId': pageId },
            ],
            platform: { $in: ['instagram', 'facebook'] },
            status: 'connected',
        }).select('+accessToken +platformData.pageAccessToken');

        if (!integration) {
            console.warn(`⚠️ No integration found for page ${pageId}. Using env token.`);
        }

        const userId = integration?.user;
        const brandId = integration?.brand;

        // Get sender profile info from Meta
        const senderInfo = await getSenderProfile(senderId, integration);

        // ── Run through autonomous agent pipeline ──
        const result = await runAutonomousPipeline({
            userId: userId?.toString(),
            brandId: brandId?.toString(),
            platform: platform === 'instagram' ? 'instagram' : 'facebook',
            senderInfo: {
                id: senderId,
                name: senderInfo.name || `User ${senderId.slice(-4)}`,
                username: senderInfo.username || '',
                profilePic: senderInfo.profile_pic || '',
            },
            messageContent: messageText,
            channel: platform === 'instagram' ? 'instagram_dm' : 'facebook_messenger',
            metadata: {
                messageId: event.message.mid,
                timestamp,
                pageId,
            },
        });

        console.log(`✅ Pipeline complete: ${result.pipeline?.action || 'unknown'} [${(result.pipeline?.steps || []).join(' → ')}]`);
    } catch (error) {
        console.error('❌ Error handling DM:', error.message);
    }
}

// ── Handle comments ──

async function handleComment(change, platform, pageId) {
    try {
        const value = change.value;
        if (!value) return;

        const commentText = value.text || value.message;
        const commenterId = value.from?.id;
        const commenterName = value.from?.name || value.from?.username || 'Unknown';
        const commentId = value.comment_id || value.id;
        const postId = value.post_id || value.media_id;

        if (!commentText) return;

        console.log(`💬 [${platform}] Comment from ${commenterName}: "${(commentText).substring(0, 60)}"`);

        // ── Find brand for this page ──
        // Step 1: Try Integration model (has brand field)
        let integration = await Integration.findOne({
            $or: [
                { 'platformData.pageId': pageId },
                { 'platformData.igBusinessId': pageId },
            ],
            platform: { $in: ['instagram', 'facebook'] },
            status: 'connected',
        });

        let brandId = integration?.brand;

        // Step 2: Fallback — search SocialAccount (saves from social OAuth flow)
        // SocialAccount doesn't have a brand field, but we can find the user
        // and then look up their default brand.
        if (!brandId) {
            try {
                const SocialAccount = (await import('../models/SocialAccount.js')).default;
                const socialAcc = await SocialAccount.findOne({
                    accountId: pageId,
                    platform: { $in: ['instagram', 'facebook'] },
                    isActive: true,
                });
                if (socialAcc?.user) {
                    const Brand = (await import('../models/Brand.js')).default;
                    const userBrand = await Brand.findOne({ user: socialAcc.user }).sort({ createdAt: 1 });
                    brandId = userBrand?._id;
                    if (brandId) {
                        console.log(`💬 Found brand via SocialAccount fallback: ${userBrand.name}`);
                    }
                }
            } catch (fallbackErr) {
                console.warn('⚠️ SocialAccount fallback failed:', fallbackErr.message);
            }
        }

        if (!brandId) {
            console.warn(`⚠️ No brand found for page ${pageId} — comment auto-reply skipped`);
            return;
        }

        // Run through autonomous comment handler
        const result = await handleCommentAutonomously({
            brandId: brandId?.toString(),
            commentText,
            commenterId,
            commenterName,
            postId,
            commentId,
            platform,
            pageId,
        });

        console.log(`💬 Comment result: ${result.action}`);
    } catch (error) {
        console.error('❌ Error handling comment:', error.message);
    }
}

// ── Get sender profile from Meta ──

async function getSenderProfile(senderId, integration) {
    try {
        const token = integration?.platformData?.pageAccessToken || integration?.accessToken;
        if (!token) return {};

        const response = await fetch(`${META_GRAPH_URL}/${senderId}?fields=name,profile_pic,username&access_token=${token}`);
        if (!response.ok) return {};

        return await response.json();
    } catch {
        return {};
    }
}

// ── Send reply via Meta Graph API ──

export async function sendMetaReply(recipientId, messageText, platform = 'instagram', explicitToken = null) {
    try {
        const token = explicitToken;
        if (!token) {
            console.error('❌ No valid Page Access Token provided for reply. Global fallbacks disabled for Meta Compliance.');
            return { success: false, error: 'No access token' };
        }

        const endpoint = platform === 'instagram'
            ? `${META_GRAPH_URL}/me/messages`
            : `${META_GRAPH_URL}/me/messages`;

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                recipient: { id: recipientId },
                message: { text: messageText },
                access_token: token,
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('❌ Meta API error:', data.error?.message || 'Unknown');
            return { success: false, error: data.error?.message };
        }

        console.log(`✅ Reply sent to ${recipientId}: "${messageText.substring(0, 40)}..."`);
        return { success: true, messageId: data.message_id };
    } catch (error) {
        console.error('❌ Error sending Meta reply:', error.message);
        return { success: false, error: safeErrorMessage(error) };
    }
}

// ── Send quick reply buttons via Meta ──

export async function sendMetaQuickReplies(recipientId, text, buttons, platform = 'instagram', explicitToken = null) {
    try {
        const token = explicitToken;
        if (!token) {
            console.error('❌ No valid Page Access Token provided for quick replies. Global fallbacks disabled for Meta Compliance.');
            return { success: false, error: 'No access token' };
        }

        const quick_replies = buttons.map(btn => ({
            content_type: 'text',
            title: btn.label || btn.title,
            payload: btn.payload || btn.label || btn.title,
        }));

        const response = await fetch(`${META_GRAPH_URL}/me/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                recipient: { id: recipientId },
                message: { text, quick_replies },
                access_token: token,
            }),
        });

        const data = await response.json();
        if (!response.ok) return { success: false, error: data.error?.message };

        return { success: true, messageId: data.message_id };
    } catch (error) {
        return { success: false, error: safeErrorMessage(error) };
    }
}


export default router;

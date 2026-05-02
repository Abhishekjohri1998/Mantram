/**
 * Autonomous Agent — The Brain of Conversation Studio
 * 
 * Orchestrates the full autonomous pipeline for every incoming message:
 * Message In → Rate-limit check → Intent Detection → Compliance Check →
 * Brand Autonomy Rules → Auto-Reply / Escalate / Book Call → Send via Meta → Log
 * 
 * Also handles:
 * - Multi-turn conversation memory (last 10 messages for context)
 * - Confidence-gated replies (auto, suggest, escalate)
 * - Business hours enforcement
 * - Rate limiting per conversation
 */

import Conversation from '../models/Conversation.js';
import Contact from '../models/Contact.js';
import Brand from '../models/Brand.js';
import Automation from '../models/Automation.js';
import CommentReply from '../models/CommentReply.js';
import { detectIntentAI, detectIntent, generateAIReplies, detectLanguage } from './conversationEngine.js';
import { evaluateRoutes } from './routingEngine.js';
import { findMatchingAutomation, startAutomation, executeNode } from './automationEngine.js';
import { getRouter } from '../ai/router.js';

// Rate limiter — track auto-replies per conversation
const replyTracker = new Map(); // convId → { count, windowStart }

// Duplicate comment guard — prevents double-replying if Meta sends the same webhook twice
const recentlyRepliedComments = new Set();
const COMMENT_DEDUP_TTL = 10 * 60 * 1000; // 10 minutes

// ============================================================================
// MAIN AUTONOMOUS PIPELINE
// ============================================================================

/**
 * Process a message through the full autonomous pipeline.
 * Called by the webhook handler for every incoming DM.
 * Returns: { action, reply, confidence, escalated }
 */
export async function runAutonomousPipeline({ userId, brandId, platform, senderInfo, messageContent, messageType = 'text', channel = 'instagram_dm', metadata = {} }) {
    const pipelineLog = {
        startedAt: Date.now(),
        steps: [],
        action: 'none',
    };

    try {
        // ── Step 1: Find or create contact ──
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
            pipelineLog.steps.push('contact:created');
        } else {
            contact.totalMessages += 1;
            contact.lastInteractionAt = new Date();
            contact.language = detectLanguage(messageContent);
            await contact.save();
            pipelineLog.steps.push('contact:updated');
        }

        // ── Step 2: Find or create conversation ──
        let conversation = await Conversation.findOne({
            contact: contact._id,
            brand: brandId,
            status: { $in: ['active', 'waiting', 'handed_off'] },
        }).populate('contact');

        // ── Step 3: Load brand + autonomy settings ──
        const brand = brandId ? await Brand.findById(brandId) : null;
        const autonomy = brand?.autonomy || { enabled: true, autoReplyConfidence: 75, maxAutoRepliesPerConvo: 5, rateLimitPerConvo: 3 };

        // ── Step 4: Detect intent with conversation memory ──
        const previousMessages = conversation?.messages?.slice(-10) || [];
        let intent;
        try {
            intent = await detectIntentAI(messageContent, previousMessages, brand);
            pipelineLog.steps.push(`intent:${intent.intent}(${intent.confidence}%,${intent.source})`);
        } catch {
            intent = detectIntent(messageContent);
            intent.sentiment = 'neutral';
            intent.language = detectLanguage(messageContent);
            intent.source = 'keyword';
            pipelineLog.steps.push(`intent:${intent.intent}(fallback)`);
        }

        // ── Step 5: Create/update conversation ──
        if (!conversation) {
            conversation = await Conversation.create({
                user: userId,
                brand: brandId,
                contact: contact._id,
                channel,
                platform: platform || 'instagram',
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
            // Populate contact for downstream use
            conversation = await conversation.populate('contact');
            pipelineLog.steps.push('conversation:created');
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
            // Reset compliance window on new message
            conversation.complianceWindow = {
                opensAt: new Date(),
                closesAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
                canSendPromotional: true,
            };
            if (conversation.status === 'resolved' || conversation.status === 'snoozed') {
                conversation.status = 'active';
            }
            await conversation.save();
            pipelineLog.steps.push('conversation:updated');
        }

        // ── Step 6: Check if autonomy is enabled ──
        if (!autonomy.enabled) {
            pipelineLog.steps.push('autonomy:disabled');
            pipelineLog.action = 'suggest_only';
            return { contact, conversation, intent, pipeline: pipelineLog };
        }

        // ── Step 7: Check if AI handling is enabled on this conversation ──
        if (conversation.isAIHandling === false) {
            pipelineLog.steps.push('ai_handling:disabled(human_takeover)');
            pipelineLog.action = 'human_handling';
            return { contact, conversation, intent, pipeline: pipelineLog };
        }

        // ── Step 8: Rate limit check ──
        const convId = conversation._id.toString();
        if (isRateLimited(convId, autonomy.rateLimitPerConvo || 3)) {
            pipelineLog.steps.push('rate_limited');
            pipelineLog.action = 'rate_limited';
            return { contact, conversation, intent, pipeline: pipelineLog };
        }

        // ── Step 9: Compliance window check ──
        const now = new Date();
        if (conversation.complianceWindow?.closesAt && now > conversation.complianceWindow.closesAt) {
            pipelineLog.steps.push('compliance:window_closed');
            pipelineLog.action = 'compliance_blocked';
            return { contact, conversation, intent, pipeline: pipelineLog };
        }

        // ── Step 10: Max auto-replies per conversation check ──
        const aiRepliesInConvo = conversation.messages.filter(m => m.sentBy === 'ai').length;
        if (aiRepliesInConvo >= (autonomy.maxAutoRepliesPerConvo || 5)) {
            pipelineLog.steps.push(`max_replies_reached(${aiRepliesInConvo})`);
            // Escalate to human
            conversation.isAIHandling = false;
            conversation.status = 'handed_off';
            await conversation.save();
            pipelineLog.action = 'escalated_max_replies';
            return { contact, conversation, intent, pipeline: pipelineLog };
        }

        // ── Step 11: Business hours check ──
        if (autonomy.businessHours?.enabled) {
            if (!isWithinBusinessHours(autonomy.businessHours)) {
                pipelineLog.steps.push('outside_business_hours');
                // Still generate but mark as after-hours
            }
        }

        // ── Step 12: Call booking detection ──
        if (autonomy.callBookingEnabled && (intent.intent === 'booking' || intent.suggestedAction === 'book_call')) {
            const bookingReply = generateBookingReply(brand, autonomy);
            if (bookingReply) {
                await sendAutoReply(conversation, contact, bookingReply, 'ai', 95);
                pipelineLog.steps.push('call_booking_reply');
                pipelineLog.action = 'call_booked';
                trackReply(convId);
                return { contact, conversation, intent, pipeline: pipelineLog };
            }
        }

        // ── Step 13: Smart routing evaluation ──
        try {
            const routeResults = await evaluateRoutes(conversation, intent, brand);
            if (routeResults?.length > 0) {
                const firstResult = routeResults[0];
                pipelineLog.steps.push(`routed:${firstResult.action}(${firstResult.rule})`);

                // If routing already handled auto-reply, we're done
                if (firstResult.action === 'auto_reply' && firstResult.result?.success) {
                    // Send the reply that routing engine saved to conversation
                    const lastMsg = conversation.messages[conversation.messages.length - 1];
                    if (lastMsg?.sentBy === 'ai' && contact.platformUserId) {
                        const routeIntegration = await findIntegration(brandId, platform);
                        const routeToken = routeIntegration?.platformData?.pageAccessToken || routeIntegration?.accessToken;
                        await sendViaMeta(contact.platformUserId, lastMsg.content, conversation.platform, routeToken);
                        pipelineLog.steps.push('meta:sent');
                    }
                    pipelineLog.action = 'auto_replied_via_routing';
                    trackReply(convId);
                    return { contact, conversation, intent, pipeline: pipelineLog };
                }

                if (firstResult.action === 'escalate') {
                    pipelineLog.action = 'escalated';
                    return { contact, conversation, intent, pipeline: pipelineLog };
                }
            }
        } catch (routeErr) {
            pipelineLog.steps.push(`routing_error:${routeErr.message}`);
        }

        // ── Step 13b: User-defined Automation Studio flows ──
        // Either resume an in-progress automation for this conversation, or match
        // a new automation against the inbound message. Runs BEFORE the AI fallback
        // so user-built flows take priority over generic AI replies.
        try {
            const automationResult = await runAutomationStep({
                conversation,
                contact,
                brandId,
                platform,
                messageText: messageContent,
                intent,
                channel,
            });
            if (automationResult?.handled) {
                pipelineLog.steps.push(`automation:${automationResult.tag}`);
                pipelineLog.action = automationResult.completed ? 'automation_completed' : 'automation_running';
                trackReply(convId);
                return { contact, conversation, intent, pipeline: pipelineLog };
            }
        } catch (autoErr) {
            pipelineLog.steps.push(`automation_error:${autoErr.message}`);
        }

        // ── Step 14: Confidence-gated autonomous reply ──
        const confidenceThreshold = autonomy.autoReplyConfidence || 75;

        if (intent.confidence >= confidenceThreshold) {
            // HIGH confidence — auto-reply directly
            const replies = await generateAIReplies(conversation, brand);
            const best = replies[0];

            if (best && best.confidence >= 60) {
                await sendAutoReply(conversation, contact, best.content, 'ai', best.confidence);

                if (contact.platformUserId) {
                    // Meta Compliance: Add a "human-like" delay so replies aren't instant (Anti-Mimicry)
                    console.log(`🤖 AI prepared reply, waiting 20s to simulate human processing...`);
                    await new Promise(resolve => setTimeout(resolve, 20000));

                    const integration = await findIntegration(brandId, platform);
                    const token = integration?.platformData?.pageAccessToken || integration?.accessToken;

                    await sendViaMeta(contact.platformUserId, best.content, conversation.platform, token);
                    pipelineLog.steps.push('meta:sent');
                }

                pipelineLog.steps.push(`auto_reply(${best.confidence}%)`);
                pipelineLog.action = 'auto_replied';
                trackReply(convId);
            }
        } else if (intent.confidence >= Math.max(30, confidenceThreshold - 25)) {
            // MEDIUM confidence — generate suggestions but don't send
            pipelineLog.steps.push('suggest_only(medium_confidence)');
            pipelineLog.action = 'suggest_only';
        } else {
            // LOW confidence — escalate to human
            conversation.isAIHandling = false;
            conversation.status = 'handed_off';
            await conversation.save();
            pipelineLog.steps.push('escalated(low_confidence)');
            pipelineLog.action = 'escalated';
        }

        pipelineLog.completedAt = Date.now();
        pipelineLog.durationMs = pipelineLog.completedAt - pipelineLog.startedAt;

        console.log(`🤖 Pipeline: [${pipelineLog.steps.join(' → ')}] (${pipelineLog.durationMs}ms)`);

        return { contact, conversation, intent, pipeline: pipelineLog };

    } catch (error) {
        console.error('❌ Autonomous pipeline error:', error.message);
        pipelineLog.steps.push(`error:${error.message}`);
        pipelineLog.action = 'error';
        return { pipeline: pipelineLog, error: error.message };
    }
}


// ============================================================================
// COMMENT HANDLER
// ============================================================================

/**
 * Handle incoming comment — auto-reply or trigger Comment-to-DM
 */
export async function handleCommentAutonomously({ brandId, commentText, commenterId, commenterName, postId, commentId, platform, pageId }) {
    const logEntry = {
        brand: brandId,
        platform,
        commentId: commentId || '',
        postId: postId || '',
        commentText: (commentText || '').substring(0, 500),
        commenterName,
        commenterId: commenterId || '',
    };

    try {
        const brand = brandId ? await Brand.findById(brandId) : null;
        const autonomy = brand?.autonomy || {};

        if (!autonomy.enabled) {
            await safeLogCommentReply({ ...logEntry, action: 'skipped', replySource: 'none', replyText: '', intent: 'disabled' });
            return { action: 'disabled' };
        }

        // ── Guard: Skip own comments (prevent reply loops) ──
        if (commenterId && pageId && commenterId === pageId) {
            console.log('💬 Skipping own comment (page replying to itself)');
            return { action: 'skipped_own' };
        }

        // ── Guard: Duplicate webhook detection ──
        if (commentId && recentlyRepliedComments.has(commentId)) {
            console.log(`💬 Duplicate webhook for comment ${commentId}, skipping`);
            return { action: 'skipped_duplicate' };
        }

        // Detect intent of comment
        let intent;
        try {
            intent = await detectIntentAI(commentText, [], brand);
        } catch {
            intent = detectIntent(commentText);
        }

        console.log(`💬 Comment intent: ${intent.intent} (${intent.confidence}%) from ${commenterName}`);
        logEntry.intent = intent.intent;
        logEntry.confidence = intent.confidence;

        // If Comment-to-DM enabled and intent suggests buying interest
        const dmTriggerIntents = ['purchase_intent', 'price_inquiry', 'product_inquiry', 'booking', 'order_status'];
        if (autonomy.commentToDM && dmTriggerIntents.includes(intent.intent) && intent.confidence >= 60) {
            const dmMessage = await generateCommentToDMMessage(brand, commentText, intent);
            let apiSuccess = false;
            if (commenterId) {
                const dmIntegration = await findIntegration(brandId, platform);
                const dmToken = dmIntegration?.platformData?.pageAccessToken || dmIntegration?.accessToken;
                const result = await sendViaMeta(commenterId, dmMessage, platform, dmToken);
                apiSuccess = result?.success || false;
                console.log(`📤 Comment-to-DM sent to ${commenterName}`);
            }
            markCommentReplied(commentId);
            await safeLogCommentReply({ ...logEntry, action: 'comment_to_dm', replyText: dmMessage, replySource: 'ai', apiSuccess });
            return { action: 'comment_to_dm', intent, dmMessage };
        }

        // If comment auto-reply enabled
        if (autonomy.commentAutoReply && intent.confidence >= 60) {
            const replyText = await generateCommentReply(brand, commentText, intent);
            let apiSuccess = false;
            if (commentId && replyText) {
                // Anti-bot delay — 30s feels more human
                console.log('💬 Waiting 30s before replying to comment (anti-bot delay)...');
                await new Promise(r => setTimeout(r, 30000));
                const result = await replyToComment(commentId, replyText, brandId);
                apiSuccess = result?.success || false;
                if (apiSuccess) {
                    console.log(`💬 ✅ Comment auto-replied to ${commentId}: "${replyText.substring(0, 40)}..."`);
                } else {
                    console.error(`💬 ❌ Comment reply FAILED for ${commentId}:`, JSON.stringify(result?.data?.error || result?.error || 'Unknown'));
                }
            }
            markCommentReplied(commentId);
            await safeLogCommentReply({ ...logEntry, action: 'comment_replied', replyText, replySource: 'ai', apiSuccess });
            return { action: 'comment_replied', intent, reply: replyText };
        }

        await safeLogCommentReply({ ...logEntry, action: 'no_action', replySource: 'none' });
        return { action: 'no_action', intent };
    } catch (error) {
        console.error('❌ Comment pipeline error:', error.message);
        await safeLogCommentReply({ ...logEntry, action: 'error', errorMessage: error.message });
        return { action: 'error', error: error.message };
    }
}

/**
 * Mark a comment ID as recently replied — prevents double-replies from duplicate webhooks.
 */
function markCommentReplied(commentId) {
    if (!commentId) return;
    recentlyRepliedComments.add(commentId);
    setTimeout(() => recentlyRepliedComments.delete(commentId), COMMENT_DEDUP_TTL);
}

/**
 * Safely persist a CommentReply log entry. Never throws — logging should not break the pipeline.
 */
async function safeLogCommentReply(data) {
    try {
        await CommentReply.create(data);
    } catch (err) {
        // Ignore duplicate key (commentId unique index) — this is expected for duplicate webhooks
        if (err.code !== 11000) {
            console.warn('⚠️ CommentReply log failed:', err.message);
        }
    }
}


// ============================================================================
// FOLLOW-UP SCHEDULER
// ============================================================================

/**
 * Check for conversations that need follow-up.
 * Called by a setInterval in server startup.
 */
export async function runFollowUpCheck() {
    try {
        // Find brands with followUp enabled
        const brands = await Brand.find({ 'autonomy.followUpEnabled': true, status: 'active' });

        for (const brand of brands) {
            const delayMs = (brand.autonomy.followUpDelayHours || 24) * 60 * 60 * 1000;
            const cutoff = new Date(Date.now() - delayMs);

            // Find conversations that haven't had a brand reply since cutoff
            const staleConvos = await Conversation.find({
                brand: brand._id,
                status: 'active',
                isAIHandling: true,
                lastMessageAt: { $lt: cutoff },
                'complianceWindow.closesAt': { $gt: new Date() }, // still within compliance window
                tags: { $ne: 'followed_up' } // Meta Compliance: Only follow up ONCE per conversation
            }).populate('contact').populate('brand', 'name dna autonomy').limit(5);

            for (const convo of staleConvos) {
                // Check if last message was from contact (not from us)
                const lastMsg = convo.messages[convo.messages.length - 1];
                if (!lastMsg || lastMsg.role !== 'contact') continue;

                // Check max auto-replies
                const aiReplies = convo.messages.filter(m => m.sentBy === 'ai').length;
                if (aiReplies >= (brand.autonomy.maxAutoRepliesPerConvo || 5)) continue;

                // Generate follow-up
                const replies = await generateAIReplies(convo, brand);
                const followUp = replies.find(r => r.type === 'helpful') || replies[0];

                if (followUp) {
                    await sendAutoReply(convo, convo.contact, followUp.content, 'ai', followUp.confidence);

                    if (convo.contact?.platformUserId) {
                        const integration = await findIntegration(brand._id, convo.platform);
                        const token = integration?.platformData?.pageAccessToken || integration?.accessToken;
                        await sendViaMeta(convo.contact.platformUserId, followUp.content, convo.platform, token);
                    }

                    convo.tags = [...new Set([...(convo.tags || []), 'followed_up'])];
                    await convo.save();

                    console.log(`📤 Follow-up sent for conversation ${convo._id}`);
                }
            }
        }
    } catch (error) {
        console.error('❌ Follow-up scheduler error:', error.message);
    }
}


// ============================================================================
// HELPERS
// ============================================================================

/**
 * Save an auto-reply message to the conversation
 */
async function sendAutoReply(conversation, contact, content, sentBy = 'ai', confidence = 80) {
    conversation.messages.push({
        role: 'brand',
        content,
        messageType: 'text',
        sentBy,
        aiConfidence: confidence,
    });
    conversation.lastMessageAt = new Date();
    conversation.lastMessagePreview = `AI: ${content.substring(0, 80)}`;
    conversation.unreadCount = 0;
    await conversation.save();
}

/**
 * Send message via Meta Graph API with explicit token
 */
async function sendViaMeta(recipientId, messageText, platform = 'instagram', token = null) {
    try {
        const { sendMetaReply } = await import('../routes/webhooks.js');
        if (sendMetaReply) {
            return await sendMetaReply(recipientId, messageText, platform, token);
        }
    } catch (err) {
        console.warn('⚠️ Meta send unavailable:', err.message);
    }
    return { success: false };
}

/**
 * Resume an in-progress automation flow, or match + start a new one.
 * Returns { handled, completed, tag } so the pipeline can short-circuit.
 *
 * Why: previously runAutonomousPipeline jumped straight from intent detection
 * to AI auto-reply, so flows built in the Automation Studio (Automations.jsx)
 * never fired. This bridges that gap.
 */
async function runAutomationStep({ conversation, contact, brandId, platform, messageText, intent, channel }) {
    if (!brandId) return { handled: false };

    // Resume in-progress automation: contact's reply feeds the waiting node.
    if (conversation.activeAutomation?.automationId && conversation.activeAutomation?.currentNode) {
        const automation = await Automation.findById(conversation.activeAutomation.automationId);
        if (!automation || !automation.isActive || automation.status !== 'active') {
            conversation.activeAutomation = null;
            await conversation.save();
        } else {
            const messages = await advanceAutomation(automation, conversation, contact, messageText);
            await dispatchAutomationMessages(messages, contact, conversation, brandId, platform);
            return {
                handled: true,
                completed: !conversation.activeAutomation,
                tag: `resume:${automation.name}`,
            };
        }
    }

    // Match against active automations for this brand.
    const automation = await findMatchingAutomation(brandId, messageText, intent.intent, channel);
    if (!automation) return { handled: false };

    const messages = await startAutomation(automation, conversation, contact);
    await dispatchAutomationMessages(messages, contact, conversation, brandId, platform);
    return {
        handled: true,
        completed: !conversation.activeAutomation,
        tag: `match:${automation.name}`,
    };
}

/**
 * Walk an automation forward from its currently-waiting node, feeding the
 * contact's latest message as the userResponse for ask_question / quick_replies.
 */
async function advanceAutomation(automation, conversation, contact, userResponse) {
    const messagesToSend = [];
    let currentNodeId = conversation.activeAutomation.currentNode;
    let response = userResponse;

    for (let step = 0; step < 20; step++) {
        const result = await executeNode(automation, currentNodeId, conversation, contact, response);
        response = null; // userResponse only consumed by the first waiting node

        if (result.message) {
            messagesToSend.push(result.message);
            conversation.messages.push(result.message);
        }

        if (result.completed) {
            conversation.activeAutomation = null;
            automation.stats.completedRuns = (automation.stats.completedRuns || 0) + 1;
            await automation.save();
            break;
        }

        if (result.waitForResponse) {
            conversation.activeAutomation.currentNode = result.nextNodeId || currentNodeId;
            break;
        }

        if (result.delayMs > 0) {
            conversation.activeAutomation.currentNode = result.nextNodeId;
            break;
        }

        currentNodeId = result.nextNodeId;
        if (!currentNodeId) {
            conversation.activeAutomation = null;
            break;
        }
    }

    conversation.lastMessageAt = new Date();
    if (messagesToSend.length > 0) {
        conversation.lastMessagePreview = `Bot: ${messagesToSend[messagesToSend.length - 1].content.substring(0, 80)}`;
    }
    await conversation.save();
    return messagesToSend;
}

/**
 * Send each automation-generated message out via Meta with a small delay so
 * Meta's anti-spam/anti-mimicry signals stay clean.
 */
async function dispatchAutomationMessages(messages, contact, conversation, brandId, platform) {
    if (!messages?.length || !contact?.platformUserId) return;
    const integration = await findIntegration(brandId, platform);
    const token = integration?.platformData?.pageAccessToken || integration?.accessToken;
    if (!token) {
        console.warn('⚠️ Automation produced messages but no Meta token available');
        return;
    }
    for (const msg of messages) {
        if (msg.role !== 'brand') continue;
        await sendViaMeta(contact.platformUserId, msg.content, conversation.platform || platform, token);
        await new Promise(r => setTimeout(r, 800));
    }
}

/**
 * Helper to find brand integration
 */
async function findIntegration(brandId, platform) {
    try {
        const Integration = (await import('../models/Integration.js')).default;
        return await Integration.findOne({
            brand: brandId,
            platform: { $in: ['instagram', 'facebook'] },
            status: 'connected'
        }).select('+accessToken +platformData.pageAccessToken');
    } catch {
        return null;
    }
}

/**
 * Reply to a Meta comment using brand-specific token
 * Tries Integration first, then SocialAccount as fallback.
 */
async function replyToComment(commentId, text, brandId) {
    try {
        // Step 1: Try Integration model for token
        const integration = await findIntegration(brandId);
        let token = integration?.platformData?.pageAccessToken || integration?.accessToken;

        // Step 2: Fallback — try SocialAccount
        if (!token) {
            try {
                const Brand = (await import('../models/Brand.js')).default;
                const SocialAccount = (await import('../models/SocialAccount.js')).default;
                const brand = await Brand.findById(brandId);
                if (brand?.user) {
                    const socialAcc = await SocialAccount.findOne({
                        user: brand.user,
                        platform: { $in: ['facebook', 'instagram'] },
                        isActive: true,
                    }).select('+accessToken');
                    token = socialAcc?.accessToken;
                    if (token) console.log('💬 Using SocialAccount token for comment reply');
                }
            } catch { /* ignore */ }
        }

        if (!token) {
            console.warn('⚠️ No brand token available for comment reply — checked Integration and SocialAccount');
            return { success: false, error: 'No brand token' };
        }

        console.log(`💬 Attempting Graph API reply to comment ${commentId} with token ${token.substring(0, 12)}...`);

        const response = await fetch(`https://graph.facebook.com/v22.0/${commentId}/replies`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: text,
                access_token: token,
            }),
        });

        const data = await response.json();
        if (!response.ok) {
            console.error('❌ Comment reply Graph API error:', JSON.stringify(data.error || data));
            // Log specific permission errors so they're easy to find in logs
            if (data.error?.code === 10 || data.error?.code === 200) {
                console.error('❌ PERMISSION ERROR: Your app likely needs instagram_manage_comments permission approved by Meta App Review.');
                console.error('❌ For testing, ensure the commenter is a registered Test User in your Meta app.');
            }
        } else {
            console.log(`💬 ✅ Graph API reply successful. Reply ID: ${data.id}`);
        }
        return { success: response.ok, data };
    } catch (err) {
        console.error('❌ Comment reply error:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Generate booking reply with link
 */
function generateBookingReply(brand, autonomy) {
    const name = brand?.name || 'us';
    const link = autonomy.callBookingLink;

    if (link) {
        return `Thanks for your interest! 📅 You can book a call with ${name} directly here: ${link}\n\nOr just reply with your preferred time and we'll set it up!`;
    }
    return `Thanks for reaching out! 📅 We'd love to schedule a call with you. What day and time works best? Our team will confirm shortly.`;
}

/**
 * Generate a DM message triggered by a comment — AI-powered with brand voice.
 * Falls back to static templates if AI fails.
 */
async function generateCommentToDMMessage(brand, commentText, intent) {
    const name = brand?.name || 'us';

    // ── AI path ──
    try {
        const router = getRouter();
        const voice = brand?.dna?.voice || {};
        const prompt = `You are a DM reply assistant for the brand "${name}".

BRAND VOICE:
- Personality: ${voice.personality || 'Professional & Friendly'}
- Industry: ${brand?.dna?.industry || 'general'}

Someone left this comment on your social media post:
"${commentText}"

Detected intent: ${intent.intent} (${intent.confidence}% confidence)

Generate a SINGLE short, warm DM message (max 180 characters) to follow up privately.
- Be genuine, not robotic
- Use 1 emoji max
- If the comment is in Hindi/Hinglish, reply in the same language
- Reference their comment naturally

Respond ONLY with the message text, no quotes, no JSON.`;

        const result = await router.generateText({ prompt, maxTokens: 120, temperature: 0.7 });
        const text = result.text?.trim();
        if (text && text.length > 5 && text.length < 300) return text;
    } catch (err) {
        console.warn('⚠️ AI comment-to-DM generation failed, using template:', err.message);
    }

    // ── Fallback: static templates ──
    const intentMessages = {
        purchase_intent: `Hey! 👋 We noticed your interest on our post. We'd love to help you with your purchase! Here's some more info about what we offer at ${name}.`,
        price_inquiry: `Hi there! 💰 Thanks for asking about pricing. We've sent you this DM so we can share all the details privately. What product/service are you interested in?`,
        product_inquiry: `Hey! 🛍️ Great question on our post! We've slid into your DMs to give you the full scoop. What would you like to know about?`,
        booking: `Hi! 📅 Let's get you booked in. What day and time works best for you?`,
        order_status: `Hey! 📦 Please share your order number and we'll check the status right away.`,
    };
    return intentMessages[intent.intent] || `Hey! 👋 Thanks for engaging with our post at ${name}. How can we help you?`;
}

/**
 * Generate a public comment reply — AI-powered with brand voice.
 * Falls back to static templates if AI fails.
 */
async function generateCommentReply(brand, commentText, intent) {
    const name = brand?.name || '';

    // ── AI path ──
    try {
        const router = getRouter();
        const voice = brand?.dna?.voice || {};
        const prompt = `You are a social media manager for "${name}".

BRAND VOICE:
- Personality: ${voice.personality || 'Professional & Friendly'}
- Industry: ${brand?.dna?.industry || 'general'}

Someone commented on your post:
"${commentText}"

Detected intent: ${intent.intent} | Sentiment: ${intent.sentiment || 'neutral'}

Generate a SHORT public comment reply (max 150 characters).
Rules:
- Be authentic and brand-appropriate
- Use 1 emoji max
- If the comment is negative/complaint, be empathetic and offer to help via DM
- If it's positive/feedback, thank them warmly
- If they're asking about price/product, invite them to DM
- If the comment is in Hindi/Hinglish, reply in the same language
- NEVER sound robotic or generic

Respond ONLY with the reply text, no quotes, no JSON.`;

        const result = await router.generateText({ prompt, maxTokens: 100, temperature: 0.7 });
        const text = result.text?.trim();
        if (text && text.length > 3 && text.length < 250) return text;
    } catch (err) {
        console.warn('⚠️ AI comment reply generation failed, using template:', err.message);
    }

    // ── Fallback: static templates ──
    const replies = {
        greeting: `Thanks for reaching out! 😊 DM us for more details.`,
        price_inquiry: `Hey! 💬 We've sent you a DM with all the pricing details!`,
        purchase_intent: `🎉 Awesome! Check your DMs, we've sent you more info!`,
        complaint: `We're sorry to hear that. 😔 We've DMed you to resolve this right away.`,
        product_inquiry: `Great question! 💡 Check your inbox, we've sent you the details.`,
        feedback: `Thank you for your feedback! 🙏 We really appreciate it${name ? ` from ${name}` : ''}.`,
    };
    return replies[intent.intent] || `Thanks for your comment! 💬 Feel free to DM us for more info.`;
}

/**
 * Rate limiter — max N auto-replies per conversation per 5 min window
 */
function isRateLimited(convId, max = 3) {
    const window = 5 * 60 * 1000; // 5 minutes
    const entry = replyTracker.get(convId);

    if (!entry) return false;
    if (Date.now() - entry.windowStart > window) {
        replyTracker.delete(convId);
        return false;
    }
    return entry.count >= max;
}

function trackReply(convId) {
    const entry = replyTracker.get(convId);
    const window = 5 * 60 * 1000;

    if (!entry || Date.now() - entry.windowStart > window) {
        replyTracker.set(convId, { count: 1, windowStart: Date.now() });
    } else {
        entry.count += 1;
    }
}

/**
 * Check if current time is within business hours
 */
function isWithinBusinessHours(bh) {
    if (!bh?.enabled) return true;

    try {
        const now = new Date();
        // Simple hour-based check (timezone-aware version needs Intl)
        const formatter = new Intl.DateTimeFormat('en-US', {
            hour: '2-digit', minute: '2-digit', hour12: false,
            timeZone: bh.timezone || 'Asia/Kolkata',
        });
        const currentTime = formatter.format(now);
        return currentTime >= (bh.start || '09:00') && currentTime <= (bh.end || '18:00');
    } catch {
        return true;
    }
}

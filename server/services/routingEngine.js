/**
 * Smart Routing Engine
 * Evaluates routing rules against incoming conversations and executes actions.
 * Actions: auto_reply, escalate, tag, assign_agent, trigger_automation
 */

import Conversation from '../models/Conversation.js';
import { generateAIReplies } from './conversationEngine.js';
import Brand from '../models/Brand.js';

// ============================================================================
// DEFAULT ROUTING RULES
// ============================================================================

const DEFAULT_RULES = [
    {
        name: 'Auto-greet new contacts',
        priority: 1,
        enabled: true,
        conditions: { intent: 'greeting', minConfidence: 70 },
        action: 'auto_reply',
        actionConfig: { useAI: true, replyIndex: 0 },
    },
    {
        name: 'Escalate complaints',
        priority: 2,
        enabled: true,
        conditions: { intent: 'complaint', minConfidence: 60 },
        action: 'escalate',
        actionConfig: { tag: 'urgent', notify: true },
    },
    {
        name: 'Tag purchase intent',
        priority: 3,
        enabled: true,
        conditions: { intent: 'purchase_intent', minConfidence: 65 },
        action: 'tag',
        actionConfig: { tags: ['hot-lead', 'purchase-intent'] },
    },
    {
        name: 'Escalate negative sentiment',
        priority: 4,
        enabled: true,
        conditions: { sentiment: 'negative', minConfidence: 50 },
        action: 'escalate',
        actionConfig: { tag: 'negative-sentiment', notify: true },
    },
    {
        name: 'Auto-reply FAQs',
        priority: 5,
        enabled: true,
        conditions: { intents: ['price_inquiry', 'product_inquiry', 'store_location', 'order_status'], minConfidence: 75 },
        action: 'auto_reply',
        actionConfig: { useAI: true, replyIndex: 1 },
    },
];

// In-memory rule store per brand (will be replaced by MongoDB later)
const brandRules = {};

/**
 * Get routing rules for a brand
 */
export function getRules(brandId) {
    const id = brandId?.toString() || 'default';
    if (!brandRules[id]) {
        brandRules[id] = DEFAULT_RULES.map((r, i) => ({
            ...r,
            id: `rule_${id}_${i}`,
            brandId: id,
        }));
    }
    return brandRules[id];
}

/**
 * Set routing rules for a brand
 */
export function setRules(brandId, rules) {
    const id = brandId?.toString() || 'default';
    brandRules[id] = rules.map((r, i) => ({
        ...r,
        id: r.id || `rule_${id}_${i}`,
        brandId: id,
    }));
    return brandRules[id];
}

/**
 * Add a rule to a brand
 */
export function addRule(brandId, rule) {
    const rules = getRules(brandId);
    const id = brandId?.toString() || 'default';
    rule.id = `rule_${id}_${Date.now()}`;
    rule.brandId = id;
    rules.push(rule);
    rules.sort((a, b) => (a.priority || 99) - (b.priority || 99));
    return rule;
}

/**
 * Update a rule
 */
export function updateRule(brandId, ruleId, updates) {
    const rules = getRules(brandId);
    const idx = rules.findIndex(r => r.id === ruleId);
    if (idx === -1) return null;
    rules[idx] = { ...rules[idx], ...updates };
    return rules[idx];
}

/**
 * Delete a rule
 */
export function deleteRule(brandId, ruleId) {
    const rules = getRules(brandId);
    const idx = rules.findIndex(r => r.id === ruleId);
    if (idx === -1) return false;
    rules.splice(idx, 1);
    return true;
}

// ============================================================================
// ROUTE EVALUATION
// ============================================================================

/**
 * Evaluate routing rules against an incoming conversation + intent
 */
export async function evaluateRoutes(conversation, intent, brand) {
    const brandId = conversation.brand?.toString() || brand?._id?.toString();
    const rules = getRules(brandId);

    const enabledRules = rules.filter(r => r.enabled);
    const results = [];

    for (const rule of enabledRules) {
        const match = matchesConditions(rule.conditions, intent, conversation);
        if (match) {
            console.log(`🎯 Route matched: "${rule.name}" → action: ${rule.action}`);
            const result = await executeAction(rule, conversation, intent, brand);
            results.push({ rule: rule.name, action: rule.action, result });

            // Only execute first matching rule (priority-based)
            if (rule.action === 'auto_reply' || rule.action === 'escalate') {
                break;
            }
        }
    }

    return results;
}

/**
 * Check if conditions match the intent
 */
function matchesConditions(conditions, intent, conversation) {
    if (!conditions) return false;

    // Check intent match
    if (conditions.intent && intent.intent !== conditions.intent) return false;
    if (conditions.intents && !conditions.intents.includes(intent.intent)) return false;

    // Check confidence threshold
    if (conditions.minConfidence && intent.confidence < conditions.minConfidence) return false;

    // Check sentiment
    if (conditions.sentiment && intent.sentiment !== conditions.sentiment) return false;

    // Check channel
    if (conditions.channel && conversation.channel !== conditions.channel) return false;

    return true;
}

/**
 * Execute a routing action
 */
async function executeAction(rule, conversation, intent, brand) {
    try {
        switch (rule.action) {
            case 'auto_reply':
                return await handleAutoReply(rule, conversation, brand);
            case 'escalate':
                return await handleEscalate(rule, conversation);
            case 'tag':
                return handleTag(rule, conversation);
            case 'assign_agent':
                return handleAssignAgent(rule, conversation);
            default:
                console.warn(`Unknown routing action: ${rule.action}`);
                return { success: false, reason: 'Unknown action' };
        }
    } catch (error) {
        console.error(`❌ Routing action failed (${rule.action}):`, error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Auto-reply using AI-generated response
 * Note: The autonomous agent handles sending via Meta, so routing engine only saves the reply.
 */
async function handleAutoReply(rule, conversation, brand) {
    // Only auto-reply if AI handling is enabled
    if (conversation.isAIHandling === false) {
        return { success: false, reason: 'AI handling disabled' };
    }

    const config = rule.actionConfig || {};

    if (config.useAI) {
        const suggestions = await generateAIReplies(conversation, brand);
        const replyIdx = Math.min(config.replyIndex || 0, suggestions.length - 1);
        const reply = suggestions[replyIdx];

        if (reply && reply.confidence >= 70) {
            // Add AI reply to conversation
            conversation.messages.push({
                role: 'brand',
                content: reply.content,
                messageType: 'text',
                sentBy: 'ai',
                aiConfidence: reply.confidence,
            });
            conversation.lastMessageAt = new Date();
            conversation.lastMessagePreview = `AI: ${reply.content.substring(0, 80)}`;
            await conversation.save();

            console.log(`🤖 Auto-replied: "${reply.content.substring(0, 50)}..." (${reply.confidence}%)`);
            return { success: true, reply: reply.content, confidence: reply.confidence };
        }
    }

    return { success: false, reason: 'AI confidence too low for auto-reply' };
}

/**
 * Escalate to human agent
 */
async function handleEscalate(rule, conversation) {
    const config = rule.actionConfig || {};

    conversation.isAIHandling = false;
    conversation.status = 'handed_off';
    if (config.tag) {
        if (!conversation.tags) conversation.tags = [];
        if (!conversation.tags.includes(config.tag)) {
            conversation.tags.push(config.tag);
        }
    }
    conversation.messages.push({
        role: 'system',
        content: `🚨 Auto-escalated: ${rule.name}`,
        sentBy: 'system',
    });
    await conversation.save();

    console.log(`🚨 Escalated: "${rule.name}"`);
    return { success: true, reason: rule.name };
}

/**
 * Tag the conversation
 */
function handleTag(rule, conversation) {
    const config = rule.actionConfig || {};
    if (!conversation.tags) conversation.tags = [];

    const newTags = config.tags || [];
    for (const tag of newTags) {
        if (!conversation.tags.includes(tag)) {
            conversation.tags.push(tag);
        }
    }
    conversation.save().catch(() => { });

    return { success: true, tags: newTags };
}

/**
 * Assign to specific agent (placeholder)
 */
function handleAssignAgent(rule, conversation) {
    const config = rule.actionConfig || {};
    if (config.agentId) {
        conversation.assignedTo = config.agentId;
        conversation.save().catch(() => { });
    }
    return { success: true, assignedTo: config.agentId };
}

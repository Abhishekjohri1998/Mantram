/**
 * Automation Engine Service
 * Handles flow execution, recipe generation, and automation matching.
 */

import Automation from '../models/Automation.js';
import Conversation from '../models/Conversation.js';
import Contact from '../models/Contact.js';

// ============================================================================
// RECIPE TEMPLATES — Pre-built automation flows
// ============================================================================

export const RECIPE_TEMPLATES = {
    faq_auto_reply: {
        name: 'FAQ Auto Reply',
        description: 'Automatically answer common questions with AI-powered responses',
        icon: 'help_center',
        color: '#6366f1',
        triggers: [{ type: 'dm_received' }, { type: 'keyword_match', keywords: ['help', 'question', 'support'] }],
        nodes: [
            {
                nodeId: 'start', type: 'send_message', label: 'Greeting',
                config: { messageText: 'Hey! 👋 Thanks for reaching out. How can I help you today?' },
                nextNodeId: 'options', position: { x: 250, y: 50 },
            },
            {
                nodeId: 'options', type: 'quick_replies', label: 'Show Options',
                config: {
                    messageText: 'Choose a topic:',
                    buttons: [
                        { label: '💰 Pricing', value: 'pricing', nextNodeId: 'pricing' },
                        { label: '📦 Delivery', value: 'delivery', nextNodeId: 'delivery' },
                        { label: '📋 Catalog', value: 'catalog', nextNodeId: 'catalog' },
                        { label: '🙋 Talk to Agent', value: 'agent', nextNodeId: 'handoff' },
                    ],
                },
                nextNodeId: '', position: { x: 250, y: 180 },
            },
            {
                nodeId: 'pricing', type: 'send_message', label: 'Pricing Info',
                config: { messageText: 'Our pricing details are available on our website. Would you like me to share a direct link? 💰' },
                nextNodeId: 'followup', position: { x: 50, y: 330 },
            },
            {
                nodeId: 'delivery', type: 'send_message', label: 'Delivery Info',
                config: { messageText: 'We typically deliver within 3-5 business days. For urgent orders, express delivery is available! 📦' },
                nextNodeId: 'followup', position: { x: 250, y: 330 },
            },
            {
                nodeId: 'catalog', type: 'send_message', label: 'Catalog',
                config: { messageText: 'Check out our latest catalog here! We have some amazing new arrivals. 🛍️' },
                nextNodeId: 'followup', position: { x: 450, y: 330 },
            },
            {
                nodeId: 'followup', type: 'send_message', label: 'Follow Up',
                config: { messageText: 'Anything else I can help with? 😊' },
                nextNodeId: 'end', position: { x: 250, y: 470 },
            },
            {
                nodeId: 'handoff', type: 'human_handoff', label: 'Agent Handoff',
                config: {}, nextNodeId: 'end', position: { x: 550, y: 470 },
            },
            {
                nodeId: 'end', type: 'end', label: 'End',
                config: {}, nextNodeId: '', position: { x: 250, y: 600 },
            },
        ],
        startNodeId: 'start',
    },

    lead_capture: {
        name: 'Lead Capture',
        description: 'Collect names, emails, and interests from potential customers',
        icon: 'person_add',
        color: '#10b981',
        triggers: [{ type: 'keyword_match', keywords: ['interested', 'info', 'details', 'sign up'] }, { type: 'story_reply' }],
        nodes: [
            {
                nodeId: 'start', type: 'send_message', label: 'Welcome',
                config: { messageText: 'Thanks for your interest! 🎉 Let me get a few details so we can serve you better.' },
                nextNodeId: 'ask_name', position: { x: 250, y: 50 },
            },
            {
                nodeId: 'ask_name', type: 'ask_question', label: 'Ask Name',
                config: { questionText: 'What\'s your name?', saveToField: 'name' },
                nextNodeId: 'ask_email', position: { x: 250, y: 180 },
            },
            {
                nodeId: 'ask_email', type: 'ask_question', label: 'Ask Email',
                config: { questionText: 'And your email address? 📧', saveToField: 'email' },
                nextNodeId: 'ask_interest', position: { x: 250, y: 310 },
            },
            {
                nodeId: 'ask_interest', type: 'quick_replies', label: 'Interest Category',
                config: {
                    messageText: 'What are you most interested in?',
                    buttons: [
                        { label: '🛍️ Products', value: 'products', nextNodeId: 'tag_product' },
                        { label: '💼 Services', value: 'services', nextNodeId: 'tag_service' },
                        { label: '🤝 Partnership', value: 'partnership', nextNodeId: 'tag_partner' },
                    ],
                },
                nextNodeId: '', position: { x: 250, y: 440 },
            },
            {
                nodeId: 'tag_product', type: 'tag_user', label: 'Tag: Product',
                config: { tagName: 'interest:products' },
                nextNodeId: 'thanks', position: { x: 50, y: 570 },
            },
            {
                nodeId: 'tag_service', type: 'tag_user', label: 'Tag: Service',
                config: { tagName: 'interest:services' },
                nextNodeId: 'thanks', position: { x: 250, y: 570 },
            },
            {
                nodeId: 'tag_partner', type: 'tag_user', label: 'Tag: Partner',
                config: { tagName: 'interest:partnership' },
                nextNodeId: 'thanks', position: { x: 450, y: 570 },
            },
            {
                nodeId: 'thanks', type: 'send_message', label: 'Thank You',
                config: { messageText: 'Thanks so much! 🙏 Our team will be in touch soon. In the meantime, feel free to ask me anything!' },
                nextNodeId: 'end', position: { x: 250, y: 700 },
            },
            {
                nodeId: 'end', type: 'end', label: 'End',
                config: {}, nextNodeId: '', position: { x: 250, y: 830 },
            },
        ],
        startNodeId: 'start',
    },

    comment_to_dm: {
        name: 'Comment → DM Campaign',
        description: 'Auto-reply to comments and start a DM conversation',
        icon: 'mode_comment',
        color: '#f59e0b',
        triggers: [{ type: 'comment_keyword', keywords: ['interested', 'price', 'link', 'DM'] }, { type: 'comment_any' }],
        nodes: [
            {
                nodeId: 'start', type: 'send_message', label: 'DM Greeting',
                config: { messageText: 'Hey! 👋 Thanks for commenting on our post! Here are the details you asked about:' },
                nextNodeId: 'offer', position: { x: 250, y: 50 },
            },
            {
                nodeId: 'offer', type: 'send_message', label: 'Offer Details',
                config: { messageText: '🔥 Special offer just for you! Check out the details and let me know if you have any questions.' },
                nextNodeId: 'buttons', position: { x: 250, y: 180 },
            },
            {
                nodeId: 'buttons', type: 'quick_replies', label: 'Next Steps',
                config: {
                    messageText: 'What would you like to do?',
                    buttons: [
                        { label: '🛒 Shop Now', value: 'shop', nextNodeId: 'shop_link' },
                        { label: '❓ Ask a Question', value: 'question', nextNodeId: 'handoff' },
                        { label: '📋 FAQ', value: 'faq', nextNodeId: 'faq' },
                    ],
                },
                nextNodeId: '', position: { x: 250, y: 310 },
            },
            {
                nodeId: 'shop_link', type: 'send_message', label: 'Shop Link',
                config: { messageText: 'Here\'s the link to shop: 🛍️\n\nDon\'t miss out — this offer is limited!' },
                nextNodeId: 'end', position: { x: 50, y: 440 },
            },
            {
                nodeId: 'faq', type: 'send_message', label: 'FAQ',
                config: { messageText: 'Here are our most common questions:\n\n📦 Delivery: 3-5 business days\n💰 Return: Easy 30-day returns\n🔒 Payment: 100% secure' },
                nextNodeId: 'end', position: { x: 250, y: 440 },
            },
            {
                nodeId: 'handoff', type: 'human_handoff', label: 'Agent',
                config: {}, nextNodeId: 'end', position: { x: 450, y: 440 },
            },
            {
                nodeId: 'end', type: 'end', label: 'End',
                config: {}, nextNodeId: '', position: { x: 250, y: 570 },
            },
        ],
        startNodeId: 'start',
    },

    product_recommendation: {
        name: 'Product Recommendation',
        description: 'AI-driven product suggestions based on customer preferences',
        icon: 'recommend',
        color: '#ec4899',
        triggers: [{ type: 'intent_detected', intent: 'product_inquiry' }],
        nodes: [
            {
                nodeId: 'start', type: 'send_message', label: 'Welcome',
                config: { messageText: 'Great taste! 🌟 Let me help you find the perfect product.' },
                nextNodeId: 'ask_pref', position: { x: 250, y: 50 },
            },
            {
                nodeId: 'ask_pref', type: 'ask_question', label: 'Ask Preference',
                config: { questionText: 'What are you looking for? (e.g. style, color, type)', saveToField: 'preference' },
                nextNodeId: 'ask_budget', position: { x: 250, y: 180 },
            },
            {
                nodeId: 'ask_budget', type: 'quick_replies', label: 'Budget Range',
                config: {
                    messageText: 'What\'s your budget range?',
                    buttons: [
                        { label: '💚 Under ₹1,000', value: 'low', nextNodeId: 'recommend' },
                        { label: '💛 ₹1,000–5,000', value: 'mid', nextNodeId: 'recommend' },
                        { label: '❤️ ₹5,000+', value: 'high', nextNodeId: 'recommend' },
                    ],
                },
                nextNodeId: '', position: { x: 250, y: 310 },
            },
            {
                nodeId: 'recommend', type: 'send_message', label: 'Recommendation',
                config: { messageText: 'Based on your preferences, I\'d recommend checking out our curated picks! 🎯\n\nWould you like a direct link to browse?' },
                nextNodeId: 'more_help', position: { x: 250, y: 440 },
            },
            {
                nodeId: 'more_help', type: 'quick_replies', label: 'More Help?',
                config: {
                    messageText: 'Need anything else?',
                    buttons: [
                        { label: '✅ All set, thanks!', value: 'done', nextNodeId: 'end' },
                        { label: '🙋 Talk to someone', value: 'human', nextNodeId: 'handoff' },
                    ],
                },
                nextNodeId: '', position: { x: 250, y: 570 },
            },
            {
                nodeId: 'handoff', type: 'human_handoff', label: 'Handoff',
                config: {}, nextNodeId: 'end', position: { x: 450, y: 700 },
            },
            {
                nodeId: 'end', type: 'end', label: 'End',
                config: {}, nextNodeId: '', position: { x: 250, y: 700 },
            },
        ],
        startNodeId: 'start',
    },
};


// ============================================================================
// FLOW EXECUTION ENGINE
// ============================================================================

/**
 * Execute the next node in an automation flow for a conversation
 */
export async function executeNode(automation, nodeId, conversation, contact, userResponse = null) {
    const node = automation.nodes.find(n => n.nodeId === nodeId);
    if (!node) return { completed: true, message: null };

    const result = { completed: false, message: null, nextNodeId: node.nextNodeId };

    switch (node.type) {
        case 'send_message': {
            result.message = {
                role: 'brand',
                content: node.config.messageText,
                sentBy: 'automation',
                messageType: node.config.messageType || 'text',
            };
            break;
        }

        case 'quick_replies': {
            const text = node.config.messageText || 'Choose an option:';
            const buttonLabels = (node.config.buttons || []).map(b => b.label).join(' | ');
            result.message = {
                role: 'brand',
                content: `${text}\n\n${buttonLabels}`,
                sentBy: 'automation',
                messageType: 'quick_reply',
                metadata: { buttons: node.config.buttons },
            };
            result.waitForResponse = true;

            // If user already responded, route to matching button
            if (userResponse) {
                const matchedBtn = (node.config.buttons || []).find(b =>
                    userResponse.toLowerCase().includes(b.value.toLowerCase()) ||
                    userResponse.toLowerCase().includes(b.label.toLowerCase().replace(/[^\w\s]/g, '').trim())
                );
                if (matchedBtn?.nextNodeId) {
                    result.nextNodeId = matchedBtn.nextNodeId;
                    result.waitForResponse = false;
                }
            }
            break;
        }

        case 'ask_question': {
            result.message = {
                role: 'brand',
                content: node.config.questionText,
                sentBy: 'automation',
                messageType: 'text',
            };
            result.waitForResponse = true;

            // If user responded, save to contact field
            if (userResponse && node.config.saveToField && contact) {
                const field = node.config.saveToField;
                if (['name', 'email', 'phone', 'location'].includes(field)) {
                    contact[field] = userResponse;
                } else {
                    contact.attributes = contact.attributes || {};
                    contact.attributes[field] = userResponse;
                }
                await contact.save();
                result.waitForResponse = false;
            }
            break;
        }

        case 'condition': {
            const fieldValue = contact?.[node.config.conditionField] || contact?.attributes?.[node.config.conditionField] || '';
            let conditionMet = false;

            switch (node.config.conditionOperator) {
                case 'equals': conditionMet = fieldValue === node.config.conditionValue; break;
                case 'contains': conditionMet = String(fieldValue).toLowerCase().includes(node.config.conditionValue.toLowerCase()); break;
                case 'exists': conditionMet = !!fieldValue; break;
            }

            result.nextNodeId = conditionMet ? node.config.trueNodeId : node.config.falseNodeId;
            break;
        }

        case 'tag_user': {
            if (contact && node.config.tagName) {
                if (!contact.tags.includes(node.config.tagName)) {
                    contact.tags.push(node.config.tagName);
                    await contact.save();
                }
            }
            break;
        }

        case 'delay': {
            result.delayMs = (node.config.delaySeconds || 0) * 1000;
            break;
        }

        case 'human_handoff': {
            conversation.isAIHandling = false;
            conversation.status = 'handed_off';
            await conversation.save();
            result.message = {
                role: 'system',
                content: 'Automation handed off to human agent',
                sentBy: 'automation',
            };
            result.completed = true;
            break;
        }

        case 'action': {
            // Webhook — fire and forget for now
            if (node.config.webhookUrl) {
                try {
                    await fetch(node.config.webhookUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contact: { name: contact?.name, email: contact?.email, tags: contact?.tags },
                            conversation: { id: conversation._id, channel: conversation.channel },
                            automation: { id: automation._id, name: automation.name },
                        }),
                    });
                } catch { /* webhook failure should not stop flow */ }
            }
            break;
        }

        case 'end': {
            result.completed = true;
            break;
        }
    }

    return result;
}


// ============================================================================
// AUTOMATION MATCHER — Find matching automation for incoming message
// ============================================================================

/**
 * Find active automations that match an incoming message
 */
export async function findMatchingAutomation(brandId, messageText, intent, channel) {
    const automations = await Automation.find({ brand: brandId, isActive: true, status: 'active' });

    for (const auto of automations) {
        for (const trigger of auto.triggers) {
            switch (trigger.type) {
                case 'dm_received':
                    if (['instagram_dm', 'facebook_messenger'].includes(channel)) return auto;
                    break;

                case 'keyword_match':
                    if (trigger.keywords.some(kw => messageText.toLowerCase().includes(kw.toLowerCase()))) return auto;
                    break;

                case 'intent_detected':
                    if (trigger.intent === intent) return auto;
                    break;

                case 'comment_keyword':
                    if (channel === 'instagram_comment' && trigger.keywords.some(kw => messageText.toLowerCase().includes(kw.toLowerCase()))) return auto;
                    break;

                case 'comment_any':
                    if (channel === 'instagram_comment') return auto;
                    break;

                case 'story_reply':
                    if (channel === 'instagram_story_reply') return auto;
                    break;

                case 'story_mention':
                    if (channel === 'instagram_mention') return auto;
                    break;
            }
        }
    }

    return null;
}


// ============================================================================
// RUN AUTOMATION — Execute a full flow from start
// ============================================================================

/**
 * Start running an automation on a conversation
 */
export async function startAutomation(automation, conversation, contact) {
    // Mark conversation with active automation
    conversation.activeAutomation = {
        automationId: automation._id,
        currentNode: automation.startNodeId,
        startedAt: new Date(),
        data: {},
    };

    // Execute nodes until we hit a wait-for-response or end
    let currentNodeId = automation.startNodeId;
    const messagesToSend = [];

    for (let step = 0; step < 20; step++) { // Safety limit
        const result = await executeNode(automation, currentNodeId, conversation, contact);

        if (result.message) {
            messagesToSend.push(result.message);
            conversation.messages.push(result.message);
        }

        if (result.completed) {
            conversation.activeAutomation = null;
            automation.stats.completedRuns = (automation.stats.completedRuns || 0) + 1;
            break;
        }

        if (result.waitForResponse) {
            conversation.activeAutomation.currentNode = currentNodeId;
            break;
        }

        if (result.delayMs > 0) {
            conversation.activeAutomation.currentNode = result.nextNodeId;
            break;
        }

        currentNodeId = result.nextNodeId;
        if (!currentNodeId) break;
    }

    automation.stats.totalRuns = (automation.stats.totalRuns || 0) + 1;
    await automation.save();

    conversation.lastMessageAt = new Date();
    if (messagesToSend.length > 0) {
        conversation.lastMessagePreview = `Bot: ${messagesToSend[messagesToSend.length - 1].content.substring(0, 80)}`;
    }
    await conversation.save();

    return messagesToSend;
}

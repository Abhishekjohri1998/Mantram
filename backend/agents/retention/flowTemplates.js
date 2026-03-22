/**
 * Retention Studio — Pre-built Flow Templates
 * 
 * Ready-to-deploy automation flow templates for common retention scenarios.
 * Each template generates NurtureSequence-compatible step configurations.
 */

import Brand from '../../models/Brand.js';
import { buildRetentionBrandCtx } from './prompts.js';

// ═══════════════════════════════════════════════════════════════
//  FLOW TEMPLATE DEFINITIONS
// ═══════════════════════════════════════════════════════════════

export const FLOW_TEMPLATES = {
    // ── Welcome Series ──
    welcome_series: {
        id: 'welcome_series',
        name: 'Welcome Series',
        icon: '👋',
        color: '#6366f1',
        category: 'onboarding',
        description: 'Onboard new customers with a warm welcome, brand story, and first-purchase incentive.',
        triggerEvent: 'stage_enter',
        triggerStage: 'new_customer',
        steps: [
            {
                order: 0,
                name: 'Welcome Email',
                channel: 'email',
                delay: { value: 0, unit: 'minutes' },
                subject: 'Welcome to {{brandName}} — You made a great choice! 🎉',
                contentType: 'ai_generated',
                aiContentType: 'welcome_email',
                aiPrompt: 'Write a warm welcome email for a new customer. Thank them for their purchase, introduce the brand story briefly, and set expectations for what they\'ll receive. Include a 10% discount code for their next purchase.',
            },
            {
                order: 1,
                name: 'Brand Story',
                channel: 'email',
                delay: { value: 2, unit: 'days' },
                subject: 'The story behind {{brandName}}',
                contentType: 'ai_generated',
                aiContentType: 'brand_story_email',
                aiPrompt: 'Write a brand story email. Share the founder\'s journey, what makes this brand unique, and the values behind the products. Make it personal and authentic.',
            },
            {
                order: 2,
                name: 'Product Tips',
                channel: 'email',
                delay: { value: 4, unit: 'days' },
                subject: 'Getting the most from your purchase ✨',
                contentType: 'ai_generated',
                aiContentType: 'product_tips',
                aiPrompt: 'Write a helpful email with tips on how to use/maintain the purchased product. Include usage recommendations, care tips, and best practices. Close with an invitation to reach out for help.',
            },
            {
                order: 3,
                name: 'Review Request',
                channel: 'email',
                delay: { value: 7, unit: 'days' },
                subject: 'How\'s your experience? We\'d love your feedback 💬',
                contentType: 'ai_generated',
                aiContentType: 'review_request',
                aiPrompt: 'Write a friendly review request email. Ask about their experience, link to leave a review, and mention that feedback helps improve products. Offer a small incentive for leaving a review.',
            },
        ],
        settings: {
            maxRunsPerEntry: 1,
            stopOnConversion: false,
            stopOnReply: false,
            respectQuietHours: true,
        },
    },

    // ── Win-Back Campaign ──
    winback: {
        id: 'winback',
        name: 'Win-Back Campaign',
        icon: '💝',
        color: '#ef4444',
        category: 'reactivation',
        description: 'Re-engage customers who haven\'t purchased in 60+ days with escalating offers.',
        triggerEvent: 'time_in_stage',
        triggerStage: 'inactive',
        triggerConfig: { timeInStageHours: 1440 }, // 60 days
        steps: [
            {
                order: 0,
                name: 'We Miss You',
                channel: 'email',
                delay: { value: 0, unit: 'minutes' },
                subject: 'We miss you, {{firstName}}! Here\'s something special 💫',
                contentType: 'ai_generated',
                aiContentType: 'winback_soft',
                aiPrompt: 'Write a warm win-back email. Acknowledge the customer has been away, share what\'s new since their last visit, highlight bestsellers they might like. Include a 15% discount code. Tone should be warm, not pushy.',
            },
            {
                order: 1,
                name: 'Exclusive Offer',
                channel: 'email',
                delay: { value: 4, unit: 'days' },
                subject: 'Exclusive offer ends soon — 25% off just for you 🎁',
                contentType: 'ai_generated',
                aiContentType: 'winback_offer',
                aiPrompt: 'Write a more urgent win-back email with a 25% discount offer that expires in 48 hours. Showcase new arrivals and popular items. Create tasteful urgency without being aggressive.',
                condition: {
                    field: 'status',
                    operator: 'not_equals',
                    value: 'converted',
                },
            },
            {
                order: 2,
                name: 'Last Chance',
                channel: 'email',
                delay: { value: 7, unit: 'days' },
                subject: 'Final reminder: Your exclusive deal expires tomorrow ⏰',
                contentType: 'ai_generated',
                aiContentType: 'winback_final',
                aiPrompt: 'Write a final win-back attempt. This is the last email in the sequence. Mention this is the final reminder, feature their best-selling product, and include the 25% offer one last time. Add an option to update email preferences.',
                condition: {
                    field: 'status',
                    operator: 'not_equals',
                    value: 'converted',
                },
            },
        ],
        settings: {
            maxRunsPerEntry: 1,
            stopOnConversion: true,
            stopOnReply: true,
            respectQuietHours: true,
        },
    },

    // ── Post-Purchase Follow-Up ──
    post_purchase: {
        id: 'post_purchase',
        name: 'Post-Purchase Flow',
        icon: '📦',
        color: '#10b981',
        category: 'retention',
        description: 'Build loyalty after purchase with thank-you, tips, cross-sell, and review requests.',
        triggerEvent: 'stage_enter',
        triggerStage: 'purchased',
        steps: [
            {
                order: 0,
                name: 'Order Confirmation+',
                channel: 'email',
                delay: { value: 1, unit: 'hours' },
                subject: 'Order confirmed! Here\'s what happens next 🚀',
                contentType: 'ai_generated',
                aiContentType: 'post_purchase_thanks',
                aiPrompt: 'Write an enhanced order confirmation email. Thank them for the purchase, outline what happens next (processing, shipping, delivery timeline). Add a personal touch that makes them feel valued.',
            },
            {
                order: 1,
                name: 'Shipping Update',
                channel: 'email',
                delay: { value: 2, unit: 'days' },
                subject: 'Your order is on its way! 🎁',
                contentType: 'ai_generated',
                aiContentType: 'shipping_update',
                aiPrompt: 'Write a shipping notification email. Build excitement about the product arriving. Include care tips for when they receive it. Cross-sell one complementary product naturally.',
            },
            {
                order: 2,
                name: 'How-To Guide',
                channel: 'email',
                delay: { value: 5, unit: 'days' },
                subject: 'Quick guide: Get the best from your {{productName}} ✨',
                contentType: 'ai_generated',
                aiContentType: 'how_to_guide',
                aiPrompt: 'Write a product usage guide email. Provide 3-4 actionable tips for getting the most value from the product. Include care/maintenance instructions. Add social media links for user community.',
            },
            {
                order: 3,
                name: 'Cross-Sell',
                channel: 'email',
                delay: { value: 10, unit: 'days' },
                subject: 'Customers who bought {{productName}} also loved these...',
                contentType: 'ai_generated',
                aiContentType: 'cross_sell',
                aiPrompt: 'Write a cross-sell recommendation email. Suggest 2-3 complementary products that pair well with what they purchased. Use social proof ("customers who bought X also loved Y"). Include a 10% bundle discount.',
            },
            {
                order: 4,
                name: 'Review Request',
                channel: 'email',
                delay: { value: 14, unit: 'days' },
                subject: 'How\'s it going? Would love your honest feedback 💬',
                contentType: 'ai_generated',
                aiContentType: 'review_request',
                aiPrompt: 'Write a review request email. Ask for honest feedback, explain how reviews help other shoppers, and offer a 10% discount on next purchase as a thank-you for leaving a review.',
            },
        ],
        settings: {
            maxRunsPerEntry: 1,
            stopOnConversion: false,
            stopOnReply: false,
            respectQuietHours: true,
        },
    },

    // ── Price Drop Alert ──
    price_drop: {
        id: 'price_drop',
        name: 'Price Drop Alert',
        icon: '📉',
        color: '#f59e0b',
        category: 'conversion',
        description: 'Notify customers who viewed or wishlisted a product when its price drops.',
        triggerEvent: 'manual',
        triggerStage: 'interested',
        steps: [
            {
                order: 0,
                name: 'Price Drop Alert',
                channel: 'email',
                delay: { value: 0, unit: 'minutes' },
                subject: '🔔 Price Drop Alert: {{productName}} is now {{newPrice}}!',
                contentType: 'ai_generated',
                aiContentType: 'price_drop_alert',
                aiPrompt: 'Write a concise price drop alert email. Highlight the original price, new price, and savings amount/percentage. Create urgency ("limited time" or "while stocks last"). Include a direct CTA to buy now. Keep it short and punchy.',
            },
            {
                order: 1,
                name: 'Reminder',
                channel: 'email',
                delay: { value: 2, unit: 'days' },
                subject: 'Still available at {{newPrice}} — but not for long ⏰',
                contentType: 'ai_generated',
                aiContentType: 'price_drop_reminder',
                aiPrompt: 'Write a reminder for the price drop. Mention the deal is still active but stock is limited. Add social proof (how many have already purchased at this price). Include urgency without being pushy.',
                condition: {
                    field: 'status',
                    operator: 'not_equals',
                    value: 'converted',
                },
            },
        ],
        settings: {
            maxRunsPerEntry: 1,
            stopOnConversion: true,
            stopOnReply: false,
            respectQuietHours: true,
        },
    },

    // ── Abandoned Cart Recovery ──
    abandoned_cart: {
        id: 'abandoned_cart',
        name: 'Abandoned Cart Recovery',
        icon: '🛒',
        color: '#ec4899',
        category: 'conversion',
        description: 'Recover abandoned carts with timely reminders and incentives.',
        triggerEvent: 'stage_enter',
        triggerStage: 'cart_abandoned',
        steps: [
            {
                order: 0,
                name: 'Cart Reminder',
                channel: 'email',
                delay: { value: 1, unit: 'hours' },
                subject: 'You left something behind... 👀',
                contentType: 'ai_generated',
                aiContentType: 'cart_reminder',
                aiPrompt: 'Write a gentle cart abandonment reminder. Show what they left in the cart with images/prices. Don\'t offer a discount yet. Focus on "your items are waiting" and ease of checkout.',
            },
            {
                order: 1,
                name: 'Social Proof Push',
                channel: 'email',
                delay: { value: 24, unit: 'hours' },
                subject: '{{productName}} is selling fast — complete your order 🏃',
                contentType: 'ai_generated',
                aiContentType: 'cart_social_proof',
                aiPrompt: 'Write a second cart recovery email using social proof. Mention how many people have purchased this item recently, include a customer review/testimonial, and create soft urgency around stock levels.',
                condition: {
                    field: 'status',
                    operator: 'not_equals',
                    value: 'converted',
                },
            },
            {
                order: 2,
                name: 'Discount Offer',
                channel: 'email',
                delay: { value: 3, unit: 'days' },
                subject: 'Here\'s 10% off to complete your order 🎁',
                contentType: 'ai_generated',
                aiContentType: 'cart_discount',
                aiPrompt: 'Write the final cart recovery email with a 10% discount code. Explain this is a special one-time offer. Include the cart items with images and the discounted price. Strong CTA with discount auto-applied.',
                condition: {
                    field: 'status',
                    operator: 'not_equals',
                    value: 'converted',
                },
            },
        ],
        settings: {
            maxRunsPerEntry: 1,
            stopOnConversion: true,
            stopOnReply: false,
            respectQuietHours: true,
        },
    },

    // ── Back-in-Stock Notification ──
    back_in_stock: {
        id: 'back_in_stock',
        name: 'Back-in-Stock Alert',
        icon: '🔔',
        color: '#06b6d4',
        category: 'conversion',
        description: 'Notify customers when an out-of-stock item they wanted is available again.',
        triggerEvent: 'manual',
        triggerStage: 'waiting_restock',
        steps: [
            {
                order: 0,
                name: 'Back in Stock!',
                channel: 'email',
                delay: { value: 0, unit: 'minutes' },
                subject: '🎉 It\'s back! {{productName}} is in stock again',
                contentType: 'ai_generated',
                aiContentType: 'back_in_stock',
                aiPrompt: 'Write an exciting back-in-stock notification. Build excitement that the item they wanted is available again. Emphasize limited stock. Include product image, price, and a direct buy-now CTA. Create urgency without being pushy.',
            },
        ],
        settings: {
            maxRunsPerEntry: 1,
            stopOnConversion: true,
            stopOnReply: false,
            respectQuietHours: false, // Send immediately
        },
    },

    // ── VIP / Loyalty Reward ──
    vip_reward: {
        id: 'vip_reward',
        name: 'VIP Loyalty Reward',
        icon: '👑',
        color: '#a855f7',
        category: 'loyalty',
        description: 'Reward top customers with exclusive offers, early access, and personalized perks.',
        triggerEvent: 'score_threshold',
        triggerStage: 'champion',
        triggerConfig: { scoreThreshold: 80 },
        steps: [
            {
                order: 0,
                name: 'VIP Welcome',
                channel: 'email',
                delay: { value: 0, unit: 'minutes' },
                subject: 'You\'ve earned VIP status, {{firstName}}! 👑',
                contentType: 'ai_generated',
                aiContentType: 'vip_welcome',
                aiPrompt: 'Write a premium VIP recognition email. Congratulate them on achieving VIP status through their loyalty. Outline exclusive benefits they now receive (early access, special discounts, priority support). Make them feel truly valued and special.',
            },
            {
                order: 1,
                name: 'Exclusive Preview',
                channel: 'email',
                delay: { value: 7, unit: 'days' },
                subject: '🔒 VIP Only: Sneak peek at our new collection',
                contentType: 'ai_generated',
                aiContentType: 'vip_preview',
                aiPrompt: 'Write an exclusive preview email for VIP customers. Give them early access to a new product/collection before public launch. Include a VIP-only discount code. Make the exclusivity feel genuine and rewarding.',
            },
        ],
        settings: {
            maxRunsPerEntry: 1,
            stopOnConversion: false,
            stopOnReply: false,
            respectQuietHours: true,
        },
    },

    // ── Replenishment Reminder ──
    replenishment: {
        id: 'replenishment',
        name: 'Replenishment Reminder',
        icon: '🔄',
        color: '#14b8a6',
        category: 'retention',
        description: 'Remind customers to reorder consumable products based on typical usage cycles.',
        triggerEvent: 'time_in_stage',
        triggerStage: 'purchased',
        triggerConfig: { timeInStageHours: 720 }, // 30 days
        steps: [
            {
                order: 0,
                name: 'Running Low?',
                channel: 'email',
                delay: { value: 0, unit: 'minutes' },
                subject: 'Running low on {{productName}}? Time for a refill! 🔄',
                contentType: 'ai_generated',
                aiContentType: 'replenishment_reminder',
                aiPrompt: 'Write a friendly replenishment reminder email. Estimate they might be running low based on average usage. Make reordering easy with a one-click reorder link. Suggest a subscribe-and-save option if available.',
            },
        ],
        settings: {
            maxRunsPerEntry: 3,
            stopOnConversion: false,
            stopOnReply: false,
            respectQuietHours: true,
        },
    },
};

/**
 * Get all available flow templates
 */
export function getAllTemplates() {
    return Object.values(FLOW_TEMPLATES).map(t => ({
        id: t.id,
        name: t.name,
        icon: t.icon,
        color: t.color,
        category: t.category,
        description: t.description,
        stepCount: t.steps.length,
        triggerEvent: t.triggerEvent,
    }));
}

/**
 * Get a specific template with all its steps
 */
export function getTemplate(templateId) {
    return FLOW_TEMPLATES[templateId] || null;
}

/**
 * Get templates grouped by category
 */
export function getTemplatesByCategory() {
    const categories = {};
    for (const template of Object.values(FLOW_TEMPLATES)) {
        if (!categories[template.category]) {
            categories[template.category] = {
                category: template.category,
                label: template.category.charAt(0).toUpperCase() + template.category.slice(1),
                templates: [],
            };
        }
        categories[template.category].templates.push({
            id: template.id,
            name: template.name,
            icon: template.icon,
            color: template.color,
            description: template.description,
            stepCount: template.steps.length,
        });
    }
    return categories;
}

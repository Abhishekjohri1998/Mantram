/**
 * createNotification — Shared utility to write a Notification record
 * Used by: monthly-strategy, research-studio, creatives pipelines
 */
import Notification from '../models/Notification.js';

/**
 * @param {Object} opts
 * @param {string}  opts.userId   — Mongoose ObjectId string
 * @param {string}  [opts.brandId]
 * @param {string}  opts.type     — 'monthly-strategy' | 'research' | 'video' | 'creative'
 * @param {string}  opts.title
 * @param {string}  [opts.body]
 * @param {string}  [opts.link]   — client-side route to navigate to on click
 * @param {string}  [opts.jobId]
 */
export async function createNotification({ userId, brandId, type, title, body = '', link = '', jobId }) {
    try {
        await Notification.create({ user: userId, brand: brandId, type, title, body, link, jobId });
    } catch (err) {
        console.error('[Notification] Failed to create notification:', err.message);
    }
}

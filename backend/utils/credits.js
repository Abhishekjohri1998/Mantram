import User from '../models/User.js';
import Subscription from '../models/Subscription.js';

/**
 * Synchronize all credit data for a user across models.
 * With the new integer-based credit system, total/used synchronization is no longer needed.
 */
export const syncUserCredits = async (userId) => {
    try {
        const user = await User.findById(userId);
        return user;
    } catch (error) {
        console.error(`❌ Sync Credits Failed for User ${userId}:`, error.message);
        throw error;
    }
};

/**
 * Perform a monthly reset for a user if their reset date has passed.
 * With the single integer system, credit accumulation/reset is handled by the subscriptionManager cron job.
 */
export const performMonthlyReset = async (user) => {
    return user;
};

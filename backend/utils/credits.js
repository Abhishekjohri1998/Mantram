import User from '../models/User.js';
import Subscription from '../models/Subscription.js';
import CreditUsage from '../models/CreditUsage.js';

/**
 * Synchronize all credit data for a user across models.
 * Ensures User.credits and Active Subscription credits are in perfect parity.
 */
export const syncUserCredits = async (userId) => {
    try {
        const user = await User.findById(userId);
        if (!user) return null;

        // 1. Check for Active Subscription
        const activeSub = await Subscription.findOne({
            user: userId,
            status: 'active',
            endDate: { $gt: new Date() }
        });

        if (!activeSub) {
            // No active paid plan — ensure user is back to base plan if applicable
            return user;
        }

        // 2. Identify Billing Cycle Start Date for used credit parity
        // In a real system, this would be the billing anchor date.
        // We use the start of the current month compared to the subscription start date.
        const now = new Date();
        const cycleStart = new Date(activeSub.startDate);
        while (new Date(cycleStart).setMonth(cycleStart.getMonth() + 1) < now) {
            cycleStart.setMonth(cycleStart.getMonth() + 1);
        }

        // 3. Aggregate Usage Logs for current cycle (optional verification)
        const usage = await CreditUsage.aggregate([
            { $match: { user: user._id, createdAt: { $gte: cycleStart } } },
            { $group: { _id: null, totalUsed: { $sum: '$cost' } } }
        ]);

        const actualUsed = usage[0]?.totalUsed || 0;

        // 4. Update both models to ensure parity
        // Note: Subscription.credits.total usually contains the monthly allowance.
        // User.credits.total serves as a mirror for the UI.
        const totalAllowance = activeSub.credits.total;
        
        await Promise.all([
            User.findByIdAndUpdate(userId, {
                'credits.total': totalAllowance,
                'credits.used': actualUsed,
                'credits.resetDate': new Date(new Date(cycleStart).setMonth(cycleStart.getMonth() + 1))
            }),
            Subscription.findByIdAndUpdate(activeSub._id, {
                'credits.used': actualUsed
            })
        ]);

        return user;
    } catch (error) {
        console.error(`❌ Sync Credits Failed for User ${userId}:`, error.message);
        throw error;
    }
};

/**
 * Perform a monthly reset for a user if their reset date has passed.
 */
export const performMonthlyReset = async (user) => {
    // Skip reset check if last checked within 1 hour
    if (user.credits?.lastResetCheck && (Date.now() - new Date(user.credits.lastResetCheck).getTime()) < 3600000) {
        return user;
    }

    const now = new Date();
    if (!user.credits?.resetDate || user.credits.resetDate > now) {
        // Throttle the check to once per hour
        User.findByIdAndUpdate(user._id, { 'credits.lastResetCheck': now }).catch(() => {});
        return user;
    }

    console.log(`🔄 Performing monthly credit reset for user: ${user.email}`);

    // Update reset date to next month
    const nextReset = new Date(user.credits.resetDate);
    nextReset.setMonth(nextReset.getMonth() + 1);

    // Reset used credits to 0
    const updatedUser = await User.findByIdAndUpdate(user._id, {
        $set: { 
            'credits.used': 0,
            'credits.resetDate': nextReset,
            'credits.lastResetCheck': now
        }
    }, { returnDocument: 'after' });

    // If they have an active subscription, reset it too
    if (user.activeSubscription) {
        await Subscription.findByIdAndUpdate(user.activeSubscription, {
            $set: { 'credits.used': 0 }
        });
    }

    return updatedUser;
};

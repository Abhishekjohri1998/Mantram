import Subscription from '../models/Subscription.js';
import SubscriptionPackage from '../models/SubscriptionPackage.js';
import User from '../models/User.js';

/**
 * Subscription Manager Agent
 * 
 * Responsibilities:
 * 1. Monitor active subscriptions for renewal dates.
 * 2. Reset monthly credits for Free and Paid tiers.
 * 3. Handle credit rollover for eligible plans.
 * 4. Manage subscription expiration and downgrades.
 */

export async function processRenewals() {
    console.log('🔄 [SubscriptionManager] Checking for renewals...');
    const now = new Date();

    try {
        // --- NEW: Expire subscriptions past their endDate ---
        const expiredSubs = await Subscription.find({
            status: 'active',
            endDate: { $lt: now }
        });
        for (const sub of expiredSubs) {
            sub.status = 'expired';
            await sub.save();
            await User.findByIdAndUpdate(sub.user, { plan: 'free' });
            console.log(`📉 Subscription ${sub._id} expired — user ${sub.user} downgraded to free`);
        }

        // Find active subscriptions that have passed their renewal date
        const subscriptions = await Subscription.find({
            status: 'active',
            renewalDate: { $lte: now }
        });

        if (subscriptions.length === 0) {
            console.log('✅ [SubscriptionManager] No subscriptions due for renewal.');
            return;
        }

        console.log(`[SubscriptionManager] Found ${subscriptions.length} subscriptions due for renewal.`);

        for (const sub of subscriptions) {
            try {
                const pkg = await SubscriptionPackage.findOne({ slug: sub.plan });
                if (!pkg) {
                    console.error(`❌ [SubscriptionManager] Package not found for plan: ${sub.plan}. Skipping.`);
                    continue;
                }

                const user = await User.findById(sub.user);
                if (!user) {
                    console.warn(`⚠️ [SubscriptionManager] User not found for subscription ${sub._id}. Expiring subscription.`);
                    sub.status = 'expired';
                    await sub.save();
                    continue;
                }

                // --- Handle Reset / Renewal ---
                
                // Calculate new dates
                const newRenewalDate = new Date(sub.renewalDate);
                newRenewalDate.setMonth(newRenewalDate.getMonth() + 1);

                // Handle Rollover logic
                let carryOverCredits = 0;
                if (pkg.credits?.rollover) {
                    // Carry over unused credits, capped at 2x monthly limit (common industry standard)
                    const unused = Math.max(0, sub.credits.total - sub.credits.used);
                    carryOverCredits = Math.min(unused, pkg.credits.monthly);
                }

                const newTotalCredits = pkg.credits.monthly + carryOverCredits;

                // For Paid plans without auto-renew, we downgrade to Free instead of just expiring
                if (sub.plan !== 'free' && !sub.autoRenew) {
                    console.log(`⌛ [SubscriptionManager] Paid plan ${sub.plan} expired for ${user.email}. Downgrading to Free.`);
                    
                    // Expire current sub
                    sub.status = 'expired';
                    await sub.save();

                    // Assign Free subscription
                    // (We call the same logic as registration to ensure consistency)
                    await assignFreePlan(user);
                    continue;
                }

                // Update Subscription doc
                sub.renewalDate = newRenewalDate;
                sub.endDate = newRenewalDate; // Assuming single cycle for now
                sub.credits = {
                    total: newTotalCredits,
                    used: 0
                };
                // sub.status = 'active'; // stay active
                await sub.save();

                // Update User doc (source of truth for real-time deductions)
                await User.findByIdAndUpdate(user._id, {
                    'credits.total': newTotalCredits,
                    'credits.used': 0,
                    'credits.resetDate': newRenewalDate
                });

                console.log(`✅ [SubscriptionManager] Renewed ${sub.plan} plan for ${user.email}. New balance: ${newTotalCredits}`);

            } catch (err) {
                console.error(`❌ [SubscriptionManager] Failed to process renewal for ${sub._id}:`, err.message);
            }
        }
    } catch (err) {
        console.error('❌ [SubscriptionManager] Global renewal check failed:', err.message);
    }
}

// Helper for downgrading to Free
async function assignFreePlan(user) {
    try {
        const freePkg = await SubscriptionPackage.findOne({ slug: 'free' });
        const monthlyCredits = freePkg?.credits?.monthly || 50;

        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + 1);

        const newSub = await Subscription.create({
            user: user._id,
            plan: 'free',
            billingCycle: 'monthly',
            credits: { total: monthlyCredits, used: 0 },
            price: 0,
            startDate: new Date(),
            endDate,
            renewalDate: endDate,
            status: 'active',
            autoRenew: true
        });

        await User.findByIdAndUpdate(user._id, {
            plan: 'free',
            activeSubscription: newSub._id,
            'credits.total': monthlyCredits,
            'credits.used': 0,
            'credits.resetDate': endDate
        });

        console.log(`✨ [SubscriptionManager] Defaulted user ${user.email} to Free plan.`);
    } catch (err) {
        console.error('❌ [SubscriptionManager] Failed to assign free plan:', err.message);
    }
}

/**
 * Starts the Subscription Manager background agent
 */
export function startSubscriptionManager() {
    // Only run on the primary PM2 worker
    const instanceId = process.env.NODE_APP_INSTANCE || '0';
    if (instanceId !== '0') {
        console.log(`💎 [SubscriptionManager] Skipped on worker ${instanceId} (runs on primary only)`);
        return;
    }

    console.log('💎 [SubscriptionManager] Agent started (primary worker)');
    
    // Initial run after 1 minute (give DB time to settle)
    setTimeout(processRenewals, 60000);

    // Run every 1 hour
    setInterval(processRenewals, 60 * 60 * 1000);
}

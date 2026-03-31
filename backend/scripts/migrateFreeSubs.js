import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';
import Subscription from '../models/Subscription.js';
import SubscriptionPackage from '../models/SubscriptionPackage.js';
import connectDB from '../config/db.js';

dotenv.config();

const migrate = async () => {
    try {
        await connectDB();
        console.log('🚀 Starting Subscription Migration...');

        // 1. Get the Free package
        const freePkg = await SubscriptionPackage.findOne({ slug: 'free' });
        if (!freePkg) {
            console.error('❌ Free package not found. Please run seedPackages.js first.');
            process.exit(1);
        }

        // 2. Find users without an active subscription
        const users = await User.find({
            $or: [
                { activeSubscription: { $exists: false } },
                { activeSubscription: null }
            ]
        });

        console.log(`📊 Found ${users.length} users to migrate.`);

        let count = 0;
        for (const user of users) {
            try {
                // Determine existing total credits or default to 50
                const currentTotal = user.credits?.total || 50;
                
                const endDate = new Date();
                endDate.setMonth(endDate.getMonth() + 1);

                // Create subscription
                const sub = await Subscription.create({
                    user: user._id,
                    plan: 'free',
                    billingCycle: 'monthly',
                    credits: { total: currentTotal, used: user.credits?.used || 0 },
                    price: 0,
                    startDate: user.createdAt || new Date(),
                    endDate,
                    renewalDate: endDate,
                    status: 'active',
                    autoRenew: true,
                });

                // Update user
                await User.findByIdAndUpdate(user._id, {
                    plan: 'free',
                    activeSubscription: sub._id,
                    'credits.resetDate': endDate
                });

                count++;
                if (count % 10 === 0) console.log(`✅ Processed ${count}/${users.length} users...`);
            } catch (err) {
                console.error(`❌ Failed migrating user ${user.email}:`, err.message);
            }
        }

        console.log(`\n🎉 Migration complete! ${count} users updated.`);
        process.exit(0);
    } catch (err) {
        console.error('💥 Migration failed:', err.message);
        process.exit(1);
    }
};

migrate();

/**
 * Seed Super Admin Account
 * Run: node server/scripts/seedSuperAdmin.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import connectDB from '../config/db.js';

// Import User model
import User from '../models/User.js';

const SUPER_ADMINS = [
    {
        name: 'Super Admin',
        email: 'admin@mantram.ai',
        password: 'MantramAdmin@2024',
        role: 'superadmin',
        plan: 'enterprise',
        company: 'Mantram AI',
        credits: { total: 999999, used: 0, bonus: 0 },
    },
    {
        name: 'Principal Admin',
        email: 'superadmin@mantram.ai',
        password: 'MantramSuper@2024',
        role: 'superadmin',
        plan: 'enterprise',
        company: 'Mantram AI',
        credits: { total: 999999, used: 0, bonus: 0 },
    }
];

async function seed() {
    try {
        const conn = await connectDB();
        if (!conn) {
            console.error('❌ Failed to connect to MongoDB. Exiting.');
            process.exit(0);
        }
        console.log('✅ Connected to MongoDB');

        for (const admin of SUPER_ADMINS) {
            const existing = await User.findOne({ email: admin.email }).select('+password');
            if (existing) {
                existing.role = 'superadmin';
                existing.plan = 'enterprise';
                existing.credits = admin.credits;
                existing.password = admin.password;
                await existing.save();
                console.log(`🔄 Updated existing user to super admin: ${admin.email}`);
            } else {
                await User.create(admin);
                console.log(`🔑 Super admin created: ${admin.email}`);
            }
        }

        console.log(`\n✅ Seeding complete.`);

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('❌ Seed failed:', error.message);
        // Exit 0 so that an intermittent connection failure doesn't halt the CI/CD deploy pipeline
        process.exit(0);
    }
}

seed();

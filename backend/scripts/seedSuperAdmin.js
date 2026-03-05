/**
 * Seed Super Admin Account
 * Run: node server/scripts/seedSuperAdmin.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

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
        name: 'User Admin',
        email: 'user@mantram.ai',
        password: 'Mantram@2024',
        role: 'superadmin',
        plan: 'enterprise',
        company: 'Mantram AI',
        credits: { total: 999999, used: 0, bonus: 0 },
    }
];

async function seed() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
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
        process.exit(1);
    }
}

seed();

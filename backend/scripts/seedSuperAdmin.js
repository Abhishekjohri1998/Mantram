/**
 * Seed Super Admin Account
 * Run: node server/scripts/seedSuperAdmin.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

// Import User model
import User from '../models/User.js';

const SUPER_ADMIN = {
    name: 'Super Admin',
    email: 'admin@mantram.ai',
    password: 'MantramAdmin@2024',
    role: 'superadmin',
    plan: 'enterprise',
    company: 'Mantram AI',
    credits: {
        total: 999999,
        used: 0,
        bonus: 0,
    },
};

async function seed() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const existing = await User.findOne({ email: SUPER_ADMIN.email }).select('+password');
        if (existing) {
            // Update to superadmin — force password reset too
            existing.role = 'superadmin';
            existing.plan = 'enterprise';
            existing.credits = SUPER_ADMIN.credits;
            existing.password = SUPER_ADMIN.password; // will be bcrypt-hashed by pre-save hook
            await existing.save();
            console.log(`🔄 Updated existing user to super admin: ${SUPER_ADMIN.email}`);
        } else {
            await User.create(SUPER_ADMIN);
            console.log(`🔑 Super admin created: ${SUPER_ADMIN.email}`);
        }

        console.log(`\n═══════════════════════════════════════`);
        console.log(`  SUPER ADMIN CREDENTIALS`);
        console.log(`  Email:    ${SUPER_ADMIN.email}`);
        console.log(`  Password: ${SUPER_ADMIN.password}`);
        console.log(`  Role:     superadmin`);
        console.log(`═══════════════════════════════════════\n`);

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('❌ Seed failed:', error.message);
        process.exit(1);
    }
}

seed();

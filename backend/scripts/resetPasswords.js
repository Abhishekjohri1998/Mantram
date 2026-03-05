/**
 * Reset all user passwords to a known value for testing
 * Run: node server/scripts/resetPasswords.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import User from '../models/User.js';

const NEW_PASSWORD = 'Mantram@2024';

async function resetAll() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const users = await User.find({}).select('+password');
        console.log(`\nFound ${users.length} users. Resetting all passwords to: ${NEW_PASSWORD}\n`);

        let success = 0, skipped = 0;
        for (const user of users) {
            try {
                user.password = NEW_PASSWORD;
                // Skip validation for legacy users with missing fields
                await user.save({ validateBeforeSave: false });
                console.log(`  ✅ ${user.email} (${user.role}) — password reset`);
                success++;
            } catch (err) {
                console.log(`  ⚠️  ${user.email || 'unknown'} — SKIPPED (${err.message.slice(0, 60)})`);
                // Try raw update as fallback
                try {
                    const bcrypt = await import('bcryptjs');
                    const hashed = await bcrypt.default.hash(NEW_PASSWORD, 12);
                    await User.collection.updateOne({ _id: user._id }, { $set: { password: hashed } });
                    console.log(`     ↳ Updated via raw query instead`);
                    success++;
                    skipped--;
                } catch { /* skip entirely */ }
                skipped++;
            }
        }

        console.log(`\n═══════════════════════════════════════`);
        console.log(`  RESET: ${success} users | SKIPPED: ${skipped} users`);
        console.log(`  NEW PASSWORD: ${NEW_PASSWORD}`);
        console.log(`═══════════════════════════════════════\n`);

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

resetAll();

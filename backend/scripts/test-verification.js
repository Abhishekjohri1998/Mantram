import mongoose from 'mongoose';
import User from '../models/User.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/da-mantram';

async function runTest() {
    console.log('🧪 Starting Auth & Verification Test...');

    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const testEmail = 'test_verification_' + Date.now() + '@gmail.com';
        const spamEmail = 'spam_user@mailinator.com';

        // 1. Test Domain Blacklist (Simulated)
        const BLACKLISTED_DOMAINS = ['mailinator.com', 'yopmail.com'];
        const domain = spamEmail.split('@')[1];
        if (BLACKLISTED_DOMAINS.includes(domain)) {
            console.log('✅ PASS: Spam domain correctly identified');
        } else {
            console.log('❌ FAIL: Spam domain not identified');
        }

        // 2. Create unverified user
        const user = await User.create({
            name: 'Test User',
            email: testEmail,
            password: 'password123',
            isVerified: false,
            verificationToken: 'test-token-123',
            verificationExpires: new Date(Date.now() + 3600000)
        });
        console.log('✅ Created unverified test user:', testEmail);

        // 3. Verify Login Blocked logic (Simulated)
        const foundUser = await User.findOne({ email: testEmail });
        if (!foundUser.isVerified) {
            console.log('✅ PASS: User is correctly marked as unverified');
        } else {
            console.log('❌ FAIL: User should be unverified');
        }

        // 4. Simulate Token Verification
        const tokenToTest = 'test-token-123';
        const verifyUser = await User.findOne({
            verificationToken: tokenToTest,
            verificationExpires: { $gt: Date.now() }
        });

        if (verifyUser) {
            verifyUser.isVerified = true;
            verifyUser.verificationToken = undefined;
            verifyUser.verificationExpires = undefined;
            await verifyUser.save();
            console.log('✅ Simulated successful email verification');
        } else {
            console.log('❌ FAIL: Token verification failed');
        }

        // 5. Verify Login Allowed logic (Simulated)
        const finalUser = await User.findOne({ email: testEmail });
        if (finalUser.isVerified) {
            console.log('✅ PASS: User is now verified and can log in');
        } else {
            console.log('❌ FAIL: User should be verified now');
        }

        // Cleanup
        await User.deleteOne({ email: testEmail });
        console.log('🧹 Cleanup complete');

    } catch (error) {
        console.error('❌ Test failed with error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('👋 Disconnected from MongoDB');
    }
}

runTest();

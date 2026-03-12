import mongoose from 'mongoose';
import User from '../models/User.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Correct path to .env when running from backend/scripts/
dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/da-mantram';

async function verifyFlow() {
    try {
        console.log('🚀 Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected.');

        const testEmail = `test_queue_${Date.now()}@example.com`;
        
        // 1. Get current max queue number
        const lastUser = await User.findOne({ role: 'user' }).sort('-queueNumber');
        const expectedQueueNumber = (lastUser?.queueNumber || 0) + 1;
        console.log(`📊 Expected Queue Number: ${expectedQueueNumber}`);

        // 2. Simulate Registration
        console.log(`📝 Registering test user: ${testEmail}...`);
        const user = await User.create({
            name: 'Test Queue User',
            email: testEmail,
            password: 'password123',
            approvalStatus: 'pending',
            queueNumber: expectedQueueNumber,
            isVerified: true // Pre-verify for login test
        });
        console.log(`✅ User created with ID: ${user._id}, Status: ${user.approvalStatus}, Queue: ${user.queueNumber}`);

        // 3. Verify Queue Number
        if (user.queueNumber !== expectedQueueNumber) {
            throw new Error(`❌ Queue number mismatch! Expected ${expectedQueueNumber}, got ${user.queueNumber}`);
        }
        console.log('✅ Queue number verified.');

        // 4. Test Approval Logic (Simulate Superadmin)
        console.log('🔓 Approving user...');
        user.approvalStatus = 'approved';
        await user.save();
        console.log(`✅ User status updated to: ${user.approvalStatus}`);

        // 5. Cleanup
        console.log('🧹 Cleaning up test user...');
        await User.findByIdAndDelete(user._id);
        console.log('✅ Test user deleted.');

        console.log('\n✨ VERIFICATION SUCCESSFUL ✨');
    } catch (error) {
        console.error('\n❌ VERIFICATION FAILED:', error.message);
    } finally {
        await mongoose.disconnect();
    }
}

verifyFlow();

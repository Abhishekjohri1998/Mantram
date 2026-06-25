import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) {
    console.error('❌ MONGODB_URI is not defined in .env');
    process.exit(1);
}

import User from '../models/User.js';

async function run() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB.');

        const user = await User.findOne({ email: 'user@mantram.ai' });
        if (!user) {
            console.log('❌ User user@mantram.ai not found.');
            return;
        }

        const userId = user._id;
        console.log(`⚡ Giving user ${user.email} (${userId}) 1,000,000 credits for the load test...`);

        await User.updateOne(
            { _id: userId },
            { $set: { 'credits.total': 1000000 } }
        );
        console.log('✅ User credits updated to 1,000,000.');
    } catch (err) {
        console.error('❌ Error during setup:', err);
    } finally {
        await mongoose.disconnect();
    }
}

run();

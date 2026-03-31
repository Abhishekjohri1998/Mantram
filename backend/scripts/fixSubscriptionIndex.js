import mongoose from 'mongoose';
import dotenv from 'dotenv';
import connectDB from '../config/db.js';

dotenv.config();

const fix = async () => {
    try {
        await connectDB();
        console.log('🚀 Checking Subscription collection indexes...');

        const collection = mongoose.connection.collection('subscriptions');
        const indexes = await collection.indexes();
        
        console.log('📊 Current indexes:', indexes.map(i => i.name));

        const hasOrgIndex = indexes.some(i => i.name === 'organizationId_1');
        
        if (hasOrgIndex) {
            console.log('⚠️ Found problematic unique index: organizationId_1. Dropping it...');
            await collection.dropIndex('organizationId_1');
            console.log('✅ Index dropped successfully.');
        } else {
            console.log('✅ No problematic organizationId_1 index found.');
        }

        process.exit(0);
    } catch (err) {
        console.error('💥 Failed to fix indexes:', err.message);
        process.exit(1);
    }
};

fix();

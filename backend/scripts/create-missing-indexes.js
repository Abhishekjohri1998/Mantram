import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const MONGO_URI = process.env.MONGODB_URI;

if (!MONGO_URI) {
    console.error('MONGO_URI is not defined in .env file');
    process.exit(1);
}

// Minimal schemas to get collection access
const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
const Creative = mongoose.model('Creative', new mongoose.Schema({}, { strict: false }));
const Avatar = mongoose.model('Avatar', new mongoose.Schema({}, { strict: false }));

async function runMigration() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected successfully.');

        // 1. User collection indexes
        console.log('⚡ Creating sparse background indexes on User collection...');
        await User.collection.createIndex({ verificationToken: 1 }, { sparse: true, background: true });
        console.log('   - Added index: { verificationToken: 1 } (sparse, background)');
        
        await User.collection.createIndex({ resetPasswordToken: 1 }, { sparse: true, background: true });
        console.log('   - Added index: { resetPasswordToken: 1 } (sparse, background)');

        // 2. Creative collection indexes
        console.log('⚡ Creating background indexes on Creative collection...');
        await Creative.collection.createIndex({ brand: 1, createdAt: -1 }, { background: true });
        console.log('   - Added index: { brand: 1, createdAt: -1 } (background)');

        // 3. Avatar collection indexes
        console.log('⚡ Creating background indexes on Avatar collection...');
        await Avatar.collection.createIndex({ createdBy: 1, isActive: 1, createdAt: -1 }, { background: true });
        console.log('   - Added index: { createdBy: 1, isActive: 1, createdAt: -1 } (background)');
        
        await Avatar.collection.createIndex({ createdByRole: 1, isPublished: 1, isActive: 1 }, { background: true });
        console.log('   - Added index: { createdByRole: 1, isPublished: 1, isActive: 1 } (background)');

        console.log('\n🔍 Verifying active indexes...');
        
        const userIndexes = await User.collection.listIndexes().toArray();
        console.log('\n--- User Indexes ---');
        userIndexes.forEach(idx => console.log(`  Name: ${idx.name}, Key: ${JSON.stringify(idx.key)}`));

        const creativeIndexes = await Creative.collection.listIndexes().toArray();
        console.log('\n--- Creative Indexes ---');
        creativeIndexes.forEach(idx => console.log(`  Name: ${idx.name}, Key: ${JSON.stringify(idx.key)}`));

        const avatarIndexes = await Avatar.collection.listIndexes().toArray();
        console.log('\n--- Avatar Indexes ---');
        avatarIndexes.forEach(idx => console.log(`  Name: ${idx.name}, Key: ${JSON.stringify(idx.key)}`));

        console.log('\n🎉 Migration complete! All indexes created and verified successfully.');
    } catch (err) {
        console.error('❌ Error during index migration:', err);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from MongoDB.');
        process.exit(0);
    }
}

runMigration();

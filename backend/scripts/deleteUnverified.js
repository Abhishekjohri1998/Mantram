/**
 * Delete Unverified Users — Mantram AI
 * Deletes users who registered 30+ days ago and never verified their email.
 * Cascades to delete all their associated data.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function deleteUnverified() {
    try {
        console.log('🔄 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected.\n');
        const db = mongoose.connection.db;

        const d30 = new Date(new Date() - 30*24*60*60*1000);

        // Find the unverified users
        const staleUsers = await db.collection('users').find({
            isVerified: false, 
            createdAt: { $lt: d30 }, 
            role: { $ne: 'superadmin' }
        }, { projection: { _id: 1, email: 1, name: 1, createdAt: 1 } }).toArray();

        if (staleUsers.length === 0) {
            console.log('✅ No unverified users found older than 30 days.');
            await mongoose.disconnect();
            process.exit(0);
        }

        console.log(`🗑️  Unverified users to delete (${staleUsers.length}):`);
        staleUsers.forEach(u => console.log(`  - ${u.email} (${u.name || 'No Name'}) — registered ${u.createdAt?.toISOString()?.slice(0,10)}`));

        const userIds = staleUsers.map(u => u._id);

        // Cascade delete all their data
        const cascadeColls = [
            { name: 'brands', field: 'user' },
            { name: 'subscriptions', field: 'user' },
            { name: 'contents', field: 'user' },
            { name: 'creatives', field: 'user' },
            { name: 'creditusages', field: 'user' },
            { name: 'notifications', field: 'user' },
            { name: 'feedbacks', field: 'user' },
            { name: 'skills', field: 'user' },
            { name: 'brainstormsessions', field: 'user' },
            { name: 'seoaudits', field: 'user' },
            { name: 'seosnapshots', field: 'user' },
            { name: 'integrations', field: 'user' },
            { name: 'socialposts', field: 'user' },
            { name: 'socialaccounts', field: 'user' },
            { name: 'monthlystrategies', field: 'user' },
            { name: 'pulsehistories', field: 'user' },
            { name: 'geoprobehistories', field: 'user' },
            { name: 'funnels', field: 'user' },
            { name: 'funnelentries', field: 'user' },
            { name: 'automations', field: 'user' },
            { name: 'contacts', field: 'user' },
            { name: 'conversations', field: 'user' },
            { name: 'teamchats', field: 'organization' },
            { name: 'teaminvites', field: 'organization' },
        ];

        console.log('\n🗑️  Cascade deleting associated data...');
        let totalCascade = 0;
        for (const { name, field } of cascadeColls) {
            try {
                const r = await db.collection(name).deleteMany({ [field]: { $in: userIds } });
                if (r.deletedCount > 0) {
                    console.log(`  ${name.padEnd(25)}: deleted ${r.deletedCount}`);
                    totalCascade += r.deletedCount;
                }
            } catch(e) {}
        }

        // Delete the users themselves
        const r = await db.collection('users').deleteMany({ _id: { $in: userIds } });
        console.log(`\n✅ Deleted ${r.deletedCount} unverified users`);
        console.log(`✅ Cascade deleted ${totalCascade} associated records`);

        // Final count
        console.log(`\n📊 Final user count: ${await db.collection('users').countDocuments()}`);
        const stats = await db.stats();
        console.log(`💾 DB Size: ${((stats.dataSize + stats.indexSize) / 1024 / 1024).toFixed(2)} MB`);

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('❌ Deletion failed:', error.message);
        process.exit(1);
    }
}

deleteUnverified();

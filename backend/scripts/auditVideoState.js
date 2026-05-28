/**
 * Audit the current state of videoprojects to understand duplicates
 * and quality of restored data.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function audit() {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;

    const total = await db.collection('videoprojects').countDocuments();
    console.log(`\n📹 Total video projects: ${total}\n`);

    // Check for duplicate URLs
    const dupes = await db.collection('videoprojects').aggregate([
        { $group: { _id: '$finalVideoUrl', count: { $sum: 1 }, ids: { $push: '$_id' } } },
        { $match: { count: { $gt: 1 } } },
        { $sort: { count: -1 } }
    ]).toArray();
    console.log(`🔴 Duplicate finalVideoUrl entries: ${dupes.length}`);
    dupes.forEach(d => console.log(`   URL: ${d._id?.substring(0, 80)}... → ${d.count} copies`));

    // Check for generic titles (my restore vs original)
    const genericTitles = await db.collection('videoprojects').countDocuments({
        title: { $regex: /^(Generated|Storyboard Film|Recovered|Motion Graphics|final|gen-video|69|6a)/ }
    });
    const properTitles = total - genericTitles;
    console.log(`\n📝 Title quality:`);
    console.log(`   Generic/restored titles: ${genericTitles}`);
    console.log(`   Proper original titles: ${properTitles}`);

    // Check which have real metadata vs shells
    const withPrompt = await db.collection('videoprojects').countDocuments({
        $or: [
            { backendPrompt: { $exists: true, $ne: '' } },
            { 'advancedConfig.prompt': { $exists: true, $ne: '' } },
            { 'input.brief': { $exists: true, $ne: '' } },
        ]
    });
    console.log(`\n🧠 Metadata quality:`);
    console.log(`   With prompt/brief: ${withPrompt}`);
    console.log(`   Empty shells: ${total - withPrompt}`);

    // Show sample of what a "restored" doc looks like
    const sample = await db.collection('videoprojects').findOne({ title: { $regex: /^Generated/ } });
    if (sample) {
        console.log(`\n📋 Sample restored doc:`);
        console.log(`   _id: ${sample._id}`);
        console.log(`   title: ${sample.title}`);
        console.log(`   status: ${sample.status}`);
        console.log(`   studioMode: ${sample.studioMode}`);
        console.log(`   backendPrompt: "${sample.backendPrompt || '(empty)'}"`);
        console.log(`   advancedConfig.prompt: "${sample.advancedConfig?.prompt || '(empty)'}"`);
        console.log(`   generation.s3VideoUrl: ${sample.generation?.s3VideoUrl?.substring(0, 80)}`);
        console.log(`   createdAt: ${sample.createdAt}`);
    }

    // Check what we know about the original 574 that were deleted
    // The cleanup script deleted videoprojects where user $nin validUserIds
    const validUserIds = await db.collection('users').distinct('_id');
    console.log(`\n👥 Current valid user count: ${validUserIds.length}`);

    // List all collections to check if there's a backup collection
    const collections = await db.listCollections().toArray();
    const collNames = collections.map(c => c.name).sort();
    const backupColls = collNames.filter(c => c.includes('backup') || c.includes('archive') || c.includes('old'));
    console.log(`\n💾 Backup-related collections: ${backupColls.length > 0 ? backupColls.join(', ') : 'NONE'}`);

    await mongoose.disconnect();
}

audit().catch(console.error);

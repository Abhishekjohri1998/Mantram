/**
 * cleanupBase64.js — Mantram AI
 *
 * Finds Creative and Avatar documents where imageUrl still contains a base64
 * data URI (data:image/...) and uploads them to S3, then updates the record.
 *
 * Usage:  node scripts/cleanupBase64.js [--dry-run]
 *
 * --dry-run   Only count and list affected records without modifying anything.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Creative from '../models/Creative.js';
import Avatar from '../models/Avatar.js';
import { uploadToS3 } from '../utils/s3.js';

dotenv.config();

const DRY_RUN = process.argv.includes('--dry-run');

async function migrateCollection(Model, collectionName, s3Folder) {
    // Find all documents where imageUrl starts with 'data:'
    const docs = await Model.find({
        imageUrl: { $regex: /^data:image\// }
    }).select('_id imageUrl').lean();

    console.log(`\n📦 ${collectionName}: ${docs.length} documents with base64 imageUrl`);
    if (docs.length === 0) return 0;

    if (DRY_RUN) {
        docs.forEach(d => console.log(`   [DRY-RUN] ${d._id}`));
        return docs.length;
    }

    let migrated = 0;
    for (const doc of docs) {
        try {
            const ext = doc.imageUrl.includes('image/png') ? 'png'
                : doc.imageUrl.includes('image/webp') ? 'webp' : 'jpg';
            const s3Key = `${s3Folder}/${doc._id}-${Date.now()}.${ext}`;
            const s3Url = await uploadToS3(doc.imageUrl, s3Key);

            await Model.updateOne(
                { _id: doc._id },
                { $set: { imageUrl: s3Url, thumbnailUrl: s3Url } }
            );
            migrated++;
            console.log(`   ✅ ${doc._id} → ${s3Url.substring(0, 80)}...`);
        } catch (err) {
            console.error(`   ❌ ${doc._id} failed: ${err.message}`);
        }
    }
    return migrated;
}

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');
        console.log(DRY_RUN ? '🏃 DRY RUN — no changes will be made\n' : '🚀 LIVE RUN — migrating base64 to S3\n');

        const creativeMigrated = await migrateCollection(Creative, 'Creatives', 'creatives/cleanup');
        const avatarMigrated = await migrateCollection(Avatar, 'Avatars', 'avatars/cleanup');

        console.log('\n═══════════════════════════════════');
        console.log(`📊 Summary:`);
        console.log(`   Creatives: ${creativeMigrated} ${DRY_RUN ? 'found' : 'migrated'}`);
        console.log(`   Avatars:   ${avatarMigrated} ${DRY_RUN ? 'found' : 'migrated'}`);
        console.log('═══════════════════════════════════');

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('❌ Cleanup failed:', error.message);
        process.exit(1);
    }
}

run();

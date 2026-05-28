/**
 * Restore video projects from S3 video files.
 * Creates VideoProject documents for active users only.
 * 
 * Run: node scripts/restoreVideosLive.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

dotenv.config();

const s3 = new S3Client({
    region: process.env.AWS_REGION || 'ap-south-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
});

const BUCKET = process.env.AWS_S3_BUCKET || process.env.S3_BUCKET;

async function listS3Videos(prefix) {
    const allObjects = [];
    let continuationToken;
    do {
        const cmd = new ListObjectsV2Command({
            Bucket: BUCKET,
            Prefix: prefix,
            MaxKeys: 1000,
            ContinuationToken: continuationToken,
        });
        try {
            const resp = await s3.send(cmd);
            const objects = (resp.Contents || []).filter(obj => 
                obj.Key.endsWith('.mp4') || obj.Key.endsWith('.webm') || obj.Key.endsWith('.mov')
            );
            allObjects.push(...objects);
            continuationToken = resp.IsTruncated ? resp.NextContinuationToken : null;
        } catch (err) {
            console.warn(`  ⚠️ Could not list prefix "${prefix}":`, err.message);
            break;
        }
    } while (continuationToken);
    return allObjects;
}

async function restore() {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;

    // Get valid users
    const users = await db.collection('users').find({}).project({ _id: 1, email: 1, name: 1 }).toArray();
    const userIds = new Set(users.map(u => u._id.toString()));
    const userMap = {};
    users.forEach(u => { userMap[u._id.toString()] = u; });

    // Get brands for each user
    const brands = await db.collection('brands').find({}).project({ _id: 1, user: 1, name: 1 }).toArray();
    const brandsByUser = {};
    brands.forEach(b => {
        const uid = b.user?.toString();
        if (uid) {
            if (!brandsByUser[uid]) brandsByUser[uid] = [];
            brandsByUser[uid].push(b);
        }
    });

    console.log(`\n${'═'.repeat(65)}`);
    console.log(`  VIDEO PROJECT RESTORATION — LIVE`);
    console.log(`${'═'.repeat(65)}\n`);

    // Scan all video prefixes
    const prefixes = ['videos/', 'video-studio/', 'storyboard/final/', 'storyboard/longform/', 'ugc-pro/'];
    let totalRestored = 0;
    let totalSkipped = 0;

    for (const prefix of prefixes) {
        console.log(`\n📂 Scanning ${prefix}...`);
        const objects = await listS3Videos(prefix);
        console.log(`   Found ${objects.length} video files`);

        for (const obj of objects) {
            const key = obj.Key;
            const parts = key.split('/');
            
            // Extract userId (24-char hex ObjectId in path)
            let userId = null;
            let brandId = null;
            let projectIdFromKey = null;
            
            const objectIdParts = parts.filter(p => /^[0-9a-f]{24}$/.test(p));
            
            if (objectIdParts.length >= 1) {
                userId = objectIdParts[0];
            }
            if (objectIdParts.length >= 2) {
                // Second ObjectId could be brand or project
                const secondId = objectIdParts[1];
                // Check if it's a brand
                const isBrand = brands.some(b => b._id.toString() === secondId);
                if (isBrand) {
                    brandId = secondId;
                    if (objectIdParts.length >= 3) projectIdFromKey = objectIdParts[2];
                } else {
                    projectIdFromKey = secondId;
                }
            }
            
            // Skip if user doesn't exist anymore
            if (!userId || !userIds.has(userId)) {
                totalSkipped++;
                continue;
            }

            // Determine studio mode from key
            let studioMode = 'advanced';
            let mode = 'advanced';
            if (key.includes('storyboard')) {
                studioMode = 'storyboard';
                mode = 'storyboard';
            }
            if (key.includes('ugc-pro') || key.includes('ugc')) {
                studioMode = 'ugc-pro';
                mode = 'ugc';
            }
            if (key.includes('longform')) {
                studioMode = 'storyboard';
                mode = 'storyboard';
            }

            // Build S3 URL
            const s3Url = `s3://${BUCKET}/${key}`;
            
            // Use projectIdFromKey as _id if available (preserves original IDs)
            const title = parts[parts.length - 1].replace(/\.\w+$/, '').replace(/[-_]/g, ' ') || 'Recovered Video';
            
            // Determine brand — first matching brand for this user, or null
            if (!brandId && brandsByUser[userId]?.length > 0) {
                brandId = brandsByUser[userId][0]._id.toString();
            }

            const doc = {
                user: new mongoose.Types.ObjectId(userId),
                brand: brandId ? new mongoose.Types.ObjectId(brandId) : null,
                title: title.length > 2 ? title : 'Recovered Video',
                status: 'completed',
                mode,
                studioMode,
                finalVideoUrl: s3Url,
                generation: {
                    s3VideoUrl: s3Url,
                    videoUrl: s3Url,
                    progress: 100,
                    status: 'COMPLETED',
                    completedAt: obj.LastModified,
                },
                fileSizeMB: Math.round((obj.Size / (1024 * 1024)) * 100) / 100,
                createdAt: obj.LastModified,
                updatedAt: obj.LastModified,
            };

            // If we have the original project ID, use it
            if (projectIdFromKey) {
                doc._id = new mongoose.Types.ObjectId(projectIdFromKey);
            }

            try {
                await db.collection('videoprojects').insertOne(doc);
                totalRestored++;
            } catch (err) {
                if (err.code === 11000) {
                    // Duplicate key - already restored
                    totalSkipped++;
                } else {
                    console.warn(`   ❌ Failed: ${key} — ${err.message}`);
                }
            }
        }
    }

    // Verify
    const totalProjects = await db.collection('videoprojects').countDocuments();
    const byUser = await db.collection('videoprojects').aggregate([
        { $group: { _id: '$user', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
    ]).toArray();

    console.log(`\n${'═'.repeat(65)}`);
    console.log(`  RESTORATION COMPLETE`);
    console.log(`  ✅ Restored: ${totalRestored} video projects`);
    console.log(`  ⏭️  Skipped: ${totalSkipped} (deleted users or duplicates)`);
    console.log(`  📹 Total in DB now: ${totalProjects}`);
    console.log(`\n  By user:`);
    for (const u of byUser) {
        const user = userMap[u._id.toString()];
        console.log(`     ${user?.email || 'unknown'}: ${u.count} videos`);
    }
    console.log(`${'═'.repeat(65)}\n`);

    await mongoose.disconnect();
}

restore().catch(console.error);

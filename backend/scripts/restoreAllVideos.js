/**
 * COMPREHENSIVE Video Project Restoration
 * 
 * Scans ALL S3 prefixes that contain video files and creates
 * VideoProject documents for active users.
 * 
 * Handles:
 *   - videos/{userId}/...             → user ID from path
 *   - video-studio/{userId}/...       → user ID from path
 *   - storyboard/final/{id}/...       → project/user ID from path
 *   - storyboard/longform/{id}/...    → project/user ID from path
 *   - qads/gen-video-{ts}.mp4         → no user ID (assign to primary user)
 *   - ugc-pro/gen-video-{ts}.mp4      → no user ID (assign to primary user)
 *   - motion-graphics/video-{ts}.mp4  → no user ID (assign to primary user)
 *   - compiled-video/...              → check for user ID in path
 * 
 * Run: node scripts/restoreAllVideos.js [--dry-run]
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

dotenv.config();

const DRY_RUN = process.argv.includes('--dry-run');
if (DRY_RUN) console.log('🔍 DRY RUN MODE — no database writes will be made\n');

const s3 = new S3Client({
    region: process.env.AWS_REGION || 'ap-south-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
});

const BUCKET = process.env.AWS_S3_BUCKET || process.env.S3_BUCKET;
const REGION = process.env.AWS_REGION || 'ap-south-1';

// All prefixes that can contain video files
const ALL_PREFIXES = [
    'videos/',
    'video-studio/',
    'storyboard/final/',
    'storyboard/longform/',
    'storyboard/posters/',
    'storyboard/products/',
    'qads/',
    'ugc-pro/',
    'motion-graphics/',
    'compiled-video/',
    'ugc-enhance/',
    'ugc-previews/',
    'canvas-voiceover/',
    'voiceover-preview/',
];

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

function buildS3Url(key) {
    return `https://s3.${REGION}.amazonaws.com/${BUCKET}/${key}`;
}

/**
 * Determines studio mode from S3 key
 */
function getStudioMode(key) {
    if (key.startsWith('qads/')) return 'q-ads';
    if (key.startsWith('ugc-pro/')) return 'ugc-pro';
    if (key.startsWith('storyboard/')) return 'storyboard';
    if (key.startsWith('motion-graphics/')) return 'motion-graphics';
    if (key.startsWith('compiled-video/')) return 'storyboard';
    return 'advanced';
}

function getMode(key) {
    if (key.startsWith('storyboard/')) return 'storyboard';
    if (key.startsWith('ugc-pro/')) return 'ugc';
    return 'advanced';
}

function extractTitle(key) {
    const filename = key.split('/').pop().replace(/\.\w+$/, '');
    // Clean up gen-video-timestamp format
    if (filename.startsWith('gen-video-')) {
        const ts = filename.replace('gen-video-', '');
        const date = new Date(parseInt(ts));
        if (!isNaN(date.getTime())) {
            return `Generated ${date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
        }
    }
    if (filename.startsWith('final-')) {
        return 'Storyboard Film';
    }
    if (filename.startsWith('video-')) {
        const ts = filename.replace('video-', '');
        const date = new Date(parseInt(ts));
        if (!isNaN(date.getTime())) {
            return `Motion Graphics ${date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
        }
    }
    return filename.replace(/[-_]/g, ' ') || 'Recovered Video';
}

async function restore() {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;

    // Get all users
    const users = await db.collection('users').find({}).project({ _id: 1, email: 1, name: 1 }).toArray();
    const userIds = new Set(users.map(u => u._id.toString()));
    const userMap = {};
    users.forEach(u => { userMap[u._id.toString()] = u; });

    // Get brands for user mapping
    const brands = await db.collection('brands').find({}).project({ _id: 1, user: 1, name: 1 }).toArray();
    const brandsByUser = {};
    brands.forEach(b => {
        const uid = b.user?.toString();
        if (uid) {
            if (!brandsByUser[uid]) brandsByUser[uid] = [];
            brandsByUser[uid].push(b);
        }
    });

    // Find the primary user (most brands = platform owner)
    let primaryUserId = null;
    let maxBrands = 0;
    for (const [uid, blist] of Object.entries(brandsByUser)) {
        if (blist.length > maxBrands) { maxBrands = blist.length; primaryUserId = uid; }
    }
    if (!primaryUserId && users.length > 0) primaryUserId = users[0]._id.toString();
    console.log(`\n🔑 Primary user (for unattributed videos): ${userMap[primaryUserId]?.email} (${primaryUserId})`);

    // Get existing projects to avoid duplicates
    const existing = await db.collection('videoprojects').find({}).project({ finalVideoUrl: 1, 'generation.s3VideoUrl': 1, 'generation.videoUrl': 1, 'storyboard.finalVideoUrl': 1 }).toArray();
    const existingUrls = new Set();
    existing.forEach(p => {
        if (p.finalVideoUrl) existingUrls.add(p.finalVideoUrl);
        if (p.generation?.s3VideoUrl) existingUrls.add(p.generation.s3VideoUrl);
        if (p.generation?.videoUrl) existingUrls.add(p.generation.videoUrl);
        if (p.storyboard?.finalVideoUrl) existingUrls.add(p.storyboard.finalVideoUrl);
    });

    console.log(`\n${'═'.repeat(65)}`);
    console.log(`  COMPREHENSIVE VIDEO RESTORATION`);
    console.log(`  Bucket: ${BUCKET}`);
    console.log(`  Existing projects: ${existing.length}`);
    console.log(`${'═'.repeat(65)}\n`);

    let totalRestored = 0;
    let totalSkipped = 0;
    let totalOrphan = 0;

    for (const prefix of ALL_PREFIXES) {
        const objects = await listS3Videos(prefix);
        if (objects.length === 0) continue;
        
        console.log(`\n📂 ${prefix} — ${objects.length} video files`);

        for (const obj of objects) {
            const key = obj.Key;
            const s3Url = buildS3Url(key);

            // Skip if already in DB
            if (existingUrls.has(s3Url)) {
                totalSkipped++;
                continue;
            }

            // Skip voiceover subfolders (not actual videos)
            if (key.includes('/voiceover/') || key.includes('/audio/')) continue;

            // Determine user from path
            const parts = key.split('/');
            const objectIdParts = parts.filter(p => /^[0-9a-f]{24}$/.test(p));
            
            let userId = null;
            let brandId = null;

            if (objectIdParts.length >= 1) {
                // First ObjectId in path
                const firstId = objectIdParts[0];
                if (userIds.has(firstId)) {
                    userId = firstId;
                } else {
                    // Might be a brand or project ID
                    const brand = brands.find(b => b._id.toString() === firstId);
                    if (brand) {
                        brandId = firstId;
                        userId = brand.user?.toString();
                    }
                }
                // Second ObjectId
                if (objectIdParts.length >= 2) {
                    const secondId = objectIdParts[1];
                    if (!brandId) {
                        const brand = brands.find(b => b._id.toString() === secondId);
                        if (brand) brandId = secondId;
                    }
                }
            }

            // For qads/, ugc-pro/, motion-graphics/ — no user ID in path
            if (!userId) {
                if (key.startsWith('qads/') || key.startsWith('ugc-pro/') || key.startsWith('motion-graphics/')) {
                    userId = primaryUserId;
                } else {
                    totalOrphan++;
                    continue;
                }
            }

            // Skip if user doesn't exist
            if (!userIds.has(userId)) {
                totalOrphan++;
                continue;
            }

            const studioMode = getStudioMode(key);
            const mode = getMode(key);
            const title = extractTitle(key);

            // Set brand
            if (!brandId && brandsByUser[userId]?.length > 0) {
                brandId = brandsByUser[userId][0]._id.toString();
            }

            const doc = {
                user: new mongoose.Types.ObjectId(userId),
                brand: brandId ? new mongoose.Types.ObjectId(brandId) : null,
                title,
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

            try {
                if (DRY_RUN) {
                    console.log(`   [DRY] Would restore: ${title} (${studioMode}) → ${key}`);
                    totalRestored++;
                } else {
                    await db.collection('videoprojects').insertOne(doc);
                    totalRestored++;
                }
                existingUrls.add(s3Url); // prevent dups in this run
            } catch (err) {
                if (err.code === 11000) {
                    totalSkipped++;
                } else {
                    console.warn(`   ❌ Failed: ${key} — ${err.message}`);
                }
            }
        }
    }

    // Final summary
    const totalProjects = await db.collection('videoprojects').countDocuments();
    const byUser = await db.collection('videoprojects').aggregate([
        { $group: { _id: '$user', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
    ]).toArray();
    const byMode = await db.collection('videoprojects').aggregate([
        { $group: { _id: '$studioMode', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
    ]).toArray();

    console.log(`\n${'═'.repeat(65)}`);
    console.log(`  RESTORATION COMPLETE`);
    console.log(`${'═'.repeat(65)}`);
    console.log(`  ✅ Newly restored:    ${totalRestored}`);
    console.log(`  ⏭️  Already existed:   ${totalSkipped}`);
    console.log(`  👻 Orphaned (skipped): ${totalOrphan}`);
    console.log(`  📹 Total in DB now:   ${totalProjects}`);
    console.log(`\n  By user:`);
    for (const u of byUser) {
        const user = userMap[u._id.toString()];
        console.log(`     ${user?.email || 'unknown'}: ${u.count} videos`);
    }
    console.log(`\n  By studio mode:`);
    for (const m of byMode) {
        console.log(`     ${m._id || '(none)'}: ${m.count}`);
    }
    console.log(`${'═'.repeat(65)}\n`);

    await mongoose.disconnect();
}

restore().catch(console.error);

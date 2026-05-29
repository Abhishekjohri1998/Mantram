/**
 * STORYBOARD RESTORATION — Mantram AI
 * 
 * Specifically restores storyboard videos and poster images that were lost.
 * 
 * S3 structure:
 *   storyboard/final/{projectId}/final-film.mp4        → VideoProject.storyboard.finalVideoUrl + finalVideoUrl
 *   storyboard/longform/{projectId}/final-{ts}.mp4     → VideoProject.storyboard.finalVideoUrl + finalVideoUrl
 *   storyboard/posters/{userId}/{ts}-{hash}.png        → VideoProject.storyboard.shots[].frameUrl (poster frames)
 *   storyboard/products/{userId}/{ts}-{filename}       → VideoProject.input.images[] (product reference images)
 * 
 * Strategy:
 *   Phase A: For final/ and longform/ — the folder name IS the VideoProject._id.
 *            Find the document and UPDATE storyboard.finalVideoUrl + finalVideoUrl.
 *            If no document exists, CREATE one for the primary user.
 * 
 *   Phase B: For posters/ — these are generated poster frames for storyboard shots.
 *            They are NOT separate documents; they belong inside VideoProject.storyboard.shots[].frameUrl.
 *            Since we can't map a timestamp-named poster to a specific shot, we store them
 *            as a Creative so they appear in the gallery, and also log the URLs.
 * 
 *   Phase C: For products/ — these are user-uploaded product reference images.
 *            Store as Creatives tagged 'storyboard-reference'.
 * 
 * Run: cd backend && node scripts/restoreStoryboard.js [--dry-run]
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

// ── Helpers ──────────────────────────────────────────────────────────────────

async function listS3Objects(prefix) {
    const allObjects = [];
    let continuationToken;
    do {
        const cmd = new ListObjectsV2Command({
            Bucket: BUCKET,
            Prefix: prefix,
            MaxKeys: 1000,
            ContinuationToken: continuationToken,
        });
        const resp = await s3.send(cmd);
        allObjects.push(...(resp.Contents || []));
        continuationToken = resp.IsTruncated ? resp.NextContinuationToken : null;
    } while (continuationToken);
    return allObjects;
}

function buildS3Url(key) {
    return `https://s3.${REGION}.amazonaws.com/${BUCKET}/${key}`;
}

function isObjectId(str) {
    return /^[0-9a-f]{24}$/.test(str);
}

// ── Main Restore ─────────────────────────────────────────────────────────────

async function restore() {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;

    // Load reference data
    const users = await db.collection('users').find({}).project({ _id: 1, email: 1 }).toArray();
    const userIds = new Set(users.map(u => u._id.toString()));
    const userMap = {};
    users.forEach(u => { userMap[u._id.toString()] = u; });

    const brands = await db.collection('brands').find({}).project({ _id: 1, user: 1, name: 1 }).toArray();
    const brandsByUser = {};
    brands.forEach(b => {
        const uid = b.user?.toString();
        if (uid) {
            if (!brandsByUser[uid]) brandsByUser[uid] = [];
            brandsByUser[uid].push(b);
        }
    });

    // Primary user
    let primaryUserId = null;
    let maxBrands = 0;
    for (const [uid, blist] of Object.entries(brandsByUser)) {
        if (blist.length > maxBrands) { maxBrands = blist.length; primaryUserId = uid; }
    }
    if (!primaryUserId && users.length > 0) primaryUserId = users[0]._id.toString();

    console.log(`🔑 Primary user: ${userMap[primaryUserId]?.email} (${primaryUserId})`);

    // Load existing video projects (for Phase A)
    const existingProjects = await db.collection('videoprojects').find({}).toArray();
    const projectMap = {};
    existingProjects.forEach(p => { projectMap[p._id.toString()] = p; });

    // Load existing creative URLs for dedup (for Phase B/C)
    const existingCreativeUrls = new Set();
    const creatives = await db.collection('creatives').find({}).project({ imageUrl: 1 }).toArray();
    creatives.forEach(c => { if (c.imageUrl) existingCreativeUrls.add(c.imageUrl); });

    const stats = {
        videosUpdated: 0,
        videosCreated: 0,
        videosSkipped: 0,
        postersRestored: 0,
        postersSkipped: 0,
        productsRestored: 0,
        productsSkipped: 0,
    };

    console.log(`\n${'═'.repeat(70)}`);
    console.log(`  STORYBOARD RESTORATION${DRY_RUN ? ' (DRY RUN)' : ''}`);
    console.log(`  Bucket: ${BUCKET}`);
    console.log(`  Existing video projects: ${existingProjects.length}`);
    console.log(`${'═'.repeat(70)}\n`);

    // ═══ PHASE A: Restore storyboard/final/ and storyboard/longform/ videos ═══
    console.log('═══ PHASE A: STORYBOARD FINAL VIDEOS ═══\n');

    for (const prefix of ['storyboard/final/', 'storyboard/longform/']) {
        const objects = await listS3Objects(prefix);
        // Filter to only video files
        const videos = objects.filter(o =>
            o.Key.endsWith('.mp4') || o.Key.endsWith('.webm') || o.Key.endsWith('.mov')
        );
        if (videos.length === 0) continue;
        console.log(`📂 ${prefix} — ${videos.length} video files`);

        for (const obj of videos) {
            const key = obj.Key;
            const s3Url = buildS3Url(key);
            const parts = key.split('/');

            // Extract project ID from path: storyboard/final/{projectId}/filename.mp4
            const projectId = parts.length >= 3 ? parts[2] : null;
            if (!projectId || !isObjectId(projectId)) {
                console.log(`   ⚠️ Skipping (no valid project ID): ${key}`);
                stats.videosSkipped++;
                continue;
            }

            const existingProject = projectMap[projectId];

            if (existingProject) {
                // Project EXISTS — check if it already has the video URL
                const hasUrl =
                    existingProject.finalVideoUrl === s3Url ||
                    existingProject.storyboard?.finalVideoUrl === s3Url ||
                    existingProject.generation?.s3VideoUrl === s3Url;

                if (hasUrl) {
                    stats.videosSkipped++;
                    continue;
                }

                // UPDATE the existing project with the video URL
                const updates = {};
                if (!existingProject.finalVideoUrl) {
                    updates.finalVideoUrl = s3Url;
                }
                if (!existingProject.storyboard?.finalVideoUrl) {
                    updates['storyboard.finalVideoUrl'] = s3Url;
                }
                if (!existingProject.generation?.s3VideoUrl) {
                    updates['generation.s3VideoUrl'] = s3Url;
                    updates['generation.videoUrl'] = s3Url;
                    updates['generation.status'] = 'COMPLETED';
                    updates['generation.progress'] = 100;
                    updates['generation.completedAt'] = obj.LastModified;
                }
                // Mark as completed
                if (existingProject.status !== 'completed' && existingProject.status !== 'done') {
                    updates.status = 'completed';
                }

                if (Object.keys(updates).length > 0) {
                    if (DRY_RUN) {
                        console.log(`   [DRY] Would UPDATE project ${projectId}: ${Object.keys(updates).join(', ')}`);
                        console.log(`         Title: "${existingProject.title}" | URL: ${s3Url.substring(s3Url.lastIndexOf('/') + 1)}`);
                    } else {
                        await db.collection('videoprojects').updateOne(
                            { _id: existingProject._id },
                            { $set: updates }
                        );
                        console.log(`   ✅ Updated project ${projectId}: "${existingProject.title}"`);
                    }
                    stats.videosUpdated++;
                } else {
                    stats.videosSkipped++;
                }
            } else {
                // Project does NOT exist — CREATE a new VideoProject
                const doc = {
                    _id: new mongoose.Types.ObjectId(projectId),
                    user: new mongoose.Types.ObjectId(primaryUserId),
                    brand: brandsByUser[primaryUserId]?.[0]?._id || null,
                    title: prefix.includes('longform') ? 'Longform Storyboard Film' : 'Storyboard Film',
                    status: 'completed',
                    mode: 'storyboard',
                    studioMode: prefix.includes('longform') ? 'storyboard' : 'storyboard',
                    finalVideoUrl: s3Url,
                    generation: {
                        s3VideoUrl: s3Url,
                        videoUrl: s3Url,
                        progress: 100,
                        status: 'COMPLETED',
                        completedAt: obj.LastModified,
                    },
                    storyboard: {
                        finalVideoUrl: s3Url,
                        status: 'done',
                    },
                    fileSizeMB: Math.round((obj.Size / (1024 * 1024)) * 100) / 100,
                    createdAt: obj.LastModified,
                    updatedAt: obj.LastModified,
                };

                if (DRY_RUN) {
                    console.log(`   [DRY] Would CREATE project ${projectId}: "${doc.title}" (${doc.fileSizeMB} MB)`);
                } else {
                    try {
                        await db.collection('videoprojects').insertOne(doc);
                        console.log(`   ✅ Created project ${projectId}: "${doc.title}"`);
                    } catch (err) {
                        if (err.code === 11000) {
                            console.log(`   ⏭️ Already exists: ${projectId}`);
                        } else {
                            console.warn(`   ❌ Failed: ${err.message}`);
                        }
                    }
                }
                stats.videosCreated++;
            }
        }
    }

    console.log(`\n  ✅ Videos: ${stats.videosUpdated} updated | ${stats.videosCreated} created | ${stats.videosSkipped} skipped\n`);

    // ═══ PHASE B: Restore storyboard/posters/ as Creatives ═══
    console.log('═══ PHASE B: STORYBOARD POSTER FRAMES ═══\n');

    const posterObjects = await listS3Objects('storyboard/posters/');
    const posterImages = posterObjects.filter(o =>
        ['.png', '.jpg', '.jpeg', '.webp'].some(ext => o.Key.toLowerCase().endsWith(ext))
    );
    console.log(`📂 storyboard/posters/ — ${posterImages.length} poster images`);

    for (const obj of posterImages) {
        const key = obj.Key;
        const s3Url = buildS3Url(key);

        if (existingCreativeUrls.has(s3Url)) {
            stats.postersSkipped++;
            continue;
        }

        // Extract user ID from path: storyboard/posters/{userId}/{filename}
        const parts = key.split('/');
        const userIdFromPath = parts.length >= 3 ? parts[2] : null;
        const userId = (userIdFromPath && userIds.has(userIdFromPath)) ? userIdFromPath : primaryUserId;
        const brandId = brandsByUser[userId]?.[0]?._id || null;

        // Extract timestamp from filename for dating
        const filename = parts[parts.length - 1];
        const tsMatch = filename.match(/^(\d{13})/);
        const createdAt = tsMatch ? new Date(parseInt(tsMatch[1])) : obj.LastModified;

        const doc = {
            user: new mongoose.Types.ObjectId(userId),
            brand: brandId,
            type: 'storyboard-poster',
            title: `Storyboard Frame — ${createdAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`,
            imageUrl: s3Url,
            status: 'draft',
            tags: ['storyboard', 'poster-frame', 'restored'],
            aiMeta: { provider: 'restored', model: 'imagen' },
            fileSizeMB: Math.round((obj.Size / (1024 * 1024)) * 100) / 100,
            createdAt,
            updatedAt: createdAt,
        };

        if (DRY_RUN) {
            stats.postersRestored++;
        } else {
            try {
                await db.collection('creatives').insertOne(doc);
                stats.postersRestored++;
            } catch (err) {
                if (err.code === 11000) stats.postersSkipped++;
                else console.warn(`   ❌ ${key}: ${err.message}`);
            }
        }
        existingCreativeUrls.add(s3Url);
    }

    console.log(`\n  ✅ Posters: +${stats.postersRestored} restored | ${stats.postersSkipped} skipped\n`);

    // ═══ PHASE C: Restore storyboard/products/ as Creatives ═══
    console.log('═══ PHASE C: STORYBOARD PRODUCT REFERENCES ═══\n');

    const productObjects = await listS3Objects('storyboard/products/');
    const productImages = productObjects.filter(o =>
        ['.png', '.jpg', '.jpeg', '.webp', '.jfif'].some(ext => o.Key.toLowerCase().endsWith(ext))
    );
    console.log(`📂 storyboard/products/ — ${productImages.length} product reference images`);

    for (const obj of productImages) {
        const key = obj.Key;
        const s3Url = buildS3Url(key);

        if (existingCreativeUrls.has(s3Url)) {
            stats.productsSkipped++;
            continue;
        }

        const parts = key.split('/');
        const userIdFromPath = parts.length >= 3 ? parts[2] : null;
        const userId = (userIdFromPath && userIds.has(userIdFromPath)) ? userIdFromPath : primaryUserId;
        const brandId = brandsByUser[userId]?.[0]?._id || null;

        const filename = parts[parts.length - 1];
        const tsMatch = filename.match(/^(\d{13})/);
        const createdAt = tsMatch ? new Date(parseInt(tsMatch[1])) : obj.LastModified;

        const doc = {
            user: new mongoose.Types.ObjectId(userId),
            brand: brandId,
            type: 'uploaded',
            title: `Storyboard Reference — ${filename.replace(/^\d{13}-/, '').replace(/\.\w+$/, '').substring(0, 50)}`,
            imageUrl: s3Url,
            status: 'draft',
            tags: ['storyboard', 'product-reference', 'restored'],
            aiMeta: { provider: 'restored', model: 'upload' },
            fileSizeMB: Math.round((obj.Size / (1024 * 1024)) * 100) / 100,
            createdAt,
            updatedAt: createdAt,
        };

        if (DRY_RUN) {
            stats.productsRestored++;
        } else {
            try {
                await db.collection('creatives').insertOne(doc);
                stats.productsRestored++;
            } catch (err) {
                if (err.code === 11000) stats.productsSkipped++;
                else console.warn(`   ❌ ${key}: ${err.message}`);
            }
        }
        existingCreativeUrls.add(s3Url);
    }

    console.log(`\n  ✅ Product Refs: +${stats.productsRestored} restored | ${stats.productsSkipped} skipped\n`);

    // ═══ FINAL SUMMARY ═══
    console.log(`${'═'.repeat(70)}`);
    console.log(`  STORYBOARD RESTORATION COMPLETE${DRY_RUN ? ' (DRY RUN — no changes made)' : ''}`);
    console.log(`${'═'.repeat(70)}`);
    console.log(`  🎬 Videos:       ${stats.videosUpdated} updated | ${stats.videosCreated} created | ${stats.videosSkipped} skipped`);
    console.log(`  🖼️  Posters:      +${stats.postersRestored} restored as Creatives | ${stats.postersSkipped} skipped`);
    console.log(`  📦 Product Refs: +${stats.productsRestored} restored as Creatives | ${stats.productsSkipped} skipped`);

    // Post-restore DB counts
    if (!DRY_RUN) {
        const totalVideos = await db.collection('videoprojects').countDocuments();
        const storyboardVideos = await db.collection('videoprojects').countDocuments({ mode: 'storyboard' });
        const totalCreatives = await db.collection('creatives').countDocuments();
        console.log(`\n  📊 DB Totals After Restore:`);
        console.log(`     VideoProjects: ${totalVideos} (${storyboardVideos} storyboard)`);
        console.log(`     Creatives: ${totalCreatives}`);
    }

    console.log(`${'═'.repeat(70)}\n`);

    await mongoose.disconnect();
}

restore().catch(err => {
    console.error('❌ Restore failed:', err);
    process.exit(1);
});

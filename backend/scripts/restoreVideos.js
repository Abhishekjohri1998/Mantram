/**
 * Restore video projects by scanning S3 for existing video files
 * and reconstructing VideoProject documents from the S3 keys.
 * 
 * S3 key pattern: video-studio/{userId}/{projectId}/{filename}.mp4
 * Also checks: video-studio/... and videos/... prefixes
 * 
 * This script rebuilds the videoprojects collection from S3 inventory.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { S3Client, ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3';

dotenv.config();

const DRY_RUN = true; // Set to false to actually create documents

const s3 = new S3Client({
    region: process.env.AWS_REGION || 'ap-south-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
});

const BUCKET = process.env.AWS_S3_BUCKET || process.env.S3_BUCKET;
const VIDEO_PREFIXES = ['video-studio/', 'videos/', 'video/', 'ugc-pro/', 'storyboard/', 'agent-video/'];

async function listAllVideoObjects() {
    const allObjects = [];
    
    for (const prefix of VIDEO_PREFIXES) {
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
    }
    
    return allObjects;
}

async function restore() {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    
    console.log(`\n${'═'.repeat(65)}`);
    console.log(`  VIDEO PROJECT RECOVERY`);
    console.log(`  Mode: ${DRY_RUN ? '🔍 DRY RUN' : '🔧 LIVE RESTORE'}`);
    console.log(`  Bucket: ${BUCKET}`);
    console.log(`${'═'.repeat(65)}\n`);
    
    // Step 1: Get all users
    const users = await db.collection('users').find({}).project({ _id: 1, email: 1, name: 1 }).toArray();
    const userMap = {};
    users.forEach(u => { userMap[u._id.toString()] = u; });
    console.log(`👥 ${users.length} users in database\n`);
    
    // Step 2: Scan S3 for video files
    console.log('📂 Scanning S3 for video files...');
    const videoObjects = await listAllVideoObjects();
    console.log(`   Found ${videoObjects.length} video files in S3\n`);
    
    // Step 3: Group by user/project
    const projectMap = new Map();
    
    for (const obj of videoObjects) {
        const key = obj.Key;
        const size = obj.Size;
        const lastMod = obj.LastModified;
        
        // Try to extract user ID and project context from key
        // Common patterns: 
        //   video-studio/{userId}/{timestamp}-{filename}.mp4
        //   video-studio/{userId}/final/{projectId}.mp4
        //   videos/{userId}/{anything}.mp4
        const parts = key.split('/');
        
        let userId = null;
        let projectTitle = key;
        
        // Try to match userId from path segments (ObjectId pattern: 24 hex chars)
        for (const part of parts) {
            if (/^[0-9a-f]{24}$/.test(part)) {
                if (!userId) {
                    userId = part;
                } else {
                    // Second ObjectId might be projectId
                    projectTitle = `Restored: ${parts[parts.length - 1]}`;
                }
            }
        }
        
        if (!userId) {
            // Can't determine owner — log it
            console.log(`   ⚠️ Unknown owner for: ${key} (${(size/1024/1024).toFixed(1)} MB)`);
            continue;
        }
        
        if (!projectMap.has(key)) {
            projectMap.set(key, {
                userId,
                s3Key: key,
                s3Url: `https://${BUCKET}.s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${key}`,
                size,
                lastModified: lastMod,
                title: parts[parts.length - 1].replace(/\.\w+$/, '').replace(/[-_]/g, ' '),
            });
        }
    }
    
    // Step 4: Display findings
    console.log(`\n📊 Found ${projectMap.size} restorable video projects:\n`);
    
    const byUser = new Map();
    for (const [key, proj] of projectMap) {
        const userId = proj.userId;
        if (!byUser.has(userId)) byUser.set(userId, []);
        byUser.get(userId).push(proj);
    }
    
    let restoreCount = 0;
    for (const [userId, projects] of byUser) {
        const user = userMap[userId];
        console.log(`\n  👤 ${user?.email || 'DELETED USER'} (${userId}): ${projects.length} videos`);
        for (const p of projects.slice(0, 5)) {
            console.log(`     📹 ${p.title} (${(p.size/1024/1024).toFixed(1)} MB, ${p.lastModified?.toISOString().slice(0,10)})`);
            console.log(`        S3: ${p.s3Key}`);
        }
        if (projects.length > 5) console.log(`     ... and ${projects.length - 5} more`);
        
        if (user && !DRY_RUN) {
            // Create VideoProject documents for this user
            for (const p of projects) {
                try {
                    await db.collection('videoprojects').insertOne({
                        user: new mongoose.Types.ObjectId(userId),
                        title: p.title || 'Recovered Video',
                        status: 'completed',
                        mode: p.s3Key.includes('storyboard') ? 'storyboard' : 'advanced',
                        studioMode: p.s3Key.includes('ugc') ? 'ugc-pro' : (p.s3Key.includes('storyboard') ? 'storyboard' : 'advanced'),
                        finalVideoUrl: p.s3Url,
                        generation: {
                            s3VideoUrl: p.s3Url,
                            videoUrl: p.s3Url,
                            progress: 100,
                            status: 'COMPLETED',
                            completedAt: p.lastModified,
                        },
                        fileSizeMB: p.size / (1024 * 1024),
                        createdAt: p.lastModified,
                        updatedAt: p.lastModified,
                    });
                    restoreCount++;
                } catch (err) {
                    console.warn(`     ❌ Failed to restore ${p.s3Key}: ${err.message}`);
                }
            }
        }
    }
    
    console.log(`\n${'═'.repeat(65)}`);
    if (DRY_RUN) {
        console.log(`  🔍 DRY RUN — ${projectMap.size} videos found, 0 restored`);
        console.log(`  Set DRY_RUN = false to create VideoProject documents`);
    } else {
        console.log(`  ✅ Restored ${restoreCount} video projects`);
    }
    console.log(`${'═'.repeat(65)}\n`);
    
    await mongoose.disconnect();
}

restore().catch(console.error);

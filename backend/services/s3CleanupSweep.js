import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import Creative from '../models/Creative.js';
import Brand from '../models/Brand.js';
import config from '../config/env.js';

const s3 = new S3Client({
    region: config.aws.region,
    credentials: {
        accessKeyId: config.aws.accessKeyId,
        secretAccessKey: config.aws.secretAccessKey,
    },
});

export async function runS3CleanupSweep() {
    console.log('🧹 [S3Cleanup] Starting orphaned asset sweep...');
    const bucket = config.aws.bucket;
    
    // We only clean the specific paths where user generations live
    const PREFIXES = ['generations/', 'canvas-assets/'];
    let deletedCount = 0;
    const SEVEN_DAYS_AGO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    for (const prefix of PREFIXES) {
        let isTruncated = true;
        let continuationToken = undefined;

        while (isTruncated) {
            try {
                const command = new ListObjectsV2Command({
                    Bucket: bucket,
                    Prefix: prefix,
                    ContinuationToken: continuationToken,
                });

                const response = await s3.send(command);
                if (!response.Contents || response.Contents.length === 0) break;

                const objectsToDelete = [];

                for (const item of response.Contents) {
                    // Only process files older than 7 days
                    if (item.LastModified > SEVEN_DAYS_AGO) continue;

                    const objectKey = item.Key;
                    
                    // Check if this key exists in MongoDB
                    // This is a naive check; we look up the key in creatives.imageUrl/videoUrl
                    const creativeExists = await Creative.exists({ 
                        $or: [
                            { imageUrl: { $regex: objectKey } },
                            { videoUrl: { $regex: objectKey } }
                        ]
                    });

                    if (!creativeExists) {
                        objectsToDelete.push({ Key: objectKey });
                    }
                }

                if (objectsToDelete.length > 0) {
                    // Delete in batches of up to 1000
                    const deleteCmd = new DeleteObjectsCommand({
                        Bucket: bucket,
                        Delete: {
                            Objects: objectsToDelete,
                            Quiet: true,
                        }
                    });
                    await s3.send(deleteCmd);
                    deletedCount += objectsToDelete.length;
                    console.log(`🧹 [S3Cleanup] Deleted ${objectsToDelete.length} orphaned files from ${prefix}`);
                }

                isTruncated = response.IsTruncated;
                continuationToken = response.NextContinuationToken;
            } catch (err) {
                console.error(`❌ [S3Cleanup] Error sweeping prefix ${prefix}:`, err.message);
                break;
            }
        }
    }

    console.log(`✅ [S3Cleanup] Sweep complete. Removed ${deletedCount} orphaned assets.`);
}

export function startS3CleanupSweep() {
    const instanceId = process.env.NODE_APP_INSTANCE || '0';
    if (instanceId !== '0') {
        console.log(`🧹 [S3Cleanup] Skipped on worker ${instanceId} (runs on primary only)`);
        return;
    }

    // Run once a day at 3 AM
    const INTERVAL_MS = 24 * 60 * 60 * 1000;
    
    setTimeout(() => {
        runS3CleanupSweep().catch(err => console.error('[S3Cleanup] Failed:', err));
        setInterval(() => {
            runS3CleanupSweep().catch(err => console.error('[S3Cleanup] Failed:', err));
        }, INTERVAL_MS);
    }, 60 * 1000 * 5); // Start 5 minutes after boot
    
    console.log('🧹 S3 Cleanup Sweep active (primary worker) (Daily)');
}

export default { startS3CleanupSweep };

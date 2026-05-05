/**
 * S3 Lifecycle Configuration Script
 * 
 * Run once to set up lifecycle rules on the S3 bucket:
 *   node backend/scripts/s3Lifecycle.js
 *
 * Rules:
 *   1. video-studio/generations/ → Standard-IA after 30 days, Glacier IR after 90 days
 *   2. video-studio/temp/        → Delete after 7 days (failed/abandoned drafts)
 *   3. video-studio/references/  → Delete after 30 days (uploaded frame images)
 */

import { S3Client, PutBucketLifecycleConfigurationCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
dotenv.config({ path: new URL('../.env', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1') });

const client = new S3Client({
    region: process.env.AWS_REGION || 'ap-south-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

const lifecycleConfig = {
    Rules: [
        {
            ID: 'video-generations-ia-transition',
            Status: 'Enabled',
            Filter: { Prefix: 'video-studio/generations/' },
            Transitions: [
                { Days: 30, StorageClass: 'STANDARD_IA' },
                { Days: 90, StorageClass: 'GLACIER_IR' },
            ],
        },
        {
            ID: 'video-temp-cleanup',
            Status: 'Enabled',
            Filter: { Prefix: 'video-studio/temp/' },
            Expiration: { Days: 7 },
        },
        {
            ID: 'video-references-cleanup',
            Status: 'Enabled',
            Filter: { Prefix: 'video-studio/references/' },
            Expiration: { Days: 30 },
        },
    ],
};

async function applyLifecycle() {
    const bucket = process.env.AWS_BUCKET || process.env.S3_BUCKET;
    if (!bucket) {
        console.error('❌ AWS_BUCKET / S3_BUCKET not set in .env');
        process.exit(1);
    }
    console.log(`📦 Applying lifecycle rules to bucket: ${bucket}...`);
    await client.send(new PutBucketLifecycleConfigurationCommand({
        Bucket: bucket,
        LifecycleConfiguration: lifecycleConfig,
    }));
    console.log('✅ S3 lifecycle rules applied successfully:');
    console.log('   • video-studio/generations/ → Standard-IA (30d), Glacier IR (90d)');
    console.log('   • video-studio/temp/        → Auto-delete (7d)');
    console.log('   • video-studio/references/  → Auto-delete (30d)');
}

applyLifecycle().catch((err) => {
    console.error('❌ Failed to apply lifecycle rules:', err.message);
    process.exit(1);
});

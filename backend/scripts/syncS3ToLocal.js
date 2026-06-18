import { ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { s3Client } from "../utils/s3.js";
import config from "../config/env.js";
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { finished } from "stream/promises";

const LOCAL_SSD_PATH = config.localSsdPath;
const BUCKET = config.aws.bucket;

if (!LOCAL_SSD_PATH) {
    console.error("❌ LOCAL_SSD_PATH is not configured in .env!");
    process.exit(1);
}

if (!BUCKET) {
    console.error("❌ AWS S3 bucket name is not configured in .env!");
    process.exit(1);
}

// Subfolder for media files
const mediaBackupDir = path.join(LOCAL_SSD_PATH, "media");

async function downloadFile(key, size) {
    const localFilePath = path.join(mediaBackupDir, key);
    
    // Check if file already exists locally
    if (fs.existsSync(localFilePath)) {
        const stats = fs.statSync(localFilePath);
        if (stats.size === size) {
            // Already downloaded and same size
            return { skipped: true };
        }
        console.log(`🔄 File size mismatch for ${key}. Local: ${stats.size}, S3: ${size}. Redownloading...`);
    }

    // Ensure parent directories exist
    fs.mkdirSync(path.dirname(localFilePath), { recursive: true });

    try {
        const command = new GetObjectCommand({
            Bucket: BUCKET,
            Key: key,
        });

        const response = await s3Client.send(command);
        const writeStream = fs.createWriteStream(localFilePath);
        
        if (response.Body instanceof Readable) {
            await finished(response.Body.pipe(writeStream));
        } else {
            // Under some environments it might be Web Stream (ReadableStream)
            const reader = response.Body.getReader();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                writeStream.write(Buffer.from(value));
            }
            writeStream.end();
        }
        
        console.log(`✅ Downloaded: ${key} -> ${localFilePath}`);
        return { downloaded: true };
    } catch (err) {
        console.error(`❌ Failed to download ${key}:`, err.message);
        return { failed: true };
    }
}

export async function syncS3ToLocal() {
    console.log(`🎬 Starting S3 Sync: Bucket "${BUCKET}" -> Local "${mediaBackupDir}"`);
    
    // Ensure media folder exists
    fs.mkdirSync(mediaBackupDir, { recursive: true });

    let isTruncated = true;
    let nextContinuationToken = undefined;
    let totalFiles = 0;
    let downloadedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    try {
        while (isTruncated) {
            const command = new ListObjectsV2Command({
                Bucket: BUCKET,
                ContinuationToken: nextContinuationToken,
            });

            const response = await s3Client.send(command);
            const contents = response.Contents || [];

            for (const object of contents) {
                const key = object.Key;
                const size = object.Size;
                
                // Skip folder placeholders (keys ending in '/')
                if (key.endsWith('/')) continue;

                totalFiles++;
                const result = await downloadFile(key, size);
                if (result.downloaded) downloadedCount++;
                if (result.skipped) skippedCount++;
                if (result.failed) failedCount++;
            }

            isTruncated = response.IsTruncated;
            nextContinuationToken = response.NextContinuationToken;
        }

        console.log(`\n🎉 S3 Sync Completed!`);
        console.log(`📊 Total S3 Files Checked: ${totalFiles}`);
        console.log(`✅ Downloaded: ${downloadedCount}`);
        console.log(`⏭️ Skipped (Existing): ${skippedCount}`);
        if (failedCount > 0) {
            console.warn(`⚠️ Failed Downloads: ${failedCount}`);
        }
    } catch (err) {
        console.error("❌ S3 Sync error:", err);
    }
}

import { fileURLToPath } from "url";

// Run script if called directly
const nodePath = fileURLToPath(import.meta.url);
if (nodePath === path.resolve(process.argv[1])) {
    syncS3ToLocal()
        .then(() => process.exit(0))
        .catch((err) => {
            console.error(err);
            process.exit(1);
        });
}

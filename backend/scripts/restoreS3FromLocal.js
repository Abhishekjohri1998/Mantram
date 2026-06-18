import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { s3Client, uploadToS3 } from "../utils/s3.js";
import config from "../config/env.js";
import fs from "fs";
import path from "path";

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

const mediaBackupDir = path.join(LOCAL_SSD_PATH, "media");

function getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
        case '.jpg':
        case '.jpeg': return 'image/jpeg';
        case '.png': return 'image/png';
        case '.gif': return 'image/gif';
        case '.webp': return 'image/webp';
        case '.mp4': return 'video/mp4';
        case '.webm': return 'video/webm';
        case '.pdf': return 'application/pdf';
        case '.json': return 'application/json';
        case '.mp3': return 'audio/mpeg';
        case '.wav': return 'audio/wav';
        default: return 'application/octet-stream';
    }
}

// Recursively find all files in a folder
function walkDir(dir, fileList = []) {
    if (!fs.existsSync(dir)) return fileList;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            walkDir(filePath, fileList);
        } else {
            fileList.push(filePath);
        }
    }
    return fileList;
}

async function getS3Keys() {
    const s3Keys = new Set();
    let isTruncated = true;
    let nextContinuationToken = undefined;

    console.log("🔍 Fetching existing file list from S3...");
    try {
        while (isTruncated) {
            const command = new ListObjectsV2Command({
                Bucket: BUCKET,
                ContinuationToken: nextContinuationToken,
            });

            const response = await s3Client.send(command);
            const contents = response.Contents || [];

            for (const object of contents) {
                if (object.Key && !object.Key.endsWith('/')) {
                    s3Keys.add(object.Key);
                }
            }

            isTruncated = response.IsTruncated;
            nextContinuationToken = response.NextContinuationToken;
        }
        console.log(`📊 Found ${s3Keys.size} files in S3.`);
    } catch (err) {
        console.warn("⚠️ Failed to list S3 objects. Restoring by attempting to upload all files (slow).", err.message);
        return null; // Return null to indicate fallback behavior
    }

    return s3Keys;
}

export async function restoreS3() {
    console.log(`🎬 Starting S3 Restore: Local "${mediaBackupDir}" -> S3 Bucket "${BUCKET}"`);

    if (!fs.existsSync(mediaBackupDir)) {
        console.error(`❌ Local media backup directory does not exist: ${mediaBackupDir}`);
        return;
    }

    // Get all local files
    const localFiles = walkDir(mediaBackupDir);
    console.log(`📂 Found ${localFiles.length} local files in backup.`);

    if (localFiles.length === 0) {
        console.log("ℹ️ No local files to restore.");
        return;
    }

    // Get existing S3 files to prevent duplication
    const s3Keys = await getS3Keys();

    let uploadedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const localFilePath of localFiles) {
        // Calculate S3 key relative to media backup directory
        let relativeKey = path.relative(mediaBackupDir, localFilePath);
        
        // S3 keys must use forward slashes even on Windows
        relativeKey = relativeKey.replace(/\\/g, '/');

        // Check if file already exists in S3
        if (s3Keys && s3Keys.has(relativeKey)) {
            skippedCount++;
            continue;
        }

        try {
            console.log(`📤 Uploading: ${relativeKey}...`);
            const buffer = fs.readFileSync(localFilePath);
            const mimeType = getMimeType(localFilePath);

            await uploadToS3(buffer, relativeKey, mimeType);
            uploadedCount++;
        } catch (err) {
            console.error(`❌ Failed to upload ${relativeKey}:`, err.message);
            failedCount++;
        }
    }

    console.log(`\n🎉 S3 Restore Completed!`);
    console.log(`📊 Total Local Files: ${localFiles.length}`);
    console.log(`✅ Uploaded: ${uploadedCount}`);
    console.log(`⏭️ Skipped (Already in S3): ${skippedCount}`);
    if (failedCount > 0) {
        console.error(`❌ Failed Uploads: ${failedCount}`);
    }
}

import { fileURLToPath } from "url";

// Run script if called directly
const nodePath = fileURLToPath(import.meta.url);
if (nodePath === path.resolve(process.argv[1])) {
    restoreS3()
        .then(() => process.exit(0))
        .catch((err) => {
            console.error(err);
            process.exit(1);
        });
}

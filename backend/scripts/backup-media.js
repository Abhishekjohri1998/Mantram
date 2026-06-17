import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import config from '../config/env.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Concurrency limit for downloads
const DOWNLOAD_CONCURRENCY = 15;
const REQUEST_TIMEOUT_MS = 10000; // 10 seconds timeout

async function runBackup() {
    console.log('🚀 Starting Mantram AI Database Media Recovery & Local SSD Backup');
    console.log('─────────────────────────────────────────────────────────────────');

    // 1. Check SSD configuration
    const localSsdPath = config.localSsdPath;
    if (!localSsdPath) {
        console.error('❌ Error: LOCAL_SSD_PATH is not configured in your .env file!');
        console.error('Please configure it first (e.g. LOCAL_SSD_PATH=d:/mantram-media-backup)');
        process.exit(1);
    }
    
    console.log(`📂 Destination Local SSD Backup Path: ${localSsdPath}`);
    if (!fs.existsSync(localSsdPath)) {
        console.log(`📂 Directory does not exist. Creating local backup folder...`);
        fs.mkdirSync(localSsdPath, { recursive: true });
    }

    // 2. Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    const conn = await connectDB();
    if (!conn) {
        console.error('❌ Failed to connect to MongoDB. Exiting.');
        process.exit(1);
    }
    
    const db = mongoose.connection.db;
    const collectionsInfo = await db.listCollections().toArray();
    const collectionNames = collectionsInfo.map(c => c.name);
    console.log(`✅ Connected successfully! Found ${collectionNames.length} collections.`);

    // 3. Scan database for Media URLs
    console.log('\n🔍 Scanning all collections for media URLs (this may take a moment)...');
    const mediaUrls = new Set();
    let totalDocsScanned = 0;

    const findUrlsInValue = (val) => {
        if (!val) return;
        if (typeof val === 'string') {
            const valTrimmed = val.trim();
            const valLower = valTrimmed.toLowerCase();
            
            // Check if string is an HTTP/HTTPS URL
            if (valTrimmed.startsWith('http://') || valTrimmed.startsWith('https://')) {
                const hasMediaExtension = ['.png', '.jpg', '.jpeg', '.gif', '.mp4', '.mov', '.webm', '.webp', '.m4a', '.mp3'].some(ext => valLower.includes(ext));
                const isS3OrCloudFront = valLower.includes('amazonaws.com') || valLower.includes('cloudfront.net') || valLower.includes('mantram-assets');
                const isProviderUrl = [
                    'fal.media', 'fal.run', 'openai.com', 'laozhang.ai', 
                    'r2cdn.copilotbase.com', 'replicate.delivery', 'piapi.ai', 
                    'muapi.ai', 'kling.ai', 'seedance.ai', 'heygen.com', 
                    'modelslab.com', 'atlascloud.ai', 'cdn.midjourney.com'
                ].some(domain => valLower.includes(domain));
                
                if (hasMediaExtension || isS3OrCloudFront || isProviderUrl) {
                    mediaUrls.add(valTrimmed);
                }
            }
        } else if (Array.isArray(val)) {
            for (const item of val) {
                findUrlsInValue(item);
            }
        } else if (typeof val === 'object' && val !== null && !Buffer.isBuffer(val)) {
            for (const key of Object.keys(val)) {
                findUrlsInValue(val[key]);
            }
        }
    };

    for (const collName of collectionNames) {
        process.stdout.write(`   Scanning ${collName}... `);
        let collDocsCount = 0;
        const cursor = db.collection(collName).find({});
        
        while (await cursor.hasNext()) {
            const doc = await cursor.next();
            findUrlsInValue(doc);
            collDocsCount++;
            totalDocsScanned++;
        }
        console.log(`done (${collDocsCount} docs scanned)`);
    }

    const urlsArray = Array.from(mediaUrls);
    console.log(`\n✅ Scan complete!`);
    console.log(`   Scanned Collections : ${collectionNames.length}`);
    console.log(`   Scanned Documents   : ${totalDocsScanned}`);
    console.log(`   Unique Media URLs   : ${urlsArray.length}`);

    if (urlsArray.length === 0) {
        console.log('No media URLs found in database. Exiting.');
        await mongoose.connection.close();
        process.exit(0);
    }

    // 4. Download media assets to the local SSD path
    console.log(`\n📥 Downloading media assets using ${DOWNLOAD_CONCURRENCY} concurrent workers...`);
    console.log('─────────────────────────────────────────────────────────────────');

    let processedCount = 0;
    let successCount = 0;
    let failCount = 0;
    let skipCount = 0;
    const failures = [];

    const getLocalDestPath = (url) => {
        try {
            const urlObj = new URL(url);
            let relativePath = '';

            if (urlObj.hostname.includes('amazonaws.com')) {
                // AWS S3 bucket mapping
                const hostParts = urlObj.hostname.split('.');
                // Check if virtual-hosted style (e.g., bucket.s3.ap-south-1.amazonaws.com)
                if (hostParts.length > 3 && (hostParts[1] === 's3' || hostParts[2] === 's3')) {
                    const bucket = hostParts[0];
                    relativePath = path.join(bucket, urlObj.pathname);
                } else {
                    // Path style (e.g. s3.ap-south-1.amazonaws.com/bucket/key)
                    relativePath = urlObj.pathname;
                }
            } else if (urlObj.hostname.includes('cloudfront.net')) {
                // CloudFront CDN mapping
                relativePath = path.join('cloudfront', urlObj.hostname, urlObj.pathname);
            } else if (urlObj.hostname.includes('mantram-assets')) {
                // Legacy assets custom bucket naming
                relativePath = path.join('mantram-assets', urlObj.pathname);
            } else {
                // Fallbacks and external providers (Catbox, Fal.ai, etc.)
                relativePath = path.join(urlObj.hostname, urlObj.pathname);
            }

            // Clean up relative path formatting
            try {
                relativePath = decodeURIComponent(relativePath);
            } catch (e) {}

            relativePath = relativePath.replace(/^[\\\/]+/, ''); // remove leading slashes
            relativePath = relativePath.replace(/\.\./g, '');    // prevent path traversal
            relativePath = relativePath.replace(/\/+/g, '/');    // clean double slashes

            return path.join(localSsdPath, relativePath);
        } catch (err) {
            return null;
        }
    };

    const downloadWorker = async () => {
        while (true) {
            // Pick next URL atomically
            const currentIdx = processedCount++;
            if (currentIdx >= urlsArray.length) break;

            const url = urlsArray[currentIdx];
            const destPath = getLocalDestPath(url);

            if (!destPath) {
                failCount++;
                failures.push({ url, reason: 'Invalid URL formatting' });
                continue;
            }

            // Check if file already exists locally
            if (fs.existsSync(destPath) && fs.statSync(destPath).size > 0) {
                skipCount++;
                continue;
            }

            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

                const response = await fetch(url, {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);

                if (response.ok) {
                    const arrayBuffer = await response.arrayBuffer();
                    const buffer = Buffer.from(arrayBuffer);

                    // Ensure target folder exists
                    fs.mkdirSync(path.dirname(destPath), { recursive: true });
                    fs.writeFileSync(destPath, buffer);
                    
                    successCount++;
                } else {
                    failCount++;
                    failures.push({ url, reason: `HTTP Status ${response.status}` });
                }
            } catch (err) {
                failCount++;
                failures.push({ url, reason: err.message || 'Fetch failed' });
            }

            // Print progress every 100 items
            const totalDone = successCount + failCount + skipCount;
            if (totalDone % 100 === 0 || totalDone === urlsArray.length) {
                console.log(`📊 Progress: ${totalDone}/${urlsArray.length} processed | Success: ${successCount} | Skipped: ${skipCount} | Failed: ${failCount}`);
            }
        }
    };

    // Spawn concurrent workers
    const workers = [];
    for (let i = 0; i < DOWNLOAD_CONCURRENCY; i++) {
        workers.push(downloadWorker());
    }
    await Promise.all(workers);

    // Write final failures report JSON
    const reportPath = path.join(localSsdPath, 'recovery-report.json');
    const reportData = {
        scanTimestamp: new Date().toISOString(),
        totalScannedDocs: totalDocsScanned,
        totalUniqueUrls: urlsArray.length,
        downloadedCount: successCount,
        skippedCount: skipCount,
        failedCount: failCount,
        failedItems: failures
    };
    fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));

    console.log('\n─────────────────────────────────────────────────────────────────');
    console.log('🏁 Recovery & Backup Completed!');
    console.log(`   Downloaded successfully : ${successCount}`);
    console.log(`   Skipped (already exists): ${skipCount}`);
    console.log(`   Failed to download      : ${failCount}`);
    console.log(`   Failures details written to recovery-report.json`);
    console.log(`   Local storage summary updated!`);
    console.log('─────────────────────────────────────────────────────────────────\n');

    await mongoose.connection.close();
    console.log('🔌 Database connection closed.');
    process.exit(0);
}

runBackup().catch(async (err) => {
    console.error('🚨 Critical execution error:', err);
    try {
        await mongoose.connection.close();
    } catch (e) {}
    process.exit(1);
});

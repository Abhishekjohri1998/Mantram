/**
 * MEDIA LINK AUDIT — Mantram AI
 * 
 * READ-ONLY: This script does NOT modify any data.
 * 
 * What it does:
 *   1. Counts documents in every media-related collection
 *   2. Checks how many have empty/missing URL fields
 *   3. Samples a few URLs and tests accessibility via HEAD requests
 *   4. Counts S3 objects per prefix in the bucket
 *   5. Compares S3 counts vs. MongoDB counts to identify gaps
 * 
 * Run: cd backend && node scripts/auditMediaLinks.js
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
const REGION = process.env.AWS_REGION || 'ap-south-1';

// ── S3 Helpers ───────────────────────────────────────────────────────────────

async function countS3Objects(prefix, extensions = null) {
    let count = 0;
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
            const objects = resp.Contents || [];
            if (extensions) {
                count += objects.filter(o => extensions.some(ext => o.Key.endsWith(ext))).length;
            } else {
                count += objects.length;
            }
            continuationToken = resp.IsTruncated ? resp.NextContinuationToken : null;
        } catch (err) {
            console.warn(`  ⚠️ Could not list prefix "${prefix}":`, err.message);
            break;
        }
    } while (continuationToken);
    return count;
}

// Test if a URL is accessible
async function testUrl(url) {
    if (!url || typeof url !== 'string' || !url.startsWith('http')) return { status: 'empty', ok: false };
    try {
        const resp = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(5000) });
        return { status: resp.status, ok: resp.ok };
    } catch (e) {
        return { status: e.message, ok: false };
    }
}

// ── MongoDB Audit Helpers ────────────────────────────────────────────────────

async function auditCollection(db, collectionName, urlFields, label) {
    const coll = db.collection(collectionName);
    const total = await coll.countDocuments();
    if (total === 0) {
        console.log(`  📦 ${label.padEnd(24)} Total: 0 — EMPTY COLLECTION`);
        return { label, total, missing: 0, populated: 0, sampleResults: [] };
    }

    // Count docs with empty/missing primary URL field
    const primaryField = urlFields[0];
    let missingCount = 0;
    let populatedCount = 0;

    // Build the "missing" query — field is null, empty string, or doesn't exist
    const missingQuery = {
        $or: [
            { [primaryField]: { $exists: false } },
            { [primaryField]: null },
            { [primaryField]: '' },
        ]
    };

    missingCount = await coll.countDocuments(missingQuery);
    populatedCount = total - missingCount;

    // Sample up to 3 docs with populated URLs and test them
    const sampleResults = [];
    const samples = await coll.find({ [primaryField]: { $exists: true, $ne: null, $ne: '' } })
        .project({ [primaryField]: 1 })
        .limit(3)
        .toArray();

    for (const doc of samples) {
        const url = getNestedValue(doc, primaryField);
        if (url && typeof url === 'string' && url.startsWith('http')) {
            const result = await testUrl(url);
            sampleResults.push({ url: url.substring(0, 80), ...result });
        }
    }

    const missingPct = total > 0 ? Math.round((missingCount / total) * 100) : 0;
    const icon = missingPct > 50 ? '🔴' : missingPct > 10 ? '🟡' : '🟢';

    console.log(`  ${icon} ${label.padEnd(24)} Total: ${String(total).padStart(5)} | With URL: ${String(populatedCount).padStart(5)} | Missing: ${String(missingCount).padStart(5)} (${missingPct}%)`);

    if (sampleResults.length > 0) {
        for (const s of sampleResults) {
            const statusIcon = s.ok ? '✅' : '❌';
            console.log(`     ${statusIcon} ${s.status} — ${s.url}...`);
        }
    }

    return { label, total, missing: missingCount, populated: populatedCount, sampleResults };
}

function getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
}

// ── Main Audit ───────────────────────────────────────────────────────────────

async function audit() {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;

    console.log(`\n${'═'.repeat(70)}`);
    console.log(`  MANTRAM AI — MEDIA LINK AUDIT`);
    console.log(`  Bucket: ${BUCKET}`);
    console.log(`  Region: ${REGION}`);
    console.log(`  Time:   ${new Date().toISOString()}`);
    console.log(`${'═'.repeat(70)}\n`);

    // ═══ SECTION 1: MongoDB Collection Audit ═══
    console.log(`${'─'.repeat(70)}`);
    console.log(`  SECTION 1 — MongoDB Collections (URL Field Health)`);
    console.log(`${'─'.repeat(70)}`);

    const results = [];

    results.push(await auditCollection(db, 'videoprojects', ['finalVideoUrl', 'generation.s3VideoUrl'], 'VideoProjects'));
    results.push(await auditCollection(db, 'creatives', ['imageUrl'], 'Creatives'));
    results.push(await auditCollection(db, 'avatars', ['imageUrl'], 'Avatars'));
    results.push(await auditCollection(db, 'brands', ['dna.logo.url'], 'Brands (logo)'));
    results.push(await auditCollection(db, 'templates', ['previewUrl'], 'Templates'));
    results.push(await auditCollection(db, 'brandkitassets', ['status'], 'BrandKitAssets'));
    results.push(await auditCollection(db, 'socialposts', ['imageUrl'], 'SocialPosts'));
    results.push(await auditCollection(db, 'contents', ['blogMeta.heroImageUrl'], 'Contents (blog)'));
    results.push(await auditCollection(db, 'thumbnailtemplate', ['previewUrl'], 'ThumbnailTemplates'));
    results.push(await auditCollection(db, 'generationjobs', ['imageUrl'], 'GenerationJobs'));

    // Also check products images array
    const productsColl = db.collection('products');
    const totalProducts = await productsColl.countDocuments();
    const productsWithImages = await productsColl.countDocuments({ 'images.0': { $exists: true } });
    const productsNoImages = totalProducts - productsWithImages;
    const pctNoImages = totalProducts > 0 ? Math.round((productsNoImages / totalProducts) * 100) : 0;
    const pIcon = pctNoImages > 50 ? '🔴' : pctNoImages > 10 ? '🟡' : '🟢';
    console.log(`  ${pIcon} ${'Products (images[])'.padEnd(24)} Total: ${String(totalProducts).padStart(5)} | With images: ${String(productsWithImages).padStart(5)} | No images: ${String(productsNoImages).padStart(5)} (${pctNoImages}%)`);

    // Check brands for brandImages
    const brandsColl = db.collection('brands');
    const totalBrands = await brandsColl.countDocuments();
    const brandsWithImages = await brandsColl.countDocuments({ 'dna.brandImages.0': { $exists: true } });
    const brandsNoImages = totalBrands - brandsWithImages;
    console.log(`  ${'Brands (brandImages[])'.padEnd(27)} Total: ${String(totalBrands).padStart(5)} | With images: ${String(brandsWithImages).padStart(5)} | No images: ${String(brandsNoImages).padStart(5)}`);

    // ═══ SECTION 2: S3 Bucket Object Counts ═══
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`  SECTION 2 — S3 Bucket Object Counts`);
    console.log(`${'─'.repeat(70)}`);

    const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'];
    const VIDEO_EXTS = ['.mp4', '.webm', '.mov'];
    const ALL_MEDIA = [...IMAGE_EXTS, ...VIDEO_EXTS];

    const s3Prefixes = [
        // Video prefixes
        { prefix: 'videos/', type: 'video', exts: VIDEO_EXTS },
        { prefix: 'video-studio/', type: 'video', exts: VIDEO_EXTS },
        { prefix: 'storyboard/', type: 'video', exts: ALL_MEDIA },
        { prefix: 'compiled-video/', type: 'video', exts: VIDEO_EXTS },
        { prefix: 'qads/', type: 'video', exts: VIDEO_EXTS },
        { prefix: 'ugc-pro/', type: 'mixed', exts: ALL_MEDIA },
        { prefix: 'motion-graphics/', type: 'video', exts: VIDEO_EXTS },
        // Image prefixes
        { prefix: 'creatives/', type: 'image', exts: IMAGE_EXTS },
        { prefix: 'studio/', type: 'image', exts: IMAGE_EXTS },
        { prefix: 'avatars/', type: 'image', exts: IMAGE_EXTS },
        { prefix: 'avatar-studio/', type: 'image', exts: IMAGE_EXTS },
        { prefix: 'products/', type: 'image', exts: IMAGE_EXTS },
        { prefix: 'product-library/', type: 'image', exts: IMAGE_EXTS },
        { prefix: 'brands/', type: 'image', exts: IMAGE_EXTS },
        { prefix: 'brand-kit/', type: 'image', exts: IMAGE_EXTS },
        { prefix: 'templates/', type: 'image', exts: IMAGE_EXTS },
        { prefix: 'template-fields/', type: 'image', exts: IMAGE_EXTS },
        { prefix: 'social-posts/', type: 'image', exts: IMAGE_EXTS },
        { prefix: 'social-scheduled/', type: 'image', exts: ALL_MEDIA },
        { prefix: 'blog-images/', type: 'image', exts: IMAGE_EXTS },
        { prefix: 'youtube-thumbnails/', type: 'image', exts: IMAGE_EXTS },
        { prefix: 'campaign-shot/', type: 'image', exts: IMAGE_EXTS },
        { prefix: 'campaign-shots/', type: 'image', exts: IMAGE_EXTS },
        { prefix: 'canvas/', type: 'image', exts: IMAGE_EXTS },
        { prefix: 'canvas-exports/', type: 'image', exts: IMAGE_EXTS },
        { prefix: 'canvas-layers/', type: 'image', exts: IMAGE_EXTS },
        { prefix: 'canvas-refs/', type: 'image', exts: IMAGE_EXTS },
        { prefix: 'carousel-themes/', type: 'image', exts: IMAGE_EXTS },
        { prefix: 'carousels/', type: 'image', exts: IMAGE_EXTS },
        { prefix: 'mockups/', type: 'image', exts: IMAGE_EXTS },
        { prefix: 'edits/', type: 'image', exts: IMAGE_EXTS },
        { prefix: 'refs/', type: 'image', exts: IMAGE_EXTS },
        { prefix: 'skill-refs/', type: 'image', exts: IMAGE_EXTS },
        { prefix: 'uploads/', type: 'image', exts: ALL_MEDIA },
        { prefix: 'user-uploads/', type: 'image', exts: ALL_MEDIA },
        { prefix: 'upscaled/', type: 'image', exts: IMAGE_EXTS },
        { prefix: 'reverse-prompt/', type: 'image', exts: IMAGE_EXTS },
        { prefix: 'virality-uploads/', type: 'image', exts: ALL_MEDIA },
        { prefix: 'pulse-studio/', type: 'image', exts: IMAGE_EXTS },
        { prefix: 'yt-logos/', type: 'image', exts: IMAGE_EXTS },
        { prefix: 'yt-studio/', type: 'image', exts: ALL_MEDIA },
        { prefix: 'ugc-enhance/', type: 'video', exts: VIDEO_EXTS },
        { prefix: 'ugc-previews/', type: 'video', exts: VIDEO_EXTS },
        { prefix: 'voiceover-preview/', type: 'audio', exts: ['.mp3', '.wav', '.ogg'] },
        { prefix: 'canvas-voiceover/', type: 'audio', exts: ['.mp3', '.wav', '.ogg'] },
        { prefix: 'agent-audio/', type: 'audio', exts: ['.mp3', '.wav', '.ogg'] },
        { prefix: 'vto/', type: 'image', exts: IMAGE_EXTS },
        { prefix: 'test/', type: 'mixed', exts: ALL_MEDIA },
    ];

    let totalS3Objects = 0;
    const s3Results = [];

    for (const { prefix, type, exts } of s3Prefixes) {
        const count = await countS3Objects(prefix, exts);
        totalS3Objects += count;
        if (count > 0) {
            console.log(`  📂 ${prefix.padEnd(28)} ${String(count).padStart(5)} ${type} files`);
        }
        s3Results.push({ prefix, type, count });
    }
    console.log(`\n  📊 Total media files in S3: ${totalS3Objects}`);

    // ═══ SECTION 3: Gap Analysis ═══
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`  SECTION 3 — Gap Analysis (S3 vs MongoDB)`);
    console.log(`${'─'.repeat(70)}`);

    // Video gap
    const s3Videos = s3Results.filter(r => r.type === 'video' || r.type === 'mixed').reduce((sum, r) => sum + r.count, 0);
    const dbVideoTotal = results.find(r => r.label === 'VideoProjects')?.total || 0;
    const dbVideoPopulated = results.find(r => r.label === 'VideoProjects')?.populated || 0;
    console.log(`  🎬 Videos:   S3 has ~${s3Videos} files | DB has ${dbVideoTotal} docs (${dbVideoPopulated} with URLs)`);
    if (s3Videos > dbVideoTotal) {
        console.log(`     → ${s3Videos - dbVideoTotal} videos in S3 are NOT in the database`);
    }

    // Creative gap
    const s3Creatives = s3Results.filter(r =>
        ['creatives/', 'studio/', 'campaign-shot/', 'campaign-shots/', 'mockups/', 'canvas-exports/', 'edits/'].includes(r.prefix)
    ).reduce((sum, r) => sum + r.count, 0);
    const dbCreativeTotal = results.find(r => r.label === 'Creatives')?.total || 0;
    console.log(`  🎨 Creatives: S3 has ~${s3Creatives} files | DB has ${dbCreativeTotal} docs`);

    // Avatar gap
    const s3Avatars = s3Results.filter(r =>
        ['avatars/', 'avatar-studio/'].includes(r.prefix)
    ).reduce((sum, r) => sum + r.count, 0);
    const dbAvatarTotal = results.find(r => r.label === 'Avatars')?.total || 0;
    console.log(`  👤 Avatars:   S3 has ~${s3Avatars} files | DB has ${dbAvatarTotal} docs`);

    // Product images gap
    const s3Products = s3Results.filter(r =>
        ['products/', 'product-library/'].includes(r.prefix)
    ).reduce((sum, r) => sum + r.count, 0);
    console.log(`  📦 Products:  S3 has ~${s3Products} image files | DB has ${productsWithImages} products with images`);

    // Brand logo gap
    const s3Brands = s3Results.filter(r => r.prefix === 'brands/').reduce((sum, r) => sum + r.count, 0);
    console.log(`  🏢 Brands:    S3 has ~${s3Brands} brand files | DB has ${totalBrands} brands`);

    // Template gap
    const s3Templates = s3Results.filter(r =>
        ['templates/', 'template-fields/'].includes(r.prefix)
    ).reduce((sum, r) => sum + r.count, 0);
    const dbTemplateTotal = results.find(r => r.label === 'Templates')?.total || 0;
    console.log(`  📐 Templates: S3 has ~${s3Templates} files | DB has ${dbTemplateTotal} docs`);

    // ═══ SUMMARY ═══
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`  AUDIT SUMMARY`);
    console.log(`${'═'.repeat(70)}`);

    const criticalIssues = results.filter(r => r.total > 0 && (r.missing / r.total) > 0.5);
    const warnings = results.filter(r => r.total > 0 && (r.missing / r.total) > 0.1 && (r.missing / r.total) <= 0.5);

    if (criticalIssues.length > 0) {
        console.log(`\n  🔴 CRITICAL (>50% missing URLs):`);
        for (const r of criticalIssues) {
            console.log(`     - ${r.label}: ${r.missing}/${r.total} documents have no URL`);
        }
    }
    if (warnings.length > 0) {
        console.log(`\n  🟡 WARNINGS (>10% missing URLs):`);
        for (const r of warnings) {
            console.log(`     - ${r.label}: ${r.missing}/${r.total} documents have no URL`);
        }
    }
    if (criticalIssues.length === 0 && warnings.length === 0) {
        console.log(`\n  🟢 All collections appear healthy!`);
    }

    console.log(`\n  Total S3 media files: ${totalS3Objects}`);
    console.log(`${'═'.repeat(70)}\n`);

    await mongoose.disconnect();
}

audit().catch(err => {
    console.error('❌ Audit failed:', err);
    process.exit(1);
});

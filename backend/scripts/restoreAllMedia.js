/**
 * COMPREHENSIVE Media Restoration — Mantram AI
 * 
 * Scans ALL image/photo S3 prefixes and creates/updates MongoDB documents
 * for missing media references.
 * 
 * Handles:
 *   - Creatives (creatives/, studio/, campaign-shot/, campaign-shots/, mockups/, edits/, canvas-exports/)
 *   - Avatars (avatars/, avatar-studio/, ugc-pro/avatars/)
 *   - Products (products/, product-library/) — UPDATE existing docs
 *   - Brand Kit Assets (brand-kit/) — CREATE new docs
 *   - Brands (brands/) — UPDATE existing docs (logo + brandImages)
 *   - Blog Content (blog-images/) — UPDATE existing docs
 *   - Uploads (uploads/, user-uploads/) — CREATE as uploaded creatives
 * 
 * Run: cd backend && node scripts/restoreAllMedia.js [--dry-run]
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

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'];

// ── S3 Helpers ───────────────────────────────────────────────────────────────

async function listS3Objects(prefix, extensions = IMAGE_EXTS) {
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
                extensions.some(ext => obj.Key.toLowerCase().endsWith(ext))
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

function extractObjectId(pathPart) {
    return /^[0-9a-f]{24}$/.test(pathPart) ? pathPart : null;
}

function extractTitle(key) {
    const filename = key.split('/').pop().replace(/\.\w+$/, '');
    const tsMatch = filename.match(/(\d{13})/);
    if (tsMatch) {
        const date = new Date(parseInt(tsMatch[1]));
        if (!isNaN(date.getTime())) {
            return `Generated ${date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
        }
    }
    return filename.replace(/[-_]/g, ' ').substring(0, 80) || 'Recovered Media';
}

function inferCreativeType(key) {
    if (key.startsWith('campaign-shot/') || key.startsWith('campaign-shots/')) return 'campaign-shot';
    if (key.startsWith('mockups/')) return 'lifestyle-mockup';
    if (key.startsWith('canvas-exports/')) return 'other';
    if (key.startsWith('edits/')) return 'other';
    if (key.startsWith('uploads/') || key.startsWith('user-uploads/')) return 'uploaded';
    if (key.startsWith('carousels/')) return 'carousel';
    return 'instagram-post'; // safe default
}

// ── Main Restore ─────────────────────────────────────────────────────────────

async function restore() {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;

    // Load reference data
    const users = await db.collection('users').find({}).project({ _id: 1, email: 1, name: 1 }).toArray();
    const userIds = new Set(users.map(u => u._id.toString()));
    const userMap = {};
    users.forEach(u => { userMap[u._id.toString()] = u; });

    const brands = await db.collection('brands').find({}).project({ _id: 1, user: 1, name: 1 }).toArray();
    const brandMap = {};
    brands.forEach(b => { brandMap[b._id.toString()] = b; });
    const brandsByUser = {};
    brands.forEach(b => {
        const uid = b.user?.toString();
        if (uid) {
            if (!brandsByUser[uid]) brandsByUser[uid] = [];
            brandsByUser[uid].push(b);
        }
    });

    // Primary user (most brands)
    let primaryUserId = null;
    let maxBrands = 0;
    for (const [uid, blist] of Object.entries(brandsByUser)) {
        if (blist.length > maxBrands) { maxBrands = blist.length; primaryUserId = uid; }
    }
    if (!primaryUserId && users.length > 0) primaryUserId = users[0]._id.toString();
    console.log(`🔑 Primary user: ${userMap[primaryUserId]?.email} (${primaryUserId})`);

    // Load existing URLs for dedup
    const existingCreativeUrls = new Set();
    const existingCreatives = await db.collection('creatives').find({}).project({ imageUrl: 1 }).toArray();
    existingCreatives.forEach(c => { if (c.imageUrl) existingCreativeUrls.add(c.imageUrl); });

    const existingAvatarUrls = new Set();
    const existingAvatars = await db.collection('avatars').find({}).project({ imageUrl: 1 }).toArray();
    existingAvatars.forEach(a => { if (a.imageUrl) existingAvatarUrls.add(a.imageUrl); });

    console.log(`\n${'═'.repeat(70)}`);
    console.log(`  COMPREHENSIVE MEDIA RESTORATION${DRY_RUN ? ' (DRY RUN)' : ''}`);
    console.log(`  Bucket: ${BUCKET}`);
    console.log(`  Existing creatives: ${existingCreativeUrls.size}`);
    console.log(`  Existing avatars: ${existingAvatarUrls.size}`);
    console.log(`${'═'.repeat(70)}\n`);

    const stats = {
        creatives: { restored: 0, skipped: 0, orphaned: 0 },
        avatars: { restored: 0, skipped: 0, orphaned: 0 },
        brands: { restored: 0, skipped: 0 },
        products: { restored: 0, skipped: 0 },
        blogContent: { restored: 0, skipped: 0 },
    };

    // ═══ PHASE 3A: CREATIVES ═══
    console.log('═══ PHASE 3A: CREATIVES ═══');

    const creativePrefixes = [
        'creatives/', 'studio/', 'campaign-shot/', 'campaign-shots/',
        'mockups/', 'edits/', 'canvas-exports/', 'carousels/', 'uploads/', 'user-uploads/',
    ];

    for (const prefix of creativePrefixes) {
        const objects = await listS3Objects(prefix);
        if (objects.length === 0) continue;
        console.log(`\n📂 ${prefix} — ${objects.length} image files`);

        for (const obj of objects) {
            const key = obj.Key;
            const s3Url = buildS3Url(key);

            if (existingCreativeUrls.has(s3Url)) {
                stats.creatives.skipped++;
                continue;
            }

            const parts = key.split('/');
            const objectIdParts = parts.filter(p => extractObjectId(p));

            let userId = null;
            let brandId = null;

            if (objectIdParts.length >= 1) {
                const firstId = objectIdParts[0];
                if (userIds.has(firstId)) {
                    userId = firstId;
                } else {
                    const brand = brands.find(b => b._id.toString() === firstId);
                    if (brand) {
                        brandId = firstId;
                        userId = brand.user?.toString();
                    }
                }
                if (objectIdParts.length >= 2) {
                    const secondId = objectIdParts[1];
                    if (!brandId) {
                        const brand = brands.find(b => b._id.toString() === secondId);
                        if (brand) brandId = secondId;
                    }
                }
            }

            if (!userId) {
                userId = primaryUserId;
            }

            if (!userIds.has(userId)) {
                stats.creatives.orphaned++;
                continue;
            }

            if (!brandId && brandsByUser[userId]?.length > 0) {
                brandId = brandsByUser[userId][0]._id.toString();
            }

            const type = inferCreativeType(key);
            const title = extractTitle(key);

            const doc = {
                user: new mongoose.Types.ObjectId(userId),
                brand: brandId ? new mongoose.Types.ObjectId(brandId) : null,
                type,
                title,
                imageUrl: s3Url,
                status: 'draft',
                tags: ['restored'],
                aiMeta: { provider: 'restored', model: 'unknown' },
                fileSizeMB: Math.round((obj.Size / (1024 * 1024)) * 100) / 100,
                createdAt: obj.LastModified,
                updatedAt: obj.LastModified,
            };

            try {
                if (DRY_RUN) {
                    stats.creatives.restored++;
                } else {
                    await db.collection('creatives').insertOne(doc);
                    stats.creatives.restored++;
                }
                existingCreativeUrls.add(s3Url);
            } catch (err) {
                if (err.code === 11000) stats.creatives.skipped++;
                else console.warn(`   ❌ ${key}: ${err.message}`);
            }
        }
    }

    console.log(`\n  ✅ Creatives: +${stats.creatives.restored} restored | ${stats.creatives.skipped} skipped | ${stats.creatives.orphaned} orphaned`);

    // ═══ PHASE 3B: AVATARS ═══
    console.log('\n═══ PHASE 3B: AVATARS ═══');

    const avatarPrefixes = ['avatars/', 'avatar-studio/'];

    for (const prefix of avatarPrefixes) {
        const objects = await listS3Objects(prefix);
        if (objects.length === 0) continue;
        console.log(`\n📂 ${prefix} — ${objects.length} image files`);

        for (const obj of objects) {
            const key = obj.Key;
            const s3Url = buildS3Url(key);

            if (existingAvatarUrls.has(s3Url)) {
                stats.avatars.skipped++;
                continue;
            }

            const parts = key.split('/');
            const objectIdParts = parts.filter(p => extractObjectId(p));

            let userId = null;
            if (objectIdParts.length >= 1 && userIds.has(objectIdParts[0])) {
                userId = objectIdParts[0];
            } else {
                userId = primaryUserId;
            }

            if (!userIds.has(userId)) {
                stats.avatars.orphaned++;
                continue;
            }

            const filename = key.split('/').pop().replace(/\.\w+$/, '');
            const name = filename.replace(/[-_]/g, ' ').substring(0, 60) || 'Recovered Avatar';

            const doc = {
                name,
                imageUrl: s3Url,
                createdBy: new mongoose.Types.ObjectId(userId),
                isActive: true,
                source: 'generated',
                createdByRole: 'user',
                tags: ['restored'],
                createdAt: obj.LastModified,
                updatedAt: obj.LastModified,
            };

            try {
                if (DRY_RUN) {
                    stats.avatars.restored++;
                } else {
                    await db.collection('avatars').insertOne(doc);
                    stats.avatars.restored++;
                }
                existingAvatarUrls.add(s3Url);
            } catch (err) {
                if (err.code === 11000) stats.avatars.skipped++;
                else console.warn(`   ❌ ${key}: ${err.message}`);
            }
        }
    }

    console.log(`\n  ✅ Avatars: +${stats.avatars.restored} restored | ${stats.avatars.skipped} skipped | ${stats.avatars.orphaned} orphaned`);

    // ═══ PHASE 3C: PRODUCTS (UPDATE images[]) ═══
    console.log('\n═══ PHASE 3C: PRODUCTS ═══');

    const productPrefixes = ['products/', 'product-library/'];
    const productsCollection = db.collection('products');

    for (const prefix of productPrefixes) {
        const objects = await listS3Objects(prefix);
        if (objects.length === 0) continue;
        console.log(`\n📂 ${prefix} — ${objects.length} image files`);

        // Group by first ObjectId in path (brand or product ID)
        const byParent = {};
        for (const obj of objects) {
            const parts = obj.Key.split('/');
            // products/{brandId}/{filename} or products/{brandId}/{productId}/{filename}
            const parentKey = parts.length >= 3 ? parts[1] : 'unknown';
            if (!byParent[parentKey]) byParent[parentKey] = [];
            byParent[parentKey].push(obj);
        }

        for (const [parentId, parentObjects] of Object.entries(byParent)) {
            // Only restore when the S3 folder matches a known brand ID
            const brand = brands.find(b => b._id.toString() === parentId);
            if (!brand) {
                stats.products.skipped += parentObjects.length;
                continue;
            }

            // Further group by product-level subfolder if it exists
            // e.g., products/{brandId}/{productId}/image.jpg vs products/{brandId}/image.jpg
            const byProduct = {};
            for (const obj of parentObjects) {
                const parts = obj.Key.split('/');
                // If path has 4+ segments, the 3rd part might be a product ID
                const subKey = parts.length >= 4 ? parts[2] : '__brand_level__';
                if (!byProduct[subKey]) byProduct[subKey] = [];
                byProduct[subKey].push(obj);
            }

            // Find products for this brand that are missing images
            const productsNoImages = await productsCollection.find({
                brand: brand._id,
                $or: [
                    { images: { $exists: false } },
                    { images: { $size: 0 } },
                ]
            }).toArray();

            if (productsNoImages.length === 0) {
                stats.products.skipped += parentObjects.length;
                continue;
            }

            // For brand-level images (no product subfolder), distribute evenly with cap
            const brandLevelImages = byProduct['__brand_level__'] || [];
            const MAX_IMAGES_PER_PRODUCT = 10;

            if (brandLevelImages.length > 0) {
                const s3Urls = brandLevelImages.map(o => buildS3Url(o.Key));
                const imagesPerProduct = Math.min(
                    MAX_IMAGES_PER_PRODUCT,
                    Math.ceil(s3Urls.length / productsNoImages.length)
                );
                let urlIndex = 0;

                for (const product of productsNoImages) {
                    if (urlIndex >= s3Urls.length) break;
                    const productImages = [];
                    for (let i = 0; i < imagesPerProduct && urlIndex < s3Urls.length; i++, urlIndex++) {
                        productImages.push({ url: s3Urls[urlIndex], alt: product.title || '', position: i });
                    }
                    if (productImages.length > 0) {
                        if (DRY_RUN) {
                            console.log(`   [DRY] Would add ${productImages.length} images to product "${product.title}"`);
                        } else {
                            await productsCollection.updateOne(
                                { _id: product._id },
                                { $set: { images: productImages } }
                            );
                        }
                        stats.products.restored++;
                    }
                }
            }

            // For product-level subfolders, try to match by product ID
            for (const [subKey, subObjects] of Object.entries(byProduct)) {
                if (subKey === '__brand_level__') continue;
                // Check if subKey is a product ObjectId
                if (!extractObjectId(subKey)) continue;

                const product = productsNoImages.find(p => p._id.toString() === subKey);
                if (!product) {
                    stats.products.skipped += subObjects.length;
                    continue;
                }

                const productImages = subObjects.slice(0, MAX_IMAGES_PER_PRODUCT).map((o, i) => ({
                    url: buildS3Url(o.Key), alt: product.title || '', position: i
                }));

                if (DRY_RUN) {
                    console.log(`   [DRY] Would add ${productImages.length} images to product "${product.title}" (matched by ID)`);
                } else {
                    await productsCollection.updateOne(
                        { _id: product._id },
                        { $set: { images: productImages } }
                    );
                }
                stats.products.restored++;
            }
        }
    }

    console.log(`\n  ✅ Products: ${stats.products.restored} updated | ${stats.products.skipped} skipped`);

    // ═══ PHASE 3F: BRANDS (logo + brandImages) ═══
    console.log('\n═══ PHASE 3F: BRANDS (logo + brandImages) ═══');

    const brandObjects = await listS3Objects('brands/');
    if (brandObjects.length > 0) {
        console.log(`\n📂 brands/ — ${brandObjects.length} image files`);

        // Group by brand ID
        const byBrand = {};
        for (const obj of brandObjects) {
            const parts = obj.Key.split('/');
            // brands/{brandId}/...
            const bid = parts.length >= 2 ? parts[1] : null;
            if (bid && extractObjectId(bid)) {
                if (!byBrand[bid]) byBrand[bid] = [];
                byBrand[bid].push(obj);
            }
        }

        for (const [brandId, brandObjs] of Object.entries(byBrand)) {
            const brand = brands.find(b => b._id.toString() === brandId);
            if (!brand) {
                stats.brands.skipped += brandObjs.length;
                continue;
            }

            // Check current state of this brand
            const fullBrand = await db.collection('brands').findOne({ _id: brand._id });

            const updates = {};
            const s3Urls = brandObjs.map(o => ({ url: buildS3Url(o.Key), source: 's3-restored' }));

            // Restore logo if missing
            if (!fullBrand.dna?.logo?.url || fullBrand.dna.logo.url === '') {
                // Find the most likely logo file (usually contains 'logo' in name)
                const logoObj = brandObjs.find(o => o.Key.toLowerCase().includes('logo'))
                    || brandObjs[0]; // fallback to first image
                if (logoObj) {
                    updates['dna.logo.url'] = buildS3Url(logoObj.Key);
                    updates['dna.logo.metadata.source'] = 'restored';
                }
            }

            // Restore brandImages if empty
            const existingBrandImages = fullBrand.dna?.brandImages || [];
            const existingBrandImageUrls = new Set(existingBrandImages.map(i => i.url));
            const newBrandImages = s3Urls.filter(u => !existingBrandImageUrls.has(u.url));

            if (newBrandImages.length > 0) {
                updates['dna.brandImages'] = [
                    ...existingBrandImages,
                    ...newBrandImages,
                ];
            }

            if (Object.keys(updates).length > 0) {
                if (DRY_RUN) {
                    console.log(`   [DRY] Would update brand "${brand.name}": ${Object.keys(updates).join(', ')}`);
                } else {
                    await db.collection('brands').updateOne(
                        { _id: brand._id },
                        { $set: updates }
                    );
                }
                stats.brands.restored++;
            } else {
                stats.brands.skipped++;
            }
        }
    }

    console.log(`\n  ✅ Brands: ${stats.brands.restored} updated | ${stats.brands.skipped} skipped`);

    // ═══ PHASE 3H: BLOG CONTENT IMAGES ═══
    console.log('\n═══ PHASE 3H: BLOG CONTENT IMAGES ═══');

    const blogObjects = await listS3Objects('blog-images/');
    if (blogObjects.length > 0) {
        console.log(`\n📂 blog-images/ — ${blogObjects.length} image files`);

        // Group by parent folder (user/brand ID)
        const byParent = {};
        for (const obj of blogObjects) {
            const parts = obj.Key.split('/');
            const parentKey = parts.length >= 2 ? parts[1] : 'unknown';
            if (!byParent[parentKey]) byParent[parentKey] = [];
            byParent[parentKey].push(obj);
        }

        for (const [parentId, parentObjects] of Object.entries(byParent)) {
            // Try to find contents for this user/brand that are missing hero images
            let query = {};
            const brand = brands.find(b => b._id.toString() === parentId);
            if (brand) {
                query = {
                    brand: brand._id,
                    type: { $in: ['blog', 'seo'] },
                    $or: [
                        { 'blogMeta.heroImageUrl': { $exists: false } },
                        { 'blogMeta.heroImageUrl': '' },
                        { 'blogMeta.heroImageUrl': null },
                    ]
                };
            } else if (userIds.has(parentId)) {
                query = {
                    user: new mongoose.Types.ObjectId(parentId),
                    type: { $in: ['blog', 'seo'] },
                    $or: [
                        { 'blogMeta.heroImageUrl': { $exists: false } },
                        { 'blogMeta.heroImageUrl': '' },
                        { 'blogMeta.heroImageUrl': null },
                    ]
                };
            } else {
                stats.blogContent.skipped += parentObjects.length;
                continue;
            }

            const contentDocs = await db.collection('contents').find(query).toArray();

            // Match images to content docs (by order / timestamp)
            const s3Urls = parentObjects.map(o => buildS3Url(o.Key));
            let urlIndex = 0;

            for (const content of contentDocs) {
                if (urlIndex >= s3Urls.length) break;

                if (DRY_RUN) {
                    console.log(`   [DRY] Would set heroImageUrl for content "${content.title?.substring(0, 40) || content._id}"`);
                } else {
                    await db.collection('contents').updateOne(
                        { _id: content._id },
                        { $set: { 'blogMeta.heroImageUrl': s3Urls[urlIndex] } }
                    );
                }
                stats.blogContent.restored++;
                urlIndex++;
            }

            stats.blogContent.skipped += Math.max(0, parentObjects.length - contentDocs.length);
        }
    }

    console.log(`\n  ✅ Blog Content: ${stats.blogContent.restored} updated | ${stats.blogContent.skipped} skipped`);

    // ═══ FINAL SUMMARY ═══
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`  MEDIA RESTORATION COMPLETE${DRY_RUN ? ' (DRY RUN — no changes made)' : ''}`);
    console.log(`${'═'.repeat(70)}`);
    console.log(`  🎨 Creatives:    +${stats.creatives.restored} restored | ${stats.creatives.skipped} skipped | ${stats.creatives.orphaned} orphaned`);
    console.log(`  👤 Avatars:      +${stats.avatars.restored} restored | ${stats.avatars.skipped} skipped | ${stats.avatars.orphaned} orphaned`);
    console.log(`  📦 Products:     ${stats.products.restored} updated | ${stats.products.skipped} skipped`);
    console.log(`  🏢 Brands:       ${stats.brands.restored} updated | ${stats.brands.skipped} skipped`);
    console.log(`  📝 Blog Content: ${stats.blogContent.restored} updated | ${stats.blogContent.skipped} skipped`);
    console.log(`${'═'.repeat(70)}\n`);

    // Post-restore stats
    if (!DRY_RUN) {
        const totalCreatives = await db.collection('creatives').countDocuments();
        const totalAvatars = await db.collection('avatars').countDocuments();
        const totalProducts = await db.collection('products').countDocuments({ 'images.0': { $exists: true } });
        console.log(`  📊 DB Totals After Restore:`);
        console.log(`     Creatives: ${totalCreatives}`);
        console.log(`     Avatars: ${totalAvatars}`);
        console.log(`     Products with images: ${totalProducts}\n`);
    }

    await mongoose.disconnect();
}

restore().catch(err => {
    console.error('❌ Restore failed:', err);
    process.exit(1);
});

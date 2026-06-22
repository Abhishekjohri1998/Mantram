/**
 * audit_brand_images.js
 * ─────────────────────
 * Scans ALL Brand records in MongoDB and reports:
 *   1. Which brands have broken S3 image URLs (old suspended bucket)
 *   2. Which brands have working direct URLs (from websites)
 *   3. What logo and brandImage URLs look like
 *   4. Total counts and per-brand breakdown
 *
 * Usage:
 *   node backend/scripts/audit_brand_images.js
 *   node backend/scripts/audit_brand_images.js --fix-logos   (re-scrape logos from website)
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) { console.error('❌ MONGODB_URI not set'); process.exit(1); }

// Old suspended bucket patterns
const BROKEN_PATTERNS = [
    'mantram-assets.s3',
    'mantram-media-assets.s3',
    's3.ap-south-1.amazonaws.com/mantram-assets',
    's3.ap-south-1.amazonaws.com/mantram-media-assets',
];

function isBroken(url) {
    if (!url) return false;
    const lower = url.toLowerCase();
    return BROKEN_PATTERNS.some(p => lower.includes(p));
}

function isS3Url(url) {
    if (!url) return false;
    return url.includes('.amazonaws.com') || url.includes('s3.');
}

function isDirectUrl(url) {
    if (!url) return false;
    return url.startsWith('http') && !isS3Url(url);
}

async function main() {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected\n');

    const Brand = mongoose.model('Brand', new mongoose.Schema({}, { strict: false, collection: 'brands' }));
    
    const brands = await Brand.find({}).lean();
    console.log(`📊 Total brands in DB: ${brands.length}\n`);

    let totalLogos = 0, brokenLogos = 0, directLogos = 0, emptyLogos = 0;
    let totalBrandImages = 0, brokenBrandImages = 0, directBrandImages = 0;
    let totalCustomCatImages = 0, brokenCustomCatImages = 0;
    let totalCustomTplImages = 0, brokenCustomTplImages = 0;

    const brandReport = [];

    for (const brand of brands) {
        const report = {
            id: brand._id.toString(),
            name: brand.name || '(unnamed)',
            website: brand.website || '(none)',
            status: brand.status || 'unknown',
            logo: { url: '', status: '' },
            brandImages: [],
            customCatImages: [],
            customTplImages: [],
        };

        // ── Logo ──
        const logoUrl = brand.dna?.logo?.url || '';
        if (!logoUrl) {
            report.logo = { url: '', status: 'EMPTY' };
            emptyLogos++;
        } else if (isBroken(logoUrl)) {
            report.logo = { url: logoUrl, status: 'BROKEN_S3' };
            brokenLogos++;
            totalLogos++;
        } else if (isDirectUrl(logoUrl)) {
            report.logo = { url: logoUrl, status: 'DIRECT_URL' };
            directLogos++;
            totalLogos++;
        } else {
            report.logo = { url: logoUrl, status: 'OTHER' };
            totalLogos++;
        }

        // ── Brand Images ──
        const imgs = brand.dna?.brandImages || [];
        for (const img of imgs) {
            const url = img.url || img.s3Url || '';
            totalBrandImages++;
            if (isBroken(url)) {
                brokenBrandImages++;
                report.brandImages.push({ url, status: 'BROKEN_S3', alt: img.alt || '' });
            } else if (isDirectUrl(url)) {
                directBrandImages++;
                report.brandImages.push({ url, status: 'DIRECT_URL', alt: img.alt || '' });
            } else {
                report.brandImages.push({ url, status: url ? 'OTHER' : 'EMPTY', alt: img.alt || '' });
            }
        }

        // ── Custom Categories ──
        const cats = brand.customCategories || [];
        for (const cat of cats) {
            if (cat.referenceImageUrl) {
                totalCustomCatImages++;
                if (isBroken(cat.referenceImageUrl)) {
                    brokenCustomCatImages++;
                    report.customCatImages.push({ url: cat.referenceImageUrl, status: 'BROKEN_S3', label: cat.label });
                }
            }
        }

        // ── Custom Templates ──
        const tpls = brand.customTemplates || [];
        for (const tpl of tpls) {
            if (tpl.referenceImageUrl) {
                totalCustomTplImages++;
                if (isBroken(tpl.referenceImageUrl)) {
                    brokenCustomTplImages++;
                    report.customTplImages.push({ url: tpl.referenceImageUrl, status: 'BROKEN_S3', label: tpl.label });
                }
            }
        }

        brandReport.push(report);
    }

    // ── Print Summary ──
    console.log('═══════════════════════════════════════════════════');
    console.log('  BRAND IMAGE AUDIT SUMMARY');
    console.log('═══════════════════════════════════════════════════');
    console.log(`  Brands scanned:          ${brands.length}`);
    console.log('');
    console.log('  ── Logos ──');
    console.log(`    Total logos:           ${totalLogos}`);
    console.log(`    Empty logos:           ${emptyLogos}`);
    console.log(`    Broken S3 logos:       ${brokenLogos}`);
    console.log(`    Direct URL logos:      ${directLogos}`);
    console.log('');
    console.log('  ── Brand Images ──');
    console.log(`    Total brand images:    ${totalBrandImages}`);
    console.log(`    Broken S3 images:      ${brokenBrandImages}`);
    console.log(`    Direct URL images:     ${directBrandImages}`);
    console.log('');
    console.log('  ── Custom Category Images ──');
    console.log(`    Total:                 ${totalCustomCatImages}`);
    console.log(`    Broken S3:             ${brokenCustomCatImages}`);
    console.log('');
    console.log('  ── Custom Template Images ──');
    console.log(`    Total:                 ${totalCustomTplImages}`);
    console.log(`    Broken S3:             ${brokenCustomTplImages}`);
    console.log('═══════════════════════════════════════════════════');

    // ── Per-brand detail ──
    console.log('\n\n📋 PER-BRAND DETAIL:\n');
    for (const r of brandReport) {
        const hasBroken = r.logo.status === 'BROKEN_S3' || 
            r.brandImages.some(i => i.status === 'BROKEN_S3') ||
            r.customCatImages.length > 0 || r.customTplImages.length > 0;
        
        const icon = hasBroken ? '❌' : (r.logo.status === 'EMPTY' ? '⚠️' : '✅');
        
        console.log(`${icon} ${r.name} (${r.status})`);
        console.log(`   Website: ${r.website}`);
        console.log(`   Logo: [${r.logo.status}] ${r.logo.url ? r.logo.url.substring(0, 80) + '...' : '(empty)'}`);
        console.log(`   Brand Images: ${r.brandImages.length} total | ${r.brandImages.filter(i => i.status === 'BROKEN_S3').length} broken | ${r.brandImages.filter(i => i.status === 'DIRECT_URL').length} direct`);
        
        // Show broken images
        for (const img of r.brandImages.filter(i => i.status === 'BROKEN_S3')) {
            console.log(`     🔗 [BROKEN] ${img.url.substring(0, 80)}...`);
        }
        // Show direct images
        for (const img of r.brandImages.filter(i => i.status === 'DIRECT_URL').slice(0, 3)) {
            console.log(`     🔗 [DIRECT] ${img.url.substring(0, 80)}...`);
        }
        if (r.customCatImages.length) console.log(`   Custom Category Broken: ${r.customCatImages.length}`);
        if (r.customTplImages.length) console.log(`   Custom Template Broken: ${r.customTplImages.length}`);
        console.log('');
    }

    // ── Also check other collections for broken S3 URLs ──
    console.log('\n\n📦 CHECKING OTHER COLLECTIONS...\n');

    // Creative collection
    try {
        const Creative = mongoose.model('Creative', new mongoose.Schema({}, { strict: false, collection: 'creatives' }));
        const brokenCreatives = await Creative.countDocuments({
            $or: [
                { imageUrl: { $regex: /mantram-assets\.s3/ } },
                { thumbnailUrl: { $regex: /mantram-assets\.s3/ } },
                { imageUrl: { $regex: /mantram-media-assets\.s3/ } },
                { thumbnailUrl: { $regex: /mantram-media-assets\.s3/ } },
            ]
        });
        const totalCreatives = await Creative.countDocuments({});
        console.log(`   Creatives: ${brokenCreatives} broken / ${totalCreatives} total`);
    } catch (e) { console.log(`   Creatives: Error - ${e.message}`); }

    // BrandKitAsset collection
    try {
        const BrandKitAsset = mongoose.model('BrandKitAsset', new mongoose.Schema({}, { strict: false, collection: 'brandkitassets' }));
        const brokenAssets = await BrandKitAsset.countDocuments({
            $or: [
                { url: { $regex: /mantram-assets\.s3/ } },
                { url: { $regex: /mantram-media-assets\.s3/ } },
            ]
        });
        const totalAssets = await BrandKitAsset.countDocuments({});
        console.log(`   BrandKitAssets: ${brokenAssets} broken / ${totalAssets} total`);
    } catch (e) { console.log(`   BrandKitAssets: Error - ${e.message}`); }

    // Avatar collection
    try {
        const Avatar = mongoose.model('Avatar', new mongoose.Schema({}, { strict: false, collection: 'avatars' }));
        const brokenAvatars = await Avatar.countDocuments({
            $or: [
                { imageUrl: { $regex: /mantram-assets\.s3/ } },
                { imageUrl: { $regex: /mantram-media-assets\.s3/ } },
            ]
        });
        const totalAvatars = await Avatar.countDocuments({});
        console.log(`   Avatars: ${brokenAvatars} broken / ${totalAvatars} total`);
    } catch (e) { console.log(`   Avatars: Error - ${e.message}`); }

    // ImageBank items in Creative collection (source: uploaded/ai-*)
    try {
        const ImageBank = mongoose.model('ImageBankItem', new mongoose.Schema({}, { strict: false, collection: 'imagebankitems' }));
        const exists = await ImageBank.estimatedDocumentCount().catch(() => 0);
        if (exists > 0) {
            const brokenBank = await ImageBank.countDocuments({
                $or: [
                    { imageUrl: { $regex: /mantram-assets\.s3/ } },
                    { imageUrl: { $regex: /mantram-media-assets\.s3/ } },
                ]
            });
            console.log(`   ImageBankItems: ${brokenBank} broken / ${exists} total`);
        }
    } catch (e) { /* collection may not exist */ }

    await mongoose.disconnect();
    console.log('\n✅ Audit complete.');
}

main().catch(err => { console.error('❌ Fatal:', err.message); process.exit(1); });

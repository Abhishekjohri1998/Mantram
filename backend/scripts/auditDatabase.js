/**
 * MongoDB Database Audit Script — Mantram AI
 * 
 * READ-ONLY: This script does NOT modify any data.
 * Run: node scripts/auditDatabase.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function audit() {
    try {
        console.log('🔄 Connecting to MongoDB for audit...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected.\n');

        const db = mongoose.connection.db;
        const now = new Date();
        const d7  = new Date(now - 7*24*60*60*1000);
        const d14 = new Date(now - 14*24*60*60*1000);
        const d30 = new Date(now - 30*24*60*60*1000);
        const d90 = new Date(now - 90*24*60*60*1000);
        const d180 = new Date(now - 180*24*60*60*1000);

        // ═══ 1A: COLLECTION SIZES ═══
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('  STEP 1A — COLLECTION SIZES');
        console.log('═══════════════════════════════════════════════════════════════');

        const collections = await db.listCollections().toArray();
        const collNames = collections.map(c => c.name).sort();
        console.log(`Total collections: ${collNames.length}\n`);

        let totalDocs = 0;
        const collData = [];
        for (const name of collNames) {
            const coll = db.collection(name);
            const total = await coll.countDocuments();
            let stale90 = 0, stale30 = 0;
            try {
                stale90 = await coll.countDocuments({ updatedAt: { $lt: d90 } });
                stale30 = await coll.countDocuments({ updatedAt: { $lt: d30 } });
            } catch(e) { /* no updatedAt field */ }
            totalDocs += total;
            collData.push({ name, total, stale90, stale30 });
            if (total > 0) {
                console.log(`📦 ${name.padEnd(32)} Total: ${String(total).padStart(6)} | Stale 90d: ${String(stale90).padStart(6)} | Stale 30d: ${String(stale30).padStart(6)}`);
            }
        }
        // Print empty collections
        const emptyColls = collData.filter(c => c.total === 0);
        if (emptyColls.length > 0) {
            console.log(`\n🗑️  Empty collections (${emptyColls.length}):`);
            emptyColls.forEach(c => console.log(`   - ${c.name}`));
        }
        console.log(`\n🔢 TOTAL DOCUMENTS: ${totalDocs}`);

        // ═══ 1B: DATABASE SIZE ═══
        console.log('\n═══════════════════════════════════════════════════════════════');
        console.log('  STEP 1B — DATABASE SIZE');
        console.log('═══════════════════════════════════════════════════════════════');
        const stats = await db.stats();
        console.log(`💾 Data Size:    ${(stats.dataSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`💾 Storage Size: ${(stats.storageSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`💾 Index Size:   ${(stats.indexSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`💾 Total Size:   ${((stats.dataSize + stats.indexSize) / 1024 / 1024).toFixed(2)} MB`);

        // ═══ 1C: TOP 15 LARGEST COLLECTIONS ═══
        console.log('\n═══════════════════════════════════════════════════════════════');
        console.log('  STEP 1C — TOP 15 LARGEST COLLECTIONS BY SIZE');
        console.log('═══════════════════════════════════════════════════════════════');
        const sizeData = [];
        for (const name of collNames) {
            try {
                const s = await db.collection(name).stats();
                sizeData.push({ name, docs: s.count, sizeKB: Math.round(s.size / 1024), indexKB: Math.round(s.totalIndexSize / 1024) });
            } catch(e) { /* empty collection may not have stats */ }
        }
        sizeData.sort((a, b) => b.sizeKB - a.sizeKB).slice(0, 15).forEach(c => {
            console.log(`${c.name.padEnd(32)} ${String(c.docs).padStart(8)} docs | ${String(c.sizeKB).padStart(8)} KB data | ${String(c.indexKB).padStart(8)} KB index`);
        });

        // ═══ 1D: ORPHAN DETECTION (user → deleted User) ═══
        console.log('\n═══════════════════════════════════════════════════════════════');
        console.log('  STEP 1D — ORPHANED DOCUMENTS (user → deleted User)');
        console.log('═══════════════════════════════════════════════════════════════');

        const collectionsWithUserRef = [
            'brands', 'contents', 'creatives', 'videoprojects', 'products',
            'integrations', 'subscriptions', 'notifications', 'creditusages',
            'generationjobs', 'brainstormsessions', 'seoaudits', 'seosnapshots',
            'funnels', 'socialaccounts', 'socialposts', 'skills', 'skillexecutions',
            'conversations', 'contacts', 'monthlystrategies', 'brandstrategies',
            'competitorsnapshots', 'feedbacks', 'shopifyorders', 'shopifycustomers',
            'pulsehistories', 'nexushistories', 'geoprobehistories', 'studioreports',
            'brandauditlogs', 'brandkitassets', 'clonedvoices', 'commentreplies',
            'nurturesequences', 'automations', 'automationrules', 'funnelpages',
            'funnelentries', 'intelmissions', 'retentioncampaigns',
            'teamchats', 'teaminvites', 'thumbnailtemplate', 'youtubeprojects',
            'youtubechannelconfigs'
        ];

        let totalOrphansUser = 0;
        for (const c of collectionsWithUserRef) {
            try {
                const coll = db.collection(c);
                const total = await coll.countDocuments();
                if (total === 0) continue;

                // Determine the user field name (most use 'user', some use 'userId')
                const userField = ['videoprojects', 'youtubechannelconfigs', 'youtubeprojects', 
                    'thumbnailtemplate', 'productcontexts'].includes(c) ? 'userId' : 'user';

                const orphans = await coll.aggregate([
                    { $lookup: { from: 'users', localField: userField, foreignField: '_id', as: '_userDoc' } },
                    { $match: { _userDoc: { $size: 0 } } },
                    { $count: 'orphaned' }
                ]).toArray();

                const count = orphans[0]?.orphaned || 0;
                if (count > 0) {
                    console.log(`⚠️  ${c.padEnd(32)} ${String(count).padStart(5)} orphaned (of ${total} total)`);
                    totalOrphansUser += count;
                }
            } catch(e) { /* collection may not exist */ }
        }
        console.log(`\nTotal user-orphaned documents: ${totalOrphansUser}`);

        // ═══ 1E: ORPHAN DETECTION (brand → deleted Brand) ═══
        console.log('\n═══════════════════════════════════════════════════════════════');
        console.log('  STEP 1E — ORPHANED DOCUMENTS (brand → deleted Brand)');
        console.log('═══════════════════════════════════════════════════════════════');

        const collectionsWithBrandRef = [
            'contents', 'creatives', 'videoprojects', 'products', 'integrations',
            'seoaudits', 'seosnapshots', 'funnels', 'socialposts', 'brainstormsessions',
            'skills', 'conversations', 'contacts', 'monthlystrategies', 'feedbacks',
            'shopifyorders', 'shopifycustomers', 'automations', 'automationrules',
            'nurturesequences', 'competitorsnapshots', 'brandkitassets', 'brandauditlogs',
            'clonedvoices', 'commentreplies', 'intelmissions', 'retentioncampaigns',
            'studioreports', 'pulsehistories', 'nexushistories', 'geoprobehistories',
            'socialstrategies'
        ];

        let totalOrphansBrand = 0;
        for (const c of collectionsWithBrandRef) {
            try {
                const coll = db.collection(c);
                const total = await coll.countDocuments();
                if (total === 0) continue;

                const brandField = ['videoprojects', 'youtubechannelconfigs', 'youtubeprojects',
                    'thumbnailtemplate', 'productcontexts'].includes(c) ? 'brandId' : 'brand';

                const orphans = await coll.aggregate([
                    { $match: { [brandField]: { $exists: true, $ne: null } } },
                    { $lookup: { from: 'brands', localField: brandField, foreignField: '_id', as: '_brandDoc' } },
                    { $match: { _brandDoc: { $size: 0 } } },
                    { $count: 'orphaned' }
                ]).toArray();

                const count = orphans[0]?.orphaned || 0;
                if (count > 0) {
                    console.log(`⚠️  ${c.padEnd(32)} ${String(count).padStart(5)} orphaned (of ${total} total)`);
                    totalOrphansBrand += count;
                }
            } catch(e) { /* skip */ }
        }
        console.log(`\nTotal brand-orphaned documents: ${totalOrphansBrand}`);

        // ═══ 1F: INACTIVE USERS ═══
        console.log('\n═══════════════════════════════════════════════════════════════');
        console.log('  STEP 1F — INACTIVE USERS');
        console.log('═══════════════════════════════════════════════════════════════');

        const users = db.collection('users');
        const totalUsers = await users.countDocuments();
        const superadmins = await users.countDocuments({ role: 'superadmin' });
        const staleUsers90 = await users.countDocuments({ lastActive: { $lt: d90 }, role: { $ne: 'superadmin' } });
        const staleUsers30 = await users.countDocuments({ lastActive: { $lt: d30 }, role: { $ne: 'superadmin' } });
        const neverActive = await users.countDocuments({ lastActive: { $exists: false }, role: { $ne: 'superadmin' } });
        const unverified = await users.countDocuments({ isVerified: false });
        const shopifyGhosts = await users.countDocuments({ email: { $regex: /@shopify-install\.mantram\.ai$/ } });
        
        // Users with brands
        const usersWithBrands = await db.collection('brands').distinct('user');

        console.log(`👤 Total users:                    ${totalUsers}`);
        console.log(`👑 Superadmins:                    ${superadmins}`);
        console.log(`👤 Inactive 30+ days:              ${staleUsers30}`);
        console.log(`👤 Inactive 90+ days:              ${staleUsers90}`);
        console.log(`👤 Never active (no lastActive):   ${neverActive}`);
        console.log(`📧 Unverified email:               ${unverified}`);
        console.log(`🛍️ Shopify auto-provisioned:        ${shopifyGhosts}`);
        console.log(`👤 Users with zero brands:          ${totalUsers - usersWithBrands.length}`);

        // ═══ 1G: STALE GENERATION JOBS ═══
        console.log('\n═══════════════════════════════════════════════════════════════');
        console.log('  STEP 1G — STALE GENERATION JOBS');
        console.log('═══════════════════════════════════════════════════════════════');
        try {
            const gj = db.collection('generationjobs');
            const gjTotal = await gj.countDocuments();
            const stuckJobs = await gj.countDocuments({ status: { $in: ['pending', 'processing'] }, createdAt: { $lt: d7 } });
            const failedJobs90 = await gj.countDocuments({ status: 'failed', createdAt: { $lt: d90 } });
            const completedJobs90 = await gj.countDocuments({ status: 'completed', createdAt: { $lt: d90 } });
            console.log(`📊 Total generation jobs:          ${gjTotal}`);
            console.log(`⏳ Stuck (pending/processing > 7d): ${stuckJobs}`);
            console.log(`❌ Failed (> 90 days old):          ${failedJobs90}`);
            console.log(`✅ Completed (> 90 days old):       ${completedJobs90}`);
        } catch(e) { console.log('Generation jobs collection not found'); }

        // ═══ 1H: STALE HISTORY/LOG COLLECTIONS ═══
        console.log('\n═══════════════════════════════════════════════════════════════');
        console.log('  STEP 1H — STALE HISTORY & LOG COLLECTIONS');
        console.log('═══════════════════════════════════════════════════════════════');
        const historyColls = [
            'auditlogs', 'brandauditlogs', 'creditusages', 'notifications',
            'agentsessions', 'presetusagelogs', 'templateusagelogs',
            'nexushistories', 'pulsehistories', 'geoprobehistories',
            'gscsnapshots', 'competitorsnapshots', 'skillexecutions'
        ];
        for (const c of historyColls) {
            try {
                const coll = db.collection(c);
                const total = await coll.countDocuments();
                if (total === 0) continue;
                const older7d = await coll.countDocuments({ createdAt: { $lt: d7 } });
                const older30d = await coll.countDocuments({ createdAt: { $lt: d30 } });
                const older90d = await coll.countDocuments({ createdAt: { $lt: d90 } });
                console.log(`📋 ${c.padEnd(28)} Total: ${String(total).padStart(5)} | >7d: ${String(older7d).padStart(5)} | >30d: ${String(older30d).padStart(5)} | >90d: ${String(older90d).padStart(5)}`);
            } catch(e) { /* skip */ }
        }

        // ═══ SUMMARY ═══
        console.log('\n═══════════════════════════════════════════════════════════════');
        console.log('  AUDIT SUMMARY');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log(`📦 Total collections:     ${collNames.length}`);
        console.log(`📄 Total documents:       ${totalDocs}`);
        console.log(`💾 DB Size:               ${((stats.dataSize + stats.indexSize) / 1024 / 1024).toFixed(2)} MB`);
        console.log(`🗑️  Empty collections:     ${emptyColls.length}`);
        console.log(`⚠️  User-orphaned docs:    ${totalOrphansUser}`);
        console.log(`⚠️  Brand-orphaned docs:   ${totalOrphansBrand}`);
        console.log(`👤 Inactive users (90d):   ${staleUsers90}`);
        console.log('\n✅ Audit complete. Share these results and I\'ll generate safe delete scripts.');

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('❌ Audit failed:', error.message);
        process.exit(1);
    }
}

audit();

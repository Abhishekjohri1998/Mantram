/**
 * Deep Cleanup Phase 2 — Mantram AI
 * Finds and removes ALL remaining garbage after Phase 1
 * Also optimizes indexes for performance
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const DRY_RUN = false; // User approved live delete

async function deepCleanup() {
    try {
        console.log('🔄 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected.\n');
        const db = mongoose.connection.db;

        const now = new Date();
        const d7  = new Date(now - 7*24*60*60*1000);
        const d30 = new Date(now - 30*24*60*60*1000);
        let totalDeleted = 0;

        // ═══ PHASE 2A: FRESH AUDIT — what's still in the DB ═══
        console.log('═══ FRESH AUDIT ═══════════════════════════════════════════');
        const collections = (await db.listCollections().toArray()).map(c => c.name).sort();
        console.log(`Collections remaining: ${collections.length}\n`);
        
        let totalDocs = 0;
        for (const name of collections) {
            const total = await db.collection(name).countDocuments();
            totalDocs += total;
            if (total > 0) {
                console.log(`  📦 ${name.padEnd(30)} ${String(total).padStart(6)} docs`);
            }
        }
        console.log(`\n  Total docs: ${totalDocs}`);
        
        const stats = await db.stats();
        console.log(`  DB Size: ${((stats.dataSize + stats.indexSize) / 1024 / 1024).toFixed(2)} MB\n`);

        // Get valid IDs
        const validUserIds = await db.collection('users').distinct('_id');
        const validBrandIds = await db.collection('brands').distinct('_id');

        // ═══ PHASE 2B: CASCADING ORPHAN CLEANUP ═══
        // After deleting orphan brands in Phase 1, more brand-orphaned docs may exist
        console.log('═══ CASCADING ORPHAN CLEANUP ═══════════════════════════════');

        // Check EVERY remaining collection for orphaned user/brand refs
        const userRefFields = { 
            default: 'user',
            videoprojects: 'userId', youtubechannelconfigs: 'userId', 
            youtubeprojects: 'userId', thumbnailtemplates: 'userId',
            productcontexts: 'userId', creditpacks: 'createdBy',
            auditlogs: 'admin', coupons: 'user'
        };
        const brandRefFields = {
            default: 'brand',
            productcontexts: 'brandId', thumbnailtemplates: 'brandId',
            youtubechannelconfigs: 'brandId', youtubeprojects: 'brandId',
            creditusages: 'brandId'
        };

        for (const collName of collections) {
            if (['users', 'subscriptionpackages', 'systemsettings', 'qadscategories', 
                 'qadspresets', 'templates', 'templatecategories', 'avatars', 'creditpacks'].includes(collName)) continue;
            
            const coll = db.collection(collName);
            const total = await coll.countDocuments();
            if (total === 0) continue;

            // Check user orphans
            const uField = userRefFields[collName] || userRefFields.default;
            try {
                const userOrphans = await coll.aggregate([
                    { $match: { [uField]: { $exists: true, $ne: null } } },
                    { $lookup: { from: 'users', localField: uField, foreignField: '_id', as: '_u' } },
                    { $match: { _u: { $size: 0 } } },
                    { $count: 'c' }
                ]).toArray();
                const uc = userOrphans[0]?.c || 0;
                if (uc > 0) {
                    console.log(`  ⚠️  ${collName}: ${uc} user-orphaned docs (of ${total})`);
                    if (!DRY_RUN) continue;
                    const r = await coll.deleteMany({ [uField]: { $nin: validUserIds } });
                    console.log(`    🗑️  Deleted ${r.deletedCount}`);
                    totalDeleted += r.deletedCount;
                }
            } catch(e) { /* field doesn't exist */ }

            // Check brand orphans
            const bField = brandRefFields[collName] || brandRefFields.default;
            try {
                const brandOrphans = await coll.aggregate([
                    { $match: { [bField]: { $exists: true, $ne: null } } },
                    { $lookup: { from: 'brands', localField: bField, foreignField: '_id', as: '_b' } },
                    { $match: { _b: { $size: 0 } } },
                    { $count: 'c' }
                ]).toArray();
                const bc = brandOrphans[0]?.c || 0;
                if (bc > 0) {
                    console.log(`  ⚠️  ${collName}: ${bc} brand-orphaned docs (of ${total})`);
                    const r = await coll.deleteMany({ [bField]: { $exists: true, $ne: null, $nin: validBrandIds } });
                    console.log(`    🗑️  Deleted ${r.deletedCount}`);
                    totalDeleted += r.deletedCount;
                }
            } catch(e) { /* field doesn't exist */ }
        }

        // ═══ PHASE 2C: STALE DATA CLEANUP ═══
        console.log('\n═══ STALE DATA CLEANUP ════════════════════════════════════');

        // Unverified users who registered 30+ days ago and never logged in
        const staleUnverified = await db.collection('users').countDocuments({
            isVerified: false,
            createdAt: { $lt: d30 },
            role: { $ne: 'superadmin' }
        });
        if (staleUnverified > 0) {
            console.log(`  👤 Unverified users (30+ days old): ${staleUnverified}`);
            // Don't auto-delete users — just flag them
            console.log(`    ⚠️  FLAGGED for manual review (not auto-deleted)`);
        }

        // Orphaned subscriptions (user deleted)
        const orphanSubs = await db.collection('subscriptions').aggregate([
            { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: '_u' } },
            { $match: { _u: { $size: 0 } } },
            { $count: 'c' }
        ]).toArray();
        const osc = orphanSubs[0]?.c || 0;
        if (osc > 0) {
            console.log(`  💳 Orphaned subscriptions: ${osc}`);
            const r = await db.collection('subscriptions').deleteMany({ user: { $nin: validUserIds } });
            console.log(`    🗑️  Deleted ${r.deletedCount}`);
            totalDeleted += r.deletedCount;
        }

        // Duplicate subscriptions per user (keep only the latest)
        console.log('\n  Checking for duplicate subscriptions per user...');
        const dupSubs = await db.collection('subscriptions').aggregate([
            { $group: { _id: '$user', count: { $sum: 1 }, ids: { $push: '$_id' }, dates: { $push: '$createdAt' } } },
            { $match: { count: { $gt: 1 } } }
        ]).toArray();
        
        if (dupSubs.length > 0) {
            console.log(`  💳 Users with duplicate subscriptions: ${dupSubs.length}`);
            for (const dup of dupSubs) {
                // Keep the newest subscription, delete the rest
                const subs = await db.collection('subscriptions')
                    .find({ user: dup._id })
                    .sort({ createdAt: -1 })
                    .toArray();
                
                if (subs.length > 1) {
                    const idsToDelete = subs.slice(1).map(s => s._id);
                    const r = await db.collection('subscriptions').deleteMany({ _id: { $in: idsToDelete } });
                    console.log(`    🗑️  User ${dup._id}: kept newest, deleted ${r.deletedCount} old subs`);
                    totalDeleted += r.deletedCount;
                }
            }
        } else {
            console.log('  ✅ No duplicate subscriptions');
        }

        // Stale credit usage records (older than 30 days)
        const staleCreditUsage = await db.collection('creditusages').countDocuments({ createdAt: { $lt: d30 } });
        if (staleCreditUsage > 0) {
            const r = await db.collection('creditusages').deleteMany({ createdAt: { $lt: d30 } });
            console.log(`  🗑️  Credit usage records older than 30d: deleted ${r.deletedCount}`);
            totalDeleted += r.deletedCount;
        }

        // Old audit logs
        const staleAuditLogs = await db.collection('auditlogs').countDocuments({ createdAt: { $lt: d7 } });
        if (staleAuditLogs > 0) {
            const r = await db.collection('auditlogs').deleteMany({ createdAt: { $lt: d7 } });
            console.log(`  🗑️  Audit logs older than 7d: deleted ${r.deletedCount}`);
            totalDeleted += r.deletedCount;
        }

        // Old template usage logs
        const staleTUL = await db.collection('templateusagelogs').countDocuments({ createdAt: { $lt: d30 } });
        if (staleTUL > 0) {
            const r = await db.collection('templateusagelogs').deleteMany({ createdAt: { $lt: d30 } });
            console.log(`  🗑️  Template usage logs older than 30d: deleted ${r.deletedCount}`);
            totalDeleted += r.deletedCount;
        }

        // Read notifications
        const readNotifs = await db.collection('notifications').countDocuments({ read: true });
        if (readNotifs > 0) {
            const r = await db.collection('notifications').deleteMany({ read: true });
            console.log(`  🗑️  Read notifications: deleted ${r.deletedCount}`);
            totalDeleted += r.deletedCount;
        }

        // ═══ PHASE 2D: INDEX OPTIMIZATION ═══
        console.log('\n═══ INDEX OPTIMIZATION ════════════════════════════════════');
        
        // Ensure proper indexes on hot-query collections
        const indexOps = [
            { coll: 'users', idx: { email: 1 }, opts: { unique: true, background: true } },
            { coll: 'users', idx: { lastActive: -1 }, opts: { background: true } },
            { coll: 'brands', idx: { user: 1, status: 1 }, opts: { background: true } },
            { coll: 'contents', idx: { user: 1, brand: 1, createdAt: -1 }, opts: { background: true } },
            { coll: 'creatives', idx: { user: 1, brand: 1, createdAt: -1 }, opts: { background: true } },
            { coll: 'subscriptions', idx: { user: 1, status: 1 }, opts: { background: true } },
            { coll: 'creditusages', idx: { user: 1, createdAt: -1 }, opts: { background: true } },
            { coll: 'seoaudits', idx: { brand: 1, createdAt: -1 }, opts: { background: true } },
            { coll: 'socialposts', idx: { user: 1, brand: 1, scheduledDate: -1 }, opts: { background: true } },
            { coll: 'notifications', idx: { user: 1, read: 1, createdAt: -1 }, opts: { background: true } },
        ];

        for (const { coll, idx, opts } of indexOps) {
            try {
                await db.collection(coll).createIndex(idx, opts);
                console.log(`  ✅ ${coll}: ensured index ${JSON.stringify(idx)}`);
            } catch(e) {
                console.log(`  ⚠️  ${coll}: index ${JSON.stringify(idx)} — ${e.message.slice(0, 60)}`);
            }
        }

        // Drop unused/redundant indexes
        console.log('\n  Checking for redundant indexes...');
        for (const collName of collections) {
            try {
                const indexes = await db.collection(collName).indexes();
                if (indexes.length > 5) {
                    console.log(`  📊 ${collName}: ${indexes.length} indexes (may have redundant ones)`);
                }
            } catch(e) {}
        }

        // ═══ FINAL AUDIT ═══
        console.log('\n═══ FINAL AUDIT ═══════════════════════════════════════════');
        const finalCollections = (await db.listCollections().toArray()).map(c => c.name).sort();
        let finalDocs = 0;
        for (const name of finalCollections) {
            finalDocs += await db.collection(name).countDocuments();
        }
        const finalStats = await db.stats();

        console.log(`  📦 Collections:    ${finalCollections.length}`);
        console.log(`  📄 Documents:      ${finalDocs}`);
        console.log(`  💾 Data Size:      ${(finalStats.dataSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`  💾 Index Size:     ${(finalStats.indexSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`  💾 Total Size:     ${((finalStats.dataSize + finalStats.indexSize) / 1024 / 1024).toFixed(2)} MB`);
        console.log(`  🗑️  Deleted in P2:  ${totalDeleted}`);

        // Verification
        console.log('\n  ✅ Safety Verification:');
        console.log(`     Users:              ${await db.collection('users').countDocuments()}`);
        console.log(`     Active subs:        ${await db.collection('subscriptions').countDocuments({ status: 'active' })}`);
        console.log(`     Brands:             ${await db.collection('brands').countDocuments()}`);
        console.log(`     Creatives:          ${await db.collection('creatives').countDocuments()}`);
        console.log(`     Contents:           ${await db.collection('contents').countDocuments()}`);
        console.log(`     Products:           ${await db.collection('products').countDocuments()}`);

        // List remaining collections with counts
        console.log('\n  📦 Final collection inventory:');
        for (const name of finalCollections) {
            const c = await db.collection(name).countDocuments();
            if (c > 0) console.log(`     ${name.padEnd(30)} ${c}`);
        }

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('❌ Deep cleanup failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

deepCleanup();

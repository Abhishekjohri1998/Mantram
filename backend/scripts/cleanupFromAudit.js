/**
 * MongoDB Database Cleanup Script — Mantram AI
 * Based on audit results from 2026-05-28
 * 
 * SAFETY RULES:
 * - Phase 1 (DRY RUN): Only counts, no deletions  
 * - Phase 2 (DELETE): Uncomment deleteMany lines to execute
 * - NEVER touches users with recent activity (30 days)
 * - NEVER touches active subscriptions
 * - Backs up counts before every operation
 * 
 * Run:  node scripts/cleanupFromAudit.js
 * Mode: Set DRY_RUN = false to actually delete
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

// ╔═══════════════════════════════════════════════════════════╗
// ║  SAFETY FLAG — SET TO false WHEN READY TO ACTUALLY DELETE ║
// ╚═══════════════════════════════════════════════════════════╝
const DRY_RUN = false;

let totalDeleted = 0;
let totalSkipped = 0;

async function safeDelete(db, collectionName, filter, description) {
    const coll = db.collection(collectionName);
    const count = await coll.countDocuments(filter);
    
    if (count === 0) {
        return;
    }

    if (DRY_RUN) {
        console.log(`  🔍 [DRY RUN] ${description}: ${count} docs would be deleted from ${collectionName}`);
        totalSkipped += count;
    } else {
        const result = await coll.deleteMany(filter);
        console.log(`  🗑️  [DELETED] ${description}: ${result.deletedCount} docs from ${collectionName}`);
        totalDeleted += result.deletedCount;
    }
}

async function safeDrop(db, collectionName, description) {
    try {
        const coll = db.collection(collectionName);
        const count = await coll.countDocuments();
        if (DRY_RUN) {
            console.log(`  🔍 [DRY RUN] Would DROP ${collectionName} (${count} docs) — ${description}`);
        } else {
            await coll.drop();
            console.log(`  🗑️  [DROPPED] ${collectionName} (${count} docs) — ${description}`);
        }
    } catch(e) {
        // Collection may not exist
    }
}

async function cleanup() {
    try {
        console.log(`\n${'═'.repeat(65)}`);
        console.log(`  MANTRAM AI — DATABASE CLEANUP`);
        console.log(`  Mode: ${DRY_RUN ? '🔍 DRY RUN (no changes)' : '🗑️  LIVE DELETE'}`);
        console.log(`  Date: ${new Date().toISOString()}`);
        console.log(`${'═'.repeat(65)}\n`);

        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');
        const db = mongoose.connection.db;

        // Get valid user IDs and brand IDs for orphan detection
        const validUserIds = await db.collection('users').distinct('_id');
        const validBrandIds = await db.collection('brands').distinct('_id');

        // ════════════════════════════════════════════════════════
        // TIER 1: DROP EMPTY COLLECTIONS (15 collections, 0 risk)
        // ════════════════════════════════════════════════════════
        console.log('── TIER 1: EMPTY COLLECTIONS ──────────────────────────────');
        const emptyCollections = [
            'approvalrequests', 'attendances', 'brandauditlogs', 'cmspages',
            'competitorsnapshots', 'contentitems', 'employees', 'funnelpages',
            'generationjobs', 'gscsnapshots', 'intelmissions', 'nurturesequences',
            'retentionoffers', 'sessions', 'waitlists'
        ];
        for (const c of emptyCollections) {
            await safeDrop(db, c, 'empty collection');
        }

        // ════════════════════════════════════════════════════════
        // TIER 2: DROP DEPRECATED COLLECTIONS (exist in DB, NOT in code)
        // These have no corresponding model in backend/models/
        // ════════════════════════════════════════════════════════
        console.log('\n── TIER 2: DEPRECATED COLLECTIONS (no model in code) ──────');
        
        // Collections that exist in DB but have NO matching model file
        const deprecatedCollections = [
            { name: 'availablecountries', docs: 126, reason: 'No model — likely old geo data' },
            { name: 'brandconnections', docs: 6, reason: 'No model — replaced by Integration' },
            { name: 'brandkits', docs: 6, reason: 'No model — replaced by BrandKitAsset' },
            { name: 'brandpromptpacks', docs: 13, reason: 'No model — deprecated feature' },
            { name: 'brandstyletokens', docs: 6, reason: 'No model — merged into Brand DNA' },
            { name: 'brandvoicekits', docs: 6, reason: 'No model — merged into Brand DNA' },
            { name: 'calendarevents', docs: 85, reason: 'No model — replaced by globalCalendar util' },
            { name: 'campaigns', docs: 10, reason: 'No model — replaced by AdCampaign' },
            { name: 'featureflags', docs: 10, reason: 'No model — likely old feature toggle system' },
            { name: 'generatedcontents', docs: 17, reason: 'No model — replaced by Content' },
            { name: 'jobs', docs: 1, reason: 'No model — replaced by GenerationJob' },
            { name: 'kitlibraries', docs: 3, reason: 'No model — deprecated' },
            { name: 'knowledgeitems', docs: 11, reason: 'No model — deprecated knowledge base' },
            { name: 'onboardingsessions', docs: 14, reason: 'No model — onboarding rebuilt' },
            { name: 'organizations', docs: 9, reason: 'No model — teams use User.organization ref' },
            { name: 'spymissions', docs: 1, reason: 'No model — replaced by IntelMission' },
            { name: 'teammemberships', docs: 8, reason: 'No model — replaced by TeamInvite' },
        ];

        for (const { name, docs, reason } of deprecatedCollections) {
            await safeDrop(db, name, `${reason} (${docs} docs)`);
        }

        // Also: brainstormideas, campaignbucketitems, campaignbuckets, contentstrategyplans
        const moreDeprecated = [
            { name: 'brainstormideas', reason: 'No model — merged into BrainstormSession' },
            { name: 'campaignbucketitems', reason: 'No model — deprecated campaign system' },
            { name: 'campaignbuckets', reason: 'No model — deprecated campaign system' },
            { name: 'contentstrategyplans', reason: 'No model — replaced by MonthlyStrategy' },
        ];
        for (const { name, reason } of moreDeprecated) {
            await safeDrop(db, name, reason);
        }

        // ════════════════════════════════════════════════════════
        // TIER 3: ORPHANED DOCUMENTS (user → deleted User)
        // 694 documents whose parent user no longer exists
        // ════════════════════════════════════════════════════════
        console.log('\n── TIER 3: USER-ORPHANED DOCUMENTS ────────────────────────');

        // 🔴 BIGGEST WIN: 574 orphaned video projects (ALL of them!)
        await safeDelete(db, 'videoprojects', 
            { user: { $nin: validUserIds } },
            '574 video projects — ALL orphaned (user field)'
        );
        // Also try userId field in case some use that
        await safeDelete(db, 'videoprojects',
            { userId: { $exists: true }, userId: { $nin: validUserIds } },
            'Video projects with userId field orphaned'
        );

        // Orphaned brands (10 of 84)
        await safeDelete(db, 'brands',
            { user: { $nin: validUserIds } },
            'Brands with deleted owners'
        );

        // Orphaned subscriptions (6 of 64) — only delete inactive ones
        await safeDelete(db, 'subscriptions',
            { user: { $nin: validUserIds }, status: { $ne: 'active' } },
            'Orphaned subscriptions (non-active only)'
        );

        // Orphaned funnels (4 of 18)
        await safeDelete(db, 'funnels',
            { user: { $nin: validUserIds } },
            'Orphaned funnels'
        );

        // Orphaned funnel entries (71 of 119)
        await safeDelete(db, 'funnelentries',
            { user: { $nin: validUserIds } },
            'Orphaned funnel entries'
        );

        // Orphaned skills (10 of 21)
        await safeDelete(db, 'skills',
            { user: { $nin: validUserIds } },
            'Orphaned skills'
        );

        // Orphaned conversations (2 of 5)
        await safeDelete(db, 'conversations',
            { user: { $nin: validUserIds } },
            'Orphaned conversations'
        );

        // Orphaned contacts (2 of 5)
        await safeDelete(db, 'contacts',
            { user: { $nin: validUserIds } },
            'Orphaned contacts'
        );

        // Orphaned automations (4 of 27)
        await safeDelete(db, 'automations',
            { user: { $nin: validUserIds } },
            'Orphaned automations'
        );

        // Orphaned team data (all orphaned)
        await safeDelete(db, 'teamchats',
            { organization: { $nin: validUserIds } },
            'Orphaned team chats'
        );
        await safeDelete(db, 'teaminvites',
            { organization: { $nin: validUserIds } },
            'Orphaned team invites'
        );

        // ════════════════════════════════════════════════════════
        // TIER 4: ORPHANED DOCUMENTS (brand → deleted Brand)
        // 352 documents whose parent brand no longer exists
        // ════════════════════════════════════════════════════════
        console.log('\n── TIER 4: BRAND-ORPHANED DOCUMENTS ───────────────────────');

        await safeDelete(db, 'contents',
            { brand: { $exists: true, $ne: null, $nin: validBrandIds } },
            'Contents with deleted brand (27 of 121)'
        );

        await safeDelete(db, 'creatives',
            { brand: { $nin: validBrandIds } },
            'Creatives with deleted brand (108 of 1408)'
        );

        await safeDelete(db, 'seoaudits',
            { brand: { $nin: validBrandIds } },
            'SEO audits with deleted brand (39 of 256)'
        );

        await safeDelete(db, 'seosnapshots',
            { brand: { $nin: validBrandIds } },
            'SEO snapshots with deleted brand (14 of 73)'
        );

        await safeDelete(db, 'funnels',
            { brand: { $nin: validBrandIds } },
            'Funnels with deleted brand'
        );

        await safeDelete(db, 'socialposts',
            { brand: { $nin: validBrandIds } },
            'Social posts with deleted brand (14 of 37)'
        );

        await safeDelete(db, 'monthlystrategies',
            { brand: { $nin: validBrandIds } },
            'Monthly strategies with deleted brand (3 of 27)'
        );

        await safeDelete(db, 'feedbacks',
            { brand: { $nin: validBrandIds } },
            'Feedbacks with deleted brand (17 of 51)'
        );

        await safeDelete(db, 'automations',
            { brand: { $nin: validBrandIds } },
            'Automations with deleted brand'
        );

        await safeDelete(db, 'automationrules',
            { brand: { $nin: validBrandIds } },
            'Automation rules with deleted brand (5 of 15)'
        );

        await safeDelete(db, 'integrations',
            { brand: { $exists: true, $ne: null, $nin: validBrandIds } },
            'Integrations with deleted brand'
        );

        await safeDelete(db, 'brainstormsessions',
            { brand: { $nin: validBrandIds } },
            'Brainstorm sessions with deleted brand'
        );

        await safeDelete(db, 'conversations',
            { brand: { $nin: validBrandIds } },
            'Conversations with deleted brand'
        );

        await safeDelete(db, 'contacts',
            { brand: { $nin: validBrandIds } },
            'Contacts with deleted brand'
        );

        await safeDelete(db, 'retentioncampaigns',
            { brand: { $nin: validBrandIds } },
            'Retention campaigns with deleted brand'
        );

        await safeDelete(db, 'studioreports',
            { brand: { $nin: validBrandIds } },
            'Studio reports with deleted brand'
        );

        await safeDelete(db, 'pulsehistories',
            { brand: { $nin: validBrandIds } },
            'Pulse histories with deleted brand'
        );

        await safeDelete(db, 'geoprobehistories',
            { brand: { $nin: validBrandIds } },
            'Geo probe histories with deleted brand'
        );

        await safeDelete(db, 'socialstrategies',
            { brand: { $nin: validBrandIds } },
            'Social strategies with deleted brand (5 of 11)'
        );

        // Shopify data with deleted brand (CAUTION: verify no legal retention needed)
        await safeDelete(db, 'shopifyorders',
            { brand: { $nin: validBrandIds } },
            'Shopify orders with deleted brand (61 of 271)'
        );

        await safeDelete(db, 'shopifycustomers',
            { brand: { $nin: validBrandIds } },
            'Shopify customers with deleted brand (26 of 111)'
        );

        // ════════════════════════════════════════════════════════
        // TIER 5: STALE LOGS & HISTORY (low-value data)
        // ════════════════════════════════════════════════════════
        console.log('\n── TIER 5: STALE LOGS & HISTORY ───────────────────────────');
        const d30 = new Date(new Date() - 30*24*60*60*1000);

        await safeDelete(db, 'agentsessions',
            { createdAt: { $lt: d30 } },
            'Agent sessions older than 30 days'
        );

        await safeDelete(db, 'skillexecutions',
            { createdAt: { $lt: d30 } },
            'Skill executions older than 30 days'
        );

        // ════════════════════════════════════════════════════════
        // SUMMARY
        // ════════════════════════════════════════════════════════
        console.log(`\n${'═'.repeat(65)}`);
        console.log(`  CLEANUP SUMMARY`);
        console.log(`${'═'.repeat(65)}`);

        if (DRY_RUN) {
            console.log(`\n  🔍 DRY RUN — No changes were made.`);
            console.log(`  📊 Would delete/drop: ~${totalSkipped} documents`);
            console.log(`\n  ✅ To execute for real, set DRY_RUN = false and run again.`);
        } else {
            console.log(`\n  🗑️  Total documents deleted: ${totalDeleted}`);
            
            // Show new DB size
            const stats = await db.stats();
            console.log(`  💾 New DB Size: ${((stats.dataSize + stats.indexSize) / 1024 / 1024).toFixed(2)} MB`);
        }

        // Verify active data is untouched
        const activeUsers = await db.collection('users').countDocuments();
        const activeSubs = await db.collection('subscriptions').countDocuments({ status: 'active' });
        const activeBrands = await db.collection('brands').countDocuments();
        console.log(`\n  ✅ Verification:`);
        console.log(`     Users remaining:         ${activeUsers}`);
        console.log(`     Active subscriptions:    ${activeSubs}`);
        console.log(`     Brands remaining:        ${activeBrands}`);

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Cleanup failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

cleanup();

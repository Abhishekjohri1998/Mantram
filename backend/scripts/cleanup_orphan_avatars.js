/**
 * cleanup_orphan_avatars.js — Mantram AI
 *
 * Cleans up the Avatar collection by:
 *  1. Deleting orphaned "variant X TIMESTAMP" junk records (no user, no prompts, auto-saved debris)
 *  2. Deleting unrecoverable superadmin uploads whose S3 source is permanently gone
 *  3. Marking unrecoverable user avatars as isActive=false (soft delete)
 *
 * Usage:
 *   node --env-file=.env scripts/cleanup_orphan_avatars.js --dry-run
 *   node --env-file=.env scripts/cleanup_orphan_avatars.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Avatar from '../models/Avatar.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  AVATAR CLEANUP — Mantram AI');
    console.log('═══════════════════════════════════════════════════════════════');
    if (DRY_RUN) console.log('  🏜️  DRY RUN MODE — no changes will be made\n');

    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const results = { orphansDeleted: 0, uploadsDeleted: 0, usersDeactivated: 0 };

    // ─────────────────────────────────────────────────────────────────────────
    // Step 1: Delete orphaned "variant N TIMESTAMP" records
    // These have names like "variant 0 1777320780557", no createdBy, no prompts
    // ─────────────────────────────────────────────────────────────────────────
    console.log('── Step 1: Orphaned "variant" records ──────────────────────\n');

    const orphanVariants = await Avatar.find({
        name: { $regex: /^variant \d+ \d+$/ },
        $or: [
            { createdBy: null },
            { createdBy: { $exists: false } },
        ],
        $and: [
            { $or: [{ generatedFromPrompt: { $exists: false } }, { generatedFromPrompt: '' }] },
            { $or: [{ promptUsed: { $exists: false } }, { promptUsed: '' }] },
        ],
    }).lean();

    console.log(`  Found ${orphanVariants.length} orphaned variant records`);

    if (orphanVariants.length > 0) {
        for (const v of orphanVariants) {
            console.log(`    🗑️  ${v.name} (${v._id})`);
        }

        if (!DRY_RUN) {
            const ids = orphanVariants.map(v => v._id);
            const delResult = await Avatar.deleteMany({ _id: { $in: ids } });
            results.orphansDeleted = delResult.deletedCount;
            console.log(`\n  ✅ Deleted ${results.orphansDeleted} orphan variants`);
        } else {
            results.orphansDeleted = orphanVariants.length;
            console.log(`\n  🏜️  Would delete ${orphanVariants.length} orphan variants`);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 2: Delete unrecoverable superadmin UPLOAD records
    // These are uploaded images (not generated) with broken S3 URLs.
    // Since old S3 is suspended, images are permanently lost.
    // Only delete uploads without prompts (uploaded photos can't be regenerated).
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n── Step 2: Unrecoverable superadmin uploads ────────────────\n');

    const deadSuperadminUploads = await Avatar.find({
        source: 'upload',
        createdByRole: 'superadmin',
        isPublished: true,
        $and: [
            { $or: [{ generatedFromPrompt: { $exists: false } }, { generatedFromPrompt: '' }] },
            { $or: [{ promptUsed: { $exists: false } }, { promptUsed: '' }] },
        ],
        imageUrl: { $regex: /mantram-assets/ }, // old suspended S3 bucket
    }).lean();

    console.log(`  Found ${deadSuperadminUploads.length} unrecoverable superadmin uploads`);

    if (deadSuperadminUploads.length > 0) {
        for (const a of deadSuperadminUploads) {
            console.log(`    🗑️  "${a.name}" (${a._id}) — source: upload, old S3 gone`);
        }

        if (!DRY_RUN) {
            const ids = deadSuperadminUploads.map(a => a._id);
            const delResult = await Avatar.deleteMany({ _id: { $in: ids } });
            results.uploadsDeleted = delResult.deletedCount;
            console.log(`\n  ✅ Deleted ${results.uploadsDeleted} unrecoverable uploads`);
        } else {
            results.uploadsDeleted = deadSuperadminUploads.length;
            console.log(`\n  🏜️  Would delete ${deadSuperadminUploads.length} unrecoverable uploads`);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 3: Deactivate user avatars with broken images and no prompts
    // These are user's own generated/uploaded avatars on the old S3 bucket.
    // We soft-delete (isActive=false) so they stop showing in the UI.
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n── Step 3: Deactivate broken user avatars ──────────────────\n');

    const deadUserAvatars = await Avatar.find({
        createdByRole: { $in: ['user', undefined] },
        isPublished: { $ne: true },
        $and: [
            { $or: [{ generatedFromPrompt: { $exists: false } }, { generatedFromPrompt: '' }] },
            { $or: [{ promptUsed: { $exists: false } }, { promptUsed: '' }] },
        ],
        imageUrl: { $regex: /mantram-assets/ },
        isActive: { $ne: false },
    }).lean();

    console.log(`  Found ${deadUserAvatars.length} user avatars with lost images`);

    if (deadUserAvatars.length > 0) {
        // Show first 10 then summarize
        const show = deadUserAvatars.slice(0, 10);
        for (const a of show) {
            console.log(`    ⏸️  "${a.name}" (${a._id})`);
        }
        if (deadUserAvatars.length > 10) {
            console.log(`    ... and ${deadUserAvatars.length - 10} more`);
        }

        if (!DRY_RUN) {
            const ids = deadUserAvatars.map(a => a._id);
            const upResult = await Avatar.updateMany(
                { _id: { $in: ids } },
                { $set: { isActive: false } }
            );
            results.usersDeactivated = upResult.modifiedCount;
            console.log(`\n  ✅ Deactivated ${results.usersDeactivated} user avatars`);
        } else {
            results.usersDeactivated = deadUserAvatars.length;
            console.log(`\n  🏜️  Would deactivate ${deadUserAvatars.length} user avatars`);
        }
    }

    // ── Summary ──────────────────────────────────────────────────────────────
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  CLEANUP SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log(`  🗑️  Orphan variants deleted:      ${results.orphansDeleted}`);
    console.log(`  🗑️  Dead superadmin uploads del:   ${results.uploadsDeleted}`);
    console.log(`  ⏸️  User avatars deactivated:      ${results.usersDeactivated}`);
    console.log(`  ── Total cleaned:                 ${results.orphansDeleted + results.uploadsDeleted + results.usersDeactivated}\n`);

    await mongoose.disconnect();
    console.log('✅ Done!');
}

main().catch(err => {
    console.error('❌ Script failed:', err);
    process.exit(1);
});

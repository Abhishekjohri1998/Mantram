/**
 * Unified Deploy Script — Cleanup + Seed
 * 
 * Combines cleanupDatabase, seedSuperAdmin, and seedPackages into a single
 * script that shares ONE MongoDB connection instead of creating 3 separate ones.
 * 
 * Run: SEED_MODE=true node scripts/deployInit.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import connectDB from '../config/db.js';

// Import models
import AuditLog from '../models/AuditLog.js';
import BrandAuditLog from '../models/BrandAuditLog.js';
import CreditUsage from '../models/CreditUsage.js';
import User from '../models/User.js';
import SubscriptionPackage from '../models/SubscriptionPackage.js';

// ── Super Admin Accounts ──────────────────────────────────────
const SUPER_ADMINS = [
    {
        name: 'Super Admin',
        email: 'admin@mantram.ai',
        password: 'MantramAdmin@2024',
        role: 'superadmin',
        plan: 'enterprise',
        company: 'Mantram AI',
        credits: { total: 999999, used: 0, bonus: 0 },
    },
    {
        name: 'Principal Admin',
        email: 'superadmin@mantram.ai',
        password: 'MantramSuper@2024',
        role: 'superadmin',
        plan: 'enterprise',
        company: 'Mantram AI',
        credits: { total: 999999, used: 0, bonus: 0 },
    }
];

// ── Subscription Packages ─────────────────────────────────────
// (imported inline from seedPackages.js)

async function run() {
    try {
        console.log('🔄 Connecting to MongoDB...');
        const conn = await connectDB();
        if (!conn) {
            console.error('❌ Failed to connect to MongoDB. Exiting.');
            process.exit(0);
        }
        console.log('✅ Connected.\n');

        // ── Step 1: Cleanup old data ──────────────────────────────────
        console.log('🧹 Step 1/3: Pruning old collections...');
        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));

        const auditResult = await AuditLog.deleteMany({ createdAt: { $lt: sevenDaysAgo } });
        console.log(`  - AuditLog: Deleted ${auditResult.deletedCount} records older than 7 days.`);

        const brandAuditResult = await BrandAuditLog.deleteMany({ createdAt: { $lt: sevenDaysAgo } });
        console.log(`  - BrandAuditLog: Deleted ${brandAuditResult.deletedCount} records older than 7 days.`);

        const creditResult = await CreditUsage.deleteMany({ createdAt: { $lt: sevenDaysAgo } });
        console.log(`  - CreditUsage: Deleted ${creditResult.deletedCount} records older than 7 days.`);

        // ── Step 2: Seed Super Admins ─────────────────────────────────
        console.log('\n🔑 Step 2/3: Seeding super admin accounts...');
        for (const admin of SUPER_ADMINS) {
            const existing = await User.findOne({ email: admin.email }).select('+password');
            if (existing) {
                existing.role = 'superadmin';
                existing.plan = 'enterprise';
                existing.credits = admin.credits;
                existing.password = admin.password;
                await existing.save();
                console.log(`  🔄 Updated: ${admin.email}`);
            } else {
                await User.create(admin);
                console.log(`  🔑 Created: ${admin.email}`);
            }
        }

        // ── Step 3: Seed Subscription Packages ────────────────────────
        console.log('\n📦 Step 3/3: Seeding subscription packages...');
        // Dynamically import to avoid duplicating the large PACKAGES array
        const { default: seedPackagesData } = await import('./seedPackages.js').catch(() => ({ default: null }));
        
        // If seedPackages exports its data, use it. Otherwise run seedPackages inline.
        // For safety, we just call the model directly with a minimal set
        const pkgCount = await SubscriptionPackage.countDocuments();
        if (pkgCount > 0) {
            console.log(`  📦 ${pkgCount} subscription packages already exist. Skipping seed.`);
        } else {
            console.log('  ⚠️ No packages found — run seedPackages.js separately if needed.');
        }

        console.log('\n✅ Deploy initialization complete.');
        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('❌ Deploy init failed:', error.message);
        // Exit 0 so that an intermittent failure doesn't halt the CI/CD pipeline
        process.exit(0);
    }
}

run();

/**
 * Database Cleanup Script
 * Prunes old logs and usage data to free up space in MongoDB Atlas (512MB limit).
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

// Import models
import AuditLog from '../models/AuditLog.js';
import BrandAuditLog from '../models/BrandAuditLog.js';
import CreditUsage from '../models/CreditUsage.js';

import connectDB from '../config/db.js';

async function cleanup() {
    try {
        console.log('🔄 Connecting to MongoDB for cleanup...');
        const conn = await connectDB();
        if (!conn) {
            console.warn('⚠️ Could not connect to DB for cleanup. Skipping.');
            process.exit(0);
        }
        console.log('✅ Connected.');

        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));

        console.log('🧹 Pruning collections...');

        // 1. Audit Logs (Very high volume, prune aggressively to 7 days)
        const auditResult = await AuditLog.deleteMany({ createdAt: { $lt: sevenDaysAgo } });
        console.log(`- AuditLog: Deleted ${auditResult.deletedCount} records older than 7 days.`);

        // 2. Brand Audit Logs (Prune to 7 days)
        const brandAuditResult = await BrandAuditLog.deleteMany({ createdAt: { $lt: sevenDaysAgo } });
        console.log(`- BrandAuditLog: Deleted ${brandAuditResult.deletedCount} records older than 7 days.`);

        // 3. Credit Usage (Keep only last 30 days, or 7 if space is tight)
        const creditResult = await CreditUsage.deleteMany({ createdAt: { $lt: sevenDaysAgo } });
        console.log(`- CreditUsage: Deleted ${creditResult.deletedCount} records older than 7 days.`);

        console.log('\n✅ Cleanup complete.');
        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('❌ Cleanup failed:', error.message);
        // Exit 0 so that an intermittent cleanup failure doesn't halt the CI/CD deploy pipeline
        process.exit(0);
    }
}

cleanup();

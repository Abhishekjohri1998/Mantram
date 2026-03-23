/**
 * Verification Script: Provider Budgets
 * This script seeds dummy provider budget data to test the SuperAdmin alerts.
 */
import mongoose from 'mongoose';
import SystemSettings, { setSetting } from '../models/SystemSettings.js';
import connectDB from '../config/db.js';

async function test() {
    await connectDB();
    
    console.log('--- Seeding Test Provider Budgets ---');
    
    const testBudgets = {
        openai: { budget: 1000, consumed: 850, lastUpdate: new Date() }, // 85% - Should trigger Warning
        gemini: { budget: 1000, consumed: 1050, lastUpdate: new Date() }, // 105% - Should trigger Critical
        grok: { budget: 1000, consumed: 10, lastUpdate: new Date() }, // 1% - No Alert
    };

    await setSetting('provider_budgets', testBudgets);
    console.log('✅ Budgets seeded. Log in as SuperAdmin and check the header.');
    
    process.exit(0);
}

test().catch(err => {
    console.error(err);
    process.exit(1);
});

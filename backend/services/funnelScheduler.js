/**
 * Funnel Scheduler — Background automation engine
 * 
 * Runs periodically to:
 * 1. Execute inactivity-based automation rules across all funnels
 * 2. Run score decay for stale leads
 * 3. Execute nurture sequence steps
 * 
 * Started by the main server on boot.
 */

import Funnel from '../models/Funnel.js';
import FunnelEntry from '../models/FunnelEntry.js';
import AutomationRule from '../models/AutomationRule.js';
import { runAutomationRules } from '../routes/funnel-automation.js';
import { runNurtureSequences } from './nurtureRunner.js';


/**
 * Run inactivity-based automation rules across all active funnels
 */
async function runInactivityRules() {
    try {
        // Find funnels that have active inactivity rules
        const inactivityRules = await AutomationRule.find({
            enabled: true,
            'trigger.type': 'inactivity',
        }).distinct('funnel');

        let totalExecuted = 0;
        for (const funnelId of inactivityRules) {
            try {
                const result = await runAutomationRules(funnelId, 'inactivity', {});
                totalExecuted += result.executed || 0;
            } catch (err) {
                console.warn(`[FunnelScheduler] Inactivity rule error for funnel ${funnelId}:`, err.message);
            }
        }

        return totalExecuted;
    } catch (error) {
        console.error('[FunnelScheduler] Inactivity rules error:', error.message);
        return 0;
    }
}


/**
 * Run score decay for all active entries that haven't been updated recently
 */
async function runGlobalScoreDecay() {
    try {
        const staleEntries = await FunnelEntry.find({
            status: 'active',
            updatedAt: { $lt: new Date(Date.now() - 3 * 86400000) }, // Older than 3 days
        }).limit(500);

        let decayed = 0;
        for (const entry of staleEntries) {
            const daysSince = Math.floor((Date.now() - new Date(entry.updatedAt || entry.createdAt)) / 86400000);
            let decay = 0;

            if (daysSince > 30) decay = -15;
            else if (daysSince > 14) decay = -10;
            else if (daysSince > 7) decay = -5;
            else if (daysSince > 3) decay = -2;

            if (decay < 0) {
                const oldScore = entry.score;
                entry.score = Math.max(0, entry.score + decay);
                if (entry.score !== oldScore) {
                    await entry.save();
                    decayed++;
                }
            }
        }

        return decayed;
    } catch (error) {
        console.error('[FunnelScheduler] Score decay error:', error.message);
        return 0;
    }
}


/**
 * Main scheduler tick — runs all funnel background tasks
 */
async function runFunnelSchedulerTick() {
    const startTime = Date.now();

    try {
        // 1. Run nurture sequences (most critical — runs every tick)
        const nurtureResult = await runNurtureSequences();

        // 2. Run inactivity rules (check stale leads)
        const inactivityExecuted = await runInactivityRules();

        // 3. Run score decay
        const decayed = await runGlobalScoreDecay();

        const elapsed = Date.now() - startTime;

        // Only log if something happened
        if (nurtureResult.delivered > 0 || inactivityExecuted > 0 || decayed > 0) {
            console.log(`📊 Funnel Scheduler: nurture=${nurtureResult.delivered} sent, automation=${inactivityExecuted} executed, decay=${decayed} entries (${elapsed}ms)`);
        }

    } catch (error) {
        console.error('[FunnelScheduler] Tick error:', error.message);
    }
}


/**
 * Start the funnel scheduler
 * Runs every 10 minutes for nurture + automation
 */
export function startFunnelScheduler() {
    // Run immediately on start
    setTimeout(() => {
        runFunnelSchedulerTick().catch(err => console.warn('[FunnelScheduler] Initial tick failed:', err.message));
    }, 30_000); // 30 second delay after server start

    // Then run every 10 minutes
    const INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
    setInterval(() => {
        runFunnelSchedulerTick().catch(err => console.warn('[FunnelScheduler] Tick failed:', err.message));
    }, INTERVAL_MS);

    console.log('🌱 Funnel Scheduler active (every 10 minutes)');
}

export default { startFunnelScheduler };

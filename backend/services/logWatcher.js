#!/usr/bin/env node
/**
 * Mantram AI — Autonomous Log Watcher & Auto-Fix Agent
 *
 * Runs as a standalone PM2 process. Tails the production log files,
 * detects actionable errors, sends them to Claude for analysis,
 * and creates GitHub PRs with the fixes.
 *
 * Usage:
 *   pm2 start backend/services/logWatcher.js --name mantram-autofix
 *
 * Environment Variables:
 *   AUTOFIX_ENABLED         — "true" to enable (default: false)
 *   AUTOFIX_DRY_RUN         — "true" to log without creating PRs
 *   ANTHROPIC_API_KEY       — Claude API key
 *   GITHUB_PAT              — GitHub Personal Access Token
 *   GITHUB_REPO             — owner/repo (default: Abhishekjohri1998/Mantram)
 *   AUTOFIX_APP_ROOT        — Path to the app root (default: ~/Mantram)
 *   AUTOFIX_COOLDOWN_HOURS  — Hours before same error re-triggers (default: 6)
 *   AUTOFIX_MAX_DAILY_PRS   — Max PRs per 24h (default: 10)
 *   AUTOFIX_NOTIFY_EMAIL    — Email to send PR alerts to
 *   AUTOFIX_MODEL           — Claude model (default: claude-sonnet-4-6)
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { classifyError, errorHash } from './errorClassifier.js';
import { analyzeError } from './errorAnalyzer.js';
import { createFixPR } from './autofixPR.js';

// ── Load .env if dotenv is available ──────────────────────────────────────
try {
    // Try multiple possible .env locations (deployment symlinks, cwd, etc.)
    const possibleEnvPaths = [
        path.resolve(process.cwd(), 'backend/.env'),    // When cwd is repo root (~/Mantram)
        path.resolve(process.cwd(), '.env'),             // When cwd is backend/
        path.resolve(process.env.HOME || '/home/ec2-user', 'Mantram/backend/.env'), // Absolute fallback
    ];
    for (const envPath of possibleEnvPaths) {
        if (fs.existsSync(envPath)) {
            const { config } = await import('dotenv');
            config({ path: envPath });
            console.log(`📄 Loaded .env from: ${envPath}`);
            break;
        }
    }
} catch (_) { /* dotenv not available — rely on PM2 env injection */ }

// ── Configuration ─────────────────────────────────────────────────────────
const CONFIG = {
    enabled:        process.env.AUTOFIX_ENABLED === 'true',
    dryRun:         process.env.AUTOFIX_DRY_RUN === 'true',
    appRoot:        process.env.AUTOFIX_APP_ROOT || path.resolve(process.env.HOME || '/home/ec2-user', 'Mantram'),
    cooldownMs:     (parseInt(process.env.AUTOFIX_COOLDOWN_HOURS, 10) || 6) * 60 * 60 * 1000,
    maxDailyPRs:    parseInt(process.env.AUTOFIX_MAX_DAILY_PRS, 10) || 10,
    debounceMs:     30_000,     // 30s grouping window for error lines
    logPaths:       [],         // Populated below
};

// Resolve log file paths
const sharedLogs = '/var/www/mantram/shared/logs';
const homeLogs = path.join(CONFIG.appRoot, 'backend/logs');
const pm2Logs = path.join(process.env.HOME || '/home/ec2-user', '.pm2/logs');

// Files to EXCLUDE — prevent feedback loops (agent tailing its own output)
const EXCLUDED_LOG_PATTERNS = [
    /autofix/i,              // Our own logs
    /ecosystem\.autofix/i,   // Stale PM2 logs from old process name
];

/**
 * Scan all log directories and return deduplicated list of valid log file paths.
 * Reusable for both initial boot and periodic re-scans.
 */
function rescanLogDirs() {
    const paths = [];
    for (const dir of [sharedLogs, homeLogs, pm2Logs]) {
        if (fs.existsSync(dir)) {
            const files = fs.readdirSync(dir).filter(f => {
                if (!f.endsWith('.log')) return false;
                if (EXCLUDED_LOG_PATTERNS.some(p => p.test(f))) return false;
                return true;
            });
            for (const f of files) {
                paths.push(path.join(dir, f));
            }
        }
    }
    // Fallback: default PM2 log locations
    if (paths.length === 0) {
        const defaultPaths = [
            `${pm2Logs}/mantram-server-out.log`,
            `${pm2Logs}/mantram-server-error.log`,
        ];
        for (const p of defaultPaths) {
            if (fs.existsSync(p)) paths.push(p);
        }
    }
    return paths;
}

// Perform initial scan
CONFIG.logPaths = rescanLogDirs();

// ── State ─────────────────────────────────────────────────────────────────
const processedHashes = new Map();   // hash -> last processed timestamp
let dailyPRCount = 0;
let dailyResetTime = Date.now();
let errorBuffer = [];
let flushTimer = null;
let isProcessing = false;
const processingQueue = [];
let tailProcess = null;       // Module-level handle for kill/restart
let rescanInterval = null;    // Periodic re-scan timer
let healthInterval = null;    // Health check timer

// ── Boot ──────────────────────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════');
console.log('🔍 Mantram AI — Auto-Fix Log Watcher Agent');
console.log('═══════════════════════════════════════════════════');
console.log(`   Enabled:     ${CONFIG.enabled}`);
console.log(`   Dry Run:     ${CONFIG.dryRun}`);
console.log(`   App Root:    ${CONFIG.appRoot}`);
console.log(`   Cooldown:    ${CONFIG.cooldownMs / 3600000}h`);
console.log(`   Max PRs/day: ${CONFIG.maxDailyPRs}`);
console.log(`   Log Files:   ${CONFIG.logPaths.length > 0 ? CONFIG.logPaths.join(', ') : '(none found — will retry)'}`);
console.log(`   Model:       ${process.env.AUTOFIX_MODEL || 'claude-sonnet-4-6'}`);
console.log('═══════════════════════════════════════════════════');

if (!CONFIG.enabled) {
    console.log('⚠️ AutoFix is DISABLED. Set AUTOFIX_ENABLED=true in .env to activate.');
    console.log('   Agent will stay alive and re-check every 60s in case config changes...');
    setInterval(() => {
        if (process.env.AUTOFIX_ENABLED === 'true') {
            console.log('✅ AutoFix ENABLED detected — restarting to activate...');
            process.exit(0); // PM2 will restart us
        }
    }, 60000);
} else {
    // ── Validate required credentials at startup ──────────────────────────
    const missingKeys = [];
    if (!process.env.ANTHROPIC_API_KEY) missingKeys.push('ANTHROPIC_API_KEY');
    if (!process.env.GITHUB_PAT) missingKeys.push('GITHUB_PAT');
    
    if (missingKeys.length > 0) {
        console.log(`⚠️ AutoFix: Missing required env vars: ${missingKeys.join(', ')}`);
        console.log('   The agent will detect errors but CANNOT create PRs until these are set.');
        console.log('   Add them to backend/.env and restart: pm2 restart mantram-autofix');
        if (CONFIG.dryRun) {
            console.log('   (Dry run mode is ON — will still log detections)');
        }
    } else {
        console.log('✅ API Keys: ANTHROPIC_API_KEY ✓ | GITHUB_PAT ✓');
    }
    
    startWatching();
}

// ── Main: Start tailing logs ──────────────────────────────────────────────
function startWatching() {
    // Re-scan in case paths are stale
    if (CONFIG.logPaths.length === 0) {
        CONFIG.logPaths = rescanLogDirs();
    }

    if (CONFIG.logPaths.length === 0) {
        console.log('⚠️ No log files found. Retrying in 30s...');
        setTimeout(() => {
            CONFIG.logPaths = rescanLogDirs();
            if (CONFIG.logPaths.length > 0) startWatching();
            else {
                console.error('❌ Still no log files found. Check PM2 log paths.');
                process.exit(1);
            }
        }, 30000);
        return;
    }

    console.log(`🔍 Tailing ${CONFIG.logPaths.length} log file(s)...`);

    // Use tail -F (capital F follows file renames/rotations)
    tailProcess = spawn('tail', ['-F', '-n', '0', ...CONFIG.logPaths], {
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    tailProcess.stdout.on('data', (chunk) => {
        const lines = chunk.toString('utf-8').split('\n').filter(Boolean);
        for (const line of lines) {
            onLogLine(line);
        }
    });

    tailProcess.stderr.on('data', (chunk) => {
        // tail stderr messages (file truncated, etc.) — ignore
        const msg = chunk.toString('utf-8').trim();
        if (msg && !msg.includes('file truncated')) {
            console.log(`[tail] ${msg}`);
        }
    });

    tailProcess.on('close', (code) => {
        tailProcess = null;
        console.error(`❌ tail process exited with code ${code}. Restarting in 5s...`);
        setTimeout(startWatching, 5000);
    });

    tailProcess.on('error', (err) => {
        tailProcess = null;
        console.error('❌ tail spawn error:', err.message);
        setTimeout(startWatching, 5000);
    });

    // ── Periodic re-scan for NEW log files (every 2 minutes) ──────────────
    // After redeployments, PM2 creates new process IDs → new log files.
    // tail -F can't discover brand-new files, so we must restart it.
    if (rescanInterval) clearInterval(rescanInterval);
    rescanInterval = setInterval(() => {
        const freshPaths = rescanLogDirs();
        const newFiles = freshPaths.filter(f => !CONFIG.logPaths.includes(f));
        if (newFiles.length > 0) {
            console.log(`🔄 AutoFix: Discovered ${newFiles.length} new log file(s): ${newFiles.map(f => path.basename(f)).join(', ')}`);
            console.log('   Restarting tail to include new files...');
            CONFIG.logPaths = freshPaths;
            // Kill current tail — the 'close' handler will call startWatching()
            if (tailProcess) {
                tailProcess.removeAllListeners('close'); // Prevent double-restart
                tailProcess.kill();
                tailProcess = null;
                setTimeout(startWatching, 1000);
            }
        }
    }, 120_000); // Every 2 minutes

    // ── Periodic health logging (every 5 minutes) ─────────────────────────
    if (healthInterval) clearInterval(healthInterval);
    healthInterval = setInterval(() => {
        console.log(`📊 AutoFix Health: ${dailyPRCount}/${CONFIG.maxDailyPRs} PRs today | ${processedHashes.size} errors in cooldown | Buffer: ${errorBuffer.length} lines | Tailing: ${CONFIG.logPaths.length} files`);
        
        // Reset daily counter
        if (Date.now() - dailyResetTime > 86400000) {
            dailyPRCount = 0;
            dailyResetTime = Date.now();
            console.log('🔄 Daily PR counter reset');
        }

        // Purge expired cooldowns
        const now = Date.now();
        for (const [hash, ts] of processedHashes) {
            if (now - ts > CONFIG.cooldownMs) processedHashes.delete(hash);
        }
    }, 300000); // Every 5 minutes
}

// ── Process individual log lines ──────────────────────────────────────────
function onLogLine(line) {
    // Quick reject: is this an error-related line?
    if (!isErrorLine(line)) return;

    errorBuffer.push(line);

    // Reset the debounce timer — wait for more related lines
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => flushErrorBatch(), CONFIG.debounceMs);

    // Safety: flush if buffer gets too large (prevent memory bloat)
    if (errorBuffer.length > 100) {
        clearTimeout(flushTimer);
        flushErrorBatch();
    }
}

/**
 * Check if a log line looks like an error (quick pre-filter before classification).
 */
function isErrorLine(line) {
    return (
        /❌|🚨|Error:|TypeError:|ReferenceError:|SyntaxError:|ValidationError:|CastError:/i.test(line) ||
        /unhandledRejection|uncaughtException|FATAL|Server Error:/i.test(line) ||
        /^\s+at\s+/i.test(line) || // Stack trace line
        /Failed to|Cannot |failed:/i.test(line)
    );
}

// ── Flush the error buffer and process as a batch ─────────────────────────
function flushErrorBatch() {
    if (errorBuffer.length === 0) return;

    const batch = errorBuffer.splice(0); // Take all lines and clear buffer
    const errorText = batch.join('\n');

    // Classify
    const classification = classifyError(errorText);

    if (!classification.isActionable) {
        if (classification.category !== 'NORMAL') {
            console.log(`🔇 AutoFix: Ignored ${classification.category} error (confidence: ${classification.confidence})`);
        }
        return;
    }

    // Deduplicate via hash
    const hash = errorHash(errorText);
    const lastProcessed = processedHashes.get(hash);
    if (lastProcessed && (Date.now() - lastProcessed < CONFIG.cooldownMs)) {
        console.log(`🔇 AutoFix: Duplicate error (hash: ${hash}) — in cooldown until ${new Date(lastProcessed + CONFIG.cooldownMs).toISOString()}`);
        return;
    }

    // Daily PR limit
    if (dailyPRCount >= CONFIG.maxDailyPRs) {
        console.log(`🛑 AutoFix: Daily PR limit reached (${CONFIG.maxDailyPRs}). Skipping until reset.`);
        return;
    }

    // Queue for processing
    const errorEvent = {
        errorText,
        category: classification.category,
        confidence: classification.confidence,
        hash,
        timestamp: new Date().toISOString(),
    };

    console.log(`\n🔍 AutoFix: Detected ${classification.category} error (confidence: ${classification.confidence})`);
    console.log(`   Hash: ${hash}`);
    console.log(`   Preview: ${errorText.split('\n')[0].substring(0, 120)}`);

    // Mark as processing immediately to prevent re-queuing during analysis
    processedHashes.set(hash, Date.now());

    processingQueue.push(errorEvent);
    processQueue();
}

// ── Sequential queue processor ────────────────────────────────────────────
async function processQueue() {
    if (isProcessing || processingQueue.length === 0) return;
    isProcessing = true;

    while (processingQueue.length > 0) {
        const event = processingQueue.shift();
        try {
            await processErrorEvent(event);
        } catch (err) {
            console.error(`❌ AutoFix: Processing failed for ${event.hash}:`, err.message);
        }

        // Small delay between processing events
        await sleep(2000);
    }

    isProcessing = false;
}

// ── Process a single error event ──────────────────────────────────────────
async function processErrorEvent(errorEvent) {
    console.log(`\n🤖 AutoFix: Analyzing error ${errorEvent.hash}...`);

    // ── 1. Send to Claude for analysis ────────────────────────────────────
    const fixResult = await analyzeError(errorEvent, {
        appRoot: CONFIG.appRoot,
    });

    if (!fixResult.canFix) {
        console.log(`🔇 AutoFix: Claude says this is not auto-fixable.`);
        console.log(`   Root Cause: ${fixResult.rootCause}`);
        console.log(`   Reason: ${fixResult.explanation}`);
        return;
    }

    console.log(`✅ AutoFix: Fix identified!`);
    console.log(`   Root Cause: ${fixResult.rootCause}`);
    console.log(`   Confidence: ${Math.round(fixResult.confidence * 100)}%`);
    console.log(`   Changes: ${fixResult.changes.length} file(s)`);

    // ── 2. Dry run check ──────────────────────────────────────────────────
    if (CONFIG.dryRun) {
        console.log(`\n🏜️ DRY RUN — Would create PR with:`);
        console.log(`   Title: 🤖 Auto-Fix: ${fixResult.rootCause.substring(0, 80)}`);
        for (const change of fixResult.changes) {
            console.log(`   File: ${change.file}`);
            console.log(`   Search: ${change.search.substring(0, 100)}...`);
            console.log(`   Replace: ${change.replace.substring(0, 100)}...`);
        }
        return;
    }

    // ── 3. Create PR ──────────────────────────────────────────────────────
    const prResult = await createFixPR(fixResult, errorEvent, {
        appRoot: CONFIG.appRoot,
    });

    if (prResult.success) {
        dailyPRCount++;
        console.log(`\n🎉 AutoFix: PR #${dailyPRCount} created successfully!`);
        console.log(`   URL: ${prResult.prUrl}`);
        console.log(`   Branch: ${prResult.branchName}`);
    } else {
        console.error(`❌ AutoFix: PR creation failed:`, prResult.error);
        // Remove from cooldown so it can retry later
        processedHashes.delete(errorEvent.hash);
    }
}

// ── Utility ───────────────────────────────────────────────────────────────
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Graceful shutdown ─────────────────────────────────────────────────────
process.on('SIGTERM', () => {
    console.log('\n🛑 AutoFix: Shutting down gracefully...');
    process.exit(0);
});
process.on('SIGINT', () => {
    console.log('\n🛑 AutoFix: Interrupted. Shutting down...');
    process.exit(0);
});
process.on('unhandledRejection', (reason) => {
    console.error('🚨 AutoFix: Unhandled rejection:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('🚨 AutoFix: Uncaught exception:', err);
    process.exit(1);
});

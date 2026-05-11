/**
 * Generation Fingerprint Engine
 *
 * Phase 4A — Background Intelligence
 *
 * Tracks the last N generations per brand and produces a diversity directive:
 *   "You've used [studio] + [urban] + [high-contrast] recently. Use something different."
 *
 * Architecture:
 *   - L1: In-process Map (instant, expires per-PM2 worker)
 *   - L2: Redis (shared across workers, 24h TTL)
 *
 * Zero latency on the critical path — fingerprint is checked BEFORE generation starts
 * and returns synchronously from L1 memory on warm cache hits.
 *
 * Usage:
 *   import { getEnvironmentDiversityDirective, recordGeneration } from './generationFingerprint.js';
 *
 *   // Before generation — get the anti-repeat directive
 *   const directive = await getEnvironmentDiversityDirective(brandId);
 *   // directive = "Your last 3 generations used studio backdrop + dark backgrounds. This generation: choose something different."
 *
 *   // After a successful generation — record what was used
 *   await recordGeneration(brandId, { environment: 'studio', lighting: 'dark', hasHuman: false });
 */

import redis from '../../utils/redisClient.js';

// ─────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────
const FINGERPRINT_TTL  = 86400;   // 24h in Redis
const MEM_TTL          = 300_000; // 5 minutes in-process
const MAX_HISTORY      = 5;       // Track last 5 generations per brand
const REDIS_PREFIX     = 'gen:fp:';

// L1 in-process cache
const _memCache = new Map(); // brandId -> { history, expiry }

// ─────────────────────────────────────────────────────────
// Internal Helpers
// ─────────────────────────────────────────────────────────

/**
 * Read fingerprint history for a brand.
 * Returns array of { environment, lighting, hasHuman, timestamp }
 */
async function readHistory(brandId) {
    const memKey = `fp:${brandId}`;
    const cached = _memCache.get(memKey);
    if (cached && Date.now() < cached.expiry) {
        return cached.history;
    }
    // L2: Redis
    try {
        const raw = await redis.get(`${REDIS_PREFIX}${brandId}`);
        if (raw) {
            const history = JSON.parse(raw);
            _memCache.set(memKey, { history, expiry: Date.now() + MEM_TTL });
            return history;
        }
    } catch (_) { /* Redis unavailable — degrade gracefully */ }
    return [];
}

/**
 * Write updated fingerprint history back to both caches.
 */
async function writeHistory(brandId, history) {
    const memKey = `fp:${brandId}`;
    _memCache.set(memKey, { history, expiry: Date.now() + MEM_TTL });
    try {
        await redis.setex(`${REDIS_PREFIX}${brandId}`, FINGERPRINT_TTL, JSON.stringify(history));
    } catch (_) { /* non-critical */ }
}

// ─────────────────────────────────────────────────────────
// Exported API
// ─────────────────────────────────────────────────────────

/**
 * Record a completed generation in the fingerprint history.
 * Call this AFTER the image is successfully generated (non-blocking).
 *
 * @param {string} brandId
 * @param {{ environment: string, lighting: string, hasHuman: boolean, mood?: string }} fingerprint
 */
export async function recordGeneration(brandId, fingerprint) {
    if (!brandId) return;
    try {
        const history = await readHistory(brandId);
        const entry = {
            ...fingerprint,
            timestamp: Date.now(),
        };
        // Prepend and cap at MAX_HISTORY
        const updated = [entry, ...history].slice(0, MAX_HISTORY);
        await writeHistory(brandId, updated);
        console.log(`🖐️ [Fingerprint] Recorded for ${brandId}: env=${entry.environment}, lighting=${entry.lighting}, human=${entry.hasHuman}`);
    } catch (err) {
        console.warn(`⚠️ [Fingerprint] Record failed (non-blocking): ${err.message}`);
    }
}

/**
 * Get an anti-repeat diversity directive for injection into the Creative Director prompt.
 * Returns null if no history exists yet (first generation, or Redis down).
 *
 * @param {string} brandId
 * @returns {string|null} A directive string to inject into the prompt, or null if no history.
 */
export async function getEnvironmentDiversityDirective(brandId) {
    if (!brandId) return null;
    try {
        const history = await readHistory(brandId);
        if (!history || history.length < 2) return null; // Need at least 2 to detect repetition

        // Count environment frequencies in recent history
        const envCounts = {};
        const lightingCounts = {};
        let humanCount = 0;
        let nonHumanCount = 0;

        for (const entry of history) {
            if (entry.environment) envCounts[entry.environment] = (envCounts[entry.environment] || 0) + 1;
            if (entry.lighting) lightingCounts[entry.lighting] = (lightingCounts[entry.lighting] || 0) + 1;
            if (entry.hasHuman) humanCount++;
            else nonHumanCount++;
        }

        const dominantEnv = Object.entries(envCounts).sort((a, b) => b[1] - a[1])[0];
        const dominantLighting = Object.entries(lightingCounts).sort((a, b) => b[1] - a[1])[0];

        const avoidItems = [];

        // Environment: flag if used 2+ times in last 5 gens
        if (dominantEnv && dominantEnv[1] >= 2) {
            avoidItems.push(`"${dominantEnv[0]}" environment (used ${dominantEnv[1]}x recently)`);
        }
        // Lighting: flag if used 2+ times
        if (dominantLighting && dominantLighting[1] >= 2) {
            avoidItems.push(`"${dominantLighting[0]}" lighting (used ${dominantLighting[1]}x recently)`);
        }
        // Human/no-human: flag if used 3+ times in a row
        if (humanCount >= 3) avoidItems.push('human subjects (used in last several generations — try product-only)');
        if (nonHumanCount >= 3) avoidItems.push('product-only composition (no people used recently — include a person)');

        if (avoidItems.length === 0) return null;

        return [
            `⚡ DIVERSITY DIRECTIVE — RECENT GENERATIONS ANALYSIS:`,
            `This brand has repeated these choices too often: ${avoidItems.join(' | ')}`,
            `This generation MUST use a completely different environment, lighting treatment, and human/no-human decision.`,
            `Fresh visual variety prevents feed monotony and improves engagement.`,
        ].join('\n');

    } catch (err) {
        console.warn(`⚠️ [Fingerprint] Directive fetch failed (non-blocking): ${err.message}`);
        return null;
    }
}

/**
 * Extract a fingerprint from the pipeline state after generation.
 * Parses artDirection and visualGrounding to build a compact fingerprint record.
 *
 * @param {object} pipelineResult - Result from runCreativePipeline
 * @returns {{ environment: string, lighting: string, hasHuman: boolean, mood: string }}
 */
export function extractFingerprintFromPipelineResult(pipelineResult) {
    const ad = pipelineResult?.artDirection || {};
    const prompt = (pipelineResult?.finalPrompt || '').toLowerCase();

    // Environment classification
    let environment = 'unknown';
    if (/studio|backdrop|white background|clean background/i.test(prompt)) environment = 'studio';
    else if (/outdoor|nature|park|garden|street|urban|city/i.test(prompt)) environment = 'outdoor';
    else if (/lifestyle|home|interior|kitchen|living/i.test(prompt)) environment = 'lifestyle';
    else if (/abstract|conceptual|geometric|minimal/i.test(prompt)) environment = 'conceptual';
    else if (ad.environment) environment = ad.environment.toLowerCase();

    // Lighting classification
    let lighting = 'neutral';
    if (/dark|neon|dramatic|low.key/i.test(prompt)) lighting = 'dark-dramatic';
    else if (/golden hour|warm|sunset|sunrise/i.test(prompt)) lighting = 'warm-golden';
    else if (/bright|high.key|clean|airy/i.test(prompt)) lighting = 'bright-clean';
    else if (/soft|diffused|natural light/i.test(prompt)) lighting = 'soft-natural';
    else if (ad.lighting) lighting = ad.lighting.toLowerCase().split(' ')[0];

    // Human presence
    const hasHuman =
        /person|people|woman|man|girl|boy|model|human|face|portrait|casting/i.test(prompt) ||
        ad.humanSubject === true;

    return {
        environment,
        lighting,
        hasHuman,
        mood: ad.mood || '',
    };
}

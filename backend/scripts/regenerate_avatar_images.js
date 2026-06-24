/**
 * regenerate_avatar_images.js — Mantram AI
 *
 * Finds ALL avatars with broken/inaccessible image URLs that have
 * prompts (generatedFromPrompt or promptUsed) and regenerates them,
 * uploading to the current S3 bucket so signed URLs work.
 *
 * Also handles the old `mantram-assets` bucket → new `mantram-ai-generated-media` migration.
 *
 * Usage:
 *   node --env-file=.env scripts/regenerate_avatar_images.js
 *   node --env-file=.env scripts/regenerate_avatar_images.js --dry-run
 *   node --env-file=.env scripts/regenerate_avatar_images.js --start=5
 *   node --env-file=.env scripts/regenerate_avatar_images.js --only=3
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import Avatar from '../models/Avatar.js';
import { ensureS3Url } from '../utils/s3.js';
import config from '../config/env.js';

dotenv.config();

const LAOZHANG_API_KEY  = process.env.LAOZHANG_API_KEY;
const LAOZHANG_BASE_URL = process.env.LAOZHANG_BASE_URL || 'https://api.laozhang.ai/v1';
const MONGODB_URI       = process.env.MONGODB_URI;
const DELAY_MS          = 8000;  // 8s between generations to avoid rate limits

const DRY_RUN         = process.argv.includes('--dry-run');
const SUPERADMIN_ONLY = process.argv.includes('--superadmin-only');
const MAX_RETRIES     = 3;
const START_AT = parseInt(process.argv.find(a => a.startsWith('--start='))?.split('=')[1] || '0');
const ONLY     = parseInt(process.argv.find(a => a.startsWith('--only='))?.split('=')[1] || '0');
const sleep    = (ms) => new Promise(r => setTimeout(r, ms));

// ── Check if URL is accessible ────────────────────────────────────────────────
async function isUrlAccessible(url) {
    if (!url || typeof url !== 'string' || url.trim() === '') return false;
    if (url.startsWith('data:')) return true;
    try {
        const resp = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(8000), redirect: 'follow' });
        return resp.ok;
    } catch { return false; }
}

// ── Check if URL is on the OLD bucket (will 403 without signing) ──────────────
function isOldBucketUrl(url) {
    if (!url) return false;
    return url.includes('mantram-assets') && !url.includes(config.aws.bucket);
}

// ── Generate image via GPT Image 2 ───────────────────────────────────────────
async function generateImage(prompt, aspectRatio = '9:16') {
    if (!LAOZHANG_API_KEY) throw new Error('LAOZHANG_API_KEY not configured');

    const sizeMap = { '9:16': '1024x1792', '1:1': '1024x1024', '16:9': '1792x1024', '4:5': '1024x1280' };
    const size = sizeMap[aspectRatio] || '1024x1792';

    const body = {
        model: 'gpt-image-2',
        prompt,
        n: 1,
        size,
        response_format: 'url',
        quality: 'high',
        output_format: 'webp',
    };

    const resp = await fetch(`${LAOZHANG_BASE_URL}/images/generations`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${LAOZHANG_API_KEY}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(180_000),
    });

    if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`API error (${resp.status}): ${errText.substring(0, 300)}`);
    }

    const data = await resp.json();
    const imageData = data.data?.[0];
    if (!imageData) throw new Error('API returned no image data');

    if (imageData.url) return imageData.url;
    if (imageData.b64_json) {
        let b64 = imageData.b64_json;
        if (b64.startsWith('data:')) b64 = b64.substring(b64.indexOf(',') + 1);
        return `data:image/webp;base64,${b64}`;
    }
    throw new Error('No image in response');
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN
// ══════════════════════════════════════════════════════════════════════════════

async function main() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  AVATAR IMAGE REGENERATOR — Mantram AI');
    console.log('═══════════════════════════════════════════════════════════════');
    if (DRY_RUN) console.log('  🏜️  DRY RUN MODE');
    console.log('');

    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // ── Step 1: Find avatars with prompts ─────────────────────────────────────
    const query = {
        $or: [
            { generatedFromPrompt: { $exists: true, $ne: '' } },
            { promptUsed: { $exists: true, $ne: '' } }
        ]
    };
    if (SUPERADMIN_ONLY) {
        query.createdByRole = 'superadmin';
        query.isPublished = true;
        console.log('🔒 Filtering: superadmin-published avatars only\n');
    }
    const allAvatars = await Avatar.find(query).lean();

    console.log(`📋 Total avatars with prompts: ${allAvatars.length}`);

    // ── Step 2: Check which ones have broken images ─────────────────────────
    console.log('🔍 Checking image accessibility (this may take a moment)...\n');
    const broken = [];

    for (const av of allAvatars) {
        const url = av.imageUrl;
        const isOld = isOldBucketUrl(url);
        const accessible = isOld ? false : await isUrlAccessible(url);  // Old bucket = always broken

        if (!accessible) {
            broken.push(av);
        }
    }

    console.log(`❌ Broken/inaccessible avatars with prompts: ${broken.length}`);
    console.log(`✅ Already working: ${allAvatars.length - broken.length}\n`);

    if (broken.length === 0) {
        console.log('🎉 All avatars with prompts have working images!');
        await mongoose.disconnect();
        return;
    }

    // ── Step 3: Apply pagination ────────────────────────────────────────────
    let toProcess = broken.slice(START_AT);
    if (ONLY > 0) toProcess = toProcess.slice(0, ONLY);

    console.log(`🎯 Processing ${toProcess.length} avatars (start=${START_AT}, only=${ONLY || 'all'})\n`);

    // ── Step 4: Regenerate with retry logic ──────────────────────────────────
    const results = { success: 0, failed: 0, skipped: 0, failedNames: [] };
    const startTime = Date.now();

    for (let i = 0; i < toProcess.length; i++) {
        const av = toProcess[i];
        const prompt = av.generatedFromPrompt || av.promptUsed || '';
        const progress = `[${i + 1}/${toProcess.length}]`;
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        const avgPerItem = i > 0 ? (Date.now() - startTime) / i : 15000;
        const eta = ((toProcess.length - i) * avgPerItem / 1000 / 60).toFixed(1);

        console.log(`\n${progress} ─── "${av.name}" (${av._id}) ─── [${elapsed}s elapsed, ~${eta}min remaining]`);
        console.log(`  📝 Prompt: "${prompt.substring(0, 100)}..."`);
        console.log(`  🔗 Old URL: "${(av.imageUrl || '').substring(0, 80)}"`);

        if (!prompt.trim()) {
            console.log(`  ⏭️  SKIP — no prompt available`);
            results.skipped++;
            continue;
        }

        if (DRY_RUN) {
            console.log(`  🏜️  DRY RUN — would regenerate`);
            results.success++;
            continue;
        }

        // Retry loop — up to MAX_RETRIES attempts
        let succeeded = false;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const resolution = av.resolution || '9:16';
                if (attempt > 1) console.log(`  🔄 Retry attempt ${attempt}/${MAX_RETRIES}...`);
                console.log(`  🎭 Generating with GPT Image 2 (${resolution})...`);
                const imageResult = await generateImage(prompt, resolution);
                console.log(`  ✅ Image generated`);

                // Upload to S3
                const s3Key = `avatar-studio/regen-${av.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}`;
                const s3Url = await ensureS3Url(imageResult, s3Key);
                console.log(`  📤 S3: ${s3Url.substring(0, 80)}...`);

                // Update database
                await Avatar.updateOne({ _id: av._id }, { $set: { imageUrl: s3Url } });
                console.log(`  💾 Updated DB ✅`);
                results.success++;
                succeeded = true;
                break; // success — exit retry loop

            } catch (err) {
                console.error(`  ❌ Attempt ${attempt} FAILED: ${err.message}`);

                if (err.message.includes('429') || err.message.includes('rate limit')) {
                    console.log(`  ⏳ Rate limited — cooling down 30s before retry...`);
                    await sleep(30_000);
                } else if (attempt < MAX_RETRIES) {
                    console.log(`  ⏳ Waiting ${DELAY_MS / 1000}s before retry...`);
                    await sleep(DELAY_MS);
                }
            }
        }

        if (!succeeded) {
            results.failed++;
            results.failedNames.push(av.name);
        }

        // Delay between avatars
        if (i < toProcess.length - 1) {
            console.log(`  ⏳ Waiting ${DELAY_MS / 1000}s...`);
            await sleep(DELAY_MS);
        }
    }

    // ── Summary ──────────────────────────────────────────────────────────────
    console.log('\n\n═══════════════════════════════════════════════════════════════');
    console.log('  REGENERATION SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log(`  ✅ Regenerated: ${results.success}`);
    console.log(`  ⏭️  Skipped:     ${results.skipped}`);
    console.log(`  ❌ Failed:      ${results.failed}`);
    console.log(`  ── Total:       ${toProcess.length}`);
    console.log(`  ⏱️  Duration:    ${((Date.now() - Date.now()) / 1000 / 60).toFixed(1)} min\n`);

    if (results.failedNames.length > 0) {
        console.log('  ── Failed avatars (after retries) ──');
        for (const name of results.failedNames) {
            console.log(`    ❌ ${name}`);
        }
        console.log('');
    }

    await mongoose.disconnect();
    console.log('✅ Done!');
}

main().catch(err => {
    console.error('❌ Script failed:', err);
    process.exit(1);
});

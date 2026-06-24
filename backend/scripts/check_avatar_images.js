/**
 * check_avatar_images.js — Diagnostic script
 * Finds all avatars with missing, broken, or empty image URLs
 * and checks which ones have prompts available for regeneration.
 *
 * Usage: node --env-file=.env scripts/check_avatar_images.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import Avatar from '../models/Avatar.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

async function checkUrl(url, timeout = 10000) {
    if (!url || typeof url !== 'string' || url.trim() === '') return { ok: false, reason: 'empty_url' };
    if (url.startsWith('data:')) return { ok: true, reason: 'base64' };
    
    try {
        const resp = await fetch(url, { 
            method: 'HEAD', 
            signal: AbortSignal.timeout(timeout),
            redirect: 'follow'
        });
        if (resp.ok) return { ok: true, reason: 'accessible' };
        return { ok: false, reason: `http_${resp.status}` };
    } catch (err) {
        return { ok: false, reason: err.message.substring(0, 80) };
    }
}

async function main() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  AVATAR IMAGE DIAGNOSTIC — Mantram AI');
    console.log('═══════════════════════════════════════════════════════════════\n');

    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get ALL avatars
    const allAvatars = await Avatar.find({}).lean();
    console.log(`📋 Total avatars in database: ${allAvatars.length}\n`);

    // Categorize
    const noImage = [];
    const hasPrompt = [];
    const noPrompt = [];
    const brokenUrl = [];
    const goodAvatars = [];

    for (const avatar of allAvatars) {
        const url = avatar.imageUrl;
        const prompt = avatar.generatedFromPrompt || avatar.promptUsed || '';
        
        if (!url || url.trim() === '' || url === 'undefined' || url === 'null') {
            noImage.push(avatar);
            if (prompt.trim()) hasPrompt.push(avatar);
            else noPrompt.push(avatar);
            continue;
        }

        // Check if URL is accessible (sample check — check all)
        const check = await checkUrl(url);
        if (!check.ok) {
            brokenUrl.push({ ...avatar, _urlReason: check.reason });
            if (prompt.trim()) hasPrompt.push(avatar);
            else noPrompt.push(avatar);
        } else {
            goodAvatars.push(avatar);
        }
    }

    console.log('── SUMMARY ──────────────────────────────────────────────────\n');
    console.log(`  ✅ Good (accessible image):   ${goodAvatars.length}`);
    console.log(`  ❌ No imageUrl at all:         ${noImage.length}`);
    console.log(`  🔗 Broken/inaccessible URL:    ${brokenUrl.length}`);
    console.log(`  📝 Have prompt (regenerable):   ${hasPrompt.length}`);
    console.log(`  🚫 No prompt (cannot regen):    ${noPrompt.length}`);
    console.log('');

    // List broken/missing avatars with details
    const problemAvatars = [...noImage, ...brokenUrl];
    if (problemAvatars.length > 0) {
        console.log('── PROBLEM AVATARS ──────────────────────────────────────────\n');
        for (const a of problemAvatars) {
            const prompt = a.generatedFromPrompt || a.promptUsed || '';
            const hasP = prompt.trim().length > 0;
            console.log(`  ID: ${a._id}`);
            console.log(`  Name: "${a.name}"`);
            console.log(`  Gender: ${a.gender}`);
            console.log(`  Source: ${a.source}`);
            console.log(`  CreatedByRole: ${a.createdByRole}`);
            console.log(`  IsPublished: ${a.isPublished}`);
            console.log(`  ImageUrl: "${(a.imageUrl || '').substring(0, 100)}"`);
            console.log(`  URL Issue: ${a._urlReason || 'empty/missing'}`);
            console.log(`  Has Prompt: ${hasP ? '✅ YES' : '❌ NO'}`);
            if (hasP) console.log(`  Prompt: "${prompt.substring(0, 120)}..."`);
            console.log('');
        }

        // Output JSON summary for the fix script
        const regenList = problemAvatars.filter(a => {
            const p = a.generatedFromPrompt || a.promptUsed || '';
            return p.trim().length > 0;
        });
        console.log(`\n── REGENERABLE: ${regenList.length} avatars with prompts ──\n`);
        for (const a of regenList) {
            console.log(`  → ${a.name} (${a._id})`);
        }

        const noRegenList = problemAvatars.filter(a => {
            const p = a.generatedFromPrompt || a.promptUsed || '';
            return p.trim().length === 0;
        });
        if (noRegenList.length > 0) {
            console.log(`\n── NOT REGENERABLE: ${noRegenList.length} avatars WITHOUT prompts ──\n`);
            for (const a of noRegenList) {
                console.log(`  → ${a.name} (${a._id}) — source: ${a.source}, url: "${(a.imageUrl || '').substring(0, 80)}"`);
            }
        }
    } else {
        console.log('🎉 All avatars have accessible images!');
    }

    await mongoose.disconnect();
    console.log('\n✅ Done!');
}

main().catch(err => {
    console.error('❌ Script failed:', err);
    process.exit(1);
});

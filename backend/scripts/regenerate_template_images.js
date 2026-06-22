/**
 * regenerate_template_images.js
 *
 * Regenerates preview images for ALL image-type templates using their stored
 * prompts.  Uploads the new images to the current S3 bucket and updates
 * the database with new URLs.
 *
 * Context: The previous AWS account was suspended, so all old S3 image URLs
 * are dead.  This script re-creates every image from the stored prompts.
 *
 * Usage:
 *   node --env-file=.env scripts/regenerate_template_images.js
 *   node --env-file=.env scripts/regenerate_template_images.js --dry-run
 *   node --env-file=.env scripts/regenerate_template_images.js --only-published
 *   node --env-file=.env scripts/regenerate_template_images.js --ids=id1,id2
 */

import mongoose from 'mongoose';
import Template from '../models/Template.js';
import { uploadToS3, ensureS3Url } from '../utils/s3.js';

// ── Config from env ──────────────────────────────────────────────────────────
const LAOZHANG_API_KEY  = process.env.LAOZHANG_API_KEY;
const LAOZHANG_BASE_URL = process.env.LAOZHANG_BASE_URL || 'https://api.laozhang.ai/v1';
const GEMINI_API_KEY    = process.env.GEMINI_API_KEY;
const DELAY_MS          = 5000;   // 5s between generations to avoid rate-limits

// ── CLI Flags ────────────────────────────────────────────────────────────────
const DRY_RUN        = process.argv.includes('--dry-run');
const ONLY_PUBLISHED = process.argv.includes('--only-published');
const IDS_FLAG       = process.argv.find(a => a.startsWith('--ids='));
const SPECIFIC_IDS   = IDS_FLAG ? IDS_FLAG.replace('--ids=', '').split(',').map(s => s.trim()) : [];

// ── Placeholder replacements for preview image generation ────────────────────
const PLACEHOLDER_MAP = {
    '{{PRODUCT_DESCRIPTION}}': 'a premium luxury product with elegant packaging',
    '{{HEADLINE}}':            'EXCLUSIVE OFFER',
    '{{BRAND}}':               'BRAND',
    '{{OFFER}}':               '50% OFF',
    '{{CTA}}':                 'SHOP NOW',
    '{{SUBTEXT}}':             'Limited time only',
    // Also handle lowercase / mixed variants
    '{{product_description}}': 'a premium luxury product with elegant packaging',
    '{{headline}}':            'EXCLUSIVE OFFER',
    '{{brand}}':               'BRAND',
    '{{offer}}':               '50% OFF',
    '{{cta}}':                 'SHOP NOW',
};

// ── Aspect ratio → OpenAI size mapping ───────────────────────────────────────
function aspectRatioToSize(ar) {
    const map = {
        '1:1':  '1024x1024',
        '4:5':  '1024x1024',
        '9:16': '1024x1792',
        '3:4':  '1024x1792',
        '2:3':  '1024x1792',
        '16:9': '1792x1024',
        '3:2':  '1792x1024',
        '4:3':  '1792x1024',
    };
    return map[ar] || '1024x1024';
}

// ══════════════════════════════════════════════════════════════════════════════
//  IMAGE GENERATION — Direct LaoZhang API call (gpt-image-2)
// ══════════════════════════════════════════════════════════════════════════════
async function generateImageViaLaoZhang(prompt, aspectRatio = '1:1') {
    if (!LAOZHANG_API_KEY) throw new Error('LAOZHANG_API_KEY not configured');

    const size = aspectRatioToSize(aspectRatio);

    // Truncate prompt to 3500 chars (LaoZhang / OpenAI limit)
    let finalPrompt = prompt;
    if (finalPrompt.length > 3500) {
        finalPrompt = finalPrompt.substring(0, 3450) + '\n\n[...condensed for compatibility]';
    }

    console.log(`    🎨 Calling gpt-image-2 via LaoZhang (size: ${size}, prompt: ${finalPrompt.length} chars)...`);

    const resp = await fetch(`${LAOZHANG_BASE_URL}/images/generations`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${LAOZHANG_API_KEY}`,
        },
        body: JSON.stringify({
            model: 'gpt-image-2',
            prompt: finalPrompt,
            n: 1,
            size,
            output_format: 'webp',
            background: 'opaque',
            output_compression: 85,
        }),
        signal: AbortSignal.timeout(180_000), // 3 min timeout
    });

    if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`LaoZhang API error (${resp.status}): ${errText.substring(0, 300)}`);
    }

    const data = await resp.json();
    const imageData = data.data?.[0];
    if (!imageData) throw new Error('LaoZhang API returned no image data');

    // Handle b64_json or url
    if (imageData.b64_json) {
        let b64 = imageData.b64_json;
        // LaoZhang sometimes returns a full data URI
        if (b64.startsWith('data:')) {
            const commaIdx = b64.indexOf(',');
            if (commaIdx > -1) b64 = b64.substring(commaIdx + 1);
        }
        return `data:image/webp;base64,${b64}`;
    } else if (imageData.url) {
        return imageData.url;
    }

    throw new Error('No image in LaoZhang response');
}

// ══════════════════════════════════════════════════════════════════════════════
//  PROMPT ENHANCEMENT — Uses Gemini to expand short/stub prompts
// ══════════════════════════════════════════════════════════════════════════════
async function enhanceWeakPrompt(shortPrompt, templateName) {
    if (!GEMINI_API_KEY) {
        console.log(`    ⚠️  No GEMINI_API_KEY — skipping enhancement, using original prompt`);
        return shortPrompt;
    }

    const enhancementPrompt = `You are a world-class creative director. I have a very short image generation prompt that needs to be expanded into a detailed, vivid 10-15 line image generation prompt.

TEMPLATE NAME: "${templateName}"
ORIGINAL SHORT PROMPT: "${shortPrompt}"

Write a detailed image generation prompt that:
1. Starts with "Create a premium marketing creative image"
2. Describes the background in detail (gradients, colors, textures, lighting)
3. Describes the layout and spatial composition
4. Describes typography style (bold, size, color, position)
5. Uses {{PRODUCT_DESCRIPTION}} as placeholder for the product
6. Uses {{HEADLINE}} as placeholder for headline text
7. Uses {{BRAND}} as placeholder for brand name
8. Describes the mood and atmosphere
9. Ends with a mood statement

Return ONLY the prompt text, no JSON, no markdown, no explanation.`;

    try {
        const models = ['gemini-2.5-flash', 'gemini-2.0-flash-001'];
        for (const modelId of models) {
            try {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${GEMINI_API_KEY}`;
                const resp = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ role: 'user', parts: [{ text: enhancementPrompt }] }],
                        generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
                    }),
                    signal: AbortSignal.timeout(30_000),
                });
                const data = await resp.json();
                if (data.error) continue;
                const text = data.candidates?.[0]?.content?.parts
                    ?.filter(p => p.text && !p.thought)
                    ?.map(p => p.text)
                    ?.join('') || '';
                if (text.length > 200) {
                    console.log(`    ✨ Prompt enhanced via ${modelId}: ${shortPrompt.length} → ${text.length} chars`);
                    return text.trim();
                }
            } catch (e) {
                console.warn(`    ⚠️  ${modelId} failed: ${e.message}`);
            }
        }
    } catch (e) {
        console.warn(`    ⚠️  Enhancement failed: ${e.message}`);
    }

    return shortPrompt; // fallback to original
}

// ══════════════════════════════════════════════════════════════════════════════
//  PROMPT SELECTION + PLACEHOLDER REPLACEMENT
// ══════════════════════════════════════════════════════════════════════════════
function selectBestPrompt(template) {
    // Priority: dna.promptFormula → promptTemplate → savedPrompt
    const dnaFormula  = template.dna?.promptFormula || '';
    const pt          = template.promptTemplate || '';
    const sp          = template.savedPrompt || '';

    // Pick the longest non-stub prompt
    const candidates = [
        { source: 'dna.promptFormula', text: dnaFormula },
        { source: 'promptTemplate',    text: pt },
        { source: 'savedPrompt',       text: sp },
    ].filter(c => c.text.length > 0);

    if (candidates.length === 0) return { source: 'none', text: '' };

    // Avoid known stub phrases
    const STUB_PHRASES = [
        'Create a professional marketing image featuring {{PRODUCT_DESCRIPTION}}',
        'Create a professional marketing image for {{BRAND}} featuring {{PRODUCT_DESCRIPTION}}',
    ];

    // Prefer the longest non-stub candidate
    const nonStubs = candidates.filter(c => !STUB_PHRASES.some(stub => c.text.trim().startsWith(stub) && c.text.length < 200));
    const pool = nonStubs.length > 0 ? nonStubs : candidates;

    // Sort by length descending
    pool.sort((a, b) => b.text.length - a.text.length);
    return pool[0];
}

function replacePlaceholders(text) {
    let result = text;
    for (const [placeholder, replacement] of Object.entries(PLACEHOLDER_MAP)) {
        result = result.replaceAll(placeholder, replacement);
    }
    // Also handle generic {{ANYTHING}} patterns we might have missed
    result = result.replace(/\{\{[A-Z_]+\}\}/g, (match) => {
        const key = match.replace(/[{}]/g, '').toLowerCase().replace(/_/g, ' ');
        return key;
    });
    return result;
}

// ══════════════════════════════════════════════════════════════════════════════
//  SLEEP HELPER
// ══════════════════════════════════════════════════════════════════════════════
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN
// ══════════════════════════════════════════════════════════════════════════════
async function main() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  TEMPLATE IMAGE REGENERATION');
    console.log('═══════════════════════════════════════════════════════════════');
    if (DRY_RUN) console.log('  🏜️  DRY RUN MODE — no images will be generated\n');
    if (ONLY_PUBLISHED) console.log('  📢 Only regenerating published & active templates\n');
    if (SPECIFIC_IDS.length > 0) console.log(`  🎯 Targeting specific IDs: ${SPECIFIC_IDS.join(', ')}\n`);

    // ── Validate keys ────────────────────────────────────────────────────────
    if (!DRY_RUN && !LAOZHANG_API_KEY) {
        console.error('❌ LAOZHANG_API_KEY is required for image generation. Aborting.');
        process.exit(1);
    }

    // ── Connect to DB ────────────────────────────────────────────────────────
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // ── Build filter ─────────────────────────────────────────────────────────
    const filter = { previewType: 'image' };
    if (ONLY_PUBLISHED) {
        filter.isActive = true;
        filter.isPublished = true;
    }
    if (SPECIFIC_IDS.length > 0) {
        filter._id = { $in: SPECIFIC_IDS };
    }

    const templates = await Template.find(filter).lean();
    console.log(`📋 Found ${templates.length} image templates to regenerate\n`);

    if (templates.length === 0) {
        console.log('Nothing to do!');
        await mongoose.disconnect();
        return;
    }

    // ── Process each template ────────────────────────────────────────────────
    const results = { success: [], failed: [], skipped: [], enhanced: [] };

    for (let i = 0; i < templates.length; i++) {
        const t = templates[i];
        const progress = `[${i + 1}/${templates.length}]`;
        console.log(`\n${progress} ─── ${t.name} (${t._id}) ───`);
        console.log(`  Origin: ${t.studioOrigin} | Section: ${t.studioSection} | Published: ${t.isPublished} | Active: ${t.isActive}`);

        try {
            // 1. Select best prompt
            const selected = selectBestPrompt(t);
            if (!selected.text || selected.text.length === 0) {
                console.log(`  ⏭️  SKIP — No prompt available at all`);
                results.skipped.push({ _id: t._id, name: t.name, reason: 'No prompt' });
                continue;
            }

            console.log(`  📝 Using ${selected.source} (${selected.text.length} chars)`);

            // 2. Enhance weak prompts (< 100 chars)
            let promptToUse = selected.text;
            if (promptToUse.length < 100) {
                console.log(`  ⚡ Prompt too short (${promptToUse.length} chars) — enhancing...`);
                if (!DRY_RUN) {
                    promptToUse = await enhanceWeakPrompt(promptToUse, t.name);
                    results.enhanced.push({ _id: t._id, name: t.name, before: selected.text.length, after: promptToUse.length });
                    
                    // Save enhanced prompt to promptTemplate for future use
                    await Template.updateOne({ _id: t._id }, { promptTemplate: promptToUse });
                    console.log(`  💾 Enhanced prompt saved to promptTemplate`);
                }
            }

            // 3. Replace placeholders with generic preview text
            const previewPrompt = replacePlaceholders(promptToUse);
            console.log(`  📝 Preview prompt (first 150 chars): "${previewPrompt.substring(0, 150)}..."`);

            // 4. Determine aspect ratio
            const aspectRatio = t.defaultSettings?.aspectRatio
                || t.generationParams?.aspectRatio
                || '1:1';
            console.log(`  📐 Aspect ratio: ${aspectRatio}`);

            if (DRY_RUN) {
                console.log(`  🏜️  DRY RUN — would generate image here`);
                results.success.push({ _id: t._id, name: t.name, dryRun: true });
                continue;
            }

            // 5. Generate image
            const imageResult = await generateImageViaLaoZhang(previewPrompt, aspectRatio);
            console.log(`  ✅ Image generated successfully`);

            // 6. Upload to S3
            const s3Key = `templates/regen-${t._id}-${Date.now()}.webp`;
            const s3Url = await ensureS3Url(imageResult, s3Key);
            console.log(`  📤 Uploaded to S3: ${s3Url.substring(0, 80)}...`);

            // 7. Update database
            const updateFields = {
                previewUrl: s3Url,
                previewImageUrl: s3Url,
            };

            // Also set systemReferenceImage for templates that use the inpainting path
            if (t.studioOrigin === 'creative') {
                updateFields.systemReferenceImage = s3Url;
            }

            // If promptTemplate was empty, populate it from savedPrompt
            if (!t.promptTemplate && t.savedPrompt) {
                updateFields.promptTemplate = t.savedPrompt;
            }

            await Template.updateOne({ _id: t._id }, updateFields);
            console.log(`  💾 Database updated with new URLs`);

            results.success.push({ _id: t._id, name: t.name, s3Url });

            // 8. Delay between generations
            if (i < templates.length - 1) {
                console.log(`  ⏳ Waiting ${DELAY_MS / 1000}s before next generation...`);
                await sleep(DELAY_MS);
            }

        } catch (err) {
            console.error(`  ❌ FAILED: ${err.message}`);
            results.failed.push({ _id: t._id, name: t.name, error: err.message });

            // If rate limited, wait longer
            if (err.message.includes('429') || err.message.includes('rate limit') || err.message.includes('BUSY')) {
                console.log(`  ⏳ Rate limited — waiting 30s before retry...`);
                await sleep(30_000);

                // Retry once
                try {
                    console.log(`  🔄 Retrying ${t.name}...`);
                    const selected = selectBestPrompt(t);
                    const previewPrompt = replacePlaceholders(selected.text);
                    const aspectRatio = t.defaultSettings?.aspectRatio || '1:1';

                    const imageResult = await generateImageViaLaoZhang(previewPrompt, aspectRatio);
                    const s3Key = `templates/regen-${t._id}-${Date.now()}.webp`;
                    const s3Url = await ensureS3Url(imageResult, s3Key);

                    const updateFields = {
                        previewUrl: s3Url,
                        previewImageUrl: s3Url,
                    };
                    if (t.studioOrigin === 'creative') updateFields.systemReferenceImage = s3Url;
                    if (!t.promptTemplate && t.savedPrompt) updateFields.promptTemplate = t.savedPrompt;

                    await Template.updateOne({ _id: t._id }, updateFields);
                    console.log(`  ✅ Retry succeeded!`);

                    // Move from failed to success
                    results.failed.pop();
                    results.success.push({ _id: t._id, name: t.name, s3Url, retried: true });
                } catch (retryErr) {
                    console.error(`  ❌ Retry also failed: ${retryErr.message}`);
                }
            }

            // Continue to next template regardless
            if (i < templates.length - 1) await sleep(DELAY_MS);
        }
    }

    // ── Summary ──────────────────────────────────────────────────────────────
    console.log('\n\n═══════════════════════════════════════════════════════════════');
    console.log('  REGENERATION SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════\n');

    console.log(`  ✅ Succeeded: ${results.success.length}`);
    console.log(`  ❌ Failed:    ${results.failed.length}`);
    console.log(`  ⏭️  Skipped:   ${results.skipped.length}`);
    console.log(`  ✨ Enhanced:  ${results.enhanced.length}`);
    console.log(`  ─── Total:    ${templates.length}\n`);

    if (results.success.length > 0) {
        console.log('  ── Successful regenerations ──');
        for (const s of results.success) {
            console.log(`    ✅ ${s.name} (${s._id})${s.retried ? ' [retried]' : ''}${s.dryRun ? ' [dry-run]' : ''}`);
        }
    }

    if (results.failed.length > 0) {
        console.log('\n  ── Failed regenerations ──');
        for (const f of results.failed) {
            console.log(`    ❌ ${f.name} (${f._id}): ${f.error.substring(0, 100)}`);
        }
    }

    if (results.skipped.length > 0) {
        console.log('\n  ── Skipped templates ──');
        for (const s of results.skipped) {
            console.log(`    ⏭️  ${s.name} (${s._id}): ${s.reason}`);
        }
    }

    if (results.enhanced.length > 0) {
        console.log('\n  ── Enhanced prompts ──');
        for (const e of results.enhanced) {
            console.log(`    ✨ ${e.name}: ${e.before} → ${e.after} chars`);
        }
    }

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
    console.log('Done!');
}

main().catch(err => {
    console.error('❌ Script failed:', err);
    process.exit(1);
});

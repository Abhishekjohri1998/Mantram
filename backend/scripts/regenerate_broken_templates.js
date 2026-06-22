/**
 * regenerate_broken_templates.js
 * ──────────────────────────────
 * Generates preview images for the remaining templates with broken S3 URLs.
 * Uses the Google Developer API (Gemini) directly for image generation.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const DRY_RUN = process.argv.includes('--dry-run');
const MONGO_URI = process.env.MONGODB_URI;
const GEMINI_KEY = process.env.GEMINI_IMAGE_API_KEY || process.env.GEMINI_API_KEY;

if (!MONGO_URI) { console.error('❌ MONGODB_URI not set'); process.exit(1); }
if (!GEMINI_KEY) { console.error('❌ GEMINI_API_KEY not set'); process.exit(1); }

// ── S3 setup ──
const s3 = new S3Client({
    region: process.env.AWS_REGION || 'ap-south-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});
const BUCKET = process.env.AWS_S3_BUCKET || 'mantram-ai-generated-media';

async function uploadToS3(imageBuffer, key) {
    await s3.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: imageBuffer,
        ContentType: 'image/png',
    }));
    return `https://s3.ap-south-1.amazonaws.com/${BUCKET}/${key}`;
}

// ── Gemini image generation via Developer API (same path as vertexImage.js fallback) ──
async function generateImage(prompt) {
    // Use gemini-2.5-flash-image — the model that works via Developer API key
    const model = 'gemini-2.5-flash-image';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;
    
    const body = {
        contents: [{ 
            role: 'user', 
            parts: [{ text: `Generate a high-quality, photorealistic, cinematic still image based on this description:\n\n${prompt}` }]
        }],
        generationConfig: {
            temperature: 0.8,
            responseModalities: ['TEXT', 'IMAGE'],
        },
    };

    const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
    });

    if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        throw new Error(`Gemini API ${model} error (${resp.status}): ${errText.substring(0, 300)}`);
    }

    const data = await resp.json();
    if (data.error) {
        throw new Error(`Gemini API error: ${data.error.message || JSON.stringify(data.error)}`);
    }

    // Extract image from response
    for (const part of data.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData?.mimeType?.startsWith('image/')) {
            return Buffer.from(part.inlineData.data, 'base64');
        }
    }
    return null;
}

async function main() {
    console.log(`🔧 Regenerate Broken Template Previews${DRY_RUN ? ' (DRY RUN)' : ''}`);
    console.log('═══════════════════════════════════════════════════\n');

    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const Template = mongoose.model('Template', new mongoose.Schema({}, { strict: false, collection: 'templates' }));

    // Find templates with broken S3 preview URLs
    const broken = await Template.find({
        $or: [
            { previewUrl: { $regex: /mantram-assets/ } },
            { previewImage: { $regex: /mantram-assets/ } },
        ]
    }).lean();

    console.log(`Found ${broken.length} templates with broken previews\n`);

    let fixed = 0, failed = 0;

    for (const template of broken) {
        const name = template.name || template.label || '(unnamed)';
        // Build the best prompt from available fields
        const prompt = template.savedPrompt || template.promptTemplate || template.imagePrompt || template.description || '';
        
        if (!prompt) {
            console.log(`⚠️ ${name} — No prompt available, skipping`);
            failed++;
            continue;
        }

        console.log(`\n🎨 Generating: ${name}`);
        console.log(`   Prompt: ${prompt.substring(0, 150)}...`);

        if (DRY_RUN) {
            console.log(`   [DRY RUN] Would generate image`);
            continue;
        }

        try {
            // Generate image
            const imageBuffer = await generateImage(prompt);
            if (!imageBuffer) {
                console.log(`   ❌ Gemini returned no image`);
                failed++;
                continue;
            }
            console.log(`   📸 Generated: ${Math.round(imageBuffer.length / 1024)}KB`);

            // Upload to S3
            const s3Key = `templates/regen-${template._id.toString().substring(0, 12)}-${Date.now()}.png`;
            const s3Url = await uploadToS3(imageBuffer, s3Key);
            console.log(`   ☁️ Uploaded: ${s3Url.substring(0, 90)}...`);

            // Update DB
            const updateFields = { previewUrl: s3Url };
            if (template.previewImage) updateFields.previewImage = s3Url;

            await Template.updateOne({ _id: template._id }, { $set: updateFields });
            console.log(`   ✅ DB updated`);
            fixed++;

            // Rate limit — wait between generations
            await new Promise(r => setTimeout(r, 3000));

        } catch (err) {
            console.log(`   ❌ Error: ${err.message.substring(0, 200)}`);
            failed++;
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    console.log('\n═══════════════════════════════════════════════════');
    console.log(`  Fixed: ${fixed} | Failed: ${failed} | Total: ${broken.length}`);
    console.log('═══════════════════════════════════════════════════');

    await mongoose.disconnect();
    console.log('\n✅ Done.');
}

main().catch(err => { console.error('❌ Fatal:', err); process.exit(1); });

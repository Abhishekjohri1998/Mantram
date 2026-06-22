import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const GEMINI_KEY = process.env.GEMINI_IMAGE_API_KEY || process.env.GEMINI_API_KEY;
const s3 = new S3Client({ region: 'ap-south-1', credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY }});
const BUCKET = process.env.AWS_S3_BUCKET || 'mantram-ai-generated-media';

await mongoose.connect(process.env.MONGODB_URI);
const Template = mongoose.model('T', new mongoose.Schema({}, { strict: false, collection: 'templates' }));

// Find remaining broken template
const broken = await Template.find({ previewUrl: { $regex: /mantram-assets/ } }).lean();
console.log(`Found ${broken.length} remaining broken template(s)\n`);

for (const t of broken) {
    const name = t.name || t.label || '(unnamed)';
    console.log(`🎨 Retrying: ${name}`);
    
    // Use a simplified prompt for better results
    const prompt = t.description || t.name || 'Football player scoring a goal';
    const fullPrompt = `Generate a high-quality photorealistic cinematic still image: ${prompt}. Cinematic lighting, UGC mobile phone style footage, dynamic and vibrant.`;
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GEMINI_KEY}`;
    const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
            generationConfig: { temperature: 0.9, responseModalities: ['TEXT', 'IMAGE'] },
        }),
        signal: AbortSignal.timeout(120000),
    });

    const data = await resp.json();
    let imgBuf = null;
    for (const part of data.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData?.mimeType?.startsWith('image/')) {
            imgBuf = Buffer.from(part.inlineData.data, 'base64');
        }
    }

    if (imgBuf) {
        const key = `templates/regen-${t._id.toString().substring(0, 12)}-${Date.now()}.png`;
        await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: imgBuf, ContentType: 'image/png' }));
        const s3Url = `https://s3.ap-south-1.amazonaws.com/${BUCKET}/${key}`;
        await Template.updateOne({ _id: t._id }, { $set: { previewUrl: s3Url } });
        console.log(`   ✅ Fixed: ${s3Url.substring(0, 90)}`);
    } else {
        console.log(`   ❌ Gemini returned no image`);
        console.log(`   Response:`, JSON.stringify(data).substring(0, 300));
    }
    
    await new Promise(r => setTimeout(r, 3000));
}

await mongoose.disconnect();
console.log('\n✅ Done.');
